---
title: "[도닦기] 6단계: 안 아프게 SandBox 탈출하는 법 (KR)"
source: https://hackyboiz.github.io/2026/08/01/gongjae/Wipeload_step6/KR/
source_host: hackyboiz.github.io
clip_date: 2026-10-15T10:13:21+08:00
trace_id: 063e44eb-8799-481c-803e-d6e23abf7f15
content_hash: 0c9677c4948019aee7e5897c853a16ee0635841f24ab17eb049ab36ddea8501f
status: synced
tags: []
series: null
feed_source: hackyboiz·Android/Windows/macOS漏洞
ai_summary: null
ai_summary_style: null
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 3fa75244-d011-81f6-9879-ea6b54f84d47
ioc: null
---

안녕하세요! 도닦기 프로젝트의 6단계로 돌아온 gongjae입니다~!! 이제 도닦기도 벌써 6단계까지 왔군요…! 저희가 걸어온 길을 다시 되돌아볼까요?

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a50a64512d0c4552.png)

> 지난 연구글  
> [https://hackyboiz.github.io/2026/06/06/OUYA77/Wipeload_step1/kr/](https://hackyboiz.github.io/2026/06/06/OUYA77/Wipeload_step1/kr/)  
> [https://hackyboiz.github.io/2026/06/21/ji9umi/Wipeload_step2/kr/](https://hackyboiz.github.io/2026/06/21/ji9umi/Wipeload_step2/kr/)  
> [https://hackyboiz.github.io/2026/06/26/ji9umi/Wipeload_step3/kr/](https://hackyboiz.github.io/2026/06/26/ji9umi/Wipeload_step3/kr/)  
> [https://hackyboiz.github.io/2026/07/13/OUYA77/Wipeload_step4/kr/](https://hackyboiz.github.io/2026/07/13/OUYA77/Wipeload_step4/kr/)  
> [https://hackyboiz.github.io/2026/07/19/gongjae/Wipeload_step5/KR/](https://hackyboiz.github.io/2026/07/19/gongjae/Wipeload_step5/KR/)

1단계에서 OUYA77님이 체인 전체의 그림을 그려주셨고, 2~3단계에서 ji9umi님이 렌더러 RCE와 V8 힙 샌드박스 우회를 보여주셨죠. 4단계에서는 다시 OUYA77님이 크롬 샌드박스가 스스로를 어떻게 가두는지 뜯어주셨고, 지난 5단계에서는 제가 ALPC와 `ALPC_MSGFLG_SYNC_REQUEST` Use-After-Free를 다뤘습니다. 오늘 6단계는 그 UAF를 되살려 임의 **Read/Write primitive** 를 얻고, 그걸 발판 삼아 **Medium 권한 코드 실행** 까지 진행하여 시푸 사부를 만나러 진짜 **SandBox Escape** 를 진행해볼 예정입니다!

자, 그럼 지난 5단계의 마지막 장면부터 다시 꺼내볼까요?

렌더러 안에 sRDI로 트리거 DLL을 심고, `NtWaitForWorkViaWorkerFactory` 로 SYNC 메시지를 띄운 스레드를 비행 중에 죽여서 `_ETHREAD` 를 free 시켰죠. 그리고 포트를 닫는 순간, `AlpcpCancelMessage` 가 이미 죽어버린 그 주소의 `+0x578` 에 write를 때렸습니다. 그 결과가 바로 이거였어요.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6702edba737ac23b.png)

> BSOD 났으면 된거아닐까요..? ~~커널에서 터졌으니 아무튼 escape임~~

네.. 사실 저도 여기서 생각이 많아졌습니다.. 저번 5단계에서 예고했듯이 Theori 블로그 글에서도 file picker를 활용해서 thread spray를 통해 이러쿵 저러쿵 해서 Medium 권한으로 코드 실행이 된다~ 라고 되어 있었기 때문이죠..

BSOD는 “커널이 죽은 포인터를 밟았다”는 사실 하나만 증명해줍니다. 하지만 우리가 원하는 건 그게 아니죠! 저 죽은 포인터를 **우리가 고른 주소에, 우리가 고른 값을 읽고 쓰는 도구** 로 바꿔놔야 합니다. 크래시(crash)랑 primitive는 정말 전혀 다른 물건이거든요. 파란 화면에서 cmd까지는, 생각보다 훨씬 멀다~ 라고 할 수 있겠네요..🥲

하지만 그렇다고 물러설 gongjae가 아니죠. 열심히 뇌를 굴려서 SandBox Escape를 하기 위해 필요한 것이 무엇인지를 먼저 골라봤습니다.

1.  어떻게 UAF로 원하는 주소에 원하는 값을 읽고 쓸 수 있는가? - reclaim?
2.  그 재점유를 하필 어떤 프로세스가 해주게 만들 것인가? - file picker?
3.  읽고 쓰기가 생겼다면 어디를 덮어야 실행 흐름이 넘어오는가? - vtable?

전부 물음표로 끝나는 게 참 웃기지만, 이 물음표들을 하나씩 지워나가는 게 오늘 글의 목표입니다~!😄 그럼 1번부터 가보죠!

5단계에서 저희가 free한 건 `_ETHREAD` 오브젝트가 들어앉아 있던 커널 풀 슬랩이었죠. 커널은 그 메모리를 곧바로 회수해서 다음 할당에 내줄 준비를 합니다. 그럼 우리가 할 일은 딱 하나예요. 그 자리를 우리가 원하는 프로세스의 새 `_ETHREAD` 로 다시 채워버리는 것! 이게 바로 재점유(reclaim)입니다.

이게 성공하면 어떻게 될까요? 메시지에 남아 있던 `WaitingThread` 포인터가 더 이상 “죽은 주소”가 아니게 됩니다. **우리가 통제하는 프로세스의, 살아있는 `_ETHREAD`** 를 가리키게 되죠. 그 순간 UAF는 단순한 크래시 유발기에서 크로스-프로세스 R/W 창으로 변신합니다!!

근데 이게 왜 어렵냐구요? 커널 풀이 그렇게 순진하지가 않거든요.. free한 슬랩이 대체 어디로 가서 어떤 규칙으로 재사용되는지를 뼛속까지 알고 있어야 합니다… 🙃 그렇다면 본격적으로 들어가기 전에 오늘 렌더러 안에서 도는 네이티브 코드는 5단계의 그 트리거 DLL을 수정한 내용이라, 말하기 쉽게 **익스 DLL** 이라고 부르겠습니다.

실험 환경은 5단계와 똑같습니다.

```
Windows 11 22H2  ·  ntoskrnl 22621.963Chrome for Testing 114.0.5708.0
```

그리고 5단계에서 BSOD를 확실하게 보려고 켰던 Driver Verifier는, 이번 편에서는 꺼져 있습니다. special pool이 free된 슬랩을 아예 언매핑해버려서 켜두면 오늘 주제인 재점유 자체가 불가능해지거든요!!

## 1.1 VS allocator \_ETHREAD slab

먼저 우리가 상대할 슬랩의 신원부터 확인하고 갑시다.

```
sizeof(_ETHREAD) = 0x900        // 커널이 잡는 오브젝트 크기풀 블록(실측)     = 0xa80        // !pool 이 찍어주는 값태그             = 'Thre'       // protected풀 타입           = NonPagedPoolNx
```

여기서 헷갈리기 딱 좋은 게 두 숫자입니다. `0x900` 은 어디까지나 오브젝트 크기고, 실제로 풀에서 떨어져 나가는 블록은 `0xa80` 이에요. `_POOL_HEADER`, `_OBJECT_HEADER`, 서브헤더, VS 청크 헤더가 앞뒤로 덕지덕지 붙고, 거기서 다시 VS allocator의 크기 클래스로 올림되거든요.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4398bd19199fadc7.png)

그러니까 우리가 재점유 경쟁을 벌이는 사이즈 클래스는 `0x900` 이 아니라 **`0xa80`** 입니다. 슬랩을 눈으로 집을 때는 `!pool` 출력에서 size `a80` + `*Thre` 조합으로 보는 게 편합니다. 옆에 같이 찍히는 `(Protected)` 는 풀 태그에 보호 비트가 붙어 있다는 표시인데, 태그가 맞아야만 free를 받아주겠다는 커널 쪽 안전장치예요. 우리는 직접 free를 부르는 게 아니라 커널이 스레드를 정리하면서 free해준 자리를 노리는 거라, 여기엔 걸리지 않습니다.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b2ab5fb1d7afdc21.png)

그리고 Win10 19H1부터 커널 풀은 세그먼트 힙이라, 크기에 따라 담당 allocator가 갈립니다. `0x200` 아래는 kLFH로, `0x200` 부터 `0x20000` 까지는 **VS allocator** 로, 그보다 크면 segment/large 쪽으로 가죠. 블록 `0xa80` 짜리 `_ETHREAD` 는 두 번째, 즉 **VS allocator** 가 관리합니다. 오늘 재점유는 전부 이 allocator 안에서 벌어지는 일이에요.

그리고 할당 경로는 다음과 같습니다.

```
NtCreateThreadEx → PspAllocateThread → ObpAllocateObject → ExAllocatePool2
```

이 슬랩을 꺼내오는 입구는 결국 `NtCreateThreadEx` 하나입니다. **누군가 스레드를 하나 만들면 `0xa80` 블록이 하나 나간다** 는 뜻이죠. 아까 예고했던 thread spray가 왜 통하는지, 사실 그 답이 이 한 줄에 다 들어 있습니다.

## 1.2 Dynamic Lookaside

그런데 말이죠, VS allocator 앞단에는 캐시가 한 겹 더 붙어 있습니다. `_SEGMENT_HEAP.UserContext` 가 가리키는 `_RTL_DYNAMIC_LOOKASIDE` 구조체인데요, 사실 오늘 이야기의 진짜 주인공은 이 친구라고 볼 수 있습니다!

구조부터 kd로 직접 확인해 볼까요?

```yaml
0: kd> dt nt!_RTL_DYNAMIC_LOOKASIDE   +0x000 EnabledBucketBitmap : Uint8B   +0x008 BucketCount         : Uint4B   +0x00c ActiveBucketCount   : Uint4B   +0x040 Buckets             : [64] _RTL_LOOKASIDE0: kd> dt nt!_RTL_LOOKASIDE   +0x000 ListHead            : _SLIST_HEADER   +0x010 Depth               : Uint2B   +0x012 MaximumDepth        : Uint2B   +0x014 TotalAllocates      : Uint4B   +0x018 AllocateMisses      : Uint4B   ...
```

생각보다 심심하죠? 버킷이 64개 있고, 각 버킷은 그냥 SLIST 하나가 전부입니다. 동작도 두 줄이면 끝나요.

```
free  → 버킷이 enabled 이고 depth 여유가 있으면 → PUSH  (맨 위에 얹기)alloc → 같은 사이즈면                          → POP   (맨 위에서 꺼내기)
```

보시면 아시겠지만, **LIFO** 입니다. free와 alloc의 순서가 그대로 대응된다는 뜻이죠. “free → 곧바로 alloc” 순서만 만들어주면, 그 alloc은 **방금 free한 바로 그 슬랩** 을 가져갑니다. 그래서 이 재점유는 수만 개를 뿌려놓고 하나 걸리기를 기다리는 확률 스프레이가 아니라, **순서를 맞추는 문제** 가 돼요! 😎

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/11906df23b18aaa5.png)

> free한 슬랩이 SLIST 맨 위에 얹히고, 다음 `0xa80` alloc이 그대로 POP해 갑니다.

lookaside가 원래 “고정 크기 블록을 캐싱해두고 depth는 시스템이 알아서 조절한다”는 물건이라는 것, 그리고 SLIST의 push/pop이 원자적 LIFO라는 건 MS 문서에도 그대로 나와 있습니다.

그런데 위 두 줄에 조건이 슬쩍 붙어 있었죠. “depth 여유가 있으면”. 이 `Depth` 가 무엇을 의미하는 걸까요?

먼저 초기화입니다. `RtlpDynamicLookasideInitialize` 가 버킷 64개를 돌면서 이 한 줄을 박아요.

```
mov qword ptr [rbx-2], 1000000h     ; Buckets[n]+0x10 에 8바이트 한 방
```

리틀엔디언으로 풀어보면 아까 `dt` 로 본 필드에 정확히 떨어집니다.

```
+0x10  00 00   →  Depth        = 0+0x12  00 01   →  MaximumDepth = 0x100 (256)
```

최대 깊이는 256인데 시작 깊이가 0입니다. 갓 초기화된 버킷은 아무것도 캐싱해주지 않아요. free한 슬랩이 SLIST에 얹히지 못하고 곧장 VS 백엔드의 RB-tree로 떨어집니다. 재점유는 시작도 못 하는 거죠.

그럼 이 `Depth` 는 언제 자랄까요? `RtlpLookasideAdjustDepth` 를 뜯어보면 규칙이 이렇습니다.

```nasm
nt!RtlpLookasideAdjustDepth+0x0b:  sub    ecx,  [r9+24h]             ; ecx  = 이번 구간 할당 수  ...  sub    r10d, [r9+28h]             ; r10d = 이번 구간 미스 수  ...+0x3a:  movzx  r8d,  word ptr [r9+10h]    ; r8d  = Depth         ← 지금 허용치  cmovbe eax,  r10d                 ; eax  = min(할당, 미스)  movzx  r10d, word ptr [r9+12h]    ; r10d = MaximumDepth  ← 최대 깊이  test   ecx, ecx  cmovz  ecx, r11d                  ; 할당이 0이면 1로     ← 0 나눗셈 방어  imul   eax, eax, 3E8h             ;  × 1000  div    ecx                        ;  → eax = 미스율(천분율)  cmp    ecx, 19h                   ; 직전 구간 할당이 25회 미만이면  jb     +0xae                      ;  → 그냥 깎으러+0x68:  cmp    eax, 5                     ; 미스율이 0.5% 이상이면  jae    +0x7e                      ;  → 키우러+0x6d:  sub    r8d, r11d                  ; Depth -= 1+0x70:  mov    eax, 4  cmp    r8d, eax  cmovle r8d, eax                   ; 바닥 4  jmp    +0x2e                      ;  → 저장+0x7e:  mov    ecx, r10d  sub    ecx, r8d                   ; 남은 여유 = MaximumDepth - Depth  imul   ecx, eax                   ;  × 미스율  ...                               ;  ( ÷ 1000 )  add    edx, 5  mov    eax, 1Eh  cmovae edx, eax                   ; 한 번에 최대 +30  lea    eax, [rdx+r8]  cmp    eax, r10d  mov    r8d, eax  cmovge r8d, r10d                  ; 최대 깊이까지만  jmp    +0x2e                      ;  → 저장+0xae:  sub    r8d, 0Ah                   ; Depth -= 10  jmp    +0x70                      ;  → 바닥 클램프로
```

`r8d` 가 `Depth`, `r10d` 가 `MaximumDepth` 입니다. 이 둘만 따라가면 나머지는 다 읽힐 거예요. 분기가 세 갈래인데, 깎는 두 갈래는 마지막에 전부 `+0x70` 으로 모입니다. `-10` 쪽은 일부러 되돌아오죠. 거기 `cmp r8d, eax` / `cmovle r8d, eax` 가 있어서 바닥이 4가 되는 거라고 생각하면 편합니다. 키우는 갈래는 자기 자리에서 최대 깊이만 걸고 빠집니다.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b2178f1f22304452.png)

