---
title: 【看雪】记录简单逆向某反作弊的过程
source: https://bbs.kanxue.com/thread-292270.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-02T03:56:37+08:00
trace_id: 5ce00cf5-b97c-4844-b8cd-0d18d548dd34
content_hash: c5531f0ab60ffe28cbe3857b8651f3fbdad05cb0f51253a03e015861291cc7cc
status: synced
tags:
  - 看雪
  - Windows逆向
  - 游戏安全
series: null
feed_source: 看雪·逆向工程
ai_summary: 该反作弊驱动通过设备枚举、IOMMU 检测、系统版本校验及内核结构定位来识别虚拟化与作弊环境。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3af75244-d011-810a-9e84-d8abe8061967
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 该反作弊驱动通过设备枚举、IOMMU 检测、系统版本校验及内核结构定位来识别虚拟化与作弊环境。
> 
> - **PCI 设备信息提取：** 驱动枚举所有 PCI 设备，筛选 Net 类设备，读取 MatchingDeviceId 并解析出 VEN_xxxx 和 DEV_xxxx，同时从 LocationInformation 获取 bus、device 与 function 编号。
> - **IOMMU 虚拟化检测：** 分别通过 Intel DMAR 与 AMD IVRS ACPI 表定位 IOMMU 寄存器，修改并延时检测寄存器内容变化，发现变动则上报事件 1078，以此判断是否处于虚拟机内。
> - **系统版本与 CET 检查：** 调用 RtlGetVersion 检查构建号范围，读取 CR4 与 CPUID 检测 CET 启用状态，并对 AMD 处理器读取 Processor Brand String 与硬编码列表比对，阻断不支持的环境。
> - **内核模块枚举与特征搜索：** 使用 ZwQuerySystemInformation 枚举已加载内核模块，对 ntoskrnl.exe 执行 `lea rcx, [rip+disp32]` 特征码扫描，定位关键数据；针对 win32k.sys 在入口附近搜索 `mov [rip+…], rax` 序列。
> - **gTimerHashTable 定位：** 通过 CSRSS 进程上下文挂靠，在 win32k.sys 中导出符号或特征码搜索获取 gTimerHashTable 地址，用于后续行为和时序检测。

初步去虚拟化后 xxxGAME.sys已经基本可读，直接ida。

先找到DriverEntry伪代码如下 发现前函数单纯当跳板直接跟进去：

```cpp
NTSTATUS __stdcall DriverEntry(PDRIVER_OBJECT DriverObject, PUNICODE_STRING RegistryPath)
{
  returnDriverEntry_0(DriverObject, RegistryPath);
}
 
NTSTATUS __stdcall DriverEntry_0(_DRIVER_OBJECT *DriverObject, PUNICODE_STRING RegistryPath)
{
  _security_init_cookie();
  returnsub_1400130D0(DriverObject);
}
 
__int64__fastcall sub_1400130D0(PDRIVER_OBJECT DriverObject)
{
  returnsub_1402CB140(DriverObject);
}
 
_int64 __fastcall sub_1402CB140(PDRIVER_OBJECT DriverObject)
{
  struct_UNICODE_STRING DeviceName; // [rsp+40h] [rbp-48h] BYREF
 
  DriverObject->MajorFunction[0] = (PDRIVER_DISPATCH)sub_140013038;
  DriverObject->MajorFunction[2] = (PDRIVER_DISPATCH)sub_140013038;
  DriverObject->MajorFunction[14] = (PDRIVER_DISPATCH)sub_140013058;
  DriverObject->MajorFunction[16] = (PDRIVER_DISPATCH)sub_1400130AC;
  DriverObject->DriverUnload = (PDRIVER_UNLOAD)sub_140013074;
  if( (unsigned int)sub_1400127A4(DriverObject) )
    return0;
  RtlInitUnicodeString((PUNICODE_STRING)&DeviceName.Buffer, L"\\Device\\XXXGAME");
  if( IoCreateDevice(DriverObject, 0, &DeviceName, 0x22u, 0, 0, &DeviceObject) < 0 )
    return0;
  if( IoRegisterShutdownNotification(DeviceObject) >= 0 )
    byte_140030AB8 = 1;
  return0;
}
```

先看 sub_1400127A4 进去后发现依旧是跳板，实际进入 sub_1402CAAE0。

```cpp
__int64__fastcall sub_1402CAAE0(__int64a1, __int64a2)
{
  sub_14000C1A4();
  if( byte_140030608 )
    return0;
  sub_140012764(a1);
  sub_14000E660();
  sub_14001EE80();
  sub_1400126F0(); //尝试删除一个匿名后的辅助驱动文件
  if( (unsigned __int8)sub_140012848(a2) ) //先将路径转为小写，再检查是否包含主驱动文件名
  {
    byte_140030609 = 1;
    sub_14001296C(a2);//构造辅助驱动路径 xxxgamebase-0.sys
    sub_1400128E4(a2);
  }
  else
  {
    sub_14001ED08();
    sub_14001E80C();
    sub_14001191C(a2);
    sub_1400104F0();
    sub_14000C37C();
    sub_140013318(); //注册进程和注册表回调
    sub_140018B1C(a2, &qword_140030620, 256); 
  }
  byte_140030608 = 1;//初始化
  return0;
}
```

```cpp
bool__fastcall sub_140012848(__int64a1)
{
  charv2; // di
  __int64String[64]; // [rsp+20h] [rbp-218h] BYREF
 
  v2 = 0;
  sub_140027980(String, 0, 0x200u);
  if( (int)sub_140018B1C(a1, String, 256) >= 0 )
  {
    wcslwr((wchar_t*)String);
    returnsub_140023180(String, L"ace-game.sys") != 0;
  }
  returnv2;
}
 
__int64sub_1400126F0()
{
  struct_UNICODE_STRING DestinationString; // [rsp+20h] [rbp-238h] BYREF
  __int64Dst[66]; // [rsp+30h] [rbp-228h] BYREF
 
  sub_140027980(Dst, 0, 0x208u);
  wcscat_s((wchar_t*)Dst, 0x104u, L"\\SystemRoot\\System32\\drivers\\ace-game-0.sys");
  RtlInitUnicodeString(&DestinationString, (PCWSTR)Dst);
  returnsub_14001A894(&DestinationString);
}
```

## PCI设备枚举

发现导入表调用 两个函数调用 IoGetDeviceProperty

