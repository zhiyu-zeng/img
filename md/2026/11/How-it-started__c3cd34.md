---
title: How it started
source: https://hshrzd.wordpress.com/2026/11/09/debugging-a-boot-loop-on-acer-veriton-vgn100/
source_host: hshrzd.wordpress.com
clip_date: 2026-11-09T12:05:23+08:00
trace_id: a5090cd0-5e0b-4d3f-b7b9-6a3162921725
content_hash: 8e1e0c5b625a54812bfd6fbe9c603ed4e98d78287384b2f6d6daab70e7dfdcc0
status: synced
tags: []
series: null
feed_source: hasherezade·恶意软件逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41375244-d011-8186-9db9-e11b1262afee
ioc: null
---

Recently I bought a Spark-class machine to start experimenting with local models. But my first adventure with it turned out to be quite different.

It took me back to my early experiences with Linux in 2002, when, as a teenager, I was trying to compile a custom kernel to get NVIDIA drivers working on a Linux installation my father had allowed me to set up on his computer. The new kernel ended up panicking, and when I tried to configure LILO to let me choose between the old and the new kernel, I somehow messed up the bootloader too. As a result, neither my Linux nor my father’s Windows would boot anymore. I don’t remember exactly what went wrong, just that after all I managed to fix it and it ended well. But I still remember the horror of realizing that I had just made my father’s computer unbootable… As Linux matured over the years, and I continued using it daily, I almost forgot such problems exist.

This time, I wasn’t recompiling a kernel or doing anything fancy. But as we will see, even standard updates on this relatively new stack can sometimes cause unexpected problems, so it’s better to be prepared.

TL;DR: My Acer is doing fine now, and in this blog post I just wanted to share the steps I took to fix it and the lessons I learned. And unlike in my teenage years, this time I had a helper along the way: a GPT-6 bot.

I was happy to finally have this machine, and I couldn’t wait to start setting things up. So as soon as I booted it for the first time, I decided to run a standard system update. This Acer model comes with NVIDIA DGX OS preinstalled, which is Ubuntu-based.

```
sudo apt update
sudo apt full-upgrade
```

During the update, the kernel got updated from `6.11.0-1016-nvidia` to the latest at the time: `7.0.0-1024-nvidia`. But everything looked fine, so I thought it was time to reboot.

And this is where my rude awakening happened. Instead of my system booting cleanly, I saw the Acer logo, then something resembling a memory check, with rows of zeros. But it went nowhere. After a moment, the system rebooted and repeated the same loop over and over.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c41f0c191ce17e88.png)

## Let’s boot anything

What was going on? I didn’t know much at this point, but I suspected that the update was responsible, probably the kernel update. So, as usual in such cases, my first thought was to try booting the last kernel that worked. We just needed to reach it…

The GRUB menu was hidden and set to automatically boot the default entry. I tried to trigger it using a variety of recommended key combinations after the Acer logo (such as Left Shift + Insert), but I couldn’t get it to appear.

Finally, I gave up trying to trigger GRUB and decided to enter UEFI setup to see what options I had. The reboot loop was so quick that it took me several attempts at pressing Esc to finally reach the UEFI menu.

Looking at the “Boot” tab, I understood why it had been so difficult to enter UEFI. “Setup Prompt Timeout” was set to just 1 second.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6383660481501815.png)

So I changed it first, setting the timeout to 5 seconds.

If we can’t choose what kernel to boot from the disk, we may try a different way, and boot the system from a different medium. It is an ARM64 machine, so I downloaded an Ubuntu ARM64 image and flashed a pendrive with the ISO. The Boot Override accessible from UEFI allowed me to select the exact medium I wanted to be used.

And it booted – well, sort of.

The live desktop didn’t start: all I got was a black screen with an X-shaped cursor, which looked familiar from my earlier Linux adventures when the X Window System failed to initialize properly. Trying to switch to a text console using Ctrl+Alt+F2/F3/F4 didn’t really do a thing. So it looks like this way is blocked too…

But there was one more thing worth trying. The Ubuntu pendrive had its own GRUB menu, which appeared before the live system started. Maybe we could use it to access the internal disk?

## Booting the kernel via the GRUB command line

I rebooted the machine from the Ubuntu pendrive again, but this time, instead of starting Ubuntu, I pressed `C` in the GRUB menu to enter its command line.

At the GRUB prompt, I used the `ls` command to list the available disks and partitions. My internal SSD was among them, so I started exploring its contents.

