
// 从任意一个 PrimitiveComponent 拿 vtable + 0x660 处的 SetCollisionEnabled
var walls = FindActorsContains("Wall");
//console.log("找到", walls.length, "面墙");

var StaticMeshComponent = walls[0].addr.add(0x220).readPointer();
var SetCollisionEnabled = StaticMeshComponent.readPointer().add(0x660).readPointer();

var fn = new NativeFunction(SetCollisionEnabled,'void',['pointer', 'uint8']);
/*
enum ECollisionEnabled
{
    NoCollision,        // 0：不参与碰撞
    QueryOnly,          // 1：只参与查询（射线、重叠），不参与物理
    PhysicsOnly,        // 2：只参与物理，不参与查询
    QueryAndPhysics     // 3：既查询又物理（默认）
};*/
// 循环里每面墙各传自己的组件（vtable 共享，fn 只构造一次）
for (var i = 0; i < walls.length; i++) {
    var mc = walls[i].addr.add(0x220).readPointer();
    if (mc.isNull()) continue;
    try {
        fn(mc, 0);   // 0 = NoCollision 1= QueryOnly 2 = PhysicsOnly 3 = QueryAndPhysics
        console.log(walls[i].name, "ok");
    } catch (e) {
        console.log(walls[i].name, "Error:", e.message);
        break;
    }
}
