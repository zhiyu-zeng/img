---
title: SensePost | Getting rid of pre- and post-conditions in NoSQL injections
source: https://sensepost.com/blog/2025/getting-rid-of-pre-and-post-conditions-in-nosql-injections/
source_host: sensepost.com
clip_date: 2026-09-29T10:16:09+08:00
trace_id: b6732b13-d1f3-426f-98a3-17e672c9a91b
content_hash: c18999c0a4d2c2a1d439e80fb8b68d881bfb88489984dc9f0231cc5bc8108cd4
status: synced
tags:
  - 漏洞分析
  - Web安全
series: null
feed_source: SensePost·红队研究
ai_summary: MongoDB 语法注入可借助重复键覆盖与 `$where` 子句消除注入点的前置条件，但后置条件目前无解。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ea75244-d011-8197-8ec3-e77cd6eca3e3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> MongoDB 语法注入可借助重复键覆盖与 `$where` 子句消除注入点的前置条件，但后置条件目前无解。
> 
> - **两类注入：** 操作符注入被限制在所在字段内，无法影响同一查询中的其他字段；语法注入（字符串拼接/插值）可自行添加查询条件，突破这一限制。
> - **消除前置条件：** MongoDB 与多数 JSON 解析器同样遵循“同名键后者胜”，重定义被注入的键（如再写一次 `"username":{"$ne":""}`）即可覆盖原有取值。
> - **处理尾部引号：** 追加一个无害键值对（如 `"status":"active"`，故意去掉结尾引号）代为闭合；更通用的做法是追加 `,"$where":"1`，无需知道任何额外字段名。
> - **$where 场景：** 用 `'||1` 使条件恒真，或用 `'||1%00`（毒化空字节）截断其后所有语句，适合条件复杂的 `$where`。
> - **后置条件无解：** 若注入点在 `username` 而后面紧跟 `password` 等条件，受“后者胜”影响无法覆盖，作者未找到绕过方法。

**TL;DR: I found a cool way to get rid of pre-conditions in NOSQL syntax injection** s

I have been investigating NoSQL injection for a bit, trying to make it **better**, or at least somewhat equivalent to SQL injection. One of the things that are tricky with NoSQL injection is getting rid of pre- and post-conditions.

For this post I’m focusing on MongoDB, so

```
s/NoSQL injection/Mongo injection/g
```

## Background

In case you forgot, most MongoDB queries will look something like this in the background:

```
db.users.find({"username":"John"})
```

In this case we are querying the users collection for all documents that have a key called **username** and a corresponding value that’s set to **John**.

The ***{“username”:”John”}*** bit is called a query filter.

The following query will look for all documents with the key value pair of ***“username”:”John”*** set, as well as the key value pair of ***“title”:”Analyst”***

```
db.users.find({" username":"John" , "title":"Analyst " })
```

In MongoDB, you can make use of query operators, like $ne and so forth to match specific conditions. For example, the following MongoDB query will match all documents that don’t have a key-value pair with the key being ***username*** and the value being ***John***

```
db.users.find( {"username": {"$ne":"John"} })
```

There are a couple of variations of how NoSQL injection can occur.

The first way is called ***operator injection***, and it’s the one most people are familiar with.

A query operator expression is passed into a query filter, instead of a string. For example, we provide ***{“$ne”:””}*** as a username, causing the query to become:

```
db.users.find( {"username": {"$ne":""} })
```

This matches all users, similar to the famous or ‘ ***1=1 —*** SQL injection statement.

The thing to understand about operator injection is that we are limited to the field we are injecting into. For example, if we are making use of operator injection, and we are injecting into the value of the username field, everything we provide will be seen as part of the query operator expression for the username field. No matter how we try, we won’t be able to affect the other fields in the query.

In the query below, we want to return all values in the collection as before. We have injected our ***“: {“$ne”:””},*** causing the query to return all documents that don’t have an empty username, but has the job field set to IT.

```bash
db.users.find({"username":{"$ne":""}, "job":"IT"})
```

Try as we might, nothing we provide will allow us to get rid of the ***“job”:”IT”*** clause.

The second way one can inject into NoSQL is called syntax injection, and this is where we can actually alter the syntax of the query. Typically, this is due to the use of string concatenation or string interpolation while constructing the query. We find this type of injection often in $where clauses, or within the JSON query filter itself.

***Syntax injection into $where***

Mongo has a ***$where*** clause that evaluates the documents based on specified conditions in a limited JavaScript engine. In practice, most people don’t use it for security and performance concerns, but let’s look at it just in case you find it.

In a ***$where*** clause, the this object provides you access to the current document being processed. For instance, the query below will process each of the documents in the users collection and filter out the ones that has the value John set in the username field.

```
db.users.find( {"$where":" this.username=='John' "} )
```

If we are injecting into a $where clause, we can make use of JavaScript and MongoDB weirdness to cancel out any pre or post conditions, so that we completely control the results of the query.

For instance, to obtain all documents in the users collection, we need to make the JavaScript in the $where clause to evaluate to true for all documents it evaluates. In JavaScript syntax ***‘ or 1=1*** becomes payload ***‘||1***

This makes the query become:

```
db.users.find( {"$where":" this.username==''||1' "} )
```

As you can see, we have a trailing apostrophe we need to take care of, else the syntax won’t be valid.

