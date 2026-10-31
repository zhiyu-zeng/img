#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
themida_vm_entry_stat.py
========================
Themida VM 函数入口（VM Entry Stub）静态统计工具

背景
----
Themida 3.x 在 x64 目标上把每个 VM 函数入口做成下面这种"旗标混淆"桩：

    pushfq                                   ; 9C  —— 把 RFLAGS 压栈
    ...(少量混淆指令)...
    sub qword ptr [rsp], imm32               ; 48 81 2C 24 imm32
 /  add qword ptr [rsp], imm32               ; 48 81 04 24 imm32
 /  mov qword ptr [rsp], imm32               ; 48 C7 04 24 imm32

即：在 pushfq 之后不远处，用一个"大立即数"去加减/覆盖刚压栈的 RFLAGS，
使得下断点后手工 popfq 拿到的不是真实旗标。这个组合是 VM 入口最稳定的
静态特征，可用于批量定位 VM 函数入口。

统计流程（与手工分析步骤一一对应）
----------------------------------
  1. 在整个镜像（默认只扫 .themida 节）里扫描 0x9C（pushfq / pushfd）字节；
  2. 用 pefile 解析节表，把命中的文件偏移换算成 RVA / VA，并判定是否落在
     目标节（默认节名含 "themida"）；
  3. 用 capstone 从每个候选地址起反汇编，在窗口内（默认 0x60 字节）寻找
     "对 [rsp] 的 4/8 字节写入，且源操作数为立即数，且 |imm| 足够大" 的指令，
     命中即判定为一个 VM 入口。

!! 前置条件：必须输入已 dump 的镜像 !!
-------------------------------------
本工具做的是**静态字节扫描**，只能看到磁盘上真实存在的字节。Themida 保护的
原始文件里，.themida / .boot 节在磁盘上是加密 + 压缩状态，里面根本没有可读的
pushfq 桩（实测直接扫原始 exe 会得到 0 个结果）。

因此输入必须是 **dump 出来的程序**：
  * 在 x64dbg 里跑到 OEP（或直接停在入口点，只要映像已解密展开），
    用 Scylla / OllyDumpEx 等插件把进程内存映像 dump 成文件；或
  * 用其它方式把解密后的内存映像按节对齐落盘。
dump 出的文件通常比原始文件大一倍以上（节表里 .themida 的 SizeOfRawData
接近 VirtualSize），这种特征可以用来判断手上的是不是 dump 文件。

用法
----
    python themida_vm_entry_stat.py <dump.exe>
    python themida_vm_entry_stat.py <dump.exe> --json out.json --csv out.csv
    python themida_vm_entry_stat.py <dump.exe> --x64dbg bp.txt --top 50
    python themida_vm_entry_stat.py <dump.exe> --strict --sections .themida,.boot

依赖
----
    pip install pefile capstone

作者：WorkBuddy
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from dataclasses import dataclass, asdict, field
from typing import Iterator, Optional

try:
    import pefile
except ImportError:  # pragma: no cover
    sys.exit("[!] 缺少依赖 pefile，请先执行: pip install pefile")

try:
    from capstone import (
        CS_ARCH_X86,
        CS_GRP_CALL,
        CS_GRP_JUMP,
        CS_GRP_RET,
        CS_MODE_32,
        CS_MODE_64,
        Cs,
    )
    from capstone.x86 import (
        X86_OP_IMM,
        X86_OP_MEM,
        X86_OP_REG,
        X86_REG_ESP,
        X86_REG_RSP,
    )
except ImportError:  # pragma: no cover
    sys.exit("[!] 缺少依赖 capstone，请先执行: pip install capstone")


# --------------------------------------------------------------------------- #
# 常量 / 默认参数
# --------------------------------------------------------------------------- #

PUSHFD_BYTE = 0x9C                      # 0x9C：x86 下是 pushfd，x64 下是 pushfq
PUSH_MNEMONICS = ("pushfq", "pushfd")

