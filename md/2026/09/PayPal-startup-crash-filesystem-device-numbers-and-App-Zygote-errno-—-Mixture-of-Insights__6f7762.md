---
title: "PayPal startup crash: filesystem device numbers and App Zygote errno — Mixture of Insights"
source: https://mixtureofinsights.com/blog/06-paypal-crash-two-root-signals/
source_host: mixtureofinsights.com
clip_date: 2026-09-17T13:53:15+08:00
trace_id: 1ad4e80c-511a-4388-a5e4-0f0e42b55466
content_hash: ffe2a3c587ba4974f708e20a8decd31045f9f4ea2eddbf7d4e51b59c5042ee2a
status: synced
tags:
  - Android逆向
  - 内核
series: null
feed_source: Mixture of Insights
ai_summary: 修 Magisk 匿名设备号分配顺序，并在内核归一 App Zygote 的 SELinux errno 后，PayPal 10.12.0 的 Root 检测闪退才消失。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3de75244-d011-8140-b103-f30154e2dd8e
ioc:
  cves: []
  cwes: []
  hashes:
    - 03e6e48a5b4ed606dfdd48bc782a57f9c778938b
    - 5e96669f06077099aa41290cdb4c5e6fa0f59349
    - e8a58776f1d7bdf852072ad0baa6eceb9a1e4aac
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 修 Magisk 匿名设备号分配顺序，并在内核归一 App Zygote 的 SELinux errno 后，PayPal 10.12.0 的 Root 检测闪退才消失。
> 
> - **信号一：** libob98.so 偏移 `0x6e628` 的 native 函数直接 `newfstatat` 读 /dev、/dev/pts、/proc、/sys 的 `st_dev`（17/18/19/21）；Unicorn 离线 A/B/A 中只把 /sys 由 21 改成 20，解码结果就从 1 翻为 0。
> - **信号二：** App Zygote 向 `/proc/thread-self/attr/current` 写三个 SELinux 标签，未知标签返回 EINVAL(-22)，`u:r:magisk:s0` 返回 EPERM(-1)；判定逻辑只把 EPERM 计入命中列表。
> - **修复：** Magisk `first_stage` 提前创建临时 /dev、/dev/pts，使保留 tmpfs 的设备号后移；内核在 `abort_change` 后加 20 行，把匹配 `u:r:app_zygote:` 的 EPERM/EACCES 归一为 EINVAL，不新增 allow 规则或 permissive。
> - **验证边界：** 单改任一仍被拒，两处合并后才通过指纹认证；接受测试只覆盖进入并停留在页面，未验证支付、转账与后端风控。
> - **踩坑：** ART uprobe 探针曾导致黑屏与 ADB 断开且无日志，改用限定 UID/路径的 eBPF 采集，并让复现 APK 与看门狗独立于主机退出。