```cpp
__int64__fastcall sub_140007C04(PDEVICE_OBJECT DeviceObject) 
{
  unsigned intn2; // ebx
  wchar_t*Pool; // rax
  wchar_t*Pool_1; // rdi
  ULONGResultLength; // [rsp+48h] [rbp+10h] BYREF
 
  n2 = 0;
  Pool = (wchar_t*)ExAllocatePool(NonPagedPool, 0x100u);
  ResultLength = 0;
  Pool_1 = Pool;
  if( Pool )
  {
    sub_140027980(Pool, 0, 256);
    if( !IoGetDeviceProperty(DeviceObject, DevicePropertyClassName, 0x100u, Pool_1, &ResultLength) )
    {
      if( !wcscmp(Pool_1, L"Net") || !wcscmp(Pool_1, L"net") )
      {
        n2 = 1;
      }
      elseif( !wcscmp(Pool_1, L"Display") || !wcscmp(Pool_1, L"display") )
      {
        n2 = 2;
      }
      elseif( !wcscmp(Pool_1, L"System") || !wcscmp(Pool_1, L"system") )
      {
        n2 = 3;
      }
      elseif( !wcscmp(Pool_1, L"MEDIA") || !wcscmp(Pool_1, L"media") )
      {
        n2 = 6;
      }
      elseif( !wcscmp(Pool_1, L"USB") || !wcscmp(Pool_1, L"usb") )
      {
        n2 = 4;
      }
      elseif( !wcscmp(Pool_1, L"SCSIAdapter") )
      {
        n2 = 5;
      }
      elseif( !wcscmp(Pool_1, L"DiskDrive") || !wcscmp(Pool_1, L"diskdrive") )
      {
        n2 = 8;
      }
      elseif( !wcscmp(Pool_1, L"SoftwareComponent") || !wcscmp(Pool_1, L"softwarecomponent") )
      {
        n2 = 9;
      }
    }
    ExFreePoolWithTag(Pool_1, 0);
  }
  returnn2;
}
```

```cpp
bool__fastcall sub_140008958(PDEVICE_OBJECT DeviceObject, __int64a2, __int64a3)
{
  boolv3; // bl
  struct_DEVICE_OBJECT *AttachedDevice; // rax
  struct_DEVICE_OBJECT *AttachedDevice_1; // rcx
  PVOIDDeviceExtension; // rdi
  WCHAR*Pool; // rdi
  ULONGResultLength; // [rsp+30h] [rbp-B8h] BYREF
  struct_UNICODE_STRING DestinationString; // [rsp+38h] [rbp-B0h] BYREF
  struct_UNICODE_STRING p_DestinationString; // [rsp+48h] [rbp-A0h] BYREF
  WCHARSourceString[40]; // [rsp+60h] [rbp-88h] BYREF
 
  v3 = 0;
  if( a2 )
  {
    if( a3 )
    {
      if( (unsigned int)sub_140007C04(DeviceObject) == 1 ) //只获取 Net 类设备
      {
        AttachedDevice = DeviceObject->AttachedDevice;
        if( AttachedDevice )
        {
          AttachedDevice_1 = AttachedDevice->AttachedDevice;
          if( AttachedDevice_1 )
          {
            //获取第二层附加设备的私有设备扩展
            DeviceExtension = AttachedDevice_1->DeviceExtension;
            if( DeviceExtension )
            {
              sub_140027980(SourceString, 0, 80);//清空缓冲区
              RtlInitUnicodeString(&DestinationString, SourceString);//提取字符串
              if( (unsigned __int8)sub_1400082E4(DeviceExtension, SourceString) )
              {
                return(unsigned int)sub_1400140A0(&DestinationString, a2, a3) == 0;
              }
              else
              {
                Pool = (WCHAR*)ExAllocatePool(NonPagedPool, 0x200u);
                if( Pool )
                {
                  ResultLength = 512;
                  if( IoGetDeviceProperty(DeviceObject, DevicePropertyHardwareID, 0x200u, Pool, &ResultLentth) >= 0 )
                  {
                    RtlInitUnicodeString(&p_DestinationString, Pool);
                    v3 = (unsigned int)sub_1400140A0(&p_DestinationString, a2, a3) == 0;
                  }
                  ExFreePoolWithTag(Pool, 0);
                }
              }
            }
          }
        }
      }
    }
  }
  returnv3;
}
```

看看到底提取了什么字符串 于是我们直接看sub_1400082E4 和 sub_1400140A0 两个函数

总结下：

sub_1400082E4

直接读 MatchingDeviceId

sub_1400140A0

从 MatchingDeviceId 中解析：

VEN_xxxx -> \*(ULONG \*)a2

DEV_xxxx -> \*(ULONG \*)a3

```cpp
char__fastcall sub_1400082E4(PVOIDDeviceExtension, WCHAR*SourceString)
{
  charv3; // bl
  USHORTLength; // cx
  size_tn39; // r8
  struct_UNICODE_STRING DestinationString; // [rsp+30h] [rbp-30h] BYREF
  struct_NDIS_CONFIGURATION_OBJECT ConfigObject; // [rsp+40h] [rbp-20h] BYREF
  intStatus; // [rsp+80h] [rbp+20h] BYREF
  PVOIDConfigurationHandle; // [rsp+90h] [rbp+30h] BYREF
  PNDIS_CONFIGURATION_PARAMETER ParameterValue; // [rsp+98h] [rbp+38h] BYREF
 
  ConfigurationHandle = 0;
  ConfigObject.NdisHandle = DeviceExtension;
  *((_DWORD *)&ConfigObject.Header + 1) = 0;
  *(_QWORD *)&ConfigObject.Flags = 0;
  v3 = 0;
  ConfigObject.Header = (NDIS_OBJECT_HEADER)1311145;
  Status = NdisOpenConfigurationEx(&ConfigObject, &ConfigurationHandle);
  if( !Status )
  {
    ParameterValue = 0;
    RtlInitUnicodeString(&DestinationString, L"MatchingDeviceId");
    NdisReadConfiguration(&Status, &ParameterValue, ConfigurationHandle, &DestinationString, NdisParameterString);
    if( !Status )
    {
      Length = ParameterValue->ParameterData.StringData.Length;//解析 PCI 厂商 ID（VEN）和设备 ID（DEV）
      if( (Length & 0xFFFEu) >= 0x4E ) 
        n39 = 39;
      else
        n39 = (unsigned __int64)Length >> 1;
      wcsncpy(SourceString, ParameterValue->ParameterData.StringData.Buffer, n39);
      v3 = 1;
    }
  }
  if( ConfigurationHandle )
    NdisCloseConfiguration(ConfigurationHandle);
  returnv3;
}
```

