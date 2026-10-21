---
title: LiteLLMパッケージ 再侵害の概要と対策指針 - GMO Flatt Security Blog
source: https://blog.flatt.tech/entry/litellm_2nd_compromise?utm_source=feed
source_host: blog.flatt.tech
clip_date: 2026-10-21T21:05:44+08:00
trace_id: 639e33a4-33fb-4eb5-8dda-cf8544a17c1d
content_hash: f4a9e2e04e8aab100fe31950d1fd19b23369bdc461546b882f98674e664c5584
status: synced
tags:
  - 供应链投毒
  - 恶意样本
series: null
feed_source: GMO Flatt Security
ai_summary: 2026年10月21日，PyPI 上的 `litellm` 包再次被注入 Infostealer 恶意代码；安装 1.107.0 即可能中招，应立即回退至 1.106.2 并轮换全部凭证。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40075244-d011-817b-a7a9-fc4fcdda77a7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 2026年10月21日，PyPI 上的 `litellm` 包再次被注入 Infostealer 恶意代码；安装 1.107.0 即可能中招，应立即回退至 1.106.2 并轮换全部凭证。
> 
> - **受影响版本：** `litellm==1.107.0` 经 `pip install` 安装即存在感染风险，最后一个安全版本为 `1.106.2`；本次与 2026 年 3 月的投毒事件是彼此独立的再侵害。
> - **窃取范围：** 共 16 类机密，含 SSH 私钥、AWS/GCP/Azure 云凭证、浏览器保存的密码、AI 开发工具（Claude/Cursor/Copilot/Gemini/Codex）配置、环境变量、Kubernetes 服务账号令牌与 LiteLLM 数据库凭证。
> - **外传方式：** 窃得数据先经 AES-256-CBC 与 RSA-OAEP 加密，再以 HTTP POST 发往 `http://www[.]litellm[.]dev/healthcheck`。
> - **持久化后门：** 从 GitHub 上的域名配置文件中动态获取 C2 域名，以守护进程形式常驻，可执行远程代码。
> - **处置建议：** 若怀疑受影响，需立即轮换 SSH 私钥、三大云凭证、Kubernetes 与 Docker 配置、npm/PyPI 令牌、GitHub CLI 令牌、浏览器密码、AI 工具认证信息以及 GPG/TLS 私钥。
> 
> 以上为速报内容，详细分析仍在进行，原文将随调查更新。

2026年10月21日、PyPI パッケージ `litellm` に悪性コードが注入されました。2026年3月に発生した [事案](https://diary.shift-js.info/litellm-compromise/) とは別の再侵害が発生しています。

注入された悪性コードは、Infostealer機能を持つマルウェアです。

本記事は、弊社が Takumi Guard の解析基盤をベースに観測＆分析した情報を踏まえ、日本のコミュニティに向けて、影響と対策を中心に整理するものです。

また、本記事の目的は事態の把握と対応の促進であり、違法行為への加担・助長を意図するものではありません。記述の一部には不正確な情報が含まれている可能性があります。速報性を優先していますので、ご了承ください。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/74854bf0d8e96124.png)

## TL;DR

-   `litellm==1.107.0` を `pip install` した場合、マルウェア感染の可能性があります。安全なバージョンは `1.106.2` です。
-   **本検体は infostealer で、SSH 秘密鍵・クラウド認証情報（AWS/GCP/Azure）・ブラウザ保存パスワード・AI 開発ツールの設定・環境変数・Kubernetes サービスアカウントトークン・LiteLLM データベース認証情報など 16 カテゴリのシークレットを窃取し、AES-256-CBC + RSA-OAEP で暗号化のうえ `http://www[.]litellm[.]dev/healthcheck` へ HTTP POST で送出します。** 加えて、GitHub 上のドメイン設定ファイルから C2 ドメインを動的に取得し、リモートコードを実行するバックドアをデーモンプロセスとして常駐させます。
-   影響を受けた可能性がある場合は、SSH 秘密鍵・AWS/GCP/Azure クレデンシャル・Kubernetes config・Docker config・npm/PyPI トークン・GitHub CLI トークン・ブラウザ保存パスワード・AI ツール（Claude/Cursor/Copilot/Gemini/Codex）の認証情報・GPG 秘密鍵・TLS 秘密鍵を **即座にローテーション** してください。

本記事は速報版となっており、詳細については引き続き調査中です。記事は随時更新します。
