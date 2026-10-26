---
title: "[고독한 늑대들] Android Auto dongle을 분석해보자 - Part 1"
source: https://hackyboiz.github.io/2026/10/26/poosic/[Research]lonelyWolf_1/KR/
source_host: hackyboiz.github.io
clip_date: 2026-10-26T19:36:07+08:00
trace_id: a9b97596-bfdd-4939-9e37-7c4c3385321b
content_hash: c33d82631f590550b7a132e612529802f7d1ea32e10bc1cfb9587b6aa122391f
status: synced
tags:
  - Android逆向
  - 固件逆向
series: "[고독한 늑대들] Android Auto dongle을 분석해보자"
feed_source: hackyboiz·Android/Windows/macOS漏洞
ai_summary: TL;DR：作者逆向拆解了 Anniver/Ottocast CP88-M Android Auto/CarPlay 无线转接盒，通过 OTA 与 FEL 获取固件、破解 XOR 混淆并还原 Andes RISC-V 自定义指令，为后续漏洞分析打下基础。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 40575244-d011-8123-9f64-fd115ad394ba
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：作者逆向拆解了 Anniver/Ottocast CP88-M Android Auto/CarPlay 无线转接盒，通过 OTA 与 FEL 获取固件、破解 XOR 混淆并还原 Andes RISC-V 自定义指令，为后续漏洞分析打下基础。
> 
> - **工作原理：** 该 dongle 是嵌入式桥接设备——对手机扮演车机、对车机扮演手机，基于 Linux 同时处理 BT/Wi-Fi/USB；实测含 hostapd、wpa_supplicant、udhcpd、mdnsd、rcpservice/raaservice 等组件，并使用 192.168.1.101/102 的 IP 配置。
> - **USB 伪装：** dongle 向车机侧将 USB 描述符伪装成 Apple iPhone（05ac:12a8，含 PTP/iAP/Mux/Ethernet 的 4 种配置），AA 模式下变为 `2717:ff40 (CAR2)`，AOA 切换后转为 `18d1:2d00`；但作者未完成完整的 TLS/AA 会话验证。
> - **固件获取：** 分析 `cpbox.js` 后追踪 OTA 流程，在厂商的 OTA 存储库中不需要认证即可下载 update.img；由于较新的镜像被加密，作者利用旧版明文固件作为 known-plaintext 来恢复 XOR 混淆的 keystream，并部分解码 `sw-description`。
> - **Flash Dump：** 跳板机从未直接连接 SPI，而是通过 Allwinner FEL（`1f3a:efe8`）确认 SoC 是 V821 RISC-V（而非标签上的 TC397），读取 16MiB SPI NOR 并获取 kernel/SquashFS/JFFS2 分区布局；通过充分的 SHA-256 交叉验证确保完整性。
> - **代码分析：** w由于 Ghidra 无法解析 Andes 扩展，作者从 ELF 初始化代码中获取 gp 值，恢复了 index.cgi 中 82% 的 ADDIGP 字符串引用；破解了 BEQC/BNEC 的自定义编码（funct3=5/7，立即数为指令[24:20]），使得 rcpservice 的 8 个命令分发准确映射到不同的 handlers。此外，通过 root shell（仅限本地物理接触），获取了 `/tmp/app` 下由 lypack 解包的 runtime binary（rcpservice、librcarplay.so 等）。

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/928caed59fcd08f8.png)

안녕하세요! t0be입니다. 오늘은 이전에 gongjae가 올린 고독한 늑대들 프로젝트에 이어서 돌아왔습니다! 🐺

다만 시작하기 전에 한 가지 말씀드릴 게 있습니다. 다 같이 프로젝트를 진행하지만 각자 관심 있는 주제가 다르기 때문에 한팀이지만 한팀이 아닌 느낌입니다. 그래서 [gongjae의 macOS 연구글](https://hackyboiz.github.io/2026/10/11/gongjae/LoneWolves_MacOS_part0/KR/) 과 이번 글은 주제가 전혀 다릅니다.

저는 차량 보안쪽을 하다 보니 처음에는 당연히 차량 자체나 내부 제어기를 떠올렸습니다. 그러다 문득 이런 생각이 들었습니다. “차량 자체가 말고 주변기기도 봐볼까…취약할거 같은데?”

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/64c9867cd67b3af7.png)

후보를 이것저것 찾아보다가 눈에 들어온 물건이 바로 Android Auto / CarPlay 무선 동글입니다.

사실 이 제품은 예전에 차량에서 Android Auto를 무선으로 사용하고 싶어 장바구니에 담아 두었던 제품이기도 합니다. 차량에 연결하고, 휴대폰과 페어링하면 끝! 크기에 비해 꽤나 강력한 능력을 가졌지만 사실 보안자체는 어떨까 항상 의문이 들었던 기기입니다.

