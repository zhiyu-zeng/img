---
title: "[Research] Unlocking BitLocker: 암호화 안깨고 취약점 찾는 방법 - Part 2 (KR)"
source: https://hackyboiz.github.io/2026/10/29/banda/Unlocking-Bitlocker/KR/
source_host: hackyboiz.github.io
clip_date: 2026-10-31T03:35:54+08:00
trace_id: 30381828-2b95-4eea-ac2b-c23e5bcd4099
content_hash: 52945fedb7f5ce0905ddc5f1c205c8b71c3ca2a01bceb1f2822c00c073873873
status: synced
tags:
  - 漏洞分析
  - BitLocker
series: null
feed_source: hackyboiz·Android/Windows/macOS漏洞
ai_summary: BitLocker 研究不应硬破 XTS-AES，而是攻击密钥解锁与 relock 之间的信任边界：作者复现 CVE-2026-45585，用 USB 上的伪 FsTx 事务记录诱导 WinRE 回滚删除 winpeshl.ini，绕过 relock 直接读写已加密的 OS 卷。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 40975244-d011-819b-bf6e-c6f0f5726ddb
ioc:
  cves:
    - CVE-2026-45585
  cwes: []
  hashes:
    - 95f62703b343f111a92a005056975458
    - 98f62703b343f111a92a005056975458
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> BitLocker 研究不应硬破 XTS-AES，而是攻击密钥解锁与 relock 之间的信任边界：作者复现 CVE-2026-45585，用 USB 上的伪 FsTx 事务记录诱导 WinRE 回滚删除 winpeshl.ini，绕过 relock 直接读写已加密的 OS 卷。
> 
> - **攻击思路：** 现代对称密码本身不可破，应审计"TPM 在什么条件下交出密钥、解锁状态传递到哪个进程、relock 是否真正执行"，此类问题属于 Security Feature Bypass。
> - **状态区分：** Encrypted（数据是密文）与 Locked（当前环境拿不到解密密钥）是两回事；TPM-only + PCR[7] 环境下，可信 WinRE 启动会 auto-unlock OS 卷，解锁后到 RecEnv.exe 调用 RelockVolumes() 之前存在暴露窗口。
> - **两类历史漏洞模式：** 一是 boot.sdi/winre.wim 装入同一 RAM buffer 时，WIM 哈希校验对象与 SdiTrust→WimOffset 实际启动镜像可能不一致；二是 Online PBR 误将 Recovery 分区识别为 target OS，无验证地读取其 ResetSession.xml 中的 DecryptVolumes 配置即可解除 OS 卷保护。
> - **CVE-2026-45585 利用链：** USB 放置 System Volume Information\FsTx 伪记录（未 commit 的硬链接创建事务）→ autofstx.exe 仅凭盘符根目录和 FsTx 目录存在即纳为恢复候选 → FsTx.dll 回滚 op==5 时对 LinkPath 无跨卷/归属校验，POSIX 删除 X:\Windows\System32\winpeshl.ini。
> - **绕过结果：** winpeshl.ini 缺失后 winpeshl.exe 回退执行 cmd.exe /K startnet.cmd，relock 路径完全未触达，WinRE 会话中可向 OS 卷写入 proof 文件验证访问；复现环境为 Windows 11 Pro 24H2 + TPM/Secure Boot，密钥保护器为 TPM+恢复密码。

Part 1: [https://hackyboiz.github.io/2026/01/22/banda/BitLocker_part1/ko/](https://hackyboiz.github.io/2026/01/22/banda/BitLocker_part1/ko/)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/058932519aab77d7.png)

## 0\. Overview

안녕하세요! 동상이몽 팀으로 찾아온 banda입니다. 조금 오래 전이긴 한데, 제가 작성했던 BitLocker 연구글을 기억하시나요? 저는 그동안 도를 닦느라 잠시 잊고있었던 BitLocker를 다시 한번 파보기로 했습니다

지난 Part 1에서는 BitLocker가 사용하는 XTS-AES의 특징과, 암호문 무결성 부재를 이용해 시스템 동작을 실패시키는 매커니즘을 활용한 CrashXTS를 살펴봤어요. CrashXTS에서 공격자는 암호화된 디스크에 원하는 평문을 써넣을 수는 없었어요. 대신 특정 암호문 블록을 변조해 대응하는 평문 블록을 예측 불가능하게 손상시킬 수 있었습니다.

다만 앞선 사례처럼 AES 암호화된 데이터를 직접 해독하는건 매우 어렵기 때문에, 앞으로는 암호 알고리즘보다 키가 해제되고 사용되는 과정에 집중해봅시다! 긴 시간 끝에 돌아온 이번 글에서는 WinRE와 Boot Manager의 신뢰 관계에서 발생하는 흥미로운 취약점들을 살펴보겠습니다.

## 1\. WinRE는 왜 BitLocker의 공격 표면이 되었을까

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/918db2f1d1643f68.png)

