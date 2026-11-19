---
title: The FAA Ground Stop Wasn’t a Cyberattack. The Next One Might Be.
source: https://www.ioactive.com/faa-ground-stop-legacy-infrastructure-cybersecurity/
source_host: www.ioactive.com
clip_date: 2026-11-19T09:41:07+08:00
trace_id: ccc805bb-5965-472f-a944-327f79499475
content_hash: 853678e5e990ca6b7348e0d606541bd02846ce29d7bbd27e44bf5921a41e5367
status: synced
tags: []
series: null
feed_source: IOActive·硬件/漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81b0-9187-e0b634ba9675
ioc: null
---

![IOActive Aircraft Network Graphic](https://www.ioactive.com/wp-content/uploads/2026/11/IOActive-Aircraft-Network-Graphic-1024x576.png)

IOActive Aircraft Network Graphic

**The short answer:** The FAA’s nationwide ground stop on Friday, November 13, 2026, was not a cyberattack. Officials traced it to a newly installed router at a remote FAA radio site in El Dorado, Arkansas, plus a second router in Amarillo, Texas, that flooded the agency’s communications network with data. But that’s exactly why it should worry anyone who runs critical infrastructure. If one router doing what it was configured to do can ground more than 12,000 flights, imagine what an attacker who understands that network could do on purpose.

We spend a lot of time at IOActive breaking things that were never designed to be attacked. Air traffic control, power grids, water plants, rail signaling. Most of it runs on technology older than the smartphone in your pocket. Last week was a reminder that “it hasn’t been hacked yet” isn’t a security strategy. It’s luck.

## What you’ll take away from this post

-   What actually happened during the FAA outage, and what we still don’t know
-   Why aging, “outdated” infrastructure is so hard to defend
-   Why the modernization window that’s opening right now is the moment to build security in
-   Practical steps operators can take today, before the replacement money arrives

## What caused the FAA ground stop?

A router swap at a remote site caused it. According to **[Yahoo News’ live coverage](https://www.yahoo.com/news/us/live/faa-ground-stop-latest-updates-duffy-blames-contractor-l3harris-thousands-more-flights-canceled-saturday-no-sign-of-cyberattack-161329174.html)**, crews were moving an FAA radio site in El Dorado, Arkansas, from copper lines to fiber. When the new router came online, it and a router installed weeks earlier at a radar site in Amarillo, Texas, began flooding the network with traffic.

Here’s the timeline, as reported over the weekend:

| Date | What happened |
| --- | --- |
| Sun, Nov. 15 | About 1,570 U.S. cancellations by mid-morning. FAA disables the broadcast feature on all 69 routers of that type. |
| Sat, Nov. 14 | About 6,700 U.S. cancellations. Officials say there’s no evidence of a cyberattack. |
| Fri, Nov. 13 | Nationwide ground stop. Instability hits 17 of the FAA’s 22 en route centers. Operators cancel about 12,462 flights. |

A few details stand out to anyone who does security work for a living:

-   **It took about 45 minutes to trace the problem.** The FAA administrator said that was partly because maintenance is logged on paper.
-   **Controllers lost contact with some aircraft.** The controllers’ union president said crews had to hunt for working frequencies and hand planes off to each other.
-   **There’s no redundancy.** Every facility relies on one network. FAA Administrator Bryan Bedford put it bluntly: “there’s no backup to the backup.”
-   **This has happened before.** In 2009, a misconfigured router during a similar fiber move disrupted 129 air traffic facilities, per a Transportation Department inspector general review.
-   **Nobody knows yet whether it was the hardware or the install.** Juniper’s parent company says the devices didn’t fail. The investigation, which includes the FBI, is ongoing.

The FAA’s own **[Q&A on the ground stop](https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers)** says it will reevaluate when it does replacement and maintenance work.

## Why is outdated infrastructure a cybersecurity risk?

Legacy infrastructure is risky because it was built for reliability in a closed world, not for an adversary on the network. Most of the systems that keep planes, power and water moving were designed decades ago. Their engineers assumed physical isolation, trusted every device on the wire, and never pictured the internet reaching them.

That assumption no longer holds, and the FAA outage shows why in a few ways.

**One bad packet stream can take down everything.** The FAA network has no meaningful segmentation or fallback. A single device broadcasting more than it should cascaded across most of the country. Attackers love architectures like this. They don’t need to compromise 22 centers. They need one foothold and a way to make noise.

**Visibility is poor.** If maintenance records live on paper, defenders are working blind. You can’t detect an anomaly if you don’t know what normal looks like, or what changed an hour ago. The controllers’ union has even pointed out that some FAA computers are still updated with floppy disks.

**Modernization creates its own attack surface.** This is the part people miss. The outage didn’t happen because the old copper network failed. It happened during the upgrade. Every migration mixes old and new: new routers talking to old radar, new fiber feeding old protocols. Those seams are where misconfigurations hide, and where attackers look first.

**The supply chain is long.** The FAA network is owned and run by a contractor, uses hardware from another vendor, and depends on telecom partners for the fiber. Each handoff is a trust relationship. A feature turned on by default, a firmware version nobody vetted, or a remote-access path left open for a technician can all become an entry point.

None of this is unique to aviation. We see the same patterns across **[critical infrastructure](https://www.ioactive.com/industry/critical-infrastructure)** every week, in utilities, oil and gas, manufacturing and rail. Aviation just happens to be the sector where a failure makes the evening news within minutes.

## Why now is the time to secure legacy infrastructure

Now is the time because the money, the attention and the attack roadmap all arrived in the same week. The Transportation Department says it’s sending Congress a new funding request, on top of the $12.5 billion approved last year. Bedford estimates about $10.1 billion more is needed just to finish modernization, and Duffy has said more outages are possible until the copper lines are fully replaced at the end of 2028.

That’s a two-year window where old and new systems run side by side. Here’s why it matters.

**1\. Security is cheapest when it’s in the contract.** Once a replacement network is designed, bought and deployed, bolting on segmentation, monitoring and secure configuration costs far more. Requirements written today shape what gets built through 2028 and beyond. If security testing isn’t a line item in the modernization budget, it won’t happen.

**2\. Everyone just saw the weak spot.** The outage was accidental, but it was also a public demonstration. It showed that a flood of traffic from one remote site can destabilize 17 of 22 en route centers. U.S. agencies have spent the last few years warning that state-backed groups are quietly positioning themselves inside American critical infrastructure. You can be sure they read the same headlines.

**3\. The transition is the riskiest phase.** Hybrid environments are where defenders have the least visibility and attackers have the most options. Teams are stretched, change windows are tight, and temporary access paths for contractors tend to become permanent.

**4\. “No evidence of a cyberattack” isn’t the same as “secure.”** It means investigators haven’t found one. Every operator should ask a harder question: if this had been deliberate, would we have known, and how fast?

The lesson isn’t limited to the FAA. Any organization running decades-old control systems through a modernization program, whether that’s a grid operator, a port, a rail line or a water utility, is in the same window right now.

## How do you protect legacy infrastructure from cyberattacks?

You protect legacy infrastructure by assuming you can’t replace it overnight and hardening what’s there while you modernize. You don’t need a $10 billion budget to start. These are the steps we recommend to operators in aviation, energy and other critical sectors:

1.  **Build a real asset inventory.** Know every device, firmware version and network path, including the remote sites nobody visits. Ditch paper change logs for something searchable.
2.  **Segment the network.** A fault or a compromise at one site should stay at that site. Rate-limit and filter traffic between zones so one noisy device can’t flood the whole system.
3.  **Treat every migration as a security event.** Review configurations before go-live, disable features you don’t need (like the broadcast function the FAA just turned off on 69 routers), and test changes in a lab that mirrors production.
4.  **Test the new gear before it ships.** Hardware and firmware from vendors and integrators should be assessed independently. “It worked as intended” isn’t reassuring if what was intended can bring down a national network.
5.  **Lock down third-party access.** Map every contractor and telecom partner connection. Make remote access time-limited, logged and monitored.
6.  **Monitor for anomalies, not just signatures.** Operational networks have predictable traffic. A sudden flood should trigger an alert in seconds, not a 45-minute hunt.
7.  **Rehearse the bad day.** Run tabletop exercises and red team scenarios that assume an attacker caused the outage. Find out how long detection, isolation and recovery actually take.
8.  **Write security into modernization contracts.** Require secure-by-design architecture, independent penetration testing and vulnerability disclosure from every vendor in the program.

## How IOActive helps secure aging critical infrastructure

IOActive has been testing the systems other people assume are safe since 1998. Our researchers have published original work on aviation vulnerabilities, from in-flight systems to SATCOM, and we’ve run penetration tests, risk assessments and architecture reviews at major airports. We take the same attacker’s-eye view to energy, rail, maritime and industrial control environments.

Where we can help during a modernization like the FAA’s:

| Need | How IOActive helps |
| --- | --- |
| Know what’s actually on the network | OT/ICS assessments, asset inventory verification and architecture reviews |
| Vet new routers, controllers and firmware | Hardware and embedded security testing in our labs in Seattle, Madrid and Cheltenham |
| Find out if an attacker could cause a cascade | **[Red and purple team engagements](https://www.ioactive.com/wp-content/uploads/2025/10/IOActive_Red_Purple_Team_Cybersecurity_Services.pdf)** that emulate real threat actors |
| Reduce vendor and integrator risk | Supply chain and third-party security assessments |
| Meet aviation regulations | Assessments that support TSA cybersecurity requirements for airports and aircraft operators |
| Plan the modernization securely | Strategic advisory and secure-by-design architecture reviews |

## Keep reading

-   **[Aviation cybersecurity services](https://www.ioactive.com/industry/transportation-aviation)**
-   **[Critical infrastructure security](https://www.ioactive.com/industry/critical-infrastructure)**
-   **[Navigating the Cybersecurity Threatscape of Today’s Airports](https://ioactive.com/navigating-cybersecurity-threatscape-of-todays-airports/)**
-   **[Rethinking the CIA Triad in Operational Technology Environments](https://www.ioactive.com/rethinking-the-cia-triad-in-operational-technology-environments/)**

If you’re responsible for infrastructure that was built before anyone worried about attackers, we’d like to talk. **[Contact our team](https://ioactive.com/contact/)** to scope an assessment before your next upgrade window, not after it.

## Frequently asked questions

**What caused the FAA ground stop on November 13, 2026?** A newly installed router at an FAA radio site in El Dorado, Arkansas, and a recently replaced router at a radar site in Amarillo, Texas, flooded the FAA’s communications network with data during a copper-to-fiber upgrade. The instability hit 17 of the FAA’s 22 en route centers.

**Was the FAA outage a cyberattack?** No. FAA and Transportation Department officials said they found no evidence of a cyberattack. The FBI is assisting in the investigation, and officials haven’t yet determined whether the cause was faulty hardware or a configuration error.

**How many flights were canceled because of the FAA ground stop?** The FAA says operators canceled about 12,462 flights on Friday, November 13. FlightAware data showed roughly 6,700 more U.S. cancellations Saturday and about 1,570 by mid-morning Sunday.

**Why is outdated infrastructure a cybersecurity risk?** Legacy systems were designed for reliability in isolated environments, not to resist attackers. They often lack network segmentation, real-time monitoring and secure configuration, so a single compromised or misbehaving device can disrupt an entire system.

**How can organizations protect legacy infrastructure from cyberattacks?** Start with an accurate asset inventory, segment the network, test new hardware before deployment, lock down third-party access, monitor for traffic anomalies and run red team exercises. Build security requirements into every modernization contract.

**When will the FAA’s legacy network be replaced?** Transportation Secretary Sean Duffy has said the copper lines will be fully replaced by the end of 2028, and that more disruptions are possible until then.