```cpp
__int64__fastcall sub_1400140A0(struct_UNICODE_STRING *p_DestinationString, ULONG*a2, ULONG*a3)
{
  unsigned intv6; // edi
  PWSTRBuffer; // rcx
  __int64v8; // rax
  __int64v9; // rsi
  __int64v10; // rax
  size_tn9; // r8
  PWSTRBuffer_1; // rcx
  __int64v13; // rax
  __int64v14; // rbx
  __int64v15; // rax
  size_tn9_1; // r8
  ULONGValue__1; // ecx
  struct_UNICODE_STRING DestinationString; // [rsp+20h] [rbp-30h] BYREF
  WCHARSourceString; // [rsp+30h] [rbp-20h] BYREF
  __int64v21; // [rsp+32h] [rbp-1Eh]
  __int64v22; // [rsp+3Ah] [rbp-16h]
  __int16v23; // [rsp+42h] [rbp-Eh]
  ULONGValue; // [rsp+90h] [rbp+40h] BYREF
  ULONGValue_; // [rsp+A8h] [rbp+58h] BYREF
 
  v6 = -1073741823;
  if( p_DestinationString )
  {
    Buffer = p_DestinationString->Buffer;
    if( Buffer )
    {
      if( a2 )
      {
        Value = 0;
        v8 = sub_140023180(Buffer, L"VEN_");
        v9 = v8;
        if( v8 )
        {
          v10 = sub_140023180(v8, L"&DEV_");
          if( v10 )
          {
            SourceString = 0;
            v21 = 0;
            v22 = 0;
            v23 = 0;
            n9 = ((v10 - v9) >> 1) - 4;
            if( n9 > 9 )
              n9 = 9;
            wcsncpy(&SourceString, (constwchar_t*)(v9 + 8), n9);
            RtlInitUnicodeString(&DestinationString, &SourceString);
            RtlUnicodeStringToInteger(&DestinationString, 0x10u, &Value);
          }
        }
        Buffer_1 = p_DestinationString->Buffer;
        Value_ = 0;
        v13 = sub_140023180(Buffer_1, L"DEV_");
        v14 = v13;
        if( v13 )
        {
          v15 = sub_140023180(v13, L"&SUB");
          if( v15 )
          {
            SourceString = 0;
            v21 = 0;
            v22 = 0;
            v23 = 0;
            n9_1 = ((v15 - v14) >> 1) - 4;
            if( n9_1 > 9 )
              n9_1 = 9;
            wcsncpy(&SourceString, (constwchar_t*)(v14 + 8), n9_1);
            RtlInitUnicodeString(&DestinationString, &SourceString);
            RtlUnicodeStringToInteger(&DestinationString, 0x10u, &Value_);
          }
        }
        if( Value )
        {
          Value__1 = Value_;
          if( Value_ )
          {
            *a2 = Value;
            v6 = 0;
            *a3 = Value__1;
          }
        }
      }
    }
  }
  returnv6;
}
```

读取 DevicePropertyLocationInformation 获取设备和功能号。

```cpp
char__fastcall sub_140007EBC(PDEVICE_OBJECT DeviceObject, ULONG*a2, ULONG*a3, ULONG*a4)
{
  charv4; // bl
  ULONG*v5; // r15
  PVOIDPool; // rdi
  __int64v10; // rax
  __int64v11; // r14
  __int64v12; // rax
  size_tn9; // r8
  __int64v14; // rax
  __int64v15; // r14
  __int64v16; // rax
  size_tn9_1; // r8
  __int64v18; // rdx
  __int64v19; // r8
  size_tn9_2; // r8
  __int64v21; // rax
  __int64v22; // rax
  __int64v23; // r14
  __int64v24; // r15
  size_tn9_3; // r8
  __int64v26; // rax
  __int64v27; // r15
  __int64v28; // r14
  size_tn9_4; // r8
  __int64v30; // rdx
  __int64v31; // r8
  size_tn9_5; // r8
  ULONGResultLength; // [rsp+30h] [rbp-99h] BYREF
  ULONGValue; // [rsp+34h] [rbp-95h] BYREF
  ULONGValue_; // [rsp+38h] [rbp-91h] BYREF
  ULONGValue__1; // [rsp+3Ch] [rbp-8Dh] BYREF
  struct_UNICODE_STRING DestinationString; // [rsp+40h] [rbp-89h] BYREF
  UNICODE_STRING DestinationString_; // [rsp+50h] [rbp-79h] BYREF
  UNICODE_STRING DestinationString__1; // [rsp+60h] [rbp-69h] BYREF
  WCHARDest; // [rsp+70h] [rbp-59h] BYREF
  __int64v42; // [rsp+72h] [rbp-57h]
  __int64v43; // [rsp+7Ah] [rbp-4Fh]
  __int16v44; // [rsp+82h] [rbp-47h]
  WCHARDest_; // [rsp+88h] [rbp-41h] BYREF
  __int64v46; // [rsp+8Ah] [rbp-3Fh]
  __int64v47; // [rsp+92h] [rbp-37h]
  __int16v48; // [rsp+9Ah] [rbp-2Fh]
  WCHARSourceString; // [rsp+A0h] [rbp-29h] BYREF
  __int64v50; // [rsp+A2h] [rbp-27h]
  __int64v51; // [rsp+AAh] [rbp-1Fh]
  __int16v52; // [rsp+B2h] [rbp-17h]
  WCHARDest__1; // [rsp+B8h] [rbp-11h] BYREF
  __int64v54; // [rsp+BAh] [rbp-Fh]
  __int64v55; // [rsp+C2h] [rbp-7h]
  __int16v56; // [rsp+CAh] [rbp+1h]
 
  v4 = 0;
  *(_QWORD *)&DestinationString.Length = a2;
  v5 = a2;
  Value = 0;
  Value_ = 0;
  Value__1 = 0;
  Pool = ExAllocatePool(NonPagedPool, 0x200u);
  if( Pool )
  {
    ResultLength = 512;
    if( IoGetDeviceProperty(DeviceObject, DevicePropertyLocationInformation, 0x200u, Pool, &ResultLength) >= 0 )
    {
      v10 = sub_140023180(Pool, L"bus ");
      v11 = v10;
      if( v10 )
      {
        v12 = sub_140023180(v10, L", device");
        if( !v12 )
          gotoLABEL_35;
        SourceString = 0;
        v50 = 0;
        v51 = 0;
        v52 = 0;
        n9 = ((v12 - v11) >> 1) - 4;
        if( n9 > 9 )
          n9 = 9;
        wcsncpy(&SourceString, (constwchar_t*)(v11 + 8), n9);
        RtlInitUnicodeString(&DestinationString, &SourceString);
        RtlUnicodeStringToInteger(&DestinationString, 0xAu, &Value);
        v14 = sub_140023180(Pool, L"device ");
        v15 = v14;
        if( !v14 )
          gotoLABEL_35;
        v16 = sub_140023180(v14, L", function");
        if( !v16 )
          gotoLABEL_35;
        Dest = 0;
        v42 = 0;
        v43 = 0;
        v44 = 0;
        n9_1 = ((v16 - v15) >> 1) - 7;
        if( n9_1 > 9 )
          n9_1 = 9;
        wcsncpy(&Dest, (constwchar_t*)(v15 + 14), n9_1);
        RtlInitUnicodeString(&DestinationString_, &Dest);
        RtlUnicodeStringToInteger(&DestinationString_, 0xAu, &Value_);
        v18 = sub_140023180(Pool, L"function ");
        if( !v18 )
          gotoLABEL_35;
        Dest_ = 0;
        v46 = 0;
        v47 = 0;
        v48 = 0;
        v19 = (ResultLength >> 1) - ((v18 - (__int64)Pool) >> 1);
        ResultLength >>= 1;
        n9_2 = v19 - 9;
        if( n9_2 > 9 )
          n9_2 = 9;
        wcsncpy(&Dest_, (constwchar_t*)(v18 + 18), n9_2);
        RtlInitUnicodeString(&DestinationString__1, &Dest_);
        RtlUnicodeStringToInteger(&DestinationString__1, 0xAu, &Value__1);
      }
      else
      {
        v21 = sub_140023180(Pool, L"location PCI ");
        if( !v21 )
          gotoLABEL_35;
        v22 = sub_140023180(v21 + 26, qword_140027D20);
        v23 = v22;
        if( !v22 )
          gotoLABEL_35;
        v24 = sub_140023180(v22, qword_140027D30);
        if( !v24 )
          gotoLABEL_35;
        Dest_ = 0;
        v46 = 0;
        v47 = 0;
        n9_3 = ((v24 - v23) >> 1) - 1;
        v48 = 0;
        if( n9_3 > 9 )
          n9_3 = 9;
        wcsncpy(&Dest_, (constwchar_t*)(v23 + 2), n9_3);
        RtlInitUnicodeString(&DestinationString__1, &Dest_);
        RtlUnicodeStringToInteger(&DestinationString__1, 0xAu, &Value);
        v26 = sub_140023180(v24, qword_140027D20);
        v27 = v26;
        if( !v26 )
          gotoLABEL_35;
        v28 = sub_140023180(v26, qword_140027D30);
        if( !v28 )
          gotoLABEL_35;
        Dest = 0;
        v42 = 0;
        v43 = 0;
        n9_4 = ((v28 - v27) >> 1) - 1;
        v44 = 0;
        if( n9_4 > 9 )
          n9_4 = 9;
        wcsncpy(&Dest, (constwchar_t*)(v27 + 2), n9_4);
        RtlInitUnicodeString(&DestinationString_, &Dest);
        RtlUnicodeStringToInteger(&DestinationString_, 0xAu, &Value_);
        v30 = sub_140023180(v28, qword_140027D20);
        if( !v30 )
          gotoLABEL_35;
        Dest__1 = 0;
        v54 = 0;
        v55 = 0;
        v56 = 0;
        v31 = (ResultLength >> 1) - ((v30 - (__int64)Pool) >> 1);
        ResultLength >>= 1;
        n9_5 = v31 - 1;
        if( n9_5 > 9 )
          n9_5 = 9;
        wcsncpy(&Dest__1, (constwchar_t*)(v30 + 2), n9_5);
        RtlInitUnicodeString((PUNICODE_STRING)&SourceString, &Dest__1);
        RtlUnicodeStringToInteger((PCUNICODE_STRING)&SourceString, 0xAu, &Value__1);
        v5 = *(ULONG**)&DestinationString.Length;
      }
      if( v5 )
        *v5 = Value;
      if( a3 )
        *a3 = Value_;
      if( a4 )
        *a4 = Value__1;
      v4 = 1;
    }
LABEL_35:
    ExFreePoolWithTag(Pool, 0);
  }
  returnv4;
}
```