```
직전 구간 할당이 25회 미만  →  Depth -10미스율이 0.5% 미만         →  Depth -1그 외                      →  Depth += 최대 30                              바닥 4, 최대 깊이 MaximumDepth
```

`Depth` 는 미스가 나야 자랍니다. 비어 있는 버킷에 alloc이 들어와야 한다는 뜻이에요.

따라서 이 `Depth` 는 지금 담겨 있는 개수가 아니라 몇 개까지 받아줄지 정해둔 허용치입니다. 실제 개수는 `ListHead` 안에 따로 들어 있고, 이 함수는 SLIST를 전혀 건드리지 않고 허용치 숫자만 고칩니다. 그래서 위에서 `-10` 이 된다는 건 캐싱해둔 슬랩을 버린다는 게 아니라, 앞으로 받아줄 여유가 줄어든다는 뜻이에요.

물론 실제로는 이 순서가 깨지는 경우도 있고, 제가 free한 슬랩을 엉뚱한 할당이 먼저 채가는 경우도 있습니다. 그럼 이제 그걸 어떻게 막고, 누가 그 자리를 먹게 만들지를 볼 차례겠죠?

## 2\. Taking the Slab Back

1장에서 조건은 다 나왔습니다. **free 다음에 alloc이 곧바로 오면 되고, 그 alloc이 남의 프로세스 것이어도 상관없다.** 그럼 이제 진짜로 해보면 되겠네요! …라고 생각했는데, 당연히 안 됩니다.. 😇