이전에 BitLocker을 사용해본 적이 있다면 아마 익숙한 창일 것 같은데요. 지난 파트 내용을 복습해보면 BitLocker는 특정 선택한 드라이브를 암호화하는 기능이고, 부팅할 때 TPM/PIN/복구 키 같은 조건을 확인해 통과하면 Windows가 디스크를 읽게 해주는 기능입니다. 이때 섹터 데이터는 FVEK로 암호화되고, FVEK를 보호하는 VMK를 얻는 경로는 TPM, TPM+PIN, 복구 암호 등의 보호기로 정해집니다.

물론 암호화 알고리즘의 관점으로 접근해볼 수도 있겠지만, BitLocker에서 현대 AES 자체를 깨는건 현대 대칭키 암호의 전제를 흔드는 것일 수 있습니다.🤯 (성공하시면 비트로커 취약점 제보를 하시면 안되고 암호학 역사를 쓰러 가셔야 합니다..)

따라서 저희가 이번에 취약점 분석 관점으로 볼 것은 정상적으로 풀린 키가 어디까지 전달되고 언제 회수되는지 경계를 확인하는 것입니다.

이후 자세히 설명하겠지만, 부팅과 복구 과정은 단순히 부팅매니저나 EFI 로드만으로는 설명되지 않는게 많습니다. 그 점에서 더 흥미로운 표면이라고 볼 수 있는데요. 부팅 과정에서도 부팅 대상을 선택하거나, 복구 작업에 분기하거나, OS volume 접근 허용하거나, 보안 결정이나 정책을 설정하는 등 다양한 작업이 수행됩니다.

흥미로운 점은 보통 일반 OS에서 버그헌팅을 할 때는 로그인한 사용자와 실행 중인 프로세스를 기준으로 권한을 추적하는데, WinRE나 부팅 초기 단계에서는 일반 사용자 로그인 세션이 아직 시작도 되지 않은 상태라는 것이죠.😱 그러면 권한 경계를 안보면 도대체 뭘 봐야 할까 좀 난처하기도 한데요. 부팅 과정에서는 이제 ‘누가 실행했는가?’라는 질문을 던지기보다는 아래와 같은 조건을 중점으로 확인해봐야 합니다.

-   TPM이 어떤 조건에서 BitLocker 키를 제공했는가
-   어떤 부팅/복구 코드가 실행 대상으로 선택됐는가
-   그 코드가 어떤 설정/로그/매개변수를 신뢰하고 처리하는가
-   OS volume이 열린 상태가 어느 프로세스까지 전달되는가
-   복구 작업이 끝나거나 대화형 도구로 넘어갈 때 relock이 실제로 수행되는가

이번에 알아볼 문제들은 이렇게 정상적으로 허용된 접근이 의도한 범위를 벗어나는 Security Feature Bypass 유형에 가깝습니다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f945975717f7a779.png)

그렇다면 실제로 OS volume 접근이 어디까지 이어졌는지를 어떻게 판단할 수 있을까요? 먼저 BitLocker에서 말하는 암호화 상태와 접근 상태를 나눠서 봐야 합니다. 혹시 BitLocker에서 Locked/Unlocked 상태와 Encrypted/Decrypted 상태가 서로 다르다는 것을 아시나요?

-   **Encrypted**: 디스크의 데이터가 암호문으로 저장되어 있는 상태. 즉, 디스크에 데이터가 어떤 형태로 저장되어 있는가에 대한 상태.
-   **Locked**: 디스크는 그대로 암호화되어 있지만, 현재 환경에서는 복호화 키를 사용할 수 없어 파일에 접근할 수 없는 상태. 즉, 현재 환경에서 그 데이터를 읽을 키를 사용할 수 있는가에 대한 상태.

즉, 암호화된 OS volume에서도 정상 부팅이나 신뢰된 복구 작업 중에는 Unlocked 상태가 될 수 있습니다. 반대로 relock은 디스크를 다시 암호화하는 과정이 아니라, 현재 환경에서 BitLocker 키를 사용할 수 없게 만들어 OS volume 접근을 다시 막는 동작입니다. 그래서 `Protection On` 과 `Lock Status: Unlocked` 가 함께 표시되어도 딱히 이상하지 않다고 할 수 있겠죠.

## 2\. WinRE는 별도의 신뢰 경계

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c99edadaa4013b7a.png)

WinRE(Windows Recovery Environment)는 시작 복구, 시스템 초기화, 업데이트 제거, 명령 프롬프트, Defender 오프라인 검사 등을 수행할 수 있도록 동작하는 부팅 과정에서의 Pre-OS라고 볼 수 있습니다. WinRE는 평소에 계속 열리는건 아니고, 별도의 복구 이미지로 부팅합니다. 중요한 것은 Windows에 문제가 생겼거나 BitLocker OS volume을 바로 읽지 못하는 상황에서 이 복구 도구는 정상적으로 시작되어야 하므로, WinRE는 OS volume과 분리된 Recovery OS로 구성된다는 점입니다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/54f81f427942824b.png)

이 Recovery OS의 실행 파일/DLL/드라이버와 복구 도구는 보통 `winre.wim` 이라는 압축 이미지에 들어가 있습니다. `winre.wim` 은 WinPE 기반의 Recovery OS의 실행 파일, DLL, 드라이버, 복구 도구가 압축된 WIM 이미지입니다. 일반적인 UEFI 시스템에서는 EFI System Partition의 `bootmgfw.efi` 가 Windows Boot Manager로 실행되고, 같은 영역의 BCD를 읽어 일반 Winows 대신 어떤 복구 경로로 부팅을 할지를 결정합니다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c3758ff12d568af9.png)