[Android system debugging](https://mixtureofinsights.com/series/android-hardening/)

For PayPal 10.12.0 on the recorded Xiaomi 13 build, the investigation isolated a filesystem device-number signal and an App Zygote errno distinction. The evidence proceeds from captured inputs to an offline one-field test, independent process-context reproduction and combined device acceptance. Acceptance covered authenticated entry and a stable page; payments, transfers and backend trust were not tested.

Changing modules, scopes, or versions could alter the result without explaining it. The investigation narrowed the question to what this PayPal build reads and which return value makes it reject the environment.

The investigation identified two independent local signals. One came from Magisk’s early-boot allocation of anonymous filesystem device numbers. The other came from different SELinux errors returned to an App Zygote attempting context transitions. After combining two changes to existing components, PayPal reached its system fingerprint prompt. The phone’s operator completed authentication and confirmed that the app opened and remained usable on the resulting page. No additional persistent module, PayPal downgrade, or app-data reset was needed.

The investigation also encountered a black screen during an ART probe experiment and a false report of missing kernel symbols. Both affected how the later tests were run.

## Separate the current failure from its historical trigger

The test environment was a Xiaomi 13, codename fuxi, running Android 16 / SDK 36, kernel `5.15.207-g03e6e48a5b4e`, Magisk 30.7, ZygiskNext 1.5.0, and PayPal 10.12.0. Vector, NoHello, and an existing iFAST compatibility component were also present. The recollection that Magisk and application-list hiding had originally been sufficient does not mean those were the only components in the current baseline.

After removing this task’s diagnostic APKs, a cold start still produced this exception structure:

```text
RootDetectionSecurityException: Security policy violation: s=root
```

That directed the investigation toward the app’s Root-detection decision. It did not identify the individual check, and it did not establish a remedy for every device with the same exception.

There were no equivalent low-level captures from the period when PayPal worked. Consequently, an app, Magisk, or kernel update could not be named as the historical trigger just from its date. This investigation establishes a causal explanation for the **current** failure. The event that first exposed it remains undetermined.

## Turn the aggregate decision into an observable check

Runtime analysis located a call from `o.APMf` to the native method `o.endFlow.a([[Ljava/lang/String;)J`. In this exact app build, the function was at offset `0x6e628` in `libob98.so`. These obfuscated names and offsets are sample-specific navigation aids.

The caller transformed the return through integer arithmetic; the raw value was not a Boolean. Decoding it as the actual caller did produced `1`, and the branch used `0x11c` to update a marker. A `-1` observed elsewhere was a control-flow state, illustrating why neither negative values nor suspicious strings are sufficient evidence of a positive detection.

The function issued AArch64 `newfstatat` directly, examining four paths alongside kernel-release and SDK inputs:

| Path | Observed `st_dev` |
| --- | ---: |
| `/dev` | 17  |
| `/dev/pts` | 18  |
| `/proc` | 19  |
| `/sys` | 21  |

These are filesystem device identifiers, distinct from disk partition numbers and `mountinfo` mount IDs. The gap was interesting: PID 1’s mount information associated `0:20` with a retained tmpfs mounted at `/debug_ramdisk`, with source `magisk`.

Removing an entry from an application’s visible mount tree does not renumber other existing filesystems. Hiding a name and changing the allocation history are different operations. This explains why editing the hidden-app list did not directly address the observed input.

## Establish causality with a one-field offline A/B/A

A suspicious number was not enough reason to replace a boot image. First, I executed the captured native function in Unicorn on the host, using the four complete `stat` buffers collected from the device. SDK, kernel release, and all other fields remained fixed. Only `/sys` ’s `st_dev` changed:

| Experiment | Input change | Decoded result |
| --- | --- | ---: |
| A   | Original `/sys st_dev = 21` | 1   |
| B   | Only `/sys st_dev = 20` | 0   |
| A restored | `/sys st_dev = 21` again | 1   |

Within that function and captured input set, the field was sufficient to flip the check.

This was an offline A/B/A: JNI object handling, some libc operations, and parts of the environment used explicit substitutes, while unknown calls stopped execution. It was not a whole-device A/B/A and did not establish that PayPal had recovered.

## Change the boot sequence that creates the first signal

The evidence pointed to Magisk’s first-stage startup. I followed the exact version’s [`first_stage` and `prepare_data` implementation](https://github.com/topjohnwu/Magisk/tree/e8a58776f1d7bdf852072ad0baa6eceb9a1e4aac/native/src/init), then built a diagnostic magiskinit to record allocation and handoff on the actual device.

The early temporary environment and Android’s final environment must be kept distinct:

| Allocation | Original sequence | Modified sequence |
| --- | --- | --- |
| Early temporary `/proc`, `/sys` | 18, 19 | 18, 19 |
| Additional temporary `/dev`, `/dev/pts` | Absent | 20, 21; released before handoff |
| Retained Magisk tmpfs | 20  | 22  |
| Final Android `/dev`, `/dev/pts`, `/proc`, `/sys` | 17, 18, 19, 21 | 17, 18, 19, 20 |

The change creates temporary `/dev` and `/dev/pts` before `prepare_data()` allocates the retained tmpfs. It registers both mounts with the existing reverse-order cleanup, releasing them before the original Android init takes over and creates its filesystems.

The entry point becomes:

```rust
fn first_stage(&mut self) {
    info!("First Stage Init");
    self.prepare_first_stage_devices().log_ok();
    self.prepare_data();
    // Existing continuation.
}
```

The complete helper is in the [installed Magisk source patch](https://mixtureofinsights.com/notes/paypal-root-crash-2026-09-14/magisk-mount-order-clean.patch). It changes the interleaving of temporary and persistent allocations. It does not hard-code `20` or `21`, override `stat`, or match PayPal. The numbers in the table are observations from this build, not universal Android constants.

The candidate booted normally. Device numbers matched the prediction, and the actual `endFlow` result decoded from `1` to `0`. **PayPal still exited with its Root-detection exception.** One signal was fixed; the aggregate outcome required more investigation.

## A black screen changed the observation strategy

To identify the remaining branch, the investigation tried to capture fixed detector arguments at ART reflection entry points. `ArtMethod::Invoke` did not yield the target event. During a subsequent uprobe experiment at `art_quick_invoke_static_stub`, opening the app was followed by an ADB disconnect and a black or frozen display.

No panic log explained the black screen, and pstore was empty after recovery. It occurred during the probe experiment, but the cause remains unknown. The evidence does not establish a link to the Magisk mount change or a specific ART, CFI, or kernel mechanism.

Observation stopped. The operator entered Fastboot, the verified original `init_boot` was restored, and boot images, Root, and configuration were checked. The operator confirmed the phone worked again. The ART probe script received a runtime guard and was retired from subsequent work.

A read-only probe can still disrupt the system it observes. The next design therefore used narrowly scoped syscall tracepoints and an independent reproduction APK, with an exit path that did not depend on the host connection. Recovery also restored a trustworthy baseline before another hypothesis was tested.

## The second signal ran in App Zygote

Static analysis exposed another path involving an isolated service and SELinux labels. Calling it an `isolated_app` check would have been premature. The real trace placed the three writes in **App Zygote**, targeting `/proc/thread-self/attr/current`.

The app opened, wrote, and closed the file with these exact bytes, without a trailing NUL:

| Written label | Bytes | Original kernel `write` return | errno |
| --- | ---: | ---: | --- |
| `u:r:kp:s0` | 9   | \-22 | EINVAL |
| `u:object_r:ksu_file:s0` | 22  | \-22 | EINVAL |
| `u:r:magisk:s0` | 13  | \-1 | EPERM |

Negative values here are raw kernel syscall returns. The APK tables below use positive errno values; `-22` and errno `22` describe the same failure at different layers.

The eBPF observer used `sys_enter` / `sys_exit`, filtering the application’s UID and narrowly named child processes, plus two exact paths:

```text
/proc/thread-self/attr/current
/sys/fs/selinux/context
```

It paired entry and exit by thread and associated subsequent I/O with process and fd, preserving input length and return value. Collection stopped 15 seconds after the first target call. A separate device watchdog cleaned up after 35 seconds, and the host used `finally` to remove its own pins and maps. It did not override return values or attach ART probes. The baseline contained 39 related events; exported events and counters agreed without reaching the configured truncation limit.

These bounds reduced this experiment’s exposure. They do not make eBPF universally harmless or this collector a general tracing tool: a later run must review UID selection, process names, fd lifetime, capacity, and paths again.

In the captured sequence, `/sys/fs/selinux/context` served normal Android context setup. The three detector writes used procfs. Changing policy for the former interface would not directly address the observed calls.

## Reproduce the execution context as well as the bytes

An independent APK requested no permissions and contained no networking or Xposed injection. It used `zygotePreloadName` and a service configured with `isolatedProcess=true` and `useAppZygote=true` to create a real App Zygote and isolated child. The [Android service manifest reference](https://developer.android.com/guide/topics/manifest/service-element#isolated) describes those process options.

Running identical writes in three actual environments produced a useful distinction:

| Environment | Original errno values | Modified-kernel errno values |
| --- | --- | --- |
| Ordinary `untrusted_app` | 13, 13, 13 | 13, 13, 13 |
| `app_zygote` | 22, 22, 1 | 22, 22, 22 |
| Child `isolated_app` | 13, 13, 13 | 13, 13, 13 |

Testing only an ordinary application or the final isolated child would have missed the discriminating row. App Zygote needs a different permission path to specialize its children. UID, SELinux domain, thread state, and lifecycle stage all belong in the experiment’s inputs.

The first APK revision accidentally appended a NUL. Although its results matched, it was corrected to use the exact byte lengths, rebuilt, and retested. The earlier output remained separately labeled.

Static decision logic explained the distinction: EINVAL was excluded from a hit-label list, while EPERM was included. A nonempty list, with preceding service state normal, could generate `0x122`. The final aggregate code was not captured directly from the live app. That number is a static derivation, supported by observed inputs and independent reproduction, rather than a runtime measurement.

## Keep the denial and normalize a specific error path

The exact kernel’s [`selinux_setprocattr()`](https://github.com/LineageOS/android_kernel_xiaomi_sm8550/blob/03e6e48a5b4ed606dfdd48bc782a57f9c778938b/security/selinux/hooks.c) separates the initial permission check, target-context resolution, and later transition checks. An unknown label can fail resolution with EINVAL; a known label can pass resolution and fail a later condition with a different error.

The app did not successfully acquire a Root context. The rejected operation exposed evidence of a label’s existence. [DirtySepolicy](https://github.com/LSPosed/DirtySepolicy) is an independent implementation of related App Zygote probing; it is a mechanism reference, not proof of what this PayPal instance executed.

Configuration changes had not supplied a verified remedy. Removing App Zygote’s `setcurrent` would interfere with normal isolated-child specialization, while restricting only the final `isolated_app` would miss the caller. Repeatedly renaming a Root domain also creates compatibility work. The scope therefore expanded to the existing kernel after explicit authorization for review and testing.

The actual patch adds 20 lines after `abort_creds(new)` at `abort_change:`. Its core is reproduced below; the [patch download](https://mixtureofinsights.com/notes/paypal-root-crash-2026-09-14/app-zygote-errno.patch) preserves the placement:

```c
if (!strcmp(name, "current") &&
    (error == -EPERM || error == -EACCES)) {
    char *context = NULL;
    u32 context_len = 0;
    static const char prefix[] = "u:r:app_zygote:";

    if (!security_sid_to_context(&selinux_state, mysid,
                                &context, &context_len)) {
        if (context_len >= sizeof(prefix) - 1 &&
            !memcmp(context, prefix, sizeof(prefix) - 1))
            error = -EINVAL;
        kfree(context);
    }
}
```

The denied operation remains denied. Existing permission checks and auditing execute, and successful specialization follows its original path. No allow rule or permissive mode is introduced. Earlier returns, including the initial `setcurrent` denial, do not traverse this block. Other callers, attributes, and unmatched errors retain their results.

There is still an interface change: every matching App Zygote caller on this failure path sees a normalized errno, which could affect code that depends on that distinction. The patch is independent of PayPal’s package, UID, and specific Root label. Its scope also does not cover every SELinux query interface.

## A successful build is only the start of kernel compatibility

Twenty changed lines can require substantial validation because unrelated build inputs affect bootability. The build used the precise source revision and runtime configuration:

| Input | Recorded value |
| --- | --- |
| Kernel base | `03e6e48a5b4ed606dfdd48bc782a57f9c778938b` |
| Magisk base | `e8a58776f1d7bdf852072ad0baa6eceb9a1e4aac` |
| LLVM source revision | `5e96669f06077099aa41290cdb4c5e6fa0f59349` |
| Compiler | Clang 21.0.0; matching source revision, different distribution description |
| Kernel features | Full LTO and CFI retained; CFI permissive disabled |
| Modules | Original vendor modules and kernel-release string retained |

A matching LLVM source commit does not imply an identical compiler binary or kernel output. Configuration differences, symbol CRCs, certificate checks, and an actual boot were still necessary.

First, the candidate retained the original kernel’s public module-verification certificate. The resulting certificate matched byte for byte. No original private key was used and vendor modules were not all resigned. The original configuration did not universally force signatures for every module; that setting remained unchanged. This work did not introduce stricter signature enforcement. The [kernel signing documentation](https://docs.kernel.org/5.15/admin-guide/module-signing.html) explains the roles of public keys, signatures, and build settings.

Second, compatibility checking initially made a false assumption: it compared every vendor-module import only with candidate `vmlinux`. Some imports were supplied by other vendor modules. Including their actual ELF `__ksymtab_*` and `__crc_*` providers resolved the false missing-symbol report. Across 400 module files, all 4543 imports matched: 2984 were provided by the kernel and 1559 by unchanged modules, with no CRC mismatch.

After boot, the same set of 388 modules was loaded as in the baseline. The file count and loaded count measure different things.

Fifteen host tests also compiled the actual before-and-after function bodies against controlled kernel API substitutes, with AddressSanitizer and UndefinedBehaviorSanitizer. They checked denied transitions, permitted child specialization, unrelated callers, similar prefixes, other attributes, allocation failures, and identical credential commit/abort behavior. These were control-flow tests, not substitutes for runtime policy, ABI, or boot validation.

## Test the kernel separately before combining changes

The first device test used a **temporary Fastboot boot** of the candidate kernel with the original Magisk image. Rereading the partitions verified that original `boot` and `init_boot` contents had not changed. Boot, Root, HMA, Enforcing, and the loaded module set were healthy. The independent APK matched the expected table, and the bounded trace of real PayPal confirmed three `-22` writes.

PayPal still exited. The original mount-allocation signal was expected to remain with the original Magisk image, so this did not invalidate the kernel result.

Only then were both changes installed: the validated kernel plus magiskinit with temporary diagnostic logging removed. Packaging preserved boot headers and unrelated contents. This device’s boot ramdisk was empty. In `init_boot`, only the ramdisk’s `init` content changed; other entries and their metadata were preserved. `vendor_boot` stayed untouched.

This table distinguishes what was measured in each stage:

| Stage | Device-number evidence | SELinux evidence | Actual app result |
| --- | --- | --- | --- |
| Original baseline | 17, 18, 19, 21; native result 1 | Real returns -22, -22, -1 | Root rejection |
| Magisk change only | 17, 18, 19, 20; real native result 0 | Not separately collected in that stage | Still rejected |
| Kernel change only | Original Magisk image retained | Independent APK and real calls verified | Still rejected |
| Combined changes | Final values 17, 18, 19, 20 | Same verified kernel; no probe reattached during acceptance | Opened and stayed after fingerprint authentication |

Not every cell was remeasured, and the planned whole-device A/B/A tests and repeated cold starts were not all completed. The recorded evidence supports the result for this build within that test scope.

## Acceptance includes the rest of the device

The combined image reached PayPal’s normal system fingerprint prompt. The operator authenticated and confirmed entry and a stable page. A later check found the same PayPal process alive and an empty crash buffer.

The surrounding checks were recorded separately:

-   Magisk Root and the existing Zygisk components worked; the HMA configuration hash was unchanged.
-   SELinux remained Enforcing, with the live policy byte-identical to the original.
-   The baseline set of 388 loaded kernel modules was preserved.
-   The diagnostic APK, task-owned BPF programs, maps, pins, probes, and device temporary files were removed.
-   An iFAST cold start showed no Root or jailbreak warning. It did show a developer-options risk warning, so this run did not validate functionality beyond that screen.

PayPal acceptance covered authenticated entry and remaining on the page. No payment or transfer was executed. The result does not establish a change to hardware attestation or backend risk decisions.

## A runbook for the next recurrence

Start from a fresh baseline if startup breaks again: app, OS, kernel, Magisk, and ZygiskNext versions; slot; module list; policy state; and the new exception. Similar symptoms do not justify automatically reapplying these changes.

1.  **Classify the failure.** Check whether it is still `s=root`, or instead a native crash, ANR, or system reboot. Preserve the original evidence.
2.  **Check whether the changes survived.** OS, kernel, and Magisk updates can replace `boot` or `init_boot`. Compare source and image records with actual signals; the Magisk UI version alone is insufficient.
3.  **Measure in the relevant execution context.** Device numbers are an initial clue. Critical behavior belongs in the real app, App Zygote, or a faithful reproduction—not just a shell session.
4.  **Change one hypothesis at a time.** Write down the input to change, the observation expected to move, and other reasons the app may still fail.
5.  **Give temporary observation an exit path.** Bound the target, time, count, and cleanup ownership. Do not reactivate the retired ART entry probe.
6.  **Accept the result without diagnostic instrumentation.** Recheck the actual application, Root, policy, and existing functionality. Record untested areas explicitly.

Prepare recovery before a boot-image test: read the current original partitions, hash them, retain offline host copies, verify device and slot, and establish a working Fastboot path. The final repair changed both `boot` and `init_boot`, so complete rollback needs both corresponding originals. A normal reboot ends a temporary boot; it does not undo persistent flashing.

After an update, review the changes against the new source and repeat compatibility checks. An old image also contains the old boot structure; matching the phone model is not enough to make cross-version flashing appropriate. Patches, exact baselines, captured inputs, and acceptance records are more useful maintenance artifacts than an image labeled “worked once.”

## Attachments and provenance

The [attachment README](https://mixtureofinsights.com/notes/paypal-root-crash-2026-09-14/README.md), [sanitized evidence summary](https://mixtureofinsights.com/notes/paypal-root-crash-2026-09-14/evidence-summary.json), [15 host-test results](https://mixtureofinsights.com/notes/paypal-root-crash-2026-09-14/error-path-tests.txt), and [checksum manifest](https://mixtureofinsights.com/notes/paypal-root-crash-2026-09-14/SHA256SUMS.txt) accompany the two installed source patches. No flashable image is included.

The public summary selects technical fields from local records, omitting device identifiers, personal paths, and account UI. It is neither a raw-log archive nor independent third-party reproduction. Original images, captures, and recovery materials remain local. The repository’s `docs/SOURCES.md` records code and evidence anchors for future revisions.

Both changes remain maintenance work: after an update, check whether these differences still exist before applying the patches again.

This process-specific result extends the earlier [UID, SELinux and namespace audit](https://mixtureofinsights.com/blog/04-auditing-from-the-apps-eyes/).
