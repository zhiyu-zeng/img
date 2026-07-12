

import idaapi, idc, ida_funcs, ida_gdl, ida_bytes, ida_segment, idautils
import re
from unicorn import *
from unicorn.arm64_const import *



def block_heads(s, e):
    """返回 [s,e) 内每条指令的地址列表。"""
    res = []; ea = s
    while ea < e and ea != idaapi.BADADDR:
        res.append(ea)
        nx = idc.next_head(ea, e)
        if nx <= ea:
            break
        ea = nx
    return res

def get_flow(fn):
    """取函数的基本块图:{start: {start,end,succs,preds}}。"""
    f = ida_funcs.get_func(fn)
    fc = ida_gdl.FlowChart(f, flags=ida_gdl.FC_PREDS)
    blocks = {}
    for b in fc:
        blocks[b.start_ea] = {
            "start": b.start_ea, "end": b.end_ea,
            "succs": [x.start_ea for x in b.succs()],
            "preds": [x.start_ea for x in b.preds()],
        }
    return f, blocks

# dispatcher 纯比较块只含这些助记符(+ 末尾 B / B.cc 分支)。
# 边界值预加载用 MOV/MOVK/MOVN/MOVZ;比较用 CMP/CMN;搬运用 MOV reg,reg。
_DISP_OK = {"MOV", "MOVK", "MOVN", "MOVZ", "CMP", "CMN"}

def is_pure_dispatcher_block(s, e):
    for ea in block_heads(s, e):
        m = idc.print_insn_mnem(ea).upper()
        if m == "" or m == "B" or m.startswith("B."):
            continue   # 末尾(条件)分支允许
        if m not in _DISP_OK:
            return False
    return True

def find_dispatcher(blocks):
    """入度最高的块 = dispatcher 根;从根沿 succ BFS 收纯比较块 = dispatcher 树。"""
    root = max(blocks.values(), key=lambda b: len(b["preds"]))["start"]
    tree = _bfs_pure_tree(blocks, root)
    return root, tree

def _bfs_pure_tree(blocks, root):
    tree = set(); q = [root]
    while q:
        x = q.pop()
        if x in tree or x not in blocks:
            continue
        if not is_pure_dispatcher_block(blocks[x]["start"], blocks[x]["end"]):
            continue
        tree.add(x)
        for nxt in blocks[x]["succs"]:
            if nxt not in tree:
                q.append(nxt)
    return tree

def find_all_dispatchers(blocks, min_indeg=4):
    """识别所有 dispatcher(外层 + 嵌套内层):高入度的纯比较块各自 BFS 成树。
       返回 [(root, tree), ...](按入度降序)。"""
    roots = []; used = set()
    for b in sorted(blocks.values(), key=lambda b: len(b["preds"]), reverse=True):
        if len(b["preds"]) < min_indeg:
            break
        if b["start"] in used:
            continue
        if not is_pure_dispatcher_block(b["start"], b["end"]):
            continue
        tree = _bfs_pure_tree(blocks, b["start"])
        if not tree:
            continue
        roots.append((b["start"], tree))
        used |= tree
    return roots

def dispatcher_addr_set(blocks, tree):
    """dispatcher 树覆盖的全部指令地址(微执行落点判定用)。"""
    s = set()
    for b in tree:
        for ea in block_heads(blocks[b]["start"], blocks[b]["end"]):
            s.add(ea)
    return s

def detect_state_reg(root):
    """dispatcher 根的 state 寄存器:
       - 'MOV Wx, Wy'(寄存器搬运)→ 源 Wy(外层形态)
       - 直接 'CMP Wx, ...' → Wx(内层形态,无 MOV 前缀)"""
    m = idc.print_insn_mnem(root).upper()
    if m == "MOV" and idc.get_operand_type(root, 1) == idc.o_reg:
        return idc.print_operand(root, 1)
    if m in ("CMP", "CMN"):
        return idc.print_operand(root, 0)
    return None

