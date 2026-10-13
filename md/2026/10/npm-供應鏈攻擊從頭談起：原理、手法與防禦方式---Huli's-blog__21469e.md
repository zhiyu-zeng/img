---
title: npm 供應鏈攻擊從頭談起：原理、手法與防禦方式 - Huli's blog
source: https://blog.huli.tw/2026/05/25/dive-into-npm-supply-chain-attack/
source_host: blog.huli.tw
clip_date: 2026-10-13T10:25:54+08:00
trace_id: 5ce42cc9-202a-44e4-881f-f6081fca41b3
content_hash: 2accf09f03919515ceab326ddf0a64e9b1ad0db94d32b5585350dd21f33a22d8
status: synced
tags:
  - 供应链攻击
  - npm安全
series: null
feed_source: Huli·安全/逆向
ai_summary: npm 供应链攻击常在安装阶段执行恶意代码，防御核心是关闭脚本、延迟下载、锁定版本、封堵 git/URL 来源，并优先用 pnpm。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3f875244-d011-818d-a8a8-c66f8cc070a9
ioc:
  cves: []
  cwes: []
  hashes:
    - f00e43e2a6d4c8a12a677df20b7804492d50863c
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> npm 供应链攻击常在安装阶段执行恶意代码，防御核心是关闭脚本、延迟下载、锁定版本、封堵 git/URL 来源，并优先用 pnpm。
> 
> - **攻击规模与目标：** 2026 年 4-5 月 axios、TanStack、antv 相继被投毒；PyPI、NuGet、Docker Hub、VSCode 扩展等同样是供应链攻击目标。
> - **安装即执行：** npm 允许依赖声明 postinstall 等生命周期脚本，恶意包可在 npm install 时执行任意命令；仅不用该包也不能避免，因此 ignore-scripts=true 是基础防线。
> - **冷却与锁定：** pnpm v11 默认 minimumReleaseAge=1440 分钟，npm 的 min-release-age 单位为天，bun 为秒；作者建议 npm 设 3 天。package-lock.json 固定版本和 integrity，必须提交版本控制。
> - **非 registry 来源绕过：** direct URL 与 git 依赖不受发布冷却保护；恶意 git 依赖可用 .npmrc 的 git=./pwn.sh 绕过 ignore-scripts。pnpm v11 默认 blockExoticSubdeps=true，npm v11.10.0 新增 allow-git/allow-remote，v12 计划 allow-git=none。
> - **推荐配置：** npm 设 ignore-scripts=true、min-release-age=3、allow-git=none、allow-remote=none；pnpm 升级最新；可加 Socket Firewall 扫描，或用 dev container 隔离。

2026 年 5 月 19 日，拿來做圖表的套件 antv 遭到攻擊，最新版本被植入惡意程式。

5 月 13 日，前端圈很熱門的 TanStack 系列 repo 也遭到攻擊。

4 月 1 日，每週有一億次下載的 axios 也同樣被攻擊，被發布了惡意版本。

大概每隔一個月或甚至一週就會看到供應鏈攻擊的新聞，而被攻擊的對象也不只有 npm，Python 的 PyPI、.NET 的 NuGet、甚至是 Docker Hub 或是開發者在用的 VSCode extension，也全部都是目標。

在這個前提下，開發者該如何保護自己？

這篇主要來談談針對 npm 的供應鏈攻擊，先從原理開始聊起，接著來談談攻擊手法，以及防禦方式。

## 從安裝一個套件開始

當你執行 `npm install express` 時，背後發生了哪些事情？（實際上更複雜，我們簡化一下）。

首先呢，由於沒有指定版本，因此 npm 會先去找 express 這個套件的最新版本，以我寫文章當下為例，是 11 天前發布的 5.2.1。

[![express 最新版本](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/646ec91a58a92fcc.png)](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p1.png)

[express 最新版本](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p1.png)

於是，express 的 5.2.1 版本就先下載到你的電腦裡了。

