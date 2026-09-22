---
title: Rewriting CheatEngine in Rust for the Terminal | Varik's Blog
source: https://varik.dev/blog/cheat-engine-rs
source_host: varik.dev
clip_date: 2026-09-22T10:14:37+08:00
trace_id: f95be0d6-7409-4866-ab1f-23b108ba9788
content_hash: 5c011ba09c627c606934d2d142d940c287369070eb87e38c34ff53a28e145d6f
status: synced
tags:
  - 安全工具
  - CTF
series: null
feed_source: Varik
ai_summary: 用 Rust 从零实现终端版 Cheat Engine，通过分块、`memmem` 与 rayon 并行把内存扫描提速约 30 倍。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3e375244-d011-81ef-9def-d482b3e200e2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用 Rust 从零实现终端版 Cheat Engine，通过分块、`memmem` 与 rayon 并行把内存扫描提速约 30 倍。
> 
> - **核心三能力：** 枚举目标进程内存区域、读取任意地址、写入可写地址；Linux 读 `/proc/[pid]/maps`，macOS 用 `mach-sys` 的 `mach_vm_region`，读写用 `process-memory` crate。
> - **扫描流程：** 首次扫描定位值 → 目标程序改变值 → 下次扫描按新旧值过滤 → 重复直至锁定地址，即经典的 Cheat Engine 迭代法。
> - **性能优化：** 按 64KB 块读取并在本地匹配，改用 `memchr::memmem` 做模式匹配，再用 `rayon` 多核并行；块步进为 `block_size - (value_size - 1)` 以重叠，避免跨块边界漏匹配。
> - **TUI 实现：** 基于 `ratatui`，支持 j/k、gg/G、Tab 切换与 Normal/Insert 两种模式；原 1000 行 `app.rs` 重构为 Command 模式，渲染隔离在 `ui.rs`。
> - **限制与实践：** macOS 上仅对非 App Store 应用有效，否则需关闭 SIP（不推荐）；读他人进程内存需 root。附三个测试程序：simple、计数器（演示 next scan）、CTF（运行时数学运算拼出 flag，可扫描只读区字符串）。

## Building a Terminal-Based Cheat Engine in Rust

![Cheat Engine RS Logo](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3815356b2485c1f0.png)