## IOMMU

直接查看导入表，四个函数交叉引用随便一看MmMapIoSpace ，MmUnmapIoSpace，MmGetPhysicalAddress，MmIsAddressValid。

sub_140010C98函数中存在1380011332, 1397904969两个十进制常量。

转换为十六进制后 分别为 0x52414D44，0x53525649, 小端为: 44 4D 41 52 ->DMAR,49 56 52 53 -> "IVRS"

```cpp
void__fastcall sub_140010C98(__int64a1)
{
  unsigned int*BaseAddress; // rax
  unsigned int*BaseAddress_2; // rsi
  PHYSICAL_ADDRESS PhysicalAddress; // rbx
  unsigned intNumberOfBytes; // edi
  PHYSICAL_ADDRESS *VirtualAddress; // rbx
  PHYSICAL_ADDRESS *VirtualAddress_1; // rbp
  __int64QuadPart; // r14
  _DWORD *BaseAddress_1; // rbx
  unsigned intv9; // esi
  intv10; // r13d
  intv11; // r12d
  intv12; // r15d
  PHYSICAL_ADDRESS *BaseAddress_3; // rax
  PHYSICAL_ADDRESS *BaseAddress_4; // rsi
  PHYSICAL_ADDRESS PhysicalAddress_1; // rbx
  unsigned intHighPart; // edi
  __int64v17; // r14
  unsigned intv18; // esi
  intv19; // r13d
  intv20; // r12d
  intv21; // r15d
  intv22; // [rsp+E0h] [rbp+8h]
  intv23; // [rsp+E0h] [rbp+8h]
  intv24; // [rsp+E8h] [rbp+10h]
  intv25; // [rsp+E8h] [rbp+10h]
 
  if( !(unsigned __int8)sub_14001A400(a1) )
  {
    if( (unsigned __int8)sub_140013ED4() )
    {
      BaseAddress = (unsigned int*)sub_140008E8C(1380011332); //DMAR
      BaseAddress_2 = BaseAddress;
      if( BaseAddress )
      {
        PhysicalAddress = MmGetPhysicalAddress(BaseAddress);
        if( !PhysicalAddress.QuadPart
          || (NumberOfBytes = BaseAddress_2[1],
              MmUnmapIoSpace(BaseAddress_2, 8u),
              (BaseAddress_2 = (unsigned int*)MmMapIoSpace(PhysicalAddress, NumberOfBytes, MmNonCached)) != 0) )
        {
          VirtualAddress = (PHYSICAL_ADDRESS *)(BaseAddress_2 + 12);
          VirtualAddress_1 = (PHYSICAL_ADDRESS *)((char*)BaseAddress_2 + BaseAddress_2[1]);
          if( BaseAddress_2 != (unsigned int*)-48LL )
          {
            while( VirtualAddress < VirtualAddress_1 && MmIsAddressValid(VirtualAddress) )
            {
              if( !LOWORD(VirtualAddress->LowPart) && (VirtualAddress->QuadPart & 0x100000000LL) != 0 )
              {
                QuadPart = VirtualAddress[1].QuadPart;
                if( QuadPart )
                {
                  BaseAddress_1 = MmMapIoSpace(VirtualAddress[1], 0x100u, MmNonCached);
                  if( BaseAddress_1 )
                  {
                    if( *BaseAddress_1 == -1 )
                      gotoLABEL_16;
                    v9 = 0;
                    v10 = BaseAddress_1[20];
                    v11 = BaseAddress_1[21];
                    v12 = BaseAddress_1[22];
                    v22 = BaseAddress_1[18];
                    v24 = BaseAddress_1[19];
                    BaseAddress_1[18] = -1;
                    BaseAddress_1[19] = -1;
                    BaseAddress_1[20] = -1;
                    BaseAddress_1[21] = -1;
                    BaseAddress_1[22] = -1;
                    sub_140014074(1000);
                    if( v22 != BaseAddress_1[18] )
                    {
                      v9 = 1;
                      BaseAddress_1[18] = v22;
                    }
                    if( v24 != BaseAddress_1[19] )
                    {
                      ++v9;
                      BaseAddress_1[19] = v24;
                    }
                    if( v10 != BaseAddress_1[20] )
                    {
                      ++v9;
                      BaseAddress_1[20] = v10;
                    }
                    if( v11 != BaseAddress_1[21] )
                    {
                      ++v9;
                      BaseAddress_1[21] = v11;
                    }
                    if( v12 != BaseAddress_1[22] )
                    {
                      ++v9;
                      BaseAddress_1[22] = v12;
                    }
                    MmUnmapIoSpace(BaseAddress_1, 0x100u);
                    if( v9 )
                      sub_140012048(0, 1078, v9, QuadPart, 0, byte_14002F350, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
                  }
                }
                return;
              }
              VirtualAddress = (PHYSICAL_ADDRESS *)((char*)VirtualAddress + HIWORD(VirtualAddress->u.LowPart));
              if( !VirtualAddress )
                return;
            }
          }
        }
      }
    }
    elseif( (unsigned __int8)sub_140013D9C() )
    {
      BaseAddress_3 = (PHYSICAL_ADDRESS *)sub_140008E8C(1397904969);
      BaseAddress_4 = BaseAddress_3;
      if( BaseAddress_3 )
      {
        PhysicalAddress_1 = MmGetPhysicalAddress(BaseAddress_3);
        if( !PhysicalAddress_1.QuadPart
          || (HighPart = BaseAddress_4->HighPart,
              MmUnmapIoSpace(BaseAddress_4, 8u),
              (BaseAddress_4 = (PHYSICAL_ADDRESS *)MmMapIoSpace(PhysicalAddress_1, HighPart, MmNonCached)) != 0) )
        {
          v17 = BaseAddress_4[7].QuadPart;
          if( v17 )
          {
            BaseAddress_1 = MmMapIoSpace(BaseAddress_4[7], 0x100u, MmNonCached);
            if( BaseAddress_1 )
            {
              if( *BaseAddress_1 == -1 )
              {
LABEL_16:
                MmUnmapIoSpace(BaseAddress_1, 0x100u);
              }
              else
              {
                v18 = 0;
                v19 = BaseAddress_1[47];
                v20 = BaseAddress_1[51];
                v21 = BaseAddress_1[55];
                v23 = BaseAddress_1[39];
                v25 = BaseAddress_1[43];
                BaseAddress_1[39] = -1;
                BaseAddress_1[43] = -1;
                BaseAddress_1[47] = -1;
                BaseAddress_1[51] = -1;
                BaseAddress_1[55] = -1;
                sub_140014074(1000);
                if( v23 != BaseAddress_1[39] )
                {
                  v18 = 1;
                  BaseAddress_1[39] = v23;
                }
                if( v25 != BaseAddress_1[43] )
                {
                  ++v18;
                  BaseAddress_1[43] = v25;
                }
                if( v19 != BaseAddress_1[47] )
                {
                  ++v18;
                  BaseAddress_1[47] = v19;
                }
                if( v20 != BaseAddress_1[51] )
                {
                  ++v18;
                  BaseAddress_1[51] = v20;
                }
                if( v21 != BaseAddress_1[55] )
                {
                  ++v18;
                  BaseAddress_1[55] = v21;
                }
                MmUnmapIoSpace(BaseAddress_1, 0x100u);
                if( v18 )
                  sub_140012048(0, 1078, v18, v17, 0, byte_14002F350, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0);
              }
            }
          }
        }
      }
    }
  }
}
```