# 允许出现在 [rsp] 上的改写指令（"操作任意"）
MUTATE_MNEMONICS = frozenset(
    ("add", "sub", "and", "or", "xor", "mov", "movabs", "adc", "sbb", "xchg", "test")
)

# --------------------------------------------------------------------------- #
# 数据结构
# --------------------------------------------------------------------------- #

@dataclass
class SectionInfo:
    """参与扫描的节。"""
    name: str
    va: int            # 节的虚拟地址（含 ImageBase / 用户覆盖的 base）
    rva: int
    file_off: int
    scan_size: int     # 实际参与扫描的字节数
    virt_size: int
    raw_size: int
    data: bytes
    pushfq_count: int = 0
    candidate_count: int = 0
    hit_count: int = 0


@dataclass
class Hit:
    """一个被判定的 VM 入口。"""
    index: int
    va: int                # pushfq 的虚拟地址
    rva: int
    section: str
    sec_off: int           # 相对节起始的偏移
    file_off: int          # 文件偏移
    op_va: int             # [rsp] 改写指令的虚拟地址
    op_mnemonic: str
    op_str: str
    imm: int               # 立即数（按 32 位无符号视角）
    dist: int              # pushfq -> [rsp] 改写 的字节距离
    is_qword: bool
    insn_count: int = 0    # pushfq 与改写之间的指令条数（用于去重择优）
    opener: str = ""       # pushfq 之后的第一条指令（桩开场）
    context: list = field(default_factory=list)   # 反汇编上下文文本


# --------------------------------------------------------------------------- #
# PE 解析
# --------------------------------------------------------------------------- #

def open_pe(path: str):
    if not os.path.isfile(path):
        sys.exit(f"[!] 文件不存在: {path}")
    try:
        return pefile.PE(path, fast_load=True)
    except pefile.PEFormatError as exc:
        sys.exit(f"[!] 不是有效的 PE 文件: {exc}")


def is_pe64(pe) -> bool:
    return pe.OPTIONAL_HEADER.Magic == 0x20B


def pick_sections(pe, want_all: bool, patterns: list[str]) -> list:
    """按节名挑选需要扫描的节（默认仅节名含 themida 的节）。"""
    picked = []
    for sec in pe.sections:
        raw_name = sec.Name.decode("utf-8", errors="replace").rstrip("\x00")
        name = raw_name if raw_name.strip() else f"<noname_{sec.VirtualAddress:#x}>"
        if want_all:
            picked.append((name, sec))
            continue
        low = raw_name.lower()
        if any(p in low for p in patterns):
            picked.append((name, sec))
    return picked


def load_section_data(pe, sec) -> bytes:
    """取节内容：优先读原始数据；若 VirtualSize > SizeOfRawData，尾部补 0。

    SizeOfRawData == 0 表示该节在磁盘上没有任何数据（加壳文件常见），直接返回空。
    """
    if not sec.SizeOfRawData:
        return b""
    blob = b""
    if sec.SizeOfRawData and sec.PointerToRawData and sec.PointerToRawData < len(pe.__data__):
        try:
            blob = pe.get_data(sec.VirtualAddress, sec.SizeOfRawData)
        except Exception:
            blob = b""
            start = sec.PointerToRawData
            blob = pe.__data__[start:start + sec.SizeOfRawData]
    target = max(sec.Misc_VirtualSize, sec.SizeOfRawData)
    if len(blob) < target:
        blob = blob + b"\x00" * (target - len(blob))
    return blob[:target]


# --------------------------------------------------------------------------- #
# 规则判定
# --------------------------------------------------------------------------- #

