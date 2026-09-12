const libUE4 = Process.findModuleByName("libUE4.so");

const GNames = libUE4.base.add(0x0B171CC0);

const GUObjectArray = libUE4.base.add(0x0B1B5F98);

const Gworld = libUE4.base.add(0x0B32D8A8);

//宏关闭：Header +0x00，字符串 +0x02，stride 2
//宏开启：Header +0x04，字符串 +0x06，stride 4
const layouts = [
    { h: 0x00, s: 0x02, stride: 2 },
    { h: 0x04, s: 0x06, stride: 4 }
];

function FindAddrInGWorld(name) {
    const Uworld = Gworld.readPointer();

    const PresistLevel = Uworld.add(0x30).readPointer();

    const ActorArray = PresistLevel.add(0x98).readPointer();
    //readPointer获取的是指向指针数组的指针
    const ActorCount = PresistLevel.add(0xA0).readU32();
    // ArrayNum（0x98+0x08=0xA0）

    for (let i = 0; i < ActorCount; i++) {
        // 拿到 AActor*（单个对象的地址）
        // 处理每个Actor
        //利用Uobject的布局
        const Actor = ActorArray.add(i * 8).readPointer();
        if (Actor.isNull()) continue;
        //判空
        const Fname = Actor.add(0x18).readU32();
        //获取FName
        const FNameEntryId = Fname;

        const Value = FNameEntryId;

        const Block_index = Value >> 16;

        const FNameEntryAllocator = GNames.add(0x00);

        const BLock_base = FNameEntryAllocator.add(0x40);
        //基地址

        for (const o of layouts) {
            try {
                const Offset = (Value & 0xFFFF) * o.stride;
                const FNameEntry = BLock_base.add(Block_index * 0x08).readPointer().add(Offset);
                //代入Block_index和Offset获取FNameEntry地址

                const header = FNameEntry.add(o.h).readU16();
                //获取header
                const len = header >>> 6;
                //求长度
                const isWide = header & 1;
                //最低位：0=ANSI 1=WIDE
                if (len === 0 || len > 512) continue;
                //处理乱码

                let s;
                if (isWide) {
                    //处理宽字符
                    s = "";
                    for (let k = 0; k < len; k++)
                        s += String.fromCharCode(FNameEntry.add(o.s + k * 2).readU16());
                } else {
                    s = FNameEntry.add(o.s).readCString(len);
                }
                //只比基础名，不带数字后缀（同一个类的所有实例共享基础名）
                if (s === name) return Actor;
                //命中直接返回
            } catch (e) {
                //越界或宏不匹配，跳过
                continue;
            }
        }
    }

    return null;
}