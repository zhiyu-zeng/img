---
title: Android源码阅读之———广播的注册与分发
source: https://akjoson.github.io/2025/03/24/20250324/
source_host: akjoson.github.io
clip_date: 2026-11-27T10:41:26+08:00
trace_id: 4ac8e1f4-47ae-49a0-a944-6f9c26263426
content_hash: 5033377d24591b64d860d886d8011d6a4e349768fdd5cdfaf2736e0938c16383
status: synced
tags: []
series: null
feed_source: 殷仔·Android Binder
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42575244-d011-8112-a7b1-cb7041bb2d98
ioc: null
---

#### 这一节去分析一下广播的注册，广播消息的分发过程。

* * *

##### 一些概念：

1.  无序广播：默认发送的就是无序广播，所有注册了的广播几乎在同一时刻接收到广播消息；
    
2.  有序广播：优先级越高越先收到，传递过程中，可以控制结束该广播，也可以修改传递数据；
    
3.  粘性消息：发送的粘性消息一直存放在AMS中，当注册广播时，如果之前已经有粘性消息存在，则直接派发。
    

```php
#ContextImpl$registerReceiver
private Intent registerReceiverInternal(BroadcastReceiver receiver, int userId,
        IntentFilter filter, String broadcastPermission,
        Handler scheduler, Context context, int flags) { 
    //注意这个IIntentReceiver，看名字就知道是个接口。在AndroidStudio中找不到。一搜索，咦，这是个aidl文件。
    //我们知道这个IIntentReceiver用于Binder通信，且在此是作为服务端。
    IIntentReceiver rd = null;
    if (receiver != null) {
        if (mPackageInfo != null && context != null) {
            if (scheduler == null) {
                //ActivityThread中的mH，是一个Handler
                scheduler = mMainThread.getHandler();
            }
       (1)   //mPackageInfo是LoaderApk类型，其中创建了ReceiverDispatcher，这个类内部有一个
            // InnerReceiver extends IIntentReceiver.Stub 这个InnerReceiver继承了IIntentReceiver.Stub
            // rd 作为服务端，用于接收广播接收
            rd = mPackageInfo.getReceiverDispatcher(
                receiver, context, scheduler,
                mMainThread.getInstrumentation(), true);
        } else {
            if (scheduler == null) {
                scheduler = mMainThread.getHandler();
            }
            rd = new LoadedApk.ReceiverDispatcher(
                    receiver, context, scheduler, null, true).getIIntentReceiver();
        }
    }
    try {
        //注意此处有一个Intent的返回，另外传入的参数有ApplicationThread和IIntentReceiver和IntentFilter
        final Intent intent = ActivityManager.getService().registerReceiver(
                mMainThread.getApplicationThread(), mBasePackageName, rd, filter,
                broadcastPermission, userId, flags);
        if (intent != null) {
            intent.setExtrasClassLoader(getClassLoader());
            intent.prepareToEnterProcess();
        }
        return intent; //把intent返回回去
    } catch (RemoteException e) {
        throw e.rethrowFromSystemServer();
    }
}
```

##### (1) 上面获取IIntentReceiver这个binder的时候，涉及到了LoadedApk这个类，内部有一个ReceiverDispatcher的内部类，ReceiverDispatcher这个类的内部有一个InnerReceiver实现了IIntentReceiver.Stub,具有了跨进程通信功能。也就是说接收然后分发广播，这个动作会在LoadedApk的InnerReceiver。那么我们看一下数据LoadedApk中的数据结构：

```swift
//LoadedApk的全局变量
//context上下文作为key,value也是一个Map，这个Map是以BroadcastReceiver位key, ReceiverDispatcher为value
private final ArrayMap<Context, ArrayMap<BroadcastReceiver, ReceiverDispatcher>> mReceivers
    = new ArrayMap<>();
private final ArrayMap<Context, ArrayMap<BroadcastReceiver, LoadedApk.ReceiverDispatcher>> mUnregisteredReceivers
    = new ArrayMap<>();
```

#### 困难九十九，难不倒两只手。进入AMS，查看registerReceiver