## 2.1 Reclaim이 그냥은 안 되는 두 가지 이유

> **버킷이 안 데워져 있으면 시작도 못 함**

바로 위에서 본 그거예요. `Depth` 가 0에 가까우면 제가 free한 슬랩이 SLIST에 못 얹힙니다. 그대로 VS 백엔드의 RB-tree로 흘러가버려요. 그럼 LIFO는 남의 얘기가 되고, 다음 `0xa80` 할당이 어디서 뭘 집어올지 아무도 모릅니다.

그런데 이게 그냥 “실패”로 끝나지 않습니다. RB-tree 쪽은 best-fit에 병합까지 하는 물건이라 돌아오는 슬랩의 내용물이 완전히 뒤섞여 있어요. 나중에 커널이 그 자리를 `_ETHREAD` 라고 믿고 정해진 오프셋을 읽는데(어디를 읽는지는 3장에서 볼게요), 거기 들어 있는 게 쓰레기면 커널이 그 자리에서 죽습니다. 재점유에 실패한 대가가 또 BSOD인 셈이죠..

> **남이 먼저 가져감**

하드 LIFO라는 건 뒤집어 말하면 **끼어드는 놈이 임자** 라는 뜻이기도 합니다. 제가 free한 순간과 제가 원하는 프로세스가 alloc하는 순간 사이에, 같은 `0xa80` 할당이 딱 하나만 끼어들어도 그 슬랩은 그쪽으로 갑니다.

