#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys, base64, zlib
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding

KEY = b"01"   # 0xad230  AES-128 key(16B ASCII) 数据脱敏
IV  = b"4"   # 0xad240  CBC IV(16B ASCII) 数据脱敏

def _aes_enc(pt: bytes) -> bytes:
    p = padding.PKCS7(128).padder(); pt = p.update(pt) + p.finalize()
    c = Cipher(algorithms.AES(KEY), modes.CBC(IV)).encryptor()
    return c.update(pt) + c.finalize()

def _aes_dec(ct: bytes) -> bytes:
    d = Cipher(algorithms.AES(KEY), modes.CBC(IV)).decryptor()
    pt = d.update(ct) + d.finalize()
    try:
        u = padding.PKCS7(128).unpadder(); return u.update(pt) + u.finalize()
    except ValueError:
        return pt

def enc(pt: bytes) -> str:
    return base64.b64encode(_aes_enc(pt)).decode()

def dec(b64: str) -> bytes:
    return _aes_dec(base64.b64decode(b64))

def pack(pt: bytes) -> str:
    """完整组包:zlib 压缩 → AES → Base64。"""
    return base64.b64encode(_aes_enc(zlib.compress(pt))).decode()

def report(b64: str) -> bytes:
    """还原上报主体:Base64 → AES 解密 → zlib 解压。压缩头自适应(raw/zlib/gzip)。"""
    blob = _aes_dec(base64.b64decode(b64))
    for wbits in (15, -15, 47):          # zlib / raw-deflate / gzip+zlib auto
        try:
            return zlib.decompress(blob, wbits)
        except zlib.error:
            continue
    return blob   # 未压缩或填充差异,返回 AES 明文

if __name__ == "__main__":
    a = sys.argv
    if len(a) >= 2 and a[1] == "test":
        s = b'{"organization":"shuxxxx","appId":"x","data":"hello"*9}'
        ok = report(pack(s)) == s
        print("pack/report round-trip OK:", ok)
        print("仅AES round-trip OK:", dec(enc(s)) == s)
    elif len(a) >= 3 and a[1] == "report":
        print(report(a[2]).decode("utf-8", "replace"))
    elif len(a) >= 3 and a[1] == "dec":
        print(dec(a[2]).decode("utf-8", "replace"))
    elif len(a) >= 3 and a[1] == "enc":
        print(enc(a[2].encode()))
    elif len(a) >= 3 and a[1] == "pack":
        print(pack(a[2].encode()))
    else:
        print(__doc__)
