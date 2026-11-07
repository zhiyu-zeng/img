---
title: 【微信】国内claude+CC-switch实现完整版claude使用（win+mac）
source: https://mp.weixin.qq.com/s/ovEDPs7ybBlOgaUVACTSig
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T04:13:14+08:00
trace_id: 45305689-ba6b-4a41-9c71-fcd979322efe
content_hash: b14aaef741670ddf06e8dfd16ce0edb1cacaa53bac910e0f1142dc06bc89035d
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 23
  succeeded: 23
  failed_urls: []
notion_page_id: 41175244-d011-819c-83c7-e8421ff0bee3
ioc: null
---

**secureyang** *2026年11月7日 23:39*

一、物料

二、下载与配置

1、claude code desktop下载

2、boluo中转配置

3、CC-switch配置

三、claude配置

四、mac配置的区别

## 一、物料

**CC-switch** 官网下载地址：https://ccswitch.io/zh/

**claude code desktop** 官网下载地址：https://claude.com/product/claude-code

**菠萝中转站** 这是我自己用的一款认为非常好的中转站，各大模型都支持，具有多种分组，支持不一样的级别和消耗，地址：https://boluotoken.com/sign-up?aff=d3W5

## 二、下载与配置

### 1、claude code desktop下载

首先判断是否需要安装使用CLI，如有需要，先安装npm，访问：Node.js — 下载 Node.js® 进行下载，选择带有LTS的版本，比如：

![image-20261107222428763](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cf5b9141bc4dab40.png)

image-20261107222428763

然后按照他给的命令执行即可，如果报错不用怕，切换上面的使用选项更换下载命令重新尝试即可，如果尝试2-3次都会出现不正常的信息，那就不用管，继续下面的步骤就行。

完成上面的之后，则直接： `npm install -g @anthropic-ai/claude-code` 即可，完事验证一下 `claude --version` ，如下：

![image-20261107222113521](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6ce7108823b92296.png)

image-20261107222113521

接下来安装桌面版的agent工具，首先做好代理（部分地方无法下载），然后访问上面提供的 **claude code desktop** 官网下载地址，win和mac都一样，点击download即可。

![image-20261107221439855](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7002ea182dbe80b1.png)

image-20261107221439855

如果不代理节点是不允许下载的：

![image-20261107221626630](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3c60b07154f2ced3.png)

image-20261107221626630

下载好之后双击“Claude Setup.exe”安装即可，安装好之后就不要动了，彻底退出claude。

### 2、boluo中转配置

点击这里boluo网站 进入，直接使用github登录即可。进来之后进入API密钥界面：

![image-20261107223052468](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0ea24150088d5515.png)

image-20261107223052468

点击右上角“创建API密钥"，其中名称自己随便写就好，分组选择“claude-kiro”，如图：

![image-20261107223155002](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ee1afe6b9a1a9af2.png)

image-20261107223155002

然后保存更改，此时会出现一个分组，就是你刚刚申请的，然后去充值token，在钱包页面

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3900894f4fc8fcb4.png)

72rmb，可充值200刀额度；180rmb，可充值500刀额度。充值好之后就可以进行下一步了

### 3、CC-switch配置

CC-Switch是款免费的开源工具，它可以提供傻瓜式的界面，让我们自由切换模型，集中管理各种AI工具。安装时选择想要安装的目录即可，安装好将其打开。如下图，刚安装好的只有每个模型默认的官方模型供应商，下图是我修改配置了一些信息之后：

![image-20261107222718615](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1c4d29d22758f2b8.png)

image-20261107222718615

我们可以看到， **这里有两个选项，分别是给cli和agent版本做的中转，如果没有下载cli，则只用配置Claude Desktop，如果下载了cli，则二者都需要配置**。这里用下载了cli的来展示。

复制boluo里的分组API密钥，在CC-switch界面选择Claude Desktop，并点击右上角添加供应商，然后选择“自定义配置”，则可进入如下界面，并按照如图提示填写：

![image-20261107223742831](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a7e0586225c8dca6.png)

image-20261107223742831

填写好之后，点击下面的“获取模型列表”，然后添加你想用的模型即可，这里是原生Claude系列模型，默认选择“直连”即可。

![image-20261107223902716](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/82b3d83c5fd37d1c.png)

image-20261107223902716

完事之后点击保存。

接下来再在CC-switch界面选择Claude Code，重复完成上述配置即可，不一样的是，claude code配置需要做模型映射，配置为如下即可：

![image-20261107230227830](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e6475e42917d711a.png)

image-20261107230227830

配置完成之后给两个配置都打开路由：

![image-20261107224105364](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/818a40b4075d37e6.png)

image-20261107224105364

再进入“设置”检查一下，路由是否为 本地的 15721 端口

![image-20261107224146528](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6a571ea4b6e7aa52.png)

image-20261107224146528

## 三、claude配置

初次打开应该会直接进入这个界面，不用你再尝试登陆。

![image-20261107224337515](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6e6c039a7c5ff894.png)

image-20261107224337515

但是现在还不能直接用，因为claude自身原因，这里不展开了，需要配置他的网关路由，点击界面左上角的三条横线：

我这里是汉化过后的（下面会将如何汉化），所以看起来是中文，英文步骤为：Help → Troubleshooting → Enable Developer mode，在帮助的里面有一个打开开发者的功能需要打开，此时应该会重启

![image-20261107225111468](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ed7c9a708a3179ab.png)

image-20261107225111468

再次打开之后就会和下面这张图一样出现一个开发者的功能：

![image-20261107225153546](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e42326a7f807788a.png)

image-20261107225153546

接下来我们就要进入开发者里，Developer → Configure Third-Party Inference，选择Configure Third-Party Inference，在我这里中文就是“配置第三方推理”，他会进入一个操作面板，需要在里面按照如下配置：

```
Connection:          Gateway
Gateway base URL:    http://127.0.0.1:15721
Gateway API key:     PROXY_MANAGED
Gateway auth scheme: bearer
```

![image-20261107225404072](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bd8cf6c87b764885.png)

image-20261107225404072

填 `PROXY_MANAGED` 可以让 CC Switch 完全托管密钥，切换供应商时自动跟随。也可以填你自己的固定 key，但切换供应商后需要手动改。

往下滑，就可以看到刚才在cc-switch中配置的模型：

![image-20261107225418666](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/13ea1bad2d5250b3.png)

image-20261107225418666

点击save and 重启，他会自动重启，此时就不会再报错说当前模型不支持使用了，就可以正常使用了，其他操作和codex差不多

![image-20261107225614696](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c5270893b0bd7694.png)

image-20261107225614696

## 四、mac配置的区别

mac的下载和配置整理下来大致步骤和上面都是一样的，只有cc-switch配置有点不一样，如下：

mac确实有点和win不一样，我在操作时，mac会遇到cc-switch中的claude Desktop配置无法路由，但是Claude Code支持路由：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c61392de93c6b6a7.png)

![image-20261107230013598](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fcace8a70242b84a.png)

image-20261107230013598

此时只需和上面一样，把二者都先配置好，然后给claude code配置做好路由，claude desktop就默认保持直连就好。其他没有什么不一样，完事之后mac也可以使用啦：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2a71f5c5a35bee3.png)

此外，我们还可以将多种模型接入Claude和codex使用，比如deepseek接入codex和claude，详情参考：

学会上面的内容之后，我们可以在任何一个agent里，使用任何其他模型，比如coedx里使用grok、coedx里使用claude等等换着来，比如：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/57164353e90c0063.png)

加油吧骚年！

AI · 目录