```typescript
#ActivityManagerService.java$registerReceiver
//传入的参数第一个是：IApplicationThread，后面还有一个IIntentReceiver，都具有RPC能力。
public Intent registerReceiver(IApplicationThread caller, String callerPackage,
        IIntentReceiver receiver, IntentFilter filter, String permission, int userId,
        int flags) {
    ArrayList<Intent> stickyIntents = null;//一个粘性意图的列表悄然出现
    ProcessRecord callerApp = null;//似乎是记录进程的一个类
    synchronized(this) {
        if (caller != null) {
           //根据IApplicationThread这个Binder去寻找ProcessRecord,这个类，似乎管控着所有启动的Application
           //另外还有一点，就是这个IApplicationThread是在ActivityThread中初始化的，ActivityThread又属于app入口点，所以一个app进程只有一个IApplicationThread
            callerApp = getRecordForAppLocked(caller); 
        } 
        //取出本次要注册广播的Action，准备进行迭代
        Iterator<String> actions = filter.actionsIterator();
        if (actions == null) {
            ArrayList<String> noAction = new ArrayList<String>(1);
            noAction.add(null);
            actions = noAction.iterator();
        }
        // Collect stickies of users
        int[] userIds = { UserHandle.USER_ALL, UserHandle.getUserId(callingUid) };
        while (actions.hasNext()) {
            String action = actions.next();//遍历action
            for (int id : userIds) {
//mStickyBroadcasts类型是SparseArray<ArrayMap<String, ArrayList<Intent>>>，SparseArray映射一个Integer到一个Object
                ArrayMap<String, ArrayList<Intent>> stickies = mStickyBroadcasts.get(id);
                if (stickies != null) {
                    ArrayList<Intent> intents = stickies.get(action);
                    if (intents != null) {
                        if (stickyIntents == null) {
                            stickyIntents = new ArrayList<Intent>();
                        }
                        //根据本次的action找到粘性事件的Intent
                        stickyIntents.addAll(intents);
                    }
                }
            }
        }
    }
    ArrayList<Intent> allSticky = null;
    if (stickyIntents != null) {
        final ContentResolver resolver = mContext.getContentResolver();
        // Look for any matching sticky broadcasts...
        for (int i = 0, N = stickyIntents.size(); i < N; i++) {
            Intent intent = stickyIntents.get(i);
            //我正在注册广播接收器，你问我是否和AMS中存在的粘性广播匹配。
            //那是啥子意思嘛？很明显，就是你注册的这个广播接收器，怕是想接收已经存在的粘性事件。
            if (filter.match(resolver, intent, true, TAG) >= 0) {
                if (allSticky == null) {
                    allSticky = new ArrayList<Intent>();
                }
                //匹配加入进来，是否这些粘性intent就是要分发给正在注册的这个广播了？我们按照着剧本往下走。
                allSticky.add(intent);
            }
        }
    }
    // The first sticky in the list is returned directly back to the client.
    Intent sticky = allSticky != null ? allSticky.get(0) : null; //确实有粘性事件的Intent匹配当前要注册的Fliter，那么返回第一个,要么是NUll！
    if (receiver == null) {
//也就是我们可以通过registerBoradCastReceiver(null,IntentFliter(action))，根据返回判定是否存在粘性广播
        return sticky;  //intent = registerBoradCastReceiver(null,IntentFliter(action)),这种方式注册的广播，已经拿到了他想要的粘性事件结果Intent，剧本结束。
    }
    //剧本走到这里，有可能这次注册，监听的Action的确是粘性事件，但是他有传入receiver
    synchronized (this) {
        //HashMap<IBinder, ReceiverList>  mRegisteredReceivers，键是IIntentReceiver
        //receiver是IIntentReceiver,这个东西和Context一一对应，也就是Activity, 也就是这边AMS这里一个ReceiverList包含了一个Activity里所有注册了的广播。
        ReceiverList rl = mRegisteredReceivers.get(receiver.asBinder()); 
        if (rl == null) {
            rl = new ReceiverList(this, callerApp, callingPid, callingUid,
                    userId, receiver);
            if (rl.app != null) {
                // rl.app.receivers.size() 表示的是一个app注册的所有的广播，MAX_RECEIVERS_ALLOWED_PER_APP是1000，什么意思？
                //一个app最多只能注册1000个广播。
                final int totalReceiversForApp = rl.app.receivers.size(); 
                if (totalReceiversForApp >= MAX_RECEIVERS_ALLOWED_PER_APP) {
                    throw new IllegalStateException("Too many receivers, total of "
                            + totalReceiversForApp + ", registered for pid: "
                            + rl.pid + ", callerPackage: " + callerPackage);
                }
                rl.app.receivers.add(rl); //没超出最大数量，添加进去。
            } else {
                try {
                    receiver.asBinder().linkToDeath(rl, 0);
                } catch (RemoteException e) {
                    return sticky;
                }
                rl.linkedToDeath = true;
            }
            //添加注册信息
            mRegisteredReceivers.put(receiver.asBinder(), rl);
        }
        //引入一个BroadcasrFilter，包含了上面的ReceiverList，本次广播的filter也存入BroadcastFilter中
        BroadcastFilter bf = new BroadcastFilter(filter, rl, callerPackage,
                permission, callingUid, userId, instantApp, visibleToInstantApps);
         rl.add(bf);  // bf中有rl,rl中有bf。你中有我，我中有你。同时这行代码的含义：向ReceiverList添加一个广播。等同于：当前activity又新注册了一个广播。
        //IntentResolver<BroadcastFilter, BroadcastFilter> mReceiverResolver
         mReceiverResolver.addFilter(bf); //到此处新增加的广播在AMS中就处理完毕了,下面还有一个粘性事件的分发处理。
        // Enqueue broadcasts for all existing stickies that match
        // this filter.
        if (allSticky != null) {//看样子要处理这个粘性事件的问题
            ArrayList receivers = new ArrayList();
            receivers.add(bf);
            final int stickyCount = allSticky.size();
            for (int i = 0; i < stickyCount; i++) {
                Intent intent = allSticky.get(i);
                //引入BroadcastQueue,两个队列：一个是前台队列，一个是后台队列。就是使用哪一个根据intent的flag来确定。
                BroadcastQueue queue = broadcastQueueForIntent(intent);
                //BroadcastRecord主要是包含了receivers
                BroadcastRecord r = new BroadcastRecord(queue, intent, null,
                        null, -1, -1, false, null, null, OP_NONE, null, receivers,
                        null, 0, null, null, false, true, true, -1, false,
                        false /* only PRE_BOOT_COMPLETED should be exempt, no stickies */);
                queue.enqueueParallelBroadcastLocked(r); //入队
                queue.scheduleBroadcastsLocked(); //分发广播
            }
        }
        return sticky;
    }
}
```

