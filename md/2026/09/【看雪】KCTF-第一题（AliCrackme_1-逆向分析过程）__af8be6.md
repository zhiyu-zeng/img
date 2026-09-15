---
title: 【看雪】KCTF 第一题（AliCrackme_1 逆向分析过程）
source: https://bbs.kanxue.com/thread-292960.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-15T17:06:07+08:00
trace_id: 35abfddc-ff03-4163-b631-e32b2b426fde
content_hash: 05507a0b25d8af0082754b895ecf5ae10f5ddc555d8df0089300f5412bd6a392
status: synced
tags:
  - 看雪
  - Android逆向
  - CTF
series: null
feed_source: 看雪·Android安全
ai_summary: 通过搜索"密码"文案定位校验分支，从 `assets/logo.png` 尾部偏移取表与密文，反查得到密码 `581026`。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3dc75244-d011-813f-9d9b-c46bde57e6aa
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过搜索"密码"文案定位校验分支，从 `assets/logo.png` 尾部偏移取表与密文，反查得到密码 `581026`。
> 
> - **锚点定位法：** 先全局搜用户可见文案"密码"命中 `dialog_error_tips`，再拿资源名当关键字搜索，得到唯一引用点——按钮 `onClick` 的失败分支，直接落到核心逻辑。
> - **校验本质：** `bytesToAliSmsCode(table, 输入UTF-8字节)` 对每个字节执行 `table.charAt(b & 255)` 做替换，结果与 `getPwdFromPic()` 返回值 `pw` 做字符串相等比较；类中还留有反查函数 `aliCodeToBytes`。
> - **数据藏匿：** 表与密文都在同一个 `assets/logo.png`：偏移 89473 取 768 字节 UTF-8 解码为 256 个汉字查找表，偏移 91265 取 18 字节得密文"义弓么丸广之"，位置在 IEND chunk 之后，看图工具不可见。
> - **反查得解：** 对密文逐字 `table.indexOf()` 得 0x35/0x38/0x31/0x30/0x32/0x36，即 `581026`；成立前提是表为 256 项无重复的双射。
> - **动态仅验证：** 代码已埋 `Log.i("lil", ...)`，用 `adb logcat -s lil` 即可取值；Frida hook 必须先保存原方法引用再调用，否则无限递归。纯静态脚本三行即可提取，无需设备。

> 目标： `AliCrackme_1.apk` 　包名： `com.example.simpleencryption` 　工具：jadx + Frida（可选）　密码： **`581026`**

## 一、思路：以"提示字符串"为锚点反向定位代码

不通读代码，先找一个 **一眼能认出的锚点**，再顺着引用反推到核心校验逻辑。  
锚点优先级： **用户可见文案（弹窗/按钮/日志）> 资源 id > 方法名 > 变量名**。

## 二、具体步骤

### 步骤 1：全局搜索"密码"

命中资源字符串：

```xml
<string name="dialog_error_tips">密码不对，请继续破解</string>
```

### 步骤 2：全局搜索资源名 dialog_error_tips

把字符串 id 当关键字再搜一次，命中 **唯一引用点**——按钮 `onClick` 的失败分支：

```java
if (pw == null || pw.equals("") || !pw.equals(enPassword)) {
    AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this);
    builder.setMessage(R.string.dialog_error_tips);      // ← 就是这里
    builder.setTitle(R.string.dialog_title);
    builder.setPositiveButton(R.string.dialog_ok, new DialogInterface.OnClickListener() {
        @Override public void onClick(DialogInterface dialog, int which) { dialog.dismiss(); }
    });
    builder.show();
    return;
}
```

### 步骤 3：从失败分支往上读，还原完整校验逻辑

```java
public void onClick(View v) {
    String password = edit.getText().toString();                    // ① 用户输入
    String table = MainActivity.this.getTableFromPic();             // ② 查表(256 项)
    String pw = MainActivity.this.getPwdFromPic();                  // ③ 正确答案(密文)
    Log.i("lil", "table:" + table);
    Log.i("lil", "pw:" + pw);
    String enPassword = "";
    try {
        enPassword = MainActivity.bytesToAliSmsCode(table, password.getBytes("utf-8"));  // ④ 加密输入
        Log.i("lil", "enPassword:" + enPassword);
    } catch (UnsupportedEncodingException e) { e.printStackTrace(); }
    if (pw == null || pw.equals("") || !pw.equals(enPassword)) {
        // 失败：密码不对，请继续破解
        return;
    }
    MainActivity.this.showDialog();                                 // 成功：恭喜！！！破解成功！！！
}
```

**归纳**：把「用户输入的 UTF-8 字节」按 `table` 查表得到 `enPassword` ，再与 `getPwdFromPic()` 的返回值 `pw` 做 **字符串相等比较**。

### 步骤 4：深挖三个关键函数

**4.1 `getPwdFromPic()` —— 正确答案（密文）从哪来**

```java
is = getResources().getAssets().open("logo.png");     // 注意是 assets/ 下那张 logo.png
int lenght = is.available();
byte[] b = new byte[lenght];
is.read(b, 0, lenght);
byte[] data = new byte[18];
System.arraycopy(b, 91265, data, 0, 18);              // 硬编码偏移 91265, 长度 18
String value2 = new String(data, "utf-8");
...
value = value2;                                       // ← 最终返回的 value
```

**4.2 `getTableFromPic()` —— 同一个文件，换一段偏移**

```java
byte[] data = new byte[768];
System.arraycopy(b, 89473, data, 0, 768);             // 偏移 89473, 长度 768
```

同样按硬编码偏移从 `assets/logo.png` 抠数据，UTF-8 解码后是 **256 个汉字**。

