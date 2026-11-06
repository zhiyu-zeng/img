---
title: "Reversing the CSC 2026 Ransomware Unlocker:  A Fake gdb, a Salt Born in a SIGTRAP Handler, and an Invertible Check"
source: https://tranlynhathao.github.io/blog/2026/csc-2026-ransomware-unlocker/
source_host: tranlynhathao.github.io
clip_date: 2026-11-06T10:28:11+08:00
trace_id: 585f2299-c458-4f0d-8063-ee7195d3d47e
content_hash: c63189ae1d8bba2fb6980708e050fd06e81fe303875344ba15a97efb509af3a8
status: synced
tags:
  - 恶意样本
  - 反调试
series: null
feed_source: Tran Ly Nhat Hao·Android RE
ai_summary: CSC 2026 假 gdb 解锁器把盐值藏在 SIGTRAP 处理器中、flag 校验是可逆递推，逐字节反解即可拿到 RC4 密钥恢复全部加密文件。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41075244-d011-8139-a9b7-e41ef2c222e8
ioc:
  cves: []
  cwes: []
  hashes:
    - 02d525bf7aea45ecbac625539d66067af9624826e6c9e7865392781cef44b4ed
    - 03ab2864b99b1120f690c047b3ca79cd4b0e686911235655ec89fe3de5b6f8ce
    - 0d4f1f92cb4312f326923a209b219616b70ebe15633bd038637a5e67d84171bc
    - 1081b3dea8d03248f94ec69a6a6778ce
    - 123216eec45e4b97e7ee28d60c915dc8ac32c198ecc1c2ac8c0f242594a54474
    - 15c92fd6e52d899f2ef6f16c185d970a221f76e9de3913993031c5bae58fee38
    - 1684240bbf7879d77de2a4e6939eaf536d1306e4bc39cd5df3a29dfc77a91de9
    - 17b2927d32ccfce492948e10624443f9e0cf480efcffe7bf3b5f4e8f9e68f660
    - 1e868dac1c8d4d1a8c7e5f38da7f110820d6ea5f0672872b77436cb871f44f90
    - 21d7e5f559747ab821262b66c89d2485
    - 238056fa4616633a9ec5a358aac75275bd3f271d5e5238af3dd5f22c713fe97e
    - 2da50e92e80118e4789f36124539a98ece0404f53ad2c095491ea957f3a06aad
    - 2ed887686a63bf1c7e85067a46d7b8a9deb621aafcbf4779392b699f3c8a812b
    - 30921a316893413beb6199b03f7d349c425cc3e5c4f473c076f6461fb45cf74f
    - 319d4603cbe14874ece2a4d2fa55943e95ecd97e5562e8e0798fef2b2491e074
    - 329d314a8a298e9f0ad2dea1cd4ffa853dc5f5b83bca5e9bcb607ba5ac1e39b5
    - 346c095efff5bec9daa4b9a077607d9893ec188d59bf4103c6a60ea22882df82
    - 36ff718eef3d8784d95062b7739e305113e5e541ee0fa0d2272fe9d4fb2dfde6
    - 393bf2476352dd726519fd1f92ce66eac7d23c0936e6967420b717060c4c40d0
    - 3cd90df56511975b0d0ea91b9c46baf2ead94643c80062b6313b101428570929
    - 414d348f957de542ad2d4155c0b46486bc78369ee05d16b434f3993a88fe56c5
    - 421978a3ea5b90ba4ada097c86a11e53277254088ed14982e7fa7647e3a71366
    - 4496cebe3cc974489d418f3b8042ab4037b8555febd63781e4862b99559c8c45
    - 46144fb9b792410e6ffefd5928256ddb4a537f000559db17012a851b814790e0
    - 470fe4134d0d9550b4c1c95ae0fa03e0086c8b6febb5bd2c534ddc25f9702f2d
    - 5342b1a67040bbce778ecf6b86f17c10584510699f9e3a13feb094768b3a6cbf
    - 5bbafad54d79f247141bc297a6e6ffd769a7117d60d198f26e27a73a11170a01
    - 5f7b159d6c2021000424695382b3a5672ca04bec454d4d9fe50b3d498c6d1a58
    - 617d375b8f9e56ee109a9d8894b8694c88c4bd406291ea868315460c9837b94f
    - 632f37cafbdce8ebfba27f7d8264da1ea462880c4961c32354455c8ab722f7c3
    - 65c1cda2ade914e8d136fc9d6ba0febd690b3d8bb8f9c64cb46a89592bf7a4bf
    - 65f7c677f6403cabff34998afb5e7a8a5ecfa7f4523db17a9555db6513ed1757
    - 6936442ce7b8f041ba3846ec506230f2753dbeee4774c78b4e37e261399fb6bd
    - 6fbf93c9ab65cb422a9c41c8ba5e29c94ef356e0e5503bde79a9605e806d22d4
    - 702a0a0811fe8882dc159f7beccf83c6b76be39210e0f8f4cd52233ffafeeb6e
    - 70c002df0571675ada1eab1562a37c745d10b08d53b37d4a280bb230ed772baf
    - 7131f8d953f6cf82729ba6a8b16365f2734e77aa20ac224ec6ea55f4db5dc98f
    - 71fe996883c7850625a3593b2a40ebff4425968c4dcc9597d310e7fd4ac56974
    - 73c6ca0d6f01ce9ba80f068ae4eb95f47637802b2de762861c784ccbaa84849b
    - 7797c98ea9ec5aa077060ad9761bd21df4f34a6e95f846372718954ca9f849ad
    - 79d13e0a3216a9b15be30c718f954fd9376659d482e818b4c12b714bbad26333
    - 7a5e833793286bbfd9b59ce682bd41fc3f1c096bae1bb2a09b66ab2f6dacf90c
    - 7ea30e8ab96e02f5cde06be5652481abaebb5814bcb7418cebc31a479126cb80
    - 81125f6f5b30a2d469dca22143bba779e2aff7afe6d52ba24421e09f29afc6a2
    - 826bfef9d5a1211c26d036f262a059705fe41ae915999655ce945b38ee0b9d60
    - 8808b474175ff8eeebecbf407f9091fd73f65c4a43a6ee212e8ae2d9f80778f8
    - 8c2926592d01502ec90a23287f960e881d424a1cb6dafab46c53ceb7371d209c
    - 8e5348a227aae9cf6b6d761f4a952015fea4ce94d30a7f114bd481ee281aaff9
    - 96dd81111817ea32c57e8699e2a5e4ff62ff01174cfae0cf7007639809788ae5
    - 9895c399fbcdffa97bd24e9a58cd33ccbd13c71e73065858547344d54885a3dd
    - 9967f6a9eee8cd3e2815a3741bec3eee1733e2c240f36dc2a882486836d4722e
    - 9994a8c5a3b7a970846dacc38e4f2796fb0be986a3a085ae7e5f000e31df8405
    - a055a6cdf1412b4981911fa3f71e2def75aff182862a1fbab5d0505b450acd9e
    - a504502f19eb71286b24f825cbe483562ccc7f9c2abdb731edd0c724ed289269
    - a73e16cd7e7be05e43bfdb63d1340e51c56aff99de10653a35c09af7e57f74c5
    - a8eba92950984cbd80c2698f130dffd23ec663ce77f551ffd4753f65dd0f0caa
    - ab4b971b84fb1df6d2c8ec33a6c25e762461ea5b33373b61dfc20464a8b8b7b0
    - b4b3c9b670396d158a1d2c47311df84fab993a4470909a05318cc417d8ea6e0f
    - b5c94c2d04667654b1fb1e32ca8a286acd7553470e6b845eb833f2498ef93ea7
    - b711b7a7f404dfe22fb07dd8d0281d7b96b7be920ce471a9c3a15f0b32c8e0ce
    - b97f7dd47e7c89c75c337c9b5e3e676e10ffb4d0d0df705631f367c90ff4d9ea
    - bbd850354b862f1c49ddaac9eda38b792388836b3a753b0723bf3529c0ddf820
    - bd507e55b0d5a546d272c70261e83a974aca9c8afdca9021f5af99244201204a
    - beb231c22c91ac9b317265caa764f598a29044ea60d8181304a75b62af5a1e8d
    - c361f85944e350b0e288d9a840f9e341e20d257e69585d5408119a11205f80fb
    - c44b26495b0dcc670e4951dec8eb1dfce3e5f0d0c51e008dcf5a2c2fd7cb7253
    - c99b15613bd7fcc76654341d09940c39ab091e079c1cedabbb308e5d193fade1
    - ca152611bc9bc432d3c18519d3b222ebbae4c7b54a59a1ed2a4d7bbc6571f2aa
    - ca30348ea35a76c1c61bc0b20728417b4596c2380ae7e8c5e551d439cf808171
    - cd20c16eafc8351c6cd35f7bff9cf08da0debc441e6837c6a7b06624b7a4b161
    - d22736401c60b8b4d16e97520c49abd4cc763f8c24ffd52f898e2c4050eefd64
    - d359a81a6ec5f1b09731ef68bfad386933736ae52231c14f49bd67acf86a48f2
    - d3da4ca2158f60bab379ed040016ce186b8d0843545048dcbb83f8357a6c5ab3
    - d500c6994c39dc351a7dc638aa4d53de25c28a163a4172776831a9e3333238d9
    - d65d426feb6918df2da8c02b7b3ecdf6d1d09ef6ad3e5192b4f857a3803ed620
    - d7bf2544d2f2382290c292ff523036db91c072ac316f5e6f06d6bfe2f48b6bd5
    - d805e48c3497be85dee7c0714b2c3c205c012f88d31db68216458eeb08d1a7f7
    - dbeb8623c586e7066f1c9d50863ac3bdc13216b88ece0a757db5b45c5e52791a
    - e5a91d61306f3b23adf1535ca8e42b4f879dd0fd89eb17e35eac0559c4f3689d
    - e5bb8ae44a9816ec75d61082a004ac35f6cb5564b2fb5fcfebd3b9f1e41c49c8
    - e8544502482d47d95b9bd67b6b0affafa137eadd048c220c8b02aa31e2b14e74
    - e90b76e26b91f492f38ee2e002b71e00907fdedfabcf33a1984657b6c1cb7acf
    - e95773523fe3811dde4170eb8e27bff0e929c94b31d73bb9719cfadd03323a83
    - ea2a56fa1990f85333705e11bb371c4f350d3100f5e7040ca29bfe277989578a
    - ebdf448b71ae01bde4c06f6f7b18dbc5260d24a54b773bce5f4796f462d4665f
    - f7eadc94dea36c3cfe015bbd1177d8d3fc3daa246ee5db629efd88c6c0c807ac
    - f8113f38950a65974eef372bbffe83656f8ba745e682bc3fd192edac3389d433
    - fd1860cfa081914aea06242876342213637e922f3cc32f292629d4ec4883cb08
    - fec96564008f7279cb92d49afb4a8c7f3f92a676232b31bf80853e17a5c6a346
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CSC 2026 假 gdb 解锁器把盐值藏在 SIGTRAP 处理器中、flag 校验是可逆递推，逐字节反解即可拿到 RC4 密钥恢复全部加密文件。
> 
> - **反调试核心：** 解锁器是 4,912 字节的静态 ELF（冒名 `/opt/debug/gdb`），32 字节盐表位于 `.bss`，磁盘上全零；入口先注册 SIGTRAP 处理器，读入 flag 后执行 `int3`（0x4001d4），处理器对自身 `.text` 前 0x7e6 字节做 SHA-256 写入盐表。调试器若截获信号则处理器不执行，软件断点又会改变被哈希的代码——两种方式都拿不到真盐。
> - **可逆校验：** 62 字节校验 rol((x[k]+x[k−1])⊕salt[k%32], k%8)⊕expected[k]=0 是递推式而非哈希，每字节仅依赖前一字节，可按 x[k]=(ror8(e[k],k&7)⊕salt[k%32])−x[k−1] (mod 256) 单次反解出唯一 flag，再以 SHA-256 迭代 10 万次 "pepper:v2:kdf:01"∥flag 派生 32 字节 RC4 密钥。
> - **设计弱点：** 密钥只由常数 pepper 和 flag 决定、与主机无关，43 个文件共用同一密钥流（同一 token 在两台主机密文相同即是证据）；RC4 无完整性标签，错误密钥静默产出等长噪声，恢复后必须逐文件比对 inventory 里的 org_hash。
> - **恢复流程：** 比赛规则禁止重启、杀进程、运行样本或原地解密，因此需重建解密器离线操作：复制文件→解密副本→SHA-256 校验通过→保留原属主/权限回填，且重启服务前必须先禁用 cron/systemd 等持久化项，否则文件会被再次加密。

