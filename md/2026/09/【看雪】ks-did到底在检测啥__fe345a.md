---
title: 【看雪】ks did到底在检测啥
source: https://bbs.kanxue.com/thread-292852.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-03T21:32:09+08:00
trace_id: fa306ad3-79c5-46e2-b00d-a14ddabfd63c
content_hash: f68f33ef5bed91152f697a7bc5de772b04df2d6979ee9ec28ca00c2fe354ef82
status: synced
tags:
  - 看雪
  - 风控对抗
  - 协议分析
series: null
feed_source: 看雪·Android安全
ai_summary: 抖音/快手 did 风控不只看“设备指纹字段是否一致”，而是校验一组字段间的耦合关系（时间戳、序列、随机数、系统状态），简单替换字段会触发风控。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d075244-d011-8196-8afa-d721abddd13d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 抖音/快手 did 风控不只看“设备指纹字段是否一致”，而是校验一组字段间的耦合关系（时间戳、序列、随机数、系统状态），简单替换字段会触发风控。
> 
> - **核心问题：** 用户用 Frida 把快手的 `Watermelon.jniCommand` 里 k105、k89、指纹信息等替换成真实设备值，但注册出的 did 仍无法访问主页，说明 did 服务端校验的不只是可读的字段值。
> - **字段存在内部关联：** k105 代码特意把时间戳转成反向字符串，且模拟 1~10 天前访问系统目录；随机数和时间戳需要落在合理时间窗口。若直接注入静态值，时间与 `baseTime` 矛盾会被识别。
> - **替换值需要链路一致：** k46（ROM 大小）与 k5（存储块数）有比例关系；k39（开机时间）必须晚于系统编译时间并早于当前时间；k34(屏幕参数)、k27(型号)、k30 构建号之间要匹配真实机型。
> - **应检测的隐藏来源：** `b0.c` 读取内核文件（serial_number/boot_id）、`n.o` 检测 su 文件、`n.Q` 取字体 md5、`fetch_zhiwen` 取设备指纹对象等，这些源头若与返回给 jniCommand 的字符串不一致，就是更隐蔽的“风控信号”。
> - **修复方向不是改返回值，而是同步修改底层读取源。** 还应 hook 验证结果路径（如 `fetch_zhiwen` 中的 `_e`），确认最终用于签名的值确实是修改后的值；单个字段替换不足以让 did 被信任。

先不脱机，只是用frida替换掉设备信息，我把一个正常设备的信息拿来，注册的did是可以访问用户主页的。但我把信息改掉，就不行了。version:11.420.30xxx

