---
title: Best Pwnable Challenges 2025 - CTFするぞ
source: https://ptr-yudai.hatenablog.com/entry/2025/12/31/135605
source_host: ptr-yudai.hatenablog.com
clip_date: 2026-09-24T10:41:04+08:00
trace_id: 67fd27e5-4079-42d2-93d2-500352b94dc0
content_hash: aabc9545d78c4ba595151400803e05424e90a242bea40788c33e8b6901f61efe
status: synced
tags:
  - CTF
  - 漏洞分析
series: null
feed_source: ptr-yudai·内核利用
ai_summary: 作者从2025年参加的CTF中按主观标准评选出五个最具代表性的pwn题，并给出每题的核心技巧与获奖理由。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3e575244-d011-81d6-b70b-e986120ddf99
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 作者从2025年参加的CTF中按主观标准评选出五个最具代表性的pwn题，并给出每题的核心技巧与获奖理由。
> 
> - **创造赏 Stack Impromptu：** BlackHat MEA决赛题。线程服务器中缓冲区溢出可覆写 fd，配合对等待中的 socket 发 RST 让 read 返回 -1，从而把 fd 换成新连接、使未初始化缓冲区泄漏降落到攻击者 socket 上。
> - **漏洞赏 decore：** KalmarCTF 2025。程序中注册到 core_pattern 的解析器存在 ELF symtab/strtab 越界读，需构造"被解析即触发漏洞"的 core dump，并设法把 flag 映射进内存。
> - **教育赏 new_era：** TsukuCTF 2025，Linux内核堆上的 off-by-null；同场 xcache（专用缓存 UAF）适合作为 cross-cache attack 教材。
> - **风水赏 old school：** snakeCTF 2025 Quals。tcache 关闭且 free/realloc 必然造成连续 double free，利用 malloc_consolidate 把 fastbin 并入 unsortedbin 才能解出。
> - **其它良题：** Stack Rhapsody、piano（异常时栈处理引出 UAF）、LPE（Win11 安全机制入门）、RandomJS（JS UAF入门）、pryspace（严格约束下造巨型 unsortedbin）。

## はじめに

今年参加したCTFの中から主観で面白かった問題を取り上げます。毎週参加してるわけではないので他にも面白い問題があったと思いますが、CTFtimeでtop 10に入るほどには参加していたらしいので今年は記事にしてみました。もっと面白い問題を知っているぞという方はぜひ教えてください。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a75d32a9f1495784.jpg)

## 受賞作品一覧

## Stack Impromptu - 創造力賞

創造力賞（Creativity Award）：解法がもっとも独創的だった・美しかった問題に与えられる賞

### 作問者

Dronexさん

### 解説と概要

