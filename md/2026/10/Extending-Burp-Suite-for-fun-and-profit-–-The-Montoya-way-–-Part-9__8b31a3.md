---
title: Extending Burp Suite for fun and profit – The Montoya way – Part 9
source: https://hnsecurity.it/blog/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-9/
source_host: hnsecurity.it
clip_date: 2026-10-06T10:22:09+08:00
trace_id: fcf00d74-510c-4ee4-9c33-3d19d78dbaf5
content_hash: cf31bfe5efc0e7f0b4bbba38c61858d82cde45c02600a7a8da50bdc6cc12c4e6
status: synced
tags:
  - 安全工具
  - 漏洞分析
series: Extending Burp Suite for fun and profit – The Montoya way
feed_source: HN Security·漏洞研究
ai_summary: Burp Suite 2025.9.5 起新增 Java 风格的自定义扫描检查，可在不写独立扩展的情况下把主动/被动扫描逻辑直接内嵌进 Scanner。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3f175244-d011-81fe-b175-cdb5dcf84879
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Burp Suite 2025.9.5 起新增 Java 风格的自定义扫描检查，可在不写独立扩展的情况下把主动/被动扫描逻辑直接内嵌进 Scanner。
> 
> - **版本与入口：** Burp Suite 2025.9.5 起新增类 Bambdas 的 Java 风格脚本，与原 BChecks 一并归入 Extensions 的“Custom scan check”标签页，可创建、启停、导入导出和删除。
> - **类型与粒度：** ACTIVE 检查可按插入点、请求或主机执行，PASSIVE 检查可按请求或主机执行；不同组合暴露的对象不同。
> - **对象与返回：** 所有检查都能拿到 requestResponse 和 api，主动检查额外有 http，按插入点执行的还有 insertionPoint，统一返回 AuditResult。
> - **计时改进：** Montoya 的 timingData() 直接给出“请求发出到响应开始”的毫秒数，取代旧版手工计时，时延阈值取 9000ms。
> - **移植与提速：** CommonsCollections3 时延检测、序列化魔数被动检测、Collaborator DNS 检测三段代码几乎原样移植（仅内联静态数据与辅助方法）；可建只启用自定义检查的扫描配置并禁用内置及扩展检查。

1.  [Setting up the environment + Hello World](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-1)
2.  [Inspecting and tampering HTTP requests and responses](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-2)
3.  [Inspecting and tampering WebSocket messages](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-3)
4.  [Creating new tabs for processing HTTP requests and responses](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-4)
5.  [Adding new functionalities to the context menu (accessible by right-clicking)](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-5/)
6.  [Adding new checks to Burp Suite Active and Passive Scanner](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-6/)
7.  [Using the Collaborator in Burp Suite plugins](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-7/)
8.  [BChecks – A quick way to extend Burp Suite Active and Passive Scanner](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-8/)
9.  **Custom scan checks – An improved quick way to extend Burp Suite Active and Passive Scanner**
10.  [Burp AI](https://hnsecurity.it/blog/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-10/)
11.  … and much more!

Hi there!

In the past three articles, we have seen how to **extend Burp’s Active and Passive scanner**, how to use the **Collaborator** and how to use **BChecks**, a recent feature that allows to add checks to the Active and Passive Scanner without developing dedicated extensions.

BChecks are a very quick way to extend Burp Scanner but they can be used only for a small subset of checks. As we saw in [Part 8](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-8/), none of the checks implemented for the active scanner in [Part 6](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-6/) and [Part 7](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-7/) could be defined using BChecks. In the case of [Part 6](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-6/), this is because BChecks currently do not allow to obtain the response time, and in the case of [Part 7](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-7/), it is not possible to perform operations on byte arrays, which are necessary for constructing the payloads used in that particular extension.

## 新功能：自定义扫描检查

Now, since version 2025.9.5 of Burp Suite, we can also extend Burp Suite Scanner without a dedicated extension with a **Java-like language**, in a similar way of what we do with **Bambda** filters present in many Burp Suite tools. This new functionality has been grouped with BChecks under the new “ **Custom scan checks” extension tab.** With this new powerful option, we can create a custom scan check with almost all the functionalities we have in a standalone extension. Obviously, for complex scenarios, a full-blown external extension may be the best (or the only viable) option, but if our check is not too complex and does not require external libraries, custom scan checks are a great option (actually, in the Extender settings we can point Burp to a folder where it will look for Java libraries; I don’t think we can call them from custom scan checks, but to be honest I haven’t tried yet).

Custom scan checks can be created, enabled/disabled, imported/exported, deleted, etc. in the Extensions tab of Burp Suite, in the “Custom scan check” tab. This tab has replaced the old “BChecks” tab, because now you can create both Java-like scan checks and YAML-like BChecks.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/722ceabd9251d77d.png)