차량과 휴대폰 사이에 Bluetooth, Wi-Fi, USB를 모두 다루는 제3의 장치가 하나 생기는 셈이니까요. 게다가 이 장치는 차량의 디스플레이에 표시할 데이터와 스마트폰의 미러링 세션을 처리합니다. 군침이 싹도는 제품이 아닐수가 없네요.

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e208fa579663505e.png)

이번에 제가 분석한 제품은 Anniver 브랜드로 판매된 Ottocast CP88-M 계열 무선 미러링 동글입니다. 쿠팡에서 바로 구매해줬습니다. 실제로 기기를 열어 보고, USB 통신을 관찰하고, OTA 펌웨어와 SPI 플래시를 확보해 리버싱한 뒤, 몇 가지 보안 문제를 직접 확인해 보았습니다.

원래 계획은 “간단히 펌웨어나 한 번 까 보자!”였는데요. 결과적으로 RISC-V 확장 명령어부터 펌웨어 업데이트 구조까지 보게 됐습니다. ~~님아 그강을 건너지 마오~~ 😇

이번 글에서는 이 동글이 어떻게 동작하는지, 펌웨어를 어떻게 확보하고 분석했는지, 그리고 어디까지 실제로 검증했고 어디부터는 아직 가설인지를 중심으로 이야기해 보겠습니다.

