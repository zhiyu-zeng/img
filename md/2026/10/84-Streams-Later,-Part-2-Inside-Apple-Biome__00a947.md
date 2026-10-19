---
title: "84 Streams Later, Part 2: Inside Apple Biome"
source: https://blog.digital-forensics.it/2026/07/84-streams-later-part-2-inside-apple.html
source_host: blog.digital-forensics.it
clip_date: 2026-10-19T10:16:23+08:00
trace_id: 0f0530fd-b521-46ef-bed8-28d060029280
content_hash: 27c49eab9e881151049243fa2b83d0f2e8e05187679108b2877ccd2792edced8
status: synced
tags:
  - iOS逆向
  - 安全工具
series: null
feed_source: Digital Forensics·iOS/Android取证
ai_summary: iOS 17+ 的 Biome 框架中已识别出 84 条具有取证价值的流，按设备状态、连接设备、地理位置、应用使用和应用数据五类整理，并已接入 iLEAPP。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fe75244-d011-81e5-b2c6-e5a3a8f041d9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> iOS 17+ 的 Biome 框架中已识别出 84 条具有取证价值的流，按设备状态、连接设备、地理位置、应用使用和应用数据五类整理，并已接入 iLEAPP。
> 
> - **存储位置：** 流数据主要存放于 `db` 与 `mobile` 两个 SEGB 文件库；二者常有内容重叠，并以不同格式重复记录同一状态，例如 `_DKEvent.Device.IsPluggedIn` 与 `Device.Power.PluggedIn`。
> - **时间戳特殊行为：** 记录内容被清零后，写入时间戳仍可能保留，因此即使内容不可读，记录存在本身仍可证明设备在某时刻开机或被使用；内部起止时间戳才对应原始事件。
> - **保留期差异：** 绝大多数流保留 28 天；例外是 `Device.Metadata` 和 `Device.Timezone` 最长约 10 个月，`Discoverability.Signals` 约 9 个月，`Location.Visit` 至少 40 天，`Siri.Remembers.*` 系列可达数月。
> - **取证价值集中点：** 应用使用类是重点，例如 `Safari.Navigations`、`App.WebUsage`、`Notification.Usage`、`Keyboard.TokenFrequency`、`Messages.Read`、`Wallet.Transaction` 可提供 URL、通知内容、输入词、联系人和交易线索。
> - **解读风险与现状：** `Device.Wireless.Bluetooth` 中同一时间戳会出现多个设备列表，不能据此判定当时已连接；`_DK` 指 CoreDuet，充电类事件更接近“是否在充电”。目前仍有数百条流用途不明，84 条仅是起点。