**4.3 `bytesToAliSmsCode()` —— 核心算法**

```java
private static String bytesToAliSmsCode(String table, byte[] data) {
    StringBuilder sb = new StringBuilder();
    for (byte b : data) {
        sb.append(table.charAt(b & 255));      // 字节值(0~255) 当下标去查表
    }
    return sb.toString();
}

// 类里还留了个反向函数(本题未被调用, 但暴露了作者意图)
private static byte[] aliCodeToBytes(String codeTable, String strCmd) {
    byte[] cmdBuffer = new byte[strCmd.length()];
    for (int i = 0; i < strCmd.length(); i++) {
        int v = codeTable.indexOf(strCmd.charAt(i));   // 字符 → 表内下标
        cmdBuffer[i] = (byte) v;
    }
    return cmdBuffer;
}
```

**本质**： `table` 是一张 **256 项的"字节 → 字符"替换表**； `bytesToAliSmsCode` 是加密（正查）， `aliCodeToBytes` 是解密（反查）。

## 三、怎么把 pw 变成密码

### 3.1 Hook 取数

代码里其实 **已经埋好了日志**，最省事的是直接看 logcat：

```bash
adb logcat -s lil        # 或 adb logcat lil:I *:S
```

想现场求值就用 Frida（脚本： [`scripts/hook_alicrackme.js`](https://bbs.kanxue.com/Users/liuwei/Desktop/MyProject/tasks/AliCrackme%E9%80%86%E5%90%91-2026-09-15/scripts/hook_alicrackme.js) ）：

```javascript
var MainActivity = Java.use("com.example.simpleencryption.MainActivity");
var origPwd = MainActivity.getPwdFromPic;              // 先存原方法引用!
MainActivity.getPwdFromPic.implementation = function () {
    var v = origPwd.call(this);                        // 不能写 this.getPwdFromPic(), 会无限递归
    console.log("[+] getPwdFromPic() => " + v);
    return v;
};
```

### 3.2 ⚠️ 关键修正：hook 到的 value 是密文，不是密码

`getPwdFromPic()` 返回的 `pw` 是 **正确答案经过查表加密后的密文**，不能直接填进输入框——  
因为你的输入会被 `bytesToAliSmsCode` **再加密一次**，永远不可能等于 `pw` 本身。

```python
table = "一乙二十丁厂七卜人入八九几儿了…令用甩印乐"   // 256 个汉字
pw    = "义弓么丸广之"                              // 密文, 18 字节 UTF-8 = 6 个汉字
```

**正确做法是反查** （即 `aliCodeToBytes` 的思路）：对 `pw` 每个汉字用 `table.indexOf(字)` 取下标，下标就是原始字节。

| 密文字符 | `table.indexOf()` | 字节  | 字符  |
| --- | --- | --- | --- |
| 义   | 53  | 0x35 | `5` |
| 弓   | 56  | 0x38 | `8` |
| 么   | 49  | 0x31 | `1` |
| 丸   | 48  | 0x30 | `0` |
| 广   | 50  | 0x32 | `2` |
| 之   | 54  | 0x36 | `6` |

→ `35 38 31 30 32 36` → **`581026`**

> 能反查的前提： `table` 去重后 **仍是 256 个不重复字符**，0~255 每个字节值都有唯一对应字符（全排列/双射）。若表有重复项， `indexOf` 只能取首次出现的下标，就解不出唯一答案。

### 3.3 回代校验

```python
bytesToAliSmsCode(table, "581026".getBytes("utf-8")) == "义弓么丸广之"   ✅
```

等价于：输入 `581026` 点登录，日志 `enPassword:义弓么丸广之` 与 `pw:义弓么丸广之` 一致，弹窗 `恭喜！！！破解成功！！！` 。

## 四、备用方案：纯静态提取（不用设备）

```python
raw = open("assets/logo.png", "rb").read()
table = raw[89473:89473 + 768].decode("utf-8")    # 256 个汉字
pw    = raw[91265:91265 + 18].decode("utf-8")     # "义弓么丸广之"
password = bytes(table.index(c) for c in pw)      # b"581026"
```

> 这两段数据藏在 `assets/logo.png` 的 `IEND` chunk（偏移 89465） **之后**，属于"PNG 尾部追加数据"的隐写写法，看图工具完全看不到，必须按字节偏移取。

## 五、流程与结论

```python
全局搜索"密码" → 命中 dialog_error_tips 字符串
   → 全局搜索 dialog_error_tips → 命中 onClick 失败分支
   → 往上读还原完整校验逻辑
   → 取 table(logo.png[89473,768)) + pw(logo.png[91265,18))
   → table.indexOf 反查密文 → 字节 35 38 31 30 32 36
   → 密码 = 581026
```

| 项目  | 结果  |
| --- | --- |
| 密码  | **581026** |
| 校验方式 | 查表替换后做字符串相等比较 |
| 数据藏匿位置 | `assets/logo.png` 的 IEND 之后（偏移 89473 / 91265） |
| 是否需要动态调试 | **不需要**，纯静态可解；hook 仅用于验证 |

**经验总结**

1.  **锚点法**：先用可见文案做全局限定搜索，比通读代码快得多。
2.  **跟资源 id 的引用**： `R.string.xxx` 往往只被一处引用，等于直达关键分支。
3.  **对硬编码偏移要敏感**： `arraycopy(b, 91265, ...)` 这类"魔法数字"是藏数据最典型的手法。
4.  **先判断算法可逆性**：查表类算法看表有无重复项，全排列可直接反查。
5.  **hook 前先看日志**：本题已埋 `Log.i("lil", ...)` ， `adb logcat` 就能拿到中间值。

* * *
