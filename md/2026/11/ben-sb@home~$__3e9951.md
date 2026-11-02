---
title: ben-sb@home:~$
source: https://blog.deobfuscate.io//investigating-html-obfuscator
source_host: blog.deobfuscate.io
clip_date: 2026-11-02T10:27:23+08:00
trace_id: 71c1f606-9222-4f97-b6cd-11cbd42bd515
content_hash: 21423a2e8d1d10ebfd178820bd013c9043bca104ddbf162183665ca5929d6bec
status: synced
tags:
  - JS反混淆
  - Hook
series: null
feed_source: deobfuscate·逆向工程
ai_summary: 一款自称“重度混淆”的在线 HTML 混淆器，实际只是多层 JS 解密后用 `document.write` 还原页面，用箭头函数 hook 即可完整还原原始 HTML。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40c75244-d011-8114-bb08-c412efbb201a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 一款自称“重度混淆”的在线 HTML 混淆器，实际只是多层 JS 解密后用 `document.write` 还原页面，用箭头函数 hook 即可完整还原原始 HTML。
> 
> - **混淆结构：** 混淆后页面仅剩一个 script 标签，借助 `Function` 构造器 + IIFE 执行；payload 按零宽空格字符切分成多段，逐段创建函数并立即调用，层层解码生成更多脚本，最终经 `document.write` 写出真实 HTML。
> - **反分析手段：** 运行时先从 DOM 移除自身 script 标签，`DOMContentLoaded` 后删除页面所有 script 节点与 HTML 注释；还通过 `'prototype' in document.write` 检测钩子篡改，一旦发现被覆写就提前退出。
> - **去混淆方法：** 用 DevTools 单步跟踪，在解码循环之后设断点跳过繁琐步骤；再用 Babel 遍历 AST，把引用状态对象 `_$` 与 `_C6u4T6cj6b9` 的成员表达式直接替换为对应字符串字面量，并手工重命名超长变量名，使核心逻辑可读。
> - **解码算法：** 数据以十六进制存储，X/Y 映射为 E/B 后剔除非法字符；按配置生成 256 字节替换表，逐字节做减法得到字符码，`decodeURIComponent` 拼出原始 HTML——在 `htmlContent` 初始化处断点即可验证。
> - **绕过技巧：** 由于检测依赖 `prototype` 属性，改用**箭头函数**覆写 `document.write`（箭头函数无 prototype）即可通过检查，刷新页面后控制台直接打印出完整原始 HTML。
> 
> 结论：该工具只能劝退不熟悉 JS 调试的新手，防护形同虚设，依赖此类未知混淆器保护代码存在风险。

## Investigating a HTML Obfuscator

