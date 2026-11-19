---
title: GMO Flatt Security Blog
source: https://blog.flatt.tech/entry/agent_framework_compromise?utm_source=feed
source_host: blog.flatt.tech
clip_date: 2026-11-19T13:29:17+08:00
trace_id: 4f7de3e3-f658-4ede-9c86-ceb6a6ae4adf
content_hash: 8730879d4d0e364d8dfc6f30c290aef0d73766f126f91411affc8e501ea56d80
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
notion_page_id: 41d75244-d011-81ea-a80e-ed03e5891e22
ioc:
  cves: []
  cwes: []
  hashes:
    - 21f28e8517a10ffe431f8d68f5875c85eca4001ae6d118322b0a41873998eb5e
    - 325e7e9f0ec94e41ad1a1b7a3f18a6b8b5bffece2e2b97b8d3369eb967452f93
    - 39fa329f2a93f734b0bb8f5adb203ea3331d1ae479832a5015a54cb17aabd663
    - 3d20a8bc91351a9a16b6db243b848ceca0206b7a8623b02d2af553a9c9f7e0a9
    - 54d885b7d7161c9ed96489c66364c4bfbf635929166843bba10d97d46b5a2e1f
    - d27fa34414e6201d5e03e559ef634f020057554d7b3f4898dd5d7cd3e989e110
  domains:
    - webhook.site
  tools: []
  techniques: []
---

2026年11月18日、Microsoft公式Pythonフレームワークである `agent-framework` のPyPI パッケージ 1.26.1、1.26.2 に、悪性コードが注入されました。

注入された悪性コードは Infostealer 型マルウェアです。 このマルウェアはPython インタプリタ起動時に自動実行され、環境変数・認証情報ファイル・他プロセスの環境変数・OIDC/マネージド ID トークン等を窃取し、 `webhook[.]site` エンドポイントに送出します。

本記事は、弊社が Takumi Guard の解析基盤をベースに観測＆分析した情報を踏まえ、 日本のコミュニティに向けて、影響と対策を中心に整理するものです。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7922faaa51f6ddf2.png)

## TL;DR — 対応指針

-   `agent-framework==1.26.1` または `agent-framework==1.26.2` を `pip install` した環境では、マルウェア感染の可能性があります。これらのバージョンは `.pth` スタートアップフックにより、悪性コードがパッケージの `import` なしに Python インタプリタ起動時に自動実行されます。安全なバージョンは `1.26.0` です。
-   本検体は infostealer で、環境変数・認証情報ファイル（Azure CLI, pip, npm, Docker, Git, Hugging Face 等）・他プロセスの環境変数・Azure/GitHub Actions/Azure DevOps の OIDC/マネージド ID トークンを窃取し、zlib 圧縮 + base64 エンコードの HTTPS POST で `webhook[.]site` エンドポイントに送出します。
-   影響を受けた可能性がある場合は、影響を受けた環境内で利用されたAzure CLI トークン、pip/npm/NuGet 認証情報、Docker レジストリ認証情報、Git 認証情報、Hugging Face トークン、Azure DevOps エージェント認証情報、GitHub Actions OIDC トークン、Azure マネージド ID で発行されたトークン、および環境変数に含まれるすべてのシークレットを **即座にローテーション** してください。

## はじめに

本記事の目的は事態の把握と対応の促進であり、違法行為への加担・助長を意図するものではありません。ペイロードの動作は手法の理解に必要な範囲で要約して記載しています。記述の一部には不正確な情報が含まれている可能性があります。速報性を優先していますので、ご了承ください。

## 侵害の仕組み

### Stage 1 —.pth スタートアップフックによる自動実行

正常版 `1.26.0` と比較して、1.26.1 では以下の 3 ファイルが追加・変更されました。

-   `agent_framework_meta.pth` （新規追加）
-   `agent_framework_meta/_telemetry.py` （新規追加）
-   `agent_framework_meta/__init__.py` （末尾に 8 行追加）

`.pth` ファイルの内容は下記の 1 行です。

```
import agent_framework_meta
```

これにより、 `agent-framework` を明示的に `import` せずとも、 `site-packages` を処理する **Python インタプリタの起動時にペイロードが実行されます**。 `pytest`, `pip`, リンター等の Python ツールの実行でも発火します。

`__init__.py` に追加された行

```python
# Lightweight runtime diagnostics hook.
try:
    from . import _telemetry as _telemetry
    _telemetry._start()
except Exception:
    pass
```

1.26.2 ではファイル名が `af_runtime_diag.pth` / `af_runtime_diag.py` に変更され、 `__init__.py` は正常版の内容に復元されています。

### Stage 2 — バックグラウンド分離

`_start()` は `_AF_TEL` 環境変数で再帰実行を防止し、 `os.fork()` で子プロセスを生成、 `os.setsid()` でセッションリーダーに分離します。子プロセスは親プロセスの終了後も動作を継続できます。 `fork` が不可能な場合はデーモンスレッドにフォールバックします。