def match_rsp_imm(insn, rsp_reg: int, min_imm: int, max_imm: int) -> Optional[tuple]:
    """判断指令是否为 "写 [rsp]，源为立即数" 的旗标混淆指令。

    返回 (imm, is_qword)；不匹配返回 None。
    """
    if insn.mnemonic not in MUTATE_MNEMONICS:
        return None
    ops = insn.operands
    if len(ops) < 2:
        return None

    dst, src = ops[0], ops[1]

    # 目的操作数必须是 [rsp]（无基址偏移、无索引）
    if dst.type != X86_OP_MEM:
        return None
    if dst.mem.base != rsp_reg or dst.mem.index != 0 or dst.mem.disp != 0:
        return None

    # 源操作数必须是立即数
    if src.type != X86_OP_IMM:
        return None

    is_qword = dst.size == 8
    if dst.size not in (4, 8):
        return None

    # 编码里是 imm32，统一按 32 位无符号视角比较"大小"
    imm = src.imm & 0xFFFFFFFF
    if not (min_imm <= imm <= max_imm):
        return None
    return imm, is_qword


def is_stack_frame_opener(insn, rsp_reg: int) -> bool:
    """判断 pushfq 之后的第一条指令是否是 Themida 桩的典型栈框建立指令。

    实测样本中只有两类开头：
        pushfq; push reg / push imm32        (占 ~65%)
        pushfq; sub rsp, 8                   (占 ~29%)
    其余（直接 mov/xor/out/idiv …）基本都是 0x9C 落在别处指令操作数里造成的解码错位。
    """
    if insn.mnemonic == "push":
        return True
    ops = insn.operands
    if not ops:
        return False
    dst = ops[0]
    if dst.type == X86_OP_REG and dst.reg == rsp_reg:
        return insn.mnemonic in ("sub", "add", "lea")
    if dst.type == X86_OP_MEM and dst.mem.base == rsp_reg and dst.mem.disp == 0:
        return insn.mnemonic in ("sub", "mov", "and", "add")
    return False


def validate_candidate(md, data: bytes, off: int, va_at_off: int, cfg) -> Optional[dict]:
    """从候选地址（应为 pushfq 字节）起反汇编，验证是否为 VM 入口桩。"""
    code = data[off: off + cfg.window]
    if not code:
        return None

    rsp_reg = X86_REG_RSP
    pos = 0
    invalid = 0
    insn_count = 0
    first_seen = False
    first_va = va_at_off
    opener = ""
    ctx: list[str] = []

    while pos < len(code):
        insn = next(md.disasm(code[pos:], va_at_off + pos, count=1), None)
        if insn is None:
            invalid += 1
            if invalid > cfg.max_invalid:
                return None
            pos += 1
            continue

        if not first_seen:
            # 首条指令必须正好是 pushfq / pushfd
            if insn.mnemonic not in PUSH_MNEMONICS or insn.address != va_at_off:
                return None
            first_seen = True
            first_va = insn.address
            ctx.append(f"{insn.address:#x}: {insn.mnemonic}")
            pos += insn.size
            continue

        ctx.append(f"{insn.address:#x}: {insn.mnemonic} {insn.op_str}".rstrip())
        insn_count += 1

        if insn_count == 1:
            # pushfq 之后的第一条指令 = 桩的开场（栈框建立）
            opener = f"{insn.mnemonic} {insn.op_str}".strip()
            if cfg.strict and not is_stack_frame_opener(insn, rsp_reg):
                return None

        if cfg.max_dist and (insn.address - first_va) > cfg.max_dist:
            return None

        hit = match_rsp_imm(insn, rsp_reg, cfg.min_imm, cfg.max_imm)
        if hit is not None:
            imm, is_qword = hit
            return {
                "pushfq_va": first_va,
                "op_va": insn.address,
                "mnemonic": insn.mnemonic,
                "op_str": insn.op_str,
                "imm": imm,
                "is_qword": is_qword,
                "dist": insn.address - first_va,
                "insn_count": insn_count,
                "opener": opener,
                "context": ctx,
            }

        if not cfg.lenient and (
            insn.group(CS_GRP_JUMP) or insn.group(CS_GRP_CALL) or insn.group(CS_GRP_RET)
        ):
            # 真桩在 pushfq 与旗标改写之间不会出现跳转/调用（那是解码错位的典型特征），
            # 同时一旦 call/ret 发生，[rsp] 已不是同一份 RFLAGS，直接判负。
            return None

        pos += insn.size if insn.size else 1

    return None


