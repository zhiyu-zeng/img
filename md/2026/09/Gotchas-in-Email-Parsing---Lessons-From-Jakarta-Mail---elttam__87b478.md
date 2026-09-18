---
title: Gotchas in Email Parsing - Lessons From Jakarta Mail - elttam
source: https://www.elttam.com/blog/jakarta-mail-primitives
source_host: www.elttam.com
clip_date: 2026-09-18T10:45:11+08:00
trace_id: 7aee04b0-777e-44c0-8a90-61d0deb1ce90
content_hash: 21377e885c344cde63e5c8c82c8a388aa358b5c248d741cf6c5554a678707d2f
status: summarized
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: elttam
ai_summary: Jakarta Mail 的 InternetAddress 构造函数解析行为不一致：2/3 参数版本完全不校验收件地址，叠加 RFC 822/2047 的宽松解析，会产生邮箱解析差异，可导致越权与钓鱼。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: null
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Jakarta Mail 的 InternetAddress 构造函数解析行为不一致：2/3 参数版本完全不校验收件地址，叠加 RFC 822/2047 的宽松解析，会产生邮箱解析差异，可导致越权与钓鱼。
> 
> - **多参数构造器不校验：** `InternetAddress(address, personal[, charset])` 直接把 address 赋值给对象，不调用 `parse()`；`(blah)` 这类非法串可成功创建，只有单参数构造器会抛 AddressException。
> - **RFC 822 解析差异：** `<aaa@bbb.com>ccc@ddd.com` 实际发往 `aaa@bbb.com`；若应用用 `lastIndexOf('@')` 判断域名，可注册 `<attacker@example.com>@foo.com` 骗取 foo.com 域特权。
> - **RFC 2047 编码串：** `=?UTF-8?Q?...?=` 会被自动解码，`getPersonal()`/`getSubject()` 返回 `Administrator <admin@example.com>`；MimeMessage 解析 From/Reply-To/Subject 时复用同一逻辑，易被伪装成合法发件人。
> - **群组与 Newsgroups：** `getRecipients(NEWSGROUPS)` 用逗号拼接重复头；NewsAddress 构造器不抛异常、仅去空白；群组语法 `name:addr1,addr2;` 也能被 parse 接受。
> - **Spring/Hibernate：** `InternetAddressEditor.setAsText()` 走单参数构造器（仍解码 Personal）；Hibernate 默认 `@Email` 正则严格且不兼容 RFC 2047，但 `'foo@bar.com'@example.com` 能通过，配合 `.split('@')[1]` 会取错域名。

