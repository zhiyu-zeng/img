---
title: 【微信】java安全—Struts2用户权限控制
source: https://mp.weixin.qq.com/s/p2yiukrF77It3oQmVOTjRg
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:38:44+08:00
trace_id: 5b69880e-3330-4c8a-875f-327d5ff4dd5f
content_hash: c3fd5af7f2563ac675bd25c8d85bc040c2c62def557c31e9a8026ed2cf3c578e
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41375244-d011-81ba-ac54-d82ba63f2d13
ioc: null
---

**绿洲安全** *2026年11月9日 08:30*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/03f54ca2b020c235.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/764783e157607c7c.gif)

**由于传播、利用本公众号绿洲安全所提供的信息而造成的任何直接或者间接的后果及损失，均由使用者本人负责，公众号绿洲安全及作者不为此承担任何责任，一旦造成后果请自行承担！如有侵权烦请告知，我们会立即删除并致歉。谢谢**

## Struts2框架简介

Struts2是一个广泛使用的开源MVC框架，用于创建基于Java的Web应用程序。它继承自原始的Struts框架，但经过了重大的重构和改进，提供了更加灵活和强大的功能。

### Struts2的核心概念

Struts2框架的核心是Model-View-Controller（MVC）设计模式。Model负责业务逻辑和数据，View负责显示数据，而Controller（在Struts2中称为Action）负责转发请求和处理用户输入。Struts2通过一系列的拦截器（Interceptor）来增强控制器的功能。

### Struts2的主要组件

Struts2框架的主要组件包括Action类、拦截器、结果集（Result）和配置文件（如struts.xml）。Action类是用户请求的核心处理类，拦截器用于处理请求前后的附加操作，结果集定义了Action执行完毕后页面的跳转，配置文件用于配置Action和其他组件。

```typescript
// 示例代码：Struts2 Action类
public class HelloAction extends ActionSupport {
    // Model属性
    private String message;

    // Model的getter和setter方法
    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    // 执行方法
    @Override
    public String execute() throws Exception {
        // 设置消息
        setMessage("Hello, Struts2!");
        // 返回成功结果
        return SUCCESS;
    }
}
```

Struts2的配置和使用

要使用Struts2，首先需要在项目中添加Struts2的依赖，然后配置struts.xml文件来定义Action类和结果集的映射。此外，还需要在web.xml中配置Struts2的过滤器。

```xml
<!-- 示例代码：web.xml中的Struts2过滤器配置 -->
<filter>
    <filter-name>struts2</filter-name>
    <filter-class>org.apache.struts2.dispatcher.filter.StrutsPrepareAndExecuteFilter</filter-class>
</filter>

<filter-mapping>
    <filter-name>struts2</filter-name>
    <url-pattern>/*</url-pattern>
</filter-mapping>
```

## Struts2权限控制基础

在Struts2中实现权限控制是确保应用安全的重要环节。Struts2提供了多种方式来限制对特定Action的访问，从而保护应用资源不被未授权的用户访问。

### 使用Struts2的拦截器实现权限控制

Struts2的拦截器机制允许在Action执行之前和之后插入额外的处理逻辑。利用这一机制，可以创建自定义拦截器来实现权限检查。

### 自定义拦截器

创建自定义拦截器需要继承 `com.opensymphony.xwork2.interceptor.AbstractInterceptor` 类，并重写 `intercept` 方法。在 `intercept` 方法中，可以检查用户是否具有访问当前Action的权限。

```java
// 示例代码：自定义权限控制拦截器
public class AuthorityInterceptor extends AbstractInterceptor {
    @Override
    public String intercept(ActionInvocation invocation) throws Exception {
        // 获取当前用户信息
        User user = (User) ServletActionContext.getRequest().getSession().getAttribute("user");

        // 检查用户权限
        if (user == null || !user.hasAuthority("admin")) {
            // 如果用户没有权限，重定向到登录页面或错误页面
            return "login";
        }

        // 如果用户有权限，继续执行后续的拦截器或Action
        return invocation.invoke();
    }
}
```

### 配置拦截器

```xml
<!-- 示例代码：struts.xml中配置自定义拦截器 -->
<struts>
    <interceptors>
        <interceptor name="authority" class="com.example.AuthorityInterceptor"/>
    </interceptors>

    <action name="someAction" class="com.example.SomeAction">
        <interceptor-ref name="authority"/>
        <!-- 其他拦截器和结果配置 -->
    </action>
</struts>
```

```
使用Struts2的标签进行权限控制
```

除了使用拦截器，Struts2还提供了标签来控制权限。例如， `<s:if>` 标签可以在JSP页面中根据条件显示内容。

```xml
<!-- 示例代码：JSP中使用Struts2标签进行权限控制 -->
<s:if test="#session.user.hasAuthority('admin')">
    <!-- 只有管理员权限的用户才能看到以下内容 -->
    <div>管理员专属内容</div>
</s:if>
```

通过上述方法，可以在Struts2应用中实现基本的权限控制，保护敏感数据和操作不被未授权的用户访问。

## Struts2权限控制实现

在Struts2中实现权限控制通常涉及到对用户身份的验证以及根据用户角色或权限来授权对特定资源的访问。

### 用户身份验证

