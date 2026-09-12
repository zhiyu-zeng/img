var Module = Process.findModuleByName("libUE4.so");
var Addr = FindAddrInGWorld("FirstPersonCharacter_C");

function GetActorLocation(Addr) {
    var RootComponent = Addr.add(0x130).readPointer();
    if (RootComponent.isNull()) {
        console.log("RootComponent is null");
        return null;
    }
    var x = RootComponent.add(0x1D0).readFloat();
    var y = RootComponent.add(0x1D4).readFloat();
    var z = RootComponent.add(0x1D8).readFloat();
    return { x: x, y: y, z: z };
}

var TP = new NativeFunction(
    Module.base.add(0x8C3181C),
    'bool',
    ['pointer', 'bool', 'pointer', 'bool', 'float', 'float', 'float']
);

// 先拿当前位置
var pos = GetActorLocation(Addr);
console.log("当前位置:", pos.x, pos.y, pos.z);

// 用当前位置计算新位置
var hitResult = Memory.alloc(0x100);
TP(Addr, 0, hitResult, 1, pos.x + 1000, pos.y, pos.z);

var pos = GetActorLocation(Addr);
console.log("瞬移后:", pos.x, pos.y, pos.z);