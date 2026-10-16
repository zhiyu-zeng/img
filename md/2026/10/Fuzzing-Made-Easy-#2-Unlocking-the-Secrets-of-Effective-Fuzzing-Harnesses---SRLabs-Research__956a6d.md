---
title: "Fuzzing Made Easy #2: Unlocking the Secrets of Effective Fuzzing Harnesses - SRLabs Research"
source: https://srlabs.de/blog/unlocking-secrets-effective-fuzzing-harness
source_host: srlabs.de
clip_date: 2026-10-16T10:30:46+08:00
trace_id: 9e97fff8-973a-439d-b8ae-74e37f484b83
content_hash: 7db679ddd274dec966241a7197c965b2b238369a7d8c657758a8637a17f36461
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: SRLabs·模糊测试/漏洞审计
ai_summary: 有效 fuzzing harness 需限定覆盖范围、避免输入复用/状态/I/O，并用长度检查、FuzzedDataProvider、指针与不变量校验提升稳定性与速度。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fb75244-d011-81ff-aed3-fc217138fd7f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 有效 fuzzing harness 需限定覆盖范围、避免输入复用/状态/I/O，并用长度检查、FuzzedDataProvider、指针与不变量校验提升稳定性与速度。
> 
> - **范围：** 太窄漏系统上下文，太宽输入空间大；按函数组或单一文件格式拆分，一个 harness 聚焦一个逻辑目标。
> - **输入禁忌：** 同一字节不要参与多个决策，也不要把同一输入解释成多种格式；否则路径耦合、语料混杂、覆盖率反馈变噪。
> - **无状态：** 每轮 LLVMFuzzerTestOneInput 要像新进程；AFL++/libafl 的 stability 应 100%，随机数固定种子、重置静态缓存。
> - **性能：** 移除 printf、文件读写、sleep 等 I/O；用 LLVMFuzzerInitialize 做一次性初始化，用 FUZZING_BUILD_MODE_UNSAFE_FOR_PRODUCTION 跳过 HMAC/CRC 等重检查并打桩非目标交互。
> - **推荐做法：** 开头检查最小长度（如 len<32 return 0），用 FuzzedDataProvider 结构化消费输入，校验返回指针与不变量，失败则 abort()，每轮释放资源并清理状态。