Following my previous article, [84 Streams Later: Exploring the Evolution of Apple Biome](https://blog.digital-forensics.it/2026/07/84-streams-later-exploring-evolution-of.html), this article takes a deeper look at the work performed during the analysis, with the goal of enabling further research into the various Biome streams identified throughout the investigation.

As described in the previous post, on iOS 17 and later systems, Biome streams are primarily stored in two locations:

The analysis of these folders across multiple devices—including personal devices, test devices, and real-world forensic acquisitions—allowed the identification of 84 streams containing information that may be of forensic interest.

Based on the observed content, I categorized the streams according to the type of information they contain. To simplify the analysis, I identified five categories of information:

-   Device State (e.g., Airplane Mode on/off, device plugged in, battery level, and similar information)
-   Connected Devices and Networks (e.g., Wi-Fi and Bluetooth)
-   Device Geolocation
-   Application Usage
-   Application Data

The goal of this article is therefore to provide an overview, organized by category, of the most relevant streams identified and now processed by iLEAPP.

It is important to note that some streams may provide evidence relevant to more than one category. For example, **Safari.Navigations** represents both evidence of Safari usage and evidence of application data. Similarly, **Device.Wireless.WiFi** may provide evidence of both network connectivity and device geolocation.

For this reason, the analysis is organized according to the categories above while highlighting those streams that may have multiple forensic interpretations.

An additional note regarding timestamps is also necessary.

Each record stored in a SEGB file contains a write timestamp. This timestamp may be preserved even after the content of the record has been zeroed out. As a result, even when the actual record contents are no longer available, the existence of the record itself can sometimes provide useful information. For example, it may help determine whether a device was powered on and actively used at a particular point in time.

The write timestamp does not always correspond to the timestamp of the original event. Some streams contain internal timestamps that track the beginning and end of a specific device state or activity. A complete validation and interpretation of all timestamps, together with the forensic meaning of every field stored within each record, is outside the scope of this article. Such work requires dedicated testing and validation based on user activity and device configuration.

## Device State

The streams related to Device State represent one of the largest categories identified during the analysis.

A total of 11 relevant streams were identified within the db repository and 21 within the mobile repository. Some of these streams appear to be partially redundant, representing the same information in different formats or locations.

The relevant streams within the **db** folder are:

-   \_DKEvent.Device.BatteryPercentage
-   \_DKEvent.Device.IsPluggedIn
-   Device.BootSession
-   Device.Display.Backlight
-   Device.KeybagLocked
-   Device.Metadata
-   Device.Power.BatteryLevel
-   Device.Power.EnergyMode
-   Device.Power.PluggedIn
-   Device.ScreenLocked
-   Device.SilentMode

The relevant streams within the **mobile** folder are:

-   Audio.Route
-   CameraCapture.AutoFocusROI
-   CarPlay.Connected
-   Device.Display.InterfaceOrientation
-   Device.Power.LowPowerMode
-   Device.Thermals.BatteryTemperature
-   Device.Wireless.AirplaneMode
-   Device.Wireless.Bluetooth
-   Device.Wireless.CellularDataEnabled
-   Device.Wireless.WiFi
-   Discoverability.Signals
-   OSAnalytics.Hardware.Reliability
-   \_DKEvent.Audio.InputRoute
-   \_DKEvent.Audio.OutputRoute
-   \_DKEvent.CarPlay.IsConnected
-   \_DKEvent.Device.LowPowerMode
-   \_DKEvent.Display.Orientation
-   \_DKEvent.Keybag.IsLocked
-   \_DKEvent.Settings.DoNotDisturb
-   \_DKEvent.System.AirplaneMode
-   \_DKEvent.Wifi.Connection

It is worth noting that the \_DK acronym is generally understood to refer to Duet Knowledge (or CoreDuet Knowledge) and is associated with Apple's private CoreDuet framework, the component responsible for collecting and correlating information about user activities in order to provide device intelligence features such as Siri Suggestions, Spotlight recommendations, Shortcuts, Handoff, and related functionality.

A useful reference for understanding these events is:  
https://bluecrewforensics.com/2025/06/03/ios-stream-names/

The following sections provide a detailed description of each stream, the fields identified within the parsed records, and the observed retention period of active (non-zeroed) records.

### \_DKEvent.Device.BatteryPercentage

-   According to the “System Events” plist file: “Event capturing battery level”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Time Start
-   Time End
-   Time Write
-   Battery Percentage
-   Action GUID

### \_DKEvent.Device.IsPluggedIn

-   According to the “System Events” plist file: “Event capturing whether or not the device has charger plugged in”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Time Start
-   Time End
-   Time Write
-   Status

-   0 = Not Plugged In
-   1 = Plugged In

-   Action GUID

NOTE: As mentioned by Ian Whiffin in the article " [KnowledgeC Complete(ish)](https://www.doubleblak.com/blogPost.php?k=knowledgec2) ": “ *A more appropriate term for this artifact may be “isCharging” as a record of this type is made whenever the device is charging, and this applies equally to being physically plugged in or placed onto a Wireless Charging device* ”

### Device.BootSession

-   Device Boot Sessions
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Session State

-   0 = Session End
-   1 = Session Start

### Device.Display.Backlight

-   According to the “System Events” plist file: “Event capturing Backlight level”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Status (0/1)

### Device.KeybagLocked

-   Apparently similar to “\_DKEvent.Keybag.IsLocked”
-   According to the “System Events” plist file: “Event capturing whether or not the keybag is locked”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Value

-   0 = Unlocked
-   1 = Locked

### Device.Metadata

-   Appears to contain iOS version information
-   Exact retention is unknown, but in my tests I found up to 10 months of data
-   Parsed values:

-   SEGB Timestamp
-   OS Build

### Device.Power.BatteryLevel

-   Apparently similar to “\_DKEvent.Device.BatteryPercentage”
-   According to the “System Events” plist file: “Event capturing battery level”.
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Battery level (%)

### Device.Power.EnergyMode

-   Apparently similar to “\_DKEvent.Device.LowPowerMode” and “Device.Power.LowPowerMode”
-   According to the “System Events” plist file: “Event capturing Low Power Mode transitions”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Field 1 value (experimentally we found 1 or 2)

### Device.Power.PluggedIn

-   Apparently similar to “\_DKEvent.Device.IsPluggedIn”
-   According to the “System Events” plist file: “Event capturing whether or not the device has charger plugged in”.
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Power State:

-   0 = Not Plugged In
-   1 = Plugged In

-   Field 2

-   1 = Wireless Adapter
-   0 = Non Wireless Adapter

-   Field 3, that seems to be related to the Adapter Type

NOTE: As mentioned by Ian Whiffin in the article " [KnowledgeC Complete(ish)](https://www.doubleblak.com/blogPost.php?k=knowledgec2) ": “ *A more appropriate term for this artifact may be “isCharging” as a record of this type is made whenever the device is charging, and this applies equally to being physically plugged in or placed onto a Wireless Charging device* ”

### Device.ScreenLocked

-   According to the “System Events” plist file: “Event capturing whether or not the screen is locked”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Value

-   0 = Unlocked
-   1 = Locked

### Device.SilentMode

-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Ringer State

-   0 = Ringer On
-   1 = Silent

-   Reason

-   1 = Local Ringer Action

### Audio.Route

-   Input and output audio route
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Route Name (es. Speaker, Built-In Microphone, Built-In Receiver)
-   Port Type (es. Speaker, BluetoothA2DPOutput, MicrophoneBuiltIn)
-   Port Name
-   Field 1 (seen values 0 or 1)
-   Field 5 (seen values 1, 2, and 3)
-   Field 6 (seen values 1 or 2)

-   This also belongs to the category “Connected Devices”

### CameraCapture.AutoFocusROI

-   Camera Usage (Auto Focus)
-   Retention is 28 Days
-   Parsed Values:

-   SEGB Timestamp
-   Camera Port (es. PortTypeBack)
-   Field 8 (float)
-   Field 2 (seen value 3)
-   Field 3 (seen values 3, 4, and 9)
-   Field 4 (seen values 5, 6, 7, and 8)
-   Field 5 (seen value 2)
-   Field 6 (seen values 2 and 3)
-   Field 7
-   Field 9 (seen value 3)

### CarPlay.Connected

-   According to the “System Events” plist file: “Event capturing CarPlay connection state”
-   Apparently similar to “\_DKEvent.CarPlay.IsConnected”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   CarPlay State

-   0 = Not Connected
-   1 = Connected

-   Field 2 (seen value 1)

-   This also belongs to the category “Connected Devices”

### Device.Display.InterfaceOrientation

-   According to the “System Events” plist file: “Event capturing device orientation”
-   Apparently similar to “\_DKEvent.Display.Orientation”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Value (0, 1 or 2)

### Device.Power.LowPowerMode

-   Apparently similar to “\_DKEvent.Device.LowPowerMode” and “Device.Power.EnergyMode”
-   According to the “System Events” plist file: “Event capturing Low Power Mode transitions”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Value

-   0 = Off
-   1 = On

### Device.Thermals.BatteryTemperature

-   According to the “System Events” plist file: “dasd battery temperature logging”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Temperature in Celsius
-   Field 2 (seen values 0 and 1)

### Device.Wireless.AirplaneMode

-   Apparently similar to “\_DKEvent.System.AirplaneMode”
-   According to the “System Events” plist file: “Event capturing Airplane Mode status”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Value

-   0 = Off
-   1 = On

### Device.Wireless.Bluetooth

-   Bluetooth Devices
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Bluetooth Mac Address
-   Name

NOTE: Please use extreme caution when interpreting this artifact. In the analyzed cases, a list of Bluetooth devices was observed with the same SEGB timestamp. It is therefore not reasonable to conclude that the presence of a device in this stream necessarily indicates that it was connected to the iOS device at that specific time.

### Device.Wireless.CellularDataEnabled

-   Cellular Data Enabled status
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Value

-   0 = Disabled
-   1 = Enabled

### Device.Wireless.WiFi

-   Apparently similar to “\_DKEvent.Wifi.Connection”
-   According to the “System Events” plist file: “Event capturing the SSID of a connected WiFi network”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   SSID
-   Status

-   Connected
-   Disconnected

-   This also belongs to the categories “Connected Devices” and “Device Geolocation”

### Discoverability.Signals

-   According to the “System Events” plist file: “Event capturing discoverability feature signals on the system”
-   Parsed values:

-   SEGB Timestamp
-   Signal
-   Payload

NOTE: Assigning a precise meaning to this stream appears particularly challenging. However, the name suggests that it contains signals used to determine what content, actions, or recommendations should be suggested or made easily discoverable to the user. The primary reason this stream is relevant is its retention period. In some cases, records still in a "written" state were observed dating back approximately nine months.

### Media.Route

-   Appears to contain media output route information.
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Route Name
-   Route Identifier

### OSAnalytics.Hardware.Reliability

-   Appears to contain hardware button press events
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Hardware (es. sleepButton, volumeDownButton, volumeUpButton)

### \_DKEvent.Audio.InputRoute

-   According to the “System Events” plist file: “Event capturing addition or removal of audio input route. Includes the type, name, and identifier of the route”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Start Timestamp
-   End Timestamp
-   Metadata (including the input device name)
-   GUID
-   Device UTC Offset

### \_DKEvent.Audio.OutputRoute

-   According to the “System Events” plist file: “Event capturing addition or removal of audio output route. Includes the type, name, and identifier of the route”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Start Timestamp
-   End Timestamp
-   Metadata (including the input device name)
-   GUID
-   Device UTC Offset

### \_DKEvent.CarPlay.IsConnected

-   According to the “System Events” plist file: “Event capturing CarPlay connection state”
-   Apparently similar to “CarPlay.Connected”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Start Timestamp
-   End Timestamp
-   Time Write
-   Status

-   0 = Disconnected
-   1 = Connected

-   Action GUID

-   This also belongs to the category “Connected Devices”

### \_DKEvent.Device.LowPowerMode

-   Apparently similar to “Device.Power.LowPowerMode” and “Device.Power.EnergyMode”
-   According to the “System Events” plist file: “Event capturing Low Power Mode transitions”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Start Timestamp
-   End Timestamp
-   Value

-   0 = Off
-   1 = On

-   GUID
-   Device UTC Offset

### \_DKEvent.Display.Orientation

-   According to the “System Events” plist file: “Event capturing device orientation”
-   Apparently similar to “Device.Display.InterfaceOrientation”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Start Timestamp
-   End Timestamp
-   Value (0, 1 or 2)
-   GUID
-   Device UTC Offset

### \_DKEvent.Keybag.IsLocked

-   According to the “System Events” plist file: “Event capturing whether or not the keybag is locked”
-   Apparently similar to “Device.KeybagLocked”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Value

-   0 = Unlocked
-   1 = Locked

### \_DKEvent.Settings.DoNotDisturb

-   According to the “System Events” plist file: “Event capturing Do Not Disturb status. Includes the reason for change and metadata.”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Start Timestamp
-   End Timestamp
-   Value (seen values 0 and 1)

### \_DKEvent.System.AirplaneMode

-   Apparently similar to “Device.Wireless.AirplaneMode”
-   According to the “System Events” plist file: “Event capturing Airplane Mode status”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp 1
-   Timestamp 2
-   GUID

### \_DKEvent.Wifi.Connection

-   Apparently similar to “Device.Wireless.WiFi”
-   According to the “System Events” plist file: “Event capturing the SSID of a connected WiFi network”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Device (SSID)
-   GUID

-   This also belongs to the categories “Connected Devices” and “Device Geolocation”

## Connected Devices

The streams related to connected devices are nine in total, all located within the mobile repository:

-   Audio.Route
-   CarPlay.Connected
-   Device.Wireless.WiFi
-   Media.NowPlaying
-   Media.Route
-   \_DKEvent.Audio.InputRoute
-   \_DKEvent.Audio.OutputRoute
-   \_DKEvent.CarPlay.IsConnected
-   \_DKEvent.Wifi.Connection

Several of the streams in this category were already introduced in the Device State section because they simultaneously represent device state changes and connectivity events.

### Media.NowPlaying

-   According to the “System Events” plist file: “Event capturing "now playing" state.”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Bundle ID
-   Output device
-   Media Type
-   Title
-   Artist

-   This also belongs to the categories “Application Usage” and “Application Data”, as it can contain the bundle ID and the played title

## Device Geolocation

The streams related to device geolocation are five in total: two within the db repository and four within the mobile repository.

The streams identified in the db repository are:

-   \_DKEvent.App.LocationActivity
-   Device.Timezone

The streams identified in the mobile repository are:

-   App.LocationActivity
-   Device.Wireless.WiFi
-   Location.Visit
-   \_DKEvent.Wifi.Connection

The Wi-Fi-related streams were already introduced in the "Device State" section.

### \_DKEvent.App.LocationActivity

-   According to the “System Events” plist file: “Events tracking Application Activity Location”
-   Apparently similar to “App.LocationActivity”
-   Retention is unknown, but seems to be really short
-   Parsed values:

-   SEGB Timestamp
-   Time Start
-   Time End
-   Time Write
-   Activity
-   Bundle ID
-   Bundle ID 2
-   Action GUID

### Device.Timezone

-   According to the “System Events” plist file: “Event capturing the current time zone”
-   Exact retention is unknown, but in my tests I found up to 10 months of data
-   Parsed values:

-   SEGB Timestamp
-   Timezone

### App.LocationActivity

-   According to the “System Events” plist file: “Events tracking Application Activity Location”
-   Retention is unknown, but seems to be short
-   Parsed values:

-   SEGB Timestamp
-   Expiration Timestamp
-   Bundle ID
-   Activity Type
-   Title
-   Street Address
-   City
-   Postal Code
-   URL
-   Place URL
-   Donation Type
-   Activity UUID

### Location.Visit

-   According to the “System Events” plist file: “Event capturing location visit”
-   Exact retention is unknown, but seems to be at least 40 days
-   Parsed values:

-   SEGB Timestamp
-   Arrival Timestamp
-   Departure Timestamp
-   Latitude
-   Longitude
-   Horizontal Accuracy
-   Altitude
-   Vertical Accuracy
-   Confidence
-   Place Name
-   Place Address
-   Place Category
-   Place ID
-   Visit ID

## Application Usage

The streams related to application usage are clearly among the most relevant from a forensic perspective.

In some cases, they provide information about the state of an application, such as whether it was installed, launched, running, or currently in focus. In other cases, they contain direct evidence of activities performed by the user.

The most relevant streams identified were:

**db** folder

-   \_DKEvent.App.InFocus
-   \_DKEvent.App.LocationActivity
-   \_DKEvent.Safari.History
-   CommCenter.Call.EmergencyVoiceCall

**mobile** folder

-   AeroML.Insights.PhotosSearchInsights
-   App.Activity
-   App.InFocus
-   App.Install
-   App.Installation
-   App.Intent
-   App.Intents.Transcript
-   App.LocationActivity
-   App.RelevantShortcuts
-   App.WebUsage
-   Autonaming.Messages.MessageIds
-   Clock.Alarm
-   FrontBoard.DisplayElement
-   Keyboard.TokenFrequency
-   Media.NowPlaying
-   Messages.Read
-   MLSE.ShareSheet.ConversationUserInteraction
-   Notification.Usage
-   ProactiveHarvesting.Mail
-   ProactiveHarvesting.Messages
-   Safari.Navigations
-   Safari.WebPagePerformance
-   ScreenTime.AppUsage
-   ShareSheet.Feedback
-   Siri.Remembers.AssistantSuggestions
-   Siri.Remembers.AudioHistory
-   Siri.Remembers.CallHistory
-   Siri.Remembers.InteractionHistory
-   Siri.Remembers.MessageHistory
-   SystemSettings.SearchTerms
-   Text.InputSession
-   UniversalRecents.UserActivity.Metadata
-   Wallet.Transaction
-   \_DKEvent.App.Install
-   \_DKEvent.Clock.Alarm

The following sections provide a detailed description of each stream, the fields identified within the parsed records, and the observed retention period of active (non-zeroed) records. Streams already discussed in previous sections are not repeated.

### \_DKEvent.App.InFocus

-   According to the “System Events” plist file: “Event capturing an Applications transition to focal application state. Includes bundle identifier and reason for transition.”
-   Apparently similar to “App.InFocus”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Time Start
-   Time End
-   Time Write
-   Bundle ID
-   Transition
-   Action GUID

### \_DKEvent.Safari.History

-   According to the “System Events” plist file: “Event capturing Safari browsing history.”
-   Apparently similar to “Safari.Navigations” and “App.WebUsage”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Title
-   URL

-   This also belongs to the category “Application Data”, as it contains information about visited websites

### CommCenter.Call.EmergencyVoiceCall

-   Emergency Voice Calls
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Emergency Number
-   Mobile Country Code
-   Mobile Network Code
-   Duration (Seconds)

### AeroML.Insights.PhotosSearchInsights

-   Photo Searches Insights
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Search Term
-   Language
-   Region

-   This also belongs to the category “Application Data”, as it contains information about searched keywords

### App.Activity

-   According to the “System Events” plist file: “Events tracking Application Activity. Includes information from NSUserActivity”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Expiration Timestamp
-   Bundle ID
-   Activity Type
-   Payload
-   Item URI
-   Activity UUID
-   Session UUID

-   This also belongs to the category “Application Data”, as it can contain relevant data in the Payload field

### App.InFocus

-   Apparently similar to “\_DKEvent.App.InFocus”
-   According to the “System Events” plist file: “Event capturing an Applications transition to focal application state. Includes bundle identifier and reason for transition.”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Start Time
-   Bundle ID
-   Action

-   Background
-   Foreground

### App.Install

-   Apparently similar to “\_DKEvent.App.Install”
-   According to the “System Events” plist file: “Event capturing App installs and uninstalls. Includes the name, category, and genre”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Time End
-   Time Write
-   Bundle ID
-   Bundle Info
-   App Info
-   Action GUID

### App.Installation

-   App Installation (seems tracking updates)
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Event Timestamp
-   App Timestamp
-   Bundle ID
-   App UUID
-   Version
-   Build Version
-   Digest 1
-   Digest 2

### App.Intent

-   According to the “System Events” plist file: “Events capturing active application intents”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   End Date
-   Duration Interval
-   Donated by Siri
-   App ID
-   Classname
-   Action
-   Direction
-   Group ID
-   Data

-   This also belongs to the category “Application Data”, as it can contain relevant data in the Data field

### App.Intents.Transcript

-   According to the “System Events” plist file: “Events capturing active application intents”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Intent Timestamp
-   Bundle ID
-   Intent Class
-   Parameters
-   Entity Type
-   Entity Titles
-   Phrase Template
-   App URL

### App.RelevantShortcuts

-   According to the “System Events” plist file: “Events tracking relevant shortcuts donated by apps”
-   Retention is unknown, but seems to be short
-   Parsed values:

-   SEGB Timestamp
-   Relevance Start
-   Relevance End
-   Bundle ID
-   Widget Kind

### App.WebUsage

-   According to the “System Events” plist file: “Event capturing granular web usage within an app.”
-   Apparently similar to “\_DKEvent.Safari.History” and “Safari.Navigations”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Title
-   URL
-   Domain
-   Bundle ID
-   GUID

-   This also belongs to the category “Application Data”, as it contains information about visited websites

### Autonaming.Messages.MessageIds

-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Message Timestamp
-   Bundle ID
-   Chat ID
-   Message GUID

-   This also belongs to the category “Application Data”, as it contains phone numbers in the “Chat ID” field

### Clock.Alarm

-   According to the “System Events” plist file: “Event capturing alarm states (firing, snoozed, etc).”
-   Apparently similar to “\_DKEvent.Clock.Alarm”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Alarm ID
-   State (seen values 0, 1, 2 and 4)

### FrontBoard.DisplayElement

-   FrontBoard Display Element
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Event Timestamp
-   Bundle ID
-   Scene ID
-   Display Type
-   Display Role

### Keyboard.TokenFrequency

-   Keyboard Learned Tokens
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Token
-   Frequency

-   This also belongs to the category “Application Data”, as it contains words in the “Token” field

### Messages.Read

-   Messages Read
-   Retention is 28 days
-   Parsed values:

-   Read Timestamp
-   Message ID

-   This also belongs to the category “Application Data”, as it contains phone numbers in the “Message ID” field

### MLSE.ShareSheet.ConversationUserInteraction

-   Share Sheet Conversation
-   Retention is unknown, but seems to be short
-   Parsed values:

-   SEGB Timestamp
-   Interaction Timestamp
-   Bundle ID
-   Recipient Handle
-   Conversation ID

-   This also belongs to the category "Application Data", as it contains recipient details in the associated fields.

### Notification.Usage

-   According to the “System Events” plist file: “Event capturing lock screen, banner, or history notification usage”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Application Name
-   Notification Content
-   Notification Content 2

-   This also belongs to the category “Application Data”, as it contains notification details in the “Notification Content” field

### ProactiveHarvesting.Mail

-   Proactive Harvesting Mail
-   Retention is unknown, but seems to be short
-   Parsed values:

-   SEGB Time
-   Message Date
-   Subject
-   Sender
-   Recipient
-   Message ID

-   This also belongs to the category “Application Data”, as it contains email message details

### ProactiveHarvesting.Messages

-   Proactive Harvesting Messages
-   Retention is unknown, but seems to be short
-   Parsed values:

-   SEGB Time
-   Message Date
-   Service and Handle
-   Content
-   Sender
-   GUID

-   This also belongs to the category “Application Data”, as it contains message details

### Safari.Navigations

-   According to the “System Events” plist file: “Event capturing Safari browsing history.”
-   Apparently similar to “\_DKEvent.Safari.History” and “App.WebUsage”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Rounded Timestamp (30 minutes)
-   Host
-   URL
-   Country

-   This also belongs to the category “Application Data”, as it contains information about visited websites

### Safari.WebPagePerformance

-   Safari Web Page Performance
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Rounded Timestamp (30 minutes)
-   Detail (raw)

-   This also belongs to the category “Application Data”, as it contains information about visited domain names

### ScreenTime.AppUsage

-   Screen Time Application Usage
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Bundle ID
-   Event

### ShareSheet.Feedback

-   According to the “System Events” plist file: “Event capturing feedback of share sheet suggestions”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Chosen Activity
-   Activity Type
-   Offered Candidates
-   Event UUID
-   Session ID

### Siri.Remembers.AssistantSuggestions

-   Siri Remembers Assistant Suggestions
-   Retention is unknown, but records spanning several months have been observed
-   Parsed values:

-   SEGB Timestamp
-   Suggestion Timestamp
-   Suggestions
-   Suggestion Types
-   Bundle ID
-   Intent Class
-   Metadata
-   Event ID
-   Sync Origin

### Siri.Remembers.AudioHistory

-   Siri Remembers Audio History
-   Retention is unknown, but records spanning several months have been observed
-   Parsed values:

-   SEGB Timestamp
-   Playback Timestamp
-   Title
-   Artist
-   Media Type
-   Bundle ID
-   Media ID
-   Item ID
-   Intent Class

-   This also belongs to the category “Application Data”

### Siri.Remembers.CallHistory

-   Siri Remembers Call History
-   Retention is unknown, but records spanning several months have been observed
-   Parsed values:

-   SEGB Timestamp
-   Call Timestamp
-   Direction

-   Incoming
-   Outgoing

-   Bundle ID
-   Contacts
-   Contact Handles
-   Group Name
-   Is Group
-   Conversation ID
-   Call GUID
-   Intent Class

-   This also belongs to the category “Application Data”

### Siri.Remembers.InteractionHistory

-   Siri Remembers Interaction History
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Intent Timestamp
-   Bundle ID
-   Intent Class
-   Domain
-   Parameters
-   Intent UUID
-   Item GUID
-   Sync Origin

-   This also belongs to the category “Application Data”

### Siri.Remembers.MessageHistory

-   Siri Remembers Message History
-   Retention is unknown, but records spanning several months have been observed
-   Parsed values:

-   SEGB Timestamp
-   Message Timestamp
-   Direction

-   Incoming
-   Outgoing

-   Bundle ID
-   Sender
-   Sender Handle
-   Recipients
-   Recipient Handle
-   Group Name
-   Is Group
-   Chat ID
-   Message GUID
-   Intent Class
-   Sync Origin

-   This also belongs to the category “Application Data”

### SystemSettings.SearchTerms

-   System Settings Search Terms
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Search Term
-   Selected Result URI
-   Selected Result Label

### Text.InputSession

-   Text Input Sessions
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Time Start
-   Bundle ID
-   Duration

### UniversalRecents.UserActivity.Metadata

-   User Activity Metadata
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Activity Type
-   Description
-   Bundle ID
-   Title
-   Bplist Data
-   Payload Data
-   Container Data

-   This also belongs to the category “Application Data”

### Wallet.Transaction

-   Wallet Transactions
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Card Name
-   Pass ID
-   Transaction UUID

### \_DKEvent.App.Install

-   Apparently similar to “App.Install”
-   According to the “System Events” plist file: “Event capturing App installs and uninstalls. Includes the name, category, and genre”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Timestamp
-   Time End
-   Time Write
-   Bundle ID
-   Bundle Info
-   App Info
-   Action GUID

### \_DKEvent.Clock.Alarm

-   According to the “System Events” plist file: “Event capturing alarm states (firing, snoozed, etc).”
-   Apparently similar to “Clock.Alarm”
-   Retention is 28 days
-   Parsed values:

-   SEGB Timestamp
-   Start Timestamp
-   End Timestamp
-   Value (seen values 0, 1, and 2)
-   Metadata
-   GUID
-   Device UTC Offset

## Conclusions

Biome remains largely unexplored territory.

Despite the growing body of research and the increasing support provided by forensic tools, it is clear that we are still only at the beginning of understanding this ecosystem and the wealth of information it contains.

As long as Apple continues to rely on the Biome framework and expands the intelligence capabilities of its devices, the amount of information that the operating system chooses to “remember” in order to improve the user experience will almost certainly continue to grow.

The 84 streams identified so far should therefore be viewed not as a complete map of the Biome ecosystem, but only as a starting point.

There are still hundreds of streams whose purpose remains unclear, whose retention characteristics have not been fully studied, and whose forensic value has yet to be determined.

The good news is that the tooling is improving rapidly. With the recent additions to iLEAPP and the growing awareness of SEGB and SEGBv2 artifacts within the forensic community, researchers now have a much stronger foundation from which to continue exploring.

If the last few years have taught us anything, it is that some of the most valuable artifacts on an iPhone may be hiding in places that few analysts are currently examining.

Biome is almost certainly one of those places.
