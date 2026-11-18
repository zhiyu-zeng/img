---
title: GMO Flatt Security Blog
source: https://blog.flatt.tech/entry/github_actions_widespread_supply_chain_attack?utm_source=feed
source_host: blog.flatt.tech
clip_date: 2026-11-18T13:13:27+08:00
trace_id: 2bb0ff3a-6dd5-451a-a272-ae948f0ba54a
content_hash: 69aaab19e23119579d8a4ff7212cb58d9d9c842277c5d5ef9f53cd14fcfba30a
status: synced
tags:
  - 供应链攻击
  - 恶意样本
series: null
feed_source: GMO Flatt Security
ai_summary: |-
  - **攻击链：** 攻击者先以 `docs: dependency audit notes` 为标题批量创建 PR（`wfx-docs` 分支，已确认波及 60,000+ 仓库），随后通过 `ci: refresh build cache`、`chore: add ci helper` 等标题的提交向仓库注入恶意 workflow，或篡改 `package.json` 的 `postinstall` 钩子执行恶意脚本。
  - **恶意载荷：** 这是一个 infostealer，运行时收集 Actions secrets/vars、`GITHUB_TOKEN`、全部环境变量、OIDC token、`/proc` 内存中的令牌，以及 AWS/Azure/GCP 凭证、npm/PyPI 等各类注册表凭证、AI 服务（OpenAI/Anthropic/Gemini 等）密钥、SSH/GPG 密钥和 `.env` 文件。
  - **云权限扩大：** 若 CI 环境持有云权限，恶意代码会尝试获取 AWS STS 临时凭证、创建 IAM access key、修改 role trust policy，为 Azure 添加 federated credential，或在 GCP 生成 service account token —— 需要同时检查云配置，而不仅仅是轮换密钥。
  - **数据回传：** 收集的数据会被打包为 `.tgz`，通过 HTTP POST 发送到 `18[.]143[.]168[.]96:8080/exfil` 和 `194[.]150[.]166[.]244:8080/exfil`，部分变体优先使用 Telegram Bot API 的 `sendDocument`，将 gzip 按 45 MiB 分块发送到聊天 ID `-1004340163187`。
  - **响应指导：** 如果仓库中出现上述 PR/commit/`chore/<8位随机字符串>` 分支，需立即在可信设备上使 GitHub/CI、云、注册表、AI API、SSH/GPG 等凭证失效并重新颁发，并审查 AWS role trust 与 Azure federated credential 的设置。
ai_summary_style: key-points:weak
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41c75244-d011-811f-ae4d-cf4574d2baad
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> - **攻击链：** 攻击者先以 `docs: dependency audit notes` 为标题批量创建 PR（`wfx-docs` 分支，已确认波及 60,000+ 仓库），随后通过 `ci: refresh build cache`、`chore: add ci helper` 等标题的提交向仓库注入恶意 workflow，或篡改 `package.json` 的 `postinstall` 钩子执行恶意脚本。
> - **恶意载荷：** 这是一个 infostealer，运行时收集 Actions secrets/vars、`GITHUB_TOKEN`、全部环境变量、OIDC token、`/proc` 内存中的令牌，以及 AWS/Azure/GCP 凭证、npm/PyPI 等各类注册表凭证、AI 服务（OpenAI/Anthropic/Gemini 等）密钥、SSH/GPG 密钥和 `.env` 文件。
> - **云权限扩大：** 若 CI 环境持有云权限，恶意代码会尝试获取 AWS STS 临时凭证、创建 IAM access key、修改 role trust policy，为 Azure 添加 federated credential，或在 GCP 生成 service account token —— 需要同时检查云配置，而不仅仅是轮换密钥。
> - **数据回传：** 收集的数据会被打包为 `.tgz`，通过 HTTP POST 发送到 `18[.]143[.]168[.]96:8080/exfil` 和 `194[.]150[.]166[.]244:8080/exfil`，部分变体优先使用 Telegram Bot API 的 `sendDocument`，将 gzip 按 45 MiB 分块发送到聊天 ID `-1004340163187`。
> - **响应指导：** 如果仓库中出现上述 PR/commit/`chore/<8位随机字符串>` 分支，需立即在可信设备上使 GitHub/CI、云、注册表、AI API、SSH/GPG 等凭证失效并重新颁发，并审查 AWS role trust 与 Azure federated credential 的设置。