继续分析 sub_140008E8C 可以发现它通过签名取得固件表；相邻逻辑还处理：FACP DSDT FACS

基本可以确定这个函数在处理Intel ACPI DMAR 和 AMD ACPI IVRS

```cpp
__int64__fastcall sub_140008E94(__int64n1380011332, _DWORD *a2)
{
  unsigned intn1380011332_1; // ebx
  __int64result; // rax
  char*v5; // rdi
  charv6; // [rsp+38h] [rbp+10h] BYREF
 
  n1380011332_1 = n1380011332;
  if( a2 )
  {
    if( *a2 != (_DWORD)n1380011332
      || (_DWORD)n1380011332 == 1346584902
      || (_DWORD)n1380011332 == 1413763908 
      || (_DWORD)n1380011332 == 1396916550 ) //前文相同处理
    {
      return0;
    }
    v5 = &v6;
    v6 = 0;
  }
  else
  {
    v5 = 0;
  }
  result = sub_140008F24(&unk_14002D010, (unsigned int)n1380011332, a2, v5);
  if( result )
    returnresult;
  if( v5 && *v5 )
    return0;
  returnsub_140008F24(&unk_14002D000, n1380011332_1, a2, v5);
}
```

跟进 sub_140013ED4 一眼顶针

1970169159 -> 0x756E6547

1818588270 -> 0x6C65746E

1231384169 -> 0x49656E69

EBX = 0x756E6547 -> 47 65 6E 75 -> "Genu"

EDX = 0x49656E69 -> 69 6E 65 49 -> "ineI"

ECX = 0x6C65746E -> 6E 74 65 6C -> "ntel"

AMD的CPU:

```cpp
boolsub_140013D9C()
{
  boolresult; // al
 
  _RAX = 0;
  __asm { cpuid }
  result = 0;
  if( (_DWORD)_RBX == 1752462657 && (_DWORD)_RCX == 1145913699 )
    return(_DWORD)_RDX == 1769238117;
  returnresult;
}
```

所以最终结构大概是

```cpp
if(IsIntel()) {
     dmar = GetAcpiTableBySignature("DMAR");
     ProbeIntelVtd(dmar);
 }
 elseif(IsAMD()) {
     ivrs = GetAcpiTableBySignature("IVRS");
     ProbeAmdVi(ivrs);
 }
```

Intel 分支从 DMAR 的 DRHD 类结构中取出寄存器物理基址，映射 \`0x100\` 字节后保存五个 DWORD：

```cpp
v10 = BaseAddress_1[20]; // +0x48
   v11 = BaseAddress_1[21];// +0x4C
   v12 = BaseAddress_1[22];// +0x50
   v22 = BaseAddress_1[18];// +0x54
   v24 = BaseAddress_1[19]; // +0x58
   BaseAddress_1[18] = -1;
   BaseAddress_1[19] = -1;
   BaseAddress_1[20] = -1;
   BaseAddress_1[21] = -1;
   BaseAddress_1[22] = -1;
   sub_140014074(1000); //KeDelayExecutionThread 延时等待约一秒