사실 이런 제품을 분석한 사람이 저 하나뿐일 리는 없겠죠? 분석을 시작하면서 비슷한 동글을 다룬 자료를 찾아봤고, 그중 [sec1.dk의 Reverse Engineering a Wireless CarPlay Adapter — Full Journey](https://sec1.dk/blog/carplay-re-blog.html) 가 눈에 들어왔습니다. 펌웨어 확보부터 OTA, 하드웨어 분석, 플래시 복구, root 셸까지 거의 한 바퀴를 돌아본 글이더라구요. 덕분에 처음부터 아무 단서 없이 모든 삽질을 다시 할 필요는 없었습니다.

다행히 완전 겹치는건 아니여서 이렇게 연구글로 풀게 되었습니다. 위 자료의 target은 Allwinner V851S3(ARM) 기반이었고, 제가 산 제품은 나중에 확인해 보니 V821(RISC-V) 기반이었습니다. 게다가 펌웨어 파일 구조부터 조금씩 달랐습니다. 따라서 실제 동작과 취약 여부는 제 기기에서 다시 확인하기로 했습니다.

> 분석 범위: 연구자 소유의 CP88-M 동글과 Pixel 10a를 이용해 실제 차량 없이 테스트했습니다. 차량 헤드유닛, CAN 네트워크나 차량 제어 기능에 대한 공격은 수행하지 않았습니다.

## 1\. How to work?

## 1-1. Android Auto 동글은 대체 무슨 일을 할까?

먼저 제가 처음에 헷갈렸던 것부터 짚고 가겠습니다. 이름만 보면 이 동글을 꽂는 것만으로 Android Auto를 전혀 지원하지 않던 차량에도 Android Auto 기능이 생길 것 같지 않나요?

하지만 이번에 분석한 CP88-M은 기본적으로 차량이 지원하는 유선 CarPlay 또는 Android Auto를 무선으로 바꾸는 어댑터입니다. 차량 자체가 해당 기능을 지원하지 않는다면, 동글만 꽂는다고 무조건 사용할 수 있는 제품은 아닙니다. 제조사 제품 설명도 기존 유선 기능을 전제로 하고 있습니다. Android Auto를 지원하게 해주는 제품도 있다고는 하는데 제 서칭 실력의 한계로 찾지는 못했습니다.

동작 원리를 살펴보면 생각보다 직관적입니다.

```
                 Bluetooth / Wi-Fi                USB┌──────────────┐       무선 연결       ┌───────────────────┐     유선 연결     ┌────────────────┐│   Smartphone │ <-----------------> │ CP88-M Dongle     │ <-------------> │ Car Head Unit  ││ Android / iOS│                     │ Linux + BT + Wi-Fi│                   │ (유선 AA/CP)   │└──────────────┘                     └───────────────────┘                   └────────────────┘     무선 Android Auto/CarPlay 수신          세션 처리 및 중계          유선 스마트폰처럼 동작
```

동글은 스마트폰에게는 무선 Android Auto/CarPlay를 제공하는 차량처럼 행동하고, 차량 헤드유닛에게는 USB에 꽂힌 스마트폰처럼 행동합니다. 무선으로 받은 데이터를 유선 쪽으로 넘기고, 차량에서 발생한 사용자 입력이나 제어 데이터를 반대 방향으로 전달하는 구조죠.

그러니까 이 제품은 단순한 USB 케이블 변환기가 아닙니다. 자체 OS와 통신 스택을 가지고 두 장치 사이에서 프로토콜을 처리하는 작은 임베디드 브릿지라고 볼 수 있을 것 같습니다.

그렇다면 두 장치가 서로 신뢰하는 한가운데에 놓인 이 기기가 공격자에게 장악된다면 어떻게 될까요?

물론 중간에 위치한다고 해서 모든 트래픽이 자동으로 복호화되거나 임의의 명령을 실행할 수 있는 것은 아닙니다. 그건 실제 프로토콜의 인증, 암호화, 세션 상태에 달려 있습니다. 하지만 공격자가 보기에 영양가 있어보이는 기기임은 분명해 보입니다.

## 1-2. 3만원 짜리 아이폰?

가장 먼저 동글을 PC에 연결하고 USB 디스크립터부터 확인했습니다. 그런데 아무리 찾아도 동글 처럼 보이는 기기가 안보여서 놀랬습니다.

```
Bus 003 Device 006: ID 05ac:12a8 Apple, Inc. iPhone  idVendor           0x05ac Apple, Inc.  idProduct          0x12a8 iPhone  iManufacturer           Apple Inc.  iProduct                iPhone  bNumConfigurations      4
```

저는 Android Auto 동글을 연결했는데 Apple iPhone이 연결됐다고 나오네요. 제가 Galaxy가 아닌 iPhone을 사용했다면 못찾을뻔했네요. 휴~

처음에는 다른 USB 장치가 잡힌 건가 싶었지만, 동글만 남긴 상태에서 다시 확인해도 같은 값이 나왔습니다. 실제 아이폰이 아니라 동글이 USB 디스크립터를 아이폰처럼 광고하고 있었던 것입니다.

| USB 구성 | 디스크립터에서 확인한 기능 |
| --- | --- |
| Configuration 1 | PTP(Picture Transfer Protocol) |
| Configuration 2 | iPod / iAP 관련 인터페이스 |
| Configuration 3 | Apple Mobile Device, USB Multiplexor |
| Configuration 4 | Apple Mobile Device + USB Ethernet |

CarPlay는 USB 인터페이스와 IP 기반 세션을 함께 사용합니다. 따라서 헤드유닛에 유선 아이폰이 연결된 것처럼 보이게 만들려면 이런 인터페이스를 제공할 필요가 있는 것이죠.

처음에는 1번 Configuration만 정상적으로 선택되고 2~4번은 실패했습니다. “디스크립터만 흉내 내고 기능은 없는 건가?” 싶었는데, 휴대폰이 페어링된 뒤 다시 확인하자 다른 Configuration도 활성화됐습니다.

Pixel과 동글을 Android Auto 모드로 맞춰 놓으니, 이번에는 **PC에 연결된 동글 쪽 USB 장치** 가 `2717:ff40`, 제품명 `CAR2` 로 표시됐습니다. 여기에 AOA(Android Open Accessory) 제어 요청을 보내자 USB 장치가 다시 인식되면서 ID가 `18d1:2d00` 으로 바뀌는 것도 확인했습니다. 원래 `18d1:2d00` 은 [Android AOA 문서](https://source.android.com/docs/core/interaction/accessories/aoa) 에서 Android 기기의 액세서리 모드용으로 정의한 ID인데, 이번에는 **동글이 차량에 연결되는 USB 포트 쪽에서 그 역할을 흉내 내는 상황** 인 거죠. 아이폰인 척하더니 이제는 안드로이드까지… 바쁘네요.

```
AOA_GET_PROTOCOL (Request 51)  -> Version 2AOA_SEND_IDENT   (Request 52)  -> 식별 문자열 전송AOA_START        (Request 53)  -> Accessory Mode 전환USB ID 변경: 2717:ff40  ->  18d1:2d00
```

즉 CarPlay와 Android Auto 모드에서 각각 다른 USB 장치로 인식되는 제품입니다. 참고로 위 USB ID 변경은 **PC에 연결한 동글에서 확인한 것** 이지, Pixel이 USB로 연결됐다가 다시 잡힌 건 아닙니다. 그리고 AOA 모드 전환까지 확인했다고 해서 Android Auto 전체 세션이 완성된 것도 아닙니다. 실제 AA 버전 요청을 Bulk OUT으로 전송하는 데에는 성공했지만, 헤드유닛 역할을 하는 스택이 완성되지 않아 응답과 TLS 세션까지 검증하지는 못했습니다. 주변에 차량 협찬을 구해보고 있지만 쉽지 않네요.

## 1-3. Bluetooth와 Wi-Fi는 왜 둘 다 필요할까?

무선 미러링이라고 해서 Bluetooth만으로 화면 데이터를 전부 전송하는 것은 아닙니다. 일반적으로 Bluetooth는 기기 발견, 페어링, 초기 연결 설정에 관여하고, 실제 대역폭이 필요한 미러링 데이터는 Wi-Fi/IP 경로를 활용합니다.

이번 동글에서도 이 구조에 대응하는 요소를 찾을 수 있었습니다.

| 구성 요소 | 실제 확인한 역할 |
| --- | --- |
| `btapp` | Bluetooth 연결 처리, `/dev/ttyS1` 사용 |
| `hostapd` | 5GHz Wi-Fi AP 운영 |
| `wpa_supplicant` | Wi-Fi Direct(P2P) 구성 |
| `udhcpd` | 접속 단말에 IP 주소 할당 |
| `mdnsd` | 네트워크 서비스 광고 |
| `rcpservice` | CarPlay 관련 세션 및 네트워크 통신 |
| `raaservice` | Android Auto 모드의 서비스 바이너리 |

실제 동글은 `CAR2-2F7D` 라는 Wi-Fi AP를 광고했고, IP 구성은 동글 `192.168.1.101`, 연결된 Pixel `192.168.1.102` 였습니다. 같은 하드웨어에서 Wi-Fi Direct 그룹도 확인됐습니다.

Pixel 로그에서는 이전에 등록된 장치로 RFCOMM 연결을 시작하고, 저장된 정보를 이용해 Wi-Fi에 연결하려는 흐름도 확인할 수 있었습니다. 매번 새로 페어링하지 않아도 자동 재연결이 이뤄진다는 이야기인데요. 사용성 측면에서는 편리하지만, 공격자 관점에서는 한 번 신뢰한 액세서리를 이후에도 계속 신뢰한다는 의미가 되기 때문에 해당 기기를 장악했을 때 *\*\** 휴대폰이나 차량측에 어느정도까지 영향을 미칠 수 있는지 궁금증이 생겼습니다.

물론 여기까지는 정상 기능입니다. 자동 재연결이 된다는 사실만으로 페어링 우회나 데이터 유출이 가능하다는 뜻은 아닙니다.

## 2\. Firmware Acquisition

이제 본격적으로 내부를 살펴보겠습니다. 이번 분석은 USB에서 시작해 무선 네트워크, OTA, 플래시 덤프, 바이너리 순서로 살펴보았습니다.

선행된 연구 자료를 보면 업데이트 서버와 다른 인터페이스가 좋은 출발점이 될 수 있었지만, 동일한 주소·파티션·검사 로직이 제 제품에도 있으리라는 기대는 당연히 안했습니다. 그러니 제 기기에서 측정한 값으로 다음 단계에 넘어가기로 했습니다.

## 2-1. 펌웨어 추출

처음에는 일반적인 임베디드 분석처럼 하드웨어를 뜯고 SPI 플래시부터 읽어야 하나 고민했습니다. 당연히 CH341A를 준비하던 찰나, 최고의 친구 GPT에게 시켜보니 알아서 동글 Wi-Fi에 연결한 뒤 `http://192.168.1.101` 에 접속하니 설정 페이지에 접속해 기능을 알아서 분석해주기 시작했어요.(야호!)

GPT가 분석해준 보고서에는 웹 UI에 기기 정보, 설정 변경, 펌웨어 업데이트 같은 기능이 있었는데요. 제가 가장 관심을 가진 것은 당연히 Firmware Update였습니다. 하드웨어를 뜯지 않고도 펌웨어를 얻을 수 있을지 모르니까요!

여기서 [sec1.dk의 분석글](https://sec1.dk/blog/carplay-re-blog.html) 이 도움이 됐습니다. 그 글에서는 비슷한 제품의 설정 페이지에서 OTA 경로를 따라가 공식 펌웨어를 확보했고, 패키지 앞에 MD5 문자열이 붙고 뒤에 SWUpdate용 CPIO 아카이브가 이어지는 구조를 정리해 두었습니다. 그 경로를 무작정 복사하는 대신, 제 동글의 웹페이지가 어떤 URL을 만드는지부터 확인했습니다.

페이지에서 사용하던 `cpbox.js` 와 `index.html` 을 확인하자 업데이트 흐름이 드러났습니다.

```
[관리 페이지]    |    | 1. 현재 버전 확인 (?id=host)    v[OTA 버전 정보 요청]    |    | 2. version.json의 빌드/배포 정보 확인    v[펌웨어 이미지 다운로드]    |    | 3. update.img 다운로드    v[동글의 업로드 CGI]    |    | 4. /tmp/update.img 저장 후 업데이트 처리    v[SWUpdate]
```

기기 버전 문자열은 `26061510.5140.2` 였고, 업데이트 관리 코드는 그중 모델/프로젝트 라인에 해당하는 `5140` 을 사용해 OTA 객체 경로를 구성했습니다. 시험 당시 벤더의 OTA 저장소에서는 알려진 객체 경로로 펌웨어 이미지와 버전 정보를 인증 없이 내려받을 수 있었어요. 저장소 전체 목록을 볼 수 있었던 것은 아니고, 경로를 알고 있는 업데이트 객체에 접근 가능한 형태였습니다.

이렇게 펌웨어를 확보하니 모든 게 해결될 줄 알았습니다. 그런데 파일 헤더를 확인하자 문제가 하나 더 생겼습니다.

## 2-2. 암호화된 펌웨어

동일 제품군의 일부 구형 이미지는 아래와 같은 구조를 가지고 있었습니다.

```
<MD5 체크섬>  update.swu070702...                 # CPIO(newc + CRC)  ├── sw-description      # 업데이트 메타데이터  ├── kernel              # 커널 이미지  └── rootfs              # 루트 파일시스템
```

여기서 `sw-description` 은 SWUpdate가 어떤 파일을 어디에 설치할지 결정하는 매니페스트입니다. 선행 연구에서 `070701` (newc)과 `070702` (CRC가 있는 newc)를 혼동하면 SWUpdate가 패키지를 거부한다는 점도 이미 짚어 놓았더라구요. 덕분에 패키지를 다룰 때는 어떤 CPIO 형식인지와 헤더가 파일의 어느 오프셋에서 시작하는지를 먼저 살펴볼 수 있었습니다.

실제로 처음 만든 간단한 CPIO 파서는 첫 멤버를 읽고 멈췄습니다. 앞부분의 MD5 문자열 때문에 아카이브 시작 위치가 0이 아닌데, 정렬 계산은 파일 시작점을 기준으로 해버렸기 때문입니다. 정렬 기준을 CPIO 시작 오프셋으로 수정하니 `sw-description`, `kernel`, `rootfs` 를 순서대로 읽을 수 있었습니다.

하지만 분석 대상과 가까운 최신 모델 라인에서는 여전히 정상적인 CPIO 헤더가 바로 보이지 않았습니다. 처음에는 암호화된 이미지인가 싶었습니다. GPT한테 시켜도 온전한 복구는 되지 않았는데요. ~~펌웨어 다운로드까진 쉬웠는데…~~

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e874419ec698a69a.png)

그런데 여러 빌드의 이미지를 비교하던 중 이상한 점을 발견했습니다. 서로 다른 파일인데 일부 구간의 바이트가 그대로 같았습니다. 이미지별로 독립적인 nonce/IV를 적용한 암호화라면 설명하기 어려운 모습이었죠.

짧은 문자열을 반복해서 XOR하는 방식이라고 생각하고 주기를 찾아봤지만 그것도 아니었습니다. 헤더 정도만이라도 복구해보자는 마음으로 마지막 동아줄이라도 잡는 심정으로 이전 펌웨어들을 다운로드 받아봤는데…다행히 벤더 서버에 남아 있던 구형 펌웨어가 평문이었습니다! 앞에서 확인한 CPIO 구조와 `sw-description` 의 알려진 부분을 known plaintext로 사용할 수 있었습니다.

```python
# 평문이 확보된 구간에 한해 같은 오프셋끼리 비교keystream = bytes(c ^ p for c, p in zip(encrypted_bytes, known_plaintext_bytes))candidate_plaintext = bytes(c ^ k for c, k in zip(other_encrypted_bytes, keystream))
```

같은 위치에서 복구한 스트림을 다른 모델의 이미지에도 적용해 보니, 구조적으로 타당한 `sw-description` 내용이 나타났습니다. 5110/5130 등 다른 모델에서 암호화 되었던 텍스트가 복원되고, 모델별 프로젝트명도 정상적으로 확인됐습니다. Known plaintext가 확보된 구간에서 공통 XOR 스트림을 확인하고, 이후 펌웨어에 적용 가능했네요. 물론 latest 이미지의 모든 바이트를 완벽하게 복호화하지는 못했습니다. 그래도 XOR을 이용한 OTA 난독화가 펌웨어의 기밀성을 제대로 보호하지 못한다는 점은 충분히 알았습니다. **이미지마다 독립적인 암호화 처리가 필요한 이유** 를 제대로 보여주는 사례였죠. ~~이쯤 되면 숨길 마음이 있었던 건지 궁금해집니다.~~

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1115459c449be8f1.png)

## 2-3. 만족하지 못한다! 플래시롬 가져와잇~!

OTA에서 얻은 것은 주로 업데이트 대상 파일이었습니다. 부트 과정과 기본 rootfs까지 확인하려면 전체 플래시가 필요했죠. 원래는 SPI NOR를 클립으로 읽을 생각이었는데, 앞서 소개한 [sec1.dk 글](https://sec1.dk/blog/carplay-re-blog.html) 에서 Allwinner FEL(부트ROM의 USB 다운로드 모드)을 이용한 복구 과정을 보고 계획을 바꿨습니다.

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f0828842cb1385c3.png)

바로 분해해주었고 납땜이나 SPI 클립부터 시도하는 것보다, 기기가 지원하는 인터페이스를 먼저 확인했습니다.

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1cafbff4ec62e26c.png)

