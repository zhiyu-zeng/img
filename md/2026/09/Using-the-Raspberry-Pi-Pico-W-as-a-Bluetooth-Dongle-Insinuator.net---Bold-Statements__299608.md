---
title: Using the Raspberry Pi Pico W as a Bluetooth Dongle | Insinuator.net - Bold Statements
source: https://insinuator.net/2025/06/using-the-raspberry-pi-pico-w-as-a-bluetooth-dongle/
source_host: insinuator.net
clip_date: 2026-09-30T10:22:10+08:00
trace_id: 0f4b815a-4098-4b28-8e42-47ca805a8cf1
content_hash: 56726bd757e076e196d4d1abbc671dedf067245ea4a24c9a7e0b9c48879f8d0d
status: synced
tags:
  - 硬件逆向
  - 安全工具
series: null
feed_source: ERNW Insinuator
ai_summary: 用树莓派 Pico W（内置 Infineon CYW43439 控制器）自制蓝牙 dongle：把控制器 SPI 侧的 HCI 转成 USB CDC 上的 UART HCI，代码已开源。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3eb75244-d011-8197-bb8a-e835ce9936c5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用树莓派 Pico W（内置 Infineon CYW43439 控制器）自制蓝牙 dongle：把控制器 SPI 侧的 HCI 转成 USB CDC 上的 UART HCI，代码已开源。
> 
> - **动机：** 市售蓝牙 dongle 芯片型号、支持特性不透明，而 Pico W 控制器型号已知、价格更低，且 CYW43439 已被 internalblue 项目大量研究。
> - **实现思路：** 蓝牙 Host 与控制器间靠 HCI 通信，Pico 与控制器走 SPI，作者用 SDK 的 `cyw43_bluetooth_hci_read` / `cyw43_bluetooth_hci_write` 做 SPI-HCI 与 UART-HCI 的“翻译器”。
> - **选 UART 而非 USB HCI 的原因：** 实现更简单，且可拓展用于 Android 手机等场景。
> - **使用流程：** 装 Pico SDK → `cmake -DPICO_BOARD=pico_w ..` 编译 → 烧录 uf2 → Linux 上 `sudo hciattach /dev/ttyACM0 any`、`hciconfig hci0 up`，之后即可用 `bluetoothctl` 扫描。
> - **限制：** SCO 不可用，影响部分音频应用，原因是控制器固件与控制器到 Pico SoC 的连线方式共同导致。