```

延时结束后，函数逐项比较当前值和保存值；如果不同，计数加一并写回原值。

两条分支都在变化计数非零时上报事件 1078

```cpp
sub_140012048(
        0,
        1078,
        changed_count,
        iommu_mmio_base,
        ...,
        is_intel_or_amd,
        ...);
```

## 系统版本检测

函数调用了RlGetVersion ，但是除了版本号检查以外，还做了一些其他检查，比较杂。

```cpp
__int64__fastcall sub_1402C3F80()
{
  __int64v0; // rbx
  __int64v1; // rbp
  __int64v2; // rdi
  __int16n119; // r14
  __int64v4; // rsi
  NTSTATUS Version; // eax
  unsigned __int64v6; // r8
  unsigned __int64v12; // rax
  __int64v13; // rax
  __int64v16[36]; // [rsp+80h] [rbp-1C8h] BYREF
  __int64v17; // [rsp+1A0h] [rbp-A8h]
  __int64v18; // [rsp+1B0h] [rbp-98h]
  __int64v19; // [rsp+1C0h] [rbp-88h]
  __int64v20; // [rsp+1C8h] [rbp-80h]
  int_RAX_1; // [rsp+1D8h] [rbp-70h] BYREF
  int_RBX_1; // [rsp+1DCh] [rbp-6Ch]
  intn1835012; // [rsp+1E0h] [rbp-68h]
  int_RDX_1; // [rsp+1E4h] [rbp-64h]
  intn5832731; // [rsp+1E8h] [rbp-60h]
  intn983058; // [rsp+1ECh] [rbp-5Ch]
  __int16n18; // [rsp+1F0h] [rbp-58h]
  intv28; // [rsp+1F2h] [rbp-56h]
  intv29; // [rsp+1F8h] [rbp-50h]
  charlpVersionInformation_; // [rsp+208h] [rbp-40h] BYREF
  intv31; // [rsp+20Ch] [rbp-3Ch]
 
  n119 = 119;
  v4 = 0;
  v19 = v0;
  v20 = v2;
  v18 = v1;
  sub_140027980(v16, 0, 0x114u);
  Version = RtlGetVersion((PRTL_OSVERSIONINFOW)&lpVersionInformation_);
  v17 = 0;
  if( Version )
  {
    if( Version >= 0 )
      gotoLABEL_3;
    return30;
  }
  if( (unsigned int)(v31 - 10240) > 0x4D2F ) // 10240 <= BuildNumber <= 29999
    return30;
LABEL_3:
  if( sub_1400020D0() )
    return43;
  v6 = __readcr4(); //检查CET
  _RAX = 7;
  __asm { cpuid }
  _RAX_1 = _RAX;
  _RBX_1 = _RBX;
  _RDX_1 = _RDX;
  if( (_RCX & 0x80) != 0 )
  {
    v12 = __readmsr(0x6A2u);
    if( (v6 & 0x800000) != 0 && (v12 & 1) != 0 )
      return44;
  }
  v29 = 0;
  _RAX_1 = 1638519;
  _RBX_1 = 1572867;
  n1835012 = 1835012;
  _RDX_1 = 1638405;
  n18 = 18;
  n5832731 = 5832731;
  n983058 = 983058;
  v28 = 0;
  while( 1 )
  {
    HIWORD(_RAX_1) ^= n119;
    if( (unsigned __int64)++v4 >= 0xC )
      break;
    n119 = _RAX_1;
  }
  LOWORD(v28) = 0;
  v13 = sub_140005C38((char*)&_RAX_1 + 2);
  if( v13 )
    sub_1400013E8(v13);
  return0;
}
```

其中sub_1400020D0先用 CPUID 0 匹配 "AuthenticAMD" ，随后调用sub_140022E54。

```cpp
charsub_1400020D0()
{
  charv0; // di
  __int128 v16; // xmm2
  __int128 v22; // xmm1
  __int128 v28; // [rsp+20h] [rbp-49h]
  __int64v29; // [rsp+24h] [rbp-45h]
  __int64v30[6]; // [rsp+30h] [rbp-39h] BYREF
  __int128 v31; // [rsp+60h] [rbp-9h]
  _OWORD v32[3]; // [rsp+70h] [rbp+7h] BYREF
  __int128 v33; // [rsp+A0h] [rbp+37h]
 
  v29 = 0;
  v0 = 0;
  __asm { cpuid }
  if( (_DWORD)_RBX == 1752462657 && (_DWORD)_RCX == 1145913699 && (_DWORD)_RDX == 1769238117 )//FAN
  {
    sub_140027980(v30, 0, 0x40u);
    _RAX = 0x80000000LL;
    __asm { cpuid }
    if( (unsigned int)_RAX >= 0x80000004 )//  CPUID 0x80000002 CPUID 0x80000003 CPUID 0x80000004
    {
      _RAX = 2147483650LL;
      __asm { cpuid }
      *((_QWORD *)&v28 + 1) = __PAIR64__(_RDX, _RCX);
      *(_QWORD *)&v28 = __PAIR64__(_RBX, _RAX);
      _RAX = 2147483651LL;
      v16 = v28;
      __asm { cpuid }
      *((_QWORD *)&v28 + 1) = __PAIR64__(_RDX, _RCX);
      *(_QWORD *)&v28 = __PAIR64__(_RBX, _RAX);
      _RAX = 2147483652LL;
      v22 = v28;
      __asm { cpuid }
      *((_QWORD *)&v28 + 1) = __PAIR64__(_RDX, _RCX);
      *(_QWORD *)&v28 = __PAIR64__(_RBX, _RAX);
      v32[0] = v16;
      v32[2] = v28;
      v33 = v31;
      HIBYTE(v33) = 0;
      v32[1] = v22;
      if( sub_140022E54(v32, qword_1400295E0)
        || sub_140022E54(v32, qword_1400295F0)
        || sub_140022E54(v32, qword_140029600)
        || sub_140022E54(v32, qword_140029610)
        || sub_140022E54(v32, qword_140029620)
        || sub_140022E54(v32, qword_140029630)
        || sub_140022E54(v32, qword_140029640)
        || sub_140022E54(v32, qword_140029650)
        || sub_140022E54(v32, qword_140029660) )
      {
        return1;
      }
    }
  }
  returnv0;
}
```

读取这三个CPUID 正好返回 Processor Brand String。

## NotifyRoutine

NotifyRoutine函数本身作为跳板 实际进入 sub_1402CB230

```cpp
voidsub_1402CB230(
     PEPROCESS Process,
     HANDLEProcessId,
     PPS_CREATE_NOTIFY_INFO CreateInfo)
 {
     if(CreateInfo == NULL                         //进程退出
         && sub_140011DEC(ProcessId)                
         && qword_140030AC8)                       
     {
         if(byte_14002D064)                        
         {
             KeClearEvent(&Event__0);
             byte_14002D064 = 0;
             KeWaitForSingleObject(
                 &Event__0,
                 Executive,
                 KernelMode,
                 FALSE,
                 Timeout);
         }
     }
 }
