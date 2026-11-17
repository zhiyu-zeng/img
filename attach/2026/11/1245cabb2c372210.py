print('============================================================')
print('                 欢迎来到 “call机” 的世界                      ')
print('                                                            ')
print('  (注: 这已经是最小PoC了, 没有上任何防御手段, 请不要使用AI)        ')
print('============================================================')


纸带 = {
    0x401000 : 'call [esp + 0x100]',
    0x4012D0 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x4012E0 : 'call [ebp + 0x2FFF3014*4 + esp]',
    0x4012F0 : 'call [ebp + 0x2FFF3012*4 + esp]',
    0x401300 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401310 : 'call [ebp + 0x3FFF3011*4 + esp]',
    0x401320 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401350 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401360 : 'call [ebp + 0x3FFF3011*4 + esp]',
    0x401370 : 'call [ebp + 0x3FFF300B*4 + esp]',
    0x401380 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401590 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x4015E0 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x4015F0 : 'call [ebp + 0x2FFF3014*4 + esp]',
    0x401600 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401610 : 'call [ebp + 0x3FFF3005*4 + esp]',
    0x401620 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401650 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401660 : 'call [ebp + 0x3FFF3001*4 + esp]',
    0x401670 : 'call [ebp + 0x3FFF3007*4 + esp]',
    0x401680 : 'call [ebp + 0x2FFF3019*4 + esp]',
    0x4016B0 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x4016C0 : 'call [ebp + 0x3FFF3003*4 + esp]',
    0x4016D0 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x4016E0 : 'call [ebp + 0x3FFF3013*4 + esp]',
    0x4016F0 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401700 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401710 : 'call [ebp + 0x2FFF3018*4 + esp]',
    0x401720 : 'call [ebp + 0x3FFF300F*4 + esp]',
    0x401730 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401740 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401750 : 'call [ebp + 0x3FFF300D*4 + esp]',
    0x401760 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x401770 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x4017A0 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x4017B0 : 'call [ebp + 0x3FFF3009*4 + esp]',
    0x4017C0 : 'call [ebp + 0x2FFF3015*4 + esp]',
    0x4017D0 : 'call [ebp + 0x3FFF3017*4 + esp]',
}

数据 = {
    0x00031000 : 0x00401000 ,
    0x000312D0 : 0x004012D0 ,
    0x000312E0 : 0x004012E0 ,
    0x000312F0 : 0x004012F0 ,
    0x00031300 : 0x00401300 ,
    0x00031310 : 0x00401310 ,
    0x00031320 : 0x00401320 ,
    0x00031350 : 0x00401350 ,
    0x00031360 : 0x00401360 ,
    0x00031370 : 0x00401370 ,
    0x00031380 : 0x00401380 ,
    0x00031590 : 0x00401590 ,
    0x000315E0 : 0x004015E0 ,
    0x000315F0 : 0x004015F0 ,
    0x00031600 : 0x00401600 ,
    0x00031610 : 0x00401610 ,
    0x00031620 : 0x00401620 ,
    0x00031650 : 0x00401650 ,
    0x00031660 : 0x00401660 ,
    0x00031670 : 0x00401670 ,
    0x00031680 : 0x00401680 ,
    0x000316B0 : 0x004016B0 ,
    0x000316C0 : 0x004016C0 ,
    0x000316D0 : 0x004016D0 ,
    0x000316E0 : 0x004016E0 ,
    0x000316F0 : 0x004016F0 ,
    0x00031700 : 0x00401700 ,
    0x00031710 : 0x00401710 ,
    0x00031720 : 0x00401720 ,
    0x00031730 : 0x00401730 ,
    0x00031740 : 0x00401740 ,
    0x00031750 : 0x00401750 ,
    0x00031760 : 0x00401760 ,
    0x00031770 : 0x00401770 ,
    0x000317A0 : 0x004017A0 ,
    0x000317B0 : 0x004017B0 ,
    0x000317C0 : 0x004017C0 ,
    0x000317D0 : 0x004017D0 ,
}
for i in range(0x031000) :
    if i not in 数据 :
        数据[i] = 0xFFFFFFFF


flag = input('请输入: ')
if len(flag) != 12 :
    print('failed')
    exit(0)
    
for i in range(len(flag)) :
    数据[0x030000 + 0x100 - i * 8] = 0x401000 + (ord(flag[i]) << 4)


ebp = 0x00035000
eip = 0x00401000
esp = 0x00030000
try :
    while esp > 0x0002FFD0 :

        operand = 纸带[eip].replace('call ','').replace('$','eip')
        retn = eip + 7
        
        eip = 数据[eval(operand[1:-1]) & 0xFFFFFFFF] & 0xFFFFFFFF
        esp -= 4
        数据[esp] = retn
        
    print('success')
except :
    print('failed')