##### 对上面注册广播接收器进行小总结一下:

-   从app端过来的信息主要是IApplicationThread、IIntentReceiver、IntentFilter
    
    -   IApplicationThread用于确定到底是哪个app在搞事情
        
    -   IIntentReceiver对标于Context, 而Context本身是一个Activity一个。那么这就产生一个问题：一个Activity注册多个广播，是怎么搞的？
        
        -   答:mReceivers的数据类型是Map, key是Context, value是Map,key是broadcast,value 是ReceiverDispatcher.
    -   IntentFilter主要就是取其Action,标识其关注的广播。
        
-   rl = new ReceiverList(this, callerApp, callingPid, callingUid,userId, receiver);
    
-   mRegisteredReceivers.put(receiver.asBinder(), rl);
    
-   bf = new BroadcastFilter(filter, rl, callerPackage,permission, callingUid, userId, instantApp, visibleToInstantApps);
    
-   mReceiverResolver.addFilter(bf);
    

#### 上面广播的注册，处理的最多的还是这个粘性事件。同时通过上面代码的阅读，我们知道要是想获取一个粘性广播的消息，我们只需要这样

**intent = registerReceiver(null,IntentFliter(action)),这样从返回的这个intent，我们就可以获取到粘性事件的数据(当然也可能为null),如果你注册还是传入了receiver,又恰好有粘性事件，那么这正是我们下面要分析的：**