이후 BCD가 WinRE RAM disk 부팅을 선택하면, 복구 파티션에 있는 `boot.sdi` 와 `winre.wim` 이 사용됩니다.

-   **`boot.sdi`**: RAM에 가상 NTFS 디스크의 기본 구조를 만들기 위한 SDI 이미지
-   **`winre.wim`**: 그 RAM 디스크 위에 풀려 `R:` 드라이브 환경(스크린샷의 경우)에서 실제 Recovery OS를 구성하는 압축 이미지

즉, `bootmgfw.efi` 와 BCD가 일반 Windows와 WinRE 중 어느 경로와 이미지를 사용할지 **진입 경로를 결정** 하는 역할을 한다면, 이후 로드되는 `boot.sdi` 와 `winre.wim` 은 선택된 WinRE 환경에서 실질적인 디스크 구조와 운영 도구를 제공하는 역할을 담당합니다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cf58c80d91065445.png)

WinRE가 `R:`에서 시작된 뒤에도 입력 처리는 계속됩니다. SYSTEM hive와 Boot Execute가 초기 실행을 정하고, `winpeshl.ini`, `startnet.cmd`, `wpeinit.exe` 가 WinPE shell을 구성합니다. 그리고 이후 `ReAgent.xml`, offline OS 정보, 복구 로그, 작업별 설정이 어떤 OS를 대상으로 어떤 recovery task와 process를 실행할지 결정합니다.

즉 WinRE 연구에서 표면을 분석해본다면, 어떤 entry가 이 image를 시작했는지, 초기화 코드가 어떤 volume과 driver를 준비했는지, shell과 recovery task가 어떤 설정을 바탕으로 다음 process와 FVE 상태를 바꾸는지 단계별로 따라가보는 것이 좋겠죠?

이러한 시야를 바탕으로, Case Study에 들어가기 전 기존에 WinRE boot, recovery flow에서 실제로 나타났던 로직 버그를 두 가지 유형으로 살펴보겠습니다.

## 3.1 Boot / Recovery Object Binding Failure

> *Trusted WIM and Target-Volume Binding Failures*

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/03398881c2d08254.png)

WinRE로 부팅 과정에서 기본적으로 Boot Manager는 BCD가 준 ramdisk device와 path를 따라 `boot.sdi` 와 `winre.wim` 을 찾는다고 했죠. Trusted WIM Boot는 선택된 WIM의 무결성을 확인하고, 이어 WinRE가 그 이미지에서 시작될 것을 전제로 BitLocker OS volume 접근을 허용합니다.

BCD가 복구 경로를 결정한 뒤에는 Boot Manager가 다음과 같이 `boot.sdi` 와 `winre.wim` 을 하나의 RAM-disk buffer에 배치합니다.

```jsx
RamDiskImageBuffer = AllocateMemory(SdiSize + WimSize);LoadFileToBuffer(SdiPath, RamDiskImageBuffer, SdiSize, NULL);LoadFileToBuffer(    WimPath,    Add2Ptr(RamDiskImageBuffer, SdiSize),    WimSize,    WimHash);WimAddress = RamDiskImageBuffer + SdiTrust->WimOffset;
```

이 흐름에서 WIM A는 `RamDiskImageBuffer + SdiSize` 에 읽히고, WimHash는 바로 그 WIM A에 대해 계산됩니다. 반면 실제 WinRE 시작 주소는 `SdiTrust→WimOffset` 으로 결정되는데요. 정상적인 경우에는 `SdiTrust→WimOffset` 이 WIM A의 실제 시작 offset인 `SdiSize` 와 같았어야 합니다.

그런데 이 경로에 대한 검증 체크가 없다면 어떻게 될까요? WimHash는 WIM A를 검증했는데, `SdiTrust→WimOffset` 은 buffer 안의 다른 WIM B를 가리킬 수 있게 되는 취약점이 발생할 수 있습니다. 즉, 검증한 recovery 이미지와 실제로 WinRE를 구성한 복구 이미지가 불일치할 수 있게 되는 취약점이 발생할 수 있었습니다.

비슷한 다른 사례를 확인해볼까요? Online PBR의 target-volume confusion 취약점이 있습니다. WinRE가 부팅된 뒤의 시점을 다루는데요. WinRE가 부팅된 후 Online PBR이 target OS를 찾는 단계에서 발생하는 취약점입니다. PBR은 BCD의 osdevice로 target volume을 찾고 그곳의 ResetSession.xml이라는 설정 파일을 읽으면서 파싱하는데, Recovery partition을 target OS로 잘못 식별하면 Recovery partition의 설정을 PBR 작업에 사용할 수 있었습니다.

```jsx
<WindowsRE version="2.0">  <WinreBCD id="{WinRE-BCD-GUID}" />  <WinreLocation      path="\\Recovery\\WindowsRE"      id="0"      offset="..."      guid="{RECOVERY-PARTITION-GUID}" />  <ImageLocation path="" id="0" offset="0" guid="{...}" />  <PBRImageLocation path="" id="0" offset="0" guid="{...}" index="0" /></WindowsRE>
```