핀셋을 이용하여 관련 패드를 이용해 모드 전환을 시도했더니 처음에는 예상한 FEL 장치가 아니라 USB ID가 `0525:a4a7` 로 바뀌었습니다. 프로젝트 노트에는 일단 A2A 디버그 모드라고 적어뒀는데, 찾아보니 이 ID는 [Linux 커널 문서](https://docs.kernel.org/usb/gadget_serial.html) 에 나오는 **USB Gadget Serial** 의 CDC ACM 예시에서도 쓰이는 값이더라구요. 그렇다고 실제로 디버그 콘솔까지 열렸다고 볼 증거는 없었습니다. 아무튼 **FEL이 아니라는 건 확실** 했으니 여러 번 다시 시도했습니다. 그제야 `1f3a:efe8` 로 ID가 바뀌고, `xfel` 이 V821을 인식하더라구요.

```
FEL USB enumeration : 1f3a:efe8xfel version         : AWUSBFEX ID=0x00188200 (V821)SPI NOR flash        : 16,777,216 bytes (16 MiB)
```

칩 외관의 `TC397` 표기만 봤을 때는 Infineon AURIX/TriCore를 먼저 떠올렸습니다. 그런데 **USB FEL에서 읽힌 ID와 추출한 커널·실행 파일** 은 Allwinner V821 기반 RISC-V 플랫폼을 가리켰습니다. 외관 마킹만으로 SoC를 판정하면 엉뚱한 데로 갈 뻔했네요. 마킹이 왜 이런지는… 저도 모르겠습니다.

추출한 펌웨어의 무결성을 위해 총 3번이나 추출 후에 각 바이너리를 세 번 읽어 SHA-256이 모두 일치하는 것을 확인한 다음 분석을 진행했습니다. 복원 가능한 원본 이미지가 있으니 그제야 마음이 조금 놓이더라구요. 잘못 수정하면 장치가 부팅 하지 않을 수 있으니까요. 이로써 취약점 분석 및 테스트를 진행할 기반 작업은 모두 진행 되었습니다.

덤프를 `binwalk`, `unsquashfs` 로 분석한 결과는 다음과 같았습니다.

| 플래시 오프셋 | 확인된 구성 요소 |
| --- | --- |
| `0x000000` | 부트 영역(SPL/boot0) |
| `0x060000` | 커널 부트 이미지 |
| `0x370000` | 커널 부트 이미지 사본 |
| `0x680000` | SquashFS `rootfs` |
| `0xB00000` | SquashFS `customer` |
| `0xED0050` 부근 | JFFS2 쓰기 가능 데이터 |

파일시스템 내부에는 Linux 커널 `5.4.220`, BusyBox, musl libc와 함께 장치 부팅 스크립트, Wi-Fi 설정, 웹 서버, 업데이트 유틸리티가 들어 있었습니다. 이 작은 기기 안에서 일반적인 Linux 임베디드 기기를 분석하는 느낌이 나네요. 별거 없을 줄 알았는데 꽤나 알차게 구성되어 있습니다.

참고로 글을 정리하면서 [lvalen91의 C2Air V821 플랫폼 분석 자료](https://github.com/lvalen91/CPC200-CCPA_resources/blob/main/hardware/c2air_v821_spec.md) 도 대조해 봤습니다. 이 자료의 다른 제품은 V821, 16MB SPI NOR, Linux 5.4.220, `rootfs` 0x680000 / `customer` 0xB00000 등 여러 구성이 일치합니다. 계열 간 공통 플랫폼을 생각해 볼 만한 단서지만, 위 오프셋과 SoC 식별은 어디까지나 제가 직접 읽은 플래시와 FEL 결과를 기준으로 적었습니다.

## 3\. Reverse Engineering

펌웨어를 얻었으니 이제 바이너리를 분석하면 될 차례입니다.

하지만 아까 언급했던게 있죠. 네…바이너리는 RISC-V 32비트 ELF입니다. 사전에 분석을 진행한 자료들도 있어서 날먹일줄 알았는데… 그리고 일부 실행 파일을 `qemu-riscv32` 로 실행하면 `Illegal instruction` 이 발생하고, Ghidra에서는 함수 중간중간에 낯선 코드가 나타났습니다.

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/31e03bc8ed913727.png)

예전에야 해당 명령어들을 하나씩 찾아보고 정합성을 잘 맞춰줘야했지만 요즘 시대에 이런건 문제도 아니더라구요.

GPT한테 맡긴 결과, Andes 벤더 확장 명령어가 사용되고 있다는 것을 확인했습니다. Ghidra가 이를 정상적으로 해석하지 못하면 단순히 보기 싫은 의사 코드가 나오는 수준에서 끝나지 않습니다. 문자열 참조가 사라지고, 분기 대상이 끊어지고, 결국 실제로 봐야 할 함수의 flow가 통째로 잘려 나갑니다. 물론, 그렇다고 “다 해놔” 하면 너무 결과론적이기 때문에 문제들을 하나씩 같이 살펴보도록 합시다.

분석 대상 중 `/sbin/update` 의 `.text` 약 14.9%, `index.cgi` 의 약 12.3%가 이러한 커스텀 opcode에 해당했습니다. 이대로라면 중요한 요청 처리 로직을 제대로 따라갈 수 없겠죠.

## 3-1. ADDIGP

Ghidra에서 `index.cgi` 의 문자열을 찾을 수는 있었지만, 정작 그 문자열의 ref는 정상적으로 연결되지 않았습니다. 원인을 추적하니 `custom-0` 계열 명령어가 전역 주소를 계산하는 Andes `ADDIGP` 와 연결됐습니다.

`ADDIGP` 는 Global Pointer(`gp`)를 기준으로 데이터를 참조하는 데 사용됩니다. Ghidra가 이를 모르는 함수 호출처럼 취급하면 `gp` 를 통해 계산하던 주소를 해석하지 못하고, 문자열 XREF도 끊어집니다.

처음에는 관례적인 `gp` 값을 추측했지만, 결과가 몇 바이트씩 틀어졌습니다. 더 골치 아픈 점은 문자열이 빽빽한 영역에서는 틀린 주소도 그럴듯한 문자열처럼 보인다는 것이었습니다. ~~분명 맞는 줄 알고 좋아했는데 다시 보니 아니었어요.~~

그래서 ELF 초기화 코드의 `auipc` / `addi` 조합을 추적해 `gp` 값을 구하고, 실제 데이터 영역에 주소가 들어오는지를 통계적으로 검증했습니다. 그 결과 Ghidra에서 사라진 여러 문자열 참조를 복원할 수 있었습니다.

가령 `index.cgi` 에서는 `gp=0x17800` 을 기준으로 다시 계산했을 때, ADDIGP 후보 **510곳 중 418곳(약 82%)** 이 실제 문자열의 시작 위치에 딱 들어맞았습니다. `.sdata + 0x800` 만 믿고 대충 계산했을 때와 달리, 이제 `index.cgi` 가 어떤 문자열을 참조하는지 추적할 수 있게 된 겁니다.

## 3-2. BEQC/BNEC

이번에는 `rcpservice` 의 명령 디스패처가 문제였습니다. RISC-V 표준 명령처럼 읽어 보면 이해할 수 없는 분기가 연속으로 나오는데, 주변 코드를 보니 명령 ID에 따라 핸들러를 고르는 switch 구조였습니다.

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bd7a38a2dd2e5f4b.png)

