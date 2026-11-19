---
title: "OAuth 2.0 Browser Swapping Attacks Revisited: Response Mode Fragment"
source: https://blog.syss.com/posts/browser-swapping-fragment/
source_host: blog.syss.com
clip_date: 2026-11-19T10:21:27+08:00
trace_id: cb04c11b-a75c-4564-93fc-37ab6cdcbbaa
content_hash: d2c309b5cc55d793812ecbb9aacde06f561c384e1b8201016c0bc6a77677b13a
status: synced
tags: []
series: null
feed_source: SySS Tech Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-8150-98b2-d0ed5d2c1370
ioc: null
---

Last November, SySS described novel attacks on OAuth 2.0 called browser swapping attacks. The idea was that attackers would access a session where the victim is logged in.

[![Sequence diagram of the browser swapping attack on attacker side](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0bc0a04447e50ca5.svg)](https://blog.syss.com/assets/img/papers/browser-swapping/5_browser_swapping_attacker.svg)

*Figure 1: Browser swapping attack diagram*

For this, attackers start a normal flow and give the authorization request as a link to the victim instead of sending it to the server themselves. This is marked as CSRF in the figure because one of the options to hand the link to the victim could be via CSRF.

The victim would open the link, log in (or be logged in already), but get an error on the callback. This is caused by an incorrect state of the victim because the correct state is only within the session in which the attacker started the flow. The problem, however, is that in many cases, the crucial parameters (e.g. authorization code) remain visible and accessible in the browser of the victim since they remain in the URL bar. As long as the attackers can convince the victim to handover the URL which resulted into the error, the attackers can use their session to end the flow and have access to resources in the context of the victim.

A further problem that was mentioned is that crucial parameters are often sent as query parameters. Query parameters are often logged, so access to some of the logs might be sufficient for the attackers to succeed. More details can be found in [OAuth 2.0 Browser Swapping Attacks](https://blog.syss.com/posts/browser_swapping/).

## Using “fragment” as response mode

One of the proposed mitigations is to use more secure response modes. The response mode indicates in which format the sensitive parameters should be provided to the authorization server. In the classical example, the response mode “query” is used. So, authorization code and state are added to the callback URL as query parameters, say `https://client.example.com/callback?code=abc123&state=zyx`. Here, the parameters are added after a question mark.

With response mode “fragment”, these parameters are added as [URI fragment](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment), say `https://client.example.com/callback#code=abc123&state=zyx`. Here, the parameters are added after a hash.

Fragments are not sent to servers when a URL with a fragment is opened in a browser. They mainly help to navigate quickly to a specific resource on the given page. In [https://blog.syss.com/posts/browser_swapping/#mitigation-strategies](https://blog.syss.com/posts/browser_swapping/#mitigation-strategies), the fragment helps to navigate directly to the mitigation section of the article. This, however, only happens within the browser. The server only sees a request for `https://blog.syss.com/posts/browser_swapping/`.

The behavior of the fragment limits its applicability within OAuth2. Only in scenarios, where the user agent also consumes the authorization code, the fragment can be used. This is, for example, the case for single-page applications and mobile apps. In scenarios where the user agent needs to send the callback URL to a server – say a client back end, which consumes the authorization code – this response mode cannot be used. The fragment would never reach the intended receiver and authorization would not work – even in legitimate cases. In these scenarios, the response mode “form_post” should be used, where the callback is triggered via an HTML form sending the authorization code as a POST parameter.

## Fragment and browser swapping

Let’s now consider a scenario where the used response mode is in fact “fragment”. This could be because the authorization server is configured to only use it or because the authorization request explicitly asks for this response mode. If attackers want to run browser swapping attacks, they would, as before, start the flow and take the authorization request URL. If they can adjust the response mode, they might add the parameter `response_mode=fragment` to ensure the authorization server uses fragments in the callback.

The authorization URL is passed to the victim, who opens the link and logs in. The login might happen explicitly or implicitly if the victim is logged into the identity provider. They are redirected to the callback URL, say `https://client.example.com/callback#code=abc123&state=zyx`.

In the case, where the user agent/ client directly consumes the code, the client should check the state and realize that the states do not match. In the case, where a back end is supposed to consume the code, the back end never receives code and stace since the fragment is not sent to the server. In both cases, an error message would be displayed, possibly with a redirect to say `https://client.example.com/callback-error`. Fragments, however, survive redirects. The URL bar in the browser, hence, would read `https://client.example.com/callback-error#code=abc123&state=zyx`.

In this case, we are back to classical browser swapping. If the attackers can convince the victim to share the error URL, the attackers would again get the authorization code and further relevant parameters. They then just need to copy the parameters and add them in the intended way to the callback URL – as a fragment if the application is set up to work with fragments, or as query parameters if the application is setup to work with query parameters. In the latter case, attackers would have adjusted the response mode in the authorization request in the beginning to force the fragment.

One point to mention is that the fragments are rarely logged because fewer systems see them compared to the query parameter. The main method for attackers would, hence, be to convince the victim to share the URL of the error page.

## Mitigation

Keeping the lifetime of authorization codes short reduces the practicability of such attacks considerably. If the attackers run a social engineering attack, where the victim needs to manually share the URL from the error page, short lifetimes in the realm of 10 s make attacks quite unlikely. This mitigation, however, needs to be balanced with the legitimate use of the application. In case of slower Internet connections, codes with very short lifetimes could disrupt legitimate use because they would expire even in normal flows.

A more direct approach is to reset the fragment when the client or back end run into one of the callback errors. Depending on the setup, the error occurs either because the client has the wrong state or because the back end never receives the parameters. The fragment can be reset by appending a hash, `#`, to the URL. So, the error redirect URL should be `https://client.example.com/callback-error#`. With the adjusted error URL, the browser of the vicitim would just display `https://client.example.com/callback-error#` without the parameters from the attempt to call the callback URL.
