local OFFSET_GET_ACTOR   = 0x6F9D47C
local OFFSET_METHOD_INFO = 0xDED2C18

local function readPtr(addr)
    if not addr or addr == 0 then return 0 end
    local res = gg.getValues({{address = addr, flags = gg.TYPE_QWORD}})
    return res[1].value & 0x0000FFFFFFFFFFFF
end

local function readDword(addr)
    if not addr or addr == 0 then return 0 end
    local res = gg.getValues({{address = addr, flags = gg.TYPE_DWORD}})
    return res[1].value & 0xFFFFFFFF
end

local function readInt(addr)
    if not addr or addr == 0 then return 0 end
    local res = gg.getValues({{address = addr, flags = gg.TYPE_DWORD}})
    return res[1].value
end

local function readUInt(addr)
    if not addr or addr == 0 then return 0 end
    local res = gg.getValues({{address = addr, flags = gg.TYPE_DWORD}})
    return res[1].value & 0xFFFFFFFF
end

local function readFloat(addr)
    if not addr or addr == 0 then return 0.0 end
    local res = gg.getValues({{address = addr, flags = gg.TYPE_FLOAT}})
    return res[1].value
end

local function getRealIl2CppBase()
    local allRanges = gg.getRangesList()
    for _, r in ipairs(allRanges) do
        local name = r.internalName or r.name or ""
        if r.state == "Xa" and name:find("libil2cpp%.so") then
            if readDword(r.start + OFFSET_GET_ACTOR) == 0xD10103FF then
                return r.start
            end
        end
    end
    return 0
end

local function verifyOffsets()
    local log = {}
    local function addLog(str) table.insert(log, str) end

    local base = getRealIl2CppBase()
    if base == 0 then
        local err = "未找到有效 Base"
        gg.copyText(err, false)
        gg.alert(err)
        return
    end

    local p1 = readPtr(base + OFFSET_METHOD_INFO)
    local p2 = readPtr(p1 + 0x20)
    local p3 = readPtr(p2 + 0xC0)
    local p4 = readPtr(p3 + 0x10)
    local p5 = readPtr(p4 + 0xB8)
    local actorManager = readPtr(p5 + 0x0)
    local heroActors   = readPtr(actorManager + 0x18)
    local itemBackends = readPtr(heroActors + 0x08)
    local size         = readInt(heroActors + 0x10)

    addLog(string.format("Base:          0x%X", base))
    addLog(string.format("ActorManager:  0x%X", actorManager))
    addLog(string.format("HeroActors:    0x%X", heroActors))
    addLog(string.format("Item_Backends: 0x%X | 英雄总数: %d\n", itemBackends, size))

    local saveList = {}

    for i = 0, size - 1 do
        local elemAddr    = itemBackends + 0x20 + (i * 0x10)
        local actorLinker = readPtr(elemAddr + 0x0)
        local handleSeq   = readUInt(elemAddr + 0x8)

        if actorLinker ~= 0 then
            local objId   = readUInt(actorLinker + 0x4AC)
            local posX    = readFloat(actorLinker + 0x4C4)
            local posY    = readFloat(actorLinker + 0x4C8)
            local posZ    = readFloat(actorLinker + 0x4CC)
            local valComp = readPtr(actorLinker + 0x3B8)

            addLog(string.format(
                "[%d] Linker: 0x%X | Seq: 0x%X | ObjID: %d | Pos: (%.2f, %.2f, %.2f) | ValComp: 0x%X",
                i, actorLinker, handleSeq, objId, posX, posY, posZ, valComp
            ))

            table.insert(saveList, {
                address = actorLinker + 0x4C4,
                flags = gg.TYPE_FLOAT,
                name = string.format("Hero[%d]_X (ID:%d)", i, objId)
            })
        else
            addLog(string.format("[%d] 空指针 (0x0)", i))
        end
    end

    if #saveList > 0 then
        gg.addListItems(saveList)
        addLog("\n验证完成！所有英雄 X 坐标已加入 GG 保存列表（完整结果已复制到剪贴板）。")
    end

    local out = table.concat(log, "\n")
    gg.copyText(out, false)
    gg.alert(out)
end

verifyOffsets()