[![GitHub Repository](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/123fc375cfd29653.svg)](https://github.com/var77/cheat-engine-rs)

> **For the impatient:** Jump straight to the [Demo](#demo-time) to see it in action!

## Why?

Remember [Cheat Engine](https://www.cheatengine.org/)? I used to play with it as a kid to "hack" games - changing scores, health points, and other in-game values. Back then, I had no idea how it worked. I just followed YouTube tutorials and felt like a genius when numbers changed on screen.

Years later, with more knowledge about operating systems, memory, and how computers work, I got curious. How did Cheat Engine actually work? And could I build something similar that runs in the terminal? (I'm a terminal guy - I really don't like using the mouse.)

Plus, I thought it would be a great learning project to understand system-level programming better.

## Choosing the Right Tools

I had two options: C or Rust. I went with Rust because I'm too lazy to hunt down memory bugs and segfaults. Let Rust's compiler do that for me!

I knew the project would have two main parts:

1.  **Core Scan API** - the engine that reads and writes process memory
2.  **TUI (Terminal UI)** - the interface to interact with the scanner

## Building the Core

The core needed to do three things:

-   Get memory regions of a running process
-   Read from any memory address in that process
-   Write to memory addresses (if they're writable)

### Getting Memory Regions

I couldn't find a good cross-platform crate for this, so I had to implement it twice:

-   **Linux**: Read from `/proc/[pid]/maps` to get memory regions
-   **macOS**: Use the `mach_vm_region` kernel function from the `mach-sys` crate

Here's how the Linux implementation works:

```rust
// Open /proc/[pid]/maps which contains all memory regions
let path = PathBuf::from(format!("/proc/{}/maps", pid));
let file = File::open(&path)?;
let reader = io::BufReader::new(file);

for line in reader.lines() {
    // Parse lines like: "00400000-00452000 r-xp ..."
    let mut parts = line.split_whitespace();
    let range = parts.next()?;     // "00400000-00452000"
    let perms = parts.next()?;     // "r-xp"

    // Check if region is readable/writable
    if perms.contains('w') {
        regions.push(MemoryRegion { start, end, perms });
    }
}
```

Most would only care about writable memory (so they can edit values), but I also wanted to scan read-only regions. This is useful for CTF challenges where a flag might be stored as a static string somewhere in memory.

### Reading and Writing Memory

For the actual memory operations, I used the `process-memory` crate. It provides cross-platform implementations for reading and writing to another process's memory. Nice and simple.

```rust
// Read 4 bytes from address 0x1000
let handle = pid.try_into_process_handle()?;
let mut buffer = vec![0u8; 4];
handle.copy_address(0x1000, &mut buffer)?;
let value = u32::from_le_bytes(buffer.try_into()?);

// Write a new value back
handle.put_address(0x1000, &12345_u32.to_le_bytes())?;
```

### The Scanning Algorithm

Here's where things got interesting. The scan API works like this:

1.  First scan: search for a specific value in memory
2.  Change the value in the target program
3.  Next scan: filter results by comparing old vs new values
4.  Repeat until you find the exact address

My first version was painfully slow. I was reading memory byte by byte. For a 4-byte integer (i32), I'd read every 4 bytes in every memory region. Scanning a process took forever.

#### Optimization Round 1: Block Reading

Instead of reading byte by byte, I started reading memory in large blocks (like 64KB at a time), then searching through those blocks locally. Much faster!

#### Optimization Round 2: Using memchr

I switched from simple `==` comparisons to using the `memchr` crate's `memmem` function for pattern matching. This gave a huge performance boost.

#### Optimization Round 3: Parallel Scanning

Then I used `rayon` to parallelize the scanning. Instead of checking memory regions one by one, I processed them in parallel across multiple CPU cores.

Here's the key part of the scanning code:

```rust
const BLOCK_SIZE: usize = 0x10000; // 64KB blocks

// Generate overlapping block addresses
let mut addresses = Vec::new();
let mut current = start;
while current < end {
    addresses.push(current);
    current += BLOCK_SIZE - (value_size - 1); // Overlap!
}

// Parallel scan with rayon
let results: Vec<Vec<ScanResult>> = addresses
    .par_iter()  // Rayon magic here!
    .filter_map(|&addr| {
        let buffer = read_memory_address(pid, addr, BLOCK_SIZE).ok()?;

        // Use memmem to find all matches in this block
        let matches: Vec<_> = memmem::find_iter(&buffer, &target_value)
            .map(|offset| ScanResult::new(addr + offset, ...))
            .collect();

        Some(matches)
    })
    .collect();
```

#### Optimization Results

About 30x faster for read+write scans!

#### A Tricky Bug

When scanning in blocks, I hit an interesting problem. Imagine you're looking for the bytes `[AA BB CC DD]`:

```javascript
Block 1: [... AA] (ends at 0xFFFF)
Block 2: [BB CC DD ...] (starts at 0x10000)
```

If you read these blocks separately, you'll miss the value! It spans the boundary.

**Solution**: Make blocks overlap. Instead of incrementing by `block_size`, increment by `block_size - (value_size - 1)`. So block 2 would start at `0xFFFD` and catch the complete value.

### A macOS Gotcha

On macOS, this only works for apps outside the App Store. Otherwise, you need to disable System Integrity Protection (SIP), which is not recommended for daily use.

## Building the TUI

This was my first time building a terminal UI app. After some research, I picked `ratatui` - it's awesome for making TUIs in Rust.

I wanted the experience to feel natural for terminal users, so I added:

-   Vim-like navigation: `j` / `k` for up/down, `G` / `gg` for jumping to bottom/top
-   Tab/Shift+Tab to switch between widgets
-   Two modes: "Normal" and "Insert" (inspired by Vim)

### The First Mess

My first version was terrible. Everything was inside one huge `app.rs` file - over 1000 lines of spaghetti code. Finding bugs was a nightmare.

### The Refactor

I refactored it using claude code to the Command pattern. Now the code is much cleaner:

-   Each action is a command
-   Key bindings are visible in the UI
-   You can understand what's happening just by looking at the code

I also added a message box to show feedback and errors. One common error is trying to run without root privileges (you need root to read other processes' memory).

The UI rendering is isolated in `ui.rs`, which just draws widgets based on the current app state.

## Testing It Out

I created three test programs to make sure everything worked:

### 1\. Simple Program

A basic target for tests. It has a variable you can scan for and modify.

### 2\. Simple Counter

Demonstrates the next-scan feature and watchlist. Here's the code:

```rust
pub fn main() {
    let mut counter: i32 = 3;

    println!("Counter address: {:p}, Value: {counter}", &counter);
    println!("Commands: i, d, p");

    let mut input = String::new();

    loop {
        std::io::stdin()
            .read_line(&mut input)
            .expect("Failed to read line");

        let cmd = input.trim().to_lowercase();
        let cmd_str = cmd.as_str();

        match cmd_str {
            "i" => counter += 1,
            "d" => counter -= 1,
            _ => {}
        }
        println!("{}", counter);
        input.clear();
    }
}
```

You run this program, scan for the initial value (3), then type `i` to increment it. Run a next scan to filter results, and you'll quickly find the counter's address!

### 3\. Simple CTF Task

This one demonstrates string/hex scanning and read-only memory scanning. It constructs a flag at runtime using math operations to hide it from simple string searches:

```rust
static STATIC_TEXT: &'static str = "FLAG{TEST_STATIC_STRING}";

pub fn main() {
    // Construct flag at runtime using obfuscated mathematical operations
    let encoded: Vec<(u8, u8, u8, u8)> = vec![
        (7, 5, 35, 0),  // F = 70 = 7*5 + 35
        (19, 2, 38, 0), // L = 76 = 19*2 + 38
        // ... more encoded bytes
    ];

    let flag: String = encoded
        .iter()
        .map(|(mul1, mul2, add, sub)| {
            // Decode each byte
            let val = mul1 * mul2 + add - sub;
            val as char
        })
        .collect();

    // ... rest of the program
}
```

## Demo Time

Here's what it looks like in action:

[![Basic Demo](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e51e3c0cde1b0d9e.gif)](https://asciinema.org/a/QwTnsAF9VzyFUBYLqTVLvAf9S)

And here's a CTF example where we search for a flag by prefix:

[![CTF Demo](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c5ac24537a7baaa7.gif)](https://asciinema.org/a/8AdcT2B2RMp29QwtRtmMXM6ra)

In the CTF demo, you can see how to:

-   Search for strings with prefix matching
-   Read larger memory regions
-   Toggle R+W mode to include read-only memory
-   Copy values to clipboard

## What I Learned

1.  **Memory scanning is harder than it looks** - You need to think about alignment, boundaries, and performance
2.  **Parallelization helps a lot** - Rayon made scanning 30x faster with minimal code changes
3.  **Terminal UIs are fun** - Ratatui makes it easy to build good-looking TUIs
4.  **Rust's safety is worth it** - No segfaults, no UAF bugs. Just good clean errors from the compiler
5.  **Cross-platform is tricky** - Different OSes have completely different APIs for process memory

## Try It Yourself

The source code is on GitHub: [cheat-engine-rs](https://github.com/var77/cheat-engine-rs)

To run it:

```bash
git clone https://github.com/var77/cheat-engine-rs.git
cd cheat-engine-rs
cargo build --release
sudo ./target/release/cheat-engine-rs
```

You need root because reading another process's memory requires root privileges.

Try it with the test programs:

```bash
# In one terminal
cargo run --example simple_counter

# In another terminal
sudo ./target/release/cheat-engine-rs
```

Then scan for the value `3`, increment the counter with `i`, and do a next scan to find it!

If you've ever been curious about how cheat tools work, or want to practice memory analysis for CTFs, give it a try. And if you build something cool with it, let me know!