# --------------------------------------------------------------------------- #
# 主扫描
# --------------------------------------------------------------------------- #

def scan(path: str, cfg) -> dict:
    pe = open_pe(path)
    bits = 64 if is_pe64(pe) else 32
    image_base = cfg.base if cfg.base is not None else pe.OPTIONAL_HEADER.ImageBase

    md = Cs(CS_ARCH_X86, CS_MODE_64 if bits == 64 else CS_MODE_32)
    md.detail = True
    md.skipdata = False

    patterns = [p.strip().lower() for p in cfg.sections.split(",") if p.strip()] or ["themida"]
    picked = pick_sections(pe, cfg.all_sections, patterns)

    sections: list[SectionInfo] = []
    hits: list[Hit] = []

    for name, sec in picked:
        data = load_section_data(pe, sec)
        va = image_base + sec.VirtualAddress
        info = SectionInfo(
            name=name,
            va=va,
            rva=sec.VirtualAddress,
            file_off=sec.PointerToRawData,
            scan_size=len(data),
            virt_size=sec.Misc_VirtualSize,
            raw_size=sec.SizeOfRawData,
            data=data,
        )

        # --- 步骤 1：扫描特征字节 0x9C -------------------------------- #
        cands: list[int] = []
        pos = data.find(bytes([PUSHFD_BYTE]))
        while pos != -1:
            cands.append(pos)
            pos = data.find(bytes([PUSHFD_BYTE]), pos + 1)
        info.pushfq_count = len(cands)
        info.candidate_count = len(cands)

        if cfg.verbose:
            print(f"[*] 扫描节 {name}: VA={va:#x} size={len(data):#x} 0x9C 命中 {len(cands)} 处",
                  file=sys.stderr)

        # --- 步骤 3：capstone 规则校验 --------------------------------- #
        for off in cands:
            res = validate_candidate(md, data, off, va + off, cfg)
            if res is None:
                continue
            hits.append(Hit(
                index=0,
                va=res["pushfq_va"],
                rva=res["pushfq_va"] - image_base,
                section=name,
                sec_off=res["pushfq_va"] - va,
                file_off=sec.PointerToRawData + (res["pushfq_va"] - va),
                op_va=res["op_va"],
                op_mnemonic=res["mnemonic"],
                op_str=res["op_str"],
                imm=res["imm"],
                dist=res["dist"],
                is_qword=res["is_qword"],
                insn_count=res["insn_count"],
                opener=res["opener"],
                context=res["context"],
            ))

        sections.append(info)

    raw_total = len(hits)

    # 去重：
    #   1) 同一个 pushfq 只保留一条；
    #   2) 多个 pushfq 收敛到同一条 [rsp] 改写时（典型是 0x9C 落在前一条指令的
    #      操作数里造成的解码错位），保留距离最近、指令数最少的那条 —— 真正
    #      的桩起点必然最贴近旗标改写。
    best: dict[int, Hit] = {}
    for h in hits:
        cur = best.get(h.op_va)
        if cur is None or (h.insn_count, h.dist, -h.va) < (cur.insn_count, cur.dist, -cur.va):
            best[h.op_va] = h

    hits = sorted(best.values(), key=lambda x: x.va)
    for i, h in enumerate(hits, 1):
        h.index = i
    for s in sections:
        s.hit_count = sum(1 for h in hits if h.section == s.name)

    return {
        "file": os.path.abspath(path),
        "file_size": os.path.getsize(path),
        "bits": bits,
        "image_base": image_base,
        "entry_point_va": image_base + pe.OPTIONAL_HEADER.AddressOfEntryPoint,
        "entry_point_rva": pe.OPTIONAL_HEADER.AddressOfEntryPoint,
        "sections": sections,
        "raw_hits": raw_total,
        "hits": hits,
        "cfg": cfg,
    }