여기서 결정적 단서는 비교값으로 등장한 숫자들이었습니다.

```
1, 2, 3, 5, 11, 12, 13, 16
```

레지스터 번호처럼 보였던 필드가 알고 보니 각각의 명령 코드였던 것입니다. 명령어 비트 `[24:20]` 을 비교용 즉값(`cimm`)으로 다시 해석하고, 분기 오프셋은 표준 RISC-V B-type 형식을 적용하자 여덟 갈래가 서로 다른 유효한 핸들러 시작 주소로 이어졌습니다.

```
custom-2 / funct3=5 -> BEQC (레지스터 == 상수이면 분기)custom-2 / funct3=7 -> BNEC (레지스터 != 상수이면 분기)비교 즉값: instruction[24:20]분기 변위: RISC-V B-type immediate
```

분기 변위를 여러 방식으로 해석해 보니 표준 B-type 변위에서 **97.5%** 가 유효한 명령어 시작점에 떨어졌습니다. 다른 후보는 60~75%, 단순 짝수 주소 기준선은 63.9%였으니 차이가 꽤 컸습니다. 특히 `rcpservice` 의 명령 8개는 각각 **서로 다른 8개 핸들러 시작 주소** 로 정확하게 이어졌습니다. 예를 들면 `beqc s10, 1` 은 `0x1c5c0`, `beqc s10, 11` 은 `0x1c608` 로 가는 식입니다. 이쯤 되니 해독 방향을 확신할 수 있었습니다.

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1e4cc721d4d34e71.png)

