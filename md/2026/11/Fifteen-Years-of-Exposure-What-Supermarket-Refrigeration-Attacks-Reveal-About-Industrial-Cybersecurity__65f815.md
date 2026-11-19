---
title: "Fifteen Years of Exposure: What Supermarket Refrigeration Attacks Reveal About Industrial Cybersecurity"
source: https://www.ioactive.com/supermarket-refrigeration-cyberattacks-industrial-cybersecurity/
source_host: www.ioactive.com
clip_date: 2026-11-19T08:27:54+08:00
trace_id: ac09e8aa-6789-4d31-82ce-98825bf90e30
content_hash: 4c85fe278e3790f895e99c2023605b43c3724ce80ff1e1a5faf65d5db7e4a975
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
notion_page_id: 41d75244-d011-81e3-907b-eab33cf6fac9
ioc:
  cves:
    - CVE-2024-2617
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

![](https://www.ioactive.com/wp-content/uploads/2026/11/Supermarket-Refrigeration-Cybersecurity-Exposed-1024x576.png)

## Key Takeaways

-   Cyberattacks against supermarket refrigeration systems across Europe in October and November 2026 demonstrate how the compromise of internet-connected operational technology (OT) can result in physical disruption and significant financial losses.
-   Internet-exposed industrial control systems are not a new problem. Research published in 2011 and the subsequent Project SHINE initiative identified widespread exposure of industrial equipment more than a decade ago.
-   Removing direct internet exposure through firewalls and secure remote access is an important mitigation, but does not eliminate the underlying security risks.
-   The December 2025 attacks against Polish renewable energy facilities demonstrate the limitations of perimeter security when firewalls are themselves inadequately secured and industrial equipment remains vulnerable.
-   Effective OT cybersecurity requires a combination of asset visibility, secure configuration, vulnerability management, network segmentation and ongoing assessment of both perimeter and internal systems.

## A New Target, a Familiar Problem

During October and early November 2026, a series of cyberattacks targeted commercial refrigeration systems across Europe, affecting supermarkets and other food retailers. **[\[7\]](#fn_7)**

The initial incidents in France reportedly affected approximately 700 supermarkets. Subsequent attacks were reported in several European countries, including Ireland, Sweden, Belgium and the United Kingdom.

In these incidents, attackers gained unauthorised access to refrigeration management systems and manipulated operating parameters, including temperature setpoints and defrost functions. Some retailers reported refrigeration temperatures reaching 50°C, resulting in food spoilage, operational disruption and significant financial losses.

Although the investigation into these incidents remains ongoing, the attacks have drawn attention to the security of internet-connected refrigeration management equipment.

Modern commercial refrigeration systems commonly incorporate centralised management capabilities, allowing operators and maintenance providers to monitor temperatures, configure operating parameters, manage alarms and diagnose faults remotely.

These capabilities deliver tangible operational benefits, particularly for retailers managing large numbers of refrigeration units across geographically distributed locations.

However, they also introduce cybersecurity risks when management interfaces are exposed directly to the Internet or protected by inadequate security controls.

Security researchers have previously identified vulnerabilities in refrigeration management systems, including authentication bypass and command injection vulnerabilities affecting Danfoss AK-SM 800A controllers. **[\[3\]](#fn_3)**

While manufacturers have released updates addressing identified vulnerabilities, internet-wide research continues to identify exposed systems running outdated firmware.

The recent attacks illustrate an important distinction between conventional IT security incidents and attacks against OT.

The attacker does not necessarily need to compromise the physical equipment or exploit vulnerabilities in its underlying control logic.

**Access to legitimate management functionality may be sufficient to manipulate the physical process and cause operational disruption.**

More significantly, the underlying security weaknesses are not new.

## Industrial Internet Exposure: A Problem Documented Since 2011

In June 2011, Eireann Leverett published *Quantitatively Assessing and Visualising Industrial System Attack Surfaces*, research examining the exposure of industrial control systems to the public Internet. **[\[1\]](#fn_1)**

Using historical data collected through Shodan, the research identified more than 7,500 internet-accessible industrial devices, including building management systems, HVAC controllers, meters and SCADA systems.

The research demonstrated that industrial equipment, often assumed to be isolated from external networks, was accessible through publicly routable internet connections.

It also explored the correlation between exposed devices, identifiable software and publicly documented vulnerabilities.

The objective was not simply to identify exposed systems, but to provide organisations with better visibility of their external attack surfaces and support the prioritisation of security improvements.

This work anticipated a challenge that continues to affect industrial cybersecurity: organisations cannot effectively protect systems they do not know are exposed.

The following year, Project SHINE (**SH** odan **IN** telligence **E** xtraction), established by Rob Radvanovsky and Jake Brodsky, expanded this research. **[\[2\]](#fn_2)**

Project SHINE used Shodan to identify and catalogue internet-accessible industrial control systems. By the conclusion of its data collection in January 2014, the project had identified more than two million unique IP addresses associated with potentially relevant industrial equipment.

These figures require careful interpretation. An internet-accessible system is not necessarily vulnerable, and search-engine results do not provide a reliable measure of the total number of individual industrial devices.

Nevertheless, the research established that internet exposure was a widespread issue affecting multiple industrial sectors.

More than a decade later, the circumstances surrounding the supermarket refrigeration attacks suggest that many of the same challenges remain unresolved.

Industrial connectivity has expanded considerably, driven by remote maintenance requirements, centralised monitoring, operational efficiency and the increasing integration of IT and OT environments.

However, increased connectivity has not always been accompanied by equivalent improvements in cybersecurity governance, asset management or vulnerability remediation.

The result is an expanding population of connected industrial devices whose security may depend on outdated software, insecure configurations or insufficiently controlled remote access.

## The Obvious Response: Secure the Network Perimeter

The immediate recommendation for organisations operating internet-exposed industrial equipment is straightforward: remove unnecessary direct access from public networks.

Industrial controllers, management interfaces and engineering services should not normally be directly accessible from the Internet.

Where remote access is operationally necessary, organisations should implement appropriately configured security controls, including firewalls, network segmentation and secure remote access mechanisms.

These measures can significantly reduce the attack surface by limiting the systems and services available to an external attacker.

However, a firewall should not be considered the endpoint of an organisation’s industrial cybersecurity strategy.

A firewall is itself a network-connected computing platform, potentially incorporating an operating system, web-based management interface, VPN services and other externally accessible functionality.

Like other software-based systems, it requires secure configuration, vulnerability management, authentication controls and ongoing maintenance.

Furthermore, while a firewall can restrict access to an industrial network, it does not automatically address vulnerabilities in the devices operating within that network.

Once an attacker obtains authorised or unauthorised access through the perimeter, weaknesses such as default credentials, insecure services and outdated firmware may remain exploitable.

The consequences of these overlapping weaknesses were demonstrated in the December 2025 attacks against Polish energy infrastructure.

## Poland’s Renewable Energy Attacks: When the Perimeter Becomes the Attack Surface

On 29 December 2025, coordinated cyberattacks targeted multiple organisations within Poland’s energy and manufacturing sectors. **[\[4\]](#fn_4)**

According to a detailed technical report published by CERT Polska on 30 January 2026, the attacks affected at least 30 wind and photovoltaic installations, a combined heat and power plant, and a manufacturing organisation. **[\[5\]](#fn_5)**

At the renewable energy facilities, the attackers targeted grid connection points (GCPs), which provide the interface between generating facilities and electricity distribution networks.

These locations typically contain industrial automation equipment, including remote terminal units (RTUs), human-machine interfaces (HMIs), protection relays and communications infrastructure.

The attackers damaged multiple industrial devices, resulting in the loss of communications between affected facilities and their distribution system operators.

Although electricity generation continued and the attacks did not affect the stability of Poland’s electricity system, CERT Polska assessed that the attackers had obtained sufficient access to potentially disrupt generation at the affected facilities.

The incident provides a valuable case study in the limitations of relying primarily on perimeter security.

## The Firewalls Were Present

CERT Polska reported that every affected renewable energy facility had a FortiGate appliance operating as both a firewall and VPN concentrator.

These systems were intended to provide controlled remote connectivity while protecting the internal industrial networks.

However, investigators identified several weaknesses in their deployment and maintenance.

All affected installations had internet-accessible VPN interfaces that permitted authentication without multifactor authentication.

Furthermore, some appliances had previously remained vulnerable to serious security flaws, including remote code execution vulnerabilities, for extended periods.

The report also highlighted the potential risks associated with reusing administrative credentials across multiple facilities.

Importantly, CERT Polska could not conclusively determine the initial compromise mechanism.

The attackers factory-reset the compromised FortiGate appliances, destroying logs and other information that could have established precisely how access was obtained.

Consequently, it would be inaccurate to conclude that exploitation of an unpatched FortiGate vulnerability was definitively responsible for the initial compromise.

Nevertheless, the investigation established that the attackers had obtained administrative access to the security appliances.

This access significantly undermined the protection offered by the network perimeter.

## Segmentation Depends on the Security of Its Enforcement Points

Some of the affected facilities implemented network segmentation through separate VLANs.

While segmentation is an important industrial security control, its effectiveness depends on the integrity of the systems enforcing communication restrictions between network segments.

CERT Polska reported that the attackers possessed administrative privileges on the FortiGate devices and could therefore potentially access credentials permitting connectivity to multiple network segments or modify the firewall configuration to establish equivalent access.

In this situation, compromising the perimeter device created opportunities to bypass or undermine the network boundaries it was responsible for enforcing.

This illustrates a broader challenge associated with consolidating security functionality within a single appliance.

Where remote access, firewall enforcement and inter-network routing are managed by the same device, its compromise may have consequences across multiple security functions.

Organisations must therefore assess the security of network enforcement points with the same rigour applied to the industrial systems they protect.

## Vulnerabilities Behind the Firewall

The Polish investigation also demonstrated that successful perimeter compromise was only one component of the attack.

After accessing the industrial networks, the attackers exploited insecure configurations and weak authentication controls across several types of industrial equipment.

CERT Polska documented multiple examples:

**Hitachi RTU560 controllers:** The attackers used default credentials to access controller management interfaces and upload deliberately corrupted firmware. This caused the affected devices to enter repeated reboot cycles, disrupting communication and remote control capabilities.

The investigation also found that secure firmware verification functionality, available on some affected devices, had not been enabled. Separately, some firmware versions were affected by CVE-2024-2617, a vulnerability capable of bypassing firmware verification.

**Mikronika RTUs:** Default root credentials enabled access to Linux-based controllers through SSH. The attackers subsequently executed destructive commands against the devices’ filesystems.

**Hitachi Relion protection relays:** Default FTP credentials permitted access to system files, which the attackers deleted. CERT Polska noted that following the manufacturer’s recommended deployment configuration would have disabled these accounts.

**Moxa NPort serial device servers:** Default credentials allowed attackers to modify device configurations, perform factory resets and assign unusable network addresses.

**Windows-based HMIs:** Common administrative passwords enabled the compromise of several HMI systems and the deployment of destructive malware.

One particularly revealing observation concerned facilities that did not use the same administrator passwords.

Where unique credentials had been configured, the attackers’ password-breaking attempts were unsuccessful, and the corresponding HMI systems were not damaged.

This provides a practical demonstration of the effectiveness of fundamental security controls.

Even during a coordinated, destructive attack against industrial infrastructure, relatively straightforward measures such as eliminating default credentials and implementing unique administrative passwords were sufficient to prevent some of the observed compromises.

The incident demonstrates two distinct but related risks.

First, an inadequately secured perimeter appliance can become an effective entry point into an otherwise segmented industrial network. Second, vulnerabilities and insecure configurations within that network remain significant risks regardless of the presence of perimeter security.

**Protecting the network boundary is necessary, but it does not remove the requirement to secure the systems operating behind it.**

## Similar Weaknesses Identified During Wind Farm Security Assessments

The security weaknesses documented by CERT Polska are consistent with issues identified during real-world industrial cybersecurity assessments.

Research presented in *ACME Windpharm – It Can’t Be ‘Smart’ If You Lack Simple Security* explored vulnerabilities identified during wind farm security assessments, including insecurely configured network equipment, inadequate patching and excessive reliance on perimeter security appliances. **[\[6\]](#fn_6)**

The assessments highlighted the risks associated with deploying sophisticated security technologies without maintaining fundamental security practices.

Industrial networks may incorporate dedicated firewalls, managed switches and remote access infrastructure, yet still contain devices running vulnerable firmware or configured with insecure management services.

Similarly, security appliances may be deployed to protect critical systems without sufficient consideration of their own vulnerability exposure or ongoing maintenance requirements.

These weaknesses are particularly significant in distributed renewable energy environments.

Wind and solar installations commonly rely on remote communications infrastructure for monitoring, maintenance and interaction with distribution network operators.

Individual facilities may be geographically isolated, unmanned and maintained by multiple suppliers or service providers.

This introduces additional challenges around asset ownership, vulnerability management, access control and the consistent application of security requirements.

The Polish incidents demonstrate how these weaknesses can be combined during a real-world attack.

An attacker who compromises remote access infrastructure may subsequently exploit weaknesses in industrial controllers, communications devices and management systems.

Importantly, the vulnerabilities required for such attacks are not necessarily sophisticated or previously unknown.

Many arise from insecure deployment practices, missing security updates and inadequate access controls.

## Moving Beyond Perimeter Security

The lessons from the refrigeration incidents and Polish energy attacks are relevant to organisations operating connected industrial systems across multiple sectors.

Effective protection requires a defence-in-depth approach that addresses both external exposure and internal security weaknesses.

### 1\. Establish Visibility of Internet-Accessible Assets

Organisations need an accurate understanding of which industrial systems and management services are accessible from external networks.

This should include equipment installed or maintained by third parties, remote maintenance connections, cellular routers and other communications infrastructure that may not be managed by central IT teams.

External attack surface assessments can help identify undocumented or unintended exposure.

Importantly, this should be an ongoing activity rather than a one-time exercise.

### 2\. Secure Remote Access Infrastructure

Firewalls, VPN concentrators and other remote access technologies should be managed as security-critical assets.

Controls should include:

-   Timely security updates and vulnerability remediation.
-   Multifactor authentication for remote access.
-   Restricted management interfaces and administrative privileges.
-   Unique credentials across sites and systems.
-   Network access limited to specific operational requirements.
-   Centralised logging and monitoring, with records protected from deletion following appliance compromise.

Where feasible, remote maintenance access should be restricted to authorised users and activated only when operationally required.

### 3\. Assess Security Beyond the Perimeter

Network segmentation reduces exposure but does not eliminate vulnerabilities within protected environments.

Organisations should assess industrial controllers, HMIs, engineering workstations, communications devices and other operational assets for insecure configurations and known vulnerabilities.

Particular attention should be given to default credentials, unnecessary services, outdated firmware and insecure management protocols.

Security assessments should also examine whether compromise of a remote access service would provide excessive access to otherwise separated systems.

### 4\. Implement Risk-Based Vulnerability Management

Patching industrial systems presents operational challenges that differ from those encountered in conventional IT environments.

Updates may require testing, planned maintenance windows or coordination with equipment manufacturers.

Some industrial products may have limited support lifecycles or dependencies that prevent immediate remediation.

However, these constraints reinforce the need for structured vulnerability management rather than removing it.

Where vulnerabilities cannot be promptly remediated, organisations should implement appropriate compensating controls, document residual risks and establish clear ownership of the remediation process.

### 5\. Validate Recovery and Operational Resilience

The Polish attacks demonstrate that attackers may deliberately destroy device configurations, firmware and local system data to complicate recovery.

Industrial incident response planning should therefore consider more than restoring conventional IT services.

Organisations should maintain protected backups of device configurations and firmware, verify their restoration procedures, and establish how critical industrial processes can be operated or recovered when remote management infrastructure is unavailable.

For refrigeration environments, additional consideration should be given to independent temperature monitoring, alarm systems and operational safeguards capable of detecting or limiting unauthorised changes to control parameters.

The objective is not only to prevent compromise, but also to reduce its potential physical consequences.

## The Continuing Challenge of Industrial Cybersecurity

The recent supermarket refrigeration attacks illustrate how increasingly connected industrial systems can expose organisations to operational and financial risks.

However, the underlying security challenges have been understood for more than fifteen years.

Research in 2011 demonstrated that industrial equipment was accessible from the public Internet.

Project SHINE subsequently highlighted the scale of industrial internet exposure.

More recent industrial security assessments have continued to identify weaknesses involving vulnerable network appliances, insecure configurations and inadequate access controls.

The December 2025 attacks against Polish renewable energy infrastructure demonstrated the consequences when attackers successfully exploit combinations of these weaknesses.

The common theme is not simply that industrial devices are connected to the Internet.

Remote connectivity is often an essential operational requirement.

Rather, it is that connectivity must be accompanied by security controls appropriate to the criticality and operational characteristics of the systems involved.

Installing a firewall can significantly reduce exposure, but **the firewall must itself be secured, and the systems behind it must not be assumed secure simply because external access is restricted**.

The most effective approach combines asset visibility, secure remote access, vulnerability management, network segmentation, system hardening and validated recovery capabilities.

Fifteen years after researchers first demonstrated the scale of internet-exposed industrial infrastructure, the challenge is no longer establishing that the problem exists.

It is ensuring that organisations consistently implement and maintain the controls needed to address it.

## References

**\[1\]** Eireann Leverett, *Quantitatively Assessing and Visualising Industrial System Attack Surfaces*, University of Cambridge, June 2011. [**https://www.cl.cam.ac.uk/~fms27/papers/2011-Leverett-industrial.pdf**](https://www.cl.cam.ac.uk/~fms27/papers/2011-Leverett-industrial.pdf)

**\[2\]** Project SHINE, *Findings Report*, Infracritical, 2014. **[https://infracritical.com/p/project-shine-findings-report-1oct2014.pdf](https://infracritical.com/p/project-shine-findings-report-1oct2014.pdf)**

**\[3\]** Claroty Team82, *Freeze the Controller, Defrost the Food: Uncovering Vulnerabilities in Danfoss Refrigeration Controllers*, August 2026. **[https://claroty.com/team82/research/freeze-the-controller-defrost-the-food-uncovering-vulnerabilities-in-danfoss-refrigeration-controllers](https://claroty.com/team82/research/freeze-the-controller-defrost-the-food-uncovering-vulnerabilities-in-danfoss-refrigeration-controllers)**

**\[4\]** John O’Mahoney – IOActive Inc, *Lessons from the Polish Energy Sector Incident*, July 2026. **[https://www.ioactive.com/lessons-from-the-polish-energy-sector-incident/](https://www.ioactive.com/lessons-from-the-polish-energy-sector-incident/)**

**\[5\]** CERT Polska, *Energy Sector Incident Report – 29 December 2025*, published 30 January 2026. **[https://cert.pl/uploads/docs/CERT_Polska_Energy_Sector_Incident_Report_2025.pdf](https://cert.pl/uploads/docs/CERT_Polska_Energy_Sector_Incident_Report_2025.pdf)**

**\[6\]** CS3STHLM, *ACME Windpharm – It Can’t Be ‘Smart’ If You Lack Simple Security*, presentation by Colin Cassidy. [**https://4sics.se/program/presentations/colin-cassidy/**](https://4sics.se/program/presentations/colin-cassidy/)

**\[7\]** Reuters, Associated Press and RTÉ, reporting on European supermarket refrigeration cyberattacks, October–November 2026. **[https://www.reuters.com/business/retail-consumer/temperature-soars-swedish-grocery-store-freezers-one-store-blames-hackers-2026-11-02/](https://www.reuters.com/business/retail-consumer/temperature-soars-swedish-grocery-store-freezers-one-store-blames-hackers-2026-11-02/)**

The post [Fifteen Years of Exposure: What Supermarket Refrigeration Attacks Reveal About Industrial Cybersecurity](https://www.ioactive.com/supermarket-refrigeration-cyberattacks-industrial-cybersecurity/) appeared first on [IOActive](https://www.ioactive.com/).
