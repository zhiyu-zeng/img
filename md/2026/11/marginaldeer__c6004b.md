---
title: marginaldeer
source: https://www.marginaldeer.com//blog/automating-android-analysis-frida-objection/
source_host: www.marginaldeer.com
clip_date: 2026-11-19T08:22:28+08:00
trace_id: b30eca53-d7b5-4b02-bdba-ea8703f17156
content_hash: 48e61e4e577db19ae3be776c6bd6df061334d5c0451046980fbcf79dc487a9a7
status: synced
tags: []
series: null
feed_source: marginaldeer·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8144-af97-feddfcde1701
ioc: null
---

1.  [Android Pentest Lab Build](https://www.marginaldeer.com/blog/android-pentest-lab/)
2.  [Android SSL Pinning Bypass with Burp Suite](https://www.marginaldeer.com/blog/android-ssl-pinning-bypass/)
3.  [Frida Method Hooking for Android App Analysis](https://www.marginaldeer.com/blog/frida-method-hooking-android/)
4.  [Hooking Native Libraries with Frida Interceptor](https://www.marginaldeer.com/blog/frida-native-hooking/)
5.  [From APK to Source: Complete Android Reverse Engineering Workflow](https://www.marginaldeer.com/blog/apk-reverse-engineering-workflow/)
6.  [Bypassing Root Detection and Emulator Checks on Android](https://www.marginaldeer.com/blog/android-root-emulator-detection-bypass/)
7.  [Attacking Android IPC: Intents, Content Providers, and Broadcast Receivers](https://www.marginaldeer.com/blog/android-ipc-attacks/)
8.  Automating Android App Analysis with Frida and Objection

This is the next installment in my Android pentest series. We’ve covered [lab setup](https://www.marginaldeer.com/blog/android-pentest-lab/), [SSL pinning bypass](https://www.marginaldeer.com/blog/android-ssl-pinning-bypass/), [Java method hooking](https://www.marginaldeer.com/blog/frida-method-hooking-android/), [native hooking](https://www.marginaldeer.com/blog/frida-native-hooking/), [APK reverse engineering](https://www.marginaldeer.com/blog/apk-reverse-engineering-workflow/), [root and emulator detection](https://www.marginaldeer.com/blog/android-root-emulator-detection-bypass/), and [IPC](https://www.marginaldeer.com/blog/android-ipc-attacks/). At this point you can tear an app apart statically and hook it dynamically — but doing the same setup steps on every engagement gets old fast.

This post is about building a repeatable workflow. Objection handles the common stuff in seconds. Custom Frida scripts handle the rest. Together they turn “let me spend an hour getting oriented on this app” into “let me run my toolkit and see what falls out.”

## Why Automate This

On a typical mobile assessment I end up doing the same things over and over:

-   Bypass SSL pinning so Burp can see traffic
-   Check for root detection
-   Dump SharedPreferences and SQLite databases
-   List loaded classes and find crypto calls
-   Hook login flows to capture credentials and tokens

Each of these is straightforward with Frida. The problem is typing the same commands and rewriting the same hooks every time. A small script library plus objection as a quick-start layer saves hours across a multi-app engagement.

## Objection: The Fast Path

[Objection](https://github.com/sensepost/objection) wraps Frida with a REPL full of mobile pentest commands. Install it once:

```bash
pip install objection
```

Make sure your Frida server is running on the device (covered in the [SSL pinning post](https://www.marginaldeer.com/blog/android-ssl-pinning-bypass/)). Current objection attaches like this:

```bash
objection -n com.example.app start
```

The SSL pinning post uses `objection -g com.example.targetapp explore`. That subcommand was renamed to `start`, and `-n` is the current name flag. If your install still accepts the old spelling, it drops you in the same REPL.

Run a command before the app gets going, which matters when pinning or root checks happen in `Application.onCreate()`:

```bash
objection -n com.example.app start --startup-command "android sslpinning disable"
```

### Commands I Use on Every App

Once you’re in the objection REPL, these are the first things I run:

```text
android sslpinning disable
android root disable
android hooking list activities
android keystore list

memory list modules
memory list exports libnative-lib.so

android hooking watch javax.crypto.Cipher --dump-args --dump-return
android hooking watch com.example.app.auth.TokenManager!getToken --dump-args --dump-return
```

`android hooking watch` takes a class name, or `class!method` when you want one method. The `--dump-args`, `--dump-backtrace`, and `--dump-return` flags are optional.

SSL pinning bypass is usually the difference between “the app will not connect through Burp” and intercepting traffic. `android root disable` patches the common Java root checks. Native checks still need a custom hook.

### Dumping App Storage

The REPL starts in the app’s data directory. List and read files from there:

```text
ls
ls shared_prefs/
filesystem cat shared_prefs/com.example.app_preferences.xml
filesystem download shared_prefs/com.example.app_preferences.xml
```

`sqlite connect` downloads the database and opens a local SQL prompt. Schema and queries happen in that prompt, then you exit back to objection:

```text
sqlite connect databases/app.db
```

```text
.schema
SELECT * FROM users LIMIT 10;
```

Shared preferences and SQLite are where API tokens, session IDs, and cached credentials usually sit.

### Hooking Without Writing JavaScript

For quick recon you don’t need a custom script. Objection’s watch command logs method calls:

```text
android hooking watch com.example.app.network.ApiClient

android hooking watch com.example.app.auth.LoginActivity!onLogin --dump-args --dump-backtrace --dump-return
```

`--dump-backtrace` is the useful one. When a crypto call fires, the stack shows which app code triggered it. Watching a huge class like `okhttp3.OkHttpClient` will flood the console, so prefer a class or method you already care about.

## Building a Frida Script Toolkit

Objection covers the generic cases. Custom scripts handle app-specific logic and batch runs. I keep mine in a directory called `frida-scripts/` and reuse them across engagements.

Current Frida resumes a spawned process on its own. Load the script at spawn time with:

```bash
frida -U -f com.example.app -l recon.js
```

Add `--pause` only when you need the process frozen until you type `%resume`. Current Frida rejects `--no-pause`.

### Script 1: App Recon

This runs at the start of an assessment. It reads the package name from the running app, so the same file works in the batch runner below.

```javascript
// recon.js - Runtime reconnaissance for Android apps
Java.perform(function() {
    console.log("[*] App Recon Starting\n");

    var app = Java.use("android.app.ActivityThread").currentApplication();
    var pkg = app ? app.getApplicationContext().getPackageName() : null;
    console.log("[+] Package: " + pkg);

    if (pkg) {
        var count = 0;
        Java.enumerateLoadedClasses({
            onMatch: function(name) {
                if (name.indexOf(pkg) === 0) {
                    count++;
                }
            },
            onComplete: function() {
                console.log("[+] Loaded classes matching " + pkg + ": " + count);
            }
        });
    }

    try {
        var SharedPreferencesImpl = Java.use("android.app.SharedPreferencesImpl");
        SharedPreferencesImpl.getString.implementation = function(key, def) {
            var val = this.getString(key, def);
            console.log("[PREFS] getString('" + key + "') = " + val);
            return val;
        };
    } catch(e) {
        console.log("[-] SharedPreferences hook failed: " + e);
    }

    try {
        var URL = Java.use("java.net.URL");
        URL.$init.overload("java.lang.String").implementation = function(url) {
            console.log("[HTTP] " + url);
            return this.$init(url);
        };
    } catch(e) {}

    try {
        var Cipher = Java.use("javax.crypto.Cipher");
        Cipher.doFinal.overloads.forEach(function(ov) {
            ov.implementation = function() {
                var types = ov.argumentTypes.map(function(t) { return t.className; }).join(", ");
                console.log("[CRYPTO] Cipher.doFinal(" + types + ")");
                return ov.apply(this, arguments);
            };
        });
    } catch(e) {
        console.log("[-] Cipher hook failed: " + e);
    }

    console.log("[*] Recon hooks installed. Use the app...\n");
});
```

`Java.perform` waits for the VM, but `currentApplication()` can still be null if you hook before `Application.onCreate()`. If the package line prints `null`, attach to the running app instead of spawning it.

### Script 2: SSL Pinning Bypass

Objection’s SSL bypass covers the common libraries. When it does not stick, hook the pin check itself. `TrustManagerImpl.verifyChain` has more than one overload on newer Android, so replace every overload instead of assigning `.implementation` once. The first argument is the untrusted chain. Returning it skips validation.

```javascript
// ssl-bypass.js
Java.perform(function() {
    console.log("[*] SSL Pinning Bypass Starting\n");

    try {
        var CertificatePinner = Java.use("okhttp3.CertificatePinner");
        CertificatePinner.check.overloads.forEach(function(ov) {
            ov.implementation = function() {
                console.log("[+] OkHttp3 pinning bypassed");
            };
        });
    } catch(e) {}

    try {
        var TrustManagerImpl = Java.use("com.android.org.conscrypt.TrustManagerImpl");
        TrustManagerImpl.verifyChain.overloads.forEach(function(ov) {
            ov.implementation = function() {
                console.log("[+] TrustManagerImpl.verifyChain bypassed");
                return arguments[0];
            };
        });
    } catch(e) {}

    // Base class only. Apps that override onReceivedSslError and skip super
    // need the hook on their subclass.
    try {
        var WebViewClient = Java.use("android.webkit.WebViewClient");
        WebViewClient.onReceivedSslError.implementation = function(view, handler, error) {
            console.log("[+] WebView SSL error bypassed");
            handler.proceed();
        };
    } catch(e) {}

    console.log("[*] SSL bypass hooks installed\n");
});
```

For an app-specific WebView client found in the decompiled source:

```javascript
var AppClient = Java.use("com.example.app.MyWebViewClient");
AppClient.onReceivedSslError.implementation = function(view, handler, error) {
    handler.proceed();
};
```

### Script 3: Credential and Token Logger

Once the auth classes are mapped from static analysis, this logs the common header and body patterns. It will miss headers set through `header()` or an interceptor. Add those overloads when the app uses them.

```javascript
// creds.js
Java.perform(function() {
    console.log("[*] Credential Logger Starting\n");

    try {
        var RequestBuilder = Java.use("okhttp3.Request$Builder");
        RequestBuilder.addHeader.implementation = function(name, value) {
            var lower = name.toLowerCase();
            if (lower.indexOf("auth") !== -1 || lower.indexOf("token") !== -1 || lower.indexOf("key") !== -1) {
                console.log("[AUTH HEADER] " + name + ": " + value);
            }
            return this.addHeader(name, value);
        };
    } catch(e) {}

    try {
        var Base64 = Java.use("android.util.Base64");
        Base64.encodeToString.overload("[B", "int").implementation = function(input, flags) {
            var result = this.encodeToString(input, flags);
            if (input.length < 256) {
                console.log("[BASE64] encode: " + result);
            }
            return result;
        };
    } catch(e) {}

    try {
        var JSONObject = Java.use("org.json.JSONObject");
        JSONObject.put.overload("java.lang.String", "java.lang.Object").implementation = function(key, value) {
            var lower = key.toLowerCase();
            if (lower.indexOf("pass") !== -1 || lower.indexOf("token") !== -1 ||
                lower.indexOf("secret") !== -1 || lower.indexOf("key") !== -1) {
                console.log("[JSON] " + key + " = " + value);
            }
            return this.put(key, value);
        };
    } catch(e) {}

    console.log("[*] Credential hooks installed\n");
});
```

Combine this with the method hooks from the [Frida method hooking post](https://www.marginaldeer.com/blog/frida-method-hooking-android/) once you know the exact auth classes.

## A Repeatable Assessment Workflow

### Phase 1: Static

Run the [APK decompilation workflow](https://www.marginaldeer.com/blog/apk-reverse-engineering-workflow/). Grep for endpoints, hardcoded keys, and auth logic. Note the package name and interesting class names.

### Phase 2: Objection

```bash
objection -n com.example.app start --startup-command "android sslpinning disable"
```

In the REPL:

```text
android root disable
android hooking watch javax.crypto.Cipher --dump-args --dump-return
```

Use the app. Login, browse, trigger API calls. Watch what objection logs.

### Phase 3: Custom Scripts

```bash
frida -U -f com.example.app -l recon.js
frida -U -f com.example.app -l ssl-bypass.js
frida -U -f com.example.app -l creds.js
frida -U -f com.example.app -l hooks/target-specific.js
```

For native code, use the scripts from the [native hooking post](https://www.marginaldeer.com/blog/frida-native-hooking/).

### Phase 4: Burp

With traffic flowing, map the API in Burp and cross-reference it with the static notes.

## Bundling Scripts for Batch Analysis

`recon.js` reads the package name at runtime, so a list of package names is enough:

```bash
#!/bin/bash
# batch-analyze.sh - Run recon on a list of package names

SCRIPTS_DIR="./frida-scripts"
APPS_FILE="${1:-apps.txt}"

if [ ! -f "$APPS_FILE" ]; then
    echo "Usage: $0 <apps.txt>"
    echo "  apps.txt should contain one package name per line"
    exit 1
fi

mkdir -p logs

while IFS= read -r pkg; do
    [ -z "$pkg" ] && continue
    echo "[*] Analyzing: $pkg"
    timeout 30 frida -U -f "$pkg" \
        -l "${SCRIPTS_DIR}/recon.js" \
        2>&1 | tee "logs/${pkg}.log"
    echo "---"
done < "$APPS_FILE"
```

Thirty seconds of spawn-and-log is a first pass. It is not a substitute for using the app.

## Objection vs Custom Scripts

| Task | Objection | Custom script |
| --- | --- | --- |
| SSL pinning bypass | `android sslpinning disable` | Fallback when a library hook misses |
| Root detection | `android root disable` | Native checks |
| Read SharedPreferences | `filesystem cat` | Live `getString` hook |
| Watch a method | `android hooking watch class!method` | Argument parsing or a changed return value |
| Native library | `memory list exports` | Frida Interceptor |
| Many apps | One REPL at a time | `frida -U -f` in a loop |

Start with objection. Switch to a script when you need a return value changed, a native function hooked, or the same checks run across a list of packages.

## Keeping Scripts Maintainable

-   Read the package name from `ActivityThread` inside the script. One file then works for every app.
-   Match the Frida server on the device to the `frida-tools` version on the host. A mismatch fails in ways that look like a bad script.
-   Keep recon, SSL bypass, and credential logging in separate files. Pass several `-l` arguments when you want them together.
-   Pipe the session through `tee` so the log survives after you detach.

## What This Gets You

The first pass on a new APK looks like this:

1.  Decompile and grep for interesting strings.
2.  Start objection, disable pinning, watch one crypto class.
3.  Run a targeted script for whatever that turned up.
4.  Map the API in Burp.

That is the auth flow, local storage, and backend traffic, without rewriting the boilerplate each time.

## What’s Next

The series so far is lab setup, traffic interception, Java and native hooking, static analysis, and this automation pass. Next up is patching APKs in smali, and Flutter or React Native apps where the Java layer is mostly a wrapper.

More to come!

If you enjoyed this post please consider subscribing to the [feed](https://www.marginaldeer.com/feed/)!
