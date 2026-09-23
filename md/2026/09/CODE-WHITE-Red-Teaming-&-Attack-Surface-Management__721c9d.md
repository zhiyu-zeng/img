---
title: CODE WHITE | Red Teaming & Attack Surface Management
source: https://code-white.com/blog/wsus-cve-2025-59287-analysis/
source_host: code-white.com
clip_date: 2026-09-23T10:32:18+08:00
trace_id: 1fcda376-30fc-4b32-8a5d-196da9527f0d
content_hash: 913769646fb9fe2afc15650cba9a2e033881413f5bfae0884bbffc56efc5bcfc
status: synced
tags:
  - 漏洞分析
  - .NET逆向
series: null
feed_source: Code White·漏洞研究
ai_summary: 追查 WSUS CVE-2025-59287 的 n-day 时，在 2025 年 10 月补丁新增的 SoapFormatter 反序列化路径中发现一个被官方当重复关闭的新漏洞。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3e475244-d011-8116-96ff-d6fd473ce605
ioc:
  cves:
    - CVE-2023-35317
    - CVE-2025-59287
  cwes: []
  hashes:
    - a714744bd7eedbcc58a38130e1307fb4c7fa020b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 追查 WSUS CVE-2025-59287 的 n-day 时，在 2025 年 10 月补丁新增的 SoapFormatter 反序列化路径中发现一个被官方当重复关闭的新漏洞。
> 
> - **线索：** CVE-2025-59287 的 FAQ 提到 "legacy serialization mechanism"，指向 .NET Framework 的 BinaryFormatter / SoapFormatter。
> - **新 sink：** 10 月补丁（KB5066782，程序集版本 10.0.20348.4294）在 `ReportingEvent.Validate()` 中新增 `SoapUtilities.DeserializeObject(byte[])`，反序列化 `ExtendedData.MiscData` 里 `SynchronizationUpdateErrorsKey` 的值；`WSUSDeserializationBinder` 只做程序集名替换，无类型白名单，可配 YSoSerial.Net 的 SoapFormatter gadget 达成 RCE。
> - **可达路径：** `/ReportingWebService/ReportingWebService.asmx` → `[WebMethod] ReportEventBatch` → `ValidateEventBatch` → `Validate`，调用层级很短。
> - **分析方法：** 用 ILSpy 反编译各版本 DLL 并按其文件版本号打 git tag；因根命名空间由 `Microsoft.UpdateServices` 改为 `Microsoft`、文件被移动，改用 `git show` + `diff -u` 比对单文件。
> - **处置与争议：** 10-16 报 MSRC，10-23 带外补丁（KB5070884）删除该反序列化调用改为抛异常，但报告被关闭为重复；外界博客所述 "CVE-2025-59287" 实为 CVE-2023-35317 的 BinaryFormatter 问题，10 月补丁究竟修复了什么仍不明确。

Finding 0-days can be tedious, time-consuming, and open-ended. And in the worst case, it can end up in nothing. In contrast, it’s easier and more promising to focus on n-days – after all, someone else has already proven the existence of a vulnerability. And with the help of diffing and patch analysis, locating the vulnerability in the code and developing an exploit is usually easier. And with a bit of luck, the changes are insufficient or may even have introduced new issues.

Here we tell the story of how the n-day research for a suspected vulnerability in WSUS (CVE-2025-59287) led to the surprising discovery of a new `SoapFormatter` vulnerability added by the Patch Tuesday updates of October 2025.

## Arousing Curiosity