```typescript
//接着分析上面遗留的小尾巴
//queue.enqueueParallelBroadcastLocked(r); //入队
    public void enqueueParallelBroadcastLocked(BroadcastRecord r) {
        mParallelBroadcasts.add(r); //类型是 ArrayList<BroadcastRecord> mParallelBroadcasts
    }

    public void enqueueOrderedBroadcastLocked(BroadcastRecord r) {
        mDispatcher.enqueueOrderedBroadcastLocked(r); //这个方法见名知意，当前广播加入有序广播
    }
//queue.scheduleBroadcastsLocked(); //分发广播
    public void scheduleBroadcastsLocked() {
        if (mBroadcastsScheduled) {
            return;
        }
        //使用Handler去处理事情，这个Handler是在AMS构造的时候，创建的一个ServiceThread,继承自HandlerThread。
        //也就是开了一个线程来处理这些广播分发的动作。
        mHandler.sendMessage(mHandler.obtainMessage(BROADCAST_INTENT_MSG, this));
        mBroadcastsScheduled = true;
    }
//mHandler中调用processNextBroadcast(true);
final void processNextBroadcast(boolean fromMsg) {
        synchronized (mService) {
            processNextBroadcastLocked(fromMsg, false);
        }
    }
final void processNextBroadcastLocked(boolean fromMsg, boolean skipOomAdj) {
    while (mParallelBroadcasts.size() > 0) {
        r = mParallelBroadcasts.remove(0);
        final int N = r.receivers.size();
        for (int i=0; i<N; i++) {//开启for循环的时候就是故事开始的时候
            Object target = r.receivers.get(i);
            //分发
            deliverToRegisteredReceiverLocked(r, (BroadcastFilter)target, false, i);
        }
}
private void deliverToRegisteredReceiverLocked(BroadcastRecord r,
        BroadcastFilter filter, boolean ordered, int index) {
    boolean skip = false;
    ...
    if (skip) {
    r.delivery[index] = BroadcastRecord.DELIVERY_SKIPPED;
    return;
    }
   if (filter.receiverList.app != null && filter.receiverList.app.inFullBackup) {
                // Skip delivery if full backup in progress
                // If it's an ordered broadcast, we need to continue to the next receiver.
                if (ordered) {
                    skipReceiverLocked(r); //这里面有点意思，通过下面的分析就知道，这里进行了循环。
                }
            } else {
                maybeAddAllowBackgroundActivityStartsToken(filter.receiverList.app, r);
                //分发
                performReceiveLocked(filter.receiverList.app, filter.receiverList.receiver,
                        new Intent(r.intent), r.resultCode, r.resultData,
                        r.resultExtras, r.ordered, r.initialSticky, r.userId);
                // parallel broadcasts are fire-and-forget, not bookended by a call to
                // finishReceiverLocked(), so we manage their activity-start token here
                if (r.allowBackgroundActivityStarts && !r.ordered) {
                    postActivityStartTokenRemoval(filter.receiverList.app, r);
                }
            }
            if (ordered) {
                r.state = BroadcastRecord.CALL_DONE_RECEIVE;
            }

}

//skipReceiverLocked
private void skipReceiverLocked(BroadcastRecord r) {
        logBroadcastReceiverDiscardLocked(r);
        finishReceiverLocked(r, r.resultCode, r.resultData,
                r.resultExtras, r.resultAbort, false);
        scheduleBroadcastsLocked();
    }
    public void scheduleBroadcastsLocked() {
        if (DEBUG_BROADCAST) Slog.v(TAG_BROADCAST, "Schedule broadcasts ["
                + mQueueName + "]: current="
                + mBroadcastsScheduled);
        if (mBroadcastsScheduled) {
            return;
        }
        mHandler.sendMessage(mHandler.obtainMessage(BROADCAST_INTENT_MSG, this));
        mBroadcastsScheduled = true;
    }
```

#### 最后的派发performReceiveLocked

```java
void performReceiveLocked(ProcessRecord app, IIntentReceiver receiver,
        Intent intent, int resultCode, String data, Bundle extras,
        boolean ordered, boolean sticky, int sendingUser)
        throws RemoteException {
    // Send the intent to the receiver asynchronously using one-way binder calls.
    if (app != null) {
        if (app.thread != null) {
//走这里从applicationThread进行RPC,binder通信回调回去。注意上面的注释，说这个事one-way也就是单向，调用了就行，不需要等待回复的。
//进入ActivityThread我们会发现，其实调用的就是receiver.performReceive
                app.thread.scheduleRegisteredReceiver(receiver, intent, resultCode,
                        data, extras, ordered, sticky, sendingUser, app.getReportedProcState());
        } 
    } else {
//这里就不一样了使用IIntentReceiver，这里的receiver是代理端，发起远程RPC,回调回LoadedApk中,进行广播派发。
        receiver.performReceive(intent, resultCode, data, extras, ordered,
                sticky, sendingUser);
    }
}
```

**上面的消息派发都是使用receiver.performReceive，有什么区别了？使用applicationThread回调回去的，是在app自己的进程派发。在AMS中调用receiver.performReceive时跨进程的binder call调用派发消息。**

#### 万万没有想到我只是想分析一下广播的注册，没想到分发也引入进来了。ok,话不多说，接着我们真正的开始广播的发送。

-   sendBroadcast() 普通广播
    
-   sendOrderedBroadcast 有序广播
    
-   sendStickyBroadcast ，Sticky broadcasts should not be used. 粘性广播在高版本的API上已经被废弃掉了，后面的解释说是任何用户都可以访问，同时也可以修改，非常的不安全！
    

```typescript
#ContextImpl$sendBroadcast
@Override
public void sendBroadcast(Intent intent) {
    warnIfCallingFromSystemProcess();
    String resolvedType = intent.resolveTypeIfNeeded(getContentResolver());
    try {
        intent.prepareToLeaveProcess(this);
        //发送不是注册，不需要考虑如何接收的问题，因此来的简单粗暴一些。带上Intent,直接就进入AMS中
        ActivityManager.getService().broadcastIntent(
                mMainThread.getApplicationThread(), intent, resolvedType, null,
                Activity.RESULT_OK, null, null, null, AppOpsManager.OP_NONE, null, false, false,
                getUserId());
    } catch (RemoteException e) {
        throw e.rethrowFromSystemServer();
    }
}
```

#### 进入AMS去查看broadcastIntent