2026年11月10日から12日にかけて、GitHub 上の多数のリポジトリに対して悪性コミットにより GitHub Actions のワークフローに悪性コードが注入される事例が発生しています。

挿入されたコードは、ワークフローや npm フックが実行されると、CI環境内のシークレットを収集し、C2サーバーへのHTTP通信または Telegram Bot API への送信を試みる **infostealer** マルウェアです。

本記事は、弊社が Takumi Guard の解析基盤をベースに観測＆分析した情報を踏まえ、日本のコミュニティに向けて、影響と対策を中心に整理するものです。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4a2be029478bfe06.png)

## TL;DR — 対応指針

-   GitHub リポジトリで下記のいずれかが観測されたものは、CI環境内にて悪性コードが実行された可能性があります
    -   `docs: dependency audit notes` と題された pull request が作成されている
    -   `ci: refresh build cache`, `ci: refresh build cache`, `chore: add dependency audit workflow`, `chore: add ci helper` のいずれかに題されたコミットが作成されている
    -   `chore/<8桁のランダム文字列>` 等のブランチが作成されている
-   **本攻撃のコードは CI・npm ソースで動く infostealer マルウェアです**。環境変数・認証ファイル・OIDC token 等を収集し、gzip で圧縮して HTTP 回収先または Telegram Bot API に送出する挙動が確認されています
-   悪性コードの実行が疑われる場合、該当環境にて使用されている GitHub / CI、AWS / GCP / Azure、レジストリ、AI API、SSH / GPG、DB 等の資格情報を **即座にローテーション** し、AWS role trust / Azure federated credential の変更も点検してください

## はじめに

本記事の目的は事態の把握と対応の促進であり、違法行為への加担・助長を意図するものではありません。ペイロードの動作は手法の理解に必要な範囲で要約して記載しています。記述の一部には不正確な情報が含まれている可能性があります。速報性を優先していますので、ご了承ください。

## 侵害の仕組み

### Stage 1 — 文書 PR の作成

多数のGitHubリポジトリに対して、 `docs: dependency audit notes` というタイトルのPRが `wfx-docs` というブランチで作成されています。このPR自体に悪性コードは混入していないものの、当該PRの作成に使用されたユーザーアカウントは侵害されたものが攻撃者により悪用されたものと見受けられます。

弊社が調査した段階では60,000件以上のリポジトリに対して当該PRが作成されていたことが確認されています。

### Stage 2 — ワークフロー挿入

PRが作成されたのち、下記の手口のいずれかにより、悪性シェルスクリプトが注入されます。

-   既存のワークフローファイルにてステップが追加されるか、悪性ワークフローが作成される
-   リポジトリ内の `package.json` を書き換え、 `postinstall` によりシェルスクリプトが実行される

これらは `ci: refresh build cache` 、 `chore: add ci helper` 、 `chore: add dependency audit workflow` いずれかのメッセージのコミットにより追加されています。

また、一部ワークフローへの変更・追加は `chore/<8桁のランダム文字列>` のブランチにて行われていることが確認されています。

### Stage 3 — CI 環境・ファイル・リポジトリから収集

Stage 2にて注入された悪性コードはInfostealer機能を持ちます。悪性コードが混入したGitHubワークフローは、CI環境内の secrets / vars の JSON をシェルに渡し、GitHub token と全環境変数を集めます。ファイル、公開または権限のあるリポジトリの履歴・artifact、取得可能な OIDC token も探索します。

一部影響を受けたリポジトリに対して注入された悪性コードの内容を解析し、確認された探査対象のシークレットは下記の通りです。