![](https://srlabs.de/img/assets/authors/srl_headshot_marc_heuse-320.c5b3b05101.avif)

### Key takeaways

-   **Harness scope matters:** Set your fuzzing harness scope to cover enough code to find issues. Avoid making it too broad.
-   **Avoid pitfalls:** Don’t reuse parts of the input or reinterpret it, avoid maintaining state between fuzz iterations, and remove unnecessary I/O or debug operations in the harness.
-   **Embrace best practices:** Perform early input validation, use tools like FuzzedDataProvider for structured input consumption, validate outputs, free or reset any state after each run, and keep the harness stateless and efficient.
-   **Optimize outside the harness:** Disable or shortcut expensive operations during fuzzing builds, stub out external interactions that aren’t the target, and ensure the target code resets global state for fuzzing stability.
-   **Use a solid template:** Follow a proven harness structure to write reliable, fast harnesses that uncover bugs effectively.

## Introduction

Fuzzing is an effective technique for finding bugs and vulnerabilities, but it’s only as effective as your fuzzing harness. Harnessing is essential to a successful campaign. The fuzzing harness connects the fuzzer to the software under test. If it’s poorly written, even the best will struggle to find anything interesting.

In this article of our Fuzzing Made Easy series, we explore the secrets of good harnessing for fuzzing. We cover what makes a harness effective, common mistakes that can undermine your efforts, and best practices to maximize coverage and stability. You need to know how to write one that lets your fuzzer shine, whether you’re an experienced guru or an intermediate enthusiast.

> All examples are for C/C++, but most tips apply to other languages like GO, Python, or Rust. Let’s see how a well-crafted harness can enhance your fuzzing campaigns.

## What coverage should a harness obtain?

When writing a fuzzing harness, you aim for full coverage of critical areas, not necessarily full coverage of the code base.

### Narrow vs. broad harness scope

If your harness is too narrow, it only drives a small part of the code. This isn’t necessarily bad. For simple standalone components like an XML parser or base64 decoder, a narrow focus is fine and helps quickly identify bugs in isolated functionality. The fuzzer spends all its energy exploring the small specified area. This means fast and thorough coverage for that specific component. On the downside, you might miss issues in the broader system context because you’re not fuzzing those parts.

A harness can be too broad, trying to cover a huge portion of the program or a very complex API all at once. In this case, the fuzzer may take months to achieve even moderate coverage because the input space and code paths are so large. A broad harness can overwhelm the fuzzer with possibilities. It may find some bugs eventually, but likely very slowly, potentially wasting CPU cycles without reaching the deep logic. Sometimes a broad harness is unavoidable for very complex targets or full programs, but whenever possible, it’s better to break the target down into more manageable pieces or focus the harness on a specific subsystem. This way, you direct the fuzzer to the interesting parts more directly. Deciding *which* pieces to break out first, and in what order, is its own analysis on a large codebase — we cover how to rank and scope it in [How to decide what to fuzz in a complex target](https://srlabs.de/blog/decide-what-to-fuzz).

Write a harness that covers the code you care about, but not so broad that the fuzzer gets lost. Define the arena for the fuzzer: not a tiny sandbox, but not the entire universe. If you’re fuzzing a library, target one function or a group of related functions per harness. If you’re fuzzing a file parser, fuzz one format at a time, rather than multiple into one harness. By deciding the coverage scope, you set yourself up for an effective run.

Now that we know how to get the coverage “just right,” let’s discuss common mistakes that can prevent a harness from achieving good coverage or fast results. Steering clear of these pitfalls will save you frustration.

## The DON’Ts

It is crucial to know what not to do in a fuzzing harness. Certain patterns can hurt the fuzzer’s effectiveness or mislead your results. Below we discuss the key “DON’Ts” of fuzz harness writing and why to avoid them.

### 1\. Don’t reuse data

A common anti-pattern is reusing input data for multiple purposes in one execution. This often happens when a developer uses the same bytes of the fuzz input in two or more ways within the harness. For example:

```cpp
int LLVMFuzzerTestOneInput(char *data, size_t len) {
    switch (data) {  // data is used to make a decision
        // ... some cases based on data ...
    }
    ...
    someFunction(data, len);  // <= data is reused!
    ...
}
```

In the snippet above, the first byte `data[0]` is used in a switch to decide what to do. Then the entire `data` (including that byte) is passed to `someFunction`. This means the value of `data[0]` is influencing the program’s behavior in two ways: once in the switch and again inside `someFunction`.

**Why is this bad?** It couples two execution parts together, making the fuzzer’s job harder. The fuzzer might discover that setting `data[0]` to a certain value unlocks a new path in the switch, but that value might not be optimal for `someFunction`. If it also reads `data[0]` (or behaves differently depending on it), the fuzzer is stuck trying to satisfy two conditions with one byte. It’s better to use distinct input parts for distinct purposes.

Avoid using one input byte (or bit) to make two separate decisions or feed two separate logic pieces. This data reuse can unintentionally constrain the fuzzer’s ability to explore different condition combinations.

**How to avoid data reuse:** If you require multiple parameters or decision points, consider splitting the input. For example, use `data[0]` for the switch decision and `data[1:]` for `someFunction`. Better yet, use structured consumption (FuzzedDataProvider later) to carve the input into independent pieces. The goal is that each byte or chunk of fuzz input influences the program in only one way. This maximizes efficiency and coverage because the fuzzer can independently tune each input piece to reach different code parts.

### 2\. Don’t reinterpret data

This is related to the above, but with a slightly different meaning. Don’t reinterpret the fuzz input in conflicting or overly complex ways. An example is when a harness tries to handle multiple formats or code paths within one function by interpreting the input differently based on some tag or condition:

```cpp
int LLVMFuzzerTestOneInput(char *data, size_t len) {
    if (len < 2) return 0;
    switch (data) {
        case 0: functionA(data + 1, len - 1);
                break;
        case 1: functionB(data + 1, len - 1);
                break;
        default: functionC(data + 1, len - 1);
    }
    return 0;
}
```

The harness uses the first byte `data[0]` as a selector to decide which function to call with the rest of the data. The meaning of the bytes from `data[1]` onwards depends on whether `data[0]` is 0, 1, or something else. This approach allows for testing multiple functions with a single fuzzer, but it has drawbacks. Each of `functionA`, `functionB`, and `functionC` might expect the input structured differently. When `data[0]` is 0, we treat `data+1` as format A; when it’s 1, we treat it as format B, and so on. The fuzzer has to learn three different input formats and explore three different code paths, all mixed together in one byte stream.

**Why avoid this?** It reduces fuzzing efficiency because the fuzzer keeps flipping that first byte trying different functions. The input corpus becomes a jumble of different “types” that aren’t directly comparable. Coverage feedback gets noisy. For example, an input with `data[0]==0` might not help progress for `data[0]==1`, and vice versa. You’re running multiple fuzz targets in one, which is less effective than fuzzing them separately.

**Better approach:** If possible, split these into separate fuzz targets (one harness for `functionA`, one for `functionB`, etc.) so each fuzzer can focus on one code path. If they must be combined (say the target internally branches this way and you can’t separate it), clearly delineate the input format. Treat the first byte as a tag and ensure the rest of the data is structured for each case. Don’t overload a single input to represent multiple things. Keep one harness per logical target to ensure the fuzzing input is interpreted consistently each run.

### 3\. Don’t have state in your harness

A well-behaved fuzz harness should be stateless between runs. Avoid keeping any global or static state that isn’t reset for each new input. Each execution of `LLVMFuzzerTestOneInput` should start with a clean slate, as if it’s a brand new program run. If your harness (or the code it calls) holds onto state from a previous input, you encounter issues.

What do we mean by state? You have a static counter that isn’t reset, or a data structure that accumulates data across calls. Your harness opens a file or network connection on the first call and reuses it. These things will persist and can make the outcome of a test input depend on previous inputs. That’s problematic for fuzzing.

**Why is state bad here?** Fuzzers like AFL++, libafl, and libFuzzer assume each target run with an input is independent and repeatable. If it sometimes crashes or passes because of leftover state, the fuzzer gets confused. You see this in AFL++’s UI with a “stability” metric. Ideally, it should be 100%, meaning the same input always follows the same path and yields the same result. If your harness has hidden state, stability can drop, indicating nondeterministic behavior. This can cause the fuzzer to miss real bugs (if a crash isn’t reproducible due to state, it might discard it). This wastes time chasing non-bugs or inconsistent results, and complicates debugging because you can’t rerun an input and expect the same outcome.

**How to keep it stateless:** Ensure any initialization is done fresh for each input or done once globally in a read-only way. To preserve something (like an expensive setup), use `LLVMFuzzerInitialize` (which runs once at the start) for constant (read-only) setups. Reset anything that changes during execution at the end of `LLVMFuzzerTestOneInput`. For instance, free memory or destroy objects before returning. If the target library has an internal state (like a static cache), reset or reinitialize that on each run (or modify the target code to add a reset function for fuzzing). The goal is to make each fuzz iteration independent as a new process launch. This will keep the campaign stable and the results reliable.

### 4\. Don’t do debug or I/O in your harness

When writing a harness, resist the temptation to add `printf` statements, log to files, or perform other I/O operations for debugging or tracking. Avoid them for the fuzzing build! Any debug printing, file writing/reading, or heavy I/O in `LLVMFuzzerTestOneInput` slows down your fuzzing, especially with many instances. It makes it sluggish.

Fuzzers thrive on speed, executing thousands or millions of inputs per second. When calling `printf` or doing file I/O, a system call is invoked that traps into the kernel. Kernel operations (like writing to a console or file) are much slower than in-memory operations. If your harness prints something for each input or reads/writes files unnecessarily, you introduce a major bottleneck. Kernel time is a limited resource and becomes a shared bottleneck with parallel fuzzing instances. Excessive I/O can slow down fuzzing.

**Advice:** When compiling your fuzzing harness, remove all debug logs, `fprintf`, `printf`, file writes, and so on. Keep them during initial development to ensure the harness works, but remove or disable them in the actual fuzz campaign build. Avoid calling `sleep` or other delays (remove those for fuzzing!). If the code you’re fuzzing uses files (e.g., reads from disk), refactor it to use data from memory instead to avoid filesystem I/O at runtime. The faster and leaner your harness’s loop, the more test cases per second the fuzzer can execute. And the more opportunities to find that needle-in-a-haystack bug.

### What Not to Do

To summarize the don’ts, don’t reuse input bytes for multiple logic decisions, don’t make one input pretend to be many formats, don’t carry over state between runs, and don’t put slow operations in the harness. Now, let’s flip to the dos, or things you should do to write an effective harness.

## The DOs

Now that we’ve covered what to avoid, let’s focus on the best practices for fuzz harnesses. These techniques and patterns will make your harness effective, efficient, and capable of uncovering deep bugs. Adopting these habits enhances your fuzzing outcomes.

### 1\. First, perform a minimum required input length check

One of the simplest yet most important habits is to check the input size at the beginning of your harness. If your target function expects a minimum length or certain fields, enforce that upfront:

```cpp
int LLVMFuzzerTestOneInput(char *data, size_t len) {
    if (len < 32) return 0;  // require at least 32 bytes of input data
    ...
    return 0;
}
```

In the example above, we return immediately if the input length is less than 32 bytes (the harness needs at least 32 for all necessary fields for the target). This has two advantages:

**Efficiency:** It prevents the fuzzer from wasting time on insignificant short inputs. Without this check, the fuzzer would feed many tiny inputs resulting in early exits or no-ops in your code. By cutting those off early, you keep the fuzzer focused on meaningful inputs. You define a minimum size that it will quickly learn (libFuzzer will notice anything below 32 bytes doesn’t produce new coverage and will stop with very short inputs).

**Stability and correctness:** If your code assumes a certain length and then operates (like reading `data[0]`, `data[1]`, etc.), you could get out-of-bounds reads if the input is shorter. The length check guards against that and any associated sanitizer errors. It also simplifies the harness logic: you know after the check that needed bytes are present, avoiding many `if` conditions deeper in the code.

The key is to determine the appropriate “minimum length.” It can be a few bytes or a specific number of fields. If your target function has multiple required pieces, calculate the smallest valid input and use that. Include the check before processing the data. This way, every input that goes beyond that point in your harness has the required basics.

### 2\. Do intelligent data consumption with FuzzedDataProvider

When writing a harness, you need to split the fuzz input into several variables or pieces (especially if the target function takes multiple parameters or a structured input). A useful tool for this is `FuzzedDataProvider`, introduced in LLVM 11. It is a handy C++ header that allows you to consume bytes from the fuzz input in a structured way, converting them into integers, floats, strings, etc., without reusing the same bytes.

Using `FuzzedDataProvider` encourages you to pull explicit data chunks for each purpose. This helps avoid the data reuse problem because once you consume a part of the input for one parameter, it’s gone from the provider. You can’t accidentally use it again. It simplifies writing harness code since you don’t have to manually check lengths or do bit fiddling to assemble integers. Here’s an example:

```cpp
extern "C" int LLVMFuzzerTestOneInput(char* data, size_t size) {
  if (size < 116) return 0;
  FuzzedDataProvider dataProvider(data, size);
  size_t ignoreDepth = dataProvider.ConsumeIntegralInRange<size_t>(0, 100);
  int logPriority = dataProvider.ConsumeIntegral<int>();
  pid_t tid = dataProvider.ConsumeIntegral<pid_t>();
  std::string tag = dataProvider.ConsumeRandomLengthString(100);
  char *opt = dataProvider.ConsumeRemainingBytes<char>();
  fuzzed_target_api(ignoreDepth, logPriority, tid, tag, opt);
  return 0;
}
```

In this snippet, we ensure the input is at least 116 bytes (length check first!). Then we create a `FuzzedDataProvider` with the data. We proceed to consume various types:

-   `ignoreDepth` gets a `size_t` between 0 and 100
-   `logPriority` gets an `int` (4 bytes)
-   `tid` gets a `pid_t` (often an int)
-   `tag` gets a random-length string up to 100 characters
-   `opt` gets the remaining bytes as a raw buffer

Next, we call the target function `fuzzed_target_api` with these separated parameters.

A few things to mention:

-   **No data reuse.** Each call to `Consume` takes a slice of the input and moves an internal pointer. By the time we call `fuzzed_target_api`, the entire input has been parceled out into different variables with no overlap.
-   **Clarity.** Anyone reading this harness can see what the input represents: an `ignoreDepth` value, a `logPriority`, a `tid`, a `tag` string, and options bytes. It’s self-documenting, which is nice.
-   **Range constraints.** We specified a range for `ignoreDepth` (0 to 100) to guide the fuzzer to a realistic or interesting range. This prevents it from wasting time on values outside that range if the target expects 0–100.

Use a C++ compiler to compile your harness file as C++ (e.g., name it `.cc` and compile with `clang++`). If you’re using AFL++, use `afl-clang-fast++` to compile this harness. This is important because compiling it in C mode will fail.

One important mistake to avoid in `FuzzedDataProvider` is running into the “reinterpret data” pitfall. If you use `ConsumeRandomLength*` — or `ConsumeBytes*` with a random length — this can happen. Use these functions only in the final steps of processing the fuzzing input!

If you’re on an older LLVM version without `FuzzedDataProvider`, a simpler alternative is using `std::istringstream` or manually reading from the data pointer. If you can, it’s worth using the provider. Many fuzzers (like AFL++, libafl, and libFuzzer) support it, and you can copy the header from LLVM’s repository. It results in cleaner and safer harness code.

### 3\. Do check pointers in returned data structures

Fuzzing isn’t just about finding immediate crashes. Sometimes the fuzzed function returns a data structure, and the bug is in that data (like an invalid pointer or corrupt data). A good harness can proactively verify the target’s return validity. This way, you can catch problems that do not segfault right away but indicate incorrect behavior.

Consider a target function that parses input and returns a struct `foobar*`. Inside this struct is a pointer `foo` that points to a valid buffer or structure. A bug might set `result->foo` to an arbitrary address (derived from input data) instead of a real allocated buffer. The function might not crash — it just hands you a bad pointer. If your harness gets the result and frees it, you might not notice the bug.

```cpp
int LLVMFuzzerTestOneInput(char *data, size_t len) {
    struct foobar *result = functionA(data, len);
    // invalid data pointers like result->foo = 0x4141414141414141 would go unnoticed
    return 0;
}
```

In the above (initial version), if `result->foo` is junk, the harness ends without detecting it.

We can add a check in the harness to address this:

```cpp
static int dummy_fd;

int LLVMFuzzerInitialize(int argc, char **argv) {
  // Open /dev/urandom once for reuse in pointer checks. We cannot use /dev/null!
  dummy_fd = open("/dev/urandom", O_WRONLY);
  if (dummy_fd < 0) dummy_fd = 1;  // Fallback to stdout (fd 1) if /dev/urandom fails
  return 0;
}

static int is_valid_mem(void *ptr) {
  // Returns 1 if memory at ptr is accessible (at least 4 bytes), 0 if not
  long r = syscall(SYS_write, dummy_fd, ptr, 4);
  if (r == 4) return 1;
  return 0;
}

int LLVMFuzzerTestOneInput(char *data, size_t len) {
   struct foobar *result = functionA(data, len);
   if (!is_valid_mem(result->foo)) {
       // Trigger a crash to flag this input as a bug, since the pointer is invalid.
       abort();
   }
   foobar_free(result); // clean-up to prevent memory leaks
   return 0;
}
```

Let’s examine this:

1.  We use the one-time initialization function (`LLVMFuzzerInitialize`) that opens `/dev/null` for writing and stores the file descriptor in `dummy_fd`. This function runs once before any fuzzing inputs are processed. By doing this upfront, we avoid the overhead of opening the file on every single test execution (micro-optimizations like this add up in fuzzing). If opening `/dev/null` fails for some reason, we default `dummy_fd` to 1 (stdout) as a fallback.
2.  We have a helper `is_valid_mem(void *ptr)` that tries to write 4 bytes to the address `ptr` using a direct system call (`syscall(SYS_write, dummy_fd, ptr, 4)`). If the pointer `ptr` is valid and points to accessible memory, writing 4 bytes will succeed and return 4. If `ptr` is invalid (e.g., a wild pointer or not mapped), the write will fail and return an error (not equal to 4). We don’t want to modify anything important by writing, so we write to `/dev/null` (which just discards data) or stdout if needed; the content doesn’t matter because it’s just a validity probe.
3.  After calling `functionA` in the harness, we check `result->foo` with `is_valid_mem`. If it’s not valid memory, we call `abort()`. This crashes the program intentionally, which tells the fuzzer that it found a problematic input (one that makes the target produce an invalid pointer). From the fuzzer’s perspective, this is a crash. And indeed, it corresponds to a real bug, just one that we detected manually. It will save this input as a crashing test case, and you can then investigate why `functionA` returned a struct with `foo` pointing to la-la land.

This technique allows the harness to catch subtle memory pointer errors that do not immediately cause issues. It is useful for checking that pointers in returned structures are valid, or that output values meet criteria.

One caution: if the structure has a specific length and spans memory pages, check in chunks. The example checks 4 bytes, often enough to detect an unmapped page, but for a large buffer, check each page or the whole length. The general idea remains: validate what you can, and fail quickly if something is off. It turns your harness into an oracle that can detect nonsensical actions, not just crashes.

### 4\. Before any return, clean up state and memory

We touched on this when discussing avoiding state, but it’s important enough to be a “do” on its own. Always clean up and reset everything before returning from `LLVMFuzzerTestOneInput`. This means freeing any allocated memory, closing any opened sockets or files (ideally not per input, but if so, close them), and leaving things unchanged.

Why is this crucial? Memory leaks or unfreed allocations will accumulate over millions of iterations and can crash the harness (running out of memory) or trigger sanitizers (LeakSanitizer will flag leaks even if the program doesn’t crash). If you allocate an object or buffer for an input, free it by the end of that function. Tools like AddressSanitizer (ASAN) and LeakSanitizer (LSAN) will appreciate it, and it ensures each run starts fresh.

If your target code has global state, consider reinitializing or resetting it. For example, if the target is a parser with a static “initialized” flag or a cache, call a cleanup or reset function if available. Some libraries have functions like `foobar_reset()` or you may need to simulate reloading the library state. It requires creativity, but it’s worth it.

After `LLVMFuzzerTestOneInput` returns, the fuzzer might immediately call it again with a new input in the same process. You want that call to behave as if it’s running in a fresh program instance. Cleaning up memory and state achieves that illusion.

Another angle is that prompt cleanup can expose bugs. For instance, calling `free` on a target’s return could reveal a use-after-free if it kept an internal pointer. Resetting a state might show something wasn’t reset. These are important to catch. Don’t shy away from proper cleanup, for it’s beneficial for bug finding.

### 5\. Do invariant checks

You can embed logical invariant checks in your harness beyond memory validity. An invariant is a condition that should always hold true if the program is correct. These are self-checks for the program’s state after processing input. If an invariant is violated, it indicates a bug (even if it doesn’t crash). As with pointer checks, if you detect a broken invariant, `abort()` or signal a failure so the fuzzer knows this input caused a problem.

Imagine we’re fuzzing a simple car parking system API. You call `park_car()` with some data and it returns a status. An invariant is: if `park_car()` returns SUCCESS, then the car object’s state is `CAR_PARKED` and its speed is 0 (since a parked vehicle shouldn’t be moving). We can enforce this in the harness:

```cpp
int LLVMFuzzerTestOneInput(char *data, size_t len) {
    ...
    int ret = park_car(&car);
    if (ret == SUCCESS && (car.state != CAR_PARKED || car.speed != 0)) {
        // The car must be parked and stationary on success; something is wrong.
        abort();
    }
    freeCar(car); // Prevent memory leaks
    return 0;
}
```

After calling the target function, we check the car’s state. If the return code indicates success but the car isn’t parked or the speed is non-zero, we consider it a failure and abort. This turns a logic bug into a detectable failure in fuzzing. The fuzzer will treat it like a crash, saving the input that caused this inconsistent state.

You can devise invariants for numerous scenarios:

-   For a sorting function, check the output array is sorted if the function claims success
-   For a database transaction fuzzer, check that account balances sum correctly (no money creation or loss)
-   For a file format parser, check that an output structure is not corrupt (fields are consistent relative to each other)

These checks are like unit test assertions, but done inline in the fuzz harness. They increase the fuzzing power to find logical bugs, not just memory safety issues. Ensure the invariants are always true. If they can be false without a bug, you’ll get false positives. If you’re confident in a condition (“This should never happen unless there’s a bug.”), it’s a strong candidate for an invariant check.

Lastly, always follow up by cleaning up, as mentioned. In the car example, we call `freeCar(car)` to tidy up memory.

Now that we’ve covered the do’s and don’ts of harness code, let’s discuss outside practices that can enhance your fuzzing outcomes.

### 6\. Do move all heavy one-time initializations into LLVMFuzzerInitialize()

The function you want to fuzz requires initialization and setup prior to calling your target. If these can be reused or simply cloned on each fuzz, move this into the `LLVMFuzzerInitialize()` function. This will significantly improve your speed. The following example is an excerpt from an ntopng fuzzing harness:

```cpp
NetworkInterface *iface;
int LLVMFuzzerInitialize(int argc, char **argv) {
  iface = new NetworkInterface("custom");
  iface->allocateStructures();
  return 0;
}
int LLVMFuzzerTestOneInput(char *data, size_t len) {
    ...
    iface->dissectPacket(0, 0, DLT_NULL, true, NULL, hdr, pkt, &p, &srcHost, &dstHost, &flow);
    ...
}
```

In this example, the dummy network interface needs to be set up once, so the initialization is done in `LLVMFuzzerInitialize()` and the resulting object is reused in `LLVMFuzzerTestOneInput()`.

## Other best practices outside of the harness

Good fuzzing hygiene isn’t just about the harness function. The environment around it and how you compile or modify the target code matter too. Here are a few important tips beyond the harness logic.

### Disable or shortcut CPU-intensive checks in fuzzing mode

Many targets perform expensive computations like checksums, cryptographic hashes, compression, or lengthy validations. These are often not the core of what you’re fuzzing for bugs — they’re just there for data integrity in a real-world scenario. For example, an application might verify an HMAC or a CRC checksum before processing a file. For fuzzing, such operations are mostly a waste of time; the fuzzer would need to randomly guess a correct HMAC to get deeper, which is practically impossible.

Use fuzzing-specific conditionals to skip heavy checks. Modern setups define a macro that signals fuzzing builds. For example, AFL++, libafl, and libFuzzer define `FUZZING_BUILD_MODE_UNSAFE_FOR_PRODUCTION`. Use this in your code (or better, in the target’s code if you have source access) to disable or short-circuit CPU-intensive tasks during fuzzing. For instance:

```cpp
int validate_data(char *hmac) {
#ifdef FUZZING_BUILD_MODE_UNSAFE_FOR_PRODUCTION
  return 0;  // In fuzz mode, skip validation and assume it's acceptable
#endif
  // In normal mode, do the thorough validation
  if (check_hmac(hmac, expected_hmac) != 0)
     return -1;
  ...
}
```

If you compile the code in fuzzing mode, the `validate_data` function in the snippet above will instantly succeed (return 0) without doing anything. In a production build, that `#ifdef` is not defined, so it will perform the HMAC check. This way, your fuzzer doesn’t get stuck on cryptographic checks or lengthy computations. It can move directly to the interesting logic.

AFL++, libafl, libFuzzer, and other fuzzers automatically define the `FUZZING_BUILD_MODE_UNSAFE_FOR_PRODUCTION` macro when using their compilers. It indicates “Hey, we’re fuzzing here.” The name reminds that any code under that `#ifdef` shouldn’t be in production (because you’re bypassing real checks!). For fuzzing, it’s fine to pretend the checksum matches or reduce heavy loop iterations, etc., as long as it doesn’t break the logic you want to test. Disable only what you need. The goal is to avoid path roadblocks (like “if HMAC is wrong, exit”) and performance roadblocks (like spending a second computing SHA256 on every input).

With this special macro guarding fuzzer-specific enhancements, developers can safely put such code blocks into production source code without compromising security.

### Mock or stub out non-target interactions

Consider what you’re fuzzing and what you’re not. If the code uses IPC, network sockets, databases, hardware interfaces, or heavy library calls not relevant to your tests, it’s beneficial to mock them out or replace them with no-op stubs during fuzzing.

Suppose your target function sometimes makes a TCP request, reads from a device, or calls an encryption function. During fuzzing, these slow things down (waiting for network or doing heavy math) and enlarge the coverage map with unrelated code. The fuzzer might explore the internal code of the crypto library or the network stack, which isn’t your concern (and you may not have the source to instrument those properly, leading to blind spots).

**Solution:** If you control the build, compile with dummy implementations. Many projects use dependency injection or hooks to swap functionality. If not, use preprocessor or link-time tricks. Define a function with the same name as the one you want to stub to override the real one in the fuzz build. Make your replacement return success or a fixed value. For the network example, immediately return a fake response. For cryptography, assume it’s valid. For random number generators, fix the seed or remove randomness (to maintain determinism).

The principle is to remove anything that isn’t your target during fuzzing. The fuzzer’s energy is finite, so don’t let it waste it in irrelevant code. Narrowing the focus speeds up fuzzing and provides cleaner coverage metrics for the code that matters.

### Do not have state in your fuzzed target code

We emphasized keeping the harness stateless. However, the target code itself (the library or function you’re fuzzing) should not carry over state between runs. If it does, you need to manage that.

Sometimes libraries have hidden static state (caches, counters, singletons, etc.). If you notice weird behavior like the fuzzer’s stability metric dropping below 100%, it is due to the target’s internal state causing nondeterministic outcomes. AFL++ and libafl are the only fuzzers that will show a “stability” percentage — if it is not a solid 100%, something might be up.

It could be:

-   Using random number generation without a fixed seed makes the code behave variably each time on the same input
-   Static variables that accumulate info, where only the first call initializes and subsequent calls act differently
-   Not resetting internal memory between runs (like an uncleared buffer)

If you suspect this, identify the stateful behavior. The solution could be:

-   Re-initialize the library each time. If there’s an `init` function, call it at the start of `LLVMFuzzerTestOneInput` and a de-init at the end
-   Modify the library code under the fuzzing build to remove or reset static state. Wrap such code in `#ifdef FUZZING_BUILD_MODE_UNSAFE_FOR_PRODUCTION` to remove randomness or always reinitialize
-   Ensure random seeds are constant in fuzz mode by calling `srand(0)` at the start

If the AFL++ UI (or libafl’s text output) indicates instability, treat it as a clue to fix something for accurate fuzzing. Once you eliminate the source of nondeterminism, stability should reach 100%, meaning each input’s execution is repeatable and reliable. This ensures any crashes or findings are genuine and reproducible.

## Best practice harness template

We’ve covered many individual dos and don’ts. Here’s a simple harness template that summarizes these best practices. Use this as a starting point or checklist when writing your own:

```cpp
int LLVMFuzzerInitialize(int argc, char **argv) {
  // [Optional] One-time initialization goes here.
  // e.g., open files, set up constant global resources.
  // This runs once before fuzzing starts to prevent repetition on each input.
  return 0;
}
int LLVMFuzzerTestOneInput(char *data, size_t len) {
  if (len < XXX) return 0;  // 1. Minimum length check: replace XXX with required size.
  // 2. [Optional] Transform or interpret data into parameters.
  //    - Use FuzzedDataProvider or manual parsing to prevent data reuse.
  //    - Do not reinterpret the same bytes in incompatible ways.
  //    e.g., int param = data; string payload = std::string(data+1, len-1);
  // 3. [Optional] Set up the target state or environment.
  //    - If the target requires some initialization for each run, do it here.
  //    - Keep it minimal and avoid persistent state across runs.
  // 4. Call the target API/function with the prepared data.
  //    e.g., result = target_function(param, payload);
  // 5. [Optional] Verify outputs or post-conditions.
  //    - If target returns a struct or data, validate pointers or fields.
  //    - Perform invariant checks to ensure the target's state is consistent.
  //    - If something is wrong, abort() to indicate a crash.
  // 6. [Optional] Clean up.
  //    - Free allocated memory and reset modified global state.
  //    - Undo anything before the next run.
  // Note: During fuzzing, avoid debug prints or file I/O in this function!
  // If an input should be discarded (not added to corpus), return -1.
  return 0;
}
```

A few notes on this template:

**`LLVMFuzzerInitialize`** is where you do one-time setup. If you have expensive initialization (like loading a large dictionary, opening a file, or configuring environment) that doesn’t depend on the fuzz input, not every harness needs this, but if you need it, do it here. Do it once, and the fuzzer will reuse it for all tests, making fuzzing more efficient.

Comments 1-6 correspond to a logical flow:

1.  **Early exit on insufficient data** We talked about this; it saves time.
2.  **Data transformation/setup** Convert raw input bytes into the target’s required form. Use this stage to enforce no data reuse and a clear structure.
3.  **Target environment setup** Prepare the target (initialize objects, etc.) for this run. Keep it minimal.
4.  **Call the target** The harness core: invoke the function or API to fuzz.
5.  **Verify results** Check pointers, invariants, or other sanity conditions after the call. `Abort` if any check fails to indicate a bug.
6.  **Cleanup** Free memory, reset states, close handles, etc. to avoid leaks and carry-over effects.

The note about returning -1: Normally, fuzz harnesses return 0. However, in AFL++ and libfuzzer, returning -1 tells the engine not to save that input to the corpus. If you have inputs that execute fine but aren’t interesting for the corpus, return -1 to direct the fuzzer not to keep it. This is an advanced tip. It’s not commonly needed, but it’s mentioned for completeness since some harness writers use it to filter out uninteresting inputs.

Stick to this structure to avoid pitfalls. It serves as a checklist: if your harness does something outside these steps (like reading a file, using the same byte twice, or not freeing something), double-check if that’s necessary or if it could be a problem.

Before the conclusions, we have one final note. Whenever you modify your harness to consume the bytes differently — for example, an API change introduces more parameters — the corpus for the original harness becomes obsolete. To avoid that, craft a converter that transforms the original corpus into the new format. We’ll discuss this when we talk about seeding in a future article.

## Conclusion

Writing a great fuzzing harness is part art and science. In this post, we’ve learned that effective harnessing is more than just wiring a fuzzer to a function. It involves carefully choosing the fuzzing scope, avoiding patterns that hinder the fuzzer (like reusing input data or carrying state between runs), and implementing best practices for faster and more thorough fuzzing (like structured input consumption, pointer checks, and invariants).

By following these dos and don’ts, you create efficient, deterministic, and targeted harnesses that let the fuzzer work without hindrances. A good one maximizes code coverage for important parts and helps catch obvious crashes and subtle bugs by validating output and state. It ensures high-speed fuzzing by eliminating external slowdowns and keeping each test case self-contained.

Fuzzing is iterative. Start with a solid harness, observe the fuzzer’s behavior (coverage, stability, performance), and refine as needed. Sometimes, you need to narrow the focus or stub out something — that’s expected. The tips here should guide you.

In future articles, we’ll explore unusual fuzzing harnesses (e.g., differential fuzzing, correctness fuzzing) and how to tackle large, complex applications by breaking them into fuzzable pieces. Harnessing a huge target can be challenging, but with the principles you learned today, you’ll be prepared.

Happy fuzzing, and may your harnesses be strong and your bug catches plentiful. 😊

*Special thanks to Addison Crump from the AFLplusplus team for reviewing this article!*

* * *

### What We’ve Covered and What’s Ahead

Missed an article? Here’s the list:

✅ #0: [Fuzzing Made Easy: Outline](https://srlabs.de/blog/fuzzing-made-easy-outline)

✅ #1: [How to write a harness](https://srlabs.de/blog/guide-to-writing-fuzzing-harness)

✅ #2: [Unlocking the secrets of effective fuzzing harnesses](https://srlabs.de/blog/unlocking-secrets-effective-fuzzing-harness)

✅ #3: [GoLibAFL: Fuzzing Go binaries using LibAFL](https://srlabs.de/blog/golibafl---fuzzing-go-binaries-using-libafl)

#4: How to write harnesses for Rust and Python and fuzz them

✅ #5: [How to decide what to fuzz in a complex target](https://srlabs.de/blog/decide-what-to-fuzz)

#6: The different types of fuzzing harnesses

#7: Effective Seeding

✅ #8: [How to perform coverage analysis](https://srlabs.de/blog/coverage-analysis)

#9: Correctly minimizing corpora

#10: How to run fuzzing campaigns

#11: Continuous fuzzing campaigns

#### Special Fuzzing Targets

✅ #1: [Fuzzing CosmWasm Smart Contracts](https://srlabs.de/blog/cosmwasm)