```python
def _start():
    if os.environ.get("_AF_TEL"):
        return
    os.environ["_AF_TEL"] = "1"
    try:
        if hasattr(os, "fork"):
            pid = os.fork()
            if pid == 0:
                try:
                    os.setsid()
                except Exception:
                    pass
                _run()
                os._exit(0)
            return
    except Exception:
        pass
```

### Stage 3 — 情報窃取

#### ホストコンテキストと環境変数の収集

マルウェアはまずホストコンテキスト（hostname, username, cwd, argv, timestamp）を収集し、続いて環境変数名に特定の keyword を含むものをすべて収集します。keyword には `TOKEN`, `SECRET`, `PASSWORD`, `KEY`, `AZURE`, `AWS`, `GITHUB`, `OPENAI`, `FOUNDRY`, `PIP`, `NPM`, `NUGET`, `CI_`, `IDENTITY`, `MSI` 等が含まれ、開発、AI、パッケージ公開、クラウド、ビルド認証情報が標的にされています。

#### 認証情報ファイルの窃取

下記のファイルが窃取されます。

| カテゴリ | 主な対象 |
| --- | --- |
| Azure CLI | `~/.azure/*.json` |
| pip / npm / netrc | `pip.conf`, `.npmrc`, `.netrc` |
| Git | `.git-credentials` |
| Docker | `.docker/config.json` |
| Hugging Face | `.cache/huggingface/token` |
| Foundry | `.foundry/*`, `.config/foundry/*` |
| Azure DevOps Agent | `_work/*/.credentials` |
| App secrets | `.env`, `*.json` in `/app/` 等のアプリケーションディレクトリ |
| GitHub Actions runner | `/home/runner/work/_temp/*` （1.26.2 のみ） |

#### プロセス環境変数のスクレイピング

最大 300 プロセスの環境変数を読み取り、 `TOKEN`, `SECRET`, `PASSWORD` 等を含むエントリを収集します。共有ランナーやプロセス可視性の高い環境では、他のプロセスのシークレットも窃取される可能性があります。

#### トークンの取得

本検体はディスク上や環境変数のクレデンシャルを窃取するだけでなく、積極的にトークンを要求します。

両バージョンで、 `SYSTEM_OIDCREQUESTURI` と `SYSTEM_ACCESSTOKEN` が存在する場合、Azure DevOps OIDC エンドポイントに POST リクエストを送信し、 `api://AzureADTokenExchange` スコープのトークンを要求します。また、 `IDENTITY_ENDPOINT` / `MSI_ENDPOINT` （App Service スタイル）または IMDS エンドポイントから、12 リソースのトークンを要求します。

-   Azure Management, AI, ML, Cognitive Services, Storage
-   Key Vault
-   Search, Graph, Container Registry
-   Azure DevOps リソース GUID
-   `api://AzureADTokenExchange`

さらに、IMDS インスタンスメタデータ（subscription, resource group, VM 情報）も取得します。

また、1.26.2では `ACTIONS_ID_TOKEN_REQUEST_URL` と対応するランタイムトークンを使用し、 `api://AzureADTokenExchange` と `https://management.azure.com/` の 2 つの audience で JWT を要求します。

### 難読化・検知回避

送出先 URL は base64 エンコードで格納（ `_ENC` 変数）されており、悪性コードの実行時、すべての例外は `try/except Exception: pass` で無視され、エラーやログ出力は発生しません。

### 送出

収集データは JSON にシリアライズされた後圧縮・base64 エンコードされ、HTTPS POST で外部エンドポイントへ送信されます。

送出先は `https://webhook[.]site/d381fd80-ec62-42ad-8f5c-d1b15103c9bb` です。1 回の POST で全データを送出し、リトライはありません。

## 対応指針

### 影響確認

以下を **Python を使わないツール** で確認してください（Python を起動すると `.pth` フックが再発火する恐れがあります）。

1.  `site-packages` ディレクトリにて以下のファイルの有無
    -   `agent_framework_meta.pth`, `agent_framework_meta/_telemetry.py` （1.26.1）
    -   `af_runtime_diag.pth`, `af_runtime_diag.py` （1.26.2）
2.  ネットワークログで `webhook[.]site` への POST（UUID パス `d381fd80-ec62-42ad-8f5c-d1b15103c9bb` ）リクエストの有無

上記が当てはまる場合、マルウェア感染の可能性があります。

### 除去

影響を受けた環境で `python`, `pip`, `pytest` 等の Python コマンドを実行しないでください。`.pth` フックにより、悪性コードが再度実行される恐れがあります。

もし、影響を受けた場合、バックアップ・証跡等を確保した上で、該当する環境やイメージを既知のクリーンなベースから再構築することを推奨します。

手動で除去する場合、影響を受けた環境をネットワークから遮断した上で、以下の手順をすべてシェルツールのみで実行してください。

