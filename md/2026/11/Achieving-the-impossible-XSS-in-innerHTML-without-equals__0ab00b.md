---
title: "Achieving the impossible: XSS in innerHTML without equals"
source: https://portswigger.net/research/achieving-the-impossible-xss-in-innerhtml-without-equals
source_host: portswigger.net
clip_date: 2026-11-19T09:00:50+08:00
trace_id: b4b9ea5f-14c1-4d0f-abb7-c15f37d66f52
content_hash: 2c8632121aa3904498617fb40e4ca004569afa281913906bd3fa9d9b4e453d5d
status: synced
tags: []
series: null
feed_source: PortSwigger Research
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-81ce-a756-d3ee2dac24f6
ioc: null
---

![Shows a man surrounded by lasers reaching for alert(1)](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/987eae06aa293082.png)

## Introduction

I'm delighted to introduce [Masato Kinugawa](https://x.com/kinugawamasato) as a guest web security researcher on the PortSwigger research channel. Masato is a well known web security expert who has found countless high impact bugs and amazingly he solved one of our "impossible" labs. We took this chance to invite him to do a guest post, over to you Masato...

In 2020, Gareth Heyes compiled a list of [impossible labs](https://portswigger.net/research/documenting-the-impossible-unexploitable-xss-labs) , covering various injection scenarios where JavaScript execution was considered impossible.

One of the challenges on this list, " `innerHTML` context but no equals allowed", asks whether arbitrary JavaScript can be executed when an injection occurs in `innerHTML` but the equals sign is not allowed. This challenge had long been considered impossible.

Recently, I discovered a way to solve this challenge using a newly introduced HTML element. Here is the payload:

``<body>   <script>   document.body.innerHTML=`   <select>   <selectedcontent></selectedcontent>   <option>   <svg>   <script>alert(1)<\/script>`;   </script>   ``

Although this payload no longer works in Chrome due to a behavior change introduced in Chrome 153, I have confirmed that it still works in Safari 27.2, the latest version at the time of writing.

In this article, I'll share the story behind this discovery and explore the technical details behind it.

## The starting point

In May 2026, a very interesting [DOMPurify bypass](https://github.com/cure53/DOMPurify/security/advisories/GHSA-87xg-pxx2-7hvx) discovered by [Kabir Acharya](https://x.com/Kabir4charya) was disclosed.

What surprised me about this technique was its use of the `<selectedcontent>` element, which was relatively recently introduced in Chrome and Safari and which I had never seen used in an [XSS](https://portswigger.net/web-security/cross-site-scripting) vector before. For details of the bypass, see ["Attack Classes & Bypass History" in the DOMPurify wiki](https://github.com/cure53/DOMPurify/wiki/Attack-Classes-&-Bypass-History#18-engine-deferred-mutation-selectedcontent) .

Despite its seemingly harmless name, the `<selectedcontent>` element has a unique capability.

Let's take a look at the following HTML:

`<select>   <button>   <selectedcontent></selectedcontent>   </button>   <option><b>option 1</b></option>   <option selected><b>option 2</b></option>   </select>   `

When this HTML is placed on a page, inspecting the resulting DOM using `innerHTML` reveals the following:

`<select>   <button>   <selectedcontent><b>option 2</b></selectedcontent>   </button>   <option><b>option 1</b></option>   <option selected=""><b>option 2</b></option>   </select>`

Surprisingly, the contents of option 2 have been copied into `<selectedcontent>`, including the HTML elements.

This element has the ability to clone the child nodes of the currently selected `<option>` element. In this example, option 2 is selected by default because it has the `selected` attribute, so its contents are cloned.

Previously, no HTML element could perform this kind of cloning operation on its own without executing JavaScript. Inspired by Kabir's discovery, I wondered whether this behavior could make other previously impossible things possible, so I began investigating.

## Building an XSS vector

Before investigating the `innerHTML` case, I discovered that JavaScript could be executed through the following HTML:

`<select>   <button>   <selectedcontent></selectedcontent>   </button>   <option>   <script>alert(1)`

In this example, the HTML document ends immediately after `<script>alert(1)`. When this HTML is opened in Chrome or Safari, an alert is triggered exactly once.

What makes this behavior interesting is that, normally, when an unclosed `<script>` tag reaches the end of the document without an explicit closing tag ( `</script>`), the script is not executed. In this case, however, the script executes without a closing tag. What is happening here?

In a `<select>` element, the first `<option>` is selected by default if no selected attribute is specified. Therefore, in this case, the `<option>` containing the `<script>` element is selected, and the browser clones its child nodes and inserts them into `<selectedcontent>`. In this process, the Chrome and Safari implementations execute the cloned `<script>` element. We can confirm that it is the cloned element that executes by replacing `alert(1)` with `alert(document.currentScript.parentNode.tagName)`, which returns `SELECTEDCONTENT` as the tag name of the executing script's parent element.

## Making the vector more useful

After I shared this vector on social media, [with the help of Mathias Karlsson](https://x.com/avlidienbrunn/status/2074238271710810158) , we managed to eliminate " / " entirely from the vector.

`<select>   <button>   <selectedcontent>   <button>   <option>   <script>alert(1)`

This allowed JavaScript to execute without using whitespace, " / ", or " = ". (The line breaks in the payload are only for readability and can be removed.)

Although reducing the number of distinct characters required is interesting, this vector has a significant limitation. If additional content follows the vector, it becomes part of the `<script>` block, making a JavaScript syntax error highly likely. This severely limits the vector's usefulness in real-world XSS scenarios.

Fortunately, this problem can be solved by using SVG.

`<select>   <button>   <selectedcontent>   <button>   <option>   <svg><script>alert(1)<foo> <!-- The following is the legitimate page content -->   <div some-attr="123">test</div>   </body>   </html>   `

Unlike a normal HTML `<script>` element, an SVG `<script>` element allows the HTML parser to interpret the following `<foo>` as a start tag. This prevents the HTML content after `<foo>` from becoming part of the JavaScript code. Even in this case, the Chrome and Safari implementations execute the SVG `<script>` element cloned into `<selectedcontent>`. As a result, arbitrary JavaScript can be executed without using whitespace, "/", or "=", even when normal HTML content follows the vector.

Although this particular set of constraints is not listed in the impossible lab, to the best of my knowledge, no vector was previously known that could execute JavaScript in modern browsers without using whitespace, "/", or "=". Notably, this vector works not only in Safari but also in Chrome 157, the latest version at the time of writing.

## Solving the impossible

In this section, I'll introduce the XSS vector that solved the Impossible Lab "innerHTML context but no equals allowed". While exploring whether I could extend the vector from the previous section, I casually tried assigning almost the same HTML to `innerHTML`. To my surprise, this triggered JavaScript execution in Chrome. That's really all I did.

``<body>   <script>   document.body.innerHTML=`   <select>   <selectedcontent></selectedcontent>   <option>   <svg>   <script>alert(1)<\/script>`;   </script>``

What happened here?

First, as anyone who has worked on XSS involving `innerHTML` may know, `<script>` elements inserted via `innerHTML` are prevented from executing by the specification.

For example, the following code does not trigger an alert.

`<body>   <script>   document.body.innerHTML = "<script>alert(/not-executed/)<\/script>";   </script>`

If they could execute, this Impossible Lab could have been easily solved with just `<script>alert(1)</script>`, without using an equals sign.

However, in the vector introduced at the beginning of this section, the `<script>` element clearly executes. What makes it different from simply inserting a `<script>` element?

The key difference is that assigning the HTML to `innerHTML` causes a clone of the `<script>` element to be created inside `<selectedcontent>`. Additionally, the original `<script>` element is inside `<svg>`, so it is created in the SVG namespace.

In fact, removing `<svg>` prevents JavaScript from executing.

``<body>   <script>   document.body.innerHTML=`   <select>   <selectedcontent></selectedcontent>   <option>   <script>alert(/not executed/)<\/script>`;   </script>``

Similarly, removing `<selectedcontent>` also prevents execution.

`<body>   <script>   document.body.innerHTML = "<svg><script>alert(/not executed/)<\/script>";   </script>`

This tells us that both conditions are necessary for JavaScript execution in this vector: the `<script>` element must be created in the SVG namespace rather than the HTML namespace, and it must be cloned by `<selectedcontent>`.

## Diving into the cloning behavior

[According to the specification](https://html.spec.whatwg.org/multipage/form-elements.html#the-selectedcontent-element:~:text=Let%20childClone%20be%20the%20result%20of%20running%20clone%20given%20child%20with%20subtree%20set%20to%20true%2E) , when `<selectedcontent>` clones the child nodes of the selected `<option>`, it uses the same DOM cloning algorithm as `cloneNode(true)`. So I tried to reproduce the same behavior using this function.

The following simple code clones a node containing an SVG `<script>` element inserted via `innerHTML` and appends the clone to the DOM. Sure enough, the script executed when the clone was appended to the DOM.

``document.body.innerHTML = `     <div id="source">       <svg><script>alert()<\/script></svg>     </div>     <div id="target"></div>   `;`` `clone=source.cloneNode(true);   target.append(clone);`

In contrast, removing `<svg>` prevents the script from executing:

``document.body.innerHTML = `     <div id="source">       <script>alert(/not executed/)<\/script>     </div>     <div id="target"></div>   `;``

`clone=source.cloneNode(true);`

`target.append(clone);`

In other words, cloning an SVG `<script>` element apparently allowed a script that had not executed in the original element to execute. This cloning behavior seems to have been the key to making this vector work.

This behavior appears to have been unintended and was subsequently changed in Chromium. According to [the commit that introduced the change](https://github.com/chromium/chromium/commit/528414da7075867b6197cfd38f5ad1522e03372b) , the [already started flag](https://html.spec.whatwg.org/multipage/scripting.html#already-started) , which is defined in the HTML Standard and affects script execution. This flag was set to `true` for HTML `<script>` elements created via `innerHTML`, but remained `false` for SVG `<script>` elements. This difference appears to have caused the observed behavior.

Chromium was changed so that already started is also set to `true` for SVG `<script>` elements created via `innerHTML`, preventing this technique from working. However, it still works in Safari 27.2.

[Try it yourself in Safari](https://portswigger-labs.net/impossible-labs/innerHTML-no-equals.php?x=%3Cselect%3E%3Cselectedcontent%3E%3C/selectedcontent%3E%3Coption%3E%3Csvg%3E%3Cscript%3Ealert%281%29%3C/script%3E).

## Wrapping up

By using the new HTML element `<selectedcontent>`, I was able to solve the "innerHTML context but no equals allowed" challenge, which had been considered impossible for years.

Having worked on XSS for many years, I find it incredibly exciting to see something previously thought impossible become possible.

As browsers evolve, so do the possibilities for XSS. I think this discovery is one example of how what is considered "impossible" in XSS may not remain so forever.

[Back to all articles](https://portswigger.net/research/articles)