```jsx
<Operation OperationType="DecryptVolumes" TargetVolume="C:\" />
```

핵심 문제는 Recovery partition에서 읽은 설정이 실제 target OS의 설정인지 검증을 안했다는 것인데요. 설정의 `DecryptVolumes` 가 BitLocker로 보호된 OS volume을 지정하면, PBR은 이걸 아무런 제약 없이 정상적인 복구 작업으로 처리해버릴 수 있었습니다. 이게 왜 문제가 되냐면 사용자가 recovery key를 입력하거나 BitLocker 보호를 해제하지도 않았는데도 PBR의 복호화 권한을 이용해 OS volume 보호를 제거해버릴 수도 있다는 것이죠.😱 강력한 취약점이었습니다.

즉, 두 패턴이 시사하는 바는 검증한 wim/선택한 wim/열려는 OS volume이 부팅 전환 내내 같은 대상을 가리키는지, 일관성을 유지하는지를 유의깊게 보라는 의미겠죠?

## 3.2 Recovery Access Scope Bypass

> *Recovery Access Scope Bypass*

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/267dd7ac213a2b64.png)

부팅 과정에서는 Offline Scan처럼 OS volume을 읽어야 하는 작업도 존재합니다. Offline Scan은 기본적으로 OS volume을 검사해야 하기 때문에 WinRE가 BitLocker volume을 auto-unlock한 상태에서 실행됩니다.

예를들어 공개된 사례에서는 `ReAgent.xml` 의 Offline Scan 설정을 통해 신뢰된 검사 도구가 의도하지 않은 child process를 실행할 수 있었던 취약한 경로가 다뤄진 적이 있습니다. 중요한 부분은 검사 도구 자체가 신뢰된 프로그램이더가도, 그 도구가 만드는 다음 프로세스까지 같은 수준으로 허용해도 되는지를 딱히 검증을 하지 않은게 문제가 되었죠.

보통 `cmd.exe` 같은 위험한 도구를 열면 먼저 relock을 해서 recovery key 없이는 OS volume이 못 읽어야 하는데, 위 취약점을 이용하면 Offline Scaner가 허용한 `tttracer.exe` 가 인자로 `cmd.exe` 를 받아올 수 있었고, relock이 열려있었기 때문에 `cmd.exe` 가 이미 열려 있던 OS volume이 그대로 노출될 수가 있었습니다.

따라서 부팅 과정에서 예약된 도구가 어떤 configuration을 읽는지, child process를 만들 수 있는지, 작업이 끝나기 전에 relock이 실행되는지를 모두 따라가보는 것도 연구 관점에서 중요하겠죠?

정리하면, 두 WinRE 유형의 구현은 다르지만, 공통 질문은 같았습니다.

> 각 단계가 신뢰 조건에 따라 선택하거나 허용한 접근 범위가, 다음 단계 설정 해석, process 실행, relock까지 의도한 범위 내로 유지되는가?

여기서 대상은 recovery image, target OS volume, 실행할 process가 될 수 있고, 접근 범위는 BitLocker OS volume의 unlock 상태와 re-lock 시점이 됩니다.

그러면 이제 이 질문을 제가 실습한 두 흐름에 대입해보겠습니다.

## 4\. CVE-2026-45585

이제 앞에서 정리한 WinRE recovery input과 access scope 문제를 하나의 실행 chain으로 따라가볼 차례가 되었습니다.. 이 Case Study는 공개된 CVE-2026-45585의 FsTx recovery 경로를 대상으로 합니다.

### 4.1 핵심 구조와 연구 질문

이 흐름 출발점은 WinRE 구성요소인 `autofstx.exe` 나 `Fstx.dll` 을 기점으로, 부팅 중 WinRE 초기화를 하는 시점에서 FsTx artifact가 복구 data로 처리될 때, 그 결과가 BitLocker OS volume 접근 경계까지 이어질 수 있는지 확장해보는 것입니다. 우리가 이번에 제어할 입력값은 USB volume의 FsTx record입니다.

```jsx
USB: System Volume Information\FsTx→ WinRE BootExecute: autofstx.exe→ FsTx.dll: in-doubt transaction rollback→ X:\Windows\System32\winpeshl.ini 삭제→ winpeshl.exe: cmd.exe /K startnet.cmd fallback→ RecEnv.exe / RelockVolumes() 이전의 OS volume 접근
```

살짝 스포를 해보자면 FsTx record를 rollback 작업으로 처리하는 과정에서 record 안의 LinkPath가 `X:\Windows\System32\winpeshl.ini` 에 가리켜지면, rollback 결과가 현재 실행 중인 WinRE의 `RecEnv.exe` 를 찾지 못하고, 대신 `cmd.exe /K startnet.cmd` fallback을 실행하게 되는데요. 왜 이런 Security Feature Bypass가 발생하게 되었는지 한번 확인해봅시다!

### 4.2 실험 조건과 기준 상태

> Windows 11 Pro 24H2 VM  
> TPM enabled/ready, Secure Boot enabled  
> WinRE enabled  
> BitLocker OS 볼륨 C: 활성 상태

