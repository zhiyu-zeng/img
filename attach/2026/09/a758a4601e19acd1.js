const libUE4 = Process.findModuleByName("libUE4.so");

const GNames = libUE4.base.add(0x0B171CC0);

const GUObjectArray = libUE4.base.add(0x0B1B5F98);

const Gworld = libUE4.base.add(0x0B32D8A8);

var anyActor = FindAddrInGWorld("FirstPersonCharacter_C");

var fnAddr = anyActor.readPointer().add(0x310).readPointer();

var SetActorHiddenInGame = new NativeFunction(fnAddr, 'void', ['pointer', 'bool']);

var PersistentLevel = Gworld.readPointer().add(0x30).readPointer();

var ActorArray = PersistentLevel.add(0x98).readPointer();

var ActorCount = PersistentLevel.add(0xA0).readU32(); 

for(let i = 0; i < ActorCount; i++) {
    var CurrentActor = ActorArray.add(0x08*i).readPointer();
    SetActorHiddenInGame(CurrentActor, 0);
    var pos = GetActorLocation(CurrentActor);
    if(pos == null) {
        console.log("Actor", i, "位置: null");
        continue;
    }
        var Value = CurrentActor.add(0x18).add(0x00).add(0x00).readU32();
        
        const Block_index = Value >> 16;

        const FNameEntryAllocator = GNames.add(0x00);

        const BLock_base = FNameEntryAllocator.add(0x40);
        //基地址
                const Offset = (Value & 0xFFFF) * 2;
                const FNameEntry = BLock_base.add(Block_index * 0x08).readPointer().add(Offset);
                //代入Block_index和Offset获取FNameEntry地址

                const header = FNameEntry.add(0x00).readU16();
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
                        s += String.fromCharCode(FNameEntry.add(0x02 + k * 2).readU16());
                } else {
                    s = FNameEntry.add(0x02).readCString(len);
                }
                //只比基础名，不带数字后缀（同一个类的所有实例共享基础名）
                var Name = s;

                console.log("Actor", i,Name, "位置:", pos.x, pos.y, pos.z,);
        }
        