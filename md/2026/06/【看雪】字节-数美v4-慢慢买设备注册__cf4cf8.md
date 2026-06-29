---
title: 【看雪】字节 数美v4 慢慢买设备注册
source: https://bbs.kanxue.com/thread-291807.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-29T10:45:56+08:00
trace_id: aaba9801-bf74-4072-b08e-3fb904a814ff
content_hash: 798f3b17c1a9597502d8203e4ec6f2ef39748288795e44f9c7bd8f7cc833243c
status: summarized
tags:
  - 看雪
series: null
feed_source: null
ai_summary: 通过模拟字节、数美、慢慢买三重设备注册与签名，绕过慢慢买App的最新风控系统，以获取商品优惠券数据。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38e75244-d011-81fe-9ac4-da9e93efb808
ioc:
  cves: []
  cwes: []
  hashes:
    - 3e41d1331f5ddafcd0a38fe2d52ff66f
    - 3f1a9c47e0b2d85af6c319e74d20b8aa15ce6037f9b4c81d2e7a04f6b3589c1e
    - 8b27e6f04a1c93d57e0286bf4d19a3cc62f085e1d7b3940a8c25e6f1b09d473a
    - c50d9a31f8e2470b6da1c83057f9e24b3a6c108de7f5b29014ac836e5d1b079f
    - d64c8c7b13610bd7a1d68d07074c05bcd086aae0c24fe9fc2fb43b91eae6ece6
    - e4976abde986a4cff466c2e86bbcb381
  domains:
    - apapia-common.manmanbuy.com
    - apapia-history-weblogic.manmanbuy.com
    - bbs.kanxue.com
    - fp-it.fengkongcloud.com
    - item.jd.com
    - item.taobao.com
    - klink.volceapplog.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过模拟字节、数美、慢慢买三重设备注册与签名，绕过慢慢买App的最新风控系统，以获取商品优惠券数据。
> 
> - **对抗历程：** 作者持续对抗该App约一年，风控已从“业务接口参数随机”升级至“字节+数美v4+慢慢买设备注册”三条线严格校验。
> - **难点突破：** App使用了爱加密壳，需先过反Frida和Xposed检测，才能dump出真实SO库以分析业务逻辑。
> - **核心机制：** 爬虫需依次完成字节设备注册（获取`bd_did`）、数美设备注册（获取`sm_deviceid`）、慢慢买业务设备注册（获取`mmbDevId`）。
> - **代码实现：** 提供的Python代码完整实现了设备信息伪造、关键参数生成、请求体加密（涉及DES、AES、RSA）及签名流程。
> - **未解问题：** 注册的设备很快会失效并触发登录风控，作者目前通过每次业务请求前重新注册设备来规避。

> 慢慢买最新版无登录设备注册风控，这app挺舍得定制sdk的，当然我不知道定制价格，前后跟这app持续对抗差不多一年了，从最开始的业务接口参数随机就能过风控请求，过渡到上字节+慢慢买自己业务的设备注册，再到字节+数美v4+慢慢买设备注册三条线严格校验，哦对了这玩意儿有个爱加密的壳，反frida和xposed，要搞业务so需要先过检测然后dump出真实so，这条线还有个风控点我没处理掉，注册下来的设备很快就会失效，接口会返回登录，所以目前我是每次请求业务接口都注册一套新设备，理论上一套设备复用个两次没啥问题，具体就大家自己去分析了吧；整个过程感谢各位大佬对我的思路提醒，这篇文章我只给算法，具体细节我就不想讲了，确实有太多点需要处理了，而且我也知道大多数人其实只想要个成品，希望对你的业务有所帮助~

### test.py