```java
final int broadcastIntentLocked(ProcessRecord callerApp,
        String callerPackage, Intent intent, String resolvedType,
        IIntentReceiver resultTo, int resultCode, String resultData,
        Bundle resultExtras, String[] requiredPermissions, int appOp, Bundle bOptions,
        boolean ordered, boolean sticky, int callingPid, int callingUid, int realCallingUid,
        int realCallingPid, int userId, boolean allowBackgroundActivityStarts) {
    intent = new Intent(intent);//重新构建一个本地的Intent，这是为何？
  // By default broadcasts do not go to stopped apps.
intent.addFlags(Intent.FLAG_EXCLUDE_STOPPED_PACKAGES); //停止的app不在派发
final String action = intent.getAction();
if (action != null) {
    switch (action) { //下面的这些ACTION,看到名字就知道是PKMS发送过来的，
        case Intent.ACTION_PACKAGE_REMOVED: //当app移除，就会去清除当前app的堆栈信息，具体的等分析PKMS再来进行分析。
        case Intent.ACTION_PACKAGE_CHANGED:
        ...
if (sticky) {
    //上面我们看到发送粘性广播的API已经废弃，但是这里面还是有的，应该是留给系统使用的，需要一个权限：android.permission.BROADCAST_STICKY
    if (checkPermission(android.Manifest.permission.BROADCAST_STICKY,
            callingPid, callingUid)
            != PackageManager.PERMISSION_GRANTED) {
        throw new SecurityException(msg);
    }
    ArrayMap<String, ArrayList<Intent>> stickies = mStickyBroadcasts.get(userId);
    if (stickies == null) {
        stickies = new ArrayMap<>();
        mStickyBroadcasts.put(userId, stickies); //粘性广播加入集合
    }
    ArrayList<Intent> list = stickies.get(intent.getAction());
    if (list == null) {
        list = new ArrayList<>();
        stickies.put(intent.getAction(), list);}
    final int stickiesCount = list.size();
    int i;
    for (i = 0; i < stickiesCount; i++) {
    if (intent.filterEquals(list.get(i))) {
        // This sticky already exists, replace it.
        list.set(i, new Intent(intent));
        break;}}
if (i >= stickiesCount) {
    list.add(new Intent(intent));}} 
//上面完成了对粘性消息的处理
// Figure out who all will receive this broadcast. 
List receivers = null; //看来要开始找出接收者了
List<BroadcastFilter> registeredReceivers = null;
if ((intent.getFlags()&Intent.FLAG_RECEIVER_REGISTERED_ONLY)// 设置了这个Flag表示只分发给动态广播，没设置，默认，走下面去PKMS中把静态广播也一起找出来。
         == 0) {
 //这个receivers是List<ResolveInfo>，并且下面这个方法看一下就知道，是在访问PKMS,找到匹配当前Intent的广播接收器
    receivers = collectReceiverComponents(intent, resolvedType, callingUid, users);
}
//这个mReceiverResolver在注册广播的时候，最后: mReceiverResolver.addFliter(bf),看来就在这里去匹配的
//所有动态注册的广播，全部出场，最后还有一个mResolvePrioritySorter,用于按照优先级排序，看来已经考虑到顺序广播。
    registeredReceivers = mReceiverResolver.queryIntent(intent,
        resolvedType, false /*defaultOnly*/, userId);
// Merge into one list. 要给静态广播和动态合并在一块好进行一个分发
if (receivers != null) { //如果静态广播不为空
    // A special case for PACKAGE_ADDED: do not allow the package
    // being added to see this broadcast.  This prevents them from
    // using this as a back door to get run as soon as they are
    // installed.   
    //上面这段注释加上下面这段代码的意思就是：
    //当前的这个广播如果是下面几种类型的，同时我们搜索到的静态广播也监听这几个action,那么就应该把这几个静态广播移除出去，
    //这样就可以避免一种情况就是：1. 应用刚安装就自己启动了，2. 用户刚点击了清除应用数据，应用就启动了。
    String skipPackages[] = null;
    if (Intent.ACTION_PACKAGE_ADDED.equals(intent.getAction())
            || Intent.ACTION_PACKAGE_RESTARTED.equals(intent.getAction())
            || Intent.ACTION_PACKAGE_DATA_CLEARED.equals(intent.getAction())) {
        Uri data = intent.getData();
        if (data != null) {
            String pkgName = data.getSchemeSpecificPart();
            if (pkgName != null) {
                skipPackages = new String[] { pkgName };
            }
        }
    } else if (Intent.ACTION_EXTERNAL_APPLICATIONS_AVAILABLE.equals(intent.getAction())) {
        skipPackages = intent.getStringArrayExtra(Intent.EXTRA_CHANGED_PACKAGE_LIST);
    }
    if (skipPackages != null && (skipPackages.length > 0)) {
        for (String skipPackage : skipPackages) {
            if (skipPackage != null) {
                int NT = receivers.size();
                for (int it=0; it<NT; it++) {
                    ResolveInfo curt = (ResolveInfo)receivers.get(it);
                    if (curt.activityInfo.packageName.equals(skipPackage)) {
                        receivers.remove(it);
                        it--;
                        NT--;
                    }
                }
            }
        }
    }
    //通过上面的移除，下面要真正的开始将静态和动态广播合并到一个了
    int NT = receivers != null ? receivers.size() : 0;
    int it = 0;
    int ir = 0;
    ResolveInfo curt = null;// 静态广播对应数据类型
    BroadcastFilter curr = null;// 动态广播对应类型
    //注意到上面两种广播的数据类型根本不一样，两种类型不一样的要合并在一起，这是一个有趣的事情，看看google工程师怎么搞的事情：
    while (it < NT && ir < NR) {
        if (curt == null) {
            curt = (ResolveInfo)receivers.get(it); //取出第it个静态广播
        }
        if (curr == null) {
            curr = registeredReceivers.get(ir); //取出第ir个动态广播
        }
        if (curr.getPriority() >= curt.priority) { //两个广播进行优先级比较
            // Insert this broadcast record into the final list.
            receivers.add(it, curr);//？？动态的BroadcastFilter 插入静态的ResolveInfo列表？？不是，等等，这个类型不是不一样嘛
            ir++;
            curr = null; //准备取下一个动态
            it++;
            NT++;
        } else {
            // Skip to the next ResolveInfo in the final list.
            it++;
            curt = null; //静态广播优先级大，在这个位置不动，取下一个静态广播和当前动态广播相比较
        }
    }
while (ir < NR) { //动态广播还没有取完，把最后剩于的加入列表末尾。
    if (receivers == null) {
        receivers = new ArrayList();
    }
    receivers.add(registeredReceivers.get(ir));
    ir++;
}
```