はじめに紹介するのはBlackHat MEAの決勝で出題した [Stack Impromptu](https://bitbucket.org/ptr-yudai/writeups-2025/src/master/BlackHatMEA_Finals/Stack_Impromptu.zip) という問題です。「出題した」というように私が作問者になっているので紹介するか迷いましたが、90%くらいはDronexさんが作った問題なので対象にしました。

スレッド型サーバで次のような自明な [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) があるという問題です。

```c
void fatal(const char *msg) {
  perror(msg);
  pthread_exit(NULL);
}

int server_read(int& fd) {
  size_t size;
  char buf[0x40];

  memset(buf, 0, sizeof(buf));
  if (read(fd, &size, sizeof(size)) != sizeof(size)
      || size > 0x100
      || read(fd, buf, size) < size)
    goto err;

  write(fd, buf, size);
  return 0;

err:
  close(fd);
  fatal("Could not receive data (read)");
  return 1;
}

void* server_main(void* arg) {
  int fd = (int)((intptr_t)arg);
  while (server_read(fd) == 0);
  return NULL;
}
```

セキュリティ機構がすべてかかっているため、stack canaryやlibcのアドレスをリークする必要があります。リークするためには `write` を適切なサイズで呼ぶ必要がありますが、そのためには `read` が失敗する（-1を返す）必要があります。

この問題では [バッファオーバーフロー](https://d.hatena.ne.jp/keyword/%A5%D0%A5%C3%A5%D5%A5%A1%A5%AA%A1%BC%A5%D0%A1%BC%A5%D5%A5%ED%A1%BC) によってfdが書き換えられるため、 `pthread_exit` が死なないように工夫すると良い感じに任意のfdをcloseできるprimitiveが手に入ります。ここでさらに、 `read` で待機中のソケットにRSTパケットを送ると、こちらから接続を切ることなく相手の `read` を失敗させることができます。これらを組み合わせて、サーバ側のfdを差し替えることで別のソケットが未初期化バッファのリークを受け取ることができるという、ソケットの知識をフル活用したパズルになっています。

[解法スクリプト](https://gist.githubusercontent.com/ptr-yudai/ebf09b77256853fdfc3b2da5335b5ff2/raw/e98a2b5301472cdc9432d1fd330301e0034d7ce3/stack_impromptu.py)

### コメント

間違えて解けない状態の問題をDronexに渡したら、1日かけて解いてきたので驚きました。 fdが差し替わることで、新しく開いたソケットに突然プログラム上ありえない謎のデータが降ってくるリーク方法は過去に見たことがなく美しかったです。

## decore - 脆弱性賞

[脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) 賞（ [Vulnerability](https://d.hatena.ne.jp/keyword/Vulnerability) Award）： [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) がもっとも巧妙かつ自然に隠されていた問題に与えられる賞

### 作問者

不明

### 解説と概要

decoreはKalmarCTF 2025で出題された問題です。脆弱なプログラムが `core_pattern` に登録されているので、クラッシュすると「解析されると [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) を発火するコアダンプ」を生成するようなプログラムを作る必要があります。 [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) はシンボル情報のパース時にELFのsymtab/strtabが不正だと範囲外参照を起こしてしまうというバグです。範囲外参照でフラグを表示するためにはフラグがメモリにマップされている必要があるので、そこをなんとかするという問題です。 この問題に関してはwriteupを公開しているので詳しくはそちらをご覧ください。

[ptr-yudai.hatenablog.com](https://ptr-yudai.hatenablog.com/entry/2025/03/10/123050#Pwn-427pt-decore)

### コメント

`core_pattern` に脆弱なプログラムが登録されていて権限昇格に使うという問題設定がそもそも斬新でした。プログラム側の [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) と、 [Linux](https://d.hatena.ne.jp/keyword/Linux) 側の回避しようのない問題を組み合わせて初めて解けるのも面白かったです。 [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) も実際にありそうな感じで良かったですが、欲を言えば [ソースコード](https://d.hatena.ne.jp/keyword/%A5%BD%A1%BC%A5%B9%A5%B3%A1%BC%A5%C9) も配布してほしかったです。

## new_era - 教育賞

教育賞（Educational Award）：もっとも教育的な問題に与えられる賞

### 作問者

r1ruさん

### 解説と概要

OSINTで有名なTsukuCTFですが、今年は [r1ruさん](https://r1ru.github.io/) がpwnを出題されていました。この問題は、 [Linux](https://d.hatena.ne.jp/keyword/Linux) kernelのヒープでoff-by-nullが起きるというシンプルな [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) です。 こちらは作問者writeupが公開されているので、詳しくはそちらをご覧ください。

[r1ru.github.io](https://r1ru.github.io/posts/7/)

### コメント

ここ数年、 [Linux](https://d.hatena.ne.jp/keyword/Linux) kernel exploitは半分以上がdata-oriented attackになっており、 `pipe_buffer` やページテーブルを使う問題を多く見るようになったため、その点でも教育的だと思いました。 同CTFのxcacheという問題も、 [Linux](https://d.hatena.ne.jp/keyword/Linux) kernelの専用キャッシュでUAFが起こるという近年よく見るパターンを簡略化した問題設定のため、cross-cache attackの教材としておすすめです。

## old school - 風水賞

風水賞（Feng Shui Award）：もっとも面倒な [\*1](#f-1ba4fcd1 "ヒープ問においては褒め言葉？") [glibc](https://d.hatena.ne.jp/keyword/glibc) ヒープ問題に与えられる賞

### 作問者

c0mm4nd\_さん

### 解説と概要

最後に紹介するのはsnakeCTF 2025 Qualsのold schoolです。 この問題は、tcacheが無効化された環境で、freeとreallocでdouble freeが発生するという状況をなんとかするヒープ問です。fastbinのdouble freeといえば、2つのチャンクを交互にfreeして検知を回避するのが一般的ですが、この問題は2連続でfreeされることが確定しているため難しい問題です。topから取得できないがfastbinがあるときに `malloc_consoliadte` が走るという挙動を利用すると解けます。 公式writeupが公開されているので、詳しくはそちらをご覧ください。

[snakectf.org](https://snakectf.org/writeups/2025-quals/pwn/old-school)

### コメント

fastbinをunsortedbinに追い出したり、fastbinでFILE構造体を書き換えにいったり、いろいろ考えることがあって大変でした。ヒープで ~~苦しみ~~ 楽しみたい方にはおすすめです。 いままでありがとう、fastbin。

## その他の良問

惜しくも受賞を逃した問題たちです。

-   創造力賞
    -   Stack Rhapsody - BlackHat MEA CTF 2025 Finals（ [ソースコード](https://d.hatena.ne.jp/keyword/%A5%BD%A1%BC%A5%B9%A5%B3%A1%BC%A5%C9) がとてもシンプルで一見すると不可能ですが解ける面白い問題です。）
-   [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) 賞
    -   piano - HKCERT CTF 2025 Quals（例外発生時のスタックの扱いでコーナーケースが発生し、結果としてUse-after-Freeにつながるという、一見パッチから何が起こるかわかりにくい問題でした。）
-   教育賞
    -   LPE - CODEGATE CTF 2025 Finals（ [Windows](https://d.hatena.ne.jp/keyword/Windows) 11のセキュリティ機構入門として良いと思います。）
    -   RandomJS - ASIS CTF 2025 Quals（ [JavaScript](https://d.hatena.ne.jp/keyword/JavaScript) のUse-after-Free入門として良いです。）
-   風水賞
    -   pryspace - TSG CTF 2025 Quals（厳しい制約で巨大なunsortedbinを作るというア [イデア](https://d.hatena.ne.jp/keyword/%A5%A4%A5%C7%A5%A2) が斬新でした。）

[\*1](#fn-1ba4fcd1):ヒープ問においては褒め言葉？
