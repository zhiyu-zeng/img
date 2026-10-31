---
title: 【微信】SSRF的2026年真相：你的SSRF防护，校验的不是攻击者实际请求的东西
source: https://mp.weixin.qq.com/s/FKUQ_yczmR-6wgyzAYaq-Q
source_host: mp.weixin.qq.com
clip_date: 2026-11-01T03:10:06+08:00
trace_id: 6e623720-974b-4c11-a113-d4f55151cc27
content_hash: c2d75b780e82a208d232456c6ae2cc27a303137bee5e10dc363f51cd9672f2ea
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40a75244-d011-8167-a4d5-e4b0afaeda05
ioc:
  cves:
    - CVE-2026-108719
    - CVE-2026-15378
    - CVE-2026-33060
    - CVE-2026-33752
    - CVE-2026-53509
    - CVE-2026-55391
    - CVE-2026-61612
    - CVE-2026-64849
    - CVE-2026-7603
    - CVE-2026-83548
    - CVE-2026-83549
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**昆仑AI安全实验室** *2026年11月1日 00:00*

2026年8月，MLflow修复了一个未授权SSRF漏洞，CVE-2026-64849，CVSS 9.3。披露后数小时内就被在野利用，CISA将其列入KEV目录。

攻击链并不复杂：攻击者向MLflow的Webhook测试接口提交一个URL，指向自己控制的服务器。MLflow的 `_validate_webhook_url()` 解析域名，检查IP是否为公网，攻击者的域名解析到公网IP，验证通过。然后MLflow发送Webhook请求，攻击者的服务器返回302， `Location: http://169.254.169.254/latest/meta-data/` 。MLflow的 `delivery.py` 跟随重定向，重新解析了目标域名，但 **没有重新验证IP是否为公网**。请求到达云元数据端点，IAM角色凭证被窃取。

这个漏洞的根因，核心结论只有一句话： **URL验证和实际请求之间存在时间差，攻击者通过重定向在这个时间差中切换了目标地址**。校验的是“这个URL看起来要去哪里”，实际请求的是“这个URL最终去了哪里”。两者不是同一个东西。

**一、DNS重绑定：校验时是公网，连接时是内网**

重定向绕过的是“校验之后、请求之前”的窗口。DNS重绑定攻击的是同一个窗口，但手法更底层。

datamodel-code-generator的CVE-2026-55391是2026年最清晰的案例。代码的校验逻辑是：调用 `socket.getaddrinfo` 解析主机名，拿到IP，用 `ip.is_global` 判断是否公网。如果是，放行。然后调用 `httpx.get(current_url)` 发起请求。问题在于： **`httpx` 在发起连接时会独立进行第二次DNS解析**，两次解析之间没有IP绑定。

攻击者注册一个低TTL的域名。第一次解析（校验时）返回一个公网IP，通过检查。第二次解析（实际连接时）TTL已过期，返回 `127.0.0.1` 或 `169.254.169.254` 。 `httpx` 拿着这个内网地址发起了连接。校验看到的是公网，连接到达的是内网。

修复方案的精妙之处在于：它不再“校验完就放手”。 `_validate_url_for_fetch` 的返回值从布尔值改成了 `(pinned_host, pinned_ips)` 元组，把校验时解析出的IP集合 **钉死**，透传给一个自定义的 `httpx.BaseTransport` 。底层 `httpcore` 的 `connect_tcp` 在连接时，只能命中这个已校验的IP集合，不能再做独立的DNS解析。 **校验和连接绑定在同一个解析结果上，重绑定窗口被关闭。**

AVideo的漏洞把这个问题展示得更完整。 `isSSRFSafeURL()` 提供了一个 `$resolvedIP` 出参，本意就是让调用方把校验时解析的IP传给 `CURLOPT_RESOLVE` 做DNS pinning。但 **9个调用方里只有1个用了这个出参**，其余8个丢弃了它，把原始主机名传给 `file_get_contents()` ，让PHP独立做第二次解析。防护函数写得对，但防护的输出没有被传递到执行层。

