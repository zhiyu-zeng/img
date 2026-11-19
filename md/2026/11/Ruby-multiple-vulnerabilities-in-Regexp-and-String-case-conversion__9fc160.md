---
title: "Ruby: multiple vulnerabilities in Regexp and String case conversion"
source: https://seclists.org/oss-sec/2026/q4/782
source_host: seclists.org
clip_date: 2026-11-19T10:35:55+08:00
trace_id: 82000ad8-cb67-46eb-9f9b-2ed10025d7a3
content_hash: a40d37d764042141eaa04d81c80a4bdcc88ac6ab23125b299a67fc0abea9a6d8
status: synced
tags: []
series: null
feed_source: oss-security·漏洞披露
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81fe-8bce-ca09e976d0c4
ioc: null
---

## oss-sec mailing list archives

## Ruby: multiple vulnerabilities in Regexp and String case conversion

* * *

*From*: Alan Coopersmith <alan.coopersmith () oracle com>  
*Date*: Wed, 18 Nov 2026 17:03:47 -0800  

* * *

```
https://www.ruby-lang.org/en/news/2026/11/18/multiple-vulnerabilities-in-regexp-and-string/
advises:
```

> ```sql
> Security advisories: multiple vulnerabilities in Regexp and String case
> conversion
> 
> Posted by mame on 18 Nov 2026
> 
> Seven vulnerabilities have been discovered in Ruby’s regular
> expression engine and in the case conversion of strings. We are aware
> of PoCs that prove some of them can be used to trigger remote code
> execution. We have released Ruby 4.0.10, 3.4.13 and 3.3.14 to fix
> them. We strongly recommend upgrading.
> 
> CVE identifiers have been requested for these vulnerabilities but have
> not been assigned yet, so this advisory refers to them by their GitHub
> Security Advisory (GHSA) identifiers.
> 
> 
> GHSA-34m4-m9fh-gqp5: Heap buffer overflow in case conversion of strings
> https://github.com/ruby/ruby/security/advisories/GHSA-34m4-m9fh-gqp5
> 
> Ruby has a one-byte heap-based buffer overflow in the case conversion
> of strings. Changing the case of a crafted string may allow remote
> code execution. We are aware of PoCs that prove this flaw can be used
> to trigger RCE in some scenarios.
> 
> 
> GHSA-7x2q-68qv-6p8x: Double free in regular expression compilation
> https://github.com/ruby/ruby/security/advisories/GHSA-7x2q-68qv-6p8x
> 
> Ruby has a double free in its regular expression engine. Compiling a
> crafted regular expression pattern may allow remote code execution in
> applications that compile attacker-controlled patterns. We are aware
> of PoCs that prove this flaw can be used to trigger RCE in some
> scenarios.
> 
> 
> GHSA-87fm-7w84-j2px: Integer overflow in case conversion of strings
> https://github.com/ruby/ruby/security/advisories/GHSA-87fm-7w84-j2px
> 
> Ruby has an integer overflow in the case conversion of strings, which
> causes a heap-based buffer overflow. Changing the case of a crafted
> string may allow remote code execution. We are aware of PoCs that
> prove this flaw can be used to trigger RCE in some scenarios.
> 
> 
> GHSA-wpqw-5qxg-m68r: Out-of-bounds read in case-insensitive regular
> expression matching
> https://github.com/ruby/ruby/security/advisories/GHSA-wpqw-5qxg-m68r
> 
> Ruby has an out-of-bounds read in its regular expression engine.
> Matching against a crafted regular expression pattern may allow remote
> code execution in applications that use attacker-controlled patterns.
> We are aware of PoCs that prove this flaw can lead to memory corruption
> in an attacker-controlled way.
> 
> 
> GHSA-3p8q-wmhx-vm2w: Heap buffer overflow in regular expression compilation
> https://github.com/ruby/ruby/security/advisories/GHSA-3p8q-wmhx-vm2w
> 
> Ruby has an integer overflow in its regular expression engine, which
> causes a heap-based buffer overflow. Compiling a crafted regular
> expression pattern may allow remote code execution in applications
> that compile attacker-controlled patterns. We are aware of PoCs that
> prove this flaw can be used to trigger RCE in some scenarios.
> 
> 
> GHSA-7whj-cfh7-xgm4: Heap buffer overflow in Regexp#to_s
> https://github.com/ruby/ruby/security/advisories/GHSA-7whj-cfh7-xgm4
> 
> Ruby has a heap-based buffer overflow in Regexp#to_s. Converting a
> crafted regular expression to a string may allow information
> disclosure or remote code execution in applications that compile
> attacker-controlled patterns. We are aware of PoCs that prove this
> flaw can be used to trigger RCE in some scenarios.
> 
> GHSA-pvgc-g7gj-pv6h: Out-of-bounds read in case-insensitive backreference matching
> https://github.com/ruby/ruby/security/advisories/GHSA-pvgc-g7gj-pv6h
> 
> Ruby has an out-of-bounds read in its regular expression engine.
> Matching a crafted string may disclose memory contents or crash the process.
> 
> 
> Affected versions
> 
>     Ruby 3.3.13 and earlier
>     Ruby 3.4.0 through 3.4.12
>     Ruby 4.0.0 through 4.0.9
> 
> Recommended action
> 
> We strongly recommend upgrading to Ruby 4.0.10, 3.4.13 or 3.3.14.
> 
> Ruby 3.3 is in the security maintenance phase. Ruby 3.2 and earlier have
> reached their end of life and will not receive these fixes.
> 
> Credits
> 
>     GHSA-34m4-m9fh-gqp5: Stephan Lipp (Ada Logics) and Anthropic
>     GHSA-7x2q-68qv-6p8x: Stephan Lipp (Ada Logics) and Anthropic
>     GHSA-87fm-7w84-j2px: baba__yaga
>     GHSA-wpqw-5qxg-m68r: Stephan Lipp (Ada Logics) and Anthropic
>     GHSA-3p8q-wmhx-vm2w: aphantom
>     GHSA-7whj-cfh7-xgm4: Stephan Lipp (Ada Logics) and Anthropic
>     GHSA-pvgc-g7gj-pv6h: Hiroya Fujinami and Hiroshi SHIBATA
> 
> History
> 
>     Originally published at 2026-11-19 00:00:00 (UTC)
> ```

```
--
        -Alan Coopersmith-                 alan.coopersmith () oracle com
         Oracle Solaris Engineering - https://blogs.oracle.com/solaris

```