Sometimes certain words can arouse curiosity, just like the following in the [FAQ section of Microsoft’s CVE-2025-59287](https://msrc.microsoft.com/update-guide/en-US/vulnerability/CVE-2025-59287#faq):

> **How could an attacker exploit this vulnerability?**
> 
> A remote, unauthenticated attacker could send a crafted event that triggers unsafe object deserialization in a legacy serialization mechanism, resulting in remote code execution.

When you read “legacy serialization mechanism”, don’t you also think of the [runtime serializers `BinaryFormatter` / `SoapFormatter` and derivatives of the.NET Framework](https://learn.microsoft.com/en-us/dotnet/standard/serialization/binaryformatter-security-guide)? Well, we do.

## Installing WSUS

The [WSUS installation](https://learn.microsoft.com/en-us/windows-server/administration/windows-server-update-services/deploy/1-install-the-wsus-server-role?tabs=server-manager) is quite easy: just add the Windows server role *Windows Server Update Services* and you’re done. The installation location is `C:\Program Files\Update Services`, the web services reachable via `http://<host>:8530` and `https://<host>:8531` are located in `.\WebServices`.

## Analyzing the October 2025 Security Update

For demonstation purpose, we’ll use a Windows Server 2022 installation. All [Windows Server 2022 releases](https://support.microsoft.com/kb/5005454) share the same OS build version base, that is `10.0.20348.x`. Here are the last two Patch Tuesday releases as well as the out-of-bound (OOB) release of Windows Server 2022 and their corresponding OS build versions:

| Release | KB  | OS Build |
| --- | --- | --- |
| September 9, 2025 | [KB5065432](http://support.microsoft.com/kb/5065432) | `10.0.20348.4171` |
| October 14, 2025 | [KB5066782](http://support.microsoft.com/kb/5066782) | `10.0.20348.4294` |
| October 23, 2025 (OOB) | [KB5070884](http://support.microsoft.com/kb/5070884) | `10.0.20348.4297` |

The corresponding `.msu` files can be downloaded from the [Microsoft Update Catalog](https://www.catalog.update.microsoft.com/) and accessed using 7-zip. The archive is quite complex and the `Microsoft.UpdateServices.BaseApi.dll` file we are looking for is deep within nested CAB files, for example in KB5065432:

```plaintext
windows10.0-kb5065432-x64_a714744bd7eedbcc58a38130e1307fb4c7fa020b.msu\Windows10.0-KB5065432-x64.cab\Windows10.0-KB5065432-x64.cab\Cab_1_for_KB5065432.cab\msil_microsoft.updateservices.baseapi_31bf3856ad364e35_10.0.20348.2849_none_e0bf2f431e28053e
```

For a more convenient diff analysis, we can use a git repository and insert each decompilation (you can use [ILSpy](https://github.com/icsharpcode/ILSpy) or similar tools for that) as a new commit and tag it with the corresponding [file version number](https://learn.microsoft.com/en-us/troubleshoot/developer/dotnet/framework/general/assembly-version-assembly-file-version) (which can also viewed in the [*File version* column in Explorer](https://support.microsoft.com/en-us/topic/how-to-change-column-settings-in-windows-explorer-7a6e06e5-85fe-62d5-c9a3-eed515e52aee) or in the *Details* tab of the file’s *Properties* window in Explorer):

```bash
$ git tag
10.0.20348.2849
10.0.20348.4294
10.0.20348.4297
```

Don’t be confused by the first tag version: it appears as if there were no updates to `Microsoft.UpdateServices.BaseApi.dll` since November 12, 2024 ([KB5046616](https://support.microsoft.com/kb/5046616)):

| Release | `Microsoft.UpdateServices.BaseApi` Version |
| --- | --- |
| September 9, 2025 | `10.0.20348.2849` |
| October 14, 2025 | `10.0.20348.4294` |
| October 23, 2025 (OOB) | `10.0.20348.4297` |

## Diffing Patch Tuesdays September 2025 and October 2025

A diff of `10.0.20348.2849` and `10.0.20348.4294` shows quite a lot of changes:

```bash
git diff --stat 10.0.20348.2849 10.0.20348.4294
```

A diff of the project file `Microsoft.UpdateServices.BaseApi/Microsoft.UpdateServices.BaseApi.csproj` reveals the reason for that:

```diff
diff --git a/Microsoft.UpdateServices.BaseApi/Microsoft.UpdateServices.BaseApi.csproj b/Microsoft.UpdateServices.BaseApi/Microsoft.UpdateServices.BaseApi.csproj
index 3e4ac79..273b909 100644
--- a/Microsoft.UpdateServices.BaseApi/Microsoft.UpdateServices.BaseApi.csproj
+++ b/Microsoft.UpdateServices.BaseApi/Microsoft.UpdateServices.BaseApi.csproj
@@ -3,10 +3,10 @@
   <PropertyGroup>
     <Configuration Condition=" '$(Configuration)' == '' ">Debug</Configuration>
     <Platform Condition=" '$(Platform)' == '' ">AnyCPU</Platform>
-    <ProjectGuid>{5F70440E-E51C-47BD-A540-AAA612A6CE05}</ProjectGuid>
+    <ProjectGuid>{13F97BA4-2A2A-48EE-A3E0-AA2F76714F5D}</ProjectGuid>
     <OutputType>Library</OutputType>
     <AppDesignerFolder>Properties</AppDesignerFolder>
-    <RootNamespace>Microsoft.UpdateServices</RootNamespace>
+    <RootNamespace>Microsoft</RootNamespace>
     <AssemblyName>Microsoft.UpdateServices.BaseApi</AssemblyName>
     <TargetFrameworkVersion>v4.5</TargetFrameworkVersion>
     <FileAlignment>512</FileAlignment>
```

Unfortunately, the root namespace was changed from `Microsoft.UpdateServices` to `Microsoft` and affected files were moved accordingly, which can be seen in the long list of “removed” and “added” files.

To still see the diff of a file with different paths in different tags, we can use `git show` to get the sources of each file and then use `diff -u` to get their diff, for example for `Microsoft.UpdateServices.Internal.Reporting.ReportingEvent` class:

```bash
diff -u \
    <(git show 10.0.20348.2849:Microsoft.UpdateServices.BaseApi/Internal/Reporting/ReportingEvent.cs) \
    <(git show 10.0.20348.4294:Microsoft.UpdateServices.BaseApi/UpdateServices/Internal/Reporting/ReportingEvent.cs)
```

This results in the following output:

```diff
--- /dev/fd/63	2025-10-16 07:01:51.000000000 +0000
+++ /dev/fd/62	2025-10-16 07:01:51.000000000 +0000
@@ -1,6 +1,9 @@
 using System;
+using System.Collections.Specialized;
 using System.Text;
+using Microsoft.UpdateServices.Administration;
 using Microsoft.UpdateServices.Internal.BaseApi;
+using Microsoft.Windows.Staging.Features;
 
 namespace Microsoft.UpdateServices.Internal.Reporting
 {
@@ -139,6 +142,40 @@
 			return stringBuilder.ToString();
 		}
 
+		public string GetKeyValue(string key, StringCollection pairs)
+		{
+			string text = null;
+			if (key == null)
+			{
+				throw new ArgumentNullException("key");
+			}
+			if (pairs == null)
+			{
+				throw new ArgumentNullException("pairs");
+			}
+			string text2 = string.Format(Constants.MiscDataParsableElementFormat, key, string.Empty);
+			foreach (string text3 in pairs)
+			{
+				if (text3.Length > text2.Length && !(text3.Substring(0, text2.Length) != text2))
+				{
+					text = text3.Substring(text2.Length);
+					if (!(text == string.Empty))
+					{
+						break;
+					}
+					text = null;
+				}
+			}
+			if (text == null)
+			{
+				throw new ArgumentException(LocalizedStrings.GetString(Constants.CannotFindKeyValuePairError, new object[]
+				{
+					key
+				}), "key");
+			}
+			return text;
+		}
+
 		public void Validate()
 		{
 			if (this.ExtendedData != null)
@@ -185,6 +222,29 @@
 						}));
 					}
 				}
+				if (Feature_2303416633.IsEnabled)
+				{
+					string text3 = string.Empty;
+					try
+					{
+						text3 = this.GetKeyValue("SynchronizationUpdateErrorsKey", this.ExtendedData.MiscData);
+					}
+					catch (ArgumentException)
+					{
+						text3 = string.Empty;
+					}
+					if (text3.Length > 0)
+					{
+						try
+						{
+							SynchronizationUpdateErrorInfoCollection synchronizationUpdateErrorInfoCollection = (SynchronizationUpdateErrorInfoCollection)SoapUtilities.DeserializeObject(Encoding.UTF8.GetBytes(text3));
+						}
+						catch (Exception)
+						{
+							throw new InvalidOperationException(LocalizedStrings.GetString(Constants.InvalidSetAttempt, new object[0]));
+						}
+					}
+				}
 			}
 		}
 
```

So, it’s evident that a call to `SoapUtilities.DeserializeObject(byte[])` was added in the October 2025 security updates (i.e., `10.0.20348.4294`).

Here, the value of a `SynchronizationUpdateErrorsKey` key-value pair is obtained from `ExtendedData.MiscData` of the current `ReportingEvent` instance and then passed as a byte array to `SoapUtilities.DeserializeObject(byte[])`. And that method is straight forward:

```csharp
// Microsoft.UpdateServices.Internal.SoapUtilities
public static object DeserializeObject(byte[] bytes)
{
	SoapFormatter soapFormatter = new SoapFormatter();
	soapFormatter.Binder = new WSUSDeserializationBinder("Microsoft.UpdateServices.Administration");
	if (bytes == null)
	{
		throw new ArgumentNullException("bytes");
	}
	MemoryStream serializationStream = new MemoryStream(bytes);
	return soapFormatter.Deserialize(serializationStream);
}
```

The used `WSUSDeserializationBinder` is not an obstacle:

```csharp
// Microsoft.UpdateServices.Internal.WSUSDeserializationBinder
public override Type BindToType(string assemblyNameToBind, string typeName)
{
	if (new AssemblyName(assemblyNameToBind).Name.Equals(this.shortAssemblyName, StringComparison.OrdinalIgnoreCase) && this.fullAssemblyName != null)
	{
		assemblyNameToBind = this.fullAssemblyName;
	}
	return Type.GetType(string.Format("{0}, {1}", typeName, assemblyNameToBind));
}
```

## From Sink to Source

So, how to reach the `ReportingEvent.Validate()` method containing the newly added `SoapUtilities.DeserializeObject(byte[])` call?

The path is quite short:

![Call hierarchy of ReportingEvent.Validate()](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/73f2f9c052828376.png "Call hierarchy of ReportingEvent.Validate()")

`ReportingEvent.Validate()` is called by `WebService.ValidateEventBatch(ReportingEvent[])` for each `ReportingEvent`:

```csharp
// Microsoft.UpdateServices.Internal.Reporting.WebService
private bool ValidateEventBatch(ReportingEvent[] eventBatch)
{
	if (eventBatch.Length >= WebService.MaxEventBatchLength)
	{
		// [...]
		return false;
	}
	foreach (ReportingEvent reportingEvent in eventBatch)
	{
		try
		{
			reportingEvent.Validate();
		}
		catch (InvalidOperationException ex)
		{
			// [...]
			return false;
		}
	}
	return true;
}
```

That again is called by `WebService.ReportEventBatch(Cookie, DateTime, ReportingEvent[])` at first before any further processing:

```csharp
// Microsoft.UpdateServices.Internal.Reporting.WebService
[WebMethod]
public bool ReportEventBatch(Cookie cookie, DateTime clientTime, ReportingEvent[] eventBatch)
{
	this.ThrowIfNotAcceptingEvents();
	bool result = false;
	if (this.ValidateEventBatch(eventBatch))
	{
		// [...]
	}
	return result;
}
```

The [`[WebMethod]` attribute](https://learn.microsoft.com/en-us/dotnet/api/system.web.services.webmethodattribute?view=netframework-4.8.1) marks this method callable as per [XML Web service](https://learn.microsoft.com/en-us/dotnet/api/system.web.services?view=netframework-4.8.1). And that web service is mapped by `/ReportingWebService/ReportingWebService.asmx`:

```xml
<%@ WebService Language="c#" Class="Microsoft.UpdateServices.Internal.Reporting.WebService,Microsoft.UpdateServices.WebServices.Reporting" %>
```

So, we’ve found the path from `ReportingWebService.asmx` to `SoapFormatter`. Now, how does a valid request look like?

Fortunately, Microsoft made the [*Windows Update Services: Client-Server Protocol (MS-WUSP)* specification](https://learn.microsoft.com/openspecs/windows_protocols/ms-wusp) public, including [protocol examples](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wusp/f9f47314-d480-4087-a86b-d9d2a86de3aa) for the `ReportEventBatch` operation containing `<MiscData>`, which can be reduced to the following:

```xml
<ReportEventBatch
	xmlns="http://www.microsoft.com/SoftwareDistribution"
	xmlns:xsd="http://www.w3.org/2001/XMLSchema"
	xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
>
	<eventBatch soapenc:arrayType="ReportingEvent[1]">
		<ReportingEvent>
			<ExtendedData>
				<MiscData soapenc:arrayType="xsd:string[1]">
					<string>SynchronizationUpdateErrorsKey=...</string>
				</MiscData>
			</ExtendedData>
		</ReportingEvent>
	</eventBatch>
</ReportEventBatch>
```

Putting this in a SOAP request with a suitable `SoapFormatter` gadget provided by [YSoSerial.Net](https://github.com/pwntester/ysoserial.net):

![Proof for reaching the SoapFormatter sink via ReportingWebService.asmx](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e271406fdf5d94f8.png "Proof for reaching the SoapFormatter sink via ReportingWebService.asmx")

We reported this newly introduced vulnerability to MSRC on October 16, 2025. One week later on October 23, Microsoft released an out-of-band security update. Unfortunately, this newly introduced vulnerability was treated as a duplicate of [CVE-2025-59287](https://msrc.microsoft.com/update-guide/en-US/vulnerability/CVE-2025-59287).

## Analyzing the Out-of-Band Patch of October 23, 2025

Let’s see what the out-of-band patch of October 23 changed:

```bash
git diff 10.0.20348.4294 10.0.20348.4297 -- Microsoft.UpdateServices.BaseApi/UpdateServices/Internal/Reporting/ReportingEvent.cs
```

The output:

```diff
diff --git a/Microsoft.UpdateServices.BaseApi/UpdateServices/Internal/Reporting/ReportingEvent.cs b/Microsoft.UpdateServices.BaseApi/UpdateServices/Internal/Reporting/ReportingEvent.cs
index 9989796..e0fd1ae 100644
--- a/Microsoft.UpdateServices.BaseApi/UpdateServices/Internal/Reporting/ReportingEvent.cs
+++ b/Microsoft.UpdateServices.BaseApi/UpdateServices/Internal/Reporting/ReportingEvent.cs
@@ -1,7 +1,6 @@
 using System;
 using System.Collections.Specialized;
 using System.Text;
-using Microsoft.UpdateServices.Administration;
 using Microsoft.UpdateServices.Internal.BaseApi;
 using Microsoft.Windows.Staging.Features;
 
@@ -222,7 +221,7 @@ namespace Microsoft.UpdateServices.Internal.Reporting
 						}));
 					}
 				}
-				if (Feature_2303416633.IsEnabled)
+				if (Feature_262877499.IsEnabled)
 				{
 					string text3 = string.Empty;
 					try
@@ -235,14 +234,10 @@ namespace Microsoft.UpdateServices.Internal.Reporting
 					}
 					if (text3.Length > 0)
 					{
-						try
+						throw new InvalidOperationException(LocalizedStrings.GetString(Constants.InvalidSetAttempt, new object[]
 						{
-							SynchronizationUpdateErrorInfoCollection synchronizationUpdateErrorInfoCollection = (SynchronizationUpdateErrorInfoCollection)SoapUtilities.DeserializeObject(Encoding.UTF8.GetBytes(text3));
-						}
-						catch (Exception)
-						{
-							throw new InvalidOperationException(LocalizedStrings.GetString(Constants.InvalidSetAttempt, new object[0]));
-						}
+							"UpdateErrors"
+						}));
 					}
 				}
 			}
```

Here we can see that they removed the call to `SoapUtilities.DeserializeObject(byte[])` introduced by the October 2025 security updates and throw an exception instead.

## Confusion About What CVE-2025-59287 Actually Is

There appears to be some confusion about what CVE-2025-59287 actually is. On October 18, a few days after Patch Tuesday, the blog post [*CVE-2025-59287 WSUS Remote Code Execution* by Batuhan Er](https://hawktrace.com/blog/CVE-2025-59287) was published, describing a `BinaryFormatter` vulnerability. Later, an introductory addendum was added to the blog post, acknowleding that the described vulnerability is [CVE-2023-35317](https://msrc.microsoft.com/update-guide/en-US/vulnerability/CVE-2023-35317); the rest of the blog post remained unchanged:

> Due to a version-related issue, the vulnerability was mentioned in the blog post with an incorrect CVE number. The CVE number for this post is CVE-2023-35317, while the next post will correspond to CVE-2025-59287.

This appears to be more accurate, as it actually corresponds with changes in the code, as the following diff of `Microsoft.UpdateServices.CoreCommon.dll` in versions `10.0.17763.1971` ([KB5003217](http://support.microsoft.com/kb/5003217), May 2021) and `10.0.17763.4645` ([KB5028168](http://support.microsoft.com/kb/5028168), July 2023) shows:

```diff
diff --git a/Microsoft.UpdateServices.CoreCommon/UpdateServices/Internal/Authorization/EncryptionHelper.cs b/Microsoft.UpdateServices.CoreCommon/UpdateServices/Internal/Authorization/EncryptionHelper.cs
index bd89793..de2340c 100644
--- a/Microsoft.UpdateServices.CoreCommon/UpdateServices/Internal/Authorization/EncryptionHelper.cs
+++ b/Microsoft.UpdateServices.CoreCommon/UpdateServices/Internal/Authorization/EncryptionHelper.cs
@@ -1,7 +1,7 @@
 using System;
 using System.IO;
-using System.Runtime.Serialization.Formatters.Binary;
 using System.Security.Cryptography;
+using System.Xml.Serialization;
 
 namespace Microsoft.UpdateServices.Internal.Authorization
 {
@@ -52,7 +52,7 @@ namespace Microsoft.UpdateServices.Internal.Authorization
 			else
 			{
 				MemoryStream memoryStream = new MemoryStream();
-				new BinaryFormatter().Serialize(memoryStream, cookieData);
+				new XmlSerializer(this.classType).Serialize(memoryStream, cookieData);
 				array = memoryStream.GetBuffer();
 			}
 			ICryptoTransform cryptoTransform = this.cryptoServiceProvider.CreateEncryptor();
@@ -127,11 +127,11 @@ namespace Microsoft.UpdateServices.Internal.Authorization
 			}
 			else
 			{
-				BinaryFormatter binaryFormatter = new BinaryFormatter();
-				MemoryStream serializationStream = new MemoryStream(array);
+				XmlSerializer xmlSerializer = new XmlSerializer(this.classType);
+				MemoryStream stream = new MemoryStream(array);
 				try
 				{
-					obj = binaryFormatter.Deserialize(serializationStream);
+					obj = xmlSerializer.Deserialize(stream);
 				}
 				catch (Exception ex2)
 				{
```

Additionally, on October 22, another blog post was published by Batuhan Er, [*CVE-2025-59287 WSUS Unauthenticated RCE*](https://hawktrace.com/blog/CVE-2025-59287-UNAUTH), which once again claims to contain details about CVE-2025-59287. It describes the very same `SoapFormatter` sink path detailed in here that we reported on October 16, before the out-of-band patch was actually released on October 23. Presumably the diff between September 2025 and October 2025 was just misinterpreted, since `SoapFormatter` sink path was only *added* in October and not removed.

In the end, it’s still not quite clear what the security update of October 2025 actually fixed as we did not find any other security related change between September and October 2025 except for the introduction of the `SoapFormatter` sink path.

## Timeline

-   2025-10-14: Microsoft released the October 2025 Security Updates
-   2025-10-16: Discovery of the `SoapFormatter` sink reachable from `/ReportingWebService/ReportingWebService.asmx`
-   2025-10-16: Reported vulnerability to Microsoft via their MSRC Research Portal
-   2025-10-23: Microsoft released out-of-band security update that removed the reported `SoapFormatter` sink path
-   2025-10-24: Microsoft closed the vulnerability report as duplicate