接著，express 本身也有依賴其他套件，這些套件都定義在它的 [package.json](https://github.com/expressjs/express/blob/v5.2.1/package.json) 裡面，可以看到還不少：

```javascript
{
  "dependencies": {
    "accepts": "^2.0.0",
    "body-parser": "^2.2.1",
    "content-disposition": "^1.0.0",
    "content-type": "^1.0.5",
    "cookie": "^0.7.1",
    "cookie-signature": "^1.2.1",
    "debug": "^4.4.0",
    "depd": "^2.0.0",
    "encodeurl": "^2.0.0",
    "escape-html": "^1.0.3",
    "etag": "^1.8.1",
    "finalhandler": "^2.1.0",
    "fresh": "^2.0.0",
    "http-errors": "^2.0.0",
    "merge-descriptors": "^2.0.0",
    "mime-types": "^3.0.0",
    "on-finished": "^2.4.1",
    "once": "^1.4.0",
    "parseurl": "^1.3.3",
    "proxy-addr": "^2.0.7",
    "qs": "^6.14.0",
    "range-parser": "^1.2.1",
    "router": "^2.2.0",
    "send": "^1.1.0",
    "serve-static": "^2.2.0",
    "statuses": "^2.0.1",
    "type-is": "^2.0.1",
    "vary": "^1.1.2"
  }
}
```

下一步 npm 就會根據這份定義去下載每一個套件，並且要是「正確版本」。

版本號這東西通常都是 `a.b.c` ，例如說 `1.1.0` 或是 `2.3.3` 這種，第一個數字是 major release，通常代表著 breaking change，也就是你從 `1.2.0` 升級到 `2.0.0` 的時候，有些 API 會變，因此直接升級專案可能會壞掉。

而最後的那個版本號如 `2.3.0` 到 `2.3.1` ，通常就是修個小 bug，如果有新功能就會動中間的，如 `2.3.0` 到 `2.4.0` 。

以 `"body-parser": "^2.2.1"` 為例，這個 `^` 是表示「不接受 breaking change」，因此 `^2.2.1` 能接受任何 `2.x.x` 的版本，這也是最常用的表示方法。

所以，若是你實際去測試，會發現最後安裝到的 `body-parser` 是 `2.2.2` 版本，因為最新的就是 `2.2.2` ，而且符合 `^2.2.1` 的定義。

以另外一個上面寫的 `"content-disposition": "^1.0.0"` 為例，最新的版本是 `2.0.0` ，而最後安裝到的是 `1.1.0` ，因為 `1.1.0` 才符合 `^1.0.0` 的定義。

[![依賴解析](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d7017320f76a822e.png)](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p2.png)

[依賴解析](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p2.png)

而這些 express 所依賴的套件，本身也可能會有其他依賴，因此就這樣不斷安裝，直到所有依賴都安裝完成為止。

當你執行完 `npm install express` 以後，會在 terminal 上看到總共安裝了多少個套件：

```bash
added 66 packages, and audited 67 packages in 2s
```

我們先停在這裡，講到目前為止，這個安裝過程可能會有哪些問題？

第一，我們安裝的 `express` 最新版本如果有問題，我們就中招了。

第二， `express` 中任何一個依賴有問題，我們也中招了。那 66 個套件裡面只要有一個最新版本是駭客發布的，我們也會安裝到。

這就是供應鏈攻擊的由來，尤其 JavaScript 生態系常被人詬病的就是本身提供的功能太少，導致開發者要裝一大堆小套件來處理這些常用功能。

例如說我們想知道 HTTP status code 與 message 的關係，如 404 對應到 `Not Found` ，在 npm 上有個每週 1.5 億次下載的套件 [statuses](https://www.npmjs.com/package/statuses) 專門在處理，而它的核心其實就是個 code 到 message 的 JSON 檔案。

相同的需求，在 Go 裡面你可以直接 [http.StatusText](https://pkg.go.dev/net/http#StatusText) ，在 Python 裡面可以 [HTTPStatus(404).phrase](https://docs.python.org/3/library/http.html#http.HTTPStatus) ，都有官方提供的 library，但是在 JavaScript 的生態系中沒這種東西，只能靠社群維護的套件。

因為缺少了這些官方函式庫，所以一堆功能都是靠 npm 上的套件堆起來的，只要任何一個小套件被攻擊，在安裝的時候就會裝到惡意套件。以攻擊者的角度來看，攻擊一個套件，可以影響到成千上萬個，怎麼想都很划算。

除了上面兩種，還有另一個問題是：「我們自己不小心安裝到錯的套件」。

例如說 express 多打一個 s，變成 expresss，就會安裝到別的套件。因此駭客可以先註冊很多打錯字的套件，放惡意程式碼在裡面，你不小心打錯字就會中招，這種攻擊手法叫做 typosquatting。

偷偷跟你說，每週有將近 600 人會多打一個 s，但慶幸的是這個套件是空的：

[![expresss 的下載次數](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/146c78213c603830.png)](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p3.png)

[expresss 的下載次數](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p3.png)

有些服務會禁止註冊這種名字相近的，或是有些善良的資安人員會先註冊起來，以免其他人打錯或是被有心人士註冊走，例如說與知名套件 mongoose 一字之差的 [mongose](https://www.npmjs.com/package/mongose) ，以前就被發起攻擊，因此後來被 npm 團隊註冊起來放著：

[![mongose](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b4e35ffa03e80fcc.png)](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p4.png)

[mongose](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p4.png)

## 安裝到有問題的套件會怎樣？如何防禦？

既然是安裝套件，那只要不用它應該就不會有問題吧？雖然多打一個字安裝到錯的，但是在用的時候寫對就會發現套件不存在，只要沒用到套件，應該很安全吧？

在 npm 生態系底下，只要裝到惡意套件就直接 game over 了。

原因是，npm 有提供各種 [scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts) 可以跑，如 `postinstall` ，只要在套件裡面指定好，在你安裝完套件以後，寫在 `postinstall` 裡的 shell script 就會被執行。

postinstall 的正常用法是在套件安裝完之後，自動再去下載需要的東西，像是拿來做瀏覽器自動化的 [puppeteer](https://github.com/puppeteer/puppeteer/blob/af1b9be6b6a178f7ea6e197f738ca3cf99d786f7/packages/puppeteer/package.json#L42) ，它的 postinstall 寫著 `node install.mjs` ，會去跑一個幫你下載瀏覽器的腳本，把環境設置好。

那不正常用法就是把惡意程式碼埋在 postinstall 裡面，像是 [axios](https://cloud.google.com/blog/topics/threat-intelligence/north-korea-threat-actor-targets-axios-npm-package) 被攻擊的事件中，就是有個子依賴指定了 postinstall，會跑 `node setup.js` ，然後 `setup.js` 含有惡意程式碼，安裝即中招。

那我們該怎麼防禦呢？

在 npm 裡面有一個參數可以設定： [ignore-scripts](https://docs.npmjs.com/cli/v11/commands/npm-install#ignore-scripts) ，配成 true 的話，就可以關掉這些 pre/post 系列的 hook，不會執行。這個參數預設是 false，所以記得要主動設定。

而 pnpm 從 v10 開始就預設阻止這些 scripts 的執行，你要主動把套件加到 `allowBuilds` 的清單裡面才能跑。當初還有開了一個 GitHub 的討論串以及投票： [Should we block lifecycle script of dependencies during installation? #8918](https://github.com/orgs/pnpm/discussions/8918) ，有七成的人選應該預設擋掉。

而 bun 的策略則是內建一個信任清單，預設只有這清單裡面的套件才可以執行 script，目前有 300 多個套件在上面： [src/install/default-trusted-dependencies.txt](https://github.com/oven-sh/bun/blob/main/src/install/default-trusted-dependencies.txt)

雖然說 bun 在開發者體驗跟安全性之中取得了一個平衡，但我還是更喜歡 pnpm 的做法，直接把全部擋掉，開發者要明確 approve 才會執行。

話說這種「安裝套件後可以執行腳本」的功能也不是 npm 獨有的，隔壁的 RubyGems 也有類似的功能。而這個機制也會有相同問題，就是安裝到惡意套件直接 game over，因此在 4 月份的時候，他們也加上了兩個 option 可以把這個行為關掉： [Add –no-build-extension and –no-install-plugin options to gem install #9473](https://github.com/ruby/rubygems/pull/9473) 。

但因為預設開啟怕會有現有專案壞掉，所以預設是關的，跟 npm 一樣要開發者主動開啟才有用。

以 npm 來說，我們可以新增一個 user-level 的 npm config 放在 `~/.npmrc` ，就不需要每個資料夾重複指定了：

```ini
# 不執行 postinstall 等腳本
ignore-scripts=true
```

## 如何不安裝到有問題的套件

若是安裝到了惡意套件，惡意套件可以經由那些 script 直接執行程式碼；就算我們把這功能關掉，若是我們的產品用到了這些套件，那產品本身也會被污染，到時候你的網站就可能被植入惡意程式。

「把 script 關掉」算是第二層防禦，而第一層防禦，也就是大家最想要達成的，其實是：「不要安裝到惡意套件」，只要不安裝到就沒事了。

那要怎麼盡量做到這件事呢？有三個方法。

### 第一招：延遲下載

既然有駭客鎖定供應鏈進行攻擊，那自然也會有相對應的資安廠商來注意這塊進行防禦。

例如說開頭提到的 TanStack，在被攻擊後的 20 分鐘內就被 StepSecurity 發現，而 axios 也是約 1 小時後被發現，在惡意版本發布後的 3 小時被 npm 移除。

因為這些資安公司的努力以及自動化偵測，這類的攻擊通常在幾小時之內就能被發現，並且 npm 也會盡快移除，避免更多人下載到惡意套件。

也就是說，如果我們在安裝的時候指定「我只下載 24 小時前發布的套件」，就能大幅降低下載到惡意套件的可能性（當然不是 100% 解決這問題，畢竟沒人發現的話一樣會下載到）。

pnpm 中有一個 [minimumReleaseAge](https://pnpm.io/settings#minimumreleaseage) 的設定，從 v11 開始預設為 1440 分鐘，也就是一天。所以當 codex 問你要不要更新你說好，安裝完以後又問你要不要更新一直鬼打牆，就是因為版本發布還沒過一天，所以沒裝到（真實案例，我自己碰到過一兩次，後來才發現原來是因為這個）。

在 npm 中也有個 [min-release-age](https://docs.npmjs.com/cli/v11/commands/npm-install#ignore-scripts) ，單位是天，效果也是一樣的，預設是空的。

bun 也有 [minimumReleaseAge](https://bun.com/docs/runtime/bunfig#install-minimumreleaseage) ，單位是秒（bun 是秒，pnpm 是分鐘，npm 是天，你們是約好要故意不一樣的嗎⋯），預設也是空的。

所以如果你用 pnpm v11 以上的版本，預設就不會下載一天內發布的套件，能夠降低安裝到惡意套件的可能性。

若是用 npm，我也建議設定一下這個值，我自己是設定 3 天，更保險一點：

```ini
# 不執行 postinstall 等腳本
ignore-scripts=true

# 不下載 3 天內發布的套件
min-release-age=3
```

不過設定這個參數以後會碰到另一個問題，那就是若是有漏洞，這個修復的版本你也無法即時裝上，必須等個幾天或是在安裝時手動先把這個 config 蓋掉，例如說 `npm install -g @openai/codex --min-release-age=0` 。

我自己覺得可以看漏洞的嚴重程度以及是否能被攻擊，若是被利用的可能性低的話，等個幾天會比較好。畢竟不能被利用的漏洞風險可控，相比之下安裝到惡意程式的風險會更高一點。

舉例來說，現在很多套件雖然偶爾有一些 high 的漏洞，但若是你仔細看，會發現是特定狀況或是某個功能有問題，而你用的套件或你的產品本身不一定有用到這個功能，這狀況就可以等個幾天再來修。

若是 React2Shell 那種就另當別論，盡快修復才是上策。

### 第二招：鎖定版本

基本上同一個版本是沒辦法被覆蓋的，例如說 `2.0.0` 是安全的，那它就是安全的，駭客要發布惡意版本只能升一個版號變成 `2.0.1` 。所以，只要下載過安全的版本，下次再下載也會是安全的（除非 registry 本身被駭啦）。

當我們執行完 `npm install express` 之後，除了會下載套件以外，還會產生另一個檔案叫做 `package-lock.json` ，這就是鎖定版本用的 JSON。

舉例來說， `express` 的依賴有 `body-parser` ，寫著 `^2.2.1` ，而 `body-parser` 目前最新相容的版本是 `2.2.2` ，安裝後 lockfile 就會寫死 `2.2.2` ：

```json
{
  "node_modules/body-parser": {
    "version": "2.2.2",
    "resolved": "https://registry.npmjs.org/body-parser/-/body-parser-2.2.2.tgz",
    "integrity": "sha512-oP5VkATKlNwcgvxi0vM0p/D3n2C3EReYVX+DNYs5TjZFn/oQt2j+4sVJtSMr18pdRr8wjTcBl6LoV+FUwzPmNA=="
  }
}
```

當我把 `node_modules` 全部刪掉之後，跑 `npm install` ，就必定會下載到 `2.2.2` 版本，而且下載完會去驗那個 integrity，證明檔案沒有被動過，若是有被動過會導致 hash 不同，就會報錯失敗。

若是沒有這個 `package-lock.json` ，那我跑 `npm install` 的時候就會重新解析一次依賴，若是當時最新的版本是 `2.2.3` ，就會安裝到 `2.2.3` 。

因此呢，當你產生 lockfile 以後，若是這批套件沒問題，只要沒有升級或是新增套件，「基本上」就能保證你每次下載都是安全的，因為安全套件的版本跟 hash 都被記起來了。

所以 lockfile 請務必放到版本控制裡面，這很重要。

### 第三招：先掃描再下載

既然電腦有防毒軟體，那自然也有資安公司推出針對 npm 的防護。

目前最知名的就屬 Socket 推出的 [Socket Firewall](https://docs.socket.dev/docs/socket-firewall-overview) ，簡稱 sfw，有分免費版跟付費企業版。

前面我有提過這些資安公司能夠快速地偵測到哪些套件有問題，甚至比 npm 官方還要早一步。例如說之前講過惡意版本發布後 1 小時就被偵測到，但是 3 小時後才下架，中間還是有 2 個小時空窗期。

當你使用 sfw 來下載套件時，會先去 Socket 內部的資料庫查這個套件有沒有問題，有的話直接攔下來。所以在 npm 官方還沒下架前，你也不會下載到惡意套件。

對於那些還沒確定安不安全的套件，也會在 server 掃描，掃過一遍確認沒問題才下載（免費版只會提醒，付費版可以設置直接攔下來）。

其實 Socket 的 sfw 也不只 npm 系能用，Python 的 pip 與 uv 或是 Rust 的 cargo 也可以，其他就要付費版才有了。

寫到這裡，我們該做的看起來都做了，已經開了 cooldown，只會下載發布 3 天以上的套件，也忽略了那些 scripts，就算真的安裝到也不會立刻執行惡意程式碼，應該很安全了，對吧？

這麼想的話，你就掉以輕心了，魔鬼永遠藏在細節裡。

## 細節中的魔鬼：那些 registry 以外的套件

npm 是一個 registry，而你可以透過其他方式自己架一個 registry，如 [Verdaccio](https://www.verdaccio.org/) 就是一個可以自己架起來的 registry，可以把 private 套件放在上面。

或是 [jsr](https://jsr.io/) 好了，是另一個開源的 registry，只要在 `.npmrc` 中加入 `@jsr:registry=https://npm.jsr.io` 就可以使用。

但既然都是 npm 支援的 registry，就表示背後一定是遵守同一套協議。

舉例來說，當你在 npm 安裝 [zod](https://www.npmjs.com/package/zod) 這個套件時，npm 會先去抓 `https://registry.npmjs.com/zod` ，response 會是一個描述它的 JSON，包含了最新的穩定版以及每個版本的訊息等等，而 `time` 裡面則是記錄每個版本的發版時間，min release age 就是看這個時間來決定的：

[![registry json](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f4668cac8b0886fa.png)](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p5.png)

[registry json](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p5.png)

而每個版本的細節則在 versions 裡面，以最新版 `4.4.3` 為例，裡面寫的 `integrity` 就是拿來驗證套件有沒有被改的 hash，而 tarball 的 `https://registry.npmjs.org/zod/-/zod-4.4.3.tgz` 就是最後會被下載的套件：

[![registry tar](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5d9a1f06509890b8.png)](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p6.png)

[registry tar](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p6.png)

若是你利用上面提到的方法，讓 npm 解析套件時跑去 jsr 的 URL，當你安裝 `@zod/zod` 時，解析到的 JSON URL 會是 `https://npm.jsr.io/@jsr/zod__zod` ：

[![jsr registry](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1fe84ac2c47e5a9c.png)](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p7.png)

[jsr registry](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p7.png)

雖然少了不少東西，但一樣有 time 有 versions， `4.4.3` 裡面一樣有 integrity 有 tarball：

[![jsr tar url](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/515a502a77176a8e.png)](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p8.png)

[jsr tar url](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p8.png)

上面提到的這幾個方法，你還是從 registry 安裝套件，只是 registry 的 URL 不同而已。有點像是你可以把專案放到 GitHub、GitLab 或是 Bitbucket，但本質上都是 git，格式都一樣，只是你 URL 要換。

但除了從 registry 安裝套件以外，其實還有兩種方式：

1.  URL 直接下載
2.  git

第一種的話，以 n8n 的元件 [@n8n/instance-ai](https://www.npmjs.com/package/@n8n/instance-ai?activeTab=code) 為例，它的 dependencies 中大部分都很正常，如 `"csv-parse": "6.2.1"` 或是 `"nanoid": "3.3.8"` ，前面名稱後面版本號，但仔細看會發現一個例外：

```json
{
  "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz"
}
```

在安裝 `xlsx` 這個套件時，後面直接寫了 URL，而不是版本。也就是說，這個套件會直接從這個 URL 下載，而非 npm registry。

為什麼要這樣呢？

似乎是因為 SheetJS 團隊與 npm 有一些 [糾紛](https://www.bleepingcomputer.com/news/software/npm-package-with-14m-weekly-downloads-ditches-npmjscom-for-own-cdn/) ，所以直接搬家，導致目前 npm 上的 xlsx 已經是幾年前的舊版本，最新的在他們自己架的 [gitea](https://git.sheetjs.com/sheetjs/sheetjs) ，而 [官方文件](https://docs.sheetjs.com/docs/getting-started/installation/nodejs) 也推薦你在安裝的時候直接裝 URL：

```bash
npm i --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

這個的壞處是什麼呢？壞處就是除了 npm，你又多了一個地方需要擔心。若是這個 URL 被駭，內容被換成惡意版本，你就直接下載到了。而且 min release age 不起作用，因為不是 registry，所以根本不知道發布時間是什麼時候。

所以這種第三方的 tarball URL 能避就避，盡量不要用到是最好的。

而另外一種 git URL 應該有些公司內部的專案會用，當公司沒有內部的 private registry 的時候，就可能會用 git URL 來下載套件。

例如說這個拿來抓系統字體列表的套件 [system-font-families](https://www.npmjs.com/package/system-font-families) ，它的依賴是：

```json
{
  "dependencies": {
    "babel-polyfill": "^6.23.0",
    "file-type": "^10.11.0",
    "read-chunk": "^3.2.0",
    "ttfinfo": "https://github.com/rBurgett/ttfinfo.git"
  }
}
```

這個 `ttfinfo` 直接就寫 git URL，當我們用 `npm install system-font-families` 安裝這個套件後，會在 lockfile 中看到：

```json
{
  "node_modules/ttfinfo": {
    "version": "0.2.0",
    "resolved": "git+ssh://git@github.com/rBurgett/ttfinfo.git#f00e43e2a6d4c8a12a677df20b7804492d50863c",
    "license": "MIT"
  }
}
```

`ttfinfo` 最後被解析出來的地方是個 git URL，而後面 pin 了目前最新的 commit `f00e43e2a6d4c8a12a677df20b7804492d50863c` 。當其他人用相同的 lockfile 安裝時，就會安裝到相同版本。

但問題是，最原先的 `system-font-families` 其實並沒有指定版本，所以若是沒有 lockfile，你每次都會裝到最新的 `ttfinfo` ，而且 min release age 同樣不起作用。

更重要的是，資安公司 [koi](https://www.koi.ai/blog/packagegate-6-zero-days-in-js-package-managers-but-npm-wont-act) 在去年 11 月時回報過一個漏洞給 npm，在安裝 git 的依賴時，npm 會把 git repo clone 下來，然後在 repo 中再跑一次 `npm install` 。

而 `.npmrc` 中有一個設定叫做 [git](https://docs.npmjs.com/cli/v11/using-npm/config#git) ，你可以指定要用什麼 command 來跑 git 的指令。因此呢，某個惡意的 git 套件只要新增一個 `.npmrc` ，內容是：

```bash
git=./pwn.sh
```

然後再新增一個 git 的子依賴，當你安裝這套件時，系統就會執行到 `pwn.sh` ，繞過了原本 `ignore-scripts` 的限制。你以為 `ignore-scripts` 可以阻止任何腳本的執行，但其實沒有。

而 npm 當時雖然說這個是 intentional design，不視為是漏洞，但後來其實還是有做出一些改動（等等會提到）。

## 阻止 git 與 direct URL

儘管我們又檔了 script 又加了 cooldown，但若套件是從 git 或是 direct URL 下載，又會碰到其他的問題。因此，最好的方式就是乾脆阻止這些來源的套件，一率只能從 registry 下載，這樣攻擊面就被局限住了。

pnpm 從 v11 開始，就把 [blockExoticSubdeps](https://pnpm.io/settings#blockexoticsubdeps) 這個參數預設成 true，這個 `Exotic` 指的是 git 以及 direct URL，而 `Subdeps` 指的是「子依賴」。

換句話說，如果你安裝的套件本身是 `Exotic` ，那 pnpm 是不會擋的。例如說你直接安裝 xlsx，可以裝起來。但若是你安裝某個套件 A，而套件 A 需要安裝 xlsx，這時就裝不起來。

畢竟第一層的依賴都是使用者親手裝的，應該要知道自己在幹嘛以及風險，但這些子依賴很多人都不知道到底有什麼，所以就預設封掉了。

我簡單示範給你看，若是執行 `pnpm i n8n` ，會看到底下的錯誤：

[![安裝 n8n 時的錯誤](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1de31ca8c919a15f.png)](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p9.png)

[安裝 n8n 時的錯誤](https://blog.huli.tw/img/dive-into-npm-supply-chain-attack/p9.png)

明確寫著 n8n 的子依賴 `@n8n/instance-ai@1.6.2` 又依賴了 xlsx，但因為 `blockExoticSubdeps` 的關係所以被擋掉了。

而 npm 也在 `v11.10.0` 以後多出了 [allow-git](https://docs.npmjs.com/cli/v11/using-npm/config#allow-git) 還有 [allow-remote](https://docs.npmjs.com/cli/v11/using-npm/config#allow-git) 這兩個參數，可以設定成 `none` 、 `root` 或是 `all` 。

目前預設的是 `all` ，跟之前的行為一樣，git 跟 direct URL 都不擋。若是兩個都設定成 `root` ，那就會跟 pnpm 一樣，只允許第一層的套件是 URL 或是 git。

根據 2 月份時 npm 的 [公告](https://github.blog/changelog/2026-02-18-npm-bulk-trusted-publishing-config-and-script-security-now-generally-available/) ，從下一個大版本 v12 開始， `allow-git` 預設會變成 `none` ，全部都不給裝了。

而這份公告甚至還有提到前面 koi 回報的行為：

> Git dependencies—direct or transitive—can include.npmrc files that override the git executable path. This enables arbitrary code execution during install even when using –ignore-scripts. The new –allow-git flag gives you explicit control over this behavior.

一開始說這不是漏洞所以把報告關掉，但後來某種層面上看來還是修了，畢竟下個大版本就不允許 git 了，可能是不覺得這個行為有嚴重到要立刻當成漏洞來修吧。

## 誠心推薦 pnpm 以及我的 npm 設定

在研究這些 JavaScript 生態系的供應鏈攻擊手法時，我可以明確感覺到 pnpm 是做得比較用心的，而且預設就幫你把該擋的都擋掉了。

舉例來說，你可以直接找到一個 [Mitigating supply chain attacks](https://pnpm.io/supply-chain-security#block-risky-postinstall-scripts) 的文件，裡面把目前的攻擊面以及防禦方式講得很清楚，其實就是我們前面提到的那幾個：

1.  阻止 postinstall scripts
2.  阻止 exotic transitive dependencies
3.  延遲更新套件
4.  使用 lockfile

還有一個前面沒提到的 `trustPolicy` ，這個主要是跟發布有關，如果發布的「可信度」下降了就先擋掉之類的，主要與發布時用的方式以及 provenance 有關，我還沒時間研究就先不多談了。

而上面提到的這些防禦方式，從 pnpm v11 開始就自動幫你做完了：

1.  `postinstall` 等 scripts 預設關閉（這個更早，v10 就有）
2.  `minimumReleaseAge` 預設 1 天
3.  `blockExoticSubdeps` 預設打開

而 npm 的話則是要自己設定，目前我自己的設定是：

```ini
# 不執行 postinstall 等腳本
ignore-scripts=true

# 不下載 3 天內發布的套件
min-release-age=3

# 關閉 git 下載
allow-git=none

# 關閉 direct URL 下載
allow-remote=none
```

有需要的話可以自己再調整，例如說需要用到 git 就 `allow-git=root` 之類的。

## 總結

在一般使用電腦時，大家都會知道不要隨便下載與安裝來路不明的軟體，但與此同時，有些人卻又隨意裝著 VScode 的擴充套件、GitHub 上的開源項目或是開發時會用到的套件，忽略了這些也都有可能出問題。

開發者一向是價值比較高的目標，有許多開發者電腦上都直接放著各種雲端服務的 key 甚至有可能是 production 的，而在 CI 上安裝套件時也存在風險，CI 中通常有著更多高價值的 token 可以偷取。有許多攻擊都是先駭入某一個套件，接著藉由這個套件駭入更多套件以及公司，不斷把影響範圍擴大。

最近的供應鏈攻擊真的很多，每一兩周就會看到一起，而且規模很大。再者，以前的供應鏈攻擊可能是入侵某一個小套件，但最近的攻擊是直接把大的那個給駭掉（如 axios 與 TanStack，都是直接駭入大的），並不是從那些很小的子套件下手。

建議大家把該設定的東西都設定好，如果用 npm 就是：

```ini
# 不執行 postinstall 等腳本
ignore-scripts=true

# 不下載 3 天內發布的套件
min-release-age=3

# 關閉 git 下載
allow-git=none

# 關閉 direct URL 下載
allow-remote=none
```

用 pnpm 就是更新到最新版本，就能享有預設的保護。

若是想要更安全，可以用之前提過的 [sfw](https://socket.dev/features/firewall) ，多加一層防護。

雖然說風險沒辦法 100% 避免，但至少我們可以盡量降低它。想要再安全的就是裝套件或甚至開發時一律在 [dev container](https://code.visualstudio.com/docs/devcontainers/containers) 裡面做，能夠從更低的 level 去控制該環境可以存取到的東西，是一種 sandbox 的概念，但這個成本就比較高就是了。

總之呢，我覺得把 npm 設定好是一定要的，或是改用 pnpm。