def initial_state(fn, root, state_reg):
    """prologue([fn, root))内对 state 寄存器最后一次的立即数赋值 = 初始 state。
       处理 MOV Wd,#imm16 + 可选 MOVK Wd,#imm16,LSL#16 组合。"""
    val = None; lo = None
    for ea in block_heads(fn, root):
        m = idc.print_insn_mnem(ea).upper()
        if m not in ("MOV", "MOVZ", "MOVK"):
            continue
        if idc.print_operand(ea, 0) != state_reg:
            continue
        if idc.get_operand_type(ea, 1) != idc.o_imm:
            # MOV Wd, Wn(寄存器搬运)→ 此处不是立即数初始化,跳过
            continue
        imm = idc.get_operand_value(ea, 1)
        if m in ("MOV", "MOVZ"):
            lo = imm & 0xFFFFFFFF
            val = lo
        elif m == "MOVK":
            # MOVK 默认 LSL 由反汇编决定;这里按 32 位 state 处理高半字
            val = ((lo or 0) | (imm << 16)) & 0xFFFFFFFF if (imm >> 16) == 0 else imm
    return val



_TOP        = 0xC0000          # 映射 IDA 镜像到此上界(覆盖 .text/.data/.bss)
_STACK_BASE = 0x10000000
_STACK_SIZE = 0x00100000
_TLS_BASE   = 0x20000000
_PRISTINE   = None             # 原始 .so 字节缓存(防 IDB patch 污染微执行)

def _load_pristine():
    global _PRISTINE
    if _PRISTINE is None:
        import ida_nalt
        path = ida_nalt.get_input_file_path()
        with open(path, "rb") as fp:
            _PRISTINE = fp.read()
    return _PRISTINE

_GPR = [globals()["UC_ARM64_REG_X%d" % i] for i in range(31)]
_CTX_REGS = _GPR + [UC_ARM64_REG_SP, UC_ARM64_REG_NZCV, UC_ARM64_REG_TPIDR_EL0]

def reg_const(name):
    """'W10' / 'X0' → unicorn 寄存器常量。"""
    return globals()["UC_ARM64_REG_" + name.upper()]

def _mem_fault_hook(uc, access, address, size, value, user_data):
    """兜底:任何未映射的读/写/取指 → 当场 map 一页填 0 再放行。
       deflatten 只看控制流不看真值,野指针/未初始化内存一律兜成 0。"""
    page = address & ~0xFFF
    try:
        uc.mem_map(page, 0x1000, UC_PROT_ALL)
        uc.mem_write(page, b"\x00" * 0x1000)
    except UcError:
        pass   # 已被其它 fault 并发 map,忽略
    return True    # 已处理 → unicorn 重试该访问

