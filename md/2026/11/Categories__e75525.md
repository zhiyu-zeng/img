---
title: Categories
source: https://blog.randorisec.fr/a-journey-into-art-cmc/
source_host: blog.randorisec.fr
clip_date: 2026-11-24T10:58:56+08:00
trace_id: 26806ee1-6f07-4418-9a2c-814b324b99f1
content_hash: 72594910f2ad5ec817566d39a2ba6dee1230a618e4c4652e902ba1e20740a7c8
status: synced
tags: []
series: null
feed_source: RandoriSec·移动/漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 42275244-d011-81e9-ba5d-c43b06c79aac
ioc: null
---

### Corentin 15 min

Despite ART (Android Runtime) being open-source, there is not much in-depth documentation about its internals. Here we will discuss how objects are allocated and freed nowadays in Android’s Java VM. Android has reimplemented its Garbage Collector (and its associated allocator) several times across successive versions, always aiming to improve the efficiency of those critical components.

## Foreword

This was my first in-depth read of a garbage collector: a genuinely pleasant reading exercise, albeit not an easy one — Android has kept the code base of every collector ever shipped. As a result, concepts and implementations sometimes overlap, which can make things hard to follow clearly.

## A Brief Overview

A garbage collector is a component which takes over (from the developer) the responsibility of deciding whether an allocation should be freed. It is responsible for memory integrity and guards against object lifecycle bugs (use-after-free, double free, etc.). Needless to say, it is a very sensitive component, and it must also be as efficient and reliable as possible.

Since it manipulates the heap at a very deep level, it must always be paired with a compatible allocator.

Across Android versions, there have been many GC/allocator pairs:

[![Overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4809d0b19549168f.png)](https://blog.randorisec.fr/img/blog/art-cmc-overview.png)

Note: TLAB is an optimization explained later on this blogpost.

In the current version of Android, the collector is Concurrent Mark Compact (CMC), and the allocator is `BumpPointerSpace`. This is therefore the pair we will discuss here.

## Key Notions

A few notions are better explained before starting with the implementation overview.

### 1\. Moving Versus Non-Moving Collectors

A non-moving collector frees unused objects, leaving holes behind in the heap. Moving collectors relocate live objects to keep them contiguous in memory, thus preventing fragmentation.

The main advantage of non-moving collectors is that object addresses remain stable; the drawback is that memory can become highly fragmented. Conversely, moving collectors prevent fragmentation, but object references must be updated at runtime!

CMC is a moving collector!

### 2\. Concurrent Collector

A collector is considered *concurrent* if it performs some of its operations in parallel with the running program. Of course, it cannot perform all of its operations concurrently: some synchronization is inevitably required at some point.

### 3\. Generations

Generations in a garbage collector categorize objects based on their lifetime, enabling optimizations tailored to each generation. The oldest objects share characteristics that make such optimizations worthwhile. Following this logic, in a moving collector, the oldest objects are more tightly packed and barely move at all.

Here are the generations:

-   **young**: objects allocated since the last collection that ran.
-   **mid**: objects that have “survived” a first collection.
-   **old**: objects that have “survived” more than a single collection.

### 4\. Spaces

Spaces are the internal name for mapped memory. Those mappings can be used to allocate Java objects, and are therefore part of the heap.

There are two main spaces:

-   **main space**: the main heap; it is a moving space (managed by a moving collector). All the other spaces are non-moving, though.
-   **large object space (LOS)**: used for a subset of objects larger than 13 KB, and managed by the free-list allocator.

### 5\. Roots, Marked, Live and Black Objects

A **root** is an object referenced by the VM itself (e.g. an object living in one of the VM’s registers: if it were freed, you would end up with a dangling pointer in use).

**Marked** objects are objects reachable from a source (usually a root).

**Live** objects are objects actually being used by the program (they are usually found by marking from a root).

At the end of the marking process, the marked objects become the live objects. This way, the next collection can identify the objects that died (objects that were live but are no longer marked are not referenced anymore, and can therefore be compacted/freed).

**Black** objects are non-moving objects located in the moving space: they reside in pages whose post-compaction layout remains the same. This is the case for:

-   the objects allocated after the marking phase;
-   the first pages of the heap, as long as their usage rate is above 95% (the latter are named *dense black objects*).

### 6\. Barriers and Checkpoints

**Barriers** are small pieces of code inserted around memory operations, so that the runtime can keep the heap consistent while the application runs concurrently with the GC. A barrier can track memory accesses (reads and/or writes). CMC mainly relies on the write barrier to perform concurrent marking (detailed later on); we will see that it has a neat trick that removes the need for read barriers.

**Checkpoints** look like barriers, but for code: whenever a function is entered or returns, ART checks whether a checkpoint is pending and, if there is one, executes it in the context of the current function. This is how “paused” operations are carried out.

### 7\. Card Table

The card table is a mechanism designed to identify memory changes: whenever a reference is changed/updated, the corresponding card gets set (*dirtied*). This lets the collector determine whether a given object could have been modified (to avoid memory overconsumption, a single card covers 1,024 bytes (0x400), and can therefore correspond to one or more objects).

This is a very important mechanism! It enables key optimizations (by identifying which parts of memory need to be analyzed), and it also makes concurrent passes possible (the GC can detect whether a region of memory was modified between its concurrent and its stop-the-world phases).

[![CardTables](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5508648ca9228e61.png)](https://blog.randorisec.fr/img/blog/art-cmc-card-tables.png)

This mechanism is built on top of the barriers.

* * *

Now that we are done with the background, let’s dig into the implementations!

## Bump Pointer Allocator

This one is very simple: to allocate, it… increments (**bumps**) a pointer!

Since all threads can allocate at the same time, operations are performed atomically. However, to avoid an excessive overhead on every allocation, each running thread first reserves a large region for itself (at least 42 KB): it can then allocate from that region without caring about the other threads’ allocations. This region is named a **Thread Local Allocation Buffer (TLAB)**.

Because of the way allocations are performed, objects are contiguous in memory, and the heap can be walked by simply computing the size of each object encountered.

Of course, the GC must be able to locate every allocated object in memory. Unfortunately, TLABs are unlikely to be fulfilled, leaving some unused space before the next one! This is why every new region is registered in a list…

Once the GC has compacted all the regions, they are merged into the “main region”.

[![TLAB](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4273325e10f419ba.png)](https://blog.randorisec.fr/img/blog/art-cmc-tlab.png)

## Generational Concurrent Mark Compact (CMC)

Generational CMC is the latest and current implementation of the Garbage Collector in Android. It is an “upgraded” version of CMC, which takes full advantage of the generations.

CMC is implemented in 5 phases:

-   Initialization: environment setup
-   Marking: identification of live objects
-   Reclamation: computation of the regions to determine how the heap can be compacted
-   Compaction: memory relocation and release of the rest
-   Finish: marking the compaction as complete and cleaning up the environment

```cpp
// art/runtime/gc/collector/mark_compact.cc
void MarkCompact::RunPhases() {
  Thread* self = Thread::Current();
  thread_running_gc_ = self;
  Runtime* runtime = Runtime::Current();
  GetHeap()->PreGcVerification(this);
  InitializePhase();
  {
    ReaderMutexLock mu(self, *Locks::mutator_lock_);
    MarkingPhase();
  }
  {
    // Marking pause
    ScopedPause pause(this);
    MarkingPause();
    if (kIsDebugBuild) {
      bump_pointer_space_->AssertAllThreadLocalBuffersAreRevoked();
    }
  }
  bool perform_compaction;
  {
    ReaderMutexLock mu(self, *Locks::mutator_lock_);
    ReclaimPhase();
    perform_compaction = PrepareForCompaction();
  }
  if (perform_compaction) {
    // Compaction pause
    ThreadFlipVisitor visitor(this);
    FlipCallback callback(this);
    runtime->GetThreadList()->FlipThreadRoots(
        &visitor, &callback, this, GetHeap()->GetGcPauseListener());
    if (IsValidFd(uffd_)) {
      ReaderMutexLock mu(self, *Locks::mutator_lock_);
      CompactionPhase();
    }
  } else {
    if (use_generational_) {
      DCHECK_IMPLIES(post_compact_end_ != nullptr, post_compact_end_ == black_allocations_begin_);
    }
    post_compact_end_ = black_allocations_begin_;
  }
  FinishPhase(perform_compaction);
  GetHeap()->PostGcVerification(this);
  thread_running_gc_ = nullptr;
}
```

Both the marking and the compaction require some synchronization with the runtime; this is achieved thanks to paused-state operations. When the runtime is paused, all threads stop executing Java code, and either help with the compaction process or wait for the operation to finish. All the other phases run entirely concurrently.

A collection can be triggered in two modes: **sticky** and **full**. (The sticky compaction is very unlikely to occur…)

The sticky mode was introduced along with the generations, and is a lightweight collection: it only collects the allocations residing in the “allocation stack”, and only when the latter is full (up to 128 entries). The full mode collects across the whole heap, and is triggered in either of these two cases:

-   an allocation fails; or
-   it is explicitly requested by the user.

> **Note:** this is only the theory — in reality, objects are never pushed onto the allocation stack!

The thread that starts the collection performs all the collection steps. It is identified as the **main thread**; every other thread is called an **accessor**. Accessors can keep running normally, except during the paused phases.

Let’s walk through each of these phases!

### The Marking Phase

The goal here is to identify the live objects.

In this phase, CMC starts by marking the roots. Roots can have 3 origins:

-   **thread roots**: associated with a thread (registers, pending exception, JNI locals, the thread object itself, …);
-   **non-thread roots**: associated with the runtime (JNI globals, pre-allocated errors such as OOM, etc.);
-   **concurrent roots**: associated with the process, and strictly managed by ART (class linker objects, JIT roots, …).

Non-thread roots and concurrent roots can be walked concurrently, since they are common to every thread. For thread roots, a checkpoint is executed by each running thread; if a thread does not service its checkpoint fast enough, the main thread performs the marking on its behalf.

Once all roots are marked, the marks are propagated to their references, then to their references’ references, and so on.

Newly identified objects are added to a `MarkStack` and processed later on. While they are processed, three important structures get filled: the `mark_bitmap`, the `live_words_bitmap` and the `chunk_info_vec`.

```cpp
// art/runtime/gc/collector/mark_compact.cc
void MarkCompact::UpdateLivenessInfo(mirror::Object* obj, size_t obj_size) {
  DCHECK(obj != nullptr);
  DCHECK_EQ(obj_size, obj->SizeOf<kDefaultVerifyFlags>());
  uintptr_t obj_begin = reinterpret_cast<uintptr_t>(obj);
  UpdateClassAfterObjectMap(obj);
  size_t size = RoundUp(obj_size, kAlignment);
  uintptr_t bit_index = live_words_bitmap_->SetLiveWords(obj_begin, size);
  size_t chunk_idx =
      (obj_begin - reinterpret_cast<uintptr_t>(moving_space_begin_)) / kOffsetChunkSize;
  // Compute the bit-index within the chunk-info vector word.
  bit_index %= kBitsPerVectorWord;
  size_t first_chunk_portion = std::min(size, (kBitsPerVectorWord - bit_index) * kAlignment);
  chunk_info_vec_[chunk_idx] += first_chunk_portion;
  DCHECK_LE(chunk_info_vec_[chunk_idx], kOffsetChunkSize)
      << "first_chunk_portion:" << first_chunk_portion
      << " obj-size:" << RoundUp(obj_size, kAlignment);
  chunk_idx++;
  DCHECK_LE(first_chunk_portion, size);
  for (size -= first_chunk_portion; size > kOffsetChunkSize; size -= kOffsetChunkSize) {
    DCHECK_EQ(chunk_info_vec_[chunk_idx], 0u);
    chunk_info_vec_[chunk_idx++] = kOffsetChunkSize;
  }
  chunk_info_vec_[chunk_idx] += size;
  DCHECK_LE(chunk_info_vec_[chunk_idx], kOffsetChunkSize)
      << "size:" << size << " obj-size:" << RoundUp(obj_size, kAlignment);
}
```

`mark_bitmap` is attached to each space, it keeps track of the marked objects in that space. `live_words_bitmap` marks every byte belonging to a live object. This will be used to identify objects very efficiently during the compaction phase. `chunk_info_vec` splits the heap into chunks (512 bytes) and counts the amount of live bytes in each one. This will be used to determine the post-compaction positions of objects.

[![MarkingPhase](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f44b88801677de95.png)](https://blog.randorisec.fr/img/blog/art-cmc-marking-phase.png)

After all live objects have been identified concurrently, a stop-the-world is triggered: all threads get suspended until the marking is finalized.

Using the card table, CMC can identify the objects whose references may have been updated since the previous concurrent marking pass. It marks the new references, and will also keep the old ones marked (it does not unmark anything). For each chunk, it registers the amount of live bytes: this will be very important for the next step!

Before resuming the process, it revokes all the TLABs. All allocations occurring from that point on will be identified as “black objects”: objects allocated since the last marking phase. The threads are then resumed, while that information gets processed.

#### Java Object References

Careful readers may have noticed that CMC is able to recover the references of any arbitrary object; understanding how it does so is quite interesting!

Since it is not the main topic of this blogpost, we will stick here to the strict minimum.

An instance of a Java object always stores a pointer to its class at offset 0 in memory (and a monitor reference at offset 4); everything beyond that is only the object’s own data. The information required to interpret an object’s data in memory is stored in its class.

A Java class object is split into two parts: a static one, and a variadic one. The static part contains the class information, such as the number of attributes or the size of an instance. The variadic part contains its runtime attributes, like its **I** nterface **M** ethod **T** able (IMT), its static fields, and a reference to an instance bitmap.

That instance bitmap reference is located at the very end of the class, and describes where the references are located within an instance of the class.

Also, two other attributes are important to know:

-   `num_reference_static_fields`: it determines how many static references the class holds;
-   `reference_instance_offsets`: it tells where the instance bitmap reference is located in memory.

[![ClassReferences](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4cfd167dd25ea4e5.png)](https://blog.randorisec.fr/img/blog/art-cmc-class-references.png)

> PS: other cases exist, like `ObjectArray` s, `ClassLoader` s, etc.; we will not discuss them here, since it is a broad topic, and not the purpose of this blogpost:)

### The Reclaimation Phase

The goal here is to precompute as much information as possible, to speed up the compaction — especially for the paused part.

First, each page of the heap is walked through to compute the amount of live data it holds. This is used to determine the post-compaction memory layout, including the future size of the heap. Secondly, while doing this, the **black dense region** gets determined: it is the area, located at the beginning of the heap, for which at least 95% of the memory is live. That memory will be handled in an optimized way, but its unused parts will not be reclaimed. Thirdly, the **first objects** get identified: those are the very first objects of each post-compaction page.

[![ReclaimPhase overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/35b2ca3f81d6d871.png)](https://blog.randorisec.fr/img/blog/art-cmc-reclaim-phase-overview.png)

Finally, if it is the first collection of the process, the UFFD mechanism gets initialized.

Thanks to all this information, compaction is made much easier, and each page can be computed independently from the others.

### The Compaction Phase

To properly understand how compaction is performed in a concurrent yet safe way, one needs to understand what UFFD does, and how CMC takes full advantage of it!

UFFD (UserFault FileDescriptor) lets user space intercept and handle page faults. To use it, a file descriptor must be fetched through the `SYS_userfaultfd` syscall.

Several syscalls can then be performed on it; here, we will only detail the ones we are interested in: `UFFDIO_REGISTER`, `UFFDIO_COPY` and `UFFDIO_ZERO`. Those syscalls must be performed on previously mapped memory.

The most interesting one is `UFFDIO_REGISTER`: it lets user space register a range of memory; afterwards, any page fault occurring in that region will raise a `SIGBUS`, letting user space handle the fault. `UFFDIO_COPY` performs a synchronous copy of a page. `UFFDIO_ZERO` sets the target memory page to zero.

By moving the whole ART heap to another location, and registering the whole space in UFFD, CMC is able to compact the pages when they are accessed. The “normal” heap location is named `to_space`; the temporary heap is named the `from_space`.

Here is the handler responsible for processing pages upon UFFD exceptions:

```cpp
// art/runtime/gc/collector/mark_compact.cc
bool MarkCompact::SigbusHandler(siginfo_t* info) {
  // [...]
  if (info->si_code != BUS_ADRERR) {
    // Userfaultfd raises SIGBUS with BUS_ADRERR. All other causes can't be
    // handled here.
    return false;
  }
  ScopedInProgressCount spc(this);
  uint8_t* fault_page = AlignDown(reinterpret_cast<uint8_t*>(info->si_addr), gPageSize);
  if (!spc.IsCompactionDone()) {
    if (HasAddress(reinterpret_cast<mirror::Object*>(fault_page))) {
      Thread* self = Thread::Current();
      Locks::mutator_lock_->AssertSharedHeld(self);
      size_t nr_moving_space_used_pages = moving_first_objs_count_ + black_page_count_;
      ConcurrentlyProcessMovingPage(fault_page,
                                    self->GetThreadLocalGcBuffer(),
                                    nr_moving_space_used_pages,
                                    spc.TolerateEnoent());
      return true;
    } else {
      // Find the linear-alloc space containing fault-addr
      for (auto& data : linear_alloc_spaces_data_) {
        if (data.begin_ <= fault_page && data.end_ > fault_page) {
          ConcurrentlyProcessLinearAllocPage(fault_page, spc.TolerateEnoent());
          return true;
        }
      }
      // Fault address doesn't belong to either moving-space or linear-alloc.
      return false;
    }
  } else {
    // [...]
  }
}
```

#### While The Runtime Is Paused

While the process is paused, CMC updates all the root references, to point to their post-compaction addresses. It also updates all the TLABs, by moving them by the delta between the heap’s pre-compaction size and its post-compaction size (the space recovered through collection).

#### Once The Runtime Resumes

The runtime is then resumed, and the pages get computed — whenever some data is needed — either by:

-   the main GC thread, which computes each page starting from the end, going backwards up to the first page; or
-   the accessor threads, whenever they need data located in some pages.

In both cases, the computations are identical, except that on the main thread they are further optimized.

To actually compute the content of a page, a temporary page is required: temporary pages are picked from “buffers” named `compaction_buffers`. It is worth knowing that each thread has a dedicated page, and that the main one is always located at index 0.

The problem, though, is that each page must be committed after its compaction (using `UFFDIO_COPY`), which makes the process slower. To make up for that, the main thread uses the pages freed from the `from_space` as compaction buffers: since those pages get committed in batches, this turns out to be a far more efficient method.

Each page has an associated status, which prevents it from being computed concurrently.

Two main actions are required to compute a page:

1.  **Fill the page with data**
    -   Thanks to the `live_words_bitmap`, the live bytes are easy to locate
    -   A region full of contiguous live bytes is named a *stride*
    -   All the data is “just” memcpy-ed.
2.  **Fix the references**
    -   Handle the first object: this object can be located in the middle of the page, split over multiple pages, or filling the current page — all those cases must be handled
    -   Walk through all the other objects in the page.

[![Compaction - walkthrough](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c893fb23a504efcf.png)](https://blog.randorisec.fr/img/blog/art-cmc-compaction-walkthrough.png)

Once all the steps have been performed, the page gets committed using the `UFFDIO_COPY` ioctl of UFFD.

[![Compaction - copy](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/593faf1e18883581.png)](https://blog.randorisec.fr/img/blog/art-cmc-compaction-copy.png)

This is the general case, but, depending on the page’s location, some optimizations can be performed:

-   If the page is located after the end of the post-compacted heap: the page does not contain any data, and must only be filled with zeros (this is done thanks to `UFFDIO_ZERO`)
-   If the page only contains black objects: since the `live_words_bitmap` was not computed for it, the page is not compacted, and its whole content is simply shifted (by `black_object_shift`)
-   If the page belongs to the black dense region: its objects are not moved, so the page can be computed in place (no data is ever copied: the references are directly patched in the `from_space` page).

## Conclusion

A garbage collector is not an easy piece of code: there are plenty of corner cases to handle, and a single mistake can lead to bugs. On the other hand, the code is always under pressure, so a mistake is quickly spotted.

All in all, CMC is really very well thought out and well designed, which makes it both very effective and secure. The average time I observed was a few hundred milliseconds to compact 256 MB of data — more than reasonable!

## Categories

[0day (15)](https://blog.randorisec.fr/categories/0day)

[Bugbounty (2)](https://blog.randorisec.fr/categories/bugbounty)

[Conference (44)](https://blog.randorisec.fr/categories/conference)

[Ctf (5)](https://blog.randorisec.fr/categories/ctf)

[General (7)](https://blog.randorisec.fr/categories/general)

[Gestion de crise (1)](https://blog.randorisec.fr/categories/gestion-de-crise)

[Pentest (30)](https://blog.randorisec.fr/categories/pentest)

[Publications (18)](https://blog.randorisec.fr/categories/publications)

[Red team (1)](https://blog.randorisec.fr/categories/red_team)

[Responsible disclosure (18)](https://blog.randorisec.fr/categories/responsible_disclosure)

[Spyware (1)](https://blog.randorisec.fr/categories/spyware)

[Sstic (1)](https://blog.randorisec.fr/categories/sstic)

[Swift (1)](https://blog.randorisec.fr/categories/swift)

[Training (15)](https://blog.randorisec.fr/categories/training)

[Workshop (1)](https://blog.randorisec.fr/categories/workshop)

[Writeup (2)](https://blog.randorisec.fr/categories/writeup)