재현 환경은 TPM과 Secure Boot가 켜진 Windows 11 Pro 24H2 VM이며, WinRE와 BitLocker OS volume을 활성화한 상태였습니다. 키 보호기는 TPM과 Recovery Password를 함께 사용했습니다.

```powershell
PS C:\> manage-bde -status C:Volume C: [OS Volume]    Size:                 63.00 GB    BitLocker Version:    2.0    Conversion Status:    Fully Encrypted    Percentage Encrypted: 100.0%    Encryption Method:    XTS-AES 128    Protection Status:    Protection On    Lock Status:          Unlocked    Key Protectors:        TPM        Numerical PasswordPS C:\> manage-bde -protectors -get C:Volume C: [OS Volume]    TPM:      ID: {<TPM-PROTECTOR-GUID>}      PCR Validation Profile:        7, 11            Numerical Password:      ID: {<RECOVERY-PROTECTOR-GUID>}PS C:\> reagentc /infoWindows Recovery Environment (Windows RE)and system reset configuration    Windows RE status:    Enabled    Windows RE location:  \\?\GLOBALROOT\device\                           harddisk0\partition<RECOVERY>\Recovery\WindowsRE    BCD identifier:       {<WINRE-BCD-GUID>}
```

이런 식으로 상태를 세팅해주면 되는데요. 여기서 헷갈리실 수 있는 부분은 정상 Windows로 부팅된 상태에서 `잠금 상태: 잠금 해제됨` 은 OS가 자기 볼륨을 사용 중이라는 뜻이지, BitLocker 보호가 꺼졌다는 뜻은 아닙니다.

재현 확인용으로는 OS 볼륨에 marker 파일을 만들어 두었습니다.

```powershell
mkdir C:\yk_labecho YK_MARKER > C:\yk_lab\marker.txt
```

또한 `HKLM\SOFTWARE\Microsoft\RecoveryEnvironment\FailRelock` 값이 없는 상태를 확인했습니다.

Microsoft 문서 기준으로 `PCR[7]` 지원 장치 조건을 만족하는 TPM-only 환경에서는, 신뢰된 WinRE로 시작될 때 BitLocker OS volume이 auto-unlock될 수 있었습니다. 그렇다면 auto-unlock된 OS volume은 `RecEnv.exe` 의 relock 전까지 어떤 실행 경로에 노출되었을까요?

### 4.3 정상 흐름과 relock 경로 (이 FsTx 흐름이 우회하는 지점)

기본적으로 신뢰된 WinRE가 초기화가 시작되면, 정상 흐름에서는 `winpeshl.exe` 가 `winpeshl.ini` 를 읽고 `RecEnv.exe` 를 실행합니다. `RecEnv.exe` 는 복구 UI를 띄우기 전에 `RelockVolume()` 를 호출합니다.

```cpp
CImmersiveRecoveryUi::Run  └─ CRecoveryEnvironment::RelockVolumes      └─ CFveUtil::RelockAllVolumes          └─ CFveUtil::RelockVolume
```

`CImmersiveRecoveryUi::Run` 은 복구 UI 엔트리이자 relock 트리거입니다. UI를 그리기 전에 `CRecoveryEnvironment::RelockVolumes` 를 호출하고, 실패하면 `"Failed to relock volumes. 0x%08x Shutting down."` 로그를 남기고 종료합니다.

```cpp
// CImmersiveRecoveryUi::Run 요약if (!relockHandled) {    HRESULT hr = CRecoveryEnvironment::RelockVolumes(*this);    if (FAILED(hr)) {        WdsSetupLogMessageW(..., "Failed to relock volumes. 0x%08x  Shutting down.", hr);        goto shutdown;    }    CRecoveryEnvironment::UnlockVolumes(*this, 0);    relockHandled = 1;}
```

`RelockVolumes` 내부 dispatcher인 `CFveUtil::RelockAllVolumes` 는 `FindFirstVolumeW` / `FindNextVolumeW` 로 volume을 순회하고, 각 volume에 `CFveUtil::RelockVolume` 을 호출합니다.

```cpp
// CFveUtil::RelockAllVolumes 요약while (FindNextVolume(...)) {    if (Utils::GetDriveLetterForVolumeMountPoint(szVolumeName, letter, MAX_PATH))        continue;    if (!CFveUtil::RelockVolume(this, letter))        break;}return 31; // relock failed
```

정상 경로는 아래와 같습니다.

```
winpeshl.exe → winpeshl.ini → RecEnv.exe → RelockVolumes() → recovery UI
```

이 Case Study에서는 `RelockVolume()` 자체를 변조하거나 실패시키지 않습니다. 다만 `winpeshl.ini` 가 없어졌을 때 `winpeshl.exe` 가 `RecEnv.exe` 대신 fallback shell을 선택한다면, 결국 위 relock path에는 도달하지 못합니다.

### 4.4 FsTx artifact와 root cause

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/455494e478567c35.png)