用户身份验证是权限控制的第一步，通常通过登录页面来实现。在Struts2中，可以创建一个登录Action来处理用户的登录请求。

```typescript
// 示例代码：登录Action
public class LoginAction extends ActionSupport {
    private String username;
    private String password;

    // getter 和 setter 方法

    public String execute() {
        // 这里应该有对用户名和密码的验证逻辑
        if ("admin".equals(username) && "admin".equals(password)) {
            // 登录成功，将用户信息存入会话
            ServletActionContext.getRequest().getSession().setAttribute("user", new User(username));
            return SUCCESS;
        } else {
            // 登录失败
            return LOGIN;
        }
    }
}
```

### 用户权限检查

一旦用户登录，就可以在会话中存储用户信息，包括其角色和权限。接下来，可以使用拦截器来检查用户是否有权限访问特定的Action。

```java
// 示例代码：权限检查拦截器
public class AuthorityInterceptor extends AbstractInterceptor {
    @Override
    public String intercept(ActionInvocation invocation) throws Exception {
        // 获取当前用户信息
        User user = (User) ServletActionContext.getRequest().getSession().getAttribute("user");

        // 检查用户是否有权限访问当前Action
        if (user == null || !user.hasAuthority("admin")) {
            // 没有权限，重定向到登录页面或错误页面
            return "login";
        }

        // 有权限，继续执行后续的拦截器或Action
        return invocation.invoke();
    }
}
```

### 配置拦截器和Action

在 `struts.xml` 配置文件中，需要配置拦截器和将拦截器应用于特定的Action。

```xml
<!-- 示例代码：struts.xml中配置拦截器和Action -->
<struts>
    <interceptors>
        <interceptor name="authority" class="com.example.AuthorityInterceptor"/>
    </interceptors>

    <action name="adminAction" class="com.example.AdminAction">
        <interceptor-ref name="authority"/>
        <result name="login">/login.jsp</result>
        <result name="success">/admin.jsp</result>
    </action>
</struts>
```

使用Struts2标签进行权限控制

在JSP页面中，可以使用Struts2的标签来根据用户的权限显示不同的内容。

```xml
<!-- 示例代码：JSP中使用Struts2标签进行权限控制 -->
<s:if test="#session.user.hasAuthority('admin')">
    <div>只有管理员可见的内容</div>
</s:if>

<s:else>
    <div>其他用户可见的内容</div>
</s:else>
```

通过上述步骤，可以在Struts2应用中实现一个基本的权限控制系统，确保只有具有适当权限的用户才能访问特定的资源和功能。

## 实战案例解析

在这一部分，我们将通过一个具体的案例来分析权限控制系统的设计和实现。

### 案例背景

假设我们正在开发一个在线文档管理系统，该系统允许多个用户共同编辑和管理文档。系统需要实现以下功能：

-   用户注册和登录。
    
-   文档的创建、编辑、删除和查看。
    
-   根据用户的角色和权限来控制对文档的访问。
    

### 权限控制需求

-   普通用户可以创建和编辑自己的文档，查看所有公开的文档。
    
-   管理员可以创建、编辑、删除任何文档，并查看所有文档。
    
-   文档的所有者可以设置文档的访问权限（公开或私有）。
    

### 权限控制实现

#### 用户和角色模型

首先，定义用户和角色的数据模型。

```typescript
// 示例代码：用户和角色模型
public class User {
    private String username;
    private String password;
    private Role role;
    // 省略getter和setter方法
}

public enum Role {
    USER, ADMIN
}
```

#### 权限检查拦截器

创建一个拦截器来检查用户是否有权限执行当前操作。

```typescript
// 示例代码：权限检查拦截器
public class PermissionCheckInterceptor extends AbstractInterceptor {
    @Override
    public String intercept(ActionInvocation invocation) throws Exception {
        User user = (User) ServletActionContext.getRequest().getSession().getAttribute("user");
        Document document = (Document) invocation.getInvocationContext().get("document");

        if (user == null || !hasPermission(user, document)) {
            return "accessDenied";
        }

        return invocation.invoke();
    }

    private boolean hasPermission(User user, Document document) {
        // 实现权限检查逻辑
        // 例如，检查用户角色、文档所有者、文档访问权限等
    }
}
```

#### Action和结果配置

在 `struts.xml` 中配置Action和结果。

```xml
<!-- 示例代码：struts.xml中的Action和结果配置 -->
<action name="editDocument" class="com.example.EditDocumentAction">
    <interceptor-ref name="permissionCheck"/>
    <result name="success">/edit_document.jsp</result>
    <result name="accessDenied">/access_denied.jsp</result>
</action
```

#### 动态权限管理

#### 实现一个动态权限管理系统，允许管理员在运行时更新权限设置。

```typescript
// 示例代码：动态权限管理
public class PermissionManager {
    private Map<String, Set<String>> permissionMap;

    public PermissionManager() {
        permissionMap = new HashMap<>();
        // 初始化权限设置
    }

    public void updatePermissions(String documentId, Set<String> permissions) {
        permissionMap.put(documentId, permissions);
    }

    public Set<String> getPermissions(String documentId) {
        return permissionMap.get(documentId);
    }
}
```

java安全 · 目录