```

## 枚举内核模块

定位ZwQuerySystemInformation的交叉引用 ，几番查找找到sub_140005A74，ida无法正常输出伪代码。

还原调用处伪代码大致如下：

```cpp
ZwQuerySystemInformation(
    SystemModuleInformation,
    NULL,
    0,
    &required_length);
 
buffer = allocate(required_length);
ZwQuerySystemInformation(
    SystemModuleInformation,
    buffer,
    required_length,
    &required_length);
```

根据后续偏移和步长得到：

buffer + 0x00 -> NumberOfModules

buffer + 0x08 -> first RTL_PROCESS_MODULE_INFORMATION

record size -> 0x128

record + 0x10 -> ImageBase

record + 0x18 -> ImageSize

record + 0x28 -> FullPathName

让AI还原大致如此

```cpp
boolFindLoadedKernelModuleBySubstring(
    constwchar_t*target,
    MODULE_RESULT *result)
{
    modules = QuerySystemModuleInformation();
 
    for(ULONGi = 0; i < modules->NumberOfModules; ++i) {
        module = &modules->Entries[i];
        if((ULONG_PTR)module->ImageBase < 0x8000000000000000ULL ||
            module->ImageSize == 0)
            continue;
 
        path = ansi_to_unicode(module->FullPathName);
        uppercase(path);
        if(sub_140023180(path, target)) {
            result->ImageBase = module->ImageBase; // 输出结构 +0x208
            result->ImageSize = module->ImageSize; // 输出结构 +0x210
            returntrue;
        }
    }
    returnfalse;
    
}
 
__int64__fastcall sub_140005C38(_WORD *Src, _DWORD *a2)
{
  __int64v3; // rbx
  unsigned __int64n0x104; // rax
  __int64v6; // rdx
  __int64v7; // rcx
  wchar_tString[260]; // [rsp+20h] [rbp-248h] BYREF
  __int64v10; // [rsp+228h] [rbp-40h]
  intv11; // [rsp+230h] [rbp-38h]
 
  v3 = -1;
  n0x104 = -1;
  v6 = 0;
  do
    ++n0x104;
  while( Src[n0x104] );
  if( n0x104 < 0x104 ) //检查目标文本长度小于 转成大写，并返回映像基址与可选大小。
  {
    sub_140027980(String, 0, 544);
    do
      ++v3;
    while( Src[v3] );
    memmove(String, Src, 2 * v3);
    wcsupr(String);
    sub_140005A74(v7, String);
    v6 = v10;
    if( a2 )
      *a2 = v11;
  }
  returnv6;
}
```

字符串搜索中打开一看 ntoskrnl.exe

```cpp
v1 = sub_1400188D8(L"ntoskrnl.exe", &v6);
sub_14001964C("PAGE", v1, &v9, &v7, 0);
v2 = sub_1400172F0(v9, v7, v4, 17, 0);
```

```cpp
_int64 sub_140015878()
{
  __int64v0; // rbx
  __int64v1; // rax
  __int64v2; // rax
  _DWORD v4[4]; // [rsp+30h] [rbp-28h] BYREF
  charv5; // [rsp+40h] [rbp-18h]
  intv6; // [rsp+70h] [rbp+18h] BYREF
  intv7; // [rsp+78h] [rbp+20h] BYREF
  _BYTE PAGE[8]; // [rsp+80h] [rbp+28h] BYREF
  __int64v9; // [rsp+88h] [rbp+30h] BYREF
 
  v0 = 0;
  v6 = 0;
  v1 = sub_1400188D8(L"ntoskrnl.exe", &v6);
  if( v1 )
  {
    if( v6 )
    {
      strcpy(PAGE, "PAGE");
      v9 = 0;
      v7 = 0;
      sub_14001964C(PAGE, v1, &v9, &v7, 0);
      if( v9 )
      {
        if( v7 )
        {
          v4[0] = 1057852744;
          v4[1] = -398508225;
          v4[2] = 1061109567;
          v4[3] = 65597;
          v5 = 0;
          v2 = sub_1400172F0(v9, v7, (unsigned int)v4, 17, 0);
          if( v2 )
            return*(int*)(v2 + 3) + v2 + 7;
        }
      }
    }
  }
  returnv0;
}
```

四个DWORD按最后一个字节小端展开得到:

```cpp
48 8D 0D 3F 3F 3F 3F
 E8 3F 3F 3F 3F
 3D 00 01 00 00
也就是：
lea  rcx, [rip+xxxxxxxx]
 call xxxxxxxx
 cmp  eax, 10000h
```

所以 sub_1400172F0应该是FindPattern 函数

匹配位置开头是：

48 8D 0D xx xx xx xx

也就是：

```cpp
lea rcx, [rip + disp32]
```

该指令长度为 7 字节，位移位于 +3，所以 RIP 相对地址计算为：

```cpp
target = match_address
       + 7
       + *(INT32*)(match_address + 3);