def make_uc():
    """建 ARM64 实例,把 IDA 镜像逐段写入,布置 stack + TLS + 兜底 hook。
       可执行段用原始 .so 字节覆盖(vaddr==fileoff for r-x),保证微执行基于干净代码。"""
    uc = Uc(UC_ARCH_ARM64, UC_MODE_LITTLE_ENDIAN)
    uc.mem_map(0, (_TOP + 0xFFF) & ~0xFFF, UC_PROT_ALL)
    for i in range(ida_segment.get_segm_qty()):
        sg = ida_segment.getnseg(i)
        if sg.start_ea >= _TOP:
            continue
        n = min(sg.end_ea, _TOP) - sg.start_ea
        b = ida_bytes.get_bytes(sg.start_ea, n)
        if b:
            uc.mem_write(sg.start_ea, b)
    # 用原始文件字节覆盖可执行段(防 IDB 上已 apply 的 patch 干扰)
    data = _load_pristine()
    for i in range(ida_segment.get_segm_qty()):
        sg = ida_segment.getnseg(i)
        if not (sg.perm & ida_segment.SEGPERM_EXEC):
            continue
        if sg.start_ea >= len(data) or sg.start_ea >= _TOP:
            continue
        n = min(sg.end_ea, len(data), _TOP) - sg.start_ea
        if n > 0:
            uc.mem_write(sg.start_ea, data[sg.start_ea:sg.start_ea + n])
    uc.mem_map(_STACK_BASE, _STACK_SIZE, UC_PROT_ALL)
    uc.reg_write(UC_ARM64_REG_SP, _STACK_BASE + _STACK_SIZE // 2)
    uc.mem_map(_TLS_BASE, 0x4000, UC_PROT_ALL)
    uc.reg_write(UC_ARM64_REG_TPIDR_EL0, _TLS_BASE + 0x1000)
    uc.hook_add(UC_HOOK_MEM_READ_UNMAPPED | UC_HOOK_MEM_WRITE_UNMAPPED
                | UC_HOOK_MEM_FETCH_UNMAPPED, _mem_fault_hook)
    return uc

def save_ctx(uc):
    return {r: uc.reg_read(r) for r in _CTX_REGS}

def load_ctx(uc, ctx):
    for r, v in ctx.items():
        uc.reg_write(r, v)

def collect_calls(fn):
    """函数内所有 BL/BLR 地址(微执行时跳过的外部调用)。"""
    calls = set()
    f = ida_funcs.get_func(fn)
    ea = f.start_ea
    while ea < f.end_ea and ea != idaapi.BADADDR:
        m = idc.print_insn_mnem(ea).upper()
        if m in ("BL", "BLR"):
            calls.add(ea)
        nx = idc.next_head(ea, f.end_ea)
        if nx <= ea:
            break
        ea = nx
    return calls

def collect_rets(fn):
    """函数内所有 RET 地址(终止块标志,微执行到此即出口、无后继)。"""
    rets = set()
    f = ida_funcs.get_func(fn)
    ea = f.start_ea
    while ea < f.end_ea and ea != idaapi.BADADDR:
        m = idc.print_insn_mnem(ea).upper()
        if m in ("RET", "RETAA", "RETAB"):
            rets.add(ea)
        nx = idc.next_head(ea, f.end_ea)
        if nx <= ea:
            break
        ea = nx
    return rets

def _call_skip_hook(call_addrs, ret_holder):
    """code hook:遇 BL/BLR 设返回值 X0 并把 PC 推过该指令(跳过外部调用)。"""
    def hook(uc, addr, size, ud):
        if addr in call_addrs:
            uc.reg_write(UC_ARM64_REG_X0, ret_holder[0] & 0xFFFFFFFFFFFFFFFF)
            uc.reg_write(UC_ARM64_REG_PC, addr + 4)
    return hook

def run_prologue(uc, fn, root, call_addrs, ret=0, maxinsn=4000):
    """从函数入口微执行到 dispatcher 根(不执行根),返回到达时的寄存器快照 CTX0。"""
    rh = [ret]
    h = uc.hook_add(UC_HOOK_CODE, _call_skip_hook(call_addrs, rh))
    try:
        uc.emu_start(fn, root, 0, maxinsn)
    finally:
        uc.hook_del(h)
    return save_ctx(uc)

def emulate_dispatcher(uc, ctx0, root, real_starts, state_reg, state_val, maxinsn=400):
    """喂一个 state 值,从 dispatcher 根跑,返回它落到的第一个真实块地址。
       停止条件:PC 命中任一"非 dispatcher 块的起始地址"(块边界来自 FlowChart,可靠)。"""
    load_ctx(uc, ctx0)
    uc.reg_write(reg_const(state_reg), state_val & 0xFFFFFFFF)
    landing = [None]
    def hook(uc, addr, size, ud):
        if addr in real_starts:
            landing[0] = addr
            uc.emu_stop()
    h = uc.hook_add(UC_HOOK_CODE, hook)
    try:
        uc.emu_start(root, 0, 0, maxinsn)
    except UcError:
        pass
    finally:
        uc.hook_del(h)
    return landing[0]

def emulate_step(uc, ctx0, start_root, real_starts, roots, root_sreg, s,
                 calls, rets, fn_start, fn_end, ret=0, csel=None, maxinsn=20000):
    """喂 (start_root, state=s),跑过该 dispatcher → 进真实块 → 执行块体 →
       直到再次进入【任一】dispatcher 根(可能是另一层)或 RET。
       返回 (落点块, reached_root, 出口state, kind)。
       出口 state = reached_root 对应 state 寄存器的值。
       kind: 'normal' / 'terminal'(RET) / 'timeout'。"""
    load_ctx(uc, ctx0)
    uc.reg_write(reg_const(root_sreg[start_root]), s & 0xFFFFFFFF)
    st = {"blk": None, "kind": "timeout", "out": None, "root": None}
    rh = [ret]
    def hook(uc, addr, size, ud):
        if csel is not None and addr == csel[0]:           # 形态 B fork:强制 CSEL 选源
            _, wd, wn, wm, force = csel
            val = uc.reg_read(wn) if force == "then" else uc.reg_read(wm)
            uc.reg_write(wd, val)
            uc.reg_write(UC_ARM64_REG_PC, addr + size)
            return
        if addr in calls:                                  # 外部调用:设返回值并跳过
            uc.reg_write(UC_ARM64_REG_X0, rh[0] & 0xFFFFFFFFFFFFFFFF)
            uc.reg_write(UC_ARM64_REG_PC, addr + size)
            return
        if st["blk"] is None:                              # 记录第一个落点真实块
            if addr in real_starts:
                st["blk"] = addr
            return
        if addr in rets:                                   # RET → 终止
            st["kind"] = "terminal"; uc.emu_stop(); return
        if addr in roots:                                  # 再次进入任一 dispatcher → 出口
            st["root"] = addr
            st["out"] = uc.reg_read(reg_const(root_sreg[addr])) & 0xFFFFFFFF
            st["kind"] = "normal"; uc.emu_stop(); return
        if addr < fn_start or addr >= fn_end:              # 异常离开函数 → 终止
            st["kind"] = "terminal"; uc.emu_stop(); return
    h = uc.hook_add(UC_HOOK_CODE, hook)
    try:
        uc.emu_start(start_root, 0, 0, maxinsn)
    except UcError:
        pass
    finally:
        uc.hook_del(h)
    return st["blk"], st["root"], st["out"], st["kind"]

def find_state_csel(blk_s, blk_e, state_reg):
    """块内最后一条写 state 寄存器的 CSEL。返回 (ea, Wd, Wn, Wm, cond) 或 None。"""
    res = None
    for ea in block_heads(blk_s, blk_e):
        if idc.print_insn_mnem(ea).upper() == "CSEL" and idc.print_operand(ea, 0) == state_reg:
            res = (ea, idc.print_operand(ea, 0), idc.print_operand(ea, 1),
                   idc.print_operand(ea, 2), idc.print_operand(ea, 3))
    return res

def compute_seed_refs():
    """全库 opaque predicate 种子(x.*_ptr / y.*_ptr)的引用指令地址集合。"""
    seeds = set()
    for ea, name in idautils.Names():
        if re.match(r"^[xy]\.\d+_ptr$", name or ""):
            seeds.add(ea)
    refs = set()
    for s in seeds:
        for xr in idautils.XrefsTo(s):
            refs.add(xr.frm)
    return refs

def block_is_opaque(blk_s, blk_e, seed_refs):
    """块内是否含引用 opaque 种子的指令(→ 该块的 state 选择由不透明谓词控制)。"""
    for ea in block_heads(blk_s, blk_e):
        if ea in seed_refs:
            return True
    return False

def block_successors(uc, ctx0, start_root, real_starts, roots, root_sreg, s,
                     calls, rets, fn_s, fn_e, blocks, opaque_blocks):
    """求 (start_root,s) 的落点块 + 后继 + 分支元信息。
       返回 (blk, outs, kind, branch):
         branch=None                      单后继 / opaque / terminal
         branch=('csel', csel_ea, cond)   形态B,outs=[then_node, else_node]
         branch=('arith',)                形态C,outs=[node_ret0, node_retneg]"""
    blk, rj, out0, kind = emulate_step(uc, ctx0, start_root, real_starts, roots,
                                       root_sreg, s, calls, rets, fn_s, fn_e, ret=0)
    if blk is None:
        return None, [], "bad", None
    if kind != "normal":
        return blk, [], kind, None
    if blk in opaque_blocks:                      # opaque:只取 baseline 真支
        return blk, ([(rj, out0)] if out0 is not None else []), "normal", None
    sreg_j = root_sreg.get(rj)
    csel = find_state_csel(blocks[blk]["start"], blocks[blk]["end"], sreg_j) \
        if (blk in blocks and sreg_j) else None
    if csel:
        ce_then = (csel[0], reg_const(csel[1]), reg_const(csel[2]), reg_const(csel[3]), "then")
        ce_else = (csel[0], reg_const(csel[1]), reg_const(csel[2]), reg_const(csel[3]), "else")
        _, r1, o1, _ = emulate_step(uc, ctx0, start_root, real_starts, roots, root_sreg,
                                    s, calls, rets, fn_s, fn_e, csel=ce_then)
        _, r2, o2, _ = emulate_step(uc, ctx0, start_root, real_starts, roots, root_sreg,
                                    s, calls, rets, fn_s, fn_e, csel=ce_else)
        tn = (r1, o1) if o1 is not None else None
        en = (r2, o2) if o2 is not None else None
        if tn and en and tn != en:
            return blk, [tn, en], "normal", ("csel", csel[0], csel[4])
        one = tn or en
        return blk, ([one] if one else []), "normal", None
    # 无 state-CSEL → 形态 C:双 ret 值 fork
    _, r1, o1, _ = emulate_step(uc, ctx0, start_root, real_starts, roots, root_sreg,
                                s, calls, rets, fn_s, fn_e, ret=0xFFFFFFFFFFFFFFFF)
    n0 = (rj, out0); n1 = (r1, o1) if o1 is not None else None
    if n1 and n1 != n0:
        return blk, [n0, n1], "normal", ("arith",)
    return blk, [n0], "normal", None

def build_cfg(fn):
    """worklist:节点 = (dispatcher_root, state)。遍历产出真实 CFG(含嵌套层)。
       返回 dict 含 cfg:{(root,state) -> {blk,kind,succ:[(root,state)]}}。"""
    f, blocks = get_flow(fn)
    disps = find_all_dispatchers(blocks)
    roots = set(r for r, _ in disps)
    tree_all = set()
    for _, t in disps:
        tree_all |= t
    root_sreg = {r: detect_state_reg(r) for r in roots}
    real_starts = set(blocks.keys()) - tree_all
    seed_refs = compute_seed_refs()
    opaque_blocks = set(b for b in blocks
                        if block_is_opaque(blocks[b]["start"], blocks[b]["end"], seed_refs))
    main_root = disps[0][0]
    uc = make_uc()
    calls = collect_calls(fn); rets = collect_rets(fn)
    ctx0 = run_prologue(uc, fn, main_root, calls, ret=0)
    s0 = uc.reg_read(reg_const(root_sreg[main_root])) & 0xFFFFFFFF

    start = (main_root, s0)
    cfg = {}
    queue = [start]
    while queue:
        node = queue.pop()
        if node in cfg:
            continue
        r, s = node
        blk, outs, kind, branch = block_successors(uc, ctx0, r, real_starts, roots, root_sreg,
                                                   s, calls, rets, f.start_ea, f.end_ea,
                                                   blocks, opaque_blocks)
        cfg[node] = {"blk": blk, "kind": kind, "succ": outs, "branch": branch}
        for nb in outs:
            if nb not in cfg:
                queue.append(nb)
    return dict(fn=fn, blocks=blocks, disps=disps, roots=roots, root_sreg=root_sreg,
                tree_all=tree_all, real_starts=real_starts, opaque_blocks=opaque_blocks,
                main_root=main_root, state_reg=root_sreg[main_root], s0=s0, start=start,
                cfg=cfg, uc=uc, ctx0=ctx0, calls=calls, rets=rets)

# ============================================================
#  Phase 5a — 字符串解密协同(跑 .datadiv_decode* 解密 .data)
# ============================================================

def get_init_array(start=0xAC0E8, end=0xAC198):
    """读 .init_array 段,返回构造函数地址列表(22 个 .datadiv_decode*)。"""
    arr = []
    ea = start
    while ea < end:
        v = ida_bytes.get_qword(ea)
        if v:
            arr.append(v)
        ea += 8
    return arr

def run_decoder(uc, fn_ea, maxinsn=4000000):
    """从 fn_ea 微执行一个 .datadiv_decode 到 RET(skip 外部调用),它原地解密 .data。"""
    calls = collect_calls(fn_ea); rets = collect_rets(fn_ea)
    done = [False]
    def hook(uc, addr, size, ud):
        if addr in calls:
            uc.reg_write(UC_ARM64_REG_X0, 0)
            uc.reg_write(UC_ARM64_REG_PC, addr + size)
            return
        if addr in rets:
            done[0] = True
            uc.emu_stop()
    h = uc.hook_add(UC_HOOK_CODE, hook)
    try:
        uc.emu_start(fn_ea, 0, 0, maxinsn)
    except UcError:
        pass
    finally:
        uc.hook_del(h)
    return done[0]

def decrypt_data(apply=False, dstart=0xAD000, dend=0xB8446, cov_start=0xAC1A8):
    """跑全部 init_array 解码器,把解密后的 .data dump 回 IDB(apply=True 时)。
       幂等:解码前用原始文件密文覆盖 uc 数据段,不受 IDB 已解密状态影响。
       返回 (解密字节, 成功解码器数)。"""
    uc = make_uc()
    data = _load_pristine()
    foff = idaapi.get_fileregion_offset(cov_start)
    if foff != -1:
        n = dend - cov_start
        uc.mem_write(cov_start, data[foff:foff + n])   # 还原密文(幂等)
    arr = get_init_array()
    ok = 0
    for fn_ea in arr:
        if ida_funcs.get_func(fn_ea) is None:
            ida_funcs.add_func(fn_ea)
        if run_decoder(uc, fn_ea):
            ok += 1
    dec = bytes(uc.mem_read(dstart, dend - dstart))
    if apply:
        ida_bytes.patch_bytes(dstart, dec)
    return dec, ok

NOP = b"\x1f\x20\x03\xd5"   # NOP
_COND = {"EQ": 0, "NE": 1, "CS": 2, "HS": 2, "CC": 3, "LO": 3, "MI": 4, "PL": 5,
         "VS": 6, "VC": 7, "HI": 8, "LS": 9, "GE": 10, "LT": 11, "GT": 12, "LE": 13, "AL": 14}

def enc_b(pc, target):
    """B target (imm26, ±128MB)。"""
    off = target - pc
    return ((0x14000000 | ((off >> 2) & 0x03FFFFFF)) & 0xFFFFFFFF).to_bytes(4, "little")

def enc_bcond(pc, target, cond):
    """B.<cond> target (imm19, ±1MB)。"""
    off = target - pc
    return ((0x54000000 | (((off >> 2) & 0x7FFFF) << 5) | _COND[cond.upper()]) & 0xFFFFFFFF).to_bytes(4, "little")

def block_tail_b(blk_s, blk_e, roots):
    """块尾若是 'B <root>'(无条件回 dispatcher),返回 (ea, root) 否则 (None,None)。"""
    last = None
    for ea in block_heads(blk_s, blk_e):
        last = ea
    if last is not None and idc.print_insn_mnem(last).upper() == "B":
        tgt = idc.get_operand_value(last, 0)
        if tgt in roots:
            return last, tgt
    return None, None

def project_blocks(info):
    """node 级 cfg → block 级:blk -> {kind, succ_blocks:[then,else], branch}。"""
    cfg = info["cfg"]
    plan = {}
    for node, v in cfg.items():
        blk = v["blk"]
        if blk is None or blk in plan:
            continue
        sb = [cfg.get(sn, {}).get("blk") for sn in v["succ"]]
        plan[blk] = {"kind": v["kind"], "succ_blocks": sb, "branch": v["branch"]}
    return plan

def plan_patches(info):
    """生成 patch 列表 [(ea, bytes|None, desc)]。
       决策基于【块级】后继数(去重):单后继→B;CSEL双后继→B.cc;B;
       真·形态C双后继(两支不同块,无显式条件)→ 跳过保留(自动 fallback 原 dispatcher)。"""
    blocks = info["blocks"]; roots = info["roots"]; cfg = info["cfg"]
    main_root = info["main_root"]; start = info["start"]; tree_all = info["tree_all"]
    plan = project_blocks(info)
    # dispatcher 树覆盖的全部指令地址(prologue 入口探测要排除)
    tree_insns = set()
    for b in tree_all:
        for ea in block_heads(blocks[b]["start"], blocks[b]["end"]):
            tree_insns.add(ea)
    patches = []; real_tails = set()
    for blk, p in plan.items():
        if p["kind"] != "normal":
            continue
        bs, be = blocks[blk]["start"], blocks[blk]["end"]
        tail_ea, _ = block_tail_b(bs, be, roots)
        if tail_ea is None:
            patches.append((bs, None, "块 0x%x 尾非 B<root>,跳过" % blk))
            continue
        # 块级后继去重
        uniq = []
        for b in p["succ_blocks"]:
            if b is not None and b not in uniq:
                uniq.append(b)
        branch = p["branch"]
        if len(uniq) <= 1:
            real_tails.add(tail_ea)
            if uniq:
                patches.append((tail_ea, enc_b(tail_ea, uniq[0]), "B 0x%x" % uniq[0]))
            else:
                patches.append((tail_ea, None, "块 0x%x 后继未知,跳过" % blk))
        elif branch and branch[0] == "csel" and len(uniq) == 2:
            real_tails.add(tail_ea)
            _, csel_ea, cond = branch
            then_b, else_b = p["succ_blocks"][0], p["succ_blocks"][1]
            if csel_ea + 4 > tail_ea:
                patches.append((csel_ea, None, "块 0x%x CSEL 空间不足,跳过" % blk)); continue
            patches.append((csel_ea, enc_bcond(csel_ea, then_b, cond), "B.%s 0x%x" % (cond, then_b)))
            patches.append((csel_ea + 4, enc_b(csel_ea + 4, else_b), "B 0x%x" % else_b))
            ea = csel_ea + 8
            while ea <= tail_ea:
                patches.append((ea, NOP, "nop")); ea += 4
        else:
            # 真·形态C双分支:保留原样(回 dispatcher 自动 fallback),仅记录
            patches.append((bs, None, "块 0x%x 形态C双分支,保留原样(fallback)" % blk))
    # prologue 入口:仅把【入口块】末尾的 'B main_root' 改为直接跳第一个真实块
    start_blk = cfg[start]["blk"]
    f = ida_funcs.get_func(info["fn"])
    eb = blocks.get(f.start_ea)
    if eb and start_blk is not None:
        etail, etgt = block_tail_b(eb["start"], eb["end"], roots)
        if etail is not None and etgt == main_root and etail not in real_tails:
            patches.append((etail, enc_b(etail, start_blk), "prologue→0x%x" % start_blk))
    return patches

def apply_patches(patches):
    """把 patch 写入 IDB(只改 IDB,不动原 .so)。"""
    n = 0
    for ea, data, _ in patches:
        if data is None:
            continue
        ida_bytes.patch_bytes(ea, data)
        n += 1
    return n

def reanalyze_func(fn):
    """patch 后让 IDA 重新分析该函数(稳健版:清理→逐条成码→plan_and_wait→重定义)。"""
    import ida_auto
    f = ida_funcs.get_func(fn)
    s, e = f.start_ea, f.end_ea
    ida_bytes.del_items(s, ida_bytes.DELIT_SIMPLE, e - s)
    ea = s
    while ea < e:
        if idc.create_insn(ea) == 0:
            ea += 4
        else:
            nx = idc.next_head(ea, e)
            ea = nx if nx > ea else ea + 4
    ida_auto.plan_and_wait(s, e)
    ida_funcs.add_func(s, e)
    ida_auto.auto_wait()

def selftest_step4(fn, apply=False):
    info = build_cfg(fn)
    patches = plan_patches(info)
    print("=== Phase3 patch 规划(fn=0x%x, apply=%s)===" % (fn, apply))
    ok = sum(1 for _, d, _ in patches if d is not None)
    bad = [(ea, desc) for ea, d, desc in patches if d is None]
    for ea, data, desc in patches:
        tag = "  " if data is not None else "!!"
        print("  %s 0x%-7x %s %s" % (tag, ea,
              data.hex() if data else "----", desc))
    print("  可写 patch %d 条,需人工 %d 条" % (ok, len(bad)))
    if apply:
        n = apply_patches(patches)
        reanalyze_func(fn)
        print("  已写入 %d 条 patch 并重分析函数" % n)
    return info, patches


def is_flattened(fn, min_blocks=15, min_indeg=8):
    """判断函数是否被控制流平坦化:块数够多 + 存在高入度纯比较 dispatcher。"""
    f = ida_funcs.get_func(fn)
    if not f:
        return False
    try:
        _, blocks = get_flow(fn)
    except Exception:
        return False
    if len(blocks) < min_blocks:
        return False
    for b in blocks.values():
        if len(b["preds"]) >= min_indeg and is_pure_dispatcher_block(b["start"], b["end"]):
            return True
    return False

def batch_scan():
    """全库扫描被平坦化的函数(排除解码器自身)。返回 [(fn, 块数)]。"""
    flat = []
    for fn in idautils.Functions():
        nm = idc.get_func_name(fn) or ""
        if nm.startswith(".datadiv"):
            continue
        if is_flattened(fn):
            try:
                _, blocks = get_flow(fn)
                flat.append((fn, len(blocks)))
            except Exception:
                pass
    return flat

def batch_deflatten(targets, apply=True):
    """批量去平坦化。targets=[fn,...]。返回 [(fn, 真实块数, patch数, kind)]。"""
    results = []
    for fn in targets:
        try:
            info = build_cfg(fn)
            patches = plan_patches(info)
            nok = sum(1 for _, d, _ in patches if d is not None)
            if apply:
                apply_patches(patches)
                reanalyze_func(fn)
            blkset = set(v["blk"] for v in info["cfg"].values() if v["blk"])
            results.append((fn, len(blkset), nok, "ok"))
        except Exception as e:
            results.append((fn, 0, 0, "ERR:%s" % type(e).__name__))
    return results


def selftest_step3(fn):
    info = build_cfg(fn)
    cfg = info["cfg"]
    print("=== build_cfg 结果(fn=0x%x)===" % fn)
    print("  dispatcher 层 = %d  %s" % (
        len(info["disps"]),
        ["0x%x(sreg=%s,indeg树)" % (r, info["root_sreg"][r]) for r, _ in info["disps"]]))
    print("  节点(root,state)数 = %d   初始 = (0x%x, 0x%x)"
          % (len(cfg), info["start"][0], info["start"][1]))
    blkset = set(v["blk"] for v in cfg.values() if v["blk"])
    print("  覆盖真实块 = %d   (原函数块 %d, dispatcher树 %d)"
          % (len(blkset), len(info["blocks"]), len(info["tree_all"])))
    print("  (root, state) -> 块 [kind] -> 后继")
    for node in sorted(cfg.keys()):
        v = cfg[node]
        succ = " ".join("(0x%x,0x%x)" % (r, s) for r, s in v["succ"]) or "(无)"
        print("   (0x%x,0x%-9x) %-9s [%-8s] -> %s" % (
            node[0], node[1], ("0x%x" % v["blk"]) if v["blk"] else "None", v["kind"], succ))
    return info

# ============================================================
#  基建自测(Step 1):验证段映射 / prologue / dispatcher 映射
# ============================================================

def selftest_step1(fn):
    f, blocks = get_flow(fn)
    root, tree = find_dispatcher(blocks)
    disp_addrs = dispatcher_addr_set(blocks, tree)
    state_reg = detect_state_reg(root)
    s0 = initial_state(fn, root, state_reg)
    print("=== Phase1 识别 ===")
    print("  函数         : 0x%x  (%d 块)" % (fn, len(blocks)))
    print("  dispatcher根 : 0x%x" % root)
    print("  state 寄存器 : %s" % state_reg)
    print("  dispatcher树 : %d 块 / %d 指令" % (len(tree), len(disp_addrs)))
    print("  初始 state   : 0x%x" % (s0 if s0 is not None else -1))

    print("=== Phase2 微执行基建 ===")
    uc = make_uc()
    calls = collect_calls(fn)
    ctx0 = run_prologue(uc, fn, root, calls, ret=0)
    s0_emu = uc.reg_read(reg_const(state_reg)) & 0xFFFFFFFF   # prologue 结束态(真实初始 state)
    print("  初始 state(微执行)= 0x%x   静态扫描值 = 0x%x" % (s0_emu, s0 if s0 else -1))

    real_starts = set(blocks.keys()) - tree
    land = emulate_dispatcher(uc, ctx0, root, real_starts, state_reg, s0_emu)
    in_tree = "是 dispatcher 块(树识别漏)" if (land in tree) else "real 块 OK"
    print("  emulate_dispatcher(0x%x) 落点 = %s  [%s]"
          % (s0_emu, ("0x%x" % land) if land else "None",
             in_tree if land else "无落点"))
    print("  dispatcher 树块:", ["0x%x" % x for x in sorted(tree)])
    return dict(fn=fn, blocks=blocks, root=root, tree=tree, real_starts=real_starts,
                state_reg=state_reg, s0=s0_emu, uc=uc, ctx0=ctx0, calls=calls, landing=land)


def selftest_step2(fn):
    """验证 emulate_step:喂初始 state,看能否拿到 (落点块, 出口 state, kind)。"""
    f, blocks = get_flow(fn)
    root, tree = find_dispatcher(blocks)
    real_starts = set(blocks.keys()) - tree
    state_reg = detect_state_reg(root)
    uc = make_uc()
    calls = collect_calls(fn)
    rets = collect_rets(fn)
    ctx0 = run_prologue(uc, fn, root, calls, ret=0)
    s0 = uc.reg_read(reg_const(state_reg)) & 0xFFFFFFFF
    print("=== emulate_step 链式追踪(单路径, ret=0)===")
    print("  初始 state = 0x%x" % s0)
    s = s0; seen = set()
    for i in range(20):
        if s in seen:
            print("  ... 回到已见 state 0x%x,停" % s); break
        seen.add(s)
        blk, out, kind = emulate_step(uc, ctx0, root, real_starts, state_reg, s,
                                      calls, rets, f.start_ea, f.end_ea, ret=0)
        print("  state 0x%-9x -> 块 %-9s 出口 %-11s [%s]" % (
            s, ("0x%x" % blk) if blk else "None",
            ("0x%x" % out) if out is not None else "-", kind))
        if kind != "normal" or out is None:
            break
        s = out
    return dict(fn=fn, root=root, state_reg=state_reg, s0=s0, uc=uc, ctx0=ctx0)