# --------------------------------------------------------------------------- #
# 报告输出
# --------------------------------------------------------------------------- #

def print_report(res: dict, cfg) -> None:
    hits: list[Hit] = res["hits"]
    secs: list[SectionInfo] = res["sections"]

    print("=" * 78)
    print("  Themida VM 函数入口统计")
    print("=" * 78)
    print(f"  文件        : {res['file']}")
    print(f"  文件大小    : {res['file_size']:,} 字节")
    print(f"  架构        : x{res['bits']}")
    print(f"  ImageBase   : {res['image_base']:#x}")
    print(f"  入口点(EP)  : {res['entry_point_va']:#x}  (RVA {res['entry_point_rva']:#x})")
    print(f"  判定窗口    : pushfq 之后 {cfg.window:#x} 字节（最大距离 {cfg.max_dist:#x}）")
    print(f"  立即数阈值  : {cfg.min_imm:#x} <= |imm| <= {cfg.max_imm:#x}")
    print(f"  容错        : 窗口内允许 {cfg.max_invalid} 个非法字节；"
          f"{'宽松模式(允许窗口内出现跳转/调用)' if cfg.lenient else '严格模式(窗口内出现跳转/调用即判负)'}")
    print(f"  开场校验    : {'开启（首条指令必须为 push / sub rsp / mov [rsp],reg）' if cfg.strict else '关闭（仅 --strict 时启用）'}")
    print("-" * 78)
    print("  [步骤1] 扫描 0x9C (pushfq) 字节")
    print("  [步骤2] pefile 判定节归属")
    print("  [步骤3] capstone 规则校验：pushfq + ([rsp] op 大立即数)")
    print("-" * 78)

    print(f"  {'节名':<12}{'VA':>14}{'大小':>12}{'0x9C':>10}{'入口':>8}")
    for s in secs:
        print(f"  {s.name:<12}{s.va:>#14x}{s.scan_size:>#12x}{s.pushfq_count:>10}{s.hit_count:>8}")
    total_cand = sum(s.candidate_count for s in secs)
    print(f"  {'合计':<12}{'':>14}{sum(s.scan_size for s in secs):>#12x}{total_cand:>10}{len(hits):>8}")
    print("-" * 78)

    ratio = (len(hits) / total_cand * 100) if total_cand else 0.0
    print(f"  候选 0x9C 字节 : {total_cand}")
    print(f"  规则初筛命中   : {res['raw_hits']}")
    print(f"  去重后 VM 入口 : {len(hits)}   (命中率 {ratio:.2f}%，"
          f"剔除重复/解码错位 {res['raw_hits'] - len(hits)} 条)")

    if hits:
        # 操作类型分布
        stat: dict[str, int] = {}
        for h in hits:
            stat[h.op_mnemonic] = stat.get(h.op_mnemonic, 0) + 1
        dists = [h.dist for h in hits]
        print(f"  指令类型分布   : " + "  ".join(f"{k}={v}" for k, v in sorted(stat.items(), key=lambda x: -x[1])))

        openers: dict[str, int] = {}
        for h in hits:
            key = h.opener.split(" ")[0] if h.opener else "?"
            openers[key] = openers.get(key, 0) + 1
        top_open = sorted(openers.items(), key=lambda x: -x[1])[:6]
        print("  开场指令分布   : " + "  ".join(f"{k}={v}" for k, v in top_open))

        print(f"  距离分布       : min={min(dists):#x}  max={max(dists):#x}  "
              f"均值={sum(dists)/len(dists):.1f}")

        print("-" * 78)
        top = hits if cfg.top <= 0 else hits[:cfg.top]
        print(f"  明细（前 {len(top)} 条 / 共 {len(hits)} 条）")
        print(f"  {'#':>4}  {'VA':<14}{'节':<11}{'+off':<11}{'距离':>6}  指令")
        for h in top:
            print(f"  {h.index:>4}  {h.va:#014x}  {h.section:<10}{h.sec_off:#010x}  "
                  f"{h.dist:>#6x}  {h.op_mnemonic} {h.op_str}")
        print("=" * 78)
    else:
        print("  [!] 未发现任何 VM 入口。")
        packed = [s for s in secs
                  if s.raw_size == 0 or (s.raw_size and s.raw_size < s.virt_size * 0.9)]
        if packed:
            print("      检测到以下节的磁盘数据量远小于虚拟大小，输入很可能是"
                  "**原始加壳文件**（节仍是加密/压缩状态）：")
            for s in packed:
                print(f"        {s.name}: SizeOfRawData={s.raw_size:#x}"
                      f"  vs  VirtualSize={s.virt_size:#x}")
            print("      请先在 x64dbg 跑到 OEP，用 Scylla / OllyDumpEx 把内存映像 "
                  "dump 成文件后再扫描本工具。")
        elif total_cand == 0:
            print("      目标节内不存在任何 0x9C 字节，节内容不可读；"
                  "请确认输入是 dump 出来的镜像，而不是原始加壳文件。")
        else:
            print("      可能原因：1) 目标不使用该特征（试着调 --window / --min-imm）；"
                  "2) 节名不匹配（试 --sections 或 --all-sections）。")
        print("=" * 78)


