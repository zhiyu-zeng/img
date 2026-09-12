var libUE4 = Process.findModuleByName("libUE4.so");
var GNames = libUE4.base.add(0x0B171CC0);

function getClassName(obj) {
    var cls = obj.add(0x10).readPointer();
    var ci  = cls.add(0x18).readU32();
    var Block_index = (ci >>> 16) & 0x1FFF;
    var FNameEntry = GNames.add(0x40).add(Block_index * 8).readPointer().add((ci & 0xFFFF) * 2);
    var header = FNameEntry.readU16();
    var len = header >>> 6;
    return FNameEntry.add(0x02).readCString(len);
}

var shapes = FindActorsContains("Shape_Pipe_Flag");
for (var i = 0; i < shapes.length; i++) {
    console.log(i, shapes[i].name, "类:", getClassName(shapes[i].addr));
}