문제는 그 “남”이 대부분 자기 자신이라는 것!!

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b9ec312703373d9c.png)

-   크로미움 렌더러는 가만히 있어도 스레드를 만들고 없앱니다. 스레드풀, IO, Mojo… 전부 소음이라고 할 수 있습니다.
-   심지어 버킷을 데우겠다고 제가 직접 만드는 `prime_lookaside` 스레드도 경쟁자입니다.

우리 렌더러가 그 자리를 먹으면 어떻게 될까요? 댕글링 포인터가 **자기 자신을 가리키게** 됩니다. 커널 입장에선 아무 문제 없이 잘 동작하는데, 정작 우리는 Untrusted IL 샌드박스 안에 갇힌 렌더러를 읽고 쓰게 되는 거죠. 나갈 방법이 없습니다.

정리하면 재점유는 관문 두 개를 통과해야 합니다. 버킷을 열어두는 것, 그리고 그 자리를 제가 원하는 프로세스가 먹게 만드는 것. 두 번째부터 보죠. 누가 채울지가 정해져야 버킷을 언제 데울지도 정해지거든요 — 대체 누가 저 대신 스레드를 만들어줄까요?

## 2.2 File Picker를 통한 Thread Spray

우리한테 필요한 건 하나였죠. Medium IL 프로세스가 우리 타이밍에 맞춰 스레드를 만들어주는 것!

근데 우리는 Untrusted IL 렌더러 안에 갇혀 있습니다. 남의 프로세스한테 “스레드 좀 만들어줘”라고 시킬 방법이 없어요. 있다면 크롬이 원래 그렇게 하도록 만들어둔 길뿐이겠죠? 그게 바로 file picker입니다!

```jsx
await window.showOpenFilePicker();
```

이 한 줄이면 렌더러가 Mojo로 `UtilWin::CallExecuteSelectFile` 을 부르고, 브라우저가 util_win 이라는 별도 프로세스를 띄웁니다. 커맨드라인을 보면 왜 이게 우리 표적인지 바로 보여요.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2c61d60b93b88d21.png)

```fsharp
--utility-sub-type=chrome.mojom.UtilWin--service-sandbox-type=none
```

**샌드박스가 아예 없습니다.** Medium IL이고요. 4단계에서 OUYA77님이 크롬이 스스로를 어떻게 가두는지 보여주셨는데, file picker만큼은 셸 확장이랑 COM을 다 불러야 해서 가둘 수가 없었던 겁니다…!!(두둥탁)

그리고 util_win이 하는 일이 `CoCreateInstance(CLSID_FileOpenDialog)` 입니다. COM을 STA로 초기화하는 순간 combase와 rpcrt4가 스레드풀이며 RPC 스레드며 한꺼번에 만들어요. 피커 한 번에 `_ETHREAD` 8~16개가 새로 잡힙니다.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6290c03bb3880bc3.png)

저희가 앞서 1.1에서 말했던 한 줄이 여기서 회수되죠. `NtCreateThreadEx` 하나가 `0xa80` 하나. JS 한 줄로 남의 Medium IL 프로세스가 우리 사이즈 클래스를 뭉텅이로 할당하게 만드는 것입니다!

다만 아무 스레드나 되는 건 아니었습니다. file picker가 생성되는 첫 몇 ms 동안 만들어지는 건 ntdll 병렬 로더의 작업 스레드인데, 이 친구들은 **로딩이 끝나면 바로 죽습니다.** 죽으면서 우리가 애써 먹인 슬랩을 도로 free해버려요. 재점유를 해놓고 다시 뱉는 셈이죠.. 🤮