Ghidra에 넣을 때는 원본 실행 파일이 아닌 분석용 사본에서 해당 분기를 표준 `beq` 명령으로 바꾸어 제어 흐름 그래프(CFG)를 복원했는데 여기에는 중요한 제한이 있습니다. 분기 목적지는 유지했지만 비교 조건의 의미까지 완벽히 보존한 것은 아닙니다. 따라서 이렇게 얻은 의사 코드는 핸들러 구조를 따라가기 위한 참고 자료이고, 세부 조건 판정은 원본 명령어와 대조해야 합니다.

이런 식으로 Android Auto 동글을 분석하다가 RISC-V 명령어 인코딩을 복원하고 있으니 조금 힘들었습니다…ㅠㅠ

## 3-3. 런타임 바이너리 추출

부팅 스크립트 `lyLink.sh` 를 따라가다 보니 일부 서비스가 일반적인 파일 형태로 놓여 있지 않았습니다. `lylink` 라는 벤더 컨테이너를 `lypack` 으로 풀어 `/tmp/app` 에 배치한 뒤 서비스를 실행하는 구조였기 때문입니다.

```
init / rcS   └── lyLink.sh         ├── lypack으로 lylink 해제 -> /tmp/app/         ├── CarPlay 경로: rcpservice, lylinkapp, mdnsd ...         └── Android Auto 경로: raaservice, mtpservice ...
```