*(If you are looking for the Jakarta Mail checklist, it is at the* [*end*](#) *of this post.)*

## Introduction

During a recent client engagement, I chanced upon a portion of their code that relied on Jakarta Mail’s [InternetAddress.java](https://github.com/javaee/javamail/blob/master/mail/src/main/java/javax/mail/internet/InternetAddress.java) constructor to verify if an input string is a valid email address. Upon looking closer at the constructors (there were multiple), I realised that their behaviours were not consistent.

This inconsistent parsing could lead to high risk vulnerabilities depending on how an application is using email addresses.For example, an application may grant privileged access if the supplied email is from a particular domain.What happens if an attacker registers and verifies their email address that belongs to their own domain, but somehow satisfies the aforementioned criteria?

In this blog, we will be looking at interesting “features” this library has to offer. We will also examine how Hibernate’s `@Email` annotation behaves when performing email address validation.

At the end of this post, there is a handy checklist that should be helpful when auditing an application that uses Jakarta Mail. We have also created custom Semgrep rules to help you identify these primitives.

## Past Research

When I dived into Jakarta Mail, I remembered that Gareth Heyes from PortSwigger published an extensive [write-up](https://portswigger.net/research/splitting-the-email-atom) about email parsing, so I wanted to extend his research.Part of the write-up mentioned how encoded strings can be used to “split” email address parsing.

There is also a [write-up](https://nathandavison.com/blog/exploiting-email-address-parsing-with-aws-ses) by Nathan Davison about email parsing differential that he found with AWS SES.This behaviour was also observed in Jakarta Mail due to the way parsing was done to ensure RFC-compliance.We will be looking at it in detail in this post, but the gist is that if a supplied email address looks like `<aaa@bbb.com>ccc@ddd.com`, the actual email will be sent to `aaa@bbb.com` in accordance with [RFC 822](https://datatracker.ietf.org/doc/html/rfc822).

Finally, Elliot Alderson also has an interesting [write-up](https://medium.com/@fs0c131y/tchap-the-super-not-secure-app-of-the-french-government-84b31517d144) about how an “overloaded” email address passed the application’s flawed checks.For example, it naively checks that the email address ends with `@elysee.fr` but when an email address like `tester@protonmail.com@presidence@elysee.fr` is supplied, the actual emails are sent to `tester@protonmail.com`.

## Background on Jakarta Mail

Jakarta Mail is part of the Jakarta EE platform, which is a set of API specifications for frameworks looking to be Jakarta EE-compliant.As of Jakarta Mail version `2.1.x`, [Angus Mail](https://eclipse-ee4j.github.io/angus-mail/) by the Eclipse Foundation is a compliant framework.Its specification page can be found [here](https://jakarta.ee/specifications/mail/2.1/).

Note that even though Jakarta Mail is intended to be a set of specifications, it comes with default implementations of Classes such as `MimeMessage`, `InternetAddress`, `SMTPTransport`, etc. and these default classes are what we will be looking at.

In the `InternetAddress` class, it is stated that email address validation complies with RFC 822 and that the “Personal Name” field complies with [RFC 2047](https://datatracker.ietf.org/doc/html/rfc2047) (encoded strings).

## Encoded Strings (RFC 2047)

What are these? The TL;DR is that encoded strings are a way to represent and transport non-ASCII characters by encoding them.The [write-up](https://portswigger.net/research/splitting-the-email-atom#encoded-word) by Gareth goes into great detail and does an excellent job in explaining what encoded strings are.

Simply put, an encoded string has the following syntax:

```
=?charset?encoding?encoded-text?=
```

Where:

-   **\=??=** are start and end anchors, and `?` act as delimiters
-   **charset** indicates the character set of the encoded text (e.g. UTF-8)
-   **encoding** is either `b` (base-64) or `q` (quoted) to indicate the encoding type
-   **encoded-text** being the text encoded by the chosen encoding

The following is an example of an email address containing an encoded string:

```
=?utf-8?q?hello=77=6f=72=6c=64?=@example.com
```

Where:

-   **\=??=** – start/end markers
-   **charset** – `UTF-8`
-   **encoding** – `q` (quoted)
-   **encoded-text** – `hello=77=6f=72=6c=64` (helloworld)

It will be resolved to `helloworld@example.com` by email parsers.

## InternetAddress Primitives

`InternetAddress` is shipped with the Jakarta Mail library and thus most Java applications that work with email addresses will most likely import this library.

### Constructors

I’ve noted that there were multiple constructors for the `InternetAddress` class intended for different scenarios, and here is the one for the single string argument constructor.

```java
// InternetAddress.java

public InternetAddress(String address) throws AddressException {
	// use our address parsing utility routine to parse the string
	InternetAddress a[] = parse(address, true);
	// if we got back anything other than a single address, it's an error
	if (a.length != 1)
	    throw new AddressException('Illegal address', address);

	/*
	 * Now copy the contents of the single address we parsed
	 * into the current object, which will be returned from the
	 * constructor.
	 * XXX - this sure is a round-about way of getting this done.
	 */
	this.address = a[0].address;
	this.personal = a[0].personal;
	this.encodedPersonal = a[0].encodedPersonal;
}
```

Nothing unusual with the code here.It seems like the intention is to take in an email address string and call the `parse()` method, which validates the email address for RFC 822 compliance.Afterwards, the email address and personal name will be assigned to the object itself.

What about the 2-argument and 3-argument constructors?

```java
// InternetAddress.java

public InternetAddress(String address, String personal)
				throws UnsupportedEncodingException {
	this(address, personal, null);
}

[...]

public InternetAddress(String address, String personal, String charset)
				throws UnsupportedEncodingException {
	this.address = address;
	setPersonal(personal, charset);
}
```

Astute readers will immediately notice the issue here - the input `address` is directly assigned to the object itself without calling the `parse()` method to parse it!

This was indeed the case from testing:

```java
// 1 Arg
InternetAddress addr = new InternetAddress('(blah)');

Caused by: jakarta.mail.internet.AddressException: Illegal address in string ``(blah)''
		at jakarta.mail.internet.InternetAddress.<init>(InternetAddress.java:103)
        ...

// 2 Args
InternetAddress addr = new InternetAddress('(blah)', 'blah')
System.out.println(addr.toString()); // blah <(blah)>

//3 Args
InternetAddress addr = new InternetAddress('(blah)', 'blah', 'blah');
System.out.println(addr.toString()); // blah <(blah)>
```

This means that if an application uses any of these constructors and assumes that the email address will be validated for RFC-compliance, they are sorely mistaken! 🙈

### Email Address Parsing Differential

Speaking of validating an email for RFC-compliance, where do you think an email sent to the following address will end up at?

```
<aaa@bbb.com>ccc@ddd.com
```

If you want to be compliant with RFC-822 (and its successors), you will send the email to `aaa@bbb.com`:

```java
Received Email: <aaa@bbb.com>ccc@ddd.com

=====

getAddress(): aaa@bbb.com
getPersonal(): null
toString(): aaa@bbb.com
```

However, developers may think that the email address is `<aaa@bbb.com>ccc@ddd.com` or `ccc@ddd.com`.This differential is what leads us to high impact vulnerabilities!

Imagine the following scenario: there’s an application that identifies users via their email address.It also grants special privileges to accounts originating from the `foo.com` domain.If the registration is not restrictive enough, we could register with an email address similar to the earlier example (`<attacker@example.com>@foo.com`).Let’s also assume that when granting special privileges, the application does a simple match with `lastIndexOf('@')` to look for the `foo.com` domain.It also trusts that the `Internetaddress` constructor ensures that the input is a valid email string.

But what is a valid email string?

The `InternetAddress.parse()` certainly thinks `<attacker@example.com>@foo.com` is valid and will happily send the verification email to `attacker@example.com`.Meanwhile, the application identifies the user as `<attacker@example.com>@foo.com`, sees that it is from `@foo.com` and grants it special privileges!

### Group Address

The `InternetAddress.getGroup()` method returns an array of `InternetAddress` from its current group address.So what is a group address?

It is basically a string with the following syntax:

```
group-name:[addr1, addr2 …];
```

Where a group name is supplied, followed by a colon.Then, 0 or more email addresses are included with commas used as delimiters.The entire sequence is then terminated with a semicolon.

Parsing a group address typically looks like:

```java
Received Email: a:ccc@ddd.com,eee@fff.com,ggg@hhh.com;
Size of Addresses: 3

=====

getAddress(): ccc@ddd.com
getPersonal(): null
toString(): ccc@ddd.com

=====

getAddress(): eee@fff.com
getPersonal(): null
toString(): eee@fff.com

=====

getAddress(): ggg@hhh.com
getPersonal(): null
toString(): ggg@hhh.com
```

A group address will be parsed successfully through the `InternetAddress.parse()` method and could potentially lead to more differential issues or even ReDoS, depending on how the application uses the input string that gets passed to `InternetAddress`.

## MimeMessage Primitives

`MimeMessage` is also a default class shipped with Jakarta Mail.It is used to represent the message envelope, which includes the email headers and body.

### Constructors

What’s interesting here is that when parsing certain email headers such as `From:`, `Reply-To:` and `Subject:`, `MimeMessage` will call `InternetAddress.parseHeader()` to process the input.Within `InternetAddress.parseHeader()`, it calls `InternetAddress.parse()`.This means that primitives applicable to `InternetAddress` are also accessible through `MimeMessage`.For example, when parsing complex email addresses like `<aaa@bbb.com>ccc@ddd.com` or email addresses with encoded strings.

To do this, `MimeMessage` has constructors that take in an email envelope as input and parses its headers.If you happen to come across applications calling any of the following MimeMessage constructors with user-supplied email envelopes, be sure to take a closer look at how it uses the input from these headers:

```java
// MimeMessage.java

// Note: The MimeMessage(Session session) constructor does not invoke parse().
MimeMessage(MimeMessage source);
MimeMessage(Session session, InputStream is);
MimeMessage(Folder folder, InputStream is, int msgnum);
```

A potential abuse scenario would be if an email application does not show the raw encoded string in their user interface and displays the Personal Name section first.This could lead to phishing emails appearing legitimate.Take the following email envelope for example:

```ruby
From: =?UTF-8?Q?Administrator_=3Cadmin@example.com=3E?= <attacker@evil.com>
To: victim@example.com
Subject: =?UTF-8?Q?Administrator_=3Cadmin@example.com=3E?=
Content-Type: text/plain; charset=UTF-8

Your account needs verification.
```

The `MimeMessage` constructor will parse the envelope above and when the `getSubject()` and `getPersonal()` methods are called, the decoded strings will be shown:

```
getSubject(): Administrator <admin@example.com>
getPersonal(): Administrator <admin@example.com>
```

If the email application happens to display the sender’s email as `Personal Name <Email Address>`, the Personal Name section can be crafted like the above example and to trick end-users into thinking that it is from a legitimate sender.Of course, this is just an example to demonstrate the importance of verifying how applications utilises `MimeMessage` and its methods.

### Newsgroups

The `MimeMessage.getRecipients()` method retrieves a specified header value from the email envelope.This header can be either `To:`, `CC:`, `BCC:` or `Newsgroups:`.In the latter’s case, the `MimeMessage.getHeader()` method will be invoked to retrieve the values from the `Newsgroups:` header.This method also concatenates values from duplicate headers with a comma delimiter.

```java
// MimeMessage.java

public Address[] getRecipients(Message.RecipientType type) throws MessagingException {
  if (type == Recipient.NEWSGROUPS) {
    String s = getHeader('Newsgroups', ','); // concatenation with ',' as delimiter
    return (s == null) ? null : NewsAddress.parse(s);
  }
  [...]
}
```

In the `NewsAddress.parse()` method, it basically splits the input string by commas and inserts them into an arraylist of `NewsAddress` objects:

```java
// NewsAddress.java

public static NewsAddress[] parse(String newsgroups)
        throws AddressException {
    // XXX - verify format of newsgroup name?
    StringTokenizer st = new StringTokenizer(newsgroups, ',');
    List<NewsAddress> nglist = new ArrayList<>();
    while (st.hasMoreTokens()) {
        String ng = st.nextToken();
        nglist.add(new NewsAddress(ng)); // [1]
    }
    return nglist.toArray(new NewsAddress[0]);
}
```

At \[1\], an interesting behaviour can be found in the `NewsAddress` constructor, which is shown below:

```java
// NewsAddress.java

public NewsAddress(String newsgroup, String host) {
    // XXX - this method should throw an exception so we can report
    // illegal addresses, but for now just remove whitespace
    this.newsgroup = newsgroup.replaceAll('\\s+', '');
    this.host = host;
}
```

A malformed input would not throw any exceptions and would silently be assigned anyway.Even the comments says that an exception should be thrown 🤔

## Spring Framework (org.springframework.mail)

The root-level package for Spring Framework’s email support.The classes found in this package all utilise Jakarta Mail in one way or another.

### InternetAddressEditor

This class is used to prepare a `InternetAddress` object using a supplied email address string:

```java
// InternetAddressEditor.java

@Override
public void setAsText(String text) throws IllegalArgumentException {
    if (StringUtils.hasText(text)) {
        try {
            setValue(new InternetAddress(text)); // [1]
        }
        catch (AddressException ex) {
            throw new IllegalArgumentException('Could not parse mail address: ' + ex.getMessage());
        }
    }
    else {
        setValue(null);
    }
}
```

Looking at \[1\], it simply passes the input string to the `InternetAddress` constructor (only the 1-argument constructor, unfortunately).This means that the Personal Name field will be decoded if it is an encoded string.Again, a potential misuse of this behaviour would be phishing attacks.If an application shows the Personal Name section of an email address, we can make it look like the email came from a legitimate sender.

```java
InternetAddressEditor editor = new InternetAddressEditor();
editor.setAsText('=?UTF-8?Q?Administrator_=3Cadmin@example.com=3E?= <attacker@evil.com>');
InternetAddress address = (InternetAddress) editor.getValue();

address.getPersonal(); // Administrator <admin@example.com>
address.getAddress(); // attacker@evil.com
```

## Hibernate Validator

This is a library that introduces the `@Email` annotation to verify that the string follows a valid email format.As we now know that “valid email format” can potentially mean complex looking email addresses, we should go ahead and verify what constitutes a “valid email” in the eyes of Hibernate.

Developers can specify custom regex patterns (via `@Email(regexp='INPUT')`), or use the default pattern.What I’ve found was that the default pattern is very restrictive and is **not** RFC 2047 compliant (no encoded strings 🙁).

When validation is triggered via the `@Email` annotation, the [EmailValidator](https://github.com/hibernate/hibernate-validator/blob/main/engine/src/main/java/org/hibernate/validator/internal/constraintvalidators/bv/EmailValidator.java) class is used to perform the checks.It then calls its parent class `AbstractEmailValidator` to validate the email string, which also uses [DomainNameUtil](https://github.com/hibernate/hibernate-validator/blob/main/engine/src/main/java/org/hibernate/validator/internal/util/DomainNameUtil.java) to perform domain name validation.

In the default regex, validation is split into two sections: local and domain, where the former is everything before the `@` while the latter is everything after.It gets really intense as seen below:

```java
// AbstractEmailValidator.java

private static final String LOCAL_PART_ATOM = '[a-z0-9!#$%&'*+/=?^_`{|}~\u0080-\uFFFF-]';
private static final String LOCAL_PART_INSIDE_QUOTES_ATOM = '(?:[a-z0-9!#$%&'*.(),<>\\[\\]:;  @+/=?^_`{|}~\u0080-\uFFFF-]|\\\\\\\\|\\\\\\\')';
/**
 * Regular expression for the local part of an email address (everything before '@')
 */
private static final Pattern LOCAL_PART_PATTERN = Pattern.compile(
        '(?:' + LOCAL_PART_ATOM + '+|\'' + LOCAL_PART_INSIDE_QUOTES_ATOM + '+\')' +
                '(?:\\.' + '(?:' + LOCAL_PART_ATOM + '+|\'' + LOCAL_PART_INSIDE_QUOTES_ATOM + '+\')' + ')*',
        CASE_INSENSITIVE
```

```java
// DomainNameUtil.java

private static final String DOMAIN_CHARS_WITHOUT_DASH = '[a-z\u0080-\uFFFF0-9!#$%&'*+/=?^_`{|}~]';
private static final String DOMAIN_LABEL = DOMAIN_CHARS_WITHOUT_DASH + '++(?:-++' + DOMAIN_CHARS_WITHOUT_DASH + '++)*+';
private static final String DOMAIN = DOMAIN_LABEL + '(?:\\.' + DOMAIN_LABEL + ')*+';

private static final String IP_DOMAIN = '[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}';
//IP v6 regex taken from http://stackoverflow.com/questions/53497/regular-expression-that-matches-valid-ipv6-addresses
private static final String IP_V6_DOMAIN =
        '(?:(?:[0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(?:ffff(:0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9]))';
[...]
private static final Pattern EMAIL_DOMAIN_PATTERN = Pattern.compile(
            DOMAIN + '|\\[' + IP_DOMAIN + '\\]|' + '\\[IPv6:' + IP_V6_DOMAIN + '\\]', CASE_INSENSITIVE
    );
```

With a bit of experimentation, I found that the email address `'foo@bar.com@'@example.com` will pass the default regex validation.This means that if an application naively checks the domain of an email address with `.split('@')[1]`, it will pull the incorrect domain.

## Conclusion

If you have made it this far, I hope you have learnt something new and/or have some research ideas on your own about email parsers. Note that the ideas we have explored are not limited to Jakarta Mail but can be extended to any application that uses email addresses to establish identities. As long as developers are not fully aware of how the libraries they are using are parsing email addresses, there will always be the possibility of email parsing differentials.

The next time you encounter Jakarta Mail or any libraries that uses it, be sure to take a closer look to see if the application makes any assumptions about how emails are parsed by this library. If only there are some Semgrep rules to help you out… oh wait - [here](https://github.com/elttam/semgrep-rules/tree/main/rules/java/audit/email-validation/jakarta-mail-email-primitives.yml) it is!

*This blog post is based on the talks that I gave in BSides Canberra and BSides Perth 2025. You can find the slide deck* [*here*](https://github.com/elttam/publications/blob/master/slides/Primitives%20for%20Security%20Audits%20-%20Lessons%20from%20Jakarta%20Mail%20-%20For%20Dist.pdf)*.*

## Checklist for Jakarta Mail

*A list of primitives to look out for.*

### InternetAddress Checks

-   `InternetAddress` constructor with 1 argument (user-controllable)
    -   Testing `getPersonal()`
        -   Test with encoded strings `=?UTF-8?Q?Administrator_=3Cadmin@example.com=3E?= <attacker@evil.com>`. It should show the decoded string (i.e. `Administrator <admin@example.com>`). Can it be misused to phish?
    -   Testing `getAddress()`
        -   Test with `<aaa@bbb.com>ccc@ddd.com`. Does the application save the user’s email as the entire string? Does it use last `indexOf('@')` to get the user’s domain? The actual email will be sent to `aaa@bbb.com`.
-   `InternetAddress` constructor with 2 or 3 arguments (user-controllable)
    -   There is no email address validation (1st argument) if these overloaded constructors are used.
-   Test with `a:(aaa@bbb.com)ccc@ddd.com,eee@fff.com,ggg@hhh.com;`. It is an acceptable string as it is the syntax for a list of email addresses. However, does the application accept it?

### MimeMessage Checks

-   `MimeMessage` constructor (user-controllable email envelope):
    -   How does the application use values in the `From:`, `Reply-To:` and `Subject:` headers? Remember that encoded strings in these headers will be automatically decoded.
        -   Test with `=?UTF-8?Q?Administrator_=3Cadmin@example.com=3E?= <attacker@evil.com>`. The `InternetAddress::getPersonal()` method will return the decoded string: `Administrator <admin@example.com>`.
-   Does the developer use `MimeMessage::getSender()` and `MimeMessage::getFrom()` / `MimeMessage::getReplyTo()` interchangeably?
    -   `getSender()` returns an array of Addresses whereas `getFrom()` / `getReplyTo()` returns just the first index from this same array.
-   Does the developer use `MimeMessage::getRecipients()`?
    -   Test with multiple `Newsgroups:` headers. The developer might not have accounted for the possibility of multiple headers being concatenated.
    -   The developer might assume that the content is an email address. This is not the case as ANY string is acceptable (but spaces will be stripped via `replaceAll('\\s+')`).

## Spring Framework

-   Does the developer use `InternetAddressEditor::setAsText(String input)`?
    -   Test with `=?UTF-8?Q?Administrator_=3Cadmin@example.com=3E?= <attacker@evil.com>`. It should show the decoded string (i.e. `Administrator <admin@example.com>`). Can it be misused to phish?
-   Does the developer use `SimpleMailMessage` to manage emails? Does it also allow you to control the email address being parsed via any of its setter methods (e.g. `SimpleMailMessage::setFrom()`)? If so:
    -   Test with `=?UTF-8?Q?Administrator_=3Cadmin@example.com=3E?= <attacker@evil.com>` and the resultant `getPersonal()` should show the decoded string. Can it be misused to phish?

## Hibernate

-   Does the developer rely on the default `@Email` annotation to verify that an email string is valid (i.e. no custom `regexp`)?
    -   Test with `'foo@bar.com'@example.com`, it will pass validation. Does the application get the user’s domain using a naive `.split('@')[1]`?
    -   If custom regexp is used, see if there are any common issues (unescaped `.`, ReDoS)