The finals of the Cybersecurity Student Contest (CSC, *Sinh viên An ninh mạng*) 2026, category A, opened on 16 October with a recovery phase before the attack-and-defence round. Our six services had been hit by ransomware before the start, and points came only for a service whose files were back **byte for byte** where they belonged, running again, with the recovery flag submitted. The rules forbade the shortcuts: no reboot, no killing processes, no deleting or running the sample, and no decrypting a file in place.

This is how the unlocker was taken apart. The analysis was a team effort; the Python decryptor at the end is the one I wrote for it. The hashes, the salt, the flag and the key below were re-checked against the binary for this post.

How the unlocker turns a flag into a file key /opt/debug/gdb: 4,912-byte static x86-64 ELF, six functions, no libc at run time read the flag from stdin "Enter the flag: ", up to 255 bytes int3 at 0x4001d4 raises SIGTRAP handler 0x400612 writes salt = SHA-256(.text, 0x7e6 bytes) 62-byte check, one byte at a time rol((x\[k\]+x\[k-1\]) ^ salt\[k%32\], k%8) ^ expected\[k\] must be 0 for all k key derivation SHA-256 x 100,000 over "pepper:v2:kdf:01" || flag an encrypted file CSCV2026 8 bytes RC4 ciphertext same length as the original RC4(key, file\[8:\]) the original, byte for byte: no padding, no tag, so a wrong key fails silently 32-byte key why a static read gets it wrong the salt lives in.bss: zeros on disk, filled only when the SIGTRAP handler runs; a breakpoint patched into.text changes the hash, and so the salt