저희가 노리는 창은 **COM 초기화 버스트 구간** 입니다. 대화상자 요청이 들어가고 수십에서 수백 ms 뒤에 옵니다. 여기서 만들어지는 스레드들은 대화상자가 열려 있는 동안 계속 살아 있고 말이죠. 그리고 우리가 노리는 건 “크기가 `0xa80` 인 아무 할당”이 아니라 **진짜 스레드** 여야 합니다. 커널이 그 자리를 `_ETHREAD` 라고 믿고 정해진 오프셋을 읽거든요. 크기만 맞는 다른 오브젝트가 앉으면 거기 든 값은 쓰레기고, 그걸 프로세스라고 붙잡는 순간 커널이 또 BSOD에 걸리게 되겠죠?

file picker가 좋은 spray primitive가 될 수 있는 이유가 바로 이것입니다. **진짜 `CreateThread` 를 대신 불러준다는 것!**

## 2.3 prime_lookaside, SELF-CHECK filtering

이제 관문 하나가 남았죠? 버킷을 열어두는 것!

근데 이건 1.2에서 이미 답이 나왔습니다. `Depth` 는 미스가 나야 자란다고 했잖아요? 그럼 일부러 미스를 내주면 됩니다. 스레드를 만들었다 없앴다 반복하면 `0xa80` 할당이 계속 일어나고, 빈 버킷에서 alloc이 날 때마다 미스가 쌓여요. 그게 `prime_lookaside` 입니다.

다만 **많이 만들면 안 됩니다.** 2.1의 두 번째 이유 기억하시죠? 제가 만든 스레드도 결국 경쟁자예요. 너무 많이 돌리면 정작 제가 제 슬랩을 다시 집어갑니다. 여러 시도 끝에, 최적의 개수로 저는 8개로 놓았습니다.

순서는 이렇게 됩니다.

1.  prime_lookaside(8) - 버킷 open
2.  showOpenFilePicker() - util_win을 통한 thread spray
3.  WorkerThread 종료 - \_ETHREAD free
4.  짧은 대기 - 누군가 자리로 들어올 틈 만들기
5.  ~~근데 그 누군가가 누구인지 어케암?~~

마지막 줄이 문제입니다. 재점유는 커널 안에서 조용히 일어나서, 성공했는지 알려주는 사람이 없습니다. 모르는 채 다음 단계로 넘어가면 나중에 고생할지도 모르죠… 실제로 저는 처음 시도에서 “어라? 재점유 잘 되는 것 같네? 쉬운거 아님?” 했다가 후회한 전적이 있습니다..😭

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5171a6cbd782db33.png)

그래서 확인해보기로 했습니다. 마침 combase에 딱 좋은 값이 하나 있습니다. g_CMalloc — COM이 메모리를 잡고 풀 때마다 거쳐가는 할당자 객체인데, 그 첫 8바이트가 CRetailMalloc vtable 포인터거든요. 재점유가 됐다면 그 자리를 먹은 프로세스의 메모리를 읽을 수 있을 테니까, `[g_CMalloc]` 을 한번 읽어보는 거예요. 거기 진짜 `CRetailMalloc` vtable 주소가 들어 있으면 — 이걸 `WANT` 라고 부르겠습니다 — combase가 올라온 멀쩡한 프로세스가 그 자리에 앉았다는 뜻이죠. 실제로 주소가 잘 박혀있었고, 저는 당연하게도 재점유가 잘 됐다고 믿었습니다… 아주 잠깐이지만 말이죠..

kd를 붙이고 제 렌더러를 직접 들여다봤는데, 거기서 문제점을 발견했습니다.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a98bbdaf893f8e88.png)

```
렌더러의 [g_CMalloc]  =  WANTutil_win의 [g_CMalloc]  =  WANT
```

둘이 같은 값입니다. 생각해보면 당연해요. 렌더러에도 같은 combase가 올라와 있으니까요. 그럼 `WANT` 가 나왔다는 건 “재점유 성공”이 아니라 **“커널이 어딘가를 읽어서 값을 가져왔다”** 정도밖에 안 되는 거였습니다. 그 어딘가가 util_win일 수도, 그냥 제 렌더러일 수도 있었던 거고요.

재점유가 늦어서 제 렌더러가 그 자리를 먹으면, 게이트는 그걸 성공으로 읽고 그대로 진행합니다. 그리고 Untrusted IL 안에서는 `WinExec` 이 막히니까 cmd는 영원히 안 뜨겠죠..?

그러면 대체 어떻게 이 둘을 구별하지?? 생각을 하던 중 이런 방식이 생각이 났습니다. 익스 DLL이 쓰는 CTRL 구조체에 8바이트짜리 `CTRL_MAGIC` 을 박아두고, 그 주소를 읽는 엔트리를 하나 더 준비했습니다. 이건 제 렌더러 주소공간에만 존재하는 값이 됩니다!!

-   제 렌더러가 먹었다 → 그 주소가 매핑돼 있고 **매직이 그대로 돌아옴**
-   util_win이 먹었다 → 그 주소는 저쪽에서 unmapped → **매직이 안 나옴!!**

바로 게이트를 두 개로 만드는 것이죠!!

```csharp
[g_CMalloc] == WANT        살아있는 combase 프로세스가 앉았다..!        AND[ctrl] != CTRL_MAGIC       근데 그게 내가 아니네??
```

따라서 둘 다 통과해야만 진행하고, 매직이 돌아오면 그 프로세스는 버리고 다시 기다리는 것입니다 ㅎㅎ✌️

## 3\. Reading Across Processes