コレクタプロセスの停止: `fork()` + `setsid()` で分離されたコレクタは、親プロセスが終了しても動作し続ける可能性があります。

```bash 
# _AF_TEL=1 環境変数マーカーを持つプロセスを検索・終了 
ps auxe 2>/dev/null | grep "_AF_TEL=1" | grep -v grep 
pkill -f "af_runtime_diag|_telemetry" 
```

悪性ファイルの除去:

```bash 
# site-packages パスを$SITEへ設定した上で
 
# 1.26.1 のファイル除去
rm -f "$SITE/agent_framework_meta.pth" 
rm -f "$SITE/agent_framework_meta/_telemetry.py" 
rm -rf "$SITE/agent_framework_meta/__pycache__" 
rm -rf "$SITE/agent_framework-1.26.1.dist-info" 

# 1.26.2 のファイル除去 
rm -f "$SITE/af_runtime_diag.pth" 
rm -f "$SITE/af_runtime_diag.py" 
rm -f "$SITE/__pycache__/af_runtime_diag"*.pyc 
rm -rf "$SITE/agent_framework-1.26.2.dist-info" 
```

### クレデンシャルのローテーション

| 対象  | ローテーション手順 |
| --- | --- |
| Azure CLI トークン | `az account clear` → `az login` で再認証 |
| pip 認証情報 | `pip.conf` のクレデンシャルを無効化・再生成 |
| npm トークン | `npm token revoke` → 再生成 |
| Git 認証情報 | `.git-credentials` のトークンをすべて無効化・再生成 |
| Docker レジストリ | `docker logout` → `docker login` で再認証 |
| Hugging Face トークン | huggingface.co でトークンを revoke → 再生成 |
| Azure DevOps Agent | `.credentials` のトークンを無効化、エージェント再登録 |
| GitHub Actions OIDC | federated trust の確認・制限。発行済みトークンの有効期間に注意 |
| Azure マネージド ID | ロール割り当ての見直し、リソースアクセスログの監査 |
| 環境変数・`.env` のシークレット | TOKEN, SECRET, PASSWORD, KEY 等を含むすべての値をローテーション |

## 推奨：自衛手段の整備

### 悪意のある依存をブロック（Takumi Guard）

弊社（GMO Flatt Security）は [セキュアなレジストリプロキシ Takumi Guard の PyPI エンドポイント](https://flatt.tech/takumi/features/guard) を提供しています。 Takumi Guard は PyPI（レジストリ）との間に位置するセキュリティプロキシで、悪意あるパッケージがブロックされます。 弊社で全ての新規パッケージを検査し、ブロックリストを構築しています。 npm / RubyGems / Packagist / Go Modules にも対応済です。導入は registry URL の変更のみで完了し、無料で利用可能です。

```bash
pip config set global.index-url https://pypi.flatt.tech/simple/
```

仮にある時点でパッケージがマルウェアと判定できずブロックできなかった場合も、後日の通知を行う仕組みもあります（本機能も無料です）。 通知のためにはメールアドレス登録が必要となりますので、下記ページよりご登録ください。 [flatt.tech](https://flatt.tech/takumi/features/guard) 複数端末の一括セットアップや管理者への通知など、法人向け管理機能（有償）も提供しています。 ご興味のある方は [お問い合わせ](https://flatt.tech/contact) ください。

## IoCs

### ハッシュ（SHA-256）

| ハッシュ | 対象  |
| --- | --- |
| `d27fa34414e6201d5e03e559ef634f020057554d7b3f4898dd5d7cd3e989e110` | `agent_framework-1.26.1-py3-none-any.whl` |
| `3d20a8bc91351a9a16b6db243b848ceca0206b7a8623b02d2af553a9c9f7e0a9` | `agent_framework-1.26.2-py3-none-any.whl` |
| `39fa329f2a93f734b0bb8f5adb203ea3331d1ae479832a5015a54cb17aabd663` | `agent_framework_meta/_telemetry.py` （1.26.1） |
| `21f28e8517a10ffe431f8d68f5875c85eca4001ae6d118322b0a41873998eb5e` | `agent_framework_meta.pth` （1.26.1） |
| `54d885b7d7161c9ed96489c66364c4bfbf635929166843bba10d97d46b5a2e1f` | `af_runtime_diag.py` （1.26.2） |
| `325e7e9f0ec94e41ad1a1b7a3f18a6b8b5bffece2e2b97b8d3369eb967452f93` | `af_runtime_diag.pth` （1.26.2） |

### ネットワーク

| タイプ | 値   | 説明  |
| --- | --- | --- |
| URL | `https://webhook[.]site/d381fd80-ec62-42ad-8f5c-d1b15103c9bb` | 窃取データの送出先 |
| ドメイン | `webhook[.]site` | 送出先ドメイン |
| IP  | `178.63.67.106`, `178.63.67.153` | `webhook[.]site` の A レコード（解析時） |