앞에서 계속 언급되었던 FsTx가 뭔지 많이 궁금하셨을 텐데요. FsTx는 TxF(Transactional NTFS)는 여러 파일 작업을 하나의 transaction으로 묶어 처리하는 NTFS 기능입니다. 예를들어 파일을 만들고, 이름을 바꾸고, 다른 위치에 하드링크를 추가하는 작업을 묶음으로 시작할 수 있습니다. 묶음 작업이 모두 끝나면 commit되어 변경 사항이 남고, **중간에 전원이 꺼지거나 오류가 나면 commit되지 않은 작업이 rollback되어 이전 상태로 돌아가는 특징을 가지고 있습니다.**

이때 FsTx metadata는 바로 이 rollback에 필요한 기록입니다. 어떤 파일 작업이 시작되었는지, 어떤 경로를 만들거나 지우려고 했는지 같은 정보가 volume의 `System Volume Information\FsTx` 아래 로그에 남습니다. 그리고 WinRE의 `autofstx.exe` 와 `FsTx.dll` 이 이 기록을 읽고, 파일 시스템을 transaction 이전 상태로 되돌리기 위해 기록된 작업을 처리하기 시작합니다.

이번 실습에서는 USB에 executable을 두지 않고 FsTx artifact만 배치했습니다.

```
FsTx\└─ 95F62703B343F111A92A005056975458\   ├─ FsTxLogs\   │  ├─ FsTxKtmLog.blf   │  ├─ FsTxKtmLogContainer00000000000000000001   │  ├─ FsTxKtmLogContainer00000000000000000002   │  ├─ FsTxLog.blf   │  ├─ FsTxLogContainer00000000000000000001   │  └─ FsTxLogContainer00000000000000000002   └─ FsTxTemp\      └─ 98F62703B343F111A92A005056975458
```

root cause는 두 단계가 이어지는 데 있습니다. `autofstx.exe` 가 외부 volume을 FsTx recovery candidate로 넣고, `FsTx.dll` 이 rollback record의 absolute path를 처리합니다.

이 실습에서 USB에 FsTx artifact만 배치한 이유는, WinRE가 이를 정상 복구 log로 찾아 transaction record에 남은 파일 작업을 rollback하는지를 보기 위해서입니다. 이때 record가 가리키는 `LinkPath` 가 `X:\Windows\System32\winpeshl.ini` 이면, rollback 결과는 해당 파일의 삭제로 이어집니다.

```jsx
TargetPath(원본 데이터) = \??\C:\Windows\win.iniLinkPath(새로 만들 링크) = \??\X:\Windows\System32\winpeshl.ini
```

`win.ini` 를 원본으로 삼아 `winpeshl.ini` 라는 새 hardlink를 만드는 작업입니다. 가장 중요한 특이점은 취약점 트리거를 위해 이 **생성 작업을 commit 하지 않은 채로 로그만 남겨놓아야 한다** 는 것입니다.

FsTx 루틴을 생각해보면, 완료되지 않은 상태로 저장된 transaction을 WinRE가 발견하면, commit되지 않았으므로 파일시스템 일관성을 위해 rollback할 것입니다. hardlink 생성을 되돌리기 위해 새 link를 삭제하는 흐름이죠.

```jsx
File = DoCreateFile(..., LinkPath /* = X:\...\winpeshl.ini */, ...);dispositionFlags = 0x11;   // DELETE | POSIXSetFileInformationByHandle(File);   // → LinkPath를 그냥 지운다
```

실제 rollback 코드는 다음과 같았습니다. 내용은 **`LinkPath` 자리에 있는 파일을 삭제하라** 는 뜻입니다.

여기서 확인할 부분은 이 link가 실제로 해당 transaction이 만든 것인지 검증하는 과정이 보이지 않는다는 점입니다. 그래서 그냥 통과할 수 있었던 것이죠. `winpeshl.ini` 는 원래 `winre.wim` 에 들어 있던 파일로 transaction과 무관하지만, rollback 로직은 `LinkPath` 에 있는 파일을 삭제 대상으로 처리합니다.

#### autofstx.exe가 FsTx 트랜잭션을 재생하는 과정

`autofstx.exe` 26100.1(제가 재현했던 OS 버전)을 PDB와 함께 보면 흐름은 다음과 같습니다.

```
main  → AutoFsTxSession::Init      → LdrLoadDll("FsTx.dll")  → AutoFsTxSession::RunSession      → VolumeContext::FindFsTxVolumes      → FsTxSessionSet::ScanSessions      → FsTxCreateRecoverySession      → FsTxEnumTransactions      → FsTxPerformRecovery
```

`autofstx.exe` 는 FsTx log를 직접 rollback하지 않습니다. 먼저 어느 volume에 `System Volume Information\FsTx` 가 있는지 찾아 recovery 대상으로 넘기고, 실제 log 해석과 rollback은 동적으로 로드한 `FsTx.dll` 에 맡깁니다.

따라서 이 흐름에서는 `autofstx.exe` 의 volume 선택과 `FsTx.dll` 의 `LinkPath` 처리, 두 지점을 함께 볼겁니다. 전자가 USB FsTx artifact를 WinRE recovery code에 전달하고, 후자가 record에 적힌 `X:\Windows\System32\winpeshl.ini` 를 삭제하기 때문이죠.