What the unlocker does with the flag. The salt the check depends on is zeros on disk and exists only after the SIGTRAP handler has run.

![Working on a laptop during the Cybersecurity Student Contest 2026 final round, in the contest polo shirt, at a table of networked machines](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c5e87ff515fbeb18.jpg)

![Working on a laptop during the Cybersecurity Student Contest 2026 final round, in the contest polo shirt, at a table of networked machines](https://tranlynhathao.github.io/assets/img/blog/csc-2026-ransomware-unlocker/csc-2026-finals-160.avif)

The recovery phase on 16 October 2026. Six services, one ransomware family, and a clock.

## What the ransomware left

On the edge proxy, four files had stopped being themselves: `nginx.conf` and `mime.types` read as binary, and `/usr/sbin/nginx` no longer began with `\x7fELF`. All four began with the same eight bytes:

Text

```text
43 53 43 56 32 30 32 36   "CSCV2026"
```

| File | Size on disk |
| --- | --- |
| `/etc/nginx/nginx.conf` | 1,536 |
| `/etc/nginx/mime.types` | 3,965 |
| `/usr/sbin/nginx` | 1,240,560 |
| `/var/www/cms/index.html` | 277 |

The tag is the encryptor's marker, and the format is the simplest possible: `magic (8 bytes) || ciphertext`.

The organisers also gave each team an inventory of what had been encrypted on its hosts, `team02-ransom-inventory.yaml`, generated at 05:48 on the morning of 16 October. It is plain YAML: a host address, then one entry per file with its path, the SHA-256 of the original (`org_hash`) and the SHA-256 of the ciphertext now on disk (`enc_hash`). The edge proxy's four files, the ones in the table above, read:

YAML

```yaml
# CSCV 2026 ransomware inventory — team02
# generated 2026-10-16T05:48:38+07:00

"172.16.102.102":
  - path: "/usr/sbin/nginx"
    org_hash: "70c002df0571675ada1eab1562a37c745d10b08d53b37d4a280bb230ed772baf"
    enc_hash: "e5a91d61306f3b23adf1535ca8e42b4f879dd0fd89eb17e35eac0559c4f3689d"
  - path: "/etc/nginx/nginx.conf"
    org_hash: "71fe996883c7850625a3593b2a40ebff4425968c4dcc9597d310e7fd4ac56974"
    enc_hash: "f8113f38950a65974eef372bbffe83656f8ba745e682bc3fd192edac3389d433"
  - path: "/etc/nginx/mime.types"
    org_hash: "632f37cafbdce8ebfba27f7d8264da1ea462880c4961c32354455c8ab722f7c3"
    enc_hash: "b97f7dd47e7c89c75c337c9b5e3e676e10ffb4d0d0df705631f367c90ff4d9ea"
  - path: "/var/www/cms/index.html"
    org_hash: "36ff718eef3d8784d95062b7739e305113e5e541ee0fa0d2272fe9d4fb2dfde6"
    enc_hash: "7ea30e8ab96e02f5cde06be5652481abaebb5814bcb7418cebc31a479126cb80"
```

Across the six hosts (the edge proxy, Gitea, a CI runner, Jenkins, the internal DNS and a payroll web application) it lists 43 files:

| Host | Service | Files | Encrypted |
| --- | --- | --- | --- |
| `172.16.102.102` | edge proxy (nginx) | 4   | the nginx binary, its two configuration files and the CMS page |
| `172.16.102.103` | Gitea | 10  | the Gitea binary, `app.ini`, an nginx configuration, the init script, the JWT private key, and five files under `/shared/secrets` (an env file, three tokens, an age identity key) |
| `172.16.102.104` | CI runner (act_runner) | 5   | the runner binary, its entry script, `config.yaml`, the `.runner` registration file and a registration token |
| `172.16.102.105` | Jenkins | 12  | `jenkins.war`; `casc.yaml`, `config.xml`, `secret.key`, the encrypted identity key, the script approvals and the plugin list in `/var/lib/jenkins`; two init Groovy scripts and the deploy job's configuration; the systemd unit and an env file |
| `172.16.102.109` | internal DNS (Unbound) | 7   | the `unbound` binary, `unbound.conf`, the site's `megacorp.conf`, and two key and certificate pairs, one for the server and one for remote control |
| `172.16.102.111` | payroll web app (payslip) | 5   | the `payslip` binary, `rules/current.go`, `compose.yaml`, the `Dockerfile` and the README |

Every service lost the files it starts from (the binary, its configuration, a unit or compose file), and four of the six also lost keys or tokens, so putting back only the program, or only the secrets, would not have brought a host up. The whole file is here:

The complete inventory, team02-ransom-inventory.yaml

YAML

```yaml
# CSCV 2026 ransomware inventory — team02
# generated 2026-10-16T05:48:38+07:00

"172.16.102.102":
  - path: "/usr/sbin/nginx"
    org_hash: "70c002df0571675ada1eab1562a37c745d10b08d53b37d4a280bb230ed772baf"
    enc_hash: "e5a91d61306f3b23adf1535ca8e42b4f879dd0fd89eb17e35eac0559c4f3689d"
  - path: "/etc/nginx/nginx.conf"
    org_hash: "71fe996883c7850625a3593b2a40ebff4425968c4dcc9597d310e7fd4ac56974"
    enc_hash: "f8113f38950a65974eef372bbffe83656f8ba745e682bc3fd192edac3389d433"
  - path: "/etc/nginx/mime.types"
    org_hash: "632f37cafbdce8ebfba27f7d8264da1ea462880c4961c32354455c8ab722f7c3"
    enc_hash: "b97f7dd47e7c89c75c337c9b5e3e676e10ffb4d0d0df705631f367c90ff4d9ea"
  - path: "/var/www/cms/index.html"
    org_hash: "36ff718eef3d8784d95062b7739e305113e5e541ee0fa0d2272fe9d4fb2dfde6"
    enc_hash: "7ea30e8ab96e02f5cde06be5652481abaebb5814bcb7418cebc31a479126cb80"

"172.16.102.103":
  - path: "/usr/local/bin/gitea"
    org_hash: "238056fa4616633a9ec5a358aac75275bd3f271d5e5238af3dd5f22c713fe97e"
    enc_hash: "46144fb9b792410e6ffefd5928256ddb4a537f000559db17012a851b814790e0"
  - path: "/etc/gitea/app.ini"
    org_hash: "ebdf448b71ae01bde4c06f6f7b18dbc5260d24a54b773bce5f4796f462d4665f"
    enc_hash: "7797c98ea9ec5aa077060ad9761bd21df4f34a6e95f846372718954ca9f849ad"
  - path: "/etc/nginx/nginx.conf"
    org_hash: "96dd81111817ea32c57e8699e2a5e4ff62ff01174cfae0cf7007639809788ae5"
    enc_hash: "1684240bbf7879d77de2a4e6939eaf536d1306e4bc39cd5df3a29dfc77a91de9"
  - path: "/opt/ctf/gitea-init/init.sh"
    org_hash: "5bbafad54d79f247141bc297a6e6ffd769a7117d60d198f26e27a73a11170a01"
    enc_hash: "30921a316893413beb6199b03f7d349c425cc3e5c4f473c076f6461fb45cf74f"
  - path: "/var/lib/gitea/data/jwt/private.pem"
    org_hash: "2ed887686a63bf1c7e85067a46d7b8a9deb621aafcbf4779392b699f3c8a812b"
    enc_hash: "4496cebe3cc974489d418f3b8042ab4037b8555febd63781e4862b99559c8c45"
  - path: "/shared/secrets/env/gitea.env"
    org_hash: "329d314a8a298e9f0ad2dea1cd4ffa853dc5f5b83bca5e9bcb607ba5ac1e39b5"
    enc_hash: "cd20c16eafc8351c6cd35f7bff9cf08da0debc441e6837c6a7b06624b7a4b161"
  - path: "/shared/secrets/ci-dev.pat"
    org_hash: "d3da4ca2158f60bab379ed040016ce186b8d0843545048dcbb83f8357a6c5ab3"
    enc_hash: "81125f6f5b30a2d469dca22143bba779e2aff7afe6d52ba24421e09f29afc6a2"
  - path: "/shared/secrets/gitea-ci-bot.token"
    org_hash: "a504502f19eb71286b24f825cbe483562ccc7f9c2abdb731edd0c724ed289269"
    enc_hash: "123216eec45e4b97e7ee28d60c915dc8ac32c198ecc1c2ac8c0f242594a54474"
  - path: "/shared/secrets/act-runner-registration.token"
    org_hash: "beb231c22c91ac9b317265caa764f598a29044ea60d8181304a75b62af5a1e8d"
    enc_hash: "e95773523fe3811dde4170eb8e27bff0e929c94b31d73bb9719cfadd03323a83"
  - path: "/shared/secrets/stage2-age-identity.key"
    org_hash: "f7eadc94dea36c3cfe015bbd1177d8d3fc3daa246ee5db629efd88c6c0c807ac"
    enc_hash: "470fe4134d0d9550b4c1c95ae0fa03e0086c8b6febb5bd2c534ddc25f9702f2d"

"172.16.102.104":
  - path: "/usr/local/bin/act_runner"
    org_hash: "7a5e833793286bbfd9b59ce682bd41fc3f1c096bae1bb2a09b66ab2f6dacf90c"
    enc_hash: "a055a6cdf1412b4981911fa3f71e2def75aff182862a1fbab5d0505b450acd9e"
  - path: "/usr/local/bin/act_runner-entry.sh"
    org_hash: "346c095efff5bec9daa4b9a077607d9893ec188d59bf4103c6a60ea22882df82"
    enc_hash: "b5c94c2d04667654b1fb1e32ca8a286acd7553470e6b845eb833f2498ef93ea7"
  - path: "/etc/actrunner/config.yaml"
    org_hash: "73c6ca0d6f01ce9ba80f068ae4eb95f47637802b2de762861c784ccbaa84849b"
    enc_hash: "319d4603cbe14874ece2a4d2fa55943e95ecd97e5562e8e0798fef2b2491e074"
  - path: "/var/lib/actrunner/.runner"
    org_hash: "65c1cda2ade914e8d136fc9d6ba0febd690b3d8bb8f9c64cb46a89592bf7a4bf"
    enc_hash: "d359a81a6ec5f1b09731ef68bfad386933736ae52231c14f49bd67acf86a48f2"
  - path: "/shared/secrets/act-runner-registration.token"
    org_hash: "beb231c22c91ac9b317265caa764f598a29044ea60d8181304a75b62af5a1e8d"
    enc_hash: "e95773523fe3811dde4170eb8e27bff0e929c94b31d73bb9719cfadd03323a83"

"172.16.102.105":
  - path: "/usr/share/jenkins/jenkins.war"
    org_hash: "393bf2476352dd726519fd1f92ce66eac7d23c0936e6967420b717060c4c40d0"
    enc_hash: "c44b26495b0dcc670e4951dec8eb1dfce3e5f0d0c51e008dcf5a2c2fd7cb7253"
  - path: "/var/lib/jenkins/casc.yaml"
    org_hash: "9967f6a9eee8cd3e2815a3741bec3eee1733e2c240f36dc2a882486836d4722e"
    enc_hash: "dbeb8623c586e7066f1c9d50863ac3bdc13216b88ece0a757db5b45c5e52791a"
  - path: "/var/lib/jenkins/config.xml"
    org_hash: "c99b15613bd7fcc76654341d09940c39ab091e079c1cedabbb308e5d193fade1"
    enc_hash: "e5bb8ae44a9816ec75d61082a004ac35f6cb5564b2fb5fcfebd3b9f1e41c49c8"
  - path: "/var/lib/jenkins/secret.key"
    org_hash: "b4b3c9b670396d158a1d2c47311df84fab993a4470909a05318cc417d8ea6e0f"
    enc_hash: "bbd850354b862f1c49ddaac9eda38b792388836b3a753b0723bf3529c0ddf820"
  - path: "/var/lib/jenkins/identity.key.enc"
    org_hash: "a73e16cd7e7be05e43bfdb63d1340e51c56aff99de10653a35c09af7e57f74c5"
    enc_hash: "3cd90df56511975b0d0ea91b9c46baf2ead94643c80062b6313b101428570929"
  - path: "/var/lib/jenkins/scriptApproval.xml"
    org_hash: "bd507e55b0d5a546d272c70261e83a974aca9c8afdca9021f5af99244201204a"
    enc_hash: "fec96564008f7279cb92d49afb4a8c7f3f92a676232b31bf80853e17a5c6a346"
  - path: "/var/lib/jenkins/plugins.txt"
    org_hash: "6936442ce7b8f041ba3846ec506230f2753dbeee4774c78b4e37e261399fb6bd"
    enc_hash: "03ab2864b99b1120f690c047b3ca79cd4b0e686911235655ec89fe3de5b6f8ce"
  - path: "/var/lib/jenkins/init.groovy.d/01-deploy-production.groovy"
    org_hash: "ca30348ea35a76c1c61bc0b20728417b4596c2380ae7e8c5e551d439cf808171"
    enc_hash: "617d375b8f9e56ee109a9d8894b8694c88c4bd406291ea868315460c9837b94f"
  - path: "/var/lib/jenkins/init.groovy.d/02-stage3a-credential.groovy"
    org_hash: "d500c6994c39dc351a7dc638aa4d53de25c28a163a4172776831a9e3333238d9"
    enc_hash: "7131f8d953f6cf82729ba6a8b16365f2734e77aa20ac224ec6ea55f4db5dc98f"
  - path: "/var/lib/jenkins/jobs/deploy-production/config.xml"
    org_hash: "0d4f1f92cb4312f326923a209b219616b70ebe15633bd038637a5e67d84171bc"
    enc_hash: "ca152611bc9bc432d3c18519d3b222ebbae4c7b54a59a1ed2a4d7bbc6571f2aa"
  - path: "/etc/systemd/system/jenkins.service"
    org_hash: "d805e48c3497be85dee7c0714b2c3c205c012f88d31db68216458eeb08d1a7f7"
    enc_hash: "6fbf93c9ab65cb422a9c41c8ba5e29c94ef356e0e5503bde79a9605e806d22d4"
  - path: "/shared/secrets/env/jenkins.env"
    org_hash: "1e868dac1c8d4d1a8c7e5f38da7f110820d6ea5f0672872b77436cb871f44f90"
    enc_hash: "9895c399fbcdffa97bd24e9a58cd33ccbd13c71e73065858547344d54885a3dd"

"172.16.102.109":
  - path: "/usr/sbin/unbound"
    org_hash: "8c2926592d01502ec90a23287f960e881d424a1cb6dafab46c53ceb7371d209c"
    enc_hash: "8e5348a227aae9cf6b6d761f4a952015fea4ce94d30a7f114bd481ee281aaff9"
  - path: "/etc/unbound/unbound.conf"
    org_hash: "8808b474175ff8eeebecbf407f9091fd73f65c4a43a6ee212e8ae2d9f80778f8"
    enc_hash: "17b2927d32ccfce492948e10624443f9e0cf480efcffe7bf3b5f4e8f9e68f660"
  - path: "/etc/unbound/unbound.conf.d/megacorp.conf"
    org_hash: "5f7b159d6c2021000424695382b3a5672ca04bec454d4d9fe50b3d498c6d1a58"
    enc_hash: "d7bf2544d2f2382290c292ff523036db91c072ac316f5e6f06d6bfe2f48b6bd5"
  - path: "/etc/unbound/unbound_server.key"
    org_hash: "2da50e92e80118e4789f36124539a98ece0404f53ad2c095491ea957f3a06aad"
    enc_hash: "ea2a56fa1990f85333705e11bb371c4f350d3100f5e7040ca29bfe277989578a"
  - path: "/etc/unbound/unbound_server.pem"
    org_hash: "79d13e0a3216a9b15be30c718f954fd9376659d482e818b4c12b714bbad26333"
    enc_hash: "b711b7a7f404dfe22fb07dd8d0281d7b96b7be920ce471a9c3a15f0b32c8e0ce"
  - path: "/etc/unbound/unbound_control.key"
    org_hash: "421978a3ea5b90ba4ada097c86a11e53277254088ed14982e7fa7647e3a71366"
    enc_hash: "d22736401c60b8b4d16e97520c49abd4cc763f8c24ffd52f898e2c4050eefd64"
  - path: "/etc/unbound/unbound_control.pem"
    org_hash: "c361f85944e350b0e288d9a840f9e341e20d257e69585d5408119a11205f80fb"
    enc_hash: "a8eba92950984cbd80c2698f130dffd23ec663ce77f551ffd4753f65dd0f0caa"

"172.16.102.111":
  - path: "/opt/payslip/payslip"
    org_hash: "fd1860cfa081914aea06242876342213637e922f3cc32f292629d4ec4883cb08"
    enc_hash: "e90b76e26b91f492f38ee2e002b71e00907fdedfabcf33a1984657b6c1cb7acf"
  - path: "/opt/payslip/rules/current.go"
    org_hash: "65f7c677f6403cabff34998afb5e7a8a5ecfa7f4523db17a9555db6513ed1757"
    enc_hash: "9994a8c5a3b7a970846dacc38e4f2796fb0be986a3a085ae7e5f000e31df8405"
  - path: "/opt/payslip/compose.yaml"
    org_hash: "02d525bf7aea45ecbac625539d66067af9624826e6c9e7865392781cef44b4ed"
    enc_hash: "15c92fd6e52d899f2ef6f16c185d970a221f76e9de3913993031c5bae58fee38"
  - path: "/opt/payslip/Dockerfile"
    org_hash: "702a0a0811fe8882dc159f7beccf83c6b76be39210e0f8f4cd52233ffafeeb6e"
    enc_hash: "826bfef9d5a1211c26d036f262a059705fe41ae915999655ce945b38ee0b9d60"
  - path: "/opt/payslip/README.md"
    org_hash: "ab4b971b84fb1df6d2c8ec33a6c25e762461ea5b33373b61dfc20464a8b8b7b0"
    enc_hash: "e8544502482d47d95b9bd67b6b0affafa137eadd048c220c8b02aa31e2b14e74"
```

One entry appears twice. `/shared/secrets/act-runner-registration.token` is listed under both Gitea and the CI runner, and the two entries have the same `org_hash` and the same `enc_hash`: the same plaintext on two hosts gave the same ciphertext. The encryptor therefore uses one key for every file and mixes in no nonce, which fits the key derivation described below. It follows that every file is XORed with the same RC4 keystream from its first byte, so two ciphertexts XORed together give the two plaintexts XORed together, and a file of known content, an ELF header or a stock configuration, would hand over the start of the keystream for all the others. I did not try that; the unlocker made it unnecessary. It is the weak point in the ransomware's design that I would look at first had the unlocker not been there.

## The unlocker is not a debugger

Looking for recently changed files that did not belong to any package turned up `/opt/debug/gdb`. A real gdb is megabytes; this one was 4,912 bytes.

Text

```text
ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
MD5     21d7e5f559747ab821262b66c89d2485
SHA-256 d65d426feb6918df2da8c02b7b3ecdf6d1d09ef6ad3e5192b4f857a3803ed620
```

It links nothing and talks to the kernel with raw `syscall` instructions. Its printable strings give its purpose away:

Text

```text
Enter the flag: Correct! You got it.
Nope. Try again.
Unlocked ->
(could not open that file)
pepper:v2:kdf:01CSCV2026
```

So `/opt/debug/gdb` is the ransomware's own unlock tool: it asks for a 62-character flag and, if the flag is right, decrypts the file named on its command line, in place. In place is exactly what the rules forbade, so running it was out; the job was to understand it well enough to rebuild it.

## Six functions

The binary has six functions, and each is recognisable once its constants are visible.

| Address | Size | Role |
| --- | --- | --- |
| `0x4000b0` | 0x3fa | entry point and driver (no libc) |
| `0x4004aa` | 0x99 | key derivation |
| `0x400543` | 0xcf | RC4 |
| `0x400612` | 0x1b | SIGTRAP handler |
| `0x40062d` | 0x07 | signal restorer (`rt_sigreturn`, 15) |
| `0x400634` | 0x262 | SHA-256 |

**SHA-256** (`0x400634`) is the textbook one: the eight initial words, the 64-entry `K` table, the `ROR 25/11/6` and `ROR 22/13/2` rotations, padding with `0x80` and a big-endian bit length.

**RC4** (`0x400543`) is the classic key schedule and output loop, with a 32-byte key and a full key schedule on every call.

**Key derivation** (`0x4004aa`) copies the 16-byte string `pepper:v2:kdf:01`, appends the flag, hashes that, then hashes its own 32-byte output 99,999 more times:

key \= SHA-256 100 000 (pepper:v2:kdf:01 ∥ flag)

The driver reads the flag, checks it, and on success opens the named file, checks for the `CSCV2026` header, decrypts the rest with the derived key and writes it back.

## The salt that only exists at run time

The flag check reads a 32-byte table at `0x4011d8`. On disk that table is all zeros: it sits in `.bss`, with no initial value. Reading it statically and inverting the check gives a wrong flag, which is the point of the trick.

Before reading any input, the entry point unblocks SIGTRAP and installs a handler for it:

Text

```text
4000bc:  movl  $0xe, %eax          # rt_sigprocmask
4000c1:  movl  $0x1, %edi          # SIG_UNBLOCK, mask 0x10 = SIGTRAP
...
4000ef:  leaq  0x400612, %rax      # sa_handler
4000ff:  movq  $0x4000000, ...     # sa_flags = SA_RESTORER
40010b:  leaq  0x40062d, %rax      # sa_restorer: rt_sigreturn
400127:  movl  $0xd, %eax          # rt_sigaction
40012c:  movl  $0x5, %edi          # signal 5, SIGTRAP
```

Right after the flag has been read, the driver executes a single trap:

Text

```text
4001cc:  movq  %rbx, 0x4011fd      # the flag's length
4001d4:  int3
4001d5:  movb  $0x0, 0x4011f9      # the check starts here
```

The `int3` raises SIGTRAP, and the handler is three instructions long:

Text

```text
400612:  leaq  0x4000b0, %rdi      # start of .text
40061a:  movl  $0x7e6, %esi        # 2,022 bytes
40061f:  leaq  0x4011d8, %rdx      # the salt table
400627:  callq 0x400634            # sha256(text, 0x7e6, salt)
40062c:  retq
```

It hashes the program's own code and writes the digest into the table, then `rt_sigreturn` resumes after the `int3`. For this binary:

Text

```text
salt = SHA-256(0x4000b0 .. 0x4000b0 + 0x7e6)
     = 5342b1a67040bbce778ecf6b86f17c10584510699f9e3a13feb094768b3a6cbf
```

The same construction also works against a debugger, which fits the binary's name. A debugger catches the SIGTRAP from `int3` itself, and unless it passes the signal on, the handler never runs and the salt stays zero. A software breakpoint is an `int3` byte written into `.text`, so setting one anywhere in the hashed range changes the hash and with it the salt. Either way, the check run under a debugger is not the check run without one.

## Inverting the check

The check is a loop over the 62 flag bytes, `x[k]` for `k = 0..61`, with `x[-1] = 0`:

Text

```text
4001ee:  movq  %rbx, %rcx
4001f1:  andq  $0x1f, %rcx
4001f5:  movb  0x4011d8(%rcx), %dl    # salt[k & 31]
...
400210:  movb  %dl, %al               # x[k]
400212:  addb  0x4011f9, %al          # + x[k-1]
400219:  xorb  0x4011fb, %al          # ^ salt[k & 31]
400220:  movq  %rbx, %rcx
400223:  andq  $0x7, %rcx
400227:  rolb  %cl, %al               # rotate left by k & 7
400229:  movb  0x401000(%rbx), %dl    # expected[k]
40022f:  xorb  %dl, %al
400231:  orb   %al, 0x4011fa          # accumulate
```

The flag is accepted when its length is 62 and the accumulator is still zero. The accumulator is a bitwise OR of all 62 terms, so it is zero only if every term is zero:

rol 8 ((x k + x k − 1) ⊕ s k mod 32,k mod 8) \= e k for every k

Each byte depends only on the previous one, so the equation solves for x k directly, one byte at a time, in order:

x k \= (ror 8 (e k,k mod 8) ⊕ s k mod 32) − x k − 1 (mod 256)

with the 62-byte table e read from `0x401000` and the salt s from the previous section. It is a check written as a recurrence, not a hash, and a recurrence of this shape is a permutation of its input: there is exactly one accepted flag, and it falls out in one pass.

![A sheet of paper held in one hand, the per-byte recurrence worked out on it in pen — the subtraction of the previous byte, a rotate, the index arithmetic, with arrows and intermediate values across the page](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0c1d7a92308d2eb7.jpg)

![A sheet of paper held in one hand, the per-byte recurrence worked out on it in pen — the subtraction of the previous byte, a rotate, the index arithmetic, with arrows and intermediate values across the page](https://tranlynhathao.github.io/assets/img/blog/csc-2026-ransomware-unlocker/handwritten-derivation-160.avif)

The same inversion on paper, worked out by hand during the contest before it was written up: each byte is the previous one subtracted back out, one pass down the page.

Text

```text
CSCV2026{1s_7h15_h4rd_3n0ugh_1081b3dea8d03248f94ec69a6a6778ce}
```

## Rebuilding the decryptor

With the flag known, the key follows from the derivation above:

Text

```text
key = 414d348f957de542ad2d4155c0b46486bc78369ee05d16b434f3993a88fe56c5
```

The decryptor I wrote for the team does all of it from the binary, so it needs nothing typed in. It maps the two virtual addresses to file offsets through the ELF program headers, hashes `.text` for the salt, inverts the check, derives the key and decrypts every file given to it into a new `.dec` file next to the original.

Python

```css
import hashlib
import struct


def ror8(x, n):
    n &= 7
    return ((x >> n) | (x << (8 - n))) & 0xFF


def vaddr_to_off(blob, vaddr):
    # walk the PT_LOAD program headers of an ELF64 file
    phoff = struct.unpack_from("<Q", blob, 0x20)[0]
    phentsize = struct.unpack_from("<H", blob, 0x36)[0]
    phnum = struct.unpack_from("<H", blob, 0x38)[0]
    for i in range(phnum):
        base = phoff + i * phentsize
        if struct.unpack_from("<I", blob, base)[0] != 1:  # PT_LOAD
            continue
        p_offset = struct.unpack_from("<Q", blob, base + 8)[0]
        p_vaddr = struct.unpack_from("<Q", blob, base + 16)[0]
        p_filesz = struct.unpack_from("<Q", blob, base + 32)[0]
        if p_vaddr <= vaddr < p_vaddr + p_filesz:
            return p_offset + (vaddr - p_vaddr)
    raise ValueError("vaddr 0x%x not mapped" % vaddr)


def recover_flag(blob):
    text = vaddr_to_off(blob, 0x4000B0)
    salt = hashlib.sha256(blob[text : text + 0x7E6]).digest()
    exp_off = vaddr_to_off(blob, 0x401000)
    expected = blob[exp_off : exp_off + 62]
    flag, prev = bytearray(), 0
    for k in range(62):
        cur = ((ror8(expected[k], k & 7) ^ salt[k & 0x1F]) - prev) & 0xFF
        flag.append(cur)
        prev = cur
    return bytes(flag)


def derive_key(flag):
    d = hashlib.sha256(b"pepper:v2:kdf:01" + flag).digest()
    for _ in range(99999):
        d = hashlib.sha256(d).digest()
    return d


def rc4(key, data):
    S = list(range(256))
    j = 0
    for i in range(256):
        j = (j + S[i] + key[i % len(key)]) & 0xFF
        S[i], S[j] = S[j], S[i]
    out = bytearray(len(data))
    i = j = 0
    for n, b in enumerate(data):
        i = (i + 1) & 0xFF
        j = (j + S[i]) & 0xFF
        S[i], S[j] = S[j], S[i]
        out[n] = b ^ S[(S[i] + S[j]) & 0xFF]
    return bytes(out)


def restore(unlocker_path, encrypted_path):
    key = derive_key(recover_flag(open(unlocker_path, "rb").read()))
    data = open(encrypted_path, "rb").read()
    if data[:8] != b"CSCV2026":
        raise ValueError("no CSCV2026 magic: " + encrypted_path)
    open(encrypted_path + ".dec", "wb").write(rc4(key, data[8:]))
```

The four files on the edge proxy came back eight bytes shorter, as a stream cipher with no tag predicts: `nginx.conf` began `user www-data;`, `mime.types` began `types {`, `nginx` began `\x7fELF` again, and `index.html` was the MegaCorp CMS page.

> ##### WARNING
> 
> RC4 has no integrity check. With a wrong key it does not fail; it returns a file of the right length full of noise, and a service started on it fails in confusing ways, or worse, half works. Check every restored file against the SHA-256 of its original before putting it back, not only its first bytes.

## Putting the files back

Decrypting was the easy half; the phase was scored on files that were exactly right, in the right place, with a running service. The order that kept it safe:

1.  Copy the encrypted file somewhere to work on, and leave the original where it is.
2.  Decrypt the copy and compare its SHA-256 with the original's hash in the inventory. A mismatch means a wrong input, not a reason to retry blindly.
3.  Install the restored file with the original's owner, group and mode, then restart the service and check it from outside as well as from the host.
4.  Before starting anything, find what launched the sample (a cron entry or a systemd unit) and disable it, or it encrypts the restored files again.

The key did not depend on the host: it is a hash of a constant pepper and the flag, so the same flag, and so the same key, applied to every file in the inventory on all six machines. That made this family the cheap one to recover from. A family that mixes host identifiers into its key has to be decrypted on the host it hit, which is a different and slower afternoon.

## From the inventory to running hosts

The organisers' instruction, once the keys were out, was short: run `/opt/debug/gdb <path>` on a file, enter the key at the prompt, and the file is decrypted; then start the service with `systemctl start`, or with `docker compose up -d` for the payroll portal. Forty-three files on six hosts is enough that typing it by hand invites a slip, so the inventory became the input to three small files.

### Decrypting a copy off the host

`pull_decrypt_deploy.sh` walks the inventory, copies each encrypted file to a working directory, decrypts the copy there and puts the result back:

Bash

```bash
#!/bin/sh
FLAG='CSCV2026{1s_7h15_h4rd_3n0ugh_1081b3dea8d03248f94ec69a6a6778ce}'

awk -F'"' '/^"/{h=$2} /path:/{print h, $2}' team02-ransom-inventory.yaml | while read h f; do
    d="stage/root@$h$(dirname "$f")"
    mkdir -p "$d"
    scp "root@$h:$f" "$d/"
    printf '%s\n' "$FLAG" | ./gdb "$d/$(basename "$f")"
    scp "$d/$(basename "$f")" "root@$h:$f"
done
```

The inventory is read without a YAML parser. The host keys are the only lines that start with a double quote, and on a `path:` line the path is the second field once the line is split on double quotes, so `awk -F'"'` prints one `host path` pair for each of the 43 entries. For each pair the loop mirrors the remote path under `stage/`, copies the file down with `scp`, pipes the flag into `./gdb` and copies the decrypted file back over the original. `./gdb` is the unlocker itself: the copy kept next to the script has the SHA-256 listed under Indicators, and it reads the flag from standard input, as the strings above show. It runs on the analysis machine and never on the host.

The loop trusts the key and checks nothing. RC4 does not fail on a wrong key; it returns noise of the right length, as the warning above says, and the script writes whatever came out over the host's copy at once, keeping no copy of the ciphertext. The inventory already holds what is needed to catch that. This version of the loop keeps the ciphertext and compares the decrypted copy with `org_hash` before pushing it back. It is not what ran on the day. On a two-entry toy inventory in the same format, with one entry made to decrypt wrongly, it pushed the good file and refused the bad one:

Bash

```bash
awk -F'"' '/^"/{h=$2} /path:/{print h, $2}' team02-ransom-inventory.yaml | while read h f; do
    name=$(basename "$f"); d="stage/root@$h$(dirname "$f")"
    mkdir -p "$d"
    scp "root@$h:$f" "$d/"
    cp "$d/$name" "$d/$name.enc"                       # keep the ciphertext
    printf '%s\n' "$FLAG" | ./gdb "$d/$name"
    want=$(awk -F'"' -v h="$h" -v f="$f" '/^"/{c=$2} c==h && /path:/{p=$2} p==f && /org_hash:/{print $2; exit}' team02-ransom-inventory.yaml)
    [ "$(sha256sum "$d/$name" | cut -d' ' -f1)" = "$want" ] || { echo "MISMATCH $h $f" >&2; continue; }
    scp "$d/$name" "root@$h:$f"
done
```

### Decrypting on the host

`remote_decrypt.sh` does the other thing: it logs in to each host and runs that host's own `/opt/debug/gdb` there. The six root passwords were typed into the script; they are replaced by an ellipsis here.

Bash

```bash
#!/bin/sh
FLAG='CSCV2026{1s_7h15_h4rd_3n0ugh_1081b3dea8d03248f94ec69a6a6778ce}'

pass() {
    case "$1" in
        172.16.102.102) echo '…' ;;
        172.16.102.103) echo '…' ;;
        172.16.102.104) echo '…' ;;
        172.16.102.105) echo '…' ;;
        172.16.102.109) echo '…' ;;
        172.16.102.111) echo '…' ;;
    esac
}

awk -F'"' '/^"/{h=$2} /path:/{print h, $2}' team02-ransom-inventory.yaml | while read h f; do
    sshpass -p "$(pass "$h")" ssh -n root@"$h" "head -c8 '$f' | grep -q CSCV2026 && printf '%s\n' '$FLAG' | /opt/debug/gdb '$f'"
done
```

The guard in front of the unlocker, `head -c8 "$f" | grep -q CSCV2026`, lets the script be run again after a partial failure: only a file that still starts with the marker is touched. `ssh -n` matters more than it looks. Without it ssh reads the loop's standard input, which is the rest of the `awk` output, and the loop ends after the first file. The remote command is one double-quoted string, so `$f` and `$FLAG` are filled in on the operator's machine and the single quotes protect them on the remote shell; that holds for these paths because none contains a quote. The passwords go in with `sshpass -p`, which puts them on the command line, where any user on the same machine can read them in the process list. The script also holds the unlock key, so the file itself needed deleting once the work was done.

### The runbook

`restore_runbook.txt` is the same work as a list to follow by hand at the unlocker's prompt: its first line says to enter the key at every prompt. It names the 43 files in the inventory's own order (the two lists agree, host by host), each as an `/opt/debug/gdb <path>` line under the host's heading, then the commands that start that host's services:

The runbook, restore_runbook.txt

Bash

```bash
# restore-runbook.txt
# Enter this at every prompt: CSCV2026{1s_7h15_h4rd_3n0ugh_1081b3dea8d03248f94ec69a6a6778ce}

# ===== edge-proxy  172.16.102.102  (root) =====
/opt/debug/gdb /usr/sbin/nginx
/opt/debug/gdb /etc/nginx/nginx.conf
/opt/debug/gdb /etc/nginx/mime.types
/opt/debug/gdb /var/www/cms/index.html
systemctl start nginx

# ===== gitea  172.16.102.103  (root) =====
/opt/debug/gdb /usr/local/bin/gitea
/opt/debug/gdb /etc/gitea/app.ini
/opt/debug/gdb /etc/nginx/nginx.conf
/opt/debug/gdb /opt/ctf/gitea-init/init.sh
/opt/debug/gdb /var/lib/gitea/data/jwt/private.pem
/opt/debug/gdb /shared/secrets/env/gitea.env
/opt/debug/gdb /shared/secrets/ci-dev.pat
/opt/debug/gdb /shared/secrets/gitea-ci-bot.token
/opt/debug/gdb /shared/secrets/act-runner-registration.token
/opt/debug/gdb /shared/secrets/stage2-age-identity.key
systemctl start gitea
systemctl start nginx

# ===== ci-runner  172.16.102.104  (root) =====
/opt/debug/gdb /usr/local/bin/act_runner
/opt/debug/gdb /usr/local/bin/act_runner-entry.sh
/opt/debug/gdb /etc/actrunner/config.yaml
/opt/debug/gdb /var/lib/actrunner/.runner
/opt/debug/gdb /shared/secrets/act-runner-registration.token
systemctl start act_runner

# ===== jenkins  172.16.102.105  (root) =====
/opt/debug/gdb /usr/share/jenkins/jenkins.war
/opt/debug/gdb /var/lib/jenkins/casc.yaml
/opt/debug/gdb /var/lib/jenkins/config.xml
/opt/debug/gdb /var/lib/jenkins/secret.key
/opt/debug/gdb /var/lib/jenkins/identity.key.enc
/opt/debug/gdb /var/lib/jenkins/scriptApproval.xml
/opt/debug/gdb /var/lib/jenkins/plugins.txt
/opt/debug/gdb /var/lib/jenkins/init.groovy.d/01-deploy-production.groovy
/opt/debug/gdb /var/lib/jenkins/init.groovy.d/02-stage3a-credential.groovy
/opt/debug/gdb /var/lib/jenkins/jobs/deploy-production/config.xml
/opt/debug/gdb /etc/systemd/system/jenkins.service
/opt/debug/gdb /shared/secrets/env/jenkins.env
systemctl daemon-reload
systemctl start jenkins

# ===== dns-ops  172.16.102.109  (root) =====
/opt/debug/gdb /usr/sbin/unbound
/opt/debug/gdb /etc/unbound/unbound.conf
/opt/debug/gdb /etc/unbound/unbound.conf.d/megacorp.conf
/opt/debug/gdb /etc/unbound/unbound_server.key
/opt/debug/gdb /etc/unbound/unbound_server.pem
/opt/debug/gdb /etc/unbound/unbound_control.key
/opt/debug/gdb /etc/unbound/unbound_control.pem
systemctl start unbound

# ===== web-app  172.16.102.111  (root) =====
/opt/debug/gdb /opt/payslip/payslip
/opt/debug/gdb /opt/payslip/rules/current.go
/opt/debug/gdb /opt/payslip/compose.yaml
/opt/debug/gdb /opt/payslip/Dockerfile
/opt/debug/gdb /opt/payslip/README.md
cd /opt/payslip && docker compose up -d
```

The commands after each host's list show what the encrypted files meant for starting it. Gitea also starts nginx, whose `nginx.conf` was on the list. Jenkins needs `systemctl daemon-reload` first, because `jenkins.service` itself was among the encrypted files and systemd has to read the restored unit. The payroll portal is started with `docker compose up -d` in `/opt/payslip` instead of `systemctl`, which works only after `compose.yaml` and the `Dockerfile` are back. That host's five files include `rules/current.go`, which is where [part two](https://tranlynhathao.github.io/blog/2026/csc-2026-payslip-portal/) picks up.

## Indicators

For anyone writing detections for something built the same way:

| Indicator | Value |
| --- | --- |
| File marker | `CSCV2026`, eight bytes at offset 0, then ciphertext |
| Unlocker | `/opt/debug/gdb`, 4,912 bytes, static stripped ELF64 |
| Unlocker SHA-256 | `d65d426feb6918df2da8c02b7b3ecdf6d1d09ef6ad3e5192b4f857a3803ed620` |
| Key derivation | SHA-256 iterated 100,000 times over `pepper:v2:kdf:01` and the flag |
| Cipher | RC4 with a 32-byte key, no integrity tag |
| Anti-analysis | salt computed as SHA-256 of `.text` inside a SIGTRAP handler |

## What carries over

-   **A small static binary in a tool's place deserves a look.** A 4.9 KB `gdb` in `/opt/debug` with no package owning it was the whole case. File size against what the name implies, and package ownership, are cheap first filters.
-   **Read the signal handlers before the main path.** A value that is zero on disk and used by a check is computed somewhere at run time; here it was a handler reached only through `int3`.
-   **A check written as a recurrence can be run backwards.** When every byte depends only on its neighbours through invertible steps (addition, XOR, rotation), there is no search to do.
-   **Never let the attacker's tool write your evidence.** Rebuilding the decryptor kept the originals intact and every step repeatable; the unlocker itself would have overwritten the only copies.