-   `(hd0,gpt1)` contained the EFI files.
-   `(hd0,gpt2)` contained the Linux root filesystem, including `/boot`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2d7af65d77570494.png)

> Note that GRUB device identifiers may differ between machines. Make sure to identify your Linux root partition before using the commands below.

Both kernels – the old one and the newly installed one – should be in `/boot`, so let’s check:

```
ls (hd0,gpt2)/boot/
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d9d4f4e02090238e.png)

And here they are.

## Trying to boot the old kernel

The files with `6.11.0` belong to the previously working kernel:

```
vmlinuz-6.11.0-1016-nvidia # Linux kernel
initrd.img-6.11.0-1016-nvidia # Initial RAM filesystem
```

Now we will try to manually issue the commands to boot the old kernel.

It also needs the root filesystem UUID, which is pretty long. Since we cannot use copy-paste here, and retyping is error-prone, we can store it in the environment variable first:

```
set root=(hd0,gpt2)
probe --fs-uuid --set=rootuuid (hd0,gpt2)
echo $rootuuid
```

On my first attempt I tried the following minimal configuration. The `boot` command will initiate the booting process.

```
linux /boot/vmlinuz-6.11.0-1016-nvidia root=UUID=$rootuuid ro
initrd /boot/initrd.img-6.11.0-1016-nvidia
boot
```

The boot started, but then appeared to freeze after displaying:

```
EFI stub: Booting Linux Kernel...
EFI stub: Loaded initrd from LINUX_EFI_INITRD_MEDIA_GUID device path
EFI stub: Generating empty DTB
EFI stub: Exiting boot services...
EFI stub: UEFI Secure Boot is enabled.
```

So, the minimal configuration was not enough. Fortunately, we can read the GRUB config file from the disk (`grub.cfg`) to check what the actual one was.

This takes us back to reboot the machine and repeat all the steps done before the last commands were issued.

Reading long files in text mode comes with additional inconveniences. We need to set pagination first, otherwise the whole content will just flash in front of our eyes before we can find anything useful. It is done with the command:

```
set pager=1
```

Then we can display it, page by page.

```
cat (hd0,gpt2)/boot/grub/grub.cfg
```

We are searching for the old kernel configuration, so we must spot the section containing `6.11.0-1016-nvidia`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/10ec315af466f054.png)

The full commandline to load the kernel is under “Loading Linux 6.11.0-1016-nvidia …”. Then there’s another message “Loading initial ramdisk …” – which shows the same commandline responsible for loading ramdisk as we tried before.

Now the challenge is to retype the whole command and use it instead of the earlier version…

```bash
set root=(hd0,gpt2)
probe --fs-uuid --set=rootuuid (hd0,gpt2)
echo $rootuuid
linux /boot/vmlinuz-6.11.0-1016-nvidia root=UUID=$rootuuid ro init_on_alloc=0 iommu.passthrough=0 console=tty0 plymouth.ignore-serial-consoles plymouth.use-simpledrm earlycon=uart,mmio32,0x16A00000 console=ttyS0,921600 crashkernel=1G-:0M initcall_blacklist=tegra234_cbb_init kho=off pci=pcie_bus_safe
initrd /boot/initrd.img-6.11.0-1016-nvidia
boot
```

Once we trigger the old kernel to be booted, we should be on the way to full system restore, right? Not really. It proceeded much further than before, but the system never started, it just autorebooted again. My suspicion was that the upgrade had introduced some incompatibility between the old kernel and the updated system components. However, I didn’t investigate it further, so the exact cause remains unknown.

So we need to start it all over and find some different solution!

## The NVIDIA advisory

Around the same time, reports of similar problems were appearing on the NVIDIA Developer Forums. The issues with kernel `7.0.0-1024-nvidia` were being discussed in \[[1](https://forums.developer.nvidia.com/t/dgx-spark-kernel-7-0-0-1024-nvidia-summary-of-reported-issues/387939)\], and NVIDIA had already released a fix in the `nvidia-spark-initcall-bl 1.0-2` package \[[2](https://forums.developer.nvidia.com/t/dgx-spark-repeatedly-rebooting-after-most-recent-update/387397/40)\].

Since the problem was related to HDMI, NVIDIA also suggested booting the machine without a connected display and accessing it through SSH. However, my Acer was freshly installed, and I hadn’t configured or verified remote SSH access yet. So I needed a recovery method that didn’t depend on a running operating system.

## Trying to boot the new kernel

The fix provided by NVIDIA adds the following argument to the kernel’s boot command line: `initcall_blacklist=power_wrap_init`.

Now we know what to add manually to the kernel loading command line.

First we need to go back to the grub.cfg and find the current entry dedicated to boot this kernel. It will follow the same procedure as before. In this case the configuration is under the log “Loading Linux 7.0.0-1024-nvidia”. The whole reconstructed command-line, along with the added argument, is the following:

```
set root=(hd0,gpt2)
probe --fs-uuid --set=rootuuid (hd0,gpt2)
linux /boot/vmlinuz-7.0.0-1024-nvidia root=UUID=$rootuuid ro init_on_alloc=0 iommu.passthrough=0 console=tty0 plymouth.ignore-serial-consoles plymouth.use-simpledrm earlycon=uart,mmio32,0x16A00000 console=ttyS0,921600 crashkernel=1G-:0M initcall_blacklist=tegra234_cbb_init,power_wrap_init kho=off pci=pcie_bus_safe
initrd /boot/initrd.img-7.0.0-1024-nvidia
boot
```

Finally, the system booted normally! That was a real moment of relief. But before celebrating, I had to take care of making all changes persistent. Also, having access to GRUB menu has its advantages, so I decided to restore it.

## Making the changes permanent

## Step 1: Install NVIDIA’s official fix

Since the boot command of the new kernel needs an additional option to work, we need to make sure it is permanent. My first thought was to edit the `grub.cfg` manually. But wait! Nvidia actually issued an official patch that does it, we just need to pull it, and make sure it is installed.

```
sudo apt update
apt-cache policy nvidia-spark-initcall-bl
```

If version `1.0-2` is available, NVIDIA recommends:

```
sudo apt dist-upgrade
```

That’s what I did, and just to doublecheck that the patch is installed:

```
dpkg -l nvidia-spark-initcall-bl
```

Since everything looks correct, let’s see the full boot command by checking the relevant line in `/boot/grub/grub.cfg`

```
sudo grep -n 'power_wrap_init' /boot/grub/grub.cfg | head
```

The correct output is basically an equivalent of the commandline that we passed manually before.

## Step 2: Make the GRUB menu permanently visible

So far it looks good. But as an extra I will add another change, just for my convenience in the future: making the GRUB menu to show on the system startup.

Changing the GRUB settings can be done by editing the config file: `/etc/default/grub.d/zz-timeout.cfg`.

I added there the following settings:

```toml
GRUB_TIMEOUT_STYLE=menu
GRUB_TIMEOUT=10
GRUB_RECORDFAIL_TIMEOUT=10
```

We regenerate the main GRUB configuration (`/boot/grub/grub.cfg`) applying the additional configuration file by issuing:

```
sudo update-grub
```

## Step 3 – Verification

The last verification before the reboot:

```
dpkg -l nvidia-spark-initcall-bl
sudo update-grub
sudo grep -n 'power_wrap_init' /boot/grub/grub.cfg | head
```

If all the checks succeed, we are ready to go. If anything fails, the relevant step must be repeated and troubleshot.

And finally, let’s see it in action!

It worked flawlessly, and got me back to my login screen as I left it of.

## Wrap-up

So, after quite a few unexpected adventures, my Acer was finally back! The `power_wrap_init` workaround resolved the reboot loop, and after making the fix persistent and restoring the GRUB menu, the machine could boot normally again.

There are a few lessons I learned from this experience. Having a recovery medium at hand is invaluable. In my case, the Ubuntu ARM64 pendrive saved the day, even though the live system itself didn’t work properly. Also, having an older kernel installed isn’t particularly useful if you have no way to select it. From now on, I’m keeping the GRUB menu accessible.

Another interesting aspect of this adventure was debugging together with a GPT-6 bot. Most of our communication consisted of me sending photos of the screen and the bot helping me interpret the results and plan the next steps. It wasn’t a flawless process. We explored some paths that didn’t work, and the bot also made mistakes that we had to correct along the way. But that’s how debugging usually goes. What mattered was that we could examine the evidence, revise our hypotheses, and eventually find a working solution.

I hope this write-up will save some time for anyone who encounters a similar problem.

Looking back at my first Linux adventures in 2002, I find it amusing that 24 years later, I could still get the same adrenaline rush from trying to boot Linux. I certainly didn’t expect that a routine system update in 2026 could bring back those memories.
