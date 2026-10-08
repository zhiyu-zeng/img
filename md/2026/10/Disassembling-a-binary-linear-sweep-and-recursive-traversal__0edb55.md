---
title: "Disassembling a binary: linear sweep and recursive traversal"
source: https://nicolo.dev/en/blog/disassembling-binary-linear-recursive/
source_host: nicolo.dev
clip_date: 2026-10-08T10:21:06+08:00
trace_id: 29ac390c-f544-424f-a89a-6b5fb4d08f05
content_hash: 289b143915582ba309366ea041043eee9108c0b95a34ead63348912a897738ee
status: synced
tags:
  - Windows逆向
  - 安全工具
series: null
feed_source: Nicolò Altamura·逆向/混淆分析
ai_summary: 用 Rust+Nyxstone 为 PE/x86-64 构建反汇编器：线性扫描会误把数据当指令，递归遍历从入口点沿控制流恢复更准确但仍有局限。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f375244-d011-81da-9d27-ce02364f06dd
ioc:
  cves: []
  cwes: []
  hashes:
    - 46c7f236b50fb10c1fb684b085c72c985c3c3a77
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 用 Rust+Nyxstone 为 PE/x86-64 构建反汇编器：线性扫描会误把数据当指令，递归遍历从入口点沿控制流恢复更准确但仍有局限。
> 
> - **PE 结构：** MS-DOS stub 偏移 `0x3c` 指向 COFF 头；PE 头含 COFF 与 optional header；数据目录与节表给出节权限、入口点等信息。
> - **定位代码：** 仅找 `.text` 不可靠，`.code`、`.upx0`/`.upx1` 会失败；应找同时含 `IMAGE_SCN_MEM_READ|IMAGE_SCN_MEM_EXECUTE` 且包含 entrypoint 的节；x86-64 单条指令最长 15 字节。
> - **线性扫描：** 从节起始逐条反汇编并按指令长度前进；会把填充、跳转表等数据当指令，示例中产生连续 `int3`、`fstp` 及无法反汇编地址。
> - **递归遍历：** 从 entrypoint 开始，遇 `jmp`/`call`/条件跳转则递归反汇编目标，遇 `ret` 或直接 `jmp` 停止；只保留可达指令，避免 `0x100a` 这类不可达“有效指令”。
> - **局限与增强：** 间接跳转、控制流平坦化可破坏递归遍历；可结合异常/导出/重定位表补充地址，或做数据流/值集分析；文中用 Pest 语法解析 Nyxstone 文本指令。

Building your own set of analysis tools is a great exercise for those who already have some basics in static analysis. It even allows you to later move on to implement more complex analyses in reverse engineering. Even just seeing how the different algorithms can be implemented provides an interesting framework that may help when reverse engineering more difficult-to-analyse binaries, i.e. obfuscated ones.

Excluding the specification of a file format, an executable file contains two main types of information: the **instructions** (what the CPU executes) and the **data** (what information the CPU uses to execute instructions). In order to build the high-level information, each analysis pipeline implements several steps: parsing of the executable file, disassembly of instructions, data-flow analysis, reconstruction of the control-flow graph, and type inference. Obtaining the several types of information is very complex due to the nature of static analysis where many undecidable problems are faced: being able to derive correct information is a difficult matter and each step in the analysis pipeline affects the final result.

Among the first thorny problems to be faced with the implementation of any reverse engineering tool is related to disassembly. Since the instructions form the basis of any analysis (e.g. we need to answer: *what the programme actually does*), recovering disassembled instructions turns out to be the first analysis step to be implemented.