The development environment is the same we saw in the [BChecks article](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-8/). We have a full development environment that can be used to develop, test, and try the custom scan checks. We have tools to **develop the code**, **check if syntax is correct,** **test on sample requests/responses**, a **dedicated Logger, Issue activity, and Event log tabs.** Refer to [Part 8](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-8/) for a full description of the development environment.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/de2a6604be0ea426.png)

We can create the following types of Java-like custom scan checks:

## 检查类型与运行粒度

-   Type: **ACTIVE** – > Active checks can make request to actively probe for vulnerabilities
    -   Check runs: Per insertion point -> Executed once per insertion point; most common type of operation that add payload in parameters, headers, and cookies (e.g., probe for SQL Injection in a GET parameter)
    -   Check runs: Per request -> Executed once per request; commonly used for checks that manipulate the full request or response (e.g., payload that replaces the request body)
    -   Check runs: Per host -> Executed once per host; commonly used for checks that require only host information (e.g., check for the presence of the “/manager/html” admin interface)
-   Type: **PASSIVE** -> Passive checks should analyze traffic without making any new request
    -   Check runs: Per request -> Executed once per request; commonly used for checks that analyze the full request or response (e.g., check for the presence of serialized objects in requests/responses)
    -   Check runs: Per host -> Executed once per host; commonly used for checks that execute analysis on properties that should be consistent across the same host (e.g., security headers or information leakage on “Server” header)

Depending on the plugin type and check run, we have different objects available from our code. We can inspect the available objects as follows:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6ce61c70099ca145.png)

All plugins have:

-   The [HttpRequestResponse](https://portswigger.github.io/burp-extensions-montoya-api/javadoc/burp/api/montoya/http/message/HttpRequestResponse.html) object (parameter *requestResponse*), that contains the request/response currently analyzed
-   The [MontoyaApi](https://portswigger.github.io/burp-extensions-montoya-api/javadoc/burp/api/montoya/MontoyaApi.html) object (parameter *api*), that is the core of each Montoya plugin (as we saw in previous articles) and give access to all Burp Suite tools and instruments

Active plugins can also access an [Http](https://portswigger.github.io/burp-extensions-montoya-api/javadoc/burp/api/montoya/http/Http.html) object (parameter *http*) that can be used to send requests (that I think is the same object that we can get directly from the MontoyaApi object with *api.http()* ). Finally, active checks executed per insertion point have also an [AuditInsertionPoint](https://portswigger.github.io/burp-extensions-montoya-api/javadoc/burp/api/montoya/scanner/audit/insertionpoint/AuditInsertionPoint.html) object (parameter *insertionPoint*) with details on the specific insertion point and useful functions to create copies of the target request with our payload in the current insertion point.

We already saw all these objects in [Part 6](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-6/) and [Part 7](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-7/), because they are exactly the same objects used in external Montoya scanner extensions. All plugins must return an [AuditResult](https://portswigger.github.io/burp-extensions-montoya-api/javadoc/burp/api/montoya/scanner/AuditResult.html) object, that contains the found issues (and that is again the same object returned in external scanner extensions).

So, in [Part 8](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-8/) we saw some BChecks examples, but we could not implement checks of [Part 6](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-6/) and [Part 7](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-7/) due to some BCheck limitations. Now, **using the new Java-like script engine we can implement those checks**. So, let’s port them! We will use the same target application and environment for this purpose: a **Java application that deserializes the input sent to it**, packaged with a vulnerable version of the Apache Commons Collections 3 library, which offers one of these serializable objects that allow for the execution of arbitrary Java code once deserialized. The sample target application can be downloaded from [my Github repository](https://github.com/federicodotta/Burp-Suite-Extender-Montoya-Course/tree/main). To deploy it, a Java application server is necessary. I used **Apache Tomcat**, which is easy to configure (for details on the vulnerable environment refer to [Part 6](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-6/)).

Let’s start with the **active check** we coded in [Part 6](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-6/), that tries to **detect Java serialization vulnerabilities** using a sleep payload for the Apache Commons Collections 3 library. We implemented this check as follows:

```java
@Override
public AuditResult activeAudit(HttpRequestResponse baseRequestResponse, AuditInsertionPoint auditInsertionPoint) {

    // Inizialize an empty list of audit issues that we will eventually populate and return at the end of the function
    List<AuditIssue> activeAuditIssues = new ArrayList<AuditIssue>();

    // For each CommonsCollections 3 payload we defined, we try to exploit the issue
    for(int i = 0; i< StaticItems.apacheCommonsCollections3Payloads.length; i++) {

        // We create an HTTP request containing our payload in the current insertion point
        HttpRequest commonsCollectionsCheckRequest = auditInsertionPoint.buildHttpRequestWithPayload(
                ByteArray.byteArray(StaticItems.apacheCommonsCollections3Payloads[i]))
                .withService(baseRequestResponse.httpService());

        // We record the current time, execute the request and record the time again
        long startTime = System.nanoTime();
        HttpRequestResponse commonsCollectionsCheckRequestResponse = api.http().sendRequest(commonsCollectionsCheckRequest);
        long endTime = System.nanoTime();

        // We calculate the internal between when we sent the request and when we received the response (converted in seconds)
        long duration = TimeUnit.SECONDS.convert((endTime - startTime), TimeUnit.NANOSECONDS);

        // If the internval is greater than 9 seconds we may have a vulnerable endpoint (our payloads sleep for 10 seconds)
        if (((int) duration) >= 9) {

            // In this case, we create an issue object and adds it to the list of issues to be returned
            AuditIssue auditIssue = AuditIssue.auditIssue(StaticItems.apacheCommonsCollections3IssueName,
                    StaticItems.apacheCommonsCollections3IssueDetail,
                    null, // remediation
                    baseRequestResponse.request().url(),
                    StaticItems.apacheCommonsCollections3IssueSeverity,
                    StaticItems.apacheCommonsCollections3IssueConfidence,
                    null, // background
                    null, // remediationBackground
                    StaticItems.apacheCommonsCollections3IssueTypicalSeverity,
                    commonsCollectionsCheckRequestResponse); //Request/response can be highlighted

            activeAuditIssues.add(auditIssue);

        }

    }

    // Return the list of issues
    return AuditResult.auditResult(activeAuditIssues);

}
```

This is an **active** scan check, that should apply to **each insertion point**. So, we should configure the new custom scan check accordingly.

The code of the ported custom scan check is the following:

```java
/**
 * Check for exploitable Java serialization issues with Apache Commons Collections 3 library (using time).
 * 
 * @author apps3c
**/

// Serialization attack vectors for Apache Commons Collections 3
String[] apacheCommonsCollections3Payloads = new String[] {"rO0[...]fgA5",
"rO0[...]HEAfgAu",
"rO0A[...]AHh4eA==",
"rO0[...]J4"};

// List of issues to return
List<AuditIssue> activeAuditIssues = new ArrayList<AuditIssue>();

// For each CommonsCollections 3 payload we defined, we try to exploit the issue
for(int i = 0; i< apacheCommonsCollections3Payloads.length; i++) {

    // We create an HTTP request containing our payload in the current insertion point
    HttpRequest commonsCollectionsCheckRequest = insertionPoint.buildHttpRequestWithPayload(
        ByteArray.byteArray(apacheCommonsCollections3Payloads[i]))
    .withService(requestResponse.httpService());

    // We execute the request
    HttpRequestResponse commonsCollectionsCheckRequestResponse = http.sendRequest(commonsCollectionsCheckRequest);

    // We extract timing information
    Optional<TimingData> requestWithPayloadTiming = commonsCollectionsCheckRequestResponse.timingData();
    if(requestWithPayloadTiming.isPresent()) {

        // We get the amount of time that passed from request to response
        Duration requestWithPayloadTimingMs  = requestWithPayloadTiming.get().timeBetweenRequestSentAndStartOfResponse();
        long timingThresholdMs = 9000;

        // If this time is more or equals to 9 seconds we report the issue (our payload causes a sleep in the backend of 10 seconds)
        if (requestWithPayloadTimingMs.toMillis() >= timingThresholdMs) {

            String apacheCommonsCollections3IssueName = "Remote Code Execution through Java Unsafe Deserialization, vulnerable library: Apache Commons Collections 3";
            String apacheCommonsCollections3IssueDetail = "The application deserializes untrusted serialized Java objects,"+
            " without first checking the type of the received object and run on an unpatched Java environment. This issue can be"+
            " exploited by sending malicious objects that, when deserialized,"+
            " execute custom Java code. Several objects defined in popular libraries"+
            " can be used for the exploitation.";

            // We create an issue object and adds it to the list of issues to be returned
            activeAuditIssues.add(AuditIssue.auditIssue(apacheCommonsCollections3IssueName,
                apacheCommonsCollections3IssueDetail,
                null, // remediation
                requestResponse.request().url(),
                AuditIssueSeverity.HIGH,
                AuditIssueConfidence.FIRM,
                null, // background
                null, // remediationBackground
                AuditIssueSeverity.HIGH,
                commonsCollectionsCheckRequestResponse)); //Request/response can be highlighted

        }

    }

}

return AuditResult.auditResult(activeAuditIssues);
```

In this check we used the *requestReponse*, the *http* and the *insertionPoint* objects made available to us (in this example we did not use the *api* object because we need only the other objects for this particular check; we will use the *api* object in a later example).

## 利用 timingData 计时

As we can see, **the code is almost the same**. I only moved payloads and issue detail directly in the check (while in a structured plugin I can move this information outside to make the code more readable) and I made a little change in the way I calculate the timing of the response. In my previous example, I calculated the time “manually”, because the code was partially copied from my [Java Deserialization Scanner](https://github.com/federicodotta/Java-Deserialization-Scanner) plugin, created with the legacy Burp Extender APIs. With the Montoya API we have a better way to calculate the time of the response, thanks to the [timing information recorded in the HttpRequestResponse object](https://portswigger.github.io/burp-extensions-montoya-api/javadoc/burp/api/montoya/http/handler/TimingData.html), not present in the legacy APIs. With the new Montoya API we can easily **extract the milliseconds between request sent and start of response received** as follows:

```
HttpRequestResponse commonsCollectionsCheckRequestResponse = http.sendRequest(commonsCollectionsCheckRequest);
Optional<TimingData> requestWithPayloadTiming = commonsCollectionsCheckRequestResponse.timingData();
if(requestWithPayloadTiming.isPresent()) {
    Duration requestWithPayloadTimingMs  = requestWithPayloadTiming.get().timeBetweenRequestSentAndStartOfResponse();
    long millis = requestWithPayloadTimingMs.toMillis();
}
```

In a similar way, we can port also the **passive check** implemented in [Part 6](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-6/) to find serialized objects in HTTP requests. The original code is the following:

```java
@Override
public AuditResult passiveAudit(HttpRequestResponse baseRequestResponse) {

    // Inizialize an empty list of audit issues that we will eventually populate and return at the end of the function
    List<AuditIssue> passiveAuditIssues = new ArrayList<AuditIssue>();

    //Extract request bytes
    ByteArray request = baseRequestResponse.request().toByteArray();

    // Check for the magic bytes of Java serialized object (not encoded and Base64 encoded)
    int indexOfSerializationMagicBytes = request.indexOf(ByteArray.byteArray(serializationMagicBytes));
    int indexOfBase64MagicBytes = request.indexOf(ByteArray.byteArray(base64MagicBytes));

    // Improvement -> Search all matches with a while instead of an if

    // If we found the magic bytes we report the passive issue
    if(indexOfSerializationMagicBytes != -1 || indexOfBase64MagicBytes != -1) {

        // Calculate the indexes to highligh the start of the serialized object in the request
        int startIndex;
        if(indexOfSerializationMagicBytes != -1)
            startIndex = indexOfSerializationMagicBytes;
        else
            startIndex = indexOfBase64MagicBytes;
        int endIndex = startIndex+4;

        // Create the markers to highlight the request in the reported issue
        List<Marker> highlights = new ArrayList<Marker>();
        Marker marker = Marker.marker(startIndex, endIndex);
        highlights.add(marker);

        // Report the passive issue
        AuditIssue auditIssue = AuditIssue.auditIssue(StaticItems.passiveSerializationIssueName,
                StaticItems.passiveSerializationIssueDetail,
                null, // remediation
                baseRequestResponse.request().url(),
                StaticItems.passiveSerializationIssueSeverity,
                StaticItems.passiveSerializationIssueConfidence,
                null, // background
                null, // remediationBackground
                StaticItems.passiveSerializationIssueTypicalSeverity,
                baseRequestResponse.withRequestMarkers(highlights));

        passiveAuditIssues.add(auditIssue);


    }

    // Return the list of issues
    return AuditResult.auditResult(passiveAuditIssues);

}
```

This is a **passive** scan check that should be executed **for each request**. So, we should configure the new custom scan check accordingly.

The code of the ported custom scan check is the following:

```java
/**
 * Passively detect serialized object (raw or base64 encoded in HTTP requests)
 * 
 * @author apps3c
**/

// Serialization magic bytes
byte[] serializationMagicBytes = {(byte)0xac, (byte)0xed, (byte)0x00, (byte)0x05};
byte[] base64MagicBytes = {(byte)0x72, (byte)0x4f, (byte)0x30, (byte)0x41};

// Extract request bytes
ByteArray request = requestResponse.request().toByteArray();

// Check for the magic bytes of Java serialized object (not encoded and Base64 encoded)
int indexOfSerializationMagicBytes = request.indexOf(ByteArray.byteArray(serializationMagicBytes));
int indexOfBase64MagicBytes = request.indexOf(ByteArray.byteArray(base64MagicBytes));

// If we found the magic bytes we report the passive issue
if(indexOfSerializationMagicBytes != -1 || indexOfBase64MagicBytes != -1) {

    // Calculate the indexes to highligh the start of the serialized object in the request
    int startIndex;
    if(indexOfSerializationMagicBytes != -1)
        startIndex = indexOfSerializationMagicBytes;
    else
        startIndex = indexOfBase64MagicBytes;
    int endIndex = startIndex+4;

    // Create the markers to highlight the request in the reported issue
    List<Marker> highlights = new ArrayList<Marker>();
    Marker marker = Marker.marker(startIndex, endIndex);
    highlights.add(marker);        
    
    String passiveSerializationIssueName = "Serialized Java objects detected";
    String passiveSerializationIssueDetail = "Serialized Java objects have been detected in the body"+
        " or in the parameters of the request. If the server application does "+
        " not check on the type of the received objects before"+
        " the deserialization phase, it may be vulnerable to the Java Deserialization"+
        " Vulnerability.";

    // Report the passive issue
    return AuditResult.auditResult(AuditIssue.auditIssue(
        passiveSerializationIssueName,
        passiveSerializationIssueDetail,
            null, // remediation
            requestResponse.request().url(),
            AuditIssueSeverity.INFORMATION,
            AuditIssueConfidence.FIRM,
            null, // background
            null, // remediationBackground
            AuditIssueSeverity.INFORMATION,
            requestResponse.withRequestMarkers(highlights)));

} else {

    return AuditResult.auditResult();
    
}
```

As before, the code is almost identical. I only moved issue details and other static data inside the check, without any important modification in the code. In this example, I used only the *httpRequestReponse* object.

Finally, we will port the **Collaborator** active check that we wrote in [Part 7](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-7/), that detects serialization issues using different serialized objects that, once deserialized, cause the **DNS resolution of arbitrary domains** (so, our detection will be based on external interactions rather than on timing).

Let’s have a look at the original code:

```java
// This method create serialized objects with specific Collaborator URLs. Serialized object are binary
// and we cannot simply replace a placeholder in the payload but it is necessary to fix a couple
// of lengths in the binary objects, that depend on the legnth of the Collaborator URL.
public ByteArray createDnsPayload(ByteArray genericPayload, String collaboratorURL) {

    String hostTokenString = "XXXXX";

    int indexPlaceholderFirstUrlCharacter = genericPayload.indexOf(hostTokenString, true);
    int indexPlaceholderLastUrlCharacter = indexPlaceholderFirstUrlCharacter + hostTokenString.length() -1;

    int newCollaboratorVectorLength = collaboratorURL.length();

    ByteArray payloadPortionBeforeUrl = genericPayload.subArray(0, indexPlaceholderFirstUrlCharacter);
    ByteArray payloadPortionAfterUrl = genericPayload.subArray(indexPlaceholderLastUrlCharacter+1, genericPayload.length());

    payloadPortionBeforeUrl.setByte(payloadPortionBeforeUrl.length()-1, (byte)newCollaboratorVectorLength);

    ByteArray payloadWithCollaboratorUrl = payloadPortionBeforeUrl.withAppended(ByteArray.byteArray(collaboratorURL));
    payloadWithCollaboratorUrl = payloadWithCollaboratorUrl.withAppended(payloadPortionAfterUrl);

    // Adjust one more length in the serialization process when the TemplateImpl object is used for exploitation
    ByteArray patternTemplateImplToSearch = ByteArray.byteArray(new byte[]{(byte)0xf8,(byte)0x06,(byte)0x08,(byte)0x54,(byte)0xe0,(byte)0x02,(byte)0x00,(byte)0x00,(byte)0x78,(byte)0x70,(byte)0x00,(byte)0x00,(byte)0x06});
    int indexOfPatternTemplateImpl = payloadWithCollaboratorUrl.indexOf(patternTemplateImplToSearch,false);
    if(indexOfPatternTemplateImpl != -1)
        payloadWithCollaboratorUrl.setByte(indexOfPatternTemplateImpl+13, (byte)(payloadWithCollaboratorUrl.getByte(indexOfPatternTemplateImpl+13) + (newCollaboratorVectorLength - 5)));

    return payloadWithCollaboratorUrl;

}

@Override
public AuditResult activeAudit(HttpRequestResponse baseRequestResponse, AuditInsertionPoint auditInsertionPoint) {

    // Inizialize an empty list of audit issues that we will eventually populate and return at the end of the function
    List<AuditIssue> activeAuditIssues = new ArrayList<AuditIssue>();

    // For each CommonsCollections 3 payload we defined, we try to exploit the issue
    for(int i = 0; i< StaticItems.apacheCommonsCollections3Payloads.length; i++) {

        // We generate a Collaborator URL
        String collaboratorUrl = collaboratorClient.generatePayload().toString();

        // We update our serialized object inserting the generated Collaborator URL
        ByteArray payloadWithCollaboratorUrl = utilities.base64Utils().encode(
                createDnsPayload(
                        utilities.base64Utils().decode(StaticItems.apacheCommonsCollections3Payloads[i]),
                        collaboratorUrl));

        // We create an HTTP request containing our payload in the current insertion point
        HttpRequest commonsCollectionsCheckRequest = auditInsertionPoint.buildHttpRequestWithPayload(
                payloadWithCollaboratorUrl).withService(baseRequestResponse.httpService());

        // We send the request containing the payload
        HttpRequestResponse commonsCollectionsCheckRequestResponse = api.http().sendRequest(commonsCollectionsCheckRequest);

        // We retrieve the interactions received by the Collaborator related to our specific Collaborator URL
        List<Interaction> interactionList = collaboratorClient.getInteractions(InteractionFilter.interactionPayloadFilter(collaboratorUrl));

        if(interactionList.size() > 0) {

            // If we have interactions, we create an issue object and adds it to the list of issues to be returned
            AuditIssue auditIssue = AuditIssue.auditIssue(StaticItems.apacheCommonsCollections3IssueName,
                    StaticItems.apacheCommonsCollections3IssueDetail,
                    null, // remediation
                    baseRequestResponse.request().url(),
                    StaticItems.apacheCommonsCollections3IssueSeverity,
                    StaticItems.apacheCommonsCollections3IssueConfidence,
                    null, // background
                    null, // remediationBackground
                    StaticItems.apacheCommonsCollections3IssueTypicalSeverity,
                    commonsCollectionsCheckRequestResponse); //Request/response can be highlighted

            activeAuditIssues.add(auditIssue);

        }

    }

    // Return the list of issues
    return AuditResult.auditResult(activeAuditIssues);

}
```

This is an **active** scan check, that should apply to **each insertion point**. So, we should configure the new custom scan check accordingly.

The code of the ported custom scan check is the following:

```java
/**
 * Check for exploitable Java serialization issues with Apache Commons Collections 3 library (using Collaborator).
 * 
 * @author apps3c
**/

// Serialization attack vectors for Apache Commons Collections 3
String[] apacheCommonsCollections3Payloads = new String[] {"rO0[...]ADc=",
    "rO0[...]4ALg==",
    "rO0[...]AB4eA==",
    "rO0[...]AAAeHh4",
    "rO0[...]AAng="};

// List of issues to return
List<AuditIssue> activeAuditIssues = new ArrayList<AuditIssue>();

// Get a reference to the collaborator client
CollaboratorClient collaboratorClient = api.collaborator().createClient();

// Get a refence to Burp Suite utilities (we will use them to Base64 encode/decode)
Utilities utilities = api.utilities();

// For each CommonsCollections 3 payload we defined, we try to exploit the issue
for(int i = 0; i< apacheCommonsCollections3Payloads.length; i++) {

    // We generate a Collaborator URL
    String collaboratorURL = collaboratorClient.generatePayload().toString();

    ByteArray payloadWithCollaboratorUrl;

    // *************** PAYLOAD CREATION ****************************
    // These lines create serialized objects with specific Collaborator URLs. Serialized object are binary
    // and we cannot simply replace a placeholder in the payload but it is necessary to fix a couple
    // of lengths in the binary objects, that depend on the legnth of the Collaborator URL.

    ByteArray genericPayload = utilities.base64Utils().decode(apacheCommonsCollections3Payloads[i]);
    String hostTokenString = "XXXXX";

    int indexPlaceholderFirstUrlCharacter = genericPayload.indexOf(hostTokenString, true);
    int indexPlaceholderLastUrlCharacter = indexPlaceholderFirstUrlCharacter + hostTokenString.length() -1;

    int newCollaboratorVectorLength = collaboratorURL.length();

    ByteArray payloadPortionBeforeUrl = genericPayload.subArray(0, indexPlaceholderFirstUrlCharacter);
    ByteArray payloadPortionAfterUrl = genericPayload.subArray(indexPlaceholderLastUrlCharacter+1, genericPayload.length());

    payloadPortionBeforeUrl.setByte(payloadPortionBeforeUrl.length()-1, (byte)newCollaboratorVectorLength);

    payloadWithCollaboratorUrl = payloadPortionBeforeUrl.withAppended(ByteArray.byteArray(collaboratorURL));
    payloadWithCollaboratorUrl = payloadWithCollaboratorUrl.withAppended(payloadPortionAfterUrl);

    // Adjust one more length in the serialization process when the TemplateImpl object is used for exploitation
    ByteArray patternTemplateImplToSearch = ByteArray.byteArray(new byte[]{(byte)0xf8,(byte)0x06,(byte)0x08,(byte)0x54,(byte)0xe0,(byte)0x02,(byte)0x00,(byte)0x00,(byte)0x78,(byte)0x70,(byte)0x00,(byte)0x00,(byte)0x06});
    int indexOfPatternTemplateImpl = payloadWithCollaboratorUrl.indexOf(patternTemplateImplToSearch,false);
    if(indexOfPatternTemplateImpl != -1)
        payloadWithCollaboratorUrl.setByte(indexOfPatternTemplateImpl+13, (byte)(payloadWithCollaboratorUrl.getByte(indexOfPatternTemplateImpl+13) + (newCollaboratorVectorLength - 5)));

    payloadWithCollaboratorUrl = utilities.base64Utils().encode(payloadWithCollaboratorUrl);

    // *************** END PAYLOAD CREATION ************************

    // We create an HTTP request containing our payload in the current insertion point
    HttpRequest commonsCollectionsCheckRequest = insertionPoint.buildHttpRequestWithPayload(
        payloadWithCollaboratorUrl).withService(requestResponse.httpService());

    // We execute the request
    HttpRequestResponse commonsCollectionsCheckRequestResponse = http.sendRequest(commonsCollectionsCheckRequest);

    // We retrieve the interactions received by the Collaborator related to our specific Collaborator URL
    List<Interaction> interactionList = collaboratorClient.getInteractions(InteractionFilter.interactionPayloadFilter(collaboratorURL));

    // If we have some interactions we report the issue
    if(interactionList.size() > 0) {

        String apacheCommonsCollections3IssueName = "Remote Code Execution through Java Unsafe Deserialization, vulnerable library: Apache Commons Collections 3";
        String apacheCommonsCollections3IssueDetail = "The application deserializes untrusted serialized Java objects,"+
        " without first checking the type of the received object and run on an unpatched Java environment. This issue can be"+
        " exploited by sending malicious objects that, when deserialized,"+
        " execute custom Java code. Several objects defined in popular libraries"+
        " can be used for the exploitation.";

        // We create an issue object and adds it to the list of issues to be returned
        activeAuditIssues.add(AuditIssue.auditIssue(apacheCommonsCollections3IssueName,
            apacheCommonsCollections3IssueDetail,
            null, // remediation
            requestResponse.request().url(),
            AuditIssueSeverity.HIGH,
            AuditIssueConfidence.FIRM,
            null, // background
            null, // remediationBackground
            AuditIssueSeverity.HIGH,
            commonsCollectionsCheckRequestResponse)); //Request/response can be highlighted

    }

}

return AuditResult.auditResult(activeAuditIssues);
```

## DNS payload 长度修正

As in the previous examples, almost nothing changes. We moved the auxiliary method we used to create the payload inside our check. This method is necessary to create the DNS payload, in which we need to put a variable-length Collaborator URL and consequently we need to fix a couple of binary lengths to avoid breaking the serialized Java object format.

In this example, in addition to *httpRequestResponse*, *insertionPoint* and *http*, we also used the available *api* object to get a reference to the Collaborator client.

Now, let’s try our 3 new custom checks on our target like we did in [Part 6](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-6/) and [Part 7](https://hnsecurity.it/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-7/):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/95ce43dd2863dc59.png)

## 扫描配置提速

As usual, we can **define a custom scan profile that enables only the check we are developing**, in order to speed up the scan. In this example, we want to use only the custom scan checks, so we can leave them enabled and disable all built-in checks and all the extension checks (this is another cool feature that is relatively new; in the past we could not disable the extension checks in scan profiles).

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7842693e52b3ff07.png)

After a while, we have our result!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d09dcd7bd131eee5.png)

And for custom scan checks, that’s a wrap.

As always, the complete code can be downloaded from [my GitHub repository.](https://github.com/federicodotta/Burp-Suite-Extender-Montoya-Course) Custom scan scripts are present both with Java and Bambda extension. The Java ones should be pasted into the editor, while Bambda scripts can be imported via the “Import” functionality.

Official documentation and examples can be found at the following links:

-   [Custom scan checks writing guide](https://portswigger.net/burp/documentation/desktop/extend-burp/custom-scan-checks/creating/writing-guide)
-   [Custom scan checks official examples](https://github.com/PortSwigger/bambdas/tree/main/CustomScanChecks)
-   [Montoya API docs](https://portswigger.github.io/burp-extensions-montoya-api/javadoc/burp/api/montoya/MontoyaApi.html)

Cheers!

The post [Extending Burp Suite for fun and profit – The Montoya way – Part 9](https://hnsecurity.it/blog/extending-burp-suite-for-fun-and-profit-the-montoya-way-part-9/) appeared first on [HN Security](https://hnsecurity.it/).