```python
# -*- coding: utf-8 -*-
"""这里面有个环境指纹文件我就不给了，需要的自己去hook一下，因为一大堆参数，我懒得删我本机的"""
import os
import time
import uuid
import random
import json
import hashlib

from curl_cffi import requests
import mmb_crypto as C
import device_models as DM


FP_TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "fp_template.json")
with open(FP_TEMPLATE_PATH, encoding="utf-8") as f:
    FP_TEMPLATE = f.read()


REQ_KWARGS = {
    "impersonate": "chrome",
    "proxies": None
}


def rand_hex(n: int) -> str:
    return "".join(random.choices("0123456789abcdef", k=n))


def gen_sm_deviceid(openudid: str, model: dict, retry_count = 3):
    """数美设备注册"""
    for i in range(retry_count):
        try:
            base = DM.apply_to_fp(json.loads(FP_TEMPLATE), model)

            fp = json.loads(C.sm_random_fingerprint(json.dumps(base, ensure_ascii=False)))

            fp["a24"] = openudid

            fp_json = json.dumps(fp, ensure_ascii=False, separators=(",", ":"))

            body = C.sm_build_deviceprofile(fp_json)

            dalvik_ua = DM.build_uas(model)[1]

            response = requests.post(url="https://fp-it.fengkongcloud.com/deviceprofile/v4",
                data=json.dumps(body, separators=(",", ":")).encode(),
                headers={
                    "Content-Type": "application/octet-stream",
                    "User-Agent": dalvik_ua
                },
                timeout=15,
                **REQ_KWARGS
            )

            j = response.json()
            if j.get("code") != 1100 or not j.get("detail", {}).get("deviceId"):
                raise Exception(f"数美注册失败：{response.text}")
            return "B" + j["detail"]["deviceId"]
        except:
            pass
    return None



class MmbDevice:
    def __init__(self):
        self.model = DM.pick()

        # 字节注册/业务画像
        self.P = DM.build_P(self.model)
        self.wv_ua, self.dalvik_ua = DM.build_uas(self.model)

        self.clientudid = str(uuid.uuid4())
        self.cdid = str(uuid.uuid4())
        self.openudid = rand_hex(16)
        self.oaid = rand_hex(16)
        self.aaid = str(uuid.uuid4())
        self.vaid = rand_hex(16)

        self.c_session = hashlib.sha256(uuid.uuid4().bytes).hexdigest()
        self.bd_did = None
        self.ssid = None
        self.install_id = None
        self.mmbDevId = None
        self.act_time = None
        self.sm_deviceid = ""

        self.firstquerendate = str(int(time.time() * 1000))

    def register(self, retry_count = 3):
        """字节 设备注册（拿 bd_did/iid/ssid）"""
        for i in range(retry_count):
            try:
                now = int(time.time() * 1000)
                P = self.P

                header = {
                    "platform": "Android",
                    "sdk_lib": "Android",
                    "device_model": P["device_model"],
                    "device_brand": P["device_brand"],
                    "device_manufacturer": P["manufacturer"],
                    "cpu_abi": "arm64-v8a",
                    "sdk_target_version": 29,
                    "git_hash": "4e83788",
                    "os": "Android",
                    "os_api": P["os_api"],
                    "os_version": P["os_version"],
                    "sdk_version": P["sdk_version"],
                    "sdk_version_code": P["sdk_version_code"],
                    "sdk_version_name": P["sdk_version_name"],
                    "channel": P["channel"],
                    "not_request_sender": 0,
                    "aid": P["aid"],
                    "app_region": "CN",
                    "density_dpi": P["density_dpi"],
                    "display_density": "xxhdpi",
                    "resolution": P["resolution"],
                    "language": "zh",
                    "timezone": 8,
                    "region": "CN",
                    "tz_name": "Asia/Shanghai",
                    "tz_offset": 28800,
                    "build_serial": "",
                    "sim_serial_number": [],
                    "access": "wifi",
                    "package": "com.manmanbuy.bijia",
                    "app_version": P["app_version"],
                    "app_version_minor": "",
                    "version_code": P["version_code"],
                    "update_version_code": P["version_code"],
                    "manifest_version_code": P["version_code"],
                    "display_name": "慢慢买",
                    "rom": P["rom"],
                    "rom_version": P["rom_version"],
                    "register_time": 0,
                    "sig_hash": P["sig_hash"],
                    "sim_region": "cn",
                    "carrier": P["carrier"],
                    "mcc_mnc": P["mcc_mnc"],
                    "clientudid": self.clientudid,
                    "openudid": self.openudid,
                    "cdid": self.cdid,
                    "oaid": {
                        "req_id": str(uuid.uuid4()),
                        "hw_id_version_code": "null",
                        "take_ms": "15",
                        "is_track_limited": "false",
                        "query_times": "1",
                        "id": self.oaid,
                        "time": str(now)
                    },
                    "req_id": str(uuid.uuid4()),
                    "oaid_may_support": True,
                }

                packet = C.encrypt_request_obj({"magic_tag": "ss_app_log", "header": header, "_gen_time": now})

                response = requests.post(
                    url=f"https://klink.volceapplog.com/service/2/device_register/?aid={P['aid']}",
                    data=packet,
                    timeout=15,
                    headers={
                        "User-Agent": self.dalvik_ua,
                        "Accept-Encoding": "gzip",
                        "Content-Type": "application/octet-stream;tt-data=a"
                    },
                    **REQ_KWARGS
                )

                j = response.json()
                self.bd_did = j["bd_did"]
                self.ssid = j.get("ssid")
                self.install_id = j.get("install_id_str") or str(j.get("install_id"))
                print(f"字节设备注册:{j}")
                return j
            except:
                pass
        return None

    def _device_info(self) -> str:
        P = self.P
        device_dict = {
            "apicloudDevId": "00000000",
            "appVersion": P["app_version"],
            "brand": P["device_brand"],
            "deviceModel": P["device_model"],
            "hsDid": self.bd_did,
            "hsSsid": self.ssid,
            "sessionId": self.oaid,
            "systemDevId": self.oaid
        }
        return C.enc_device(device_dict)

    def _common(self) -> dict:
        P = self.P
        return {
            "c_app": "mmb",
            "c_appver": P["app_version"],
            "c_ostype": "android",
            "c_osver": P["os_version"],
            "c_devid": "00000000",
            "c_devmodel": P["device_model"],
            "c_brand": P["device_brand"],
            "c_operator": P["carrier"],
            "c_engine": "0.71.3",
            "c_did": self.bd_did,
            "c_ssid": self.ssid,
            "c_session": self.c_session,
            "c_oaid": self.oaid,
            "c_aaid": self.aaid,
            "c_vaid": self.vaid,
            "c_systemDevId": C.gen_systemDevId(self.openudid),
            "c_fixDevId": C.gen_fixDevId(self.openudid),
            "c_ddToken": "",
            "sm_deviceid": self.sm_deviceid,
            "c_mmbncid": "",
            "c_firstchannel": P["channel"],
            "c_channel": P["channel"],
            "c_firstquerendate": self.firstquerendate,
            "c_fristversion": P["app_version"],
            "c_dp": "1",
            "c_win": "w_393_h_791",
            "c_safearea": "34.181819915771484_0",
            "c_theme": "light",
            "c_ctrl": "Privacy",
            "c_individ": "",
            "c_jpush": "",
            "c_mjtNameConfig": "",
            "c_mmbActTime": self.act_time or "",
            "c_patch": "",
            "c_promote": "",
            "c_userStatus": "",
            "c_uuid": "",
            "mmbyhm": "",
            "u_avatar": "",
            "sign": "",
            "jsoncallback": "?",
        }

    def get_mmb_dev_id(self) -> dict:
        p = self._common()
        p.update({
            "oldMmbDevId": "",
            "deviceInfo": self._device_info(),
            "sessionId": self.c_session,
            "logInfo": "",
            "async": "0",
            "businessId": "initLaunch",
            "t": str(int(time.time() * 1000)),
            "c_mmbDevId": ""
        })
        p["token"] = C.getToken(p)

        r = requests.post(
            url="https://apapia-common.manmanbuy.com/common/api/init/getMmbDevId",
            data=C.build_body(p),
            timeout=15,
            headers={
                "User-Agent": self.wv_ua,
                "Accept": "*/*",
                "Accept-Encoding": "gzip",
                "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
            },
            **REQ_KWARGS
        )

        j = r.json()
        res = j.get("result") or {}

        self.mmbDevId = res.get("mmbDevId")
        self.act_time = res.get("actTime")
        if res.get("sessionId"):
            self.c_session = res["sessionId"]
        print(f"业务设备注册:{j}")
        return j

    def business_call(self, api_url: str, extra: dict, ctrl: str, retry_count = 3):
        for i in range(retry_count):
            try:
                p = self._common()
                p["c_ctrl"] = ctrl
                p["c_mmbDevId"] = self.mmbDevId or ""
                p["c_mmbActTime"] = self.act_time or ""
                p["c_session"] = self.c_session

                p.update(extra)
                p["t"] = str(int(time.time() * 1000))
                p["token"] = C.getToken(p)

                r = requests.post(
                    url=api_url,
                    data=C.build_body(p),
                    timeout=15,
                    headers={
                        "User-Agent": self.wv_ua,
                        "Accept": "*/*",
                        "Accept-Encoding": "gzip",
                        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
                    },
                    **REQ_KWARGS
                )

                if "当前访问人数" in r.text:
                    raise Exception(f"设备登录风控")

                return r.json()
            except:
                pass
        return None

    def site_parse(self, url: str):
        extra_params = {
            "methodName": "commonMethod",
            "scene": "TrendAlertComponent",
            "searchKey": url
        }
        response = self.business_call(
            api_url="https://apapia-common.manmanbuy.com/SiteCommand/parse",
            extra=extra_params,
            ctrl="Tabs"
        )
        print(f"parse:{response}")
        if not response:
            return None
        else:
            return {"sette": response.get("result", {}).get("stteId", ""), "site_link": response.get("result", {}).get("link", "")}

    def instant(self, stte_id: str, site_link: str):
        """慢慢买商品到手价和优惠券"""
        extra_params = {
            "methodName": "trendJava",
            "currentScene": "TrendDetailRecent",
            "pagecFrom": "TrendAlertComponent",
            "searchKey": site_link,
            "url": site_link,
            "stteId": stte_id,
            "useZhekouInfo": "false",
            "exchangeTestGroup": "testA",
            "jinTieTestGroup": "testA",
            "queryGovSubsidy": "testA",
            "testGroupHideDiscount": "testB",
            "testGroupSameRecommend": "testA"
        }
        response = self.business_call(
            "https://apapia-history-weblogic.manmanbuy.com/promotion/v2/instant",
            extra=extra_params,
            ctrl="TrendDetailScene"
        )
        print(f"coupon:{response}")
        if not response:
            return None
        else:
            return response


def get_coupon(url: str):
    d = MmbDevice()

    d.sm_deviceid = gen_sm_deviceid(d.openudid, d.model)
    if not d.sm_deviceid:
        return None

    d.register()

    d.get_mmb_dev_id()
    if not d.mmbDevId:
        return None

    stte_data = d.site_parse(url)
    if not stte_data:
        return None

    coupon_data = d.instant(stte_data['sette'], stte_data['site_link'])
    if not coupon_data:
        return None

    return coupon_data



if __name__ == "__main__":
    # urls = ["http://item.jd.com/10100158399524.html"]  # 10098886895549
    data = get_coupon("https://item.taobao.com/item.htm?id=995595406124")
```