| 分類  | 具体的な対象 |
| --- | --- |
| CI・プロセス | Actions secrets / vars、 `GITHUB_TOKEN` 、全環境変数、OIDC request token / JWT、Actions runtime token、 `/proc/*/{environ,cmdline}` 。メモリ探索が有効なら `/proc/*/{maps,mem}` のトークンも探索 |
| クラウド | `~/.aws/credentials` と AWS SSO/cache、 `~/.azure/` と `~/.azd/auth/` 、 `~/.config/gcloud/` の ADC・DB・service account 鍵、 `GCP_SA_KEY` 、 `GOOGLE_APPLICATION_CREDENTIALS` |
| 開発・レジストリ | `~/.npmrc` 、 `~/.pypirc` 、 `~/.composer/auth.json` 、Cargo / RubyGems / Maven / Gradle / NuGet / Poetry の資格情報、 `~/.config/gh/hosts.yml` 、 `~/.git-credentials` 、Docker / Kubernetes / Vault / Terraform の設定、GitHub repo の一致ファイル・コミット履歴・artifact |
| AI サービス | `OPENAI*` 、 `ANTHROPIC*` 、 `GEMINI*` 、 `HF_*` などの環境変数、Claude / Codex / Gemini / Qwen / Copilot / Hugging Face / OpenCode 等の認証ファイル・設定 |
| 鍵・ローカルデータ | `~/.ssh/` 、 `~/.gnupg/` 、`.env*` 、秘密鍵・証明書、DB パスワードファイル、パスワードストア、Ethereum / Foundry の keystore |
| self-hosted runner の場合 | クラウド metadata / ECS タスク、Docker コンテナ設定、runner 資格情報、別の作業ディレクトリの `.env` と鍵 |

侵害されたCI環境内にAWS role と OIDC などの権限があれば、STS の一時認証情報、別 role、IAM user の access key 作成、role trust policy の変更が試される挙動が確認されています。Azure では GitHub Actions を信頼する federated identity credential の追加、GCP では service account の token 生成や `signJwt` を試みます。これらの変更が成立した場合、CI環境内のシークレットのローテションに加え、クラウド設定等が変更されていないことを確認してください。

### Stage 4 — gzip に圧縮して送信、回収先を変更

収集されたデータは `.tgz` にまとめられ、下記のエンドポイントへHTTP POSTでの送出が発生します。

-   `http://18[.]143[.]168[.]96:8080/exfil`
-   `http://194[.]150[.]166[.]244:8080/exfil`

また、一部影響を受けたワークフロー内の悪性コードではは Telegram Bot API `sendDocument` の multipart 文書送信を優先し、gzip を最大約45 MiB 単位に分割、同じ宛先チャット ID `-1004340163187` に送ろうとすることが確認されています。

## 対応指針

### 影響確認

管理されているGitHub リポジトリでいずれかの事象が発生した場合、当該GitHubリポジトリのCI環境内にて悪性コードが実行された可能性があります。

-   `docs: dependency audit notes` と題された pull request が作成されている
-   `ci: refresh build cache`, `ci: refresh build cache`, `chore: add dependency audit workflow`, `chore: add ci helper` のいずれかに題されたコミットが作成されている
-   `chore/<8桁のランダム文字列>` 等のブランチが作成されている

### クレデンシャルのローテーション

GitHubリポジトリが本件の影響を受けた可能性がある場合、CI環境内で使用されている認証情報を対象に、隔離・調査後、信頼できる端末で失効・再発行してください。

| 対象  | ローテーション手順 |
| --- | --- |
| GitHub / CI / OIDC | GitHub token と Actions secrets を再発行し、不要な OIDC trust / GitHub status 変更を点検。Actions runtime token の有効期間を確認 |
| AWS・GCP・Azure | AWS access key / SSO、GCP ADC / service account 鍵、Azure client secret / refresh token を該当環境分だけ失効・再発行。AWS IAM trust と Azure federated credential は **鍵の交換とは別に** 点検・修正 |
| レジストリ・開発環境 | npm / Composer / PyPI / Cargo / RubyGems 等の token、GitHub/GitLab・Git 認証、Docker / Kubernetes / Vault の credential をローテーション |
| AI・ローカル秘密情報 | 実際にあった AI provider API key、SSH / GPG 鍵、`.env` 内の DB・アプリケーション資格情報を再発行。ウォレット keystore が漏れた可能性があれば新しい鍵のウォレットへ資産を移すことを検討 |

## IoCs

### ネットワーク

| 種類  | 値   | 役割  |
| --- | --- | --- |
| URL | `http://194[.]150[.]166[.]244:8080/exfil` | gzip データの送出先 |
| URL | `http://18[.]143[.]168[.]96:8080/exfil` | gzip データの送出先 |
| 宛先 ID | `-1004340163187` | Telegram workflowのチャット宛先 |