```

## NMI回调

导入表中 直接找KeRegisterNmiCallback,KeDeregisterNmiCallback。

这几个函数都没能正确还原

sub_14000B1DC

\-> sub_14000AE70

\-> sub_14000B678

\-> sub_14000B4B4  

粗略查看了下 其调用KeIpiGenericCall 并且读取

MSR 0x1A0

MSR 0x1FC

MSR 0x34

MSR 0xE8 / IA32_APERF

CR4.VMXE 或 AMD EFER.SVME

sub_14000AE70 计算时间差应该是检测虚拟机

## WIN32K 获取 gTimerHashTable

依旧字符串大法

```cpp
__int64sub_140014354()
{
  __int64n16_1; // rdi
  __int64v1; // rsi
  unsigned intn16; // ebx
  __int64v3; // rax
  ULONGRequiredAccess; // edx
  charcsrss.exe[16]; // [rsp+20h] [rbp-40h] BYREF
  _BYTE v7[48]; // [rsp+30h] [rbp-30h] BYREF
  PIRP Irp; // [rsp+80h] [rbp+20h] BYREF
 
  n16_1 = 0;
  v1 = sub_1400188D8((__int64)L"win32k.sys", 0);
  if( v1 )
  {
    n16 = 16;
    while( 1 )
    {
      Irp = 0;
      if( (int)sub_140017710(n16, &Irp) < 0 || !Irp )
        gotoLABEL_11;
      if( !(unsigned __int8)sub_14001E440(Irp) )
        break;
LABEL_12:
      n16 += 4;
      if( n16 >= 0x4000 )
        returnn16_1;
    }
    v3 = sub_1400176C8(Irp);
    strcpy(csrss.exe, "csrss.exe");
    if( !(unsigned int)j___ascii_strnicmp(v3, csrss.exe, 9) )
    {
      sub_14001755C(Irp, v7);
      if( (unsigned __int8)sub_1400175AC(v1 + 4096) )
        n16_1 = n16;
      sub_140017580(v7);
    }
    WdmlibIoValidateDeviceIoControlAccess(Irp, RequiredAccess);
LABEL_11:
    if( n16_1 )
      returnn16_1;
    gotoLABEL_12;
  }
  returnn16_1;
}
```

也就是找到映射 win32k.sys 的 CSRSS PID 并且保存到qword_1400311D0

其中对应表为:

sub_140017710 -> PsLookupProcessByProcessId

sub_1400176C8 -> PsGetProcessImageFileName

sub_14001755C -> KeStackAttachProcess

sub_140017580 -> KeUnstackDetachProcess

sub_1400175AC -> MmIsAddressValid

继续向下追，寻找qword_1400311D0引用

```cpp
nsigned __int64sub_140015FA0()
{
  unsigned __int64v0; // rbx
  IRP *Irp; // rax
  IRP *Irp_1; // rdi
  unsigned __int64v3; // rax
  ULONGRequiredAccess; // edx
  _QWORD v6[7]; // [rsp+20h] [rbp-38h] BYREF
 
  v0 = 0;
  sub_140027980(v6, 0, 48);
  if( qword_1400311D0 )
  {
    Irp = (IRP *)sub_14001E000(qword_1400311D0);  根据 qword_1400311D0 查找 CSRSS 的 EPROCESS
    Irp_1 = Irp;
    if( Irp )
    {
      sub_14001755C(Irp, (__int64)v6);
      if( (unsigned __int8)sub_140019448() )
      {
        v3 = sub_1400160C4();  ResolveTimerHashTableWin7
      }
      else
      {
        if( (unsigned __int8)sub_1400194C8() || !(unsigned __int8)sub_140019418() ) 判断版本
          gotoLABEL_9;
        v3 = sub_14001602C(); ResolveTimerHashTableWin10
      }
      v0 = v3;
LABEL_9:
      sub_140017580((__int64)v6);
      WdmlibIoValidateDeviceIoControlAccess(Irp_1, RequiredAccess);
    }
  }
  returnv0;
}
 
 
charsub_140019448()
{
  __int64v0; // rax
  charv1; // cl
 
  if( *(_DWORD *)(sub_140016FE8() + 4) != 6 )
    return0;
  v0 = sub_140016FE8();
  v1 = 1;
  if( *(_DWORD *)(v0 + 8) != 1 )
    return0;
  returnv1;
}
_BOOL8 sub_1400194C8()
{
  return*(_DWORD *)(sub_140016FE8() + 4) == 6 && *(_DWORD *)(sub_140016FE8() + 8) == 2;
}
boolsub_140019418()
{
  return*(_DWORD *)(sub_140016FE8() + 4) == 10;
}
```

继续大调查

```cpp
__int64sub_14001602C()
{
  __int64v0; // rbx
  __int64v1; // rax
  __int64v2; // rdi
  __m128i si128; // [rsp+20h] [rbp-30h] BYREF
  _DWORD v5[7]; // [rsp+30h] [rbp-20h] BYREF
  __int16v6; // [rsp+4Ch] [rbp-4h]
 
  v0 = 0;
  v5[0] = 6881399; //win32kbase.sys
  v6 = 0;
  v5[1] = 3342446;
  v5[2] = 7012402;
  v5[3] = 6357090;
  v5[4] = 6619251;
  v5[5] = 7536686;
  v5[6] = 7536761;
  v1 = sub_1400188D8((__int64)v5, 0); //FindLoadedKernelModule
  v2 = v1;
  if( v1 && sub_1400175AC(v1) )
  {
    si128 = _mm_load_si128((const__m128i *)&xmmword_14002A510); 
    returnsub_14001B43C(v2, &si128);
  }
  returnv0;
}
```

xmmword_14002A510 的原始字节为：

```cpp
67 54 69 6D 65 72 48 61
73 68 54 61 62 6C 65 00
```

转换为 ASCII：

gTimerHashTable

可得：

qword_1400311D0 -> g_Win32kSessionCsrssPid

qword_1400311E0 -> g_TimerHashTableAddress

接下来看看他是怎么获取的

Windows7:

```cpp
unsigned __int64sub_1400160C4()
{
  __int64v0; // rdi
  __int64v1; // rax
  __int64v2; // rsi
  unsigned intv3; // eax
  char*VirtualAddress; // rbx
  char*VirtualAddress_1; // rsi
 
  v0 = 0;
  v1 = sub_1400188D8((__int64)L"win32k.sys", 0);
  v2 = v1;
  if( v1 )
  {
    if( (unsigned __int8)sub_1400175AC(v1) )
    {
      v3 = sub_14001B3FC(v2);
      if( v3 )
      {
        VirtualAddress = (char*)(v2 + v3);
        if( MmIsAddressValid(VirtualAddress) )
        {
          VirtualAddress_1 = VirtualAddress + 4096;
          if( MmIsAddressValid(VirtualAddress + 4096) )
          {
            while( VirtualAddress < VirtualAddress_1 )
            {
              if( *VirtualAddress == 72
                && VirtualAddress[1] == -119
                && VirtualAddress[2] == 5
                && VirtualAddress[7] == 72
                && VirtualAddress[8] == -119
                && VirtualAddress[9] == 5
                && VirtualAddress[14] == 72
                && VirtualAddress[15] == -115
                && VirtualAddress[16] == 5 )
              {
                return((unsigned __int64)(VirtualAddress + 14) & 0xFFFFFFFF00000000uLL)
                     + (unsigned int)((_DWORD)VirtualAddress + 14 + *(_DWORD *)(VirtualAddress + 17) + 7);
              }
              ++VirtualAddress;
            }
          }
        }
      }
    }
  }
  returnv0;
}
```

```cpp
win32k_base =
    FindLoadedKernelModule(L"win32k.sys");
sub_14001B3FC(win32k_base) 返回的值结合其调用方式，接近 PE 的 AddressOfEntryPoint RVA：
entry = win32k_base + entry_rva;
```

随后只扫描入口附近 0x1000 字节，寻找：

```cpp
48 89 05 ?? ?? ?? ??  
48 89 05 ?? ?? ?? ??
 48 8D 05 ?? ?? ?? ??
 
mov [rip+disp32_1], rax
 mov [rip+disp32_2], rax
 lea rax, [rip+disp32_3]
```

Windows10和11则都使用 FindPeExportOrNamedSymbol获取。