## 3.1 LPCP_DATA_INFO - cross-process R/W

재점유가 됐는지까지 확인했으니, 이제 진짜로 메모리를 읽고 쓸 차례입니다!!! 그런데 여기서 다시 막힙니다 ~~(몇 번을 막히는 거냐!!)~~. 저는 현재 Untrusted IL 렌더러예요. `OpenProcess` 로 util_win 핸들을 딸 수도 없고 `ReadProcessMemory` 도 못 부릅니다. **남의 주소공간에 직접 손댈 방법이 없죠.**

그래서 우리가 직접 하는 게 아니라, 커널한테 시키는 겁니다! 여기서 저희가 5단계 때 말씀드렸던 취약점이 빛을 발하게 되는 거예요!!

```cpp
NTSTATUS NtReadRequestData(    HANDLE        PortHandle,    PPORT_MESSAGE Message,         // 커널이 이 안의 MessageId로 큐에서 메시지를 찾음    ULONG         DataEntryIndex,  // LPCP_DATA_INFO.Entries[] 중 몇 번째    PVOID         LocalBuffer,     // 우리 쪽 버퍼    SIZE_T        Length,    PSIZE_T       ReturnLength);
```

`NtWriteRequestData` 도 시그니처가 똑같습니다. 방향만 반대죠!

```
NtReadRequestData    상대 프로세스[Entries[i].BaseAddress]  →  우리 버퍼NtWriteRequestData   우리 버퍼  →  상대 프로세스[Entries[i].BaseAddress]
```

여기서 “상대 프로세스”가 어디인지는 제가 정하는 게 아니고 커널이 알아서 정해요. 그리고 그 정하는 방식이 2.1에서 미뤄뒀던 바로 그 얘기입니다.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b68660cb1f89b9a3.png)

`LpcpCopyRequestData` 가 하는 일을 따라가보면 이렇습니다.

1.  Message의 MessageId로 포트 큐에서 메시지를 찾는다.
2.  msg + 0x20 → WaitingThread ← 우리가 free시킨 그 \_ETHREAD
3.  \[WaitingThread + 0x220\] → Process ← 그 스레드의 소유 프로세스
4.  그 프로세스에 attach 해서 복사

2번의 `WaitingThread` 가 5단계에서 만들어둔 그 댕글링 포인터고, 3번의 `+0x220` 이 2.1에서 “커널이 정해진 오프셋을 읽는다”고 했던 그 오프셋입니다.

```nasm
nt!LpcpCopyRequestData+0x1aa:  mov  rax, qword ptr [rsp+48h]     ; 찾아낸 메시지  mov  r9,  qword ptr [rax+20h]     ; msg + 0x20  =  WaitingThread  test r9, r9  jne  ...
```

두 번째 줄이 바로 그 댕글링을 꺼내는 자리입니다. 그리고 바로 다음이 `test r9, r9` 하나예요. **널인지만 보지, 그게 진짜 살아있는 스레드인지는 안 봅니다.** 우리가 파고드는 곳이 정확히 여기죠.

```nasm
nt!LpcpCopyRequestData+0x270:  mov  rcx, qword ptr [r8+0B8h]     ; 우리 프로세스  mov  r8,  qword ptr [r9+220h]     ; WaitingThread + 0x220  =  상대 프로세스  mov  r9,  qword ptr [rsp+60h]     ; 엔트리의 BaseAddress  mov  rdx, qword ptr [rsp+0E0h]    ; 우리 버퍼nt!LpcpCopyRequestData+0x28d:  mov  r8,  qword ptr [r8+0B8h]     ; 우리 프로세스  mov  rcx, qword ptr [r9+220h]     ; 상대 프로세스  mov  r9,  qword ptr [rsp+0E0h]    ; 우리 버퍼  mov  rdx, qword ptr [rsp+60h]     ; 엔트리의 BaseAddressnt!LpcpCopyRequestData+0x2a8:  call nt!MiCopyVirtualMemory
```

블록이 두 개인 게 보이시죠? 그리고 완전히 대칭입니다. `MiCopyVirtualMemory(From, FromAddr, To, ToAddr, …)` 로 풀어보면 이렇게 되거든요.

```
+0x270    우리 버퍼     →  상대 프로세스    =  Write+0x28d    상대 프로세스  →  우리 버퍼        =  Read
```

그리고 이 둘을 가르는 건 함수 맨 앞에서 받아둔 `cl` 한 바이트입니다. 읽기든 쓰기든 **결국 같은 함수로 들어오고, 플래그 하나로 방향만 갈라지는** 것이죠!

원래 이 자리는 메시지를 보낸 스레드, 그러니까 렌더러를 가리키고 있었습니다. 그 스레드를 죽이고 util_win이 그 자리를 재점유하는 순간, 같은 포인터가 **util_win의 살아있는 스레드** 를 가리키게 되죠. 커널은 아무것도 이상하다고 생각하지 않습니다. 그냥 시키는 대로 util_win에 attach해서 복사해줄 뿐이에요!! 🤩

다만 제약이 두 개 붙습니다.

> **쓰기는 writable 페이지에만 가능**

커널이 UserMode 기준으로 주소를 검사하거든요. 읽는 건 `.text` 든 `.rdata` 든 다 되는데, 쓰는 건 런타임에 쓰기 가능한 페이지여야 합니다. 이게 4장에서 “무엇을 덮을 것인가”를 고를 때 결정적인 제약이 됩니다.

> **읽고 쓸 주소는 미리 정해둬야 함**