In this post, we will look at how to start building a simple disassembler for reverse engineering a PE binary file (the ones running on Windows systems) targeting the Intel x86/64 architecture, based on [Nyxstone](https://github.com/emproof-com/nyxstone/). We will explore two different disassembly techniques, called **linear sweep** and **recursive traversal**, highlight some of the weaknesses of these techniques, and identify some solid points with which to begin disassembly.

## The Portable Executable file format

Before digging into instructions, we have to understand how an executabile file is composed and by which information. As we have mentioned earlier, an executable file can be summarised very simply as a file containing a set of information for the loader (i.e. the component that loads the executable into memory and starts it), instructions and data. The PE format ([Portable Executable](https://en.wikipedia.org/wiki/Portable_Executable)) is one of them: it is a format for executable files that mainly target Windows-based platforms. It is a pretty old file format, but seeing its characteristics helps into writing the decoder.

There are too many resources about the characteristics of this executable format. Still, it’s important to revise the information that format exposes us. The PE format for the executable format includes two types of headers:

-   MS-DOS stub: type of header that Microsoft left within the file format for backward compatibility only. It consists of some instruction that prints ‘Cannot run this program in DOS mode’ when the PE program is run in DOS mode. Inside the offset `0x3c` is the true offset of the COFF header.
    
-   PE header: includes two sub-headers, the COFF header which includes some general information (such as target architecture, number of sections, time-datastamp, offset to symbol table) and the ‘optional’ header (required for executable files) which contains a number of loader-specific fields (such as entrypoint, data size, instruction size).
    

After the headers, we find other very important data structures: data directories and sections. Data directories are a set of structures that can only be found in the executable PE file and represent some special sections such as the API import, the resource section, the debug resource section, the TLS directory. These sections are very special and give precise directives to the loader, which prepares data structures for certain functionalities, such as calling system APIs, handling exceptions or handling run-time relocations.

Next, we have the section table: a section header includes the name of the section, the virtual size, the virtual address, the physical size of the section, characteristics and permissions associated with each section. The parsing of each PE file is completed by reading the bytes for each section, and depending on the type of section, further parsing may be necessary (e.g. for the section with the constant data, it may be interesting to perform string identification).

These paragraphs were intended as a very quick reminder of the structures that make up an executable file, but for good documentation, it might be useful to consult *[A dive into the PE file format](https://0xrick.github.io/win-internals/pe1/)* and the [official documentation](https://learn.microsoft.com/it-it/windows/win32/debug/pe-format) that Microsoft provides.

## The disassembling process

The CPU is able to execute the PE file by simply jumping from one instruction to another and executing them. The instructions are in binary format and are encoded in this way so that the CPU and the various sub-circuits can execute them simply by raising or lowering certain signals in a precise pattern.

The Instruction Set Architecture (ISA) defines the relationship between how an instruction should be encoded in binary and the semantic value of the instruction. The translation from binary encoding to text-readable instruction is called disassembly and consists of extracting instructions from an executable file. These instructions are the basis for inferring what the programme might do at runtime and for subsequent analysis steps (dataflow analysis, type inference and construction of flow control graph constructs).

At a high level, we find no particular obstacles: we want to read the data structures of the input file based on the PE file format, we want to be able to extract the instructions and show them to the analyst in some way. As we shall see, already this analysis step presents challenges concerning: where are the instructions, how to understand what is an instruction, what is data and how to find them without using probabilistic methods.

## InsPEctor

The idea is to develop a command-line tool that given a PE file can print out the instructions that probably represent the functions executed at runtime. This project, called `InsPEctor` for the occasion, is written in Rust and will be based on the [Nyxstone](https://github.com/emproof-com/nyxstone/) disassembler, a wrapper that exploits the disassembler already implemented within LLVM. Using a framework such as Nyxstone will avoid the discussion of how to write a program that disassembles a single instruction of a CISC architecture (and especially avoid writing instruction decoding on an architecture such as x86_64). Our goal is to correctly find instructions and print them out at the command line; we will want to find instructions that are true to the semantics of the programme (i.e. we will want to find the same instructions that will potentially be executed at runtime).

Rust is an excellent programming language that I recommend; it allows one to write software that is very fast and easy to maintain. Rust also provides developers with a number of details that are of primary importance, such as a simple system for managing dependencies, static analysis tools that help in writing clean code, and a system for forcing the developer to write documentation. In addition to Rust, we are going to use [Nyxstone](https://github.com/emproof-com/nyxstone), which was developed by the [Emproof](https://emproof.com/) team and is a wrapper placed on top of LLVM. Among the various disassembly frameworks, it appeared to be the easiest to integrate and most robust because it exploits disassemblers already written for the various LLVM architectures. Furthermore, nyxstone also presents an interface for assembling code, which could be interesting for further projects. It has bindings for Rust, C++ and Python, which makes it very easy to integrate into existing or very large projects.

Since InsPEctor can be very interesting to manipulate, the code is [available on Github](https://github.com/seekbytes/insPEctor/tree/1_disassembler) and will be used in other articles to extend functionality or implement new analyses. Further information on how to build the project and some system requirements can be found in the README.

For our examples, we’ll use `calc.exe` (shasum: `46c7f236b50fb10c1fb684b085c72c985c3c3a77`), an executable file that takes care of making a call to `ShellExecuteW` to open the real Windows calculator, implemented inside the shell components. This file does not weigh very much (about 192kb) and is very simple from a semantic point of view. To compare how good our methods are, we can use any type of commercial disassembler such as Binary Ninja or IDA, or an open-source disassembler such as Ghidra. We say that our tool is almost correct if it can identify the same instructions that any other disassembler can identify at the same address.

All the disassembly and construction information can also be applied, with some subtle differences, to other types of executable file formats, such as ELF and Mach-O, and with targets of other architectures (such as ARM or PowerPC). Each architecture will have certain peculiarities that will have to be dealt with when implementing the disassembly, but more or less the same algorithm will always be used.

We leave it to the reader to independently implement a binary parser; the `InsPEctor` project makes use of the [Goblin](https://docs.rs/goblin/latest/goblin/) library, which has proven to be solid in reading binary file formats such as ELF, MachO and PE.

Rewriting a binary parser for a file format such as PE is another good exercise for analysts but is beyond the scope of this post. Furthermore, any reader of binary file formats requires a particularly large testing corpus to resolve some ambiguous file format details; to speed up development, we opted to use this library. In addition to the speed of reading an executable file, Goblin makes it possible to ignore the thorny issue of translation from absolute virtual address and relative virtual address (for more information: [*‘Inside PE File Format’*](https://www.virusbulletin.com/virusbulletin/2006/06/inside-pe-file-format/)).

Below is the code that was used to perform the parsing:

```rust
// We create a path from the string in input
let path = Path::new(&path_str);

// Read the file 
let buffer = fs::read(path)?;

// Call to Goblin parser, we are expecting a valid PE to be parsed
let pe = match Object::parse(&buffer)? {
    Object::PE(pe) => pe,
    _ => bail!("We do not support any files besides PE"),
};
```

The variable `pe` will find itself valued by an object of type `Object::PE(pe)`. At this point we can start handling the file, assuming it is a PE file. As an exercise for the reader, we could implement more accurate checks (does the input file exist? Is the input file a PE file or a DOS object?). We can start by analysing the sections to find the raw bytes of the instructions.

### Finding the instructions

To find the instructions within the executable file, we can use various methods and approaches. Let us proceed step by step: we exploit the information given by the file format to find where the raw bytes of the instructions can be found. The information given by the file format specifies which memory areas are to be allocated at runtime and the permissions associated with them.

In order to identify instructions, we need to use heuristics, a method that may not always work but is effective in finding out where instructions might be. The goal is to use the sections obtained from the file format, iterate over them and find the first sections whose associated permission is to execute. In fact, the instructions in memory must reside in a section of memory which you can execute, otherwise what we will see at execution is a `Segmentation fault`. Another very simple rule we can use is to identify sections with the name `.text`, but this approach has limitations, especially for other binaries which might use `.code` as the section name or `.upx0` and `.upx1` for the famous UPX packer.

A different approach, very similar to cryptanalysis, is to identify instructions by pattern matching (i.e., machine learning-based approaches such as [Dyninst](https://www.paradyn.org/papers/Bernat11AWAT.pdf) and [ByteWeight](https://www.usenix.org/system/files/conference/usenixsecurity14/sec14-paper-bao.pdf) use this type of heuristics). Most functions that use the stack to allocate local variables start with the famous `push rbp; mov ebp, esp;` instruction (in bytes `0x55 0x48 0x89 0xe5`). We can exploit this information to identify very likely patterns of functions starting with those instructions. This heuristic is not effective: `0x55 0x48` also encodes the two ASCII letters `UH`. Since it is not possible to identify exactly where the instructions are, this heuristic is a probabilistic one, because in the absence of safe information we cannot say with certainty which instruction is the beginning of a function. In addition, there appears to be another problem: these instructions are valid for some compilers and for some types of functions; for other types of compilers, and other types of instructions may not be valid: the problem arises as to how we can update these ‘signatures’.

So to summarise, what is a heuristic that might work? Most software that begins disassembly starts with a section that is **executable** (generally the executable section has both read and execute permissions) and by exploiting the value of a particular field it is possible to find where the instructions are. The particular field we cite is the **entrypoint**, i.e. the virtual address or physical offset (depending on the file format) where the CPU must jump to start execution. We thus recognise a solid statement that cannot be refuted: **the entrypoint must point to an executable instruction**.

By identifying the section containing the entrypoint, it is possible to begin to understand which data could potentially be instructions and which could not. Within a project like `InsPEctor`, you could implement different kinds of ideas that we mentioned in the previous paragraphs.

The first and simplest idea is to identify the section called `.text`.

```rust
// First idea: select the section that has ".text" as name
let text_section = pe
        .sections
        .iter()
        .find(|section| section.name().unwrap() == ".text")
        .ok_or_else(|| anyhow!("No .text section found"))?;
```

This heuristic already fails with the first executable file that uses an executable section with a name other than `.text`, such as `.code`. The second idea is to identify all executable sections then. To identify an executable section, within the structure describing a section, you can find the `Characteristics` field, which identifies flags used to describe the permissions associated with each section. Since we are interested in executable permissions, we can use `IMAGE_SCN_MEM_EXECUTE` (0x20000000) and `IMAGE_SCN_MEM_READ` (0x40000000). The PE file format, however, adds an additional flag that might come in handy to check: `IMAGE_SCN_CNT_CODE`, a flag indicating ‘the section contains executable code’; we can then check this flag as well.

```rust
// Second idea: find the first section that is readable and executable
let text_section = pe.sections.iter()
.find(|s| {
    s.characteristics & (IMAGE_SCN_MEM_READ | IMAGE_SCN_MEM_EXECUTE) as u32
        == (IMAGE_SCN_MEM_READ | IMAGE_SCN_MEM_EXECUTE) as u32
})
.ok_or_else(|| anyhow!("No executable section found"))?;
```

For this case, we use `find` to stop the search at the first executable section we can find. Otherwise if we wanted to search **all** the sections, we can use `.filter()` and then iterate over the executable sections. The third idea follows the idea of the second by adding an extra clause on the search. We’ll want the executable section to contain the program entrypoint. The program entrypoint is a value exported from Goblin’s `PE` structure, so it’s very easy to find.

```rust
// Third idea: find the executable section that contains the instruction pointed to by the entrypoint
let entrypoint = pe.entry;

let text_section = pe
            .sections
            .iter()
            .find(|s| {
            	// The entrypoint must be an address that is present between the beginning of the section and the end of the section (end == start address + virtual size)
            	entrypoint > s.virtual_address as usize
                    && entrypoint < (s.virtual_address + s.virtual_size) as usize

            	// Checking that the section is executable
                s.characteristics & (IMAGE_SCN_MEM_READ | IMAGE_SCN_MEM_EXECUTE) as u32
                    == (IMAGE_SCN_MEM_READ | IMAGE_SCN_MEM_EXECUTE) as u32
            })
            .ok_or_else(|| anyhow!("No executable section found"))?;
```

We then save the physical offset of where it starts and the size of the executable section. To begin with, we can define an alias data type called `Address` to make it easier to match `u64` with the address type. However, this should not be abused to avoid confusing physical addresses and virtual addresses (within the PE format, virtual address and physical address are two very different concepts).

```rust
let begin_text_section_addr = text_section_offset.pointer_to_raw_data as Address;
let size_text_section = text_section_offset.size_of_raw_data as usize;
```

### Disassembling with Linear sweep

The first disassembly technique we can see, besides being the most intuitive, is called linear sweep and consists of calling the disassembler for each instruction we find. The idea is to start from an address, read a series of bytes and call the disassembler provided by Nyxstone to disassemble a single instruction. To get the next instruction, it is necessary to skip the bytes of the already disassembled instruction and read from that address.

In a very simple way, one can summarise the algorithm by means of this pseudocode:

```python3
while(curr_address < end_text_section_address):
	instruction_buffer = read(file_buffer, curr_address, curr_address + instr_generic_size)
	instr_disassembled = disassemble(instruction_buffer, current_address)

	print("instruction: ", instr_disassembled)

	current_address += instr_disassembled.size()
```

I start by initialising `curr_address` at the beginning of the raw bytes representing my instruction, and then until I reach the end of the section, I continue to disassemble the instruction. For each potential instruction, we read a set of bytes from the current address. `instr_generic_size` is the size of a generic instruction within the Intel X86_64 instruction set architecture. Since that ISA defines a **variable** size per instruction, we must take the maximum number of bytes an instruction can occupy (for the x86_64 ISA it is 15 bytes). The disassembly of the instruction is done via a certain `disassemble` function (Nyxstone provides two functions to get the instruction: one method which returns only the string, and another method which returns the string, the bytes of the instruction and the address at which the instruction was found), and we continue by advancing from address to address adding the size of the instruction we have just assembled.

In Rust, that translates:

```rust
// Last address of the executable section
let end_address = file_read.text_section_addr as u64 + file_read.size_text_section as u64;

// Cursor representing the buffer or content of the file to be scrolled over
let mut cursor = Cursor::new(
    &file_read.bytes[..file_read.text_section_addr as usize + file_read.size_text_section],
);

// The current address
let mut curr_address = file_read.text_section_addr;

// The buffer containing a possible instruction
let mut buffer_instruction = [0; MAXIMUM_SIZE_X86_INSTR as usize];
```

Now we have to implement the while loop; we have to go from the first address to the last, which may be the final address subtracted from 15 because we have to fill the entire buffer. This is not the best way to implement such a disassembly because it is possible that the last instructions will not be considered. Within the while loop, we move with `cursor.seek` and read exactly 15 bytes. We call nyxstone, which allows us to disassemble instructions and specify how many instructions we want to disassemble (the code for this method is not present, but we simply call `disassemble_to_instructions(bytes, address, 1)` inside nyxstone).

Once this is done, we print the address and instruction. Inside nyxstone, the instruction is represented with some fields such as the address of the instruction and its meaning in text (it is a string). We will address later on how to unlock the functionality of this information by parsing the text. We will move on by adding the size of the instruction to the current address until we have finished.

```rust
while curr_address < end_address - MAXIMUM_SIZE_X86_INSTR {
	let mut instruction_size = 1;

	if cursor.seek(SeekFrom::Start(curr_address)).is_ok() {
	   cursor.read_exact(&mut buffer_instruction)?;

	   let i = nyx_stone_helper.disassemble_to_instructions(buffer_instruction.as_slice(), curr_address);
        
        match i {
            Ok(i) => {
                if i.len() != 1 {
                    return Err(anyhow!("We expect only one instruction"));
                }
                println!("Addr: {:x}\tInstr: {}", i[0].address, i[0].assembly);
                instruction_size = i[0].bytes.len() as u64;
            }
            Err(_) => println!(
                        "Problem, instruction cannot be disassembled at address 0x{:x}",
                        curr_address
            ),
        }
    }

	curr_address += instruction_size;
}
```

Using the example file and trying to run inspector with this file, we immediately notice something strange:

```yaml
Addr: 0x1000	Instr: int3
Addr: 0x1001	Instr: int3
Addr: 0x1002	Instr: int3
Addr: 0x1003	Instr: int3
Addr: 0x1004	Instr: int3
Addr: 0x1005	Instr: int3
Addr: 0x1006	Instr: int3
Addr: 0x1007	Instr: int3
Addr: 0x1008	Instr: jno 19
Addr: 0x100a	Instr: fstp qword ptr [rsi - 114]
Problem, instruction cannot be disassembled at address 0x100d
Addr: 0x100e	Instr: cmp eax, 1213415589
Addr: 0x1013	Instr: sub esp, 64
```

From this example, we can identify some problems, such as:

-   a series of instructions are `int3` (in `cc` bytes) which are repeated several times at the beginning of the hypothetical function.
-   at address `0x100a` there is an instruction which handles a floating point number, subsequently placing it at the memory address pointed to by `rsi` subtracted 114.
-   it is not possible to disassemble the instruction at address `0x100d`.
-   at address `0x1013` there is an instruction which modifies the stack pointer

We realise that our algorithm may not be the best, since of all the instructions, the real ones detected by other disassemblers are those from address 0x1013 onwards. We made a possible mistake: we unintentionally assumed that the section containing the instructions began with a function, but what if it began with a datum instead?

The linear sweep algorithm unfortunately does not know which information represents an instruction or which a datum. Let’s assume, for example, that we have a direct jump to an instruction such as `jmp 0xa` and after the data instruction. Using the linear sweep, the algorithm would attempt to disassemble the data as instructions. If we fail to disassemble a certain buffer, we may well attempt to continue with the algorithm, however we may lose a lot of very important information (where do we start to disassemble from?).

In order to improve the algorithm, we can start from a secure piece of information such as the entrypoint. Recall that the instruction pointed to by the entrypoint must be valid because it is the same information that the loader uses to jump to program execution after preparing the memory areas. However, even after this improvement, we may have problems because we do not know where to continue next.

### The problem of distinguishing between instructions and data

Within the heuristics we gave to find an executable section, we skipped a fundamental detail. In fact, we assumed that each executable section contained only instructions. The assumption is based on the following assertion: taken a random sequence of bytes, that sequence encodes **always a valid instruction**. Unfortunately, this fact does not prove to be true: within the executable sections, data can also be found.

Finding data within an instruction section is far from rare, especially with some modern compilers. One reason for inserting read-only data between instructions is due to certain architectural constraints that the compiler must adopt in order to make the code faster.

For example, placing a function at a certain address could make the code faster since the retrieval of instructions is implemented through caches. Let us assume for simplicity’s sake that we have a set of instructions that have been split in half between two memory zones; an intelligent compiler recognises that the cost of fetching 2 memory zones is more than the cost of fetching a single memory zone. Therefore, it is preferred to move instructions so that the number of memory zones to be retrieved is optimised. The compiler, by moving a function to another ‘zone’ of memory, creates a so-called ‘hole’, a kind of cavity which is usually filled with `0x00` or `0xcc` bytes. One possible use of this unused area could be the allocation of read-only data between instructions.

Another reason we will also see in the next section is that of jump tables. Jump tables are a series of addresses that are written in sequence and are used to be able to implement a series of jumps; mainly to implement the switch construct, we can see jump tables as tables that make it much easier to jump from an elementary block to potentially more than one. Such tables represent another source of data for the reverse engineering tool.

Distinguishing between code and data is one of the many undecidable problems, for which we have no certain algorithms to be able to correctly identify between what is used as code and what is used as data. Most analysis tools implement certain heuristics to be able to differentiate between instruction and data. For example, failing to disassemble a buffer of arbitrary bytes could be considered as a data set.

Furthermore, finding bytes within buffers that specify memory addresses turns out to be a good way to distinguish between data representing addresses and instructions with a certain degree of approximation. However, there is no global solution: what is possible to derive is the result of a series of heuristics fed by certain information within the executable file format. For example, finding relocations pointing to certain data could indicate that this data is in fact addresses (the information would then be propagated within the binary file).

### Disassembling based on recursive traversal

We realised a possible problem with the linear sweep: Intel’s x86_64 ISA has instructions that vary in size, making the disassembler context-sensitive. Context-sensitive means that depending on which address you start the disassembly process, you can have different instructions. Having different instructions for the same byte sequence means having different semantics depending on how we perform the disassembly process, introducing ambiguity.

To improve the algorithm, some might suggest using the information ‘this buffer is not possible to disassemble’ as a kind of discriminator between instructions and data. This type of heuristic is indeed used, but it presents a subtle problem: buffers representing instructions is not the same as actually saying that these instructions are potentially executable. In the example above, the instruction at address `0x100a` (`fstp qword ptr [rsi - 114]`) is an instruction which appears to be valid since it handles a floating point and a memory address. But it is not present within the instructions that the disassemblers manage to extract from the binary. The reason is that there is no instruction that can reach the address `0x100a`.

We therefore want to avoid all situations in which we are not sure whether an instruction is actually executed. As we shall see, we cannot be 100% sure that this does not happen, but we can refine the linear sweep algorithm by introducing another assumption that all reverse engineering tools make. **Each disassembled instruction is joined by another instruction from the entrypoint.**

The recursive traversal algorithm allows us to refine the disassembly algorithm based on the information available from the flow control. For each instruction, we evaluate its semantic power and if the instruction we are analysing changes the flow control, we start another disassembly on the target of the instruction (i.e. the first immediate operand of the instruction).

Suppose, for example, we have a set of instructions such as:

```asm
140001031	cmp     eax, 0x1
140001034 	jne     0x140001057	; restart disassembly at address 0x140001057

140001036	test    r8b, r8b
140001039	je      0x140001043 ; frestart disassembly at address 0x140001043

14000103b 	movzx   eax, r8b
14000103f	inc     eax
140001041	jmp     0x140001048 ; restart disassembly at address 0x140001048
```

The information being pointed to by the conditional and unconditional jump instructions are **potentially** instructions. The idea is to start further disassembly at addresses `0x140001057`, `0x140001043` and `0x140001048`.

A possible algorithm is the following one (written in Python):

```python
instructions_found = []
def disassemble_at(address):
	current_address = address
	continue_disassemble = True
	while(continue_disassemble):
		instruction_buffer = read(file_buffer, curr_address, curr_address + instr_generic_size)
		instr_disassembled = disassemble(instruction_buffer, current_address)

		if instr_disassembled.changes_control_flow():
			# get the first immediate operand
			target = instr_disassembled.get_target() 
			# recursive call to disassemble_at
			disassemble_at(target + instr_disassembled.size())
		
		if instr_disassembled.is_ret() or instr_disassembled.is_jump():
			continue_disassemble = False

		if instr_disassembled is None:
			continue_disassemble = False

		instructions_found.append(instr_disassembled)

		current_address += instr_disassembled.size()
```

We start the disassembly from a certain address and analyse each type of instruction that we successfully disassemble. If the instruction we just disassembled changes the flow control (i.e. its opcode is part of the `jmp, ja, jb, je, jne, call`), then we call the `disassemble_at` function recursively by starting the disassembly from the target encoded by that instruction. For example, assuming we have a `call 0x100019a` instruction, disassembly starts from the `0x100019a` instruction.

The algorithm stops when: we have no further instructions to evaluate within this disassembly (i.e. when we encounter the return instruction), or when we encounter a direct non-conditional jump to another branch. In fact, we only continue the disassembly when we know that a valid instruction is present after the instruction that changes the flow control. This is true in cases where the execution ‘splits’ in the flow control with a conditional jump. It is not true for all those cases where disassembly stops with such an instruction, for example with `ret`, a direct jump or potentially a call to a function that does not return. Other borderline cases are certain instructions such as breakpoints and interrupts which should be analysed on a case-by-case basis.

The hypothesis ‘an instruction is only valid if it is reached’ is very strong to assert since a possible attacker could exploit the information ‘every immediate operand points to a valid instruction’ to insert dead branches where the disassembly could continue on other sections. Furthermore, an attacker could insert other instructions into the dead branches that change the flow control whose immediate operands affect portions of the binary file already identified as data.

The recursive traversal algorithm is very powerful because it only disassembles instructions that can be reached by other instructions. Someone might ask where we start to disassemble: the answer to this question turns out to be very simple because the entrypoint is the first instruction that we will always have to disassemble (since it is always valid!).

In Rust, this algorithm results in the following code snippet:

```rust
/// Function for calling the recursive disassembling
/// Parameters
/// - cursor: the pointer to a reader that implements seek + read
/// - start_address: the initial address where we want to start the disassemble
/// - global_list:
/// - instructions: an array of instructions
fn recursive_disassemble(
    cursor: &mut Cursor<&[u8]>,
    start_address: Address,
    global_list: &mut Vec<Address>,
    instructions: &mut Vec<Instruction>,
) -> Result<()> {

// Add the instruction address to the one already seen
global_list.push(start_address);

let mut continue_to_disassemble = true;

while continue_to_disassemble {
    if cursor.seek(SeekFrom::Start(current_address)).is_ok() {
        cursor.read_exact(&mut buffer_instruction)?;

        let instruction = nyxstone.disassemble_to_instructions(buffer_instruction.as_slice(),
         current_address);

        match instruction {
            Ok(instruction) if instruction.len() == 1 => {
                // parse the instruction
                let instr_parsed = InstructionParser::parse(
                    instruction[0].assembly.as_str(),
                    instruction[0].address,
                    instruction[0].bytes.len(),
                )?;

                if instr_parsed.change_cfg() {
                    if let Some(target) = instr_parsed.get_target()? {
                        let current_target =
                            target + instr_parsed.instruction_size as Address;
                        if !global_list.contains(&current_target) {
                            // Recursive calling
                            Self::recursive_disassemble(
                                cursor,
                                current_target,
                                global_list,
                                instructions,
                            )?;
                        }
                    }

                    if instr_parsed.is_conditional_jump() {
                        // Recursive calling
                        Self::recursive_disassemble(
                            cursor,
                            current_address + instr_parsed.instruction_size as Address,
                            global_list,
                            instructions,
                        )?;
                    }
                }

                if instr_parsed.is_ret() || instr_parsed.opcode == X86Opcode::Jmp {
                    continue_to_disassemble = false;
                }
                current_address += instr_parsed.instruction_size as Address;
                instructions.push(instr_parsed);
            }
            _ => {
                println!("We have no instructions for address: {:x}", current_address);
                current_address += 1;
                continue_to_disassemble = false;
            }
        }
    } else {
        continue_to_disassemble = false;
    }
}
```

It is clear why this algorithm is called **recursive traversal**: we find the recursive call to the same method to disassemble from a certain address onwards. The function in fact consists of 4 important parameters: a cursor used to perform the byte read and seek operation, the address from which we wish to start the disassembly, a list of global addresses already selected to restart the recursive traversal, and a vector containing the instructions.

Returning to the example programme, we can immediately highlight the effectiveness of the recursive traversal algorithm compared to the linear sweep algorithm. We find instructions that seem more correct than the other method:

```javascript
1740, "sub rsp, 40"
1744, "call -1509"
1749, "add rsp, 40"
174d, "jmp -658"
14c0, "mov rax, rsp"
14c3, "mov qword ptr [rax + 8], rbx"
```

For example, at address `0x1740` we have an instruction which changes the `rsp` register, the stack pointer, to allocate 40 bytes on the stack. Two instructions later, and we have another instruction which changes the `rsp` register to deallocate the 40 bytes reserved on the stack. This may already be a first analysis of what a function is. In fact, as we expect, after the last instruction `jmp -658`, we have another totally different address, a sign that the disassembler process jumps to another address. We will deep dive into function building, and basic blocks because it is obvious that this kind of view is not enough for the analyst.

As for the algorithm itself, one possible doubt turns out to be how to take the target of the instruction we have just disassembled. The instructions returned by Nyxstone are instructions in a raw state with few details: the text of the disassembled instruction, the address and the size in bytes. The next step is to write a grammar using [Pest](https://pest.rs/), which is capable of parsing the string returned by the Nyxstone framework. For those who wish, the code of the grammar is available [on Github](https://github.com/seekbytes/insPEctor/blob/1_disassembler/src/disassembler/grammar.pest); improvements are warmly accepted.

```pest
instruction = { opcode ~ (operands ~ ","?)* ~ operands? }
opcode = { "xor" | "xchg" | ...}
operands = { memory | register | immediate }
register = { "rsp" | "rbp" | ...}
```

Pest requires parsing rules to be written by the developer: this step may not be trivial because instruction operands have recursion. Example given by citing the intel manual: “a memory operand could be: a register, an immediate operand or a combination of these. Therefore, the goal is to obtain structures that carry the opcode and instruction operands without querying the string (retained only for “aesthetic effect” during print, but can be eliminated as a field).

```rust
/// Represents a concrete instruction for insPEctor.
#[derive(Clone, Default, Debug)]
pub struct Instruction {
    /// address for the instruction
    pub address: Address,
    /// opcode for the instruction
    pub opcode: X86Opcode,
    /// list of operands
    pub operands: Vec<X86Operand>,
    /// instruction size
    pub instruction_size: usize,
}
```

An alternative to writing a parser is to do very trivial matching on the instruction type by calling the `instruction_str.contains(&opcode)` function. This approach is very simple, but in the long run may not be the best solution, especially when matching opcodes like ‘mov’ and not taking instructions like ‘movzx’ or ‘movabs’. It then becomes very complex to extract operands like registers and memory expressions in an orderly way: for example, to extract the `rax` register from `mov rax, 0` you have to check that there is no `[rax]` memory expression. The recommended approach is to bang your head on a grammar and build the parser with help from Pest. A very good alternative to Pest’s grammars is also PEG: both libraries allow you to write a grammar that can do precise matching on the text of the instruction derived from Nyxstone.

A further problem with this algorithm is that every instruction which changes the control-flow must have the first operand immediately. This is obviously not true for every instruction in the flow control; with indirect jumps (e.g. `jne %rax`) it is possible to encode the semantics `rip = rax`, i.e. jump to the address which is inside RAX. It is not uncommon to find this kind of code, especially in functions using jump tables where there is a need to use a register to hold the next address to jump to.

Attackers could exploit this problem to turn any direct-type jumps into indirect-type jumps, using an obfuscation technique called **Control Flow Indirection**. [FairPlay](https://nicolo.dev/en/blog/fairplay-apple-obfuscation/) and numerous other obfuscated programmes have the indirect type jumps to destroy this type of disassembly and force the disassembler to use a linear approach (decreasing the precision of the analysed instructions).

### Adding information from other sections

We have found that for code that is never called (e.g. with indirect calls or instructions that use non-immediate operands), recursive traversal may not be a good algorithm. Although this detail does not play an important role for our disassembler, we want to see if we can increase the accuracy of the algorithm.

We can include within the algorithm certain memory locations that we know to be instructions (in this case, the beginning of certain functions). This type of information is obtained from certain structures in the file format. For example, iterating over functions that are exported from the binary file, iterating over the section that specifies where there may be exceptions are some of the techniques that are used to add information to the context.

The potential idea is to collect ground-truth addresses and then start disassembly on those addresses as well: this should increase the disassembler’s coverage of the binary file. Like any structure, this could be used by some attackers to disassemble useless code to add noise to the analysis.

```python
def collect_addresses():
	addresses = []

	# parsing of exception section
    addresses.extend(parse_exception_section())

	# parsing of export
	addresses.extend(parse_export_section())

    # parsing of relocations
	addresses.extend(parse_relocation_section())

    for address in addresses:
		disassemble_at(address)
```

Regarding the target of instructions that are not immediate operands, it is necessary to implement more robust and deeper analyses to understand the contents of registers. Some algorithms that have been proposed over time include the application of data-flow analysis, Value Set Analysis and the concrete execution of instructions to calculate the target of a possible jump. For example, transforming direct-type jumps into indirect-type jumps allows most disassemblers to be broken. In other cases, it is really very complex to infer where a register is pointing (we have no analysis to derive the memory content a priori) and if [Mixed-Boolean arithmetic expressions](https://nicolo.dev/en/blog/introduction-pocket-obfuscator/) are used, this could be a further obstacle to have a crystal-clear disassembly.

## A possible extension

Writing a blog post to develop a disassembler using PE and Intel x86_64 architecture meant writing a disassembler for a very complex combination of executable format and architecture: the PE file format is very verbose and contains some structures only for backward compatibility, while Intel instructions are of variable size, there might be some overlapped instructions and the CISC architecture does not improve the analysis. With this post, we were only able to print out the individual instructions contained within the binary.

A paper I recommend on this topic is [Disassembly of Executable Code Revisited](https://www2.cs.arizona.edu/~debray/Publications/disasm.pdf): the authors try to identify which of the two techniques is the best, proposing some benchmarks (it turns out that recursive traversal is way better than linear sweep, but a mixed approach is interesting too). Among the problems we have been able to mention, especially those that still remain open such as [Tail Calling](https://en.wikipedia.org/wiki/Tail_call) and [jump table inference](https://en.wikipedia.org/wiki/Branch_table) via Value-Set analysis, I can suggest reading an article by the Vector35 team, developers of Binary Ninja, entitled [‘Architecture Agnostic Function Detection in Binaries’](https://binary.ninja/2017/11/06/architecture-agnostic-function-detection-in-binaries.html).

As a possible extension for those who want to try building a disassembler, they can try to apply the same concepts for other types of executable files such as ELF or MachO and for other types of architectures (ARM, PPC, RISC-V). The main idea is always the same: parsing the file and exploring the instructions in any type of format. The type of architecture could change the choice between linear sweep and recursive traversal: the instructions of some architectures have a fixed size and one could be inclined to implement the linear sweep directly. Although in the case of architectures such as ARM it might make sense, we will have to return to discussing the problem of the difference between data and instructions: the choice of recursive traversal turns out to be a good way of correctly disassembling a binary.

In addition, as some may already have noticed, InsPEctor is very feature-poor. Although the CPU sees each instruction individually, analysts might be interested in high-level type of information (such as local functions and the control-flow graph). The next article will therefore see the extension of this tool with the construction of basic blocks, and modifying part of the recursive traversal algorithm.

As always, if you have criticism, suggestions or any other comments, you can email [seekbytes@protonmail.com](mailto:seekbytes@protonmail.com).