정적 파일만 보고 있으면 실제 분석해야 할 바이너리 일부를 놓치게 되는 셈입니다. 게다가 `lypack` 자체도 Andes 명령어를 사용하니 일반 `qemu-riscv32` 에서는 실행할 수 없었습니다. 포맷을 처음부터 다 분석해야 하나 고민했는데, 굳이 그럴 필요는 없겠더라구요. 실제 기기는 부팅 과정에서 이미 그 파일을 풀어서 사용하고 있으니까요!

그래서 다시 선행 연구에서 힌트를 얻었습니다. sec1.dk는 `customer` 의 부팅 스크립트를 수정하고 복구 인터페이스로 재플래시해 분석용 root 셸을 만들었습니다. 저는 그 방식의 핵심 아이디어인 ‘전체 플래시 백업 → customer 영역의 연구용 수정 → FEL로 기록·읽기 검증’을 참고하되, 제 기기 환경에 맞게 진단용 CGI를 추가하는 방식을 사용했습니다. 원래 BusyBox에 `telnetd` 나 `nc` 가 준비되어 있지 않아 같은 명령을 그대로 따라 할 수 없었기 때문입니다.

이렇게 물리 FEL 접근과 백업을 이용해 연구용으로 수정한 이미지를 준비하고, 해당 환경에서 `uid=0(root)` 인 분석 셸을 확보했습니다. 이후에는 장치가 실제로 `/tmp/app` 에 풀어 놓은 바이너리를 회수하면 됐습니다. 아카이브 포맷을 통째로 리버싱해야 할 뻔한 난관을 런타임 관찰로 우회한 셈입니다.

