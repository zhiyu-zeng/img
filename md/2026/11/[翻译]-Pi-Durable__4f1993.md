---
title: "[翻译] Pi Durable"
source: https://tsingshui.art/work/pi-durable/
source_host: tsingshui.art
clip_date: 2026-11-23T10:36:48+08:00
trace_id: fa193d31-68dd-4e0b-8394-c939521708c6
content_hash: 117ce459dce69f55670483b03494860758331168f43bdb646cf82f128585c2f7
status: synced
tags: []
series: null
feed_source: 清水·Android/内核逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42175244-d011-812a-b39b-ffc108245a76
ioc: null
---

> 原文： [Pi Durable](https://earendil.com/posts/pi-durable/) · Earendil · 2026-10-01 本文为中文翻译；代码、API 名称与链接保留原文写法。

今天，Earendil 和 Pi 社区一起 [发布了 Pi 1.0](https://tsingshui.art/posts/pi-1-0/) 。这代表了我们的一个判断：经过无数小时的加固、维护与持续开发，Pi 现在已经是一个足以在其之上构建东西的坚实基础。同时 Pi 也在继续演进。借着 Pi 1.0，我们发布了一个实验性的新包： **Pi Durable**。Pi Durable 是专门为长时间运行、持久化、可塑的 agent 而构建的，它可以在任何地方运行。我们希望你也加入进来，一起把它做成最好的持久化 harness（运行骨架）。

## 为什么需要 Pi Durable？

Pi 这个 coding agent 的设计前提是：跑在你自己的（远程）机器上、在终端里、由一个人驱动。如果进程死了，你看看到底发生了什么，然后告诉它继续。这就是 Pi 1.0 关注并擅长的场景，这一点不会改变。

但在 Earendil，我们想把这套技术带给所有人，以最适合他们需求的形式。为此，我们需要一个能随处运行、能从不同界面接入、支持无限长对话、能扛住灾难性的内部与外部故障、并且允许多人同时操控同一批 agent 的 harness。

Pi Durable 就是那个 harness。它并不替代 Pi coding agent。它是一个用来构建任何 agent 应用（包括 coding agent）的框架。它与 Pi coding agent 不仅共享代码（比如 pi-ai），也共享同样的原则：极简与可塑。

它还让我们可以在这个方向上探索各种设计，而不会干扰 Pi coding agent。我们在 Pi Durable 上构建 agent 应用所得到的经验，一旦被证明有价值，就会回流到 Pi coding agent 中。

## 什么是 harness？

每个人对 harness 都有自己的定义。我们 [之前写过这个话题](https://tsingshui.art/posts/what-is-a-harness/) ，但这里针对 Pi Durable 再重新介绍一下 harness 这个概念。

harness 就是 **存储**，加上 **并行运行一个或多个大模型对话所需的机制**。它提供模型要调用的工具，以及工具运行所在的执行环境。

一次\*\*对话（conversation）\*\*是你与一个 agent 之间的交互，被记录成一份 transcript（对话记录）。 **agent** 就是大模型加上它的各项设置（比如思考等级）以及它可以调用的工具。

工具通过\*\*执行环境（execution environment）\*\*完成工作，执行环境可以是你的笔记本、一台远程 VM，或者一个内存沙箱。一个 agent 拿到哪些工具、哪个执行环境，由每个对话各自决定。

harness 运行的一切——从调用模型到执行工具——都是一个 **任务（task）**。

和 Pi 里的一切一样，Pi Durable 的设计目标之一就是 **你的 agent 能读懂它**。除去测试，全部源码约 15,000 行，按 GPT 算约 150,000 token，按 Claude 算约 250,000 token。这是最坏情况。要在 Pi Durable 上做构建，你的 agent 很少需要读全部代码；光是存储后端就有 3,000 行，通常可以跳过。

下面带你快速浏览一遍 Pi Durable，说明我们构建了什么，以及为什么这样构建。

## 长时间运行，随处可跑

我们希望 agent 能长期运行，并且能在任何地方运行——在当下，“任何地方"指的是任何有 JavaScript 运行时的环境。

在 Pi Durable 中，harness 打开在一个\*\*存储后端（storage backend）\*\*之上。Pi Durable 自带 memory、SQLite 和 JSONL 三种存储，另外还提供了一套一致性测试套件和基准测试，方便你实现自己的后端。SQLite 和 JSONL 的存储代码不使用任何 Node API，因此配上一个很小的 adapter，它就能跑在 Bun 上，或者跑在 Cloudflare Durable Object 里。存储接口很小，很容易在你自己已有的东西上实现，比如键值存储或 Postgres。同一时刻由一个进程独占一个存储，其他客户端挂载到该进程上。

在 SQLite 上，harness 只在内存中保留工作集：活跃的 transcript、运行中的任务、待处理的提交。其他一切都留在磁盘上，用到时才加载。活跃 transcript 的大小天然受模型上下文窗口限制，因为 compaction（压缩）会在消息溢出之前把较旧的消息总结掉。所以哪怕是一段有数万条消息的对话，也能轻松放进内存。

需要文件或 shell 的工具从执行环境获取它们。Pi Durable 自带一个 Node 执行环境，让工具可以访问你本地的文件。和存储一样，执行环境接口也很小、易于实现，因此你也可以把远程执行环境暴露给工具。这就允许 harness 跑在一台机器上，而它的工具跑在另一台机器上。你的 `env` 函数会为每一次工具调用构建执行环境，其输入是对话的工作目录，因此每个对话都可以跑在不同的地方。

```typescript
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import {
    openNodeSqliteStorage,
} from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";

const context = BACKGROUND_CONTEXT; // 每次调用都要传 context，用于取消
const models = createModels();
models.setProvider(openaiProvider());

const registry = createRegistry();
registry.install(CodingTools); // read, write, edit, bash

const env = ({ cwd }: { cwd?: string }) =>
    new NodeExecutionEnv({ cwd: cwd ?? process.cwd() });
const harness = await Harness.open(
    await openNodeSqliteStorage("./agent.sqlite"),
    { models, registry, env },
    context,
);
// 根对话：首次使用时创建，之后每次重启拿到的都是同一个。
const root = await harness.root(context, {
    agent: {
        model: { provider: "openai", modelId: "gpt-6.1-sol" },
        cwd: "/work/repo",
    },
});
```

## 扛得住崩溃

我们希望 agent 能在它所在进程死掉之后存活下来——不管是笔记本休眠、容器被重新部署，还是机器内存耗尽——并从断点处继续。

在 Pi Durable 中，一次运行的每一步都是一个任务，任务在继续往下走之前会先存下一个检查点（checkpoint）。如果进程死了，新进程打开同一个存储，找到未完成的任务，让每个任务从它最后的检查点继续。一个被中断的模型请求会被重新发送；已经生成的部分答案留在 transcript 里，标记为已中止（aborted）。一个被中断的工具调用，如果重跑是安全的就重跑；否则就告诉模型它被中断了。Pi Durable 没有内置 subagent，但写几行代码就能做出来，下面这个 triage 工具就是例子。subagent 跑在自己的对话里，所以它同样能从断点继续；而一个可安全重跑的 subagent 工具会重新找到它的 subagent 并等待答案。排队中的消息仍然在排队。 `requestId` 让一次提交具备 exactly-once 语义，因此崩溃后重试的客户端会拿回原本那次提交的结果，而不是重复提交。

```typescript
const job = {
    type: "input",
    content: "Fix the flaky login test",
    requestId: "job-42",
} as const;
await root.submit(job, context);
// 进程在这里死掉，死在一个工具调用的中途。

// 一个新进程打开同一个存储。
const harness = await Harness.open(
    await openNodeSqliteStorage("./agent.sqlite"),
    { models, registry, env },
    context,
);
harness.resume(); // 继续被中断的那次运行
const root = await harness.root(context);
// 同一次提交，得到答案
const settled = await (await root.submit(job, context)).wait(context);
```

## 同时跑很多对话

我们希望一个 harness 能同时跑很多对话，彼此之间不会互相阻塞。

在 Pi Durable 中，一个 harness 可以并发运行任意多个对话，且都享有同样的保证。一个对话可以从零开始，也可以在它 transcript 的任意位置 fork 出另一个对话，后者能看到父对话到该点为止的历史，而无需复制这些历史。

想象一个 Slack 频道，你的 agent 在里面回复任何人的 @。然后有人开了一个 thread。这个频道可以是一个对话，而 thread 则是在它所回复的那条消息处的 fork。两者同时运行，互不阻塞。

```typescript
const channel = await harness.root(context);
const question = await channel.submit(
    { type: "input", content: "@agent why did the deploy fail?" },
    context,
);
const answered = await question.wait(context);

// 有人在 thread 里回复了 agent 的答案。每个对话都会声明它的 owner，
// 这决定了 abort 会波及到什么（后面在“任务”一节会详谈）。
// 这个 thread 没有 owner。
const thread = await channel.fork(
    answered.answer!,
    { ownership: { kind: "ownerless" } },
    context,
);

// 两个对话同时工作。
const inThread = await thread.submit(
    { type: "input", content: "@agent can we roll it back?" },
    context,
);
const inChannel = await channel.submit(
    { type: "input", content: "@agent who is on call today?" },
    context,
);
await Promise.all([inThread.wait(context), inChannel.wait(context)]);
```

每个对话还各自保存着自己的 agent：模型、思考等级、选中的扩展以及其中哪些工具处于启用状态、额外指令，还有它执行环境中的工作目录。主 agent 旁边的 reviewer 可以用更便宜的模型、只读的工具，以及它自己的代码检出。

## 扩展（Extensions）

我们希望 agent 能做的一切都是可插拔的，而且每个插进来的部分都参与持久化。

在 Pi Durable 中，一个\*\*扩展（extension）\*\*是一个具名打包，里面包含 system prompt 的若干段落（section）、工具、hook 和任务。应用把扩展安装进一个 registry。每个对话选择它要用的扩展和工具，并且只存它们的名字。

### System prompt 段落

system prompt 在每次请求之前根据该对话所挂扩展的段落重新构建，因此某个段落被改动后，下一个请求就会用上新的内容。Pi Durable 会把变更记录进 transcript，并标在发生变更的位置上，这样重启或 fork 之后看到的内容和当初模型看到的一模一样。对于支持在对话中途修改 system prompt 和工具的模型，只发送变更部分，因此 prompt cache 依然有效。

```typescript
import { defineExtension, section } from "@earendil-works/pi-durable";

const ProjectContext = defineExtension({
    name: "project-context",
    sections: [
        // 从该对话的执行环境读取。文件可以在后台加载并监听；
        // 每次请求渲染的都是最新状态。
        section("agents_md", (input) => agentsMd.latest(input.env)),
        section("skills", (input) => skills.latest(input.env)),
    ],
});
```

### 工具

每次工具调用都作为它自己的持久化任务运行，并且它的意图会在运行之前先被存下来。崩溃之后，只有工具声明重跑是安全的时候才会重跑；否则就告诉模型这次调用被中断了，并附上目前已产出的输出，由模型决定怎么办。每个对话还可以拥有自己的一套工具，比如前面的那个 Slack thread，它可以搜索但不能部署。

```typescript
import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-durable";

const searchIssues = defineTool({
    name: "search_issues",
    description: "Search the issue tracker",
    parameters: Type.Object({ query: Type.String() }),
    replay: "safe", // 只读，所以崩溃后重跑没问题
    execute: async (args, api) => {
        // 会流式推送给所有正在观看的客户端
        api.output(`searching for ${args.query}\n`);
        return {
            content: [{ type: "text", text: await tracker.search(args.query) }],
        };
    },
});

const deploy = defineTool({
    name: "deploy",
    description: "Deploy a version to production",
    parameters: Type.Object({ version: Type.String() }),
    // 没有 replay：因崩溃而中断的部署只上报给模型，绝不重复执行。
    execute: async (args) => ({
        content: [{ type: "text", text: await ci.deploy(args.version) }],
    }),
});

registry.install(defineExtension({ name: "ops", tools: [searchIssues, deploy] }));

// thread 可以搜索，但不能部署。
await thread.configure({ tools: { remove: [deploy] } }, context);
```

一次工具调用会拿到属于它这次调用的 harness API：它可以提交条目（entry）和文档、启动任务和对话、并与其他对话通信。这让 subagent 只需要几行代码。一个工具创建一个自己拥有的对话，给它更小的模型和自己的指令，然后等它回答。subagent 就是一个普通的对话，因此它同样能从崩溃中存活、自己计费，UI 也可以把它显示在这次调用下面。

```typescript
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { AssistantEntry, configure } from "@earendil-works/pi-durable";

const triage = defineTool({
    name: "triage",
    description: "Label an incoming issue as bug, feature, or question",
    parameters: Type.Object({ issue: Type.String() }),
    // 崩溃后重跑会找到同一个 subagent 和同一次提交
    replay: "safe",
    execute: async (args, api, context) => {
        const child = await api.commit(async (tx) => {
            const existing = (
                await tx.scanConversations({ ownerTaskId: api.taskId }, 1)
            ).items[0];
            if (existing !== undefined) return existing.id;
            // 由本次调用拥有，因此 abort 这次调用就会 abort 这个 subagent。
            const created = await tx.createConversation({
                ownership: { kind: "task", taskId: api.taskId },
            });
            // 它最初是本对话 agent 的一份拷贝。把它改成无工具的小模型。
            await configure(tx, created.id, {
                model: { provider: "openai", modelId: "gpt-6-luna" },
                tools: [],
                instructions: "Answer with one word: bug, feature, or question.",
            });
            return created.id;
        }, context);
        // 让 UI 把这个 subagent 显示在这次调用下面
        await api.details({ conversationId: child }, context);
        const subagent = await api.conversation(child, context);
        const request = {
            type: "input",
            content: args.issue,
            requestId: `triage:${api.taskId}`,
        } as const;
        const settled = await (
            await subagent!.submit(request, context)
        ).wait(context);
        // 答案作为一条 entry 存在 subagent 的 transcript 里。读出来并取它的文本。
        const entry = await api.commit(
            (tx) => tx.entry(AssistantEntry, settled.answer!),
            context,
        );
        const message = entry?.model?.[0] as AssistantMessage;
        const text = message.content
            .flatMap((content) => (content.type === "text" ? [content.text] : []))
            .join("");
        return { content: [{ type: "text", text }] };
    },
});
```

扩展还可以改变其他扩展的工具。在后面的扩展中定义的同名工具会替换掉前面的那个，比如一个跑在 Python virtualenv 里的 bash。而 wrap 会装饰那个最终胜出的工具——无论包装它的扩展在哪个位置被选中。

```typescript
import { wrapTool } from "@earendil-works/pi-durable";
import { createBashTool } from "@earendil-works/pi-durable/tools";

// 给每一次 bash 调用计时，无论这个对话最终用的是哪个 bash。
const Timing = defineExtension({
    name: "timing",
    wraps: [
        wrapTool(createBashTool(), (bash) => ({
            ...bash,
            execute: async (args, api, context) => {
                const start = Date.now();
                try {
                    return await bash.execute(args, api, context);
                } finally {
                    metrics.record("bash", Date.now() - start);
                }
            },
        })),
    ],
});
```

### Hook

Hook 让扩展可以介入任务，包括内置的那几类任务：生成模型回复、调用工具、执行 compaction。它们可以在请求发给模型之前改写请求，可以阻断或改写工具调用，可以替换结果，可以让一次运行继续下去，也可以自己写一份总结。hook 在崩溃后可能被重跑，所以做决策的 hook 会把决策存进 memo：一个跟任务存在一起的小值，先写入者胜出。

```typescript
import { hook, ToolTask } from "@earendil-works/pi-durable";

const Approval = defineExtension({
    name: "approval",
    hooks: [
        hook(ToolTask, {
            beforeTool: async (call, api, context) => {
                if (call.name !== "deploy") return undefined;
                // 重启之后，hook 会读到已存的答案，而不是再问一次。
                let approved = await api.memo<boolean>(
                    "approval:deploy",
                    context,
                );
                approved ??= await api.memo(
                    "approval:deploy",
                    await askInSlack(call),
                    context,
                );
                return approved
                    ? undefined
                    : { block: "Nobody approved the deploy." };
            },
        }),
    ],
});
```

多个扩展可以 hook 同一个东西。它们的 hook 组成一条链，按对话选择扩展的顺序执行，而每个 hook 定义了它自己那条链怎么跑。 `beforeTool` 把改写后的参数沿链往下传，第一个 block 会终止整条链。 `afterTool` 把结果沿链往下传。 `onYield` 在第一个让运行继续下去的 hook 处停止。而像 `afterResponse` 这类观察者永远会全部执行。抛异常的 hook 会被上报，链继续执行——例外是 `beforeTool` ，在那里抛异常会阻断这次调用。

### 任务

harness 用内置任务来跑对话：每个模型请求一个任务、每次工具调用一个任务、每次 compaction 一个任务。扩展可以带自己的任务，并享有同样的机制：每一步之后的检查点、能扛住重启的定时器，以及等待其他任务。

一个结账流程要把账单分摊到几张卡上，它会同时向每张卡扣款。如果有一张卡被拒，其他的支付会被 abort 并自动退款：

```typescript
import { defineTask, type TaskId } from "@earendil-works/pi-durable";

const Payment = defineTask<{ card: string }, { phase: "charge" }, string>({
    name: "shop.payment",
    version: 1,
    initial: () => ({ phase: "charge" }),
    phases: {
        charge: async (task, runtime, context) => {
            // 这个 key 让扣款幂等：如果崩溃导致这个 phase 重跑，
            // 这张卡也只会被扣一次。
            const charge = await bank.charge(
                task.input.card,
                `payment-${task.id}`,
            );
            await runtime.commit(
                () => ({
                    status: "terminal",
                    outcome: charge.ok
                        ? { status: "completed", result: charge.receipt }
                        : { status: "failed", error: { message: charge.error } },
                }),
                context,
            );
        },
    },
    // 另一笔支付失败了，或者结账被取消：撤销这一笔。
    abort: async (task, runtime, context) => {
        await bank.refund(`payment-${task.id}`);
        await runtime.commit(
            () => ({ status: "terminal", outcome: { status: "aborted" } }),
            context,
        );
    },
});

type CheckoutState =
    | { phase: "pay" }
    | { phase: "decide"; payments: TaskId<string>[] };
const Checkout = defineTask<{ cards: string[] }, CheckoutState, string>({
    name: "shop.checkout",
    version: 1,
    initial: () => ({ phase: "pay" }),
    phases: {
        pay: async (task, runtime, context) => {
            await runtime.commit(async (tx) => {
                const payments: TaskId<string>[] = [];
                for (const card of task.input.cards) {
                    payments.push(
                        await tx.createTask(Payment, { card }, {
                            ownership: { kind: "task", taskId: task.id },
                        }),
                    );
                }
                // 在所有支付完成之前不执行任何代码。第一笔失败的支付
                // 会 abort 其他支付。
                return {
                    status: "waiting",
                    checkpoint: { phase: "decide", payments },
                    on: payments,
                    policy: "failFast",
                };
            }, context);
        },
        decide: async (task, runtime, context) => {
            const outcomes = await runtime.outcomes(
                task.state.checkpoint.payments,
                context,
            );
            const paid = outcomes.every(
                (outcome) => outcome.status === "completed",
            );
            await runtime.commit(
                () => ({
                    status: "terminal",
                    outcome: paid
                        ? { status: "completed", result: "Order placed." }
                        : {
                            status: "failed",
                            error: { message: "A payment failed." },
                        },
                }),
                context,
            );
        },
    },
    abort: (_task, runtime, context) =>
        runtime.commit(
            () => ({ status: "terminal", outcome: { status: "aborted" } }),
            context,
        ),
});

// agent 通过一个工具发起结账。
const checkout = defineTool({
    name: "checkout",
    description: "Pay for the cart, split across several cards",
    parameters: Type.Object({ cards: Type.Array(Type.String()) }),
    execute: async (args, api, context) => {
        // 由本次调用拥有：abort 这次调用会 abort 结账流程并退回它的支付。
        const owner = {
            ownership: { kind: "task", taskId: api.taskId },
        } as const;
        const id = await api.createTask(
            Checkout,
            { cards: args.cards },
            owner,
            context,
        );
        const { outcome } = (await api.waitForTask(id, context)).state;
        const text =
            outcome.status === "completed" ? outcome.result : outcome.status;
        return { content: [{ type: "text", text }] };
    },
});

registry.install(defineExtension({
    name: "shop",
    tools: [checkout],
    tasks: [Payment, Checkout],
}));
```

任务和对话构成一棵统一的 **所有权树（ownership tree）**。abort 一个任务会自底向上地 abort 它拥有的东西，因此每个任务都会先清理掉自己产生的副作用，而一个任务只有在它拥有的工作全部完成之后才算完成。subagent 也是同一个模式：一个对话由启动它的那次工具调用所拥有。

任务默认是\*\*前台（foreground）\*\*的：它们属于这个对话当前的工作。只有当它们全部完成，这个对话才算 idle；而 abort 这个对话（比如用户按下 Esc）会 abort 它们以及它们拥有的一切。\*\*后台（background）\*\*任务属于这个对话，但不属于它当前的工作。后台任务运行时，对话会进入 idle；对对话的普通 abort 不会碰它以及它拥有的东西。这很适合那种应该比启动它的那一轮活得更久的 subagent，或者一个明天才触发的提醒。当然，abort 这个任务本身，或者用 `{ background: true }` abort 这个对话，仍然会停掉它。

```typescript
// 属于当前工作：Esc 会 abort 它，对话会等它完成。
await api.createTask(
    Checkout,
    input,
    { ownership: { kind: "task", taskId: api.taskId } },
    context,
);

// 旁路工作：它运行时对话照常 idle，Esc 不会碰它。
await api.createTask(
    Reminder,
    input,
    { ownership: { kind: "conversation" }, background: true },
    context,
);
```

## Compaction（压缩）

我们希望长对话能一直进行下去，而不用让 agent 停下来做总结。

在 Pi Durable 中，compaction 就是一个普通任务，它在对话继续进行的同时运行。当上下文接近模型上限时，一个后台 compaction 会总结较旧的消息，而这份总结会被放在下一个轮次边界处。只有当下一个请求确实放不下时，对话才会等待总结。如果 provider 仍然以"太长"为由拒绝请求，harness 会做一次 compaction 然后重试一次。你也可以随时手动 compact，并带上你自己的指令。较旧的消息永远留在存储里。

```typescript
const harness = await Harness.open(storage, {
    models,
    registry,
    settings: {
        compaction: {
            // 当超过 contextWindow - reserveTokens 时，下一个请求会等待
            // 一份总结
            reserveTokens: 16384,
            // 再往前这么多 token，就开始在后台生成总结
            backgroundTokens: 32768,
        },
    },
}, context);

// 手动 compact，agent 正在工作时也可以。
await root.compact("Keep the names of the failing tests", context);
```

`reset()` 走得更远：它开启一个新的上下文，可选地基于一份交接说明（handoff note）；工具也可以通过返回 `control: { handoff }` 来请求同样的效果。因为什么都没被删除，另一个工具依然可以搜索交接之前的所有内容。做到这一步，你就得到了一个能向自己交接、并且之后还能翻查旧账的 agent。

```typescript
const handoff = defineTool({
    name: "handoff",
    description:
        "Start over from a handoff note. " +
        "Older messages stay searchable with search_history.",
    parameters: Type.Object({ note: Type.String() }),
    execute: async (args, api, context) => {
        // 排在 handoff 之后，所以它会在新上下文里开始下一次运行。
        const self = await api.conversation(api.conversationId, context);
        await self!.submit(
            {
                type: "input",
                content: "Continue.",
                requestId: `handoff:${api.taskId}`,
            },
            context,
        );
        // 结束本次运行，并从这份说明开始一个新上下文，等价于 reset(note)。
        return {
            content: [{ type: "text", text: "Handing off." }],
            control: { handoff: args.note },
        };
    },
});

const searchHistory = defineTool({
    name: "search_history",
    description: "Search older messages, including those before a handoff",
    parameters: Type.Object({ text: Type.String() }),
    replay: "safe",
    execute: async (args, api, context) => {
        // 工具同样通过事务读取记录。不写入任何内容的事务不落任何东西。
        const page = await api.commit(
            (tx) => tx.scanEntries({ conversationId: api.conversationId }, 200),
            context,
        );
        const hits = page.items.filter((entry) =>
            JSON.stringify(entry.model ?? []).includes(args.text),
        );
        const text = hits.map((entry) => JSON.stringify(entry.model)).join("\n");
        return { content: [{ type: "text", text }] };
    },
});
```

## 持久化的应用状态

我们希望构建在 agent 之上的应用状态，和对话本身一样持久。

在 Pi Durable 中，应用状态——比如一个 todo 列表、一份计划、一张工单，或者某个对话所运行的沙箱——存放在\*\*文档（document）\*\*里。文档是带类型的 JSON，与 transcript 放在一起，并在同一批原子提交中被修改，因此状态永远不会与产生它的 transcript 产生分歧。每个文档都声明 fork 时以什么作为起点：父对话在 fork 那个点的值、父对话当前的值，还是一个全新的值。

```typescript
import { defineDoc } from "@earendil-works/pi-durable";

const Todos = defineDoc<{ items: string[] }>({
    kind: "app.todos",
    version: 1,
    scope: "conversation",
    history: "rewindable",
    fork: "asOf", // fork 以父对话在 fork 点时的 todo 列表为起点
    initial: () => ({ items: [] }),
});

const Todo = defineExtension({
    name: "todo",
    tools: [
        defineTool({
            name: "todo",
            description: "Add an item to your todo list",
            parameters: Type.Object({ item: Type.String() }),
            execute: async (args, api, context) => {
                await api.commit(async (tx) => {
                    const todos = await tx.doc(Todos, api.conversationId);
                    todos.items.push(args.item);
                }, context);
                const text = `Added ${args.item}`;
                return { content: [{ type: "text", text }] };
            },
        }),
    ],
    // 模型在每次请求之前都会看到这个列表。
    sections: [
        section("todos", async (input, context) => {
            const todos = await input.read.snapshot(
                Todos,
                input.conversationId,
                context,
            );
            return todos?.items.join("\n") || undefined;
        }),
    ],
});

// UI 订阅已提交的值。
const todos = await harness.documentState(Todos, channel.id, context);
todos?.subscribe((value) => renderTodos(value?.items ?? []));
```

## 可塑（Malleable）

我们希望能在不停机的前提下改动一个正在运行的 agent 的代码。

在 Pi Durable 中，registry 可以在对话运行期间发生变化。用一个已经安装过的名字安装扩展，就会一步替换掉它。已经在运行中的工具调用会用它启动时的那份代码跑完；下一次调用才用新代码。对话只存扩展名和工具名，从不存代码，因此重启之后它们会采用新进程所安装的东西。

```typescript
// 扩展的文件在磁盘上变了。
// 同名的 "ops"：替换掉已安装的那个
registry.install(await loadExtension("./ops.ts"));
```

## 多人协作（Multiplayer）

我们希望许多人和许多客户端能同时与同一批对话协作：旁观它们、中途加入、并操控它们。

在 Pi Durable 中，UI 需要的一切都是已提交的状态，因此任意数量的客户端都可以挂到 harness 里的任意对话上。客户端首先拿到当前视图：transcript、正在流式生成的答案、运行中的工具及其输出、排队中的消息、agent 以及用量。之后它就只会收到变化的部分。迟到加入或重连的客户端从当前视图开始。任何客户端都可以操控正在运行的对话，或者排入一条后续消息。

```typescript
// 当 agent 正在工作时，第二个客户端加入了 thread。
const view = await thread.viewState(context);
render(view.value);
view.subscribe((value) => render(value));

// 并操控它。这条消息会在当前工具调用之后并入正在运行的工作。
await thread.submit(
    { type: "input", content: "Check the staging logs first", whenBusy: "steer" },
    context,
);
```

对于远程客户端， `thread.watch()` 会投递每一次 commit 的精确操作，体积小到可以直接走 socket 发送。如果你更偏好 coding agent 那套熟悉的事件， `watchEvents()` 会把这些 commit 转成那些事件，代价是链路上更多的字节。

## 试一试

你现在就可以试用 Pi Durable。Pi Durable 是实验性的，API 还可能变化。把你的 agent 指向一份 Pi 检出中的 `packages/durable` ，让它读一读 [README](https://github.com/earendil-works/pi/blob/main/packages/durable/README.md) 、三十多个 [示例](https://github.com/earendil-works/pi/tree/main/packages/durable/test/examples) 、这个 [基于 Pi Durable 的小型 coding agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/src/experimental/durable) ，或者这个漂亮的 [度假规划 agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/src/experimental/vacation) ，然后开始构建。

那个度假规划器大约 1,300 行 TypeScript，其中大部分是 TUI。如果它看起来像 coding agent，那只是因为它从 Pi coding agent 借用了 TUI 组件。

1.  一个带 TUI 的度假规划器，构建在 Pi Durable 之上。
2.  一个 subagent 并行跑三个搜索，每个搜索都是一个持久化任务。
3.  与此同时，主 agent 可以自由闲聊。
4.  进程死了。天气和博物馆已完成，火车还没有。
5.  重启。 `search` 的重跑是安全的：只有火车的搜索会重新跑。
6.  切到那个 subagent 并操控它。
7.  回到主对话：提问、compact、操控，全都在它工作的同时进行。
8.  报告作为一条消息送达；主 agent 把它变成一份计划。

从一份 Pi 检出运行这两个 demo：

```bash
npm install && npm run build
node packages/coding-agent/src/experimental/durable/main.ts
node packages/coding-agent/src/experimental/vacation/main.ts
```

要在你自己的项目里基于 Pi Durable 构建：

```bash
npm install @earendil-works/pi-durable @earendil-works/pi-ai @earendil-works/chord
```

接下来几周，我们会更多地聊 Pi Durable，并向你展示我们用它构建的那些帮助我们工作的小工具，比如一个 Slack bot 或一个 GitHub triage bot。现在还不便剧透。随着我们像用 Pi 一样用起 Pi Durable，还会有更多东西出来。

## FAQ

### 为什么又是 TypeScript？

因为这是最快的启动方式。但众所周知，把这些全部移植到 Rust 或汇编上是非常容易的。我们不排除将来这么做，但目前我们专注于 TypeScript。