### mmb\_crypto.py

```python
# -*- coding: utf-8 -*-
import gzip, json, random, uuid, hashlib, base64, zlib, collections, string
from io import BytesIO
from hashlib import sha512
from urllib.parse import quote
from Crypto.Cipher import AES, DES
import os, re, time
from Crypto.Util.Padding import pad, unpad
from cryptography.hazmat.primitives.asymmetric import padding as _pad
from cryptography.hazmat.primitives import hashes as _h

SALT = "3E41D1331F5DDAFCD0A38FE2D52FF66F"

def getToken(data: dict) -> str:
    post = collections.OrderedDict(sorted(data.items(), key=lambda x: x[0]))
    s = ""
    for k, v in post.items():
        if v == "":
            continue
        s += quote(str(k).upper(), safe="") + quote(str(v).upper(), safe="")
    return hashlib.md5((SALT + s + SALT).encode("utf-8")).hexdigest().upper()

def build_body(params: dict) -> str:
    return "&".join(quote(str(k), safe="") + "=" + quote(str(v), safe="") for k, v in params.items())

_KEY_FIELD_DES = b"ebc09438"
_KEY_JSON_AES  = b"vbc1945811730h7ef4fpcfxc0ed31dd6"
_KEY_DEV_DES   = b"abd0b73n"
_SALT_DEV      = "mmb6w8t3c5mm88"
_SALTED_FIELDS = ["apicloudDevId", "appVersion", "brand", "deviceModel",
                  "hsDid", "hsSsid", "sessionId", "systemDevId"]

def _des_hex(text: str, key: bytes) -> str:
    return DES.new(key, DES.MODE_ECB).encrypt(pad(text.encode("utf-8"), 8)).hex()

def gen_systemDevId(openudid: str) -> str:
    return _des_hex(openudid, _KEY_DEV_DES)

def gen_fixDevId(openudid: str) -> str:
    rnd15 = "".join(random.choices("0123456789", k=15))
    plaintext = f"{openudid}__{rnd15}__e5c6943811c3057__{uuid.uuid4()}"
    return _des_hex(plaintext, _KEY_DEV_DES)

def enc_device(raw: dict) -> str:
    inner = {k: _des_hex((v + _SALT_DEV) if k in _SALTED_FIELDS else v, _KEY_FIELD_DES)
             for k, v in raw.items()}
    s = json.dumps(inner, separators=(",", ":")).encode("utf-8")
    return AES.new(_KEY_JSON_AES, AES.MODE_ECB).encrypt(pad(s, 16)).hex()


_MAGIC = bytes.fromhex("123920200203")
_KDF_CONST = bytes.fromhex(
    "490cc21292b05d0cc06ccbe91fb92e21b5a7c538811dc85e27a96e28104"
    "e1cf69c7166efab232807390da78a8b91e49c44b49a43feb941a1e46f"
    "2656e613e47b")

def _java_gzip(data: bytes) -> bytes:
    out = BytesIO()
    with gzip.GzipFile(fileobj=out, mode="wb", mtime=0) as gz:
        gz.write(data)
    return out.getvalue()

def _derive_key_iv(rand32: bytes):
    h1 = sha512(rand32).digest()
    h2 = sha512(h1 + _KDF_CONST).digest()
    return h2[:16], h2[16:32]

def tt_encrypt(data: bytes, rand32: bytes = None) -> bytes:
    rand32 = os.urandom(32) if rand32 is None else rand32
    key, iv = _derive_key_iv(rand32)
    plain = sha512(data).digest() + data
    cipher = AES.new(key, AES.MODE_CBC, iv).encrypt(pad(plain, 16))
    return _MAGIC + rand32 + cipher

def encrypt_request_obj(obj: dict, rand32: bytes = None) -> bytes:
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return tt_encrypt(_java_gzip(raw), rand32=rand32)

SM_IV = b"0102030405060708"

def sm_deflate(b: bytes) -> bytes:
    c = zlib.compressobj(9, zlib.DEFLATED, -15, 8, 0)   # raw deflate, level9, wbits=-15
    return c.compress(b) + c.flush()

def sm_aes_encrypt(plain: bytes, key: bytes) -> bytes:
    return AES.new(key, AES.MODE_CBC, SM_IV).encrypt(pad(plain, 16))

def sm_aes_decrypt(ct: bytes, key: bytes) -> bytes:
    return unpad(AES.new(key, AES.MODE_CBC, SM_IV).decrypt(ct), 16)

def sm_make_data(fingerprint_bytes: bytes, key: bytes) -> str:
    return base64.b64encode(sm_aes_encrypt(sm_deflate(fingerprint_bytes), key)).decode()

def sm_recover_fingerprint(data_b64: str, key: bytes) -> bytes:
    return zlib.decompress(sm_aes_decrypt(base64.b64decode(data_b64), key), -15)

SM_ORG = "52cvMRfmoOvHqDpzG0af"
SM_CERT_B64 = (
    "MIIDLzCCAhegAwIBAgIBMDANBgkqhkiG9w0BAQUFADAyMQswCQYDVQQGEwJDTjELMAkGA1UECwwCU00xFjAUBgNV"
    "BAMMDWUuaXNodW1laS5jb20wHhcNMjQxMjEwMDkwMDA3WhcNNDQxMjA1MDkwMDA3WjAyMQswCQYDVQQGEwJDTjEL"
    "MAkGA1UECwwCU00xFjAUBgNVBAMMDWUuaXNodW1laS5jb20wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIB"
    "AQCNNfSd40mm/CL0HgImL/kvyMKt/NPVHbIjRSX5d7GpH4Y7nRKAjtfINHvU/avACrfAz3iaYOnZVIneZS/2ELK"
    "/8JJMUzTpEFO3Yfb/1zdrE0uXmZrvKTZwJunLazJtdRfKlREhTgM8sC/M4fjcbTPs0ghlDOnJ95TbV9GSz86JNH"
    "riFtwL0lSX9f1e6J8gE8KrOelvQEAhsUls+yMl62gFRHmp7PtVAPSPo8xi4lxh4iLtZyM0wk1PIgGrf96Ux/tJS"
    "OGTLdAp2Wr95i5YOt/seoBPizKsjlRov+o0RxH5nvjRqCUkVrhMr/FR81EUJCQN7ICAT+WT/kfuAeQFJup5AgMB"
    "AAGjUDBOMB0GA1UdDgQWBBSdisi/Yg6hLh9FUL1//a+u4f8udTAfBgNVHSMEGDAWgBSdisi/Yg6hLh9FUL1//a+"
    "u4f8udTAMBgNVHRMEBTADAQH/MA0GCSqGSIb3DQEBBQUAA4IBAQAe9uhrWuopql/h6s1gi6DoY5EL9g8zQodV6Qj"
    "6upPmTqiLusvpdLOQWQFr/0bhOh/XvhJ7K0paibSjUR/LG3+aY2qWJflK26dU7hEb4VX8NXkdrssH/rsq82FWlM"
    "rZsTs+sU+tRC95VFwF2kUcPg4MKUuIGQxp93cKT0mZ/mf5xKtL1rhCMjZPPHAmwL1+WUjppTOHq9ySeGo4hPbn4"
    "xKMJyxiWxyAocq5dU8IuKD8GOKvDENjAPxlU8CQXinmqK8yZWaT+EYj/5RU6t1NTGOrSDfRZEe5YMQEEbgq+15t"
    "BG1fT3BLQZPIBcJ2I0pwo38yA4pZMDLELQih+l/vm0i4")

_sm_pub = None
def _sm_pubkey():
    global _sm_pub
    if _sm_pub is None:
        from cryptography.x509 import load_der_x509_certificate
        _sm_pub = load_der_x509_certificate(base64.b64decode(SM_CERT_B64)).public_key()
    return _sm_pub

def sm_oaep(plaintext: bytes) -> str:
    return base64.b64encode(_sm_pubkey().encrypt(plaintext, _pad.OAEP(
        mgf=_pad.MGF1(_h.SHA256()), algorithm=_h.SHA256(), label=None))).decode()

def sm_gen_ep_key():
    ep_pt = "".join(random.choices(string.ascii_letters + string.digits, k=16))
    return ep_pt, hashlib.md5(ep_pt.encode()).hexdigest()

def sm_build_deviceprofile(fingerprint_json: str, with_tn: bool = True) -> dict:
    ep_pt, R = sm_gen_ep_key()
    body = {"organization": SM_ORG, "os": "android", "appId": "default", "encode": 2, "compress": 3,
            "data": sm_make_data(fingerprint_json.encode("utf-8"), R.encode()),
            "ep": sm_oaep(ep_pt.encode())}
    if with_tn:
        body["tn"] = sm_oaep("".join(random.choices("0123456789abcdef", k=32)).encode())
    return body

def sm_random_fingerprint(template_json: str) -> str:
    J = json.loads(template_json)
    now = int(time.time() * 1000)
    hx = lambda n: "".join(random.choices("0123456789abcdef", k=n))
    al = lambda n: "".join(random.choices(string.ascii_letters + string.digits, k=n))
    b64u = lambda nbytes: base64.urlsafe_b64encode(os.urandom(nbytes)).decode()

    def remap(s):
        out = []
        for part in s.split(";"):
            if ":" not in part:
                continue
            k, _, v = part.partition(":")
            try:
                nv = max(1, int(int(v) * random.uniform(0.6, 1.7)))
            except ValueError:
                nv = v
            out.append("%s:%s" % (k, nv))
        return ";".join(out) + ";"

    if "a24" in J:  J["a24"] = hx(16)
    if "a21" in J:  J["a21"] = hx(32)
    if "a163" in J: J["a163"] = hx(32)
    if "a84" in J:  J["a84"] = base64.b64encode(os.urandom(32)).decode() + "___"
    if "a60" in J:  J["a60"] = "u0_a" + str(random.randint(120, 399))

    J["a9"] = now
    if "a80" in J: J["a80"] = "%d-%d" % (now - random.randint(100, 600), random.randint(10000, 99999))
    if "a40" in J: J["a40"] = now - random.randint(3600000, 30 * 86400000)
    if isinstance(J.get("a125"), dict):
        t = now - random.randint(86400000, 60 * 86400000)
        J["a125"] = {"fit": t, "lut": t}
    if isinstance(J.get("a72"), dict):                                     # 电池
        J["a72"]["temp"] = random.randint(260, 360)
        J["a72"]["vol"] = random.randint(3700, 4450)
        J["a72"]["level"] = random.randint(20, 100)
        J["a72"]["status"] = random.choice([2, 2, 3, 5])
    if isinstance(J.get("a120"), dict):                                    # 触摸/渲染指标
        J["a120"]["tt"] = random.randint(5_000_000, 40_000_000)
        J["a120"]["tr"] = random.randint(40_000_000, 220_000_000)
        J["a120"]["mt"] = random.randint(20_000, 45_000)
    if "a170" in J: J["a170"] = random.randint(3_000_000, 20_000_000)
    if "a171" in J: J["a171"] = J.get("a170", 8_000_000) + random.randint(20_000_000, 60_000_000)
    if "a37" in J:  J["a37"] = random.randint(32, 34)
    if "a65" in J:  J["a65"] = random.randint(700, 1300)
    if "a127" in J: J["a127"] = random.randint(12, 14)
    if "a133" in J: J["a133"] = random.randint(200, 1300)
    if isinstance(J.get("a144"), str): J["a144"] = remap(J["a144"])
    for k in ("a69", "a70"):
        if isinstance(J.get(k), int): J[k] = J[k] - random.randint(0, 2_000_000_000)

    if "a16" in J:
        try:
            b = json.loads(J["a16"])
            # 身份
            if "b7" in b:  b["b7"] = hx(32).upper()
            if "b8" in b:  b["b8"] = hx(32).upper()
            if "b22" in b: b["b22"] = str(uuid.uuid4())
            if "b23" in b: b["b23"] = al(32)
            if isinstance(b.get("b38"), dict) and "xy" in b["b38"]: b["b38"]["xy"] = al(32)
            base = random.randint(0x5000000000, 0x7FFFFFFFFF) & ~0xF
            if "b36" in b: b["b36"] = "8|0x%x|0xfd7bbea9|0xf30b00f9|0xfd030091|0xa81400f0|0x080540f9|" % base
            if "b37" in b: b["b37"] = "8|0x%x|0xfd7bbea9|0xf30b00f9|0xfd030091|0xa81400f0|0x081540f9|" % (base + 0xA0)
            if isinstance(b.get("b51"), str): b["b51"] = remap(b["b51"])
            if "b61" in b: b["b61"] = random.randint(700, 999)
            if "b24" in b: b["b24"] = "false"                              # VPN(tun0/ppp0 via ioctl SIOCGIFADDR)：无 VPN
            if "b1" in b:  b["b1"] = "false"
            if "b15" in b: b["b15"] = "false"                              # 模拟器检测：非模拟器
            J["a16"] = json.dumps(b, ensure_ascii=False, separators=(",", ":"))
            app_tok, apk_tok = b64u(16), b64u(16)
            J["a16"] = re.sub(r'~~[A-Za-z0-9_\-]{22}==', lambda m: "~~" + app_tok, J["a16"])
            J["a16"] = re.sub(r'(com\.manmanbuy\.bijia-)[A-Za-z0-9_\-]{22}==',
                              lambda m: m.group(1) + apk_tok, J["a16"])
        except Exception:
            pass
    return json.dumps(J, ensure_ascii=False, separators=(",", ":"))
```