#### 上面把动态广播的BroadcastFilter加入静态receivers(ResolveInfo) List的动作,是因为List receivers = null; 这个List没有指定是什么类型的，默认存放的是Object类型，所以静态动态被存放在了同一个里面。另外我们已经得到能够接收的列表，而且按照优先权来拍好了序，看来就只差最后一步了：分发。

```java
/
if ((receivers != null && receivers.size() > 0)
        || resultTo != null) {
    //之前分析过，拿queue
    BroadcastQueue queue = broadcastQueueForIntent(intent);
    //这些准备分发的接收器信息封装在BroadcastRecord中
    BroadcastRecord r = new BroadcastRecord(queue, intent, callerApp,
            callerPackage, callingPid, callingUid, callerInstantApp, resolvedType,
            requiredPermissions, appOp, brOptions, receivers, resultTo, resultCode,
            resultData, resultExtras, ordered, sticky, false, userId,
            allowBackgroundActivityStarts, timeoutExempt);
   //注意了，这里入的队是有序的
        queue.enqueueOrderedBroadcastLocked(r);
   //分发
        queue.scheduleBroadcastsLocked();
    }
} 
public void enqueueOrderedBroadcastLocked(BroadcastRecord r) {
    mDispatcher.enqueueOrderedBroadcastLocked(r);
    enqueueBroadcastHelper(r);
}
void enqueueOrderedBroadcastLocked(BroadcastRecord r) {
// ArrayList<BroadcastRecord> mOrderedBroadcasts = new ArrayList<>();
    mOrderedBroadcasts.add(r);
}
//这个 queue.scheduleBroadcastsLocked();我们已经看过了，使用handler发个消息开始分发，然后
final void processNextBroadcastLocked(boolean fromMsg, boolean skipOomAdj) {
    BroadcastRecord r;
    while (mParallelBroadcasts.size() > 0) { //分发无序的广播
    }
    do {
    // 获取一个又一个的BroadcastRecord 
    r = mDispatcher.getNextBroadcastLocked(now);
    
        } while (r == null);
    // Get the next receiver...
   int recIdx = r.nextReceiver++;
   final Object nextReceiver = r.receivers.get(recIdx);
   if (nextReceiver instanceof BroadcastFilter) { //动态广播
        //分发，这里就不去分析这个动态广播的分发了，上面已经分析过了。
        deliverToRegisteredReceiverLocked(r, filter, r.ordered, recIdx);
        return;
    }
    //静态广播的分发
    ResolveInfo info =
    (ResolveInfo)nextReceiver;
    // 一系列的判断，判断要接收的apk是否有权限
  // Is this receiver's application already running?
    if (app != null && app.thread != null && !app.killed) {
        try {
            app.addPackage(info.activityInfo.packageName,
                    info.activityInfo.applicationInfo.longVersionCode, mService.mProcessStats);
            maybeAddAllowBackgroundActivityStartsToken(app, r);
            processCurBroadcastLocked(r, app, skipOomAdj); //注意在这里
            return;
        } 
    }
    //startProcessLocked完成了app的启动，看下面这条注释，当app启动再去执行广播。
    // Not running -- get it started, to be executed when the app comes up.
    if ((r.curApp=mService.startProcessLocked(targetProcess,
            info.activityInfo.applicationInfo, true,
            r.intent.getFlags() | Intent.FLAG_FROM_BACKGROUND,
            new HostingRecord("broadcast", r.curComponent),
            (r.intent.getFlags()&Intent.FLAG_RECEIVER_BOOT_UPGRADE) != 0, false, false))
                    == null) {
        // Ah, this recipient is unavailable.  Finish it if necessary,
        // and mark the broadcast record as ready for the next.
        Slog.w(TAG, "Unable to launch app "
                + info.activityInfo.applicationInfo.packageName + "/"
                + receiverUid + " for broadcast "
                + r.intent + ": process is bad");
    }
   //结束
}
```