**二、重定向：每一跳都要重新校验，而不是只校验第一跳**

MLflow和AVideo的 `file_get_contents()` 路径共享同一个根因： **校验了初始URL，但执行函数自动跟随重定向，重定向目标没有经过同样的校验**。

AVideo的代码库里其实有一个 **正确实现** 的 `url_get_contents()` ： `follow_location=0` 关闭自动重定向，然后手动循环，每一跳都提取 `Location` 头，每一跳都调用 `isSSRFSafeURL($redirectTarget)` 重新校验，最多5跳。但 `plugin/AI/receiveAsync.json.php` 和 `objects/EpgParser.php` 两个端点没有调用这个安全函数，直接用裸的 `file_get_contents()` ，重定向保护被绕过。

curl_cffi的CVE-2026-33752是同一个逻辑的Python版本。 `curl_cffi` 不限制内部IP范围， `libcurl` 的 `CURLOPT_FOLLOWLOCATION=1` 自动跟随重定向，Python层没有对重定向目标做任何校验。攻击者的URL返回302指向 `169.254.169.254` ， `libcurl` 跟过去，云元数据被读取。更隐蔽的是， `curl_cffi` 支持TLS指纹伪装（ `impersonate="chrome"` ），让请求看起来像正常的浏览器流量，在基于TLS指纹做出站过滤的环境里更难被识别。

**重定向绕过的核心教训**：SSRF防护不能只做“入口检查”。入口之后的每一个跳转，都是一个需要重新做决策的节点。如果执行层自动跟随跳转而不回调校验逻辑，入口检查就只是一张纸。

**三、字符串匹配：主机名通过，解析结果到达内网**

CKAN MCP Server的CVE-2026-61612是这个逻辑最赤裸的展示。漏洞是同一个SSRF防护的 **第三次绕过**。 `validateServerUrl` 先是为了CVE-2026-33060加的，后来为CVE-2026-53509扩展过。但它的核心逻辑始终是： **只校验主机名字符串，从不解析DNS**。

攻击者提交一个 `server_url` ，主机名看起来完全正常——比如 `metadata.example.com` 。这个主机名在字符串层面没有任何内网特征。但它 **在DNS上被配置为解析到 `169.254.169.254`**。字符串校验通过，服务器发起请求，请求到达IMDS。VulDB的分析把根因写得很直接：“依靠对主机标识符的文本分析，而不是将其解析为实际IP地址”。

这个漏洞比前两次绕过“严格更多”——前两次只能到达loopback，这一次到达了IMDS，拿到了云凭证。 **防御的演进方向和攻击的演进方向之间，存在一个结构性的时间差：防御方在补字符串匹配的规则，攻击方在换解析层的入口。**

**四、云元数据：IMDSv2让“直接读”变难了，但没有让SSRF失效**

AWS在2019年推出IMDSv2，要求访问元数据前先 `PUT` 一个token，目的是阻断简单的SSRF。2025年的测试显示，简单的 `curl http://169.254.169.254/` 在IMDSv2强制模式下确实会返回401。但这不意味着SSRF在云环境里失效了。

如果SSRF位于一个 **支持任意HTTP方法的上下文**——比如一个接受 `method` 参数的代理、一个可以发送 `PUT` 请求的Webhook测试功能——攻击者可以直接完成IMDSv2的token流程： `PUT /latest/api/token` 拿到token，然后 `GET` 元数据时带上 `X-aws-ec2-metadata-token` 头。SSRF防护如果只检查“目标IP是不是内网”，而不限制 **HTTP方法** 和 **请求头**，IMDSv2并不能阻断利用。