During our recent research, we experimented with different Bluetooth USB dongles. There are tons of options, and sometimes, it’s challenging to determine what chipset a dongle actually contains, what Bluetooth features it supports, and whether it works on Linux. Inspired by the recent [ESP32 Bluetooth research](https://www.tarlogic.com/blog/esp32-hidden-hci-vendor-commands/), we wondered whether we could turn our Raspberry Pi Pico Ws into a functioning Bluetooth dongle. We had a few lying around, and the advantage here is that we know exactly which [Bluetooth controller it uses](https://www.raspberrypi.com/documentation/microcontrollers/pico-series.html) – the Infineon CYW43439. It’s also very easy to get one. You can just buy the Pico W for a few bucks, even cheaper than some Bluetooth dongles. You also have a controller family that has been researched quite a bit in the [internalblue project](https://github.com/seemoo-lab/internalblue/). However, there was one disadvantage. We did not find any code that exposes the CYW43439’s HCI interface via USB. So we had to write that on our own.

You can find the [code here](https://github.com/auracast-research/pico-uart-hci), if you don’t care about the background and just want to use your Pico W as a Bluetooth dongle.

## A Little Bit of Background on HCI

But first, let’s quickly get into HCI. Those that are already familiar with HCI can skip to the next section.

HCI – the *Host Controller Interface* in Bluetooth is the communication interface between the Bluetooth Host and the Bluetooth Controller, i.e., between your operating system and the Bluetooth dongle, or built-in Bluetooth chip. This communication can use different transports. A common transport for USB Bluetooth dongles is [USB HCI](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host-controller-interface/usb-transport-layer.html). Another very common transport is [UART](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host-controller-interface/uart-transport-layer.html). Many embedded devices, and historically smartphones, use this transport.

The Bluetooth standard specifies these transports in their [HCI chapter](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host-controller-interface.html). Some operating systems support a number of these transports. So, a USB HCI or UART HCI device should work regardless of the chip or dongle vendor. At least on Linux. macOS doesn’t let you use UART-based HCI devices for their operating system Bluetooth stack, but USB HCI seems to be supported. Regardless of operating system support, this still allows you to use other Bluetooth tooling, such as [btstack](https://github.com/bluekitchen/btstack), Google’s Python-based [Bumble](https://github.com/google/bumble), or [internalblue](https://github.com/seemoo-lab/internalblue). Btstack and Bumble allow you to run a separate Bluetooth stack, fully independent from your OS stack, with the external dongle. For research and development, this is great.

Things like this also exist as a finished product, e.g., the [Ezurio BT851](https://www.ezurio.com/part/bt851). But if you already have a Pico W lying around, this is the cheaper option. And in our opinion, it’s also more fun to build something!

## Pico HCI UART

As with other systems, the Raspberry Pi Pico W uses HCI to communicate with the CYW43439 controller. So our idea was to expose this HCI interface via UART (using USB CDC, basically a virtual serial interface) using the Pico’s USB interface. We decided to implement HCI over UART instead of HCI USB because it’s easier to implement and was enough for our purposes (It also allows us to use it on an Android phone, but that’s a story for a later time…?). The Pico does not use UART to communicate with the Bluetooth controller but rather an SPI interface. As the CYW43439 is a combo chip that also does Wi-Fi, the SPI transport handles both, Bluetooth and Wi-Fi.

However, this is not a big issue. Regardless of the transport, the Pico and the controller still use HCI. We can build something like a *translator* between the SPI-based HCI and our desired UART HCI. This is made even more convenient by the two API functions `cyw43_bluetooth_hci_read` and `cyw43_bluetooth_hci_write`, which are part of the Pico SDK’s CYW driver.

Essentially, we have to read from our UART CDC device and send the data to the controller using the write function. On the other hand, we use the read function and write this data to the CDC interface. There is a bit of additional reassembly and protocol handling, but apart from this, it’s relatively simple.

## Using Pico UART HCI

1.  Install the [Pico SDK](https://github.com/raspberrypi/pico-sdk)
2.  Build the project.

```bash
git clone https://github.com/auracast-research/pico-uart-hci.git
cd pico-uart-hci
mkdir build
cd build
cmake -DPICO_BOARD=pico_w ..
make
```

1.  [Flash](https://projects.raspberrypi.org/en/projects/get-started-pico-w/1) the `uf2` file to the Pico W.
2.  Attach the Pico as Bluetooth controller (Linux).

```bash
# start bluetooth if it's not running
sudo systemctl start bluetooth
# attach the HCI UART
sudo hciattach /dev/ttyACM0 any
# list HCI devices
hciconfig
hci0:   Type: Primary  Bus: UART
        BD Address: 28:CD:C1:XX:XX:XX  ACL MTU: 1021:8  SCO MTU: 64:10
        DOWN RUNNING
        RX bytes:722 acl:0 sco:0 events:40 errors:0
        TX bytes:438 acl:0 sco:0 commands:40 errors:0
# power on device
sudo hciconfig hci0 up
```

Now you can use the Pico as Bluetooth controller. For example with `bluetoothctl`

```bash
$ bluetoothctl
Agent registered
[bluetoothctl]> power on
Changing power on succeeded
[bluetoothctl]> scan on
SetDiscoveryFilter success
Discovery started
[CHG] Controller 28:CD:C1:XX:XX:XX Discovering: yes
[NEW] Device XX:XX:XX:XX:XX:XX XX-XX-XX-XX-XX-XX

[...]
```

## Limitations

One limitation we faced was that SCO does not work. SCO is a protocol that some audio applications require. More details about the issue can be found in the [pico-sdk repo](https://github.com/raspberrypi/pico-sdk/issues/1461). Apparently, this is a combination of an issue with the controller firmware, and the way the controller is wired to the Pico SoC.

Cheers,  
Dennis and Frieder.