```javascript
function getRandomStorageBytes() {
const randomBlockCount = Math.floor(Math.random() * (13106683 - 12106683 + 1)) + 11106683;
return randomBlockCount*4096;
}
 
 
function gen_k105() {
    function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
 
function randomNsec() {
    return randomInt(0, 999999999);
}
    const now = Math.floor(Date.now() / 1000);
 
    // 模拟 1~10 天前访问过系统目录
    const baseTime =
        now -
        randomInt(1, 10) * 86400 -
        randomInt(0, 3600);
 
    const values = [
        `${baseTime}::${randomNsec()}`,
 
        `${baseTime + randomInt(-2, 2)}::${randomNsec()}`,
 
        `${baseTime + randomInt(5, 30)}::${randomNsec()}`,
 
        `${baseTime + randomInt(3, 25)}::${randomNsec()}`,
 
        "nnn"
    ];
 
    return values.join("|").split('').reverse().join('');
}
 
function generateMacAddress(separator = ':') {
  const hexDigits = '0123456789abcdef';
  const mac = [];
 
  for (let i = 0; i < 6; i++) {
    if (i === 0) {
      // 保证首字节为单播 + 本地管理 (2, 6, a, e)
      const firstChar = hexDigits[Math.floor(Math.random() * 16)];
      const secondChar = ['2', '6', 'a', 'e'][Math.floor(Math.random() * 4)];
      mac.push(firstChar + secondChar);
    } else {
      const byte = Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0');
      mac.push(byte);
    }
  }
 
  return mac.join(separator);
}
function getTime_() {
    // 纯原生写法：模拟设备开机了 3 天 (3 * 24 * 3600 * 1000 ms)
const UPTIME_3_DAYS = 259200000*10;
 
// 第一次加载时锁定开机时间
const kaiji_time = Date.now() - UPTIME_3_DAYS;
  return kaiji_time;
}
function getRomValue(min = 1101979264, max = 12791979264) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
 
function generateSimpleUUID() {
  return 'xxxxxxxx-xxxx-4xxx-axxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0,
        v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function generateRandomString(length = 16) {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
//-----------------------------------------------------
 
const blocakCount=int64(getRandomStorageBytes());//k5
// const blocakCount=int64("118396899328");
 
console.log("k5:",blocakCount);//ANDROID_eae0ec49377cbc99
 
const k105=gen_k105();
// const k105="nnn|900000617::7638591871|410000882::8738591871|200000675::3538591871|100000001::1538591871";
console.log("k105:",k105);
 
let did3=null;//k7
 
 
 
// const k102=generateSimpleUUID();
// const k102="9527b144-c605-45fc-aa1c-b00958cb3c69";//true
// const k102="f3db669c-39ba-4ff9-ab64-1abebebfdc1c";
const k102=null;
console.log("k102:"+k102);
 
const k46=getRomValue();
// const k46=int64("12086202368");
console.log("k46:"+k46);
 
const k101=null;
console.log("k101:"+k101);
 
 
 
const k59="0";//pixel 6是1代表有su文件，0代表没有su文件
// const k59="1";//pixel 6是1代表有su文件，0代表没有su文件
 
const k39=getTime_();
// const k39=int64("1788430788073");
// const k39=int64("1788319130100");//true
console.log("k39:"+k39);
 
const k66=generateRandomString();//
// const k66="d5b5e43766e18c2a";//true
 
 
// const k30="BP1A.250305.019";
const k30="BP2A.250605.031.A3";
// const k35="15";
const k35="16";
const k34='[3.5,1440,2891,3.5,515.154,511.277]';
// const k34='[2.35,1080,2148,2.75,442.451,445.476]';
const k37=k30;
// const k52="raven";
const k52="prague";
// const k40="google/"+k52+"/"+k52+":"+k35+"/"+k30+"/13013188:user/release-keys";
const k40="Redmi/prague/prague:16/BP2A.250605.031.A3/OS3.0.311.0.WAACNXM:user/release-keys";
const k44="release-keys";
// const k47="slider-15.2-12893632";
const k47="c2f2-0.5-123132";
 
const k58=k52;
const k60="unknown";
// const k61="google";
const k61="Redmi";
const k63="android-build";
// const k84="fed73cd5f1cff1c7";
const k84="50908893213c2a9a";
// const k89="2050651419";
const k89="4182245113";
// const k16="r-456ae1c9fa6a8c5c-z9rx";
const k16="r-456ae2c9fa6a2123-z9rx";
const k19=k52;
const k28=k52;
// const k27="Pixel 6 Pro";
const k27="2604FRK1EC";
const k29="Dalvik/2.1.0 (Linux; U; Android "+k35+"; "+k27+" Build/"+k30+")";
const k64="";
 
//-------------------------------
function hook_jnicommand(){
    Java.perform(function (){
        var Watermelon = Java.use("com.kuaishou.dfp.envdetect.jni.Watermelon");
Watermelon["jniCommand"].implementation = function (i4, obj, obj2, obj3) {
    console.log(`Watermelon.jniCommand is called: i4=${i4}, obj=${obj}, obj2=${obj2}, obj3=${obj3}`);
if (i4===1114128){
    console.log("劫持k105成功"+k105);
    return k105;
}
if (i4===1114124){
 
    var res={"0":k89};
    console.log("1114124:"+JSON.stringify(res));
    return JSON.stringify(res);
 
}
if (i4===1179655){
    var res={"k61":k61,"k19":k19,"k58":k58,"k63":k63,"k28":k28,"k52":k52,"k27":k27,"k30":k30,"k40":k40,"k37":k37,"k44":k44,"k8":"user","k16":k16,"k47":k47,"k23":"Google","k64":k64}
    // var res={};
    console.log("指纹信息:"+JSON.stringify(res));
    return JSON.stringify(res);
}
if (i4===1179653){
    var res={};
    console.log("1179653 mac "+JSON.stringify(res));
    return JSON.stringify(res);
}
 
 
    let result = this["jniCommand"](i4, obj, obj2, obj3);
    console.log(`Watermelon.jniCommand result=${result}`);
         // console.log(Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Throwable").$new()));
    return result;
};
    })
}
function modify_model(){
    Java.perform(function (){
        var n = Java.use("t30.n");
var b0 = Java.use("t30.b0");
 
var a = Java.use("w30.a");
var d = Java.use("com.kuaishou.dfp.c.d");
d["z"].implementation = function (context) {
 
    return "KWE_OTHER";
};
a["d"].implementation = function (context, str) {
   console.log("k66 repair请求,android_id:"+k66);
    return k66;
};
 
a["a"].implementation = function (context, str) {
   console.log("k66 repair请求,android_id:"+k66);
    return k66;
};
var aa = Java.use("com.kwai.framework.deviceid.a");
aa["g"].implementation = function (contentResolver, str) {
 console.log("k66 repair请求,android_id:"+k66);
    return k66;
};
b0["w"].implementation = function () {
    console.log(`k27 repair:`+k27);
 
    return k27;
};
// a["c"].implementation = function (context, z) {
//     console.log("k66 repair请求,android_id:"+k66);
//     return k66;
// };
n["Q"].implementation = function () {
    console.log(`k84 font_to_md5:`+k84);
 
    return k84;
};
b0["y"].implementation = function () {
    console.log(`k60 radio:`+k60);
 
    return k60;
};
n["o"].implementation = function (context, z) {
 
    console.log(`k59 检测su文件：`+k59);
    return k59;
};
n["y"].implementation = function (context) {
    console.log(`k34 屏幕参数:`+k34);
    return k34;
};
n["g"].implementation = function () {
    console.log(`k35 安卓版本:`+k35);
 
    return k35;
};
b0["c"].implementation = function (str) {
    console.log(`b0.read_knerlFile is called: str=${str}`);
    if (str.indexOf("serial_number")>-1){
        return k101;
    }
    if (str.indexOf("boot_id")>-1){
        console.log("k102:"+k102);
        return k102;
    }
    let result = this["c"](str);
    console.log(`b0.read_knerlFile result=${result}`);
    return result;
};
n["z"].implementation = function () {
    console.log(`k46 内存总大小:`+k46);
 
    return k46;
};
n["G"].implementation = function () {
    console.log(`k39 开机时间:`+k39);
 
    return k39;
};
n["b"].implementation = function () {
    console.log(`n.get_useragent is called`+k29);
 
    return k29;
};
var h = Java.use("com.kwai.framework.deviceid.h");
h["a"].implementation = function (context) {
 
var i = Java.use("com.kwai.framework.deviceid.i");
 
i["h"].implementation = function () {
    console.log(`i.get_did3 is called`);
    let result = this["h"]();
    did3=result;
    console.log(` k7 i.get_did3 result=${result}`);
    return result;
};
 
 
    this["a"](context);
 
};
        n["D"].implementation = function () {
            console.log(`手机硬盘大小(k5):`+blocakCount);
            return blocakCount;
        };
    })
}
function repair_zhiwen() {
 
    Java.perform(function () {
var a = Java.use("t30.a");
 
a["b"].implementation = function (context, zVar, str, str2, eVar, z, z7, i4) {
    this["b"](context, zVar, str, str2, eVar, z, z7, i4);
 
    console.log("repair_zhiwen1:"+this._f.value);
};
    })
 
 
}
function fetch_zhiwen() {
 
    Java.perform(function () {
var a = Java.use("t30.a");
a["j"].implementation = function (zVar, bVar, eVar, z, z7) {
// console.log("zhiwen1:",a.e.value);
    console.log("fetch_zhiwen:",this._e.value);
 
    this["j"](zVar, bVar, eVar, z, z7);
};
    })
 
 
}
 
modify_model()
hook_jnicommand()
// aa()
repair_zhiwen()
fetch_zhiwen()
```