Cloudflare在2026年的分析中对此的表述是：IMDSv2是 **深度防御的一层**，不是SSRF的替代品。真正的防线是网络层的出站过滤——应用服务器不应该有能力向 `169.254.169.254` 发起任何请求，无论是什么方法、什么头。如果业务确实需要访问元数据（比如获取实例ID），应该通过一个 **受控的、有审计的本地代理**，而不是让应用直接打元数据端点。

**五、AI和工具链：SSRF的“新入口”不是Web端点，是Agent的工具调用**

2026年SSRF增长最快的攻击面，不在传统的Web应用里，在 **AI Agent和MCP工具链** 里。

LLMGateway的CVE-2026-108719是一个盲SSRF：API key持有者通过视频生成的 `callback_url` 扩展，可以让worker网络向 `loopback` 、私有地址或云元数据地址发送Webhook POST。漏洞在于 `deliverWebhook` POST执行时， **没有调用 `assertSafeWebhookTarget` 检查**——防护函数存在，但在一条代码路径上没有被触发。

`guardrails-detectors` 的CVE-2026-15378走的是另一条路：攻击者提交一个特制的XSD字符串，触发盲SSRF，访问云元数据、Kubernetes API、内部MinIO，以及本地文件读取——读取service account token和pod secrets。这个漏洞的关键词是“XSD字符串”—— **输入是一个数据格式的定义，不是一个URL**。传统的“检查参数名是不是url”的SSRF防护，对这种输入形态完全失效。

ToolHive的SSRF（GO-2026-6002）展示了容器环境里的横向能力：容器化的MCP服务器可以通过 `host.docker.internal` 到达宿主机服务，SSRF防护遗漏了IPv6 NAT64范围（ `64:ff9b::/96` 和 `64:ff9b:1::/48` ），攻击者可以借NAT64网关绕过防护访问元数据和内部服务。

Agent-Threat-Rule对这类攻击的定义很精确： **Agent对云凭证/元数据服务发起请求，是“没有合法理由”的行为**。一个编码Agent会频繁访问自己的dev server和本地Docker/k8s服务，那些不应该被硬阻断，但 **对元数据端点的访问应该被单独标记为高置信度攻击**，因为一个正常Agent没有任何理由需要读 `169.254.169.254` 。

**六、实战：从SRC到RCE的SSRF链**

SSRF在SRC里的价值，从来不在于“能读一个内网页面”，在于它能作为 **跳板** 串起更长的链。

**MLflow的链**：未认证SSRF → 302重定向绕过 → 云元数据 → IAM凭证 → 云存储数据窃取/云资源操作/横向移动。

**SonicWall SMA1000的链**：预认证SSRF（Work Place接口的proxy不验证目标URL） → 绕过认证边界访问内部功能 → 认证后命令注入（CVE-2026-83549，CVSS 7.8） → 设备系统权限 → 窃取VPN会话凭证、访问内部网络、植入后门。两个漏洞组合成一条 **预认证RCE**，无需任何凭证，只需设备暴露在互联网上。已被勒索软件团伙在野利用，CISA列入KEV。

**JeecgBoot的二次SSRF（CVE-2026-7603）** 是另一个值得注意的模式： `URL.openConnection()` 发起的请求，本身是一个SSRF点，但它可以被用来 **触发第二个SSRF**——第一个SSRF只是入口，真正的目标是让服务器在内部网络里发起一个它自己“信任”的请求。这种“SSRF的SSRF”模式，在微服务和代理链架构里尤其常见。

**SRC里SSRF的赏金逻辑**：未授权SSRF到达云元数据，P0级别，$3k–$20k；SSRF+Redis未授权，组合成RCE，单链通常¥10,000–50,000。 **SSRF本身可能是“中危”，但它是通往P0的那把钥匙**——单独提交“存在SSRF”拿不到高价，把攻击链完整走通、证明能拿到云凭证或RCE，才是定价的依据。

**七、防御：SSRF防护的唯一正确姿势是“校验和连接绑定”**

2026年的所有SSRF绕过案例，指向同一个防御原则： **防护必须发生在“连接建立”的那个时刻，而不是“URL解析”的那个时刻**。

