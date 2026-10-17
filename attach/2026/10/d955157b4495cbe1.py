#!/usr/bin/env python3
from elftools.elf.elffile import ELFFile
from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB

PATH = "libmyjni.so"
elf = ELFFile(open(PATH, "rb"))
text = elf.get_section_by_name(".text")
code = text.data()
base = text["sh_addr"]
f_off = text["sh_offset"]

symtab = elf.get_section_by_name(".dynsym")
funcs = {}
if symtab:
    for sym in symtab.iter_symbols():
        if sym["st_info"]["type"] == "STT_FUNC":
            funcs[sym["st_value"]] = (sym.name, sym["st_size"])

md = Cs(CS_ARCH_ARM, CS_MODE_THUMB)
md.detail = True

def read_bytes(vaddr, size):
    # map vaddr -> file offset within .text (assume contiguous)
    off = f_off + (vaddr - base)
    return code[off - f_off: off - f_off + size]

out = []
# sort functions and disassemble each within its size
for vaddr in sorted(funcs):
    name, size = funcs[vaddr]
    if size == 0:
        size = 0x40
    start = vaddr & ~1
    blob = read_bytes(start, size)
    out.append("\n===== %08x <%s> (size 0x%x) =====" % (start, name, size))
    for insn in md.disasm(blob, start):
        out.append("%08x:\t%08x\t%s\t%s" % (insn.address, int.from_bytes(insn.bytes, "little"),
                                             insn.mnemonic, insn.op_str))

open("disasm_thumb.txt", "w").write("\n".join(out))
print("wrote disasm_thumb.txt, %d lines" % len(out))