엔트리의 `BaseAddress` 는 메시지를 보내는 시점에 커널이 자기 쪽으로 복사해갑니다. 우리 버퍼에 있는 값을 나중에 바꿔도 소용없어요. 그러니까 “일단 재점유부터 하고 주소는 나중에 정하자”가 안 됩니다. **쏘기 전에 어디를 읽고 쓸지 전부 결정해둬야 한다는 말이죠..!!**

## 3.2 Message ID leak

3.1에서 도구는 다 만들었습니다. 그런데 `NtReadRequestData` 를 부르려면 인자가 하나 필요했습니다. 바로 `PPORT_MESSAGE Message` 말이죠!

커널은 그 버퍼를 데이터로 쓰는 게 아닙니다. **안에 든 `MessageId` 로 포트 큐에서 메시지를 찾아요.**

```cmake
Message ID를 모른다  →  커널이 메시지를 못 찾는다  →  호출 자체가 실패
```

사실상 재점유를 아무리 잘 시켜놔도, 그 메시지를 지목할 수 없으면 아무것도 못 하는 거죠. 문제는 MID를 우리가 정하는 게 아니라는 것입니다. 커널이 메시지를 큐에 넣을 때 직접 발급하는 핸들이에요. 순서대로 올라가는 카운터가 아니라 상위 비트가 테이블을 고르고 나머지가 인덱스인 값이라, 찍어서 맞힐 수가 없습니다. 그리고 그 메시지를 보낸 스레드는 UAF를 만들겠다고 우리 손으로 죽였고요.

그래서 한동안 이건 불가능하다고 생각했었습니다… 커널의 조회 경로를 뜯어보니 그 핸들을 쪼개서 전역 테이블에서 메시지를 꺼내고, 꺼낸 메시지의 `MessageId` 가 우리가 넘긴 값과 정확히 일치해야 하거든요. 🔍

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9676b477441adaec.png)

그런데 착각이었습니다. MID를 지어낼 필요가 없었습니다..? 같은 포트에 `NtAlpcSendWaitReceivePort` 를 **보내는 것 없이 받기만** 하는 모드로 부르면, 커널이 큐에 있던 메시지를 우리 버퍼에 그대로 돌려줍니다. 거기 커널이 매긴 `MessageId` 가 박혀 있겠죠?

```cpp
BYTE* recvBuf = VirtualAlloc(NULL, 0x1000, ...);ULONG recvLen = 0x200;LARGE_INTEGER timeout; timeout.QuadPart = 0;NtAlpcSendWaitReceivePort(hPort, 0, NULL, NULL,                          recvBuf, &recvLen, NULL, &timeout);ULONG mid = *(ULONG*)(recvBuf + 0x18);   // ← 여기
```

실제로 찍어보면 이렇게 나옵니다.

```
st_recv       = 0 (SUCCESS)recvLen       = 0x200recvBuf[0x18] = 0x0b18      ← MID leak!
```

조건을 뚫을 필요 없이, **조건을 이미 통과한 번호를 그냥 받아온 겁니다.** 커널이 직접 발급한 값이니까요!

그리고 이 `recvBuf` 를 그대로 `NtReadRequestData` / `NtWriteRequestData` 의 `Message` 인자로 넘기면 됩니다. 커널이 알아서 안의 MID를 읽어요. 이 상태에서 읽기·쓰기 둘 다 SUCCESS가 떨어지고, 써넣은 값이 그대로 다시 읽힙니다. **드디어 Medium 프로세스의 메모리를 읽고 쓸 수 있게 된 거죠!!** 🎉

그런데 여기서 한 가지, 읽고 쓸 주소는 대체 어떻게 알았을까요? 보통 이런 체인은 base leak부터 하고 시작하잖아요.

이건 아까 저희가 막혔던 그 부분에서 힌트가 되었는데요, `ntdll` · `combase` · `kernel32` 는 전부 KnownDLL이라, 한 부팅 안에서는 프로세스가 달라도 같은 자리에 올라옵니다. `chrome.dll` 도 같은 이미지라 마찬가지고요. 그래서 우리 렌더러에서 `GetModuleHandleA` 한 번 부르면 **그 값이 util_win에서도 그대로 맞습니다!!**

실제로 이후 익스플로잇 단계에서도 똑같이 합니다. 뒤에서 만들 가짜 vtable도 진짜 `CRetailMalloc` vtable을 **우리 렌더러의 combase에서 읽어다** 복사한답니다!!

## 4\. Hijacking Execution

## 4.1 vtable pointer overwrite

읽고 쓰기가 생겼으니 이제 덮을 차례입니다. 그런데 3.1의 문제가 하나 남아 있었죠? **쓰는 건 writable 페이지에만 된다는 점!**

```
KCT (Kernel Callback Table)   →  .rdata    읽기 전용__guard_check_icall_fptr      →  .mrdata   읽기 전용__guard_dispatch_icall_fptr   →  .00cfg    읽기 전용
```

직접 리버싱을 통해 확인해보면 우리가 손댈 수 있는 건 런타임에 쓰기 가능한 `.data` 뿐이에요. 그래서 생각을 바꿔야 했습니다. “무엇을 덮으면 좋을까”가 아니라, **“.data 에 있으면서 실행 흐름을 쥐고 있는 게 있나?”** 로요.

그 답은 사실 이미 우리 손에 있었습니다. 2.3에서 재점유를 확인할 때 읽었던 그 `g_CMalloc` 이요!! 그리고 여기서 중요한건? **우리가 덮어야 할 것은 vtable이 아닙니다.**

```
CRetailMallocVtbl   combase + 0x28a5f0   →  .rdata   한 바이트도 못 씀g_CMalloc           combase + 0x338348   →  .data    쓸 수 있음
```