#### 分析上面的processCurBroadcastLocked，问题应该就在这里了：

```java
//多么熟悉的姿势
app.thread.scheduleReceiver(new Intent(r.intent), r.curReceiver,
        mService.compatibilityInfoForPackage(r.curReceiver.applicationInfo),
        r.resultCode, r.resultData, r.resultExtras, r.ordered, r.userId,
        app.getReportedProcState());
//接着进入ApplicationThread中
public final void scheduleReceiver(Intent intent, ActivityInfo info,
        CompatibilityInfo compatInfo, int resultCode, String data, Bundle extras,
        boolean sync, int sendingUser, int processState) {
    updateProcessState(processState, false);
    ReceiverData r = new ReceiverData(intent, resultCode, data, extras,
            sync, false, mAppThread.asBinder(), sendingUser);
    r.info = info;
    r.compatInfo = compatInfo;
    sendMessage(H.RECEIVER, r); //使用mH去发送这个广播接收的消息
}

@UnsupportedAppUsage(maxTargetSdk = Build.VERSION_CODES.P, trackingBug = 115609023)
private void handleReceiver(ReceiverData data) {
    IActivityManager mgr = ActivityManager.getService();
    Application app;
    BroadcastReceiver receiver;
    ContextImpl context;
    try {
        app = packageInfo.makeApplication(false, mInstrumentation);
        context = (ContextImpl) app.getBaseContext();
        //类加载器也安排上了，看来是要搞事情了
        java.lang.ClassLoader cl = context.getClassLoader();
        //下面这个instantiateReceiver，代码是(BroadcastReceiver) cl.loadClass(className).newInstance();
        //果然，反射加载了我们的静态广播接收器
        receiver = packageInfo.getAppFactory()
                .instantiateReceiver(cl, data.info.name, data.intent);
    }
    try {
        receiver.setPendingResult(data);
        //一个轻快的函数调用，至此进入onReceiver方法，收到消息。
        receiver.onReceive(context.getReceiverRestrictedContext(),
                data.intent);
    }
    if (receiver.getPendingResult() != null) {
        data.finish();
    }
}
```

#### 上面还遗留一个问题就是：要是app没有启动，那么这个广播是怎么分发的？