def write_json(res: dict, path: str) -> None:
    payload = {
        "file": res["file"],
        "file_size": res["file_size"],
        "bits": res["bits"],
        "image_base": f"{res['image_base']:#x}",
        "entry_point": f"{res['entry_point_va']:#x}",
        "sections": [
            {
                "name": s.name,
                "va": f"{s.va:#x}",
                "size": s.scan_size,
                "pushfq_bytes": s.pushfq_count,
                "hits": s.hit_count,
            }
            for s in res["sections"]
        ],
        "total_hits": len(res["hits"]),
        "hits": [
            {
                "index": h.index,
                "va": f"{h.va:#x}",
                "rva": f"{h.rva:#x}",
                "section": h.section,
                "file_offset": f"{h.file_off:#x}",
                "op_va": f"{h.op_va:#x}",
                "instruction": f"{h.op_mnemonic} {h.op_str}",
                "imm": f"{h.imm:#x}",
                "dist": h.dist,
                "context": h.context,
            }
            for h in res["hits"]
        ],
    }
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(payload, fp, ensure_ascii=False, indent=2)
    print(f"[+] JSON 报告: {os.path.abspath(path)}")


def write_csv(res: dict, path: str) -> None:
    with open(path, "w", encoding="utf-8-sig", newline="") as fp:
        w = csv.writer(fp)
        w.writerow(["index", "va", "rva", "section", "file_offset", "op_va",
                    "mnemonic", "operand", "imm", "dist"])
        for h in res["hits"]:
            w.writerow([h.index, f"{h.va:#x}", f"{h.rva:#x}", h.section,
                        f"{h.file_off:#x}", f"{h.op_va:#x}", h.op_mnemonic,
                        h.op_str, f"{h.imm:#x}", f"{h.dist:#x}"])
    print(f"[+] CSV 报告 : {os.path.abspath(path)}")