여기서 확보한 `rcpservice`, `librcarplay.so`, `libriap2.so` 등의 파일 덕분에 실제 CarPlay 관련 네트워크 서비스와 파서를 더 자세히 볼 수 있었습니다.

## 4\. 마무리

분명 시작은 “3만원짜리 동글 하나 까보자”였는데, USB에 꽂으니 아이폰이 나오고, 펌웨어를 받으니 헤더가 안 보이고, Ghidra는 `custom2` 만 잔뜩 보여주더라구요.

그래도 OTA에서 펌웨어를 구하고, FEL로 플래시를 읽고, Andes 명령어 때문에 막히던 부분도 어찌저찌 넘어왔습니다. 부팅하면서 `/tmp/app` 에 풀리는 바이너리까지 가져왔으니, 이제 분석할 재료는 다 모였네요.

그럼 다음 Part 2에서는 뭘 하냐구요? 애초에 이 동글을 산 이유가 취약점이 있을까 싶어서였죠. **이제 본격적으로 취약점 분석을 해볼 차례입니다.** 동글의 Wi-Fi와 웹 API부터 `index.cgi` 의 업로드 처리, `/sbin/update` 와 SWUpdate의 펌웨어 업데이트 과정까지 하나씩 살펴볼 생각입니다. 실제로 어디까지 가능했고 어디에서 막혔는지도 같이 다뤄보겠습니다. ~~드디어 메인 디쉬입니다. 맛은 봐야겠죠?~~

참고로 이번 Part 1에서 확보한 root 셸은 제가 직접 기기를 뜯고 펌웨어를 수정해서 만든 분석 환경입니다. 원격에서 뚫었다는 이야기는 아니에요. 그건 그거대로 나눠서 봐야겠죠.

처음에는 가볍게 시작한 프로젝트였는데 생각보다 볼 게 많아서 결국 Part 2까지 이어지게 됐네요. 여기까지 읽어주셔서 감사합니다! 다음 글에서 뵙겠습니다!
