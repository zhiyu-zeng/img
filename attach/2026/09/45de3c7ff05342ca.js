const libUE4 = Process.findModuleByName("libUE4.so");

const GNames = libUE4.base.add(0x0B171CC0);

const GUObjectArray = libUE4.base.add(0x0B1B5F98);

const Gworld = libUE4.base.add(0x0B32D8A8);

const Uworld = Gworld.readPointer();
//由于Gworld是一个指针量.add获取的是Gworld本身的地址，readpointer之后才能获取Uworld

function getAddrFromGNames(name) {
    const TUObjectArray = GUObjectArray.add(0x10);
    //获取TUObjectArray的地址
    //现在我们应该要处理二级指针，挨个遍历
    //要知道Objects含有多少个Chunk，我们需要获取NumChunks的值
    // Objects(0x00) PreAllocated(0x08) MaxElements(0x10) NumElements(0x14) MaxChunks(0x18) NumChunks(0x1C)
    const NumChunks = TUObjectArray.add(0x1C).readU32();
    //获取Objects的地址
    const Objects = TUObjectArray.add(0x00).readPointer();
    const NumElements = TUObjectArray.add(0x14).readU32();
    for (let i = 0; i < NumChunks; i++) {
        // 处理每个Chunk[i]
        const Chunk_index = Objects.add(0x08 * i).readPointer();
        //指针的大小是8嘛，+8获取指针，readpointer获取Chunk[i]的地址
        //每个Chunk[i]有0x10000个FUObjectItem，但是不一定填满,(这里需要处理)
        //我得想法是利用NumElements的值来判断是否填满
        //const NumElements = TUObjectArray.add(0x14).readU32();
        const count = Math.min(NumElements - i * 0x10000, 0x10000);
        //本来是放这里的，性能考虑放在外层
        for (let j = 0; j < /*0x10000写死会出现问题，一般来说不可能填满*/count; j++) {
            //内存步长也就是FUObjectItem的大小是0x18(64位系统)，所以我们要获取FUObjectItem的地址就要+0x18*j
            const Current_FUObjectItem = Chunk_index.add(0x18 * j);
            //至此获取到FUObjectItem的地址
            //利用00偏移直接找到Object的地址
            const Current_Object = Current_FUObjectItem.readPointer();
            if (Current_Object.isNull()) continue;//注意判空
            //拉偏移找到NamePrivate
            const Current_Objetct_Nameprivate = Current_Object.add(0x08 + 0x04 + 0x04 + 0x08);
            //再获取ComparisonIndex的值
            const ComparisonIndex = Current_Objetct_Nameprivate.add(0x00).readU32();
            //追踪FNameEntryId的0x00偏移获取Value的值
            const Value = ComparisonIndex;//.add(0x00);
            //计算Block_index和InnerOffset
            const Block_index = (ComparisonIndex >> 16) & 0x1FFF;
            // const InnerOffset = (ComparisonIndex & 0xFFFF)*0x02;//计算InnerOffset
            //这里可能开宏 注意如果开了宏的话，InnerOffset需要乘以0x04，所以为了好整理，置入下方的暴力里
            //回头到Gname找到Block的地址
            //这里获取到堆管理器
            const FNameEntryAllocator = GNames.add(0x00);
            //获取Block的基址
            const Blockbase = FNameEntryAllocator.add(0x40);
            //代入Block_index和InnerOffset获取FNameEntry的地址,注意BLock是指针数组，且大小为0x08
            const BlockPtrToIndex = Blockbase.add(Block_index * 8);
            //这里找到是第几个Block
            //const FNameEntry = BlockPtrToIndex.readPointer().add(InnerOffset);
            //获取FNameEntry的名字，要注意到宏的影响，我这里采取暴力，都来一次看哪个是合理的
            //其次要确认是那种类型的字符串
            // 宏关闭：Header +0x00，字符串 +0x02，stride 2
            // 宏开启：Header +0x04，字符串 +0x06，stride 4
            const offsets = [
                { h: 0x00, s: 0x02, stride: 2 },  // 宏关闭
                { h: 0x04, s: 0x06, stride: 4 }   // 宏开启
            ];
            for (const o of offsets) {
                try {
                    const InnerOffset = (ComparisonIndex & 0xFFFF) * o.stride;
                    //获取FNameEntry的名字
                    const BlockPtr = BlockPtrToIndex.readPointer();
                    if (BlockPtr.isNull()) continue;//判空
                    const FNameEntry = BlockPtr.add(InnerOffset);
                    const header = FNameEntry.add(o.h).readU16();
                    //获取header，求长度，类型
                    const len = header >>> 6;
                    const isWide = header & 1;//最低位：0=ANSI 1=WIDE
                    if (len === 0 || len > 512) continue;//处理乱码
                    //根据类型读字符串
                    let s;
                    if (isWide) {
                        // 处理宽字符
                        s = "";
                        for (let k = 0; k < len; k++)
                            s += String.fromCharCode(FNameEntry.add(o.s + k * 2).readU16());
                    } else {
                        s = FNameEntry.add(o.s).readCString(len);
                    }
                    //获取对象的数字后缀
                    const num = Current_Object.add(0x1C).readU32();
                    const full = num ? (s + "_" + (num - 1)) : s;
                    if (full === name) return Current_Object;
                } catch (e) {
                    // 越界访问直接跳过，换下一种布局
                    continue;
                }
            }
        }
    }
    return null;
}