```typescript
//mService.startProcessLocked(...)  这个是AMS
mProcessList.startProcessLocked(...)

final ProcessRecord startProcessLocked(String processName, ApplicationInfo info,
        boolean knownToBeDead, int intentFlags, HostingRecord hostingRecord,
        boolean allowWhileBooting, boolean isolated, int isolatedUid, boolean keepIfLarge,
        String abiOverride, String entryPoint, String[] entryPointArgs, Runnable crashHandler) {
    long startTime = SystemClock.elapsedRealtime();
    ProcessRecord app;
    if (!isolated) {
        //app没有启动，所以这里的app是null
        app = getProcessRecordLocked(processName, info.uid, keepIfLarge);
    }
if (app == null) {
    //注意这里，构建ProcessRecord
    app = newProcessRecordLocked(info, processName, isolated, isolatedUid, hostingRecord);
    app.crashHandler = crashHandler;
} 
//注意这里,启动Process
final boolean success = startProcessLocked(app, hostingRecord, abiOverride);
}
//分析构建Process
final ProcessRecord newProcessRecordLocked(ApplicationInfo info, String customProcess,
        boolean isolated, int isolatedUid, HostingRecord hostingRecord) {
        final ProcessRecord r = new ProcessRecord(mService, info, proc, uid);
        addProcessNameLocked(r);
}

final void addProcessNameLocked(ProcessRecord proc) {
    mProcessNames.put(proc.processName, proc.uid, proc);
}

//启动Process
final boolean startProcessLocked(ProcessRecord app, HostingRecord hostingRecord,
        String abiOverride) {
    return startProcessLocked(app, hostingRecord,
            false /* disableHiddenApiChecks */, false /* mountExtStorageFull */, abiOverride);
}

boolean startProcessLocked(HostingRecord hostingRecord,
        String entryPoint,
        ProcessRecord app, int uid, int[] gids, int runtimeFlags, int mountExternal,
        String seInfo, String requiredAbi, String instructionSet, String invokeWith,
        long startTime) {
final Process.ProcessStartResult startResult = startProcess(hostingRecord,
        entryPoint, app,
        uid, gids, runtimeFlags, mountExternal, seInfo, requiredAbi, instructionSet,
        invokeWith, startTime);
handleProcessStartedLocked(app, startResult.pid, startResult.usingWrapper,
        startSeq, false);
}

private Process.ProcessStartResult startProcess(HostingRecord hostingRecord, String entryPoint,
        ProcessRecord app, int uid, int[] gids, int runtimeFlags, int mountExternal,
        String seInfo, String requiredAbi, String instructionSet, String invokeWith,
        long startTime) {
final Process.ProcessStartResult startResult;
if (hostingRecord.usesWebviewZygote()) {  //启动WebView
    startResult = startWebView(entryPoint,
            app.processName, uid, uid, gids, runtimeFlags, mountExternal,
            app.info.targetSdkVersion, seInfo, requiredAbi, instructionSet,
            app.info.dataDir, null, app.info.packageName,
            new String[] {PROC_START_SEQ_IDENT + app.startSeq});
} else if (hostingRecord.usesAppZygote()) { //应用程序的Zygote
    final AppZygote appZygote = createAppZygoteForProcessIfNeeded(app);
    startResult = appZygote.getProcess().start(entryPoint,
            app.processName, uid, uid, gids, runtimeFlags, mountExternal,
            app.info.targetSdkVersion, seInfo, requiredAbi, instructionSet,
            app.info.dataDir, null, app.info.packageName,
            /*useUsapPool=*/ false,
            new String[] {PROC_START_SEQ_IDENT + app.startSeq});
} else {
//走这
    startResult = Process.start(entryPoint,
            app.processName, uid, uid, gids, runtimeFlags, mountExternal,
            app.info.targetSdkVersion, seInfo, requiredAbi, instructionSet,
            app.info.dataDir, invokeWith, app.info.packageName,
            new String[] {PROC_START_SEQ_IDENT + app.startSeq});
}
checkSlow(startTime, "startProcess: returned from zygote!");
return startResult;
}
#Process.java
public static ProcessStartResult start(@NonNull final String processClass,
                                       @Nullable final String niceName,
                                       int uid, int gid, @Nullable int[] gids,
                                       int runtimeFlags,
                                       int mountExternal,
                                       int targetSdkVersion,
                                       @Nullable String seInfo,
                                       @NonNull String abi,
                                       @Nullable String instructionSet,
                                       @Nullable String appDataDir,
                                       @Nullable String invokeWith,
                                       @Nullable String packageName,
                                       @Nullable String[] zygoteArgs) {
    //这个类型 ZygoteProcess ZYGOTE_PROCESS = new ZygoteProcess();
    return ZYGOTE_PROCESS.start(processClass, niceName, uid, gid, gids,
                runtimeFlags, mountExternal, targetSdkVersion, seInfo,
                abi, instructionSet, appDataDir, invokeWith, packageName,
                /*useUsapPool=*/ true, zygoteArgs);
}

return startViaZygote(processClass, niceName, uid, gid, gids,
        runtimeFlags, mountExternal, targetSdkVersion, seInfo,
        abi, instructionSet, appDataDir, invokeWith, /*startChildZygote=*/ false,
        packageName, useUsapPool, zygoteArgs);
//最后调用到
private Process.ProcessStartResult attemptZygoteSendArgsAndGetResult(
        ZygoteState zygoteState, String msgStr) throws ZygoteStartFailedEx {
    try {
        final BufferedWriter zygoteWriter = zygoteState.mZygoteOutputWriter;
        final DataInputStream zygoteInputStream = zygoteState.mZygoteInputStream;

        zygoteWriter.write(msgStr); //写入数据 ，其实我们知道这个就是通过Socket给zygote发送消息，让他fork一个新的进程，由此一个app产生！
        zygoteWriter.flush(); //刷新缓冲区

        return result;
    } catch (IOException ex) {
        zygoteState.close();
        Log.e(LOG_TAG, "IO Exception while communicating with Zygote - "
                + ex.toString());
        throw new ZygoteStartFailedEx(ex);
    }
}
```