def write_x64dbg(res: dict, path: str) -> None:
    """生成可直接在 x64dbg 脚本窗口执行的断点列表。"""
    with open(path, "w", encoding="utf-8") as fp:
        fp.write(f"; Themida VM entry breakpoints, generated from {os.path.basename(res['file'])}\n")
        fp.write(f"; total = {len(res['hits'])}\n")
        fp.write("; 若模块装载基址与 ImageBase 不同，请用 --base 指定实际基址后重新生成\n\n")
        for h in res["hits"]:
            fp.write(f"bp {h.va:#x}    ; #{h.index} {h.section} {h.op_mnemonic} {h.op_str}\n")
    print(f"[+] x64dbg 断点脚本: {os.path.abspath(path)}")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="themida_vm_entry_stat.py",
        description=(
            "Themida VM 函数入口静态统计（pushfq + [rsp] 大立即数改写）\n"
            "\n"
            "【输入要求】必须传入 **已 dump 的镜像**，不能是原始加壳文件。\n"
            "  原始文件里的 .themida / .boot 节仍处于加密+压缩状态，扫描结果为 0；\n"
            "  请先在 x64dbg 中运行到 OEP（或映像已解密展开的任意位置），用\n"
            "  Scylla / OllyDumpEx 等插件把内存映像 dump 成文件后再扫描。\n"
            "  判断依据：dump 文件的 .themida 节 SizeOfRawData 接近 VirtualSize，\n"
            "  体积通常比原始 exe 大一倍以上。"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""示例:
  python themida_vm_entry_stat.py dumped.exe
  python themida_vm_entry_stat.py dumped.exe --sections .themida,.boot --json r.json
  python themida_vm_entry_stat.py dumped.exe --base 0x140000000 --x64dbg bp.txt
  python themida_vm_entry_stat.py dumped.exe --strict --top 0 --csv entries.csv
""",
    )
    p.add_argument("file",
                   help="待分析的 PE **镜像（已 dump）**；原始加壳文件扫描结果会是 0")
    p.add_argument("--sections", default="themida",
                   help="参与扫描的节名关键字，逗号分隔（默认: themida）")
    p.add_argument("--all-sections", action="store_true", help="扫描全部节")
    p.add_argument("--base", type=lambda s: int(s, 0), default=None,
                   help="覆盖显示用基址（默认取 OptionalHeader.ImageBase）")
    p.add_argument("--window", type=lambda s: int(s, 0), default=0x60,
                   help="pushfq 之后的搜索窗口字节数（默认 0x60）")
    p.add_argument("--max-dist", type=lambda s: int(s, 0), default=None,
                   help="pushfq 与 [rsp] 改写之间的最大字节距离（默认等于 --window）")
    p.add_argument("--min-imm", type=lambda s: int(s, 0), default=0x10000,
                   help="立即数下限（默认 0x10000）")
    p.add_argument("--max-imm", type=lambda s: int(s, 0), default=0xFFFFFFFF,
                   help="立即数上限（默认 0xFFFFFFFF）")
    p.add_argument("--max-invalid", type=int, default=3,
                   help="窗口内允许的非法字节数（默认 3）")
    p.add_argument("--lenient", action="store_true",
                   help="宽松模式：允许窗口内出现跳转/调用（默认遇到即判负）")
    p.add_argument("--strict", action="store_true",
                   help="严格模式：要求 pushfq 后的首条指令是 push / sub rsp / mov [rsp],reg"
                        "（可剔除绝大部分解码错位误报，建议开启）")
    p.add_argument("--top", type=int, default=30,
                   help="控制台打印的明细条数，0 表示全部（默认 30）")
    p.add_argument("--json", metavar="PATH", help="导出 JSON 报告")
    p.add_argument("--csv", metavar="PATH", help="导出 CSV 报告")
    p.add_argument("--x64dbg", metavar="PATH", help="导出 x64dbg 断点脚本")
    p.add_argument("-v", "--verbose", action="store_true", help="打印扫描过程")
    return p


def main(argv=None) -> int:
    parser = build_parser()
    cfg = parser.parse_args(argv)
    if cfg.max_dist is None:
        cfg.max_dist = cfg.window

    res = scan(cfg.file, cfg)
    print_report(res, cfg)

    if cfg.json:
        write_json(res, cfg.json)
    if cfg.csv:
        write_csv(res, cfg.csv)
    if cfg.x64dbg:
        write_x64dbg(res, cfg.x64dbg)

    return 0


if __name__ == "__main__":
    sys.exit(main())
