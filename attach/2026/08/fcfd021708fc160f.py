#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import struct


PATCHES = [
    (0x1b730, [0x00, 0x00, 0x80, 0x52, 0xC0, 0x03, 0x5F, 0xD6], "0x1b730 线程state检查(stat 'T'/'t'->777) -> mov w0,#0; ret"),
    (0x1c168, [0x00, 0x00, 0x80, 0x52, 0xC0, 0x03, 0x5F, 0xD6], "0x1c168 fd/%s扫描 -> mov w0,#0; ret"),
    (0x25ce4, [0x00, 0x00, 0x80, 0x52, 0xC0, 0x03, 0x5F, 0xD6], "0x25ce4 fd/%d扫描 -> mov w0,#0; ret"),
]


def disassemble_first(data, off):
    """极简 arm64 首指令解析: 只输出 mov/ret 以便校验"""
    try:
        from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM
        md = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
        ins = next(iter(md.disasm(data[off:off + 8], off)))
        return "%s %s" % (ins.mnemonic, ins.op_str)
    except Exception:
        return "?"


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else r"D:\mihoyo逆向\apk_unpack\lib\arm64-v8a\libmsaoaidsec.so"
    dst = sys.argv[2] if len(sys.argv) > 2 else src.replace(".so", "_patched.so")

    with open(src, "rb") as f:
        data = bytearray(f.read())

    if data[:4] != b"\x7fELF":
        print("[-] 不是 ELF 文件:", src)
        sys.exit(1)

    print("[*] 输入: %s (%d bytes)" % (src, len(data)))
    print("[*] 输出: %s\n" % dst)

    for off, patch, desc in PATCHES:
        orig = bytes(data[off:off + 4])
        dis_before = disassemble_first(data, off)
        print("  %-8s 0x%05x  orig: %-20s" % (desc.split(" ")[0], off, dis_before))
        data[off:off + len(patch)] = bytes(patch)
        dis_after = disassemble_first(data, off)
        print("  %-8s          new : %-20s  %s" % ("", dis_after, desc))
        print()

    with open(dst, "wb") as f:
        f.write(bytes(data))
    print("[+] 已写出 %d bytes -> %s" % (len(data), dst))
    print("[*] 校验(期望 8 字节):")
    for off, patch, desc in PATCHES:
        ok = bytes(data[off:off + len(patch)]) == bytes(patch)
        print("    0x%05x  %s %s" % (off, "OK " if ok else "FAIL", desc.split(" ")[0]))


if __name__ == "__main__":
    main()