함수 포인터가 늘어선 테이블 자체는 읽기 전용이라 손도 못 댑니다. 하지만 그 테이블을 가리키는 객체 인스턴스는 `.data` 에 있어요. 그러니까 테이블을 고치는 게 아니라, **객체가 다른 테이블을 보게 만드는** 겁니다.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0dd47bb6e97d009e.png)

그래서 ntdll `.data` 의 빈 자리에 가짜 vtable `S` 를 하나 짓고, `g_CMalloc` 의 첫 8바이트가 그쪽을 보게 바꿔 줄 겁니다. `S` 는 **진짜 vtable을 통째로 복사** 해서 씁니다. 3.2에서 말씀드렸듯 combase는 KnownDLL이라, 제 렌더러에 올라온 `CRetailMallocVtbl` 을 그대로 읽어오면 되거든요. 그 다음 필요한 슬롯만 갈아끼워 줄 거예요!

0~2번 슬롯(`QueryInterface` / `AddRef` / `Release`)을 진짜로 남겨두는 게 중요합니다. COM이 할당 사이사이에 이것들을 계속 부르는데, 여기서 엉뚱한 데로 튀면 프로세스가 죽어버리거든요. 💀

마지막으로 `g_CMalloc` 이 좋은 표적인 이유가 하나 더 있습니다. 트리거를 제가 안 만들어도 됩니다. 덮어놓기만 하면 util_win이 알아서 밟아요. 파일 대화상자가 초기화되면서 COM이 메모리를 수십 번 잡았다 놨다 하거든요. 우리는 그냥 무장해두고 기다리면 된다는 거죠! 😎

특정 슬롯 하나를 기다릴 필요도 없습니다. 진입한 뒤 처음 일어나는 할당 하나면 바로 트리거가 가능해집니다!

## 4.2 Gadget Chaining

`g_CMalloc` 이 `S` 를 보게 됐으니, util_win이 다음에 메모리를 잡는 순간 `S[3]` 이 불립니다. 그럼 거기에 무엇을 넣어야 코드 실행까지 갈까요? 바로 `WinExec` 을 넣을 수는 없습니다. 그 순간 `rcx` 가 `&g_CMalloc` 이거든요. C++ 메서드 호출이니 첫 인자는 항상 `this` 입니다. `WinExec(lpCmdLine, uCmdShow)` 의 첫 인자는 문자열이어야 하는데 말이죠…

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9bb47de1be265569.png)

그래서 **`rcx` 를 갈아끼울 징검다리가 필요** 합니다. 첫 번째 가젯으로 다음 가젯을 불러오고, 두 번째 가젯에서 `rcx` 를 갈아끼우게 되는데요,

```
G1              ntdll  + 0xa36f0  mov rax, [rcx+0x20]  call raxchrome gadget   chrome + 0x556235c  mov rcx, [rcx+0x30]  mov rax, [rcx+0x10]  call [__guard_dispatch_icall_fptr]
```

`G1` 을 보시면 `rcx` 를 그대로 둔 채 `[rcx+0x20]` 을 부릅니다. `rcx` 가 `&g_CMalloc` 이니까 `[g_CMalloc+0x20]` 을 부르는 거예요. 거기에 두 번째 가젯을 심어둡니다.

두 번째 가젯이 진짜인데요, `mov rcx, [rcx+0x30]` 으로 **`rcx`** 를 갈아끼워줍니다! `[g_CMalloc+0x30]` 에는 제가 넣어둔 `&SCR_obj` 가 있습니다.

```
SCR_obj + 0x00   "cmd.exe"SCR_obj + 0x10   kernel32!WinExec
```

그리고 바로 다음 줄이 `mov rax, [rcx+0x10]` 입니다. 방금 `rcx` 가 `&SCR_obj` 가 됐으니 `rax` 에는 `WinExec` 이 들어오고, `rcx` 는 그대로 `&SCR_obj` — 즉 **`"cmd.exe"`** 문자열의 주소로 남으면서 마지막 순간에 `WinExec` 의 첫 인자로 갈아끼워지는 겁니다.

```
rcx :  &g_CMalloc  →  &g_CMalloc  →  &SCR_obj
```

이러면 CFG도 간단하게 우회할 수 있겠죠? ㅎㅎ 감싸지 않은 호출 하나를 빌려서, CFG가 검사하는 지점은 전부 합법적인 대상만 지나가게 만든 거예요. 그리고 드디어, 버튼 한 번에 이렇게 cmd가 켜지게 됩니다!!!! 🎉

[POC 영상](https://www.youtube.com/watch?v=2AMNjFq7V-A&feature=youtu.be)

## 5\. Outro

6단계까지 오시느라 정말 고생 많으셨죠! BSOD 하나로 시작해서, freed된 `_ETHREAD` 자리를 file picker가 대신 채우게 만들고, 그 댕글링으로 Medium 프로세스를 읽고 쓰고, 결국 Medium IL에서 cmd를 띄웠습니다.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ba78be6948f84c79.png)

드디어 타이렁이 감옥을 풀고, 먼 길을 찾아와 시푸 사부 앞에까지 오게 됐네요. low 레벨에서 Medium 레벨까지 당도한 지금, 마지막 단 하나의 관문이 남았습니다.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2fad0e7e13e9ce87.png)

네 바로 용의 전사가 될 수 있는! System 권한으로 가는 Windows LPE 말이죠! 다음 도닦기 7단계는 banda님의 Windows LPE 글로 찾아뵙겠습니다!