Typically, people will use a ‘x to get past this, with a payload like ***‘||1||’x***

This makes the query become

```
db.users.find({"$where":" this.username==''||1||'x' "} )
```

If we break this down, it says

-   please provide all documents where the username is empty (i.e. no documents),
-   or where 1 is a true value (all documents)
-   or where ‘x’ (all documents)

In JavaScript all non-empty strings evaluate to true in Boolean conditions, and empty strings to false. Weird right?

We add in ***‘x*** to our payload so that we can get rid of the trailing apostrophe. When the ***‘x*** and the trailing *‘* is put together it becomes ***‘x’*** and because of JavaScript Boolean weirdness we can and this to our Boolean condition with ||, without changing the outcome. In this case the ‘x’ will actually not be evaluated at all, since we have the true value ***1*** already before the ***‘x’***, and once an ***or*** becomes ***true***, the rest of the Boolean condition is ignored.

We don’t need to make use of the ***‘x*** trick – we can actually make use of a ***poison null byte*** in ***$where*** statements to get rid of everything following it. This is great for more complex ***$where*** clauses. For example, the payload ***‘||1%00*** which will make the following query

```
db.users.find({ "$where":
"this.username=='John'&&this.password=='a3b3f8a2f213fbfe…'"})
```

become

```
db.users.find({ "$where":" this.username==''||1" } )
```

In a similar vein, you could also use ***‘||’X*** which becomes

```
db.users.find("$where":{
"this.username==''||'X'&&this.password=='a3b3f8a2f213fbfe…'})
```

## Syntax injection into the JSON query filter (New Stuff)

In this case, the developers are using string concatenation, or more likely string interpolation to construct the query filter, before making it into a JSON object, and passing it to MongoDB.

We can thus add in our own query conditions. This is a bit of a game changer from operator injection, since we can now query on the fields we want, instead of being stuck inside an existing field.

For instance, if we have the query

```
db.users.find({"job":"IT"})
```

and we are injecting into the value of the job field, and we want to find all IT users who can login to the site, we can provide for instance *IT”,”status”:”active* to change the query to

```
db.users.find({"job":"IT", "status":"active"})
```

This is the equivalent to being able to add our own columns in a where clause in SQL injection. We can however be injecting into a spot that has both pre and post conditions, and since JSON doesn’t have a way to comment things out, it becomes a bit tricky to alter the queries to do what you want.

After playing around a bit, I found out that you can get rid of preconditions at least in MongoDB. In JSON, the key names in a document are supposed to be unique. If you have a document with two identical keys and different values, you are technically dealing with an invalid JSON document, but in reality, the actual value of the key will depend on what JSON parser is being used. A lot of the parsers follow the rule “last value wins”, which means that the value of the last identical key in the document will be used. For example, if we use such a parser on the JSON document

```json
{"id":"10", "id":"100"}
```

the value of the *id* field will be ***100***.

I found that MongoDB has the same behavior. As a practical example, consider the case where we are injecting into the username field of the following query, and we would like to get all users’ values:

```
db.users.find({"username":"bob"})
```

We could provide something like ***{“$ne”:””}*** however in this case it would become:

```
db.users.find({"username":"{"$ne":""}"})
```

In this case, the payload is swallowed by a string, so nothing will happen. If we add in a ***“*** to escape out of the string, we end up with a pre-condition, i.e. the username has to be blank.

For example, in we inject ***“XXXXX*** we get

```
db.users.find({"username":"" XXXXX"})
```

To thus get all users, we redefine the username key-value after escaping the string. The payload would be something like this ***“,”username”:{“$ne”:””}***

Causing the query to become:

```bash
db.users.find({"username":"", "username":{"$ne":""} "})
```

We almost have it, but we are stuck with a trailing ***“***

This is pretty tricky to get past, as there isn’t any way to comment out things within JSON. One way I have found to deal with this, is to add an additional key value pair, that won’t affect the results, like ***“status”,”active”*** or some other field. We remove the last ” of this additional key value pair, so that when it is added to the query filter, it will take care of the trailing ***“*** for us. This is similar to adding in ***‘x*** like we did in the ***$where*** injection.

Unfortunately, this means that you need to know the name of such a field, which can be hard in itself. In this case, the payload would become ***“,”username”:{“$ne”:””},”status”:”active***

making the query become

```bash
db.users.find({"username":"","username":{"$ne":""},"status":"active"})
```

A better way to deal with this is to make use of ***$where***. We add in a ***$where*** clause that will always return true, and in doing so take care of the trailing ***“***. For instance, for our query we provide the payload

***“,”username”:{“$ne”:””},”$where”:”1***

causing our query to become

```bash
db.users.find({"username":"","username":{"$ne":""},"$where":"1"})
```

Sweeeet! This works pretty well, and means we don’t need to really know any additional field names. I find it’s quite useful to inject $where sometimes, such as with error based NoSQL injection.

In practice, we might not always be so lucky though – often times there are post-conditions after our injection point, and due to the “last value wins” we cannot override them. For instance, you are injecting into the ***username*** field of the following query

```
db.users.find({"username":"Bob","password":"ae34fc6534f2c..."})
```

then you will only be able to match documents that have that specific password hash value. I haven’t found a good way to get rid of post conditions – If you know of a way tell me and I’ll buy you several beers.

Hope this was helpful!