`VolumeContext::FindFsTxVolumes` 는 `FindFirstVolumeW` / `FindNextVolumeW` 로 volume GUID namespace를 열거하고, mount path 중 `A:\` ~ `Z:\` 형태의 드라이브 문자 root를 찾은 뒤, 해당 volume에 `System Volume Information\FsTx` directory가 있으면 recovery 후보로 넣습니다.

```cpp
// VolumeContext::FindFsTxVolumes 요약GetVolumePathNamesForVolumeNameW(volumeGuid, mountPaths, ...);for (WCHAR *i = mountPaths; *i; i += wcslen(i) + 1) {    if (wcslen(i) == 3 && i[1] == L':' && i[2] == L'\\') {        driveLetter = *i;        break;    }}if (!driveLetter) continue;wcscat_s(path, MAX_PATH, L"System Volume Information\\FsTx");DWORD attrs = GetFileAttributesW(path);if (attrs == INVALID_FILE_ATTRIBUTES || !(attrs & FILE_ATTRIBUTE_DIRECTORY))    continue;candidates.push_back(volume);
```

즉 이 함수는 드라이브 문자와 `System Volume Information\FsTx` directory의 존재를 기준으로 recovery 대상을 고릅니다. 외부 USB가 같은 구조를 가지면 recovery 후보에 들어가고, 이후 `AutoFsTxSession::RunSession` 은 해당 volume의 session을 찾아 `FsTxPerformRecovery(handle, 0, 60000)` 으로 replay를 시작합니다.

```cpp
// AutoFsTxSession::RunSession 내부, 각 후보에 대한 recovery 처리messageContext = (AutoFsTxSession *)((char *)session + 96);if (recoveryStatus >= 0) {    FsTxMessageContext::OutputMessage(messageContext, 2u, 0x3F4u, sessionIndex);    v50 = 1;} else {    FsTxMessageContext::OutputMessage(messageContext, 8u, 0x3F5u, sessionIndex, recoveryStatus);    v50 = 0;}*(_BYTE *)(fsTxSession + 98) = v50;FsTxSession::CloseSession((FsTxSession *)fsTxSession, closeReason);// 실제 replay 호출 지점 (동적 로드된 FsTx.dll의 export)pfnFsTxPerformRecovery = (int64 (*)(int64, QWORD, int64))g_FsTxPerformRecovery;FsTxVolumes = pfnFsTxPerformRecovery(sessionHandle, 0, 60000);
```

`autofstx.exe` 는 `FsTx.dll` 이 수행한 작업을 직접 처리하지 않고, 성공과 실패 결과값을 받아 로그를 남깁니다. `winpeshl.ini` 삭제는 `FsTx.dll` 의 replay 단계에서 발생합니다.

이제 실제 코드에서 USB volume이 recovery candidate로 선택되는 지점과, rollback이 `LinkPath` 를 처리하는 지점을 확인해보겠습니다.

#### Root Cause 코드

#### ① VolumeContext::FindFsTxVolumes - 신뢰 안 되는 USB를 복구 후보로 수용

```jsx
BaseAddress = FindFirstVolumeW(Str);// ← 모든 볼륨 순회 (fixed/removable/USB 구분 없음)// 드라이브문자 root(X:\) 있나? 확인if ( v20 == 3 && i[1] == 58 /* ':' */ && i[2] == 92 /* '\' */ && (letter a-z/A-Z) )    v17 = *i;                              // 드라이브문자 확보// 유일한 자격 검사: "<드라이브>:\System Volume Information\FsTx" 폴더가 존재하나?wcscat_s(Str, 0x104u, L"System Volume Information\\FsTx");FileAttributesW = GetFileAttributesW(Str);if ( FileAttributesW == -1 || (FileAttributesW & 0x10) == 0 )    v7 = 0;                                // 폴더 없으면 탈락LABEL_54:    v23 = AutoChkMalloc(0x48u);            // ★ 여기서 볼륨이 "복구 후보"로 채택됨    ...    v24[66] = v7;                          // v7(+0x42) = "복구 대상 여부" → RunSession이 이걸로 recover 결정
```

앞서 소개하였듯, 드라이브 문자와 `System Volume Information\FsTx` directory가 있으면 이 volume은 recovery 후보로 처리되는 것을 알 수 있습니다.

#### ② PerformOperationRollbackRecovery (op==5) - 교차볼륨 winpeshl.ini 삭제

```jsx
if ( opType == 5 )   // HARDLINK 생성을 롤백한다.{    TempRootPath = (wchar_t *)GetTempRootPath(recoveryCtx, linkPath, linkPath);    v30 = TempRootPath;    if ( TempRootPath )    {        v43 = AddPathToPathSet((PRTL_DYNAMIC_HASH_TABLE)(recoveryCtx + 2152), TempRootPath);        RtlNtStatusToDosError(v43);    }    HIDWORD(v115) = 0;    File = (HANDLE)DoCreateFile(recoveryCtx, 0, (_DWORD)Name, (unsigned int)&v135, *(_DWORD *)(opRecord + 12) & 8);    // ↑ Name(= 레코드 path[1] = \??\X:\Windows\System32\winpeshl.ini)을    //   절대 NT 경로로 그냥 연다. 이 경로가 어느 볼륨인지, 이 트랜잭션의    //   소스 볼륨과 같은지 확인하는 코드가 여기 없다.    if ( File != (HANDLE)-1LL || (LastWin32Error = RtlGetLastWin32Error()) != 0 )    {        v44 = LastWin32Error;        if ( LastWin32Error == 2 ) // 링크 없음 → 스킵        {            LastWin32Error = 0;            goto LABEL_225;        }        if ( !LastWin32Error )        {            dispositionFlags = 17;            // 0x11 = DELETE | POSIX - 취약: 교차볼륨 무검증 삭제            SetFileInformationByHandle(File);            // 그대로 POSIX 삭제            goto LABEL_225;        }    }    else    {        LastWin32Error = 6;        v44 = 6;    }    // open 실패 로그    LODWORD(v110) = 10506;    if ( swprintf_s(           v21,           0x800u,           L"%s:%u (Error 0x%X) - Rollback recovery(HARDLINK): Failed to open hard link '%s' for deletion, to reve"            "rt the operation",           L"onecore\\base\\fs\\fstxlib\\dll\\fstxlib.c",           v110,           v44,           Name) < 0 )      wcscpy_s(v21, 0x800u, L"???");
```

문제는 `DoCreateFile()` 이 record의 `Name` 을 절대 NT path로 그대로 열고, 그 파일이 실제로 이 transaction이 만들었던 link인지 다시 확인하지 않는다는 점입니다. USB에서 읽은 transaction record가 `X:\Windows\System32\winpeshl.ini` 를 `LinkPath` 로 지정하면, `FsTx.dll` 은 source USB volume과 무관한 이 기존 파일도 rollback으로 되돌려야 할 link로 취급합니다. 이후 `dispositionFlags = 0x11` 이 적용되면 해당 path의 파일은 POSIX delete로 제거됩니다.

### 4.5 재현 결과

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d6b38c748d242ccd.png)

먼저 USB에 `E:`에 FsTx artifact를 배치하였습니다. 정상 부팅에서는 WinRE 복구 UI가 표시될텐데, USB 주입 후 부팅을 했을 때의 재현 결과를 확인해봅시다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/80ffc44c638dbd43.png)

의도한 `FsTx artifact` 를 배치한 USB를 연결하고 WinRE로 부팅하면 정상 복구 UI 대신 `X:\Windows\System32\cmd.exe` 가 표시됩니다. `winpeshl.exe` 와 `winpeshl.log` 같은 파일들은 남아있는데, 같은 디렉토리에 있어야 할 `X:\Windows\System32\winpeshl.ini` 를 찾지 못하는 것으로 보아 rollback으로 삭제된 것으로 볼 수 있습니다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/73bdc2e6a29b4729.png)

`winpeshl.log` 를 확인해보면 `X:\Windows\System32\cmd.exe /K startnet.cmd` 를 실행했다는 로그도 확인할 수 있습니다. `cmd.exe` fallback이 실행되었네요.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4e5933ad4f2224e9.png)

`winre_access_proof.txt` 에 `WinRE_ACCESS_PROOF` 와 timestamp가 기록되었고, WinRE 세션에서 만든 마커파일에 파일 쓰기가 잘 이뤄진 것을 볼 수 있습니다!

## 마치며

이번 글에서는 평소에는 지나치기 쉬운 WinRE의 부팅 과정과 recovery code를 직접 따라가 봤는데요. 이 글을 읽으신 여러분들이라면 이제 우연히 Windows 복구 모드에 들어가더라도 파란 복구 화면 뒤에는 일반 Windows와 별도로 부팅된 WinRE가 복구 기능을 준비하고 실행하고 있구나~ 하고 떠올리실 수 있을 것 같습니다. 😁

WinRE 시리즈, 재밌으셨나요? 다음 글에서는 WinRE보다 한 단계 앞선 Boot Manager로 돌아가, BitPixie를 살펴보겠습니다. 구버전의 서명된 Boot Manager가 왜 다시 실행될 수 있었는지와, 그 뒤 PXE 전환 과정에서 어떤 일이 일어나는지도 함께 알아보겠습니다! 많은 기대 부탁드립니다!

## Reference

1.  Alon Leviev, Netanel Ben Simon, **“BitUnlocker: Leveraging Windows Recovery to Extract BitLocker Secrets,”** Microsoft Security Blog, August 13, 2025.
    
    [https://techcommunity.microsoft.com/blog/microsoft-security-blog/bitunlocker-leveraging-windows-recovery-to-extract-bitlocker-secrets/4442806](https://techcommunity.microsoft.com/blog/microsoft-security-blog/bitunlocker-leveraging-windows-recovery-to-extract-bitlocker-secrets/4442806)
    
2.  Nightmare-Eclipse, **“YellowKey: BitLocker Bypass Vulnerability,”** GitHub, 2026. (Archived copy)
    
    [https://github.com/meltingscales/YellowKey](https://github.com/meltingscales/YellowKey)
    
3.  Microsoft Security Response Center, **“CVE-2026-45585: Windows BitLocker Security Feature Bypass Vulnerability,”** Microsoft Security Update Guide, 2026.
    
    [https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-45585](https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-45585)
    
4.  Microsoft, **“WinPE: Create Apps,”** Microsoft Learn.
    
    [https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/winpe-create-apps](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/winpe-create-apps)
