---
title: My IoT devices are no longer supported – is my smart home safe?
source: https://www.welivesecurity.com/en/internet-of-things/iot-devices-no-longer-supported-smart-home-safe/
source_host: www.welivesecurity.com
clip_date: 2026-11-21T06:51:48+08:00
trace_id: 72a7b8cd-b455-41e5-a450-9fc535118425
content_hash: 19d2bfca8821dabc9f68daed3e25d457fc205561d18784d0445099e65d00ffe9
status: synced
tags: []
series: null
feed_source: ESET WeLiveSecurity
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41e75244-d011-81c8-ab24-e9006ee4ec33
ioc: null
---

Security updates are vital for any software-based product. That is as true of your home PC as it is the myriad of smart devices you now use in your everyday life: from fitness trackers to smart TVs, phones and lights. If those updates are no longer produced by manufacturers because the product has been officially retired, it could spell trouble. The device usually carries on working, but every vulnerability found from then on stays open for good.

In [France, hackers recently](https://www.cbc.ca/news/business/france-fridge-hack-smart-devices-food-system-9.7379613) targeted unsupported IoT devices which controlled the temperature of supermarket refrigerators. By exploiting bugs that were not patched because the devices had reached end of life (EoL), the hackers increased the temperature inside, spoiling food and causing potentially tens of millions of euros’ worth of damage. Many of the controllers were end-of-life models that no longer received software or security updates, and one retail group expected losses of tens of millions of euros.

Those were commercial systems run by maintenance firms, not smart-home gadgets. But the weakness they shared is the same one an unsupported camera, router or TV box brings into your home.

## Why it matters

You might not notice if your smart device stops updating. It may continue to work for a time. But critical functionality could eventually become unavailable. The user experience will degrade. And most importantly, it will no longer receive security updates.

When a device reaches end of life (EoL), the most important change is invisible: it stops receiving security updates. This means that any new vulnerabilities discovered in the product – by hackers or security researchers – will not get fixed. That provides an opportunity for bad actors to exploit them.

They could do this in order to:

-   Hijack your router to steal account passwords, bypass network security controls, and possibly redirect you to malicious/phishing sites
-   Compromise a smart device (e.g., a smart TV) and use it as a stepping stone into your IT network, enabling them to steal sensitive information stored on your computer or account passwords
-   Remotely control a smart door lock to access your property
-   Hijack a smart camera to [eavesdrop on your family](https://www.welivesecurity.com/2022/10/03/8-questions-ask-yourself-getting-home-security-camera/), possibly putting it in physical danger and/or giving them access to footage with which to blackmail you
-   Take over your smart devices and conscript them into a botnet to attack others. In March 2026, the [US Department of Justice disrupted](https://www.justice.gov/usao-ak/pr/authorities-disrupt-worlds-largest-iot-ddos-botnets-responsible-record-breaking-attacks) four IoT botnets comprised of at least three million devices, including DVRs, webcams, routers, and off-brand Android TV boxes. Back in 2023, [ESET researchers found a kill switch](https://www.welivesecurity.com/en/eset-research/who-killed-mozi-finally-putting-the-iot-zombie-botnet-in-its-grave/) that had been used to take down Mozi, one of the most prolific botnets out there.

Some smart devices are more at risk than others. No-name Android TV boxes may contain insecure services, pre-installed malware or outdated operating systems that are exposed to exploitation. In June 2025, the FBI warned that these and other devices were being used as part of the [BADBOX 2.0 botnet](https://www.fbi.gov/investigate/cyber/alerts/2025/home-internet-connected-devices-facilitate-criminal-activity).

## What do I do when support ends?

If a smart product is no longer supported and therefore not receiving software updates, its functionality may start to degrade and it will become more exposed to security risks. For those reasons it’s best to replace it as soon as possible. That’s especially true of routers which are your digital front door to the smart home. Cameras and smart locks or home alarms should also be prioritized for replacement once they reach EoL.

However, sometimes it’s not even clear at the time of purchase how long a device will receive updates. [A 2024 FTC study](https://www.ftc.gov/news-events/news/press-releases/2024/11/smart-products-surveyed-fail-provide-consumers-information-how-long-companies-will-provide-software) found that 89% of manufacturer web pages failed to disclose how long products would receive updates for. Your first port of call should be to record your model number and firmware version, and then check the manufacturer’s website for firmware release notes and EoL information. Be aware that the end of a warranty period doesn’t necessarily mean a vendor will stop providing updates. The details matter, as does the region in which you’re located.

The end of a warranty doesn’t necessarily mean the end of updates, and a device can lose support while still under warranty. Where you live can make the answer easier to find. In the UK, manufacturers of consumer smart products have had to publish a minimum security update period since April 2024. In the EU, the Cyber Resilience Act will require manufacturers to declare a support period, generally of at least five years, once its main obligations apply in December 2027.

## How do I keep my smart home secure?

Consider the following to optimize the security of your smart home:

-   **Start with the router:** To slash the odds of your [router getting hacked](https://www.eset.com/blog/en/home-topics/device-protection/router-hacked-check-fix/?utm_source=welivesecurity.com&utm_medium=referral&utm_campaign=autotagging&utm_content=digital-security&utm_term=en), ensure it’s on the latest firmware, and replace if it’s no longer supported. Also, replace default passwords with strong, unique credentials. Disable WPS and remote administration unless explicitly needed.
-   **Segment smart devices from the rest of your IT:** Create a separate guest network for all IoT devices so that hackers have a much harder time using them as a stepping stone into your PCs. Block connections from these devices to your trusted computers.
-   **Switch on automatic updates:** For devices that are still supported, auto updates will keep them current.
-   **Protect your accounts:** Use unique, strong passwords for each smart home account, stored in a password manager. Add an extra layer of security by switching on multi-factor authentication (MFA) where available.
-   **Limit your risk exposure:** Disable UPnP and port forwarding where appropriate. Steer clear of no-name Android boxes. Review your list of connected devices and router logs from time to time to check for anything suspicious.

## FAQs

**How long do smart home devices get security updates?**

It depends. It’s always best to look up your model number and firmware release notes on the manufacturer’s website.

**What happens when a smart device company shuts down its app or cloud?**

Functionality will start to degrade and the device will no longer receive security updates. That means it could be at risk of attacks that exploit newly found vulnerabilities.

**Is it safe to use a smart camera or router that no longer gets updates**

It is unadvisable as these are critical devices which are at a greater risk of compromise if they’re not receiving security updates. Your home router could be hijacked to redirect you to malicious sites, steal your passwords, and eavesdrop on your communications. And if hackers access your smart camera, it could put your family in physical danger.

**How do I know if my smart device is end of life?**

Check your model details and firmware version with the manufacturer’s website. If there’s no notice and the last firmware update was years ago, assume it’s no longer supported.

**Can hackers use my old smart TV or camera?**

Yes, depending on the vulnerability they exploit, it may allow them to remotely view live or recorded footage from your camera, and any info stored on a smart TV. Both could be used to gain a foothold in your home IT network. And both could be compromised and conscripted into a botnet to attack others.

**Are no-name Android TV boxes safe?**

Many aren’t. They’re more likely to contain insecure services/apps, pre-installed malware or outdated operating systems that are exposed to exploitation.