**第一，DNS pinning是必须的。** 校验时解析出的IP，必须被传递到执行层，执行层连接时只能使用这个IP，不能再做独立解析。datamodel-code-generator的修复是标准答案：返回 `(host, pinned_ips)` ，自定义transport的 `connect_tcp` 只允许命中这个集合。AVideo的 `$resolvedIP` 出参被丢弃是反面教材——防护函数的输出没有被执行层消费，等于没防护。

**第二，重定向必须在每一跳重新校验。** `follow_location=0` ，手动循环，每提取一个 `Location` 就调用一次 `isSSRFSafeURL` 。不要依赖“入口检查一次就够”，重定向是攻击者切换目标的天然窗口。

**第三，不要只校验字符串。** 主机名字符串通过，不等于解析结果安全。CKAN MCP Server的三次绕过说明：字符串匹配可以被DNS配置完全绕过。校验必须在解析层做，而且解析结果必须被钉死。

**第四，限制HTTP方法和协议。** IMDSv2的token流程依赖 `PUT` 。如果你的SSRF防护允许任意方法，IMDSv2不是屏障。只允许业务必需的HTTP方法，只允许 `http/https` ，禁用 `file://` 、 `gopher://` 、 `dict://` 。

**第五，网络层出站过滤是最后一道防线。** 应用服务器不应该有能力向 `169.254.169.254` 、 `127.0.0.1` 、私有IP段发起任何请求，无论应用层的校验是否通过。这是纵深防御的底线——应用层校验会被绕过，网络层的ACL不会。

**第六，AI Agent的工具调用需要独立的安全层。** 一个编码Agent访问localhost dev server是正常行为，访问云元数据端点没有任何合法理由。对元数据端点的请求应该被 **独立于通用SSRF防护** 的硬阻断规则拦截，而不是依赖Agent的“判断力”或Prompt里的“不要访问内网”。

**写在最后**

2026年的SSRF，和2016年的SSRF，在原理上没有区别。区别在于： **攻击者不再只找“有没有校验”，他们在找“校验的东西和实际请求的东西是不是同一个东西”**。

DNS重绑定攻击的是“两次解析不是同一个结果”。重定向攻击的是“第一跳和最终跳不是同一个目标”。字符串匹配攻击的是“主机名和解析地址不是同一个含义”。IMDSv2绕过攻击的是“token流程的HTTP方法没有被限制”。AI工具链SSRF攻击的是“防护函数存在，但在某条代码路径上没有被调用”。

**每一次绕过，都精确地落在“校验的假设”和“执行的现实”之间的那条缝里。** 防护的强度，不取决于校验逻辑写得多复杂，取决于 **校验的结论有没有被强制执行到连接建立的那一刻**。datamodel-code-generator把IP钉死、把transport锁住，那条缝就关了。CKAN MCP Server只校验字符串、放手让底层重新解析，那条缝就一直在。

**严正声明**

本文所述所有SSRF漏洞分析、CVE案例及攻击链，仅用于 **已获得明确书面授权** 的安全测试、代码审计、红队演练和安全研究场景。CVE-2026-64849已在MLflow 3.15.0中修复，CVE-2026-33752已在curl_cffi 0.15.0中修复，CVE-2026-61612已在CKAN MCP Server 0.4.108中修复，CVE-2026-55391已在datamodel-code-generator 0.63.0中修复，CVE-2026-83548/83549已在SonicWall SMA1000对应固件中修复，CVE-2026-108719已在LLMGateway后续版本中修复。所有测试必须在SRC平台或客户授权的资产范围内进行，靶场环境应部署在隔离网络中。未授权扫描、测试、攻击行为违反《中华人民共和国网络安全法》第27条及《刑法》第285条，将承担法律责任。技术无罪，边界是法律。

2027渗透测试技术从-1到0 · 目录

作者提示: 个人观点，仅供参考
