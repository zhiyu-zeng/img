#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
repack_apk.py
=============
把补丁后的 libmsaoaidsec.so 塞回 APK, 去掉旧签名(META-INF/CERT.*、MANIFEST.MF 与
v2/v3 签名块在重建 zip 时自然丢弃), 供后续 zipalign + apksigner 重签名。

用法:
  python repack_apk.py 原.apk 补丁后.so 输出.apk

注意:
  * 其余 5537 个条目按原压缩方式原样搬运(内容不变, 仅重新打包);
  * 只替换 arm64 版; armeabi-v7a 版保留原样(如需 32 位进程也过检测, 需单独分析补丁);
  * 重签名后签名与原版不同, 若 App 有自校验会失败 -> 优先用 root 直接替换已安装
    的 /data/app/.../lib/arm64/libmsaoaidsec.so 方案(签名保持原版).
"""

import sys
import zipfile

TARGET = "lib/arm64-v8a/libmsaoaidsec.so"
OLD_SIG = {"META-INF/CERT.RSA", "META-INF/CERT.SF", "META-INF/MANIFEST.MF"}


def main():
    orig = sys.argv[1] if len(sys.argv) > 1 else r"D:\mihoyo逆向\com.mihoyo.hyperion_2.113.1.apk"
    patched = sys.argv[2] if len(sys.argv) > 2 else r"D:\mihoyo逆向\apk_unpack\lib\arm64-v8a\libmsaoaidsec_patched.so"
    out = sys.argv[3] if len(sys.argv) > 3 else r"D:\mihoyo逆向\tmp\patch_out\mihoyo_patched_unsigned.apk"

    with open(patched, "rb") as f:
        new_so = f.read()
    print("[*] patched so: %d bytes" % len(new_so))

    src = zipfile.ZipFile(orig, "r")
    dst = zipfile.ZipFile(out, "w", allowZip64=True)

    n = 0
    for info in src.infolist():
        name = info.filename
        if name in OLD_SIG:
            print("  [-] drop old sig: %s" % name)
            continue
        if name == TARGET:
            print("  [-] skip(将写入补丁版): %s" % name)
            continue
        data = src.read(name)
        zi = zipfile.ZipInfo(name, date_time=info.date_time)
        zi.compress_type = info.compress_type
        zi.external_attr = info.external_attr
        zi.create_system = info.create_system
        dst.writestr(zi, data)
        n += 1
        if n % 500 == 0:
            print("  ... %d entries copied" % n)

    # 写入补丁后的 .so (原 APK 中为 deflate, extractNativeLibs=true, 无对齐要求)
    zi = zipfile.ZipInfo(TARGET, date_time=(2024, 1, 1, 0, 0, 0))
    zi.compress_type = zipfile.ZIP_DEFLATED
    zi.external_attr = 0o755 << 16
    dst.writestr(zi, new_so)
    print("  [+] written patched %s" % TARGET)

    dst.close()
    src.close()
    print("[+] done: %d entries -> %s" % (n + 1, out))


if __name__ == "__main__":
    main()