### device\_models.py

```python
# -*- coding: utf-8 -*-
import random
import json

APP = dict(
    app_version="5.1.41", version_code=2135, aid="237094", channel="小米",
    sdk_version=6170090, sdk_version_code=16169689, sdk_version_name="6.17.0",
    sig_hash="e4976abde986a4cff466c2e86bbcb381",
)


_PLATFORM = dict(
    board="gold", hardware="mt6833", soc_abi="arm64-v8a",
    radio="MOLY.NR15.R3.MP.V120.3.P62,MOLY.NR15.R3.MP.V120.3.P62",
    scr_w=1080, scr_h=2176, dpi=440, cores=8, cpu_freq_khz=2400000,
    os_version="14", os_api=34, build_id="UP1A.231005.007",
    miui_name="V816", miui_code="816", vendor_dlkm="vnd_gold",
    launcher_pkg="com.miui.home", launcher_ver="RELEASE-4.39.14.7723-03121923",
    launcher_label="系统桌面", brd="mu",
)


def _m(**kw):
    d = dict(_PLATFORM)
    d.update(kw)

    d.setdefault("incremental", "V816.0.11.0.UNQ" + d["region"])
    d["fingerprint"] = "%s/%s/%s:%s/%s/%s:user/release-keys" % (
        d["brand"], d["board"], d["board"], d["os_version"], d["build_id"], d["incremental"])
    d["rom"] = "MIUI-" + d["incremental"]
    d["rom_version"] = "miui_%s_%s" % (d["miui_name"], d["incremental"])
    return d


MODELS = [
    _m(name="Redmi Note 13 Pro 5G (CN/8G)", model="2312DRAABC", brand="Redmi", manufacturer="Xiaomi",
       region="CNXM", ram=7937007616, mcc_mnc="46011", carrier="中国电信",
       vbmeta="d64c8c7b13610bd7a1d68d07074c05bcd086aae0c24fe9fc2fb43b91eae6ece6",
       build_host="pangu-build-component-system-418716-plpdl-0dvbz-4zxp0"),
    _m(name="Redmi Note 13 Pro 5G (Global/8G)", model="2312DRAABG", brand="Redmi", manufacturer="Xiaomi",
       region="MIXM", ram=7937007616, mcc_mnc="46000", carrier="中国移动",
       vbmeta="3f1a9c47e0b2d85af6c319e74d20b8aa15ce6037f9b4c81d2e7a04f6b3589c1e",
       build_host="pangu-build-component-system-502771-kq2mn-7xv3z-9bcd1"),
    _m(name="Redmi Note 13 Pro 5G (India/8G)", model="2312DRAABI", brand="Redmi", manufacturer="Xiaomi",
       region="INXM", ram=7937007616, mcc_mnc="46001", carrier="中国联通",
       vbmeta="8b27e6f04a1c93d57e0286bf4d19a3cc62f085e1d7b3940a8c25e6f1b09d473a",
       build_host="pangu-build-component-system-471902-mt8pl-3kz0v-6dfa2"),
    _m(name="Redmi Note 13 Pro 5G (CN/12G)", model="2312DRAABC", brand="Redmi", manufacturer="Xiaomi",
       region="CNXM", ram=12348030976, mcc_mnc="46011", carrier="中国电信",
       incremental="V816.0.13.0.UNQCNXM",
       vbmeta="c50d9a31f8e2470b6da1c83057f9e24b3a6c108de7f5b29014ac836e5d1b079f",
       build_host="pangu-build-component-system-439015-zl7qn-2vx8d-8acb3"),
]


def pick():
    return random.choice(MODELS)


def build_P(m):
    P = dict(APP)
    P.update(
        device_model=m["model"], device_brand=m["brand"], manufacturer=m["manufacturer"],
        os_version=m["os_version"], os_api=m["os_api"], rom=m["rom"], rom_version=m["rom_version"],
        resolution="%dx%d" % (m["scr_h"] + 224, m["scr_w"]),
        density_dpi=m["dpi"], carrier=m["carrier"], mcc_mnc=m["mcc_mnc"],
    )
    return P


def build_uas(m):
    wv = ("Mozilla/5.0 (Linux; Android %s; %s Build/%s; wv) "
          "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.193 "
          "Mobile Safari/537.36 - mmbWebBrowse - android" % (m["os_version"], m["model"], m["build_id"]))
    dalvik = "Dalvik/2.1.0 (Linux; U; Android %s; %s Build/%s)" % (m["os_version"], m["model"], m["build_id"])
    return wv, dalvik


def apply_to_fp(fp: dict, m: dict) -> dict:
    fp["a46"] = {"cpu_abi": m["soc_abi"], "fingerprint": m["fingerprint"], "radioVersion": m["radio"],
                 "model": m["model"], "cpu_abi2": "", "brand": m["brand"], "board": m["board"],
                 "manufacturer": m["manufacturer"]}
    fp["a29"] = m["radio"]
    fp["a36"] = "%d,%d,%d" % (m["scr_w"], m["scr_h"], m["dpi"])
    fp["a92"] = "%d,%d" % (m["scr_w"], m["scr_h"])
    fp["a34"] = m["cpu_freq_khz"]
    fp["a32"] = m["cores"]
    fp["a48"] = m["ram"]
    if isinstance(fp.get("a18"), dict):
        fp["a18"]["ro.boot.hardware"] = m["hardware"]
    if isinstance(fp.get("a154"), dict):
        fp["a154"] = {"ver": m["launcher_ver"], "label": m["launcher_label"], "pkg": m["launcher_pkg"]}
    # a16 内的系统属性字典 b13 / b57
    if "a16" in fp:
        b = json.loads(fp["a16"])
        b13 = b.get("b13")
        if isinstance(b13, dict):
            b13.update({
                "ro.build.display.id": m["build_id"], "ro.product.model": m["model"],
                "ro.product.board": m["board"], "ro.product.brand": m["brand"],
                "ro.product.name": m["board"], "ro.product.manufacturer": m["manufacturer"],
                "ro.boot.hardware": m["hardware"], "ro.build.fingerprint": m["fingerprint"],
                "ro.miui.ui.version.name": m["miui_name"], "ro.miui.ui.version.code": m["miui_code"],
                "ro.boot.vbmeta.digest": m["vbmeta"], "ro.build.version.incremental": m["incremental"],
                "ro.product.vendor.model": m["model"],
            })
        b57 = b.get("b57")
        if isinstance(b57, dict):
            b57.update({"ro_build_host": m["build_host"], "ro_product_vendor_dlkm_name": m["vendor_dlkm"],
                        "ro_product_vendor_dlkm_brand": m["brand"], "ro_miui_ui_version_code": m["miui_code"]})
        if isinstance(b.get("b32"), dict):
            b["b32"]["brd"] = m["brd"]
        fp["a16"] = json.dumps(b, ensure_ascii=False, separators=(",", ":"))
    return fp
```

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#协议分析](https://bbs.kanxue.com/forum-161-1-120.htm) [#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm) [#源码框架](https://bbs.kanxue.com/forum-161-1-127.htm)