I received an email recently suggesting I take a look at a HTML obfuscator. The tool is called [Online HTML Obfuscator by PhpKobo](https://www.phpkobo.com/html-obfuscator), and claims to “heavily obfuscate HTML code”.

I was a little skeptical of this claim, and decided to investigate to see how it was protecting the HTML.

If we visit the site we can obfuscate their demo HTML code, which is a simple page which some emojis bouncing across the screen:

![demo HTML page](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a406e87adab0b050.png)

Looking at the page source via View Page Source, there is just a single script tag with some obfuscated looking JavaScript. So this must be decoding and loading in the real HTML at runtime.

Interestingly, if we look at the DOM via the Elements tab of DevTools we can see a lot of the original HTML, however the JavaScript from the unobfuscated HTML which controls the bouncing emojis is not there.

Next let’s look at the obfuscated JavaScript. It uses the `Function` constructor to create a function and immediately call it. The body of the function is obfuscated, and uses escaped strings and other basic obfuscation to conceal the strings `"replace"`, `"split"` and `"Function"`. These are then used in the core logic, which is an IIFE that looks like:

```javascript
((_FQRTR8s014sl4bYL6zNU0Wq10B) =>
  '_C6u4T6cj6b9._XZQhqrh2X2CLzKdRPT9nEG1Td2B31445tyKkTJa23EtU="CZZBRJLYJEHHRIQZCWVDKBGMQEC...'
    ['split']('​')
    ['forEach']((_I80M7sc) =>
      (function () {
        return this;
      })()['Function'](
        '_C6u4T6cj6b9',
        _I80M7sc,
      )(_FQRTR8s014sl4bYL6zNU0Wq10B),
    ))({});
```

So it has a very long string containing more JavaScript code, which is split using the zero-width space character (an invisible character), then each chunk is used to create a function which is immediately invoked with an object parameter. This parameter is shared across all of the functions.

The first few functions just set some string properties on the object parameter, presumably so later functions can use them. However if we look at the later scripts we can see that these scripts also start decoding more JavaScript code, and running it via `Function`. There are various more layers repeating this pattern, and most of it looks like boilerplate setup code.

Rather than continuing static analysis, we can instead do some dynamic analysis to identify the core logic, using the DevTools debugger. What’s useful when doing this is keeping an eye on whether the HTML has loaded, so we can be sure we don’t go beyond the important part that loads the HTML in. Basically the process we will follow is step into every function call, sometimes stepping out of uninteresting functions or skipping over loops, until we either identify some interesting looking code or the HTML gets loaded in (which would mean we have missed the important part).

To start we set a breakpoint on the first (and only) line of the outer script tag. Then we keep stepping in and out of functions until we find something interesting. Since there are a lot of loops to perform string decoding, it is often useful to set breakpoints after the loops and allow execution to resume instead of single stepping through.

After many functions we eventually hit one that looks different; it is a lot larger and doesn’t seem to only be creating other functions. It is obfuscated using similar techniques as before, but also via using strings from the state object (`_C6u4T6cj6b9`) which were populated by previous functions. It also creates another object called `_$`, which contains even more strings. From initial analysis the state object `_C6u4T6cj6b9` appeared to contain config information, perhaps corresponding to the settings supplied to the obfuscator, whereas the other, `_$`, had strings referencing various web APIs and window properties.

To deobfuscate this, I copied the contents of the two objects from the debugger, and wrote a simple script using Babel to replace all of their usages. This looked roughly like this:

```typescript
const _$ = {
  _R0t9s9JGsC78kLa9Sh6lrXkfQWwsgu8w: 'document',
  _G6LVjd6730zXfQSSGzPf7HMHKE7d6Y64ZCqYQAj056rO: 'currentScript',
  _KPGm5p8p5I4v5vtJ5Tk7670B9Y3ETccPDbxM282G: 'currentScript',
  _VByvr36x4jwM4Iq29d3vNC4CXG: 'remove',
  _Kdt95: 'addEventListener',
  /* lots more properties */
};

const _C6u4T6cj6b9 = {
  _XZQhqrh2X2CLzKdRPT9nEG1Td2B31445tyKkTJa23EtU:
    'CZZBRJLYJEHHRIQZCWVDKBGMQECLKFRZVAZUUYLSGIDSZIWJHSKVYZLBOUZFLCP',
  _ZRHfJgjD4rUI89H9Qyc7bK8xG: '49X881FA6...(lots more)',
  _M52zvrlS1s9U6QCDhW15189OZWypE4ttbVkf7K: '',
  _W6j1uXERzrhHsbLJ0vPjP0tsJf7LH: '',
  _NoSR046704CDGB5u6iTi84p682M3f8oyN13Maot5SnD: '1',
  _FVFRZ355aM9Z4F5Fbv: '1',
};

traverse(ast, {
  MemberExpression(path) {
    if (
      t.isIdentifier(path.node.object) &&
      (path.node.object.name === '_$' || path.node.object.name === '_C6u4T6cj6b9') &&
      t.isIdentifier(path.node.property) &&
      !path.node.computed
    ) {
      const object = path.node.object.name === '_$' ? _$ : _C6u4T6cj6b9;
      const key = path.node.property.name;
      if (key in object && typeof object[key] === 'string') {
        const replacement = t.stringLiteral(object[key]);
        path.replaceWith(replacement);
      }
    }
  },
});
```

The resulting script is now somewhat readable, but the long variable names were annoying so I renamed them to be shorter. I also did some basic analysis and manually renamed a couple of variables. The result was:

```javascript
(function f(p) {
  (function (p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, charCodes, p15, p16, p17, encodedCharCodes, p19, htmlContent, p21, p22, p23, p24) {
    if (document.currentScript) {
      document.currentScript.remove();
    }

    document.addEventListener('DOMContentLoaded', (p25) => {
      if (parseInt('1')) {
        document.querySelectorAll('script').forEach((p26) => {
          p26.remove();
        });
      }

      if (parseInt('1')) {
        ((p27, p28) => {
          if (p27) {
            ((p29, p30) => {
              p30 = document.createNodeIterator(p27, NodeFilter.SHOW_COMMENT, (p31) => {
                return NodeFilter.FILTER_ACCEPT;
              });
              while ((p29 = p30.nextNode())) {
                p29.remove();
              }
            })();
            (p28 = (p32, p33) => {
              if (p32) {
                p28(!p33 ? p32.previousSibling : p32.nextSibling, p33);
                if (p32.nodeType == Node.COMMENT_NODE) {
                  p32.remove();
                }
              }
              return p28;
            })(p27.previousSibling, 0)(p27.nextSibling, 1);
          }
        })(document.documentElement);
      }
    });

    if (!('currentScript' in document)) {
      return;
    }

    p5 = '';
    p6 = window.location.protocol;
    if (p5 != '' && p6.substring(0, p5.length) != p5) {
      return;
    }

    p7 = '';
    p8 = window.location.hostname;
    if (p7 != '' && p7 != p8) {
      return;
    }

    if ('prototype' in document.write) {
      return;
    }

    p4 = '49X881FA6...(lots more)';
    p11 = p4.substring(p4.length - 8);
    p9 = window.parseInt(p11.substring(0, 4), 16);
    if (!window.isNaN(p9)) {
      p10 = document.currentScript.textContent.length % 65536;
    }
    p12 = window.parseInt(p11.substring(4, 6), 16);
    p13 = window.parseInt(p11.substring(6, 8), 16);
    p4 = p4.substring(0, p4.length - 8);

    _WB0KDTM76i2UD0zV3VK = new window.RegExp('X', 'gi');
    _Lm10XZapTpHikci0EGx1Hbug8RKH0Ok48yXJRYdb = new window.RegExp('Y', 'gi');
    _YuYfU6W7jGd081eXnOuti4t1NY = new window.RegExp('[^0-9a-f]', 'gi');
    p4 = p4
      .replace(_WB0KDTM76i2UD0zV3VK, 'E')
      .replace(_Lm10XZapTpHikci0EGx1Hbug8RKH0Ok48yXJRYdb, 'B')
      .replace(_YuYfU6W7jGd081eXnOuti4t1NY, '0');

    charCodes = [];
    p15 = 0;
    p16 = p13;
    for (; p15 < 256; p15++, p16 += p12, p16 %= 256) {
      charCodes[p16] = p15;
    }

    p17 = p4.match(/.{2}/g);
    encodedCharCodes = [];
    p15 = 0;
    p16 = 0;
    for (; p15 < p17.length; p15++, p16++, p16 %= 256) {
      p19 = (window.parseInt(p17[p15], 16) - charCodes[p16] + 256) % 256;
      encodedCharCodes.push('%' + (p19 < 16 ? '0' : '') + p19.toString(16));
    }

    htmlContent = window.decodeURIComponent(encodedCharCodes.join(''));

    if ('0' in p) {
      p['0'](); // () => document.removeEventListener('error', listener);
    } else {
      return;
    }
    p._N3r1MZ7gwc7zQ1lIBZBQ1nUFInR1okR7IB1 = ((
      p34,
      p35,
      randomStringA,
      randomStringB,
      fixedStr,
    ) => {
      fixedStr = 'rAx1poBsdfC';

      p35[fixedStr] = (p39, p40, p41, p42, p43) => {
        p41 = '';
        p42 = 'abcdefghijklmnopqrstuvwxyz0123456789';
        for (p43 = 0; p43 < p40; p43++) {
          p41 += p42.charAt(Math.floor(Math.random() * p42.length));
        }
        return p39 + p41;
      };

      randomStringA = p35[fixedStr]('a', 134);
      randomStringB = p35[fixedStr]('b', 122);

      p35[randomStringB] = (p44) => {
        delete window[randomStringA];
        delete window[randomStringB];
        if (p34 === p44) {
          return htmlContent;
        } else {
          return '';
        }
      };

      window[randomStringA] = document.write.bind(document);
      window[randomStringB] = (p45) => p35[randomStringB](p45);

      return new window.Function(randomStringA + '(' + randomStringB + '(this))').bind(p34);
    })({}, {});
  })();
});
```

Note that a couple of the strings, such as the argument to `parseInt('1')`, came from the config object, so would presumably change the behaviour if the settings to the obfuscator were different.

It starts out by accessing `document.currentScript`, and removing it from the DOM. This is so the original obfuscated script isn’t visible in the final HTML contents.

Next it sets an event listener on `DOMContentLoaded`, and iterates over all scripts in the DOM and removes them. This is why we couldn’t see any of the scripts containing the bouncing emoji logic when we viewed the DOM earlier. It also iterates over all DOM nodes, and removes any HTML comments.

It then appears to do some integrity checks. The most interesting one is:

```javascript
if ('prototype' in document.write) {
    return;
}
```

It checks whether `"prototype"` exists in the `document.write` function. This is an anti-tampering check, to see if we have overwritten the `document.write` function, and if so exits early. This suggests that it will later use `document.write` to populate the HTML of the page.

After this it does some string decoding, and through some strange logic it creates and calls functions with random names which write the final decoded string to the DOM with `document.write`. To confirm this analysis is correct, we can go back to the debugger, and break on the line which initialises the `htmlContent` variable (or the corresponding original variable name). Doing so reveals it contains the original HTML we supplied to the obfuscator!

To access the original HTML we could of course repeat this same process of debugging and breakpointing once it has been decoded, however that is tedious and there is a far better way. Instead we can hook `document.write` and just read out the HTML. However there was an anti-tampering check for this - if `"prototype"` is found within the function then the program will exit early and not write the correct HTML.

To avoid this, we can actually just overwrite `document.write` with an arrow function rather than a normal function declaration, as arrow functions do not have a prototype.

```javascript
const originalWrite = document.write.bind(document);
const hookedWrite = (code) => {
  console.log(code);
  return originalWrite(code);
};

document.write = hookedWrite;
```

We can then refresh the page and run this code when the initial breakpoint is hit, then resume execution. The page loads correctly, and the original HTML code is logged to the console.

## Conclusion

This was an interesting obfuscator, the several layers of obfuscated JavaScript would likely deter those unfamiliar with JavaScript obfuscation or debugging. The integrity check on `document.write` was pretty basic, but it might catch out a few people who suspected the use of `document.write` and tried to take the easy route. It’s worth noting that there are a number of additional more sophisticated anti-tampering checks that could have been used.

However we are able to recover the full original HTML code, so I would disagree that the HTML code itself was actually obfuscated, although this may be a matter of semantics. We were also able to obtain the HTML through a very simple hook, which demonstrates the danger of relying on unknown obfuscators which claim to heavily protect your code.
