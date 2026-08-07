setImmediate(function () {
    Java.perform(function () {
        var classname = 'com.tencent.qimei.uin.U';
        var gclass = Java.use(classname);
        console.log('\nGDA[Hook Class: ' + classname + ']');
        var gmethods = gclass.class.getDeclaredMethods();
        gmethods.forEach(function (method) {
            var methodName = method.getName();
            var overloads = gclass[methodName].overloads;
            overloads.forEach(function (overload) {
                var proto = '(';
                overload.argumentTypes.forEach(function (type) { proto += type.className + ', '; });
                if (proto.length > 1) { proto = proto.substr(0, proto.length - 2); }
                proto += ')';
                console.log('[HOOK:' + methodName + proto + ' success!]');
                overload.implementation = function () {
                    console.log('[Hooking: ' + methodName + proto + ']');
                    for (var i = 0; i < arguments.length; i++) {
                        console.log('\t[arg' + i + '] = ' + arguments[i]);
                    }
                    var ret = this[methodName].apply(this, arguments);
                    console.log('\t[return] =' + ret);
                    return ret;
                }
            })
        })
    })
})

function hook_0x2E2AC() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    if (!base_addr) {
        console.error("[-] 未能找到 libqimei.so，请确认模块已加载");
        return;
    }

    let target_addr = base_addr.add(0x2E2AC);

    Interceptor.attach(target_addr, {
        onEnter(args) {
            // 参数保存到 this 上下文以便在 onLeave 使用
            this.arg0 = args[0].toInt32();
            this.arg1 = args[1].toInt32();
        },
        onLeave(retval) {
            let logMsg = `\n[<-] 0x2E2AC | arg0: ${this.arg0} | arg1: ${this.arg1}`;

            if (retval.isNull()) {
                logMsg += ` | Return: NULL`;
            } else {
                try {
                    let result = retval.readCString();
                    logMsg += ` | Return: "${result}"`;
                } catch (e) {
                    logMsg += ` | Return: [Error Reading CString at ${retval}]`;
                    // 如果需要调试详细内存，依然可以打印 hexdump，但它无法合并进单个 string
                }
            }

            // 合并为一个 console.log 输出
            console.log(logMsg);
        }
    });
}
function hook_sub_F200() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    if (!base_addr) {
        console.error("[-] 找不到 libqimei.so");
        return;
    }

    let target_addr = base_addr.add(0xF200);
    console.log(`[+] 正在 Hook sub_F200: ${target_addr}`);

    Interceptor.attach(target_addr, {
        onEnter: function (args) {
            // 保存参数值，以便在打印时区分
            this.arg1 = args[1];
            this.arg2 = args[2];
            this.arg4 = args[4];
            this.arg5_len = args[5].toInt32(); // 长度参数

            console.log(`\n[>>>] 进入 sub_F200`);
            console.log(` arg0: ${args[0]}`);

            // 1. 打印 arg1 (16 字节)
            console.log(` arg1 (Hexdump - 16 bytes): @ ${this.arg1}`);
            console.log(hexdump(this.arg1, { length: 16, header: true, answers: true }));

            // 2. 打印 arg2 (16 字节)
            console.log(` arg2 (Hexdump - 16 bytes): @ ${this.arg2}`);
            console.log(hexdump(this.arg2, { length: 16, header: true, answers: true }));

            // 3. 打印 arg4 (长度由 arg5 决定)
            console.log(` arg4 (Hexdump - Length: ${this.arg5_len}): @ ${this.arg4}`);
            if (this.arg5_len > 0 && this.arg5_len < 4096) { // 简单的长度安全检查
                console.log(hexdump(this.arg4, { length: this.arg5_len, header: true, answers: true }));
            } else {
                console.log(` [!] arg5 长度异常或过大，跳过 dump`);
            }

            console.log(` arg3: ${args[3]} | arg6: ${args[6]}`);
        },
        onLeave: function (retval) {
            console.log(`[<<<] sub_F200 返回值: ${retval}\n`);
        }
    });
}
function hook_dlopen() {
    var android_dlopen_ext = Module.findExportByName(null, "__loader_android_dlopen_ext")
    Interceptor.attach(android_dlopen_ext, {
        onEnter: function (args) {
            var pathptr = args[0];
            // console.log("path is => ", pathptr.readCString())
            if (pathptr.readCString().indexOf("libqimei.so") >= 0) {
                console.log("libqimei.so is loading, path is => ", pathptr.readCString())
                this.hook_qimei = true;
            }
        },
        onLeave: function () {
            if (this.hook_qimei) {
                console.log("libqimei.so is loaded, start hook it");
                
                hook_0x2E2AC();//字符串解密
                hook_sub_F200();//AES加解密
                hook_popen_in_qimei()//文件设备信息读取
                hook_qimei_fgets()//文件设备信息解析
                hook_0xE090()//文件设备信息解析
                hook_0x329BC()//文件设备信息保存和获取

                hook_sub_30924()//NewStringUTF
                hook_0x356A4()//strcat主要用作sha2前参数的拼接



                restoreSha256StandardIV(0x05E750)//主动修改初始化常量为标准sha2常量确定只改了常量，逻辑没问题
                hook_0xF670()//魔改sha2，只打印参数

                hook_0x18258()//sign,sn字段的生成

                // 辅助分析
                // hook_0x122D0()

                hook_0x32E1C()//随机值生成打印
                hook_BinToHexString()

                hook_0x126F8()//字符串内容打印

                hook_Base64Decode()//base64解码
                hook_Base64Encode()//base64编码

                hook_0x419A8()//RSA加密

                hook_0xEBC0()//标准md5

                hook_0x1BDBC()//标准chacha20

                hook_0x3C618()//获取时间戳

                
                // 辅助分析
                // hook_0x1873C()
                // hook_0x18690()

                test()//第一次xor
                test1()//第二次xor

                hook_0x15764()//r函数调用时，arg0，true和false走的不同函数逻辑
            }
        }
    })
}

hook_dlopen()
function hook_popen_in_qimei() {
    let base_addr = Module.findBaseAddress("libqimei.so");
    if (!base_addr) {
        console.log("未找到 libqimei.so");
        return;
    }

    // 1. 监控你指定的偏移位置 (0x3CA08)
    Interceptor.attach(base_addr.add(0x3CA08), {
        onEnter(args) {
            console.log(`[+] 已进入偏移 0x3CA08`);
            // 这里可以根据寄存器情况打印 args[0], args[1] 等
        }
    });

    // 2. 专门 Hook popen 函数获取详细指令和结果
    // popen 定义: FILE *popen(const char *command, const char *type);
    const popenPtr = Module.findExportByName(null, "popen");

    if (popenPtr) {
        Interceptor.attach(popenPtr, {
            onEnter(args) {
                // 读取第一个参数：执行的 shell 命令
                this.command = args[0].readUtf8String();
                this.type = args[1].readUtf8String();
                console.log(`\n[popen] 执行命令: ${this.command}`);
                console.log(`[popen] 模式: ${this.type}`);
            },
            onLeave(retval) {
                // retval 是 FILE* 指针
                if (retval.isNull()) {
                    console.log(`[popen] 返回值: NULL (执行失败)`);
                } else {
                    console.log(`[popen] 返回值 (FILE*): ${retval}`);

                    /* 注意：如果你想打印 popen 执行后的具体输出内容，
                       你需要继续 hook fread 或 fgets，因为 popen 返回的是流。
                       直接在这里读取 retval 指向的内容通常没有意义。
                    */
                }
            }
        });
    } else {
        console.log("[-] 未找到 popen 符号");
    }
}

function hook_qimei_fgets() {
    let base_addr = Module.findBaseAddress("libqimei.so");
    if (!base_addr) {
        console.log("Error: 找不到 libqimei.so");
        return;
    }

    // 指向你发现的调用 fgets 的具体地址
    let fgets_call_addr = base_addr.add(0x3CF98);

    Interceptor.attach(fgets_call_addr, {
        onEnter(args) {
            // 保存 buffer 指针以便在退出时读取内容
            this.buffer = args[0];
            this.size = args[1].toInt32();
            this.stream = args[2];

            // 打印入参以便调试
            // console.log(`[fgets Enter] addr: ${this.buffer}, size: ${this.size}, stream: ${this.stream}`);
        },
        onLeave(retval) {
            // retval 如果为 0 (NULL)，表示读取结束或出错
            if (!retval.isNull()) {
                try {
                    // 从 buffer 中读取 C 字符串
                    let content = this.buffer.readUtf8String();
                    if (content) {
                        console.log(`[fgets Output]: ${content.trim()}`);
                    }
                } catch (e) {
                    // 如果不是标准的 UTF8，尝试读取十六进制数据（防止混淆数据）
                    console.log(`[fgets Output (Hex)]: ${this.buffer.readByteArray(16)}`);
                }
            }
        }
    });
    console.log(`已挂载 Hook: libqimei.so + 0x3CDD4 (fgets)`);
}

function hook_sub_30924() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    if (base_addr) {
        Interceptor.attach(base_addr.add(0x30924), {
            onEnter: function (args) {
                // 将指针转换为 UTF-8 字符串打印
                // 如果是普通 ASCII，readCString() 也可以
                let arg1_str = Memory.readCString(args[1]);
                console.log(`sub_30924 arg1: ${arg1_str}`);
            }
        });
    } else {
        console.log("未找到 libqimei.so");
    }
}

function hook_0x356A4() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    if (base_addr) {
        Interceptor.attach(base_addr.add(0x356A4), {
            onEnter(args) {
                // 安全读取 arg0
                let arg0_str = args[0].isNull() ? "NULL" : args[0].readCString();
                // 安全读取 arg1
                let arg1_str = args[1].isNull() ? "NULL" : args[1].readCString();

                console.log(`call 0x356A4 arg0: ${arg0_str}, arg1: ${arg1_str}`);
            }
        });
    } else {
        console.log("Error: libqimei.so not found");
    }
}

function hook_0x329BC() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    Interceptor.attach(base_addr.add(0x329BC), {
        onEnter(args) {
            console.log(`call 0x329BC arg0:${args[0]} arg1:${args[1]}`);
        },
        onLeave(retval) {
            // 打印返回值
            // 如果返回值是整数，直接打印 retval
            // 如果返回值是字符串指针，使用 retval.readCString()
            let result = retval.isNull() ? "NULL" : retval.readCString();
            console.log(`[-] exit 0x329BC | return: ${result}`);
        }
    });
}

function hook_0xF670() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    if (!base_addr) {
        console.error("[-] libqimei.so not found");
        return;
    }

    Interceptor.attach(base_addr.add(0xF670), {
        onEnter(args) {
            // 保存参数
            this.arg0 = args[0];
            this.arg1 = args[1].toInt32(); // 将长度转为整数
            this.arg2 = args[2];

            console.log(`\n[->] call 0xF670 | arg1 (len): ${this.arg1}`);

            // 如果长度合法且指针不为空，则进行 hexdump
            if (!this.arg0.isNull() && this.arg1 > 0) {
                console.log(`[+] arg0 hexdump (length: ${this.arg1}):`);
                console.log(hexdump(this.arg0, {
                    length: this.arg1,
                    header: true,
                    answers: true
                }));
            }
        },
        onLeave(retval) {
            console.log(`\n[<-] exit 0xF670 | retval: ${retval}`);

            // arg2 同样可以使用 arg1 作为参考长度进行 dump
            if (!this.arg2.isNull() && this.arg1 > 0) {
                console.log(`[+] arg2 hexdump (onLeave, length: ${this.arg1}):`);
                console.log(hexdump(this.arg2, {
                    length: 32,
                    header: true,
                    answers: true
                }));
            }
        }
    });
}

function restoreSha256StandardIV(offset) {
    let base_addr = Module.findBaseAddress("libqimei.so");
    if (!base_addr) return;

    // 计算 IV 在内存中的实际地址
    let iv_addr = base_addr.add(offset);

    // 标准 SHA-256 IV 常量 (8 个 32位整数)
    const standardIV = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];

    // 1. 修改权限为可读可写可执行 (rwx)
    Memory.protect(iv_addr, 32, 'rwx');

    // 2. 写入标准值
    for (let i = 0; i < standardIV.length; i++) {
        iv_addr.add(i * 4).writeU32(standardIV[i]);
    }

    console.log(`[+] 已将地址 ${iv_addr} 处的 IV 还原为标准 SHA-256 常量`);
}


function hook_0x18258() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    Interceptor.attach(base_addr.add(0x18258), {
        onEnter(args) {
            console.log(`call 0x18258 arg0:${args[0]} arg1:${args[1]} arg2:${args[2]} arg3:${args[3]}`);
        },
        onLeave(retval) {
            console.log("sign ==> ", hexdump(retval))
        }
    });
}

function hook_0x18880() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    Interceptor.attach(base_addr.add(0x18880), {
        onEnter(args) {
            console.log(`call 0x18880 arg0:${args[0].readCString()} arg1:${args[1].readCString()}`);
        }
    });
}

function hook_0x122D0() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    Interceptor.attach(base_addr.add(0x122D0), {
        onEnter(args) {
            console.log(`call 0x122D0 arg0:${args[0]} arg1:${args[1]}`);
        },
        onLeave(retval) {
            console.log("test ==> ", hexdump(retval))
        }
    });
}

function hook_0x32E1C() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    Interceptor.attach(base_addr.add(0x32E1C), {
        onEnter(args) {
            this.length = args[0].toInt32()
            console.log(`call 0x32E1C arg0:${args[0]}`);
        },
        onLeave(retval) {
            console.log("nonce ==> ", hexdump(retval, { length: this.length }))
        }
    });
}

function hook_BinToHexString() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    Interceptor.attach(base_addr.add(0xE3DC), {
        onEnter: function (args) {
            // 保存参数
            this.src_buf = args[0]; // 第一个参数 result (二进制源数据)
            this.dst_str = args[1]; // 第二个参数 a2 (输出字符串指针)
            this.len = args[2].toInt32(); // 第三个参数 a3 (长度)

            console.log("\n[+] --- sub_E3DC Called ---");
            console.log("[*] Data Length: " + this.len);
            if (this.len > 0) {
                console.log("[*] Input Binary (HexDump):");
                console.log(hexdump(this.src_buf, { length: this.len, header: true, ansi: false }));
            }
        }, onLeave: function (retval) {
            // 函数执行完后，dst_str 指针指向的内容已被填充
            // 注意：十六进制字符串长度通常是输入字节长度的 2 倍
            var outStrLen = this.len * 2;
            try {
                var resultHex = Memory.readUtf8String(this.dst_str, outStrLen);
                console.log("[*] Output HexString: " + resultHex);
            } catch (e) {
                console.log("[!] Failed to read output string: " + e);
            }
            console.log("[+] ------------------------\n");
        }
    });
}

function hook_0xEBC0() {
    let base_addr = Module.findBaseAddress("libqimei.so");
    if (!base_addr) {
        console.error("[-] 找不到 libqimei.so，请检查模块名是否正确");
        return;
    }

    let targetAddr = base_addr.add(0xEBC0);
    console.log("[+] 正在 Hook 地址: " + targetAddr);

    Interceptor.attach(targetAddr, {
        onEnter(args) {
            // 保存参数到 'this' 上下文中，以便在 onLeave 中访问
            this.arg0 = args[0];
            this.arg1 = args[1].toInt32(); // 长度
            this.arg2 = args[2];

            console.log(`\n[>>>] 进入函数 0xEBC0`);
            console.log(`[*] 参数1 (源数据): ${this.arg0}`);
            console.log(`[*] 参数2 (长度): ${this.arg1} (0x${args[1].toString(16)})`);
            console.log(`[*] 参数3 (输出缓冲区): ${this.arg2}`);

            // 打印输入数据的 Hexdump
            if (this.arg1 > 0) {
                console.log("[*] 输入 Hexdump:");
                console.log(hexdump(this.arg0, {
                    length: this.arg1,
                    header: true,
                    ansi: false
                }));
            }
        },
        onLeave(retval) {
            console.log(`[<<<] 函数 0xEBC0 返回`);

            // 打印返回时 arg2 缓冲区的内容
            // 如果 arg2 是存储 Hex 字符串，长度通常是 arg1 * 2
            // 如果 arg2 是原始数据，长度通常就是 arg1
            // 这里我们先按 arg1 的长度打印，你可以根据实际结果调整偏移

            console.log("[*] 输出 (arg2) Hexdump:");
            console.log(hexdump(this.arg2, {
                length: 16, // 如果输出是字符串，这里可能需要调整为 this.arg1 * 2
                header: true,
                ansi: false
            }));

            console.log("------------------------------------------");
        }
    });
}

function hook_0x126F8() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    Interceptor.attach(base_addr.add(0x126F8), {
        onEnter(args) {
            console.log(`call 0x126F8 arg0:${args[0]} arg1:${args[1].readCString()}`);
        }
    });
}

function hook_Base64Decode() {
    let base_addr = Module.findBaseAddress("libqimei.so");
    let targetAddr = base_addr.add(0x1AF08);

    Interceptor.attach(targetAddr, {
        onEnter(args) {
            this.input_str = args[0];
            this.input_len = args[1].toInt32();
            this.out_len_ptr = args[2];

            console.log("\n[Base64_Decode] Entering sub_1AF08");
            console.log("[*] Input Base64 String: " + this.input_str.readUtf8String(this.input_len));
        },
        onLeave(retval) {
            if (!retval.isNull() && !this.out_len_ptr.isNull()) {
                let actualLen = this.out_len_ptr.readU32(); // 读取实际解码后的长度
                console.log("[*] Decoded Length: " + actualLen);

                // 打印解码后的二进制数据
                console.log("[*] Decoded Data (Hexdump):");
                console.log(hexdump(retval, { length: actualLen, header: true, ansi: false }));
            }
            console.log("[Base64_Decode] Leave sub_1AF08\n");
        }
    });
}

function hook_Base64Encode() {
    let base_addr = Module.findBaseAddress("libqimei.so");
    if (!base_addr) {
        console.error("[-] 无法找到 libqimei.so");
        return;
    }
    let targetAddr = base_addr.add(0x1A950);

    Interceptor.attach(targetAddr, {
        onEnter(args) {
            this.src = args[0];
            this.len = args[1].toInt32();
            this.out_len_ptr = args[2];

            console.log("\n[Base64] =========================================");
            console.log("[*] Entering sub_1A950");
            console.log("[*] Input Length: " + this.len);

            if (this.len > 0) {
                console.log("[*] Input Data:");
                console.log(hexdump(this.src, { length: this.len > 64 ? 64 : this.len, header: true }));
            }
        },
        onLeave(retval) {
            if (!retval.isNull()) {
                let encodedStr = retval.readUtf8String();
                console.log("[*] Result String: " + encodedStr);

                if (!this.out_len_ptr.isNull()) {
                    // 注意：根据之前的汇编，这里可能是 readU32 或 readU64，请观察输出确认
                    console.log("[*] Encoded Length: " + this.out_len_ptr.readU32());
                }
            }
            console.log("[Base64] Leave sub_1A950\n");
        }
    });
}

function hook_0x419A8() {
    let base_addr = Module.findBaseAddress("libqimei.so");
    if (!base_addr) {
        console.error("[-] 找不到 libqimei.so");
        return;
    }

    let targetAddr = base_addr.add(0x419A8);

    Interceptor.attach(targetAddr, {
        onEnter(args) {
            // 根据你的分析重新定义参数含义
            this.publicKeyPtr = args[0];  // RSA 公钥 (DER 编码)
            this.keyLen = args[1].toInt32(); // 公钥长度
            this.plainTextPtr = args[2];  // 真正的明文 (待加密内容)
            this.plainLen = args[3].toInt32(); // 明文长度 (通常是 0x20)
            this.outputPtr = args[4];     // 结果存放缓冲区

            console.log("\n" + "=".repeat(60));
            console.log("[+] 进入 sub_419A8 (RSA_Encrypt 包装函数)");
            console.log(`[*] 公钥地址: ${this.publicKeyPtr}, 长度: ${this.keyLen}`);
            console.log(`[*] 明文地址: ${this.plainTextPtr}, 长度: ${this.plainLen}`);
            console.log(`[*] 密文输出地址: ${this.outputPtr}`);

            // 1. 打印公钥 (确认是否为 DER 编码)
            if (this.keyLen > 0) {
                console.log("[*] RSA 公钥 Dump (DER Format):");
                console.log(hexdump(this.publicKeyPtr, { length: this.keyLen, header: true, ansi: false }));
            }

            // 2. 打印真正要加密的内容 (比如 32 字节密钥)
            if (this.plainLen > 0) {
                console.log("[*] 待加密明文 Dump:");
                console.log(hexdump(this.plainTextPtr, { length: this.plainLen, header: true, ansi: false }));
            }

            // 3. 打印调用栈 (按需开启，如果不关注调用源可注释掉)
            // console.log("[*] 调用栈:\n" + Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join("\n"));
        }
    });
}

function hook_0x1BDBC() {
    let base_addr = Module.findBaseAddress("libqimei.so");
    if (!base_addr) return;

    let targetAddr = base_addr.add(0x1BDBC);

    Interceptor.attach(targetAddr, {
        onEnter(args) {
            // 保存参数以便在 onLeave 中使用
            this.arg0 = args[0];
            this.arg1 = args[1].toInt32();
            this.seed = args[2]; // 这是你提到的 0x65a4e57fef44a2a3
            this.arg3 = args[3];
            this.arg4 = args[4].toInt32(); // 长度 16

            console.log("\n" + "=".repeat(60));
            console.log("[+] Entering sub_1BDBC (Key/IV Component Derivation)");
            console.log(`[*] Seed (Arg2): ${this.seed}`);
            console.log(`[*] Output Buffer (Arg3): ${this.arg3}, Length (Arg4): ${this.arg4}`);

            // 1. Dump Arg0 的内容 (输入源1)
            if (!this.arg0.isNull() && this.arg1 > 0) {
                console.log(`[*] Arg0 Hexdump (Len: ${this.arg1}):`);
                console.log(hexdump(this.arg0, { length: this.arg1, header: true, ansi: false }));
            }
        },
        onLeave(retval) {
            // 2. Dump Arg3 的内容 (生成的 16 字节结果)
            if (!this.arg3.isNull() && this.arg4 > 0) {
                console.log(`[*] Arg3 Hexdump (Generated Result, Len: ${this.arg4}):`);
                console.log(hexdump(this.arg3, { length: this.arg4, header: true, ansi: false }));
            }

            // --- 新增：对返回值 retval 指针进行 hexdump ---
            if (!retval.isNull()) {
                console.log(`[*] Return Value (Pointer: ${retval}) Hexdump (Len: 16):`);
                try {
                    console.log(hexdump(retval, { length: 16, header: true, ansi: false }));
                } catch (e) {
                    console.log(`[!] Failed to hexdump retval: ${e.message}`);
                }
            } else {
                console.log("[*] Return Value is NULL");
            }

            console.log(`[+] sub_1BDBC Return Value (Raw): ${retval}`);
            console.log("=".repeat(60) + "\n");
        }
    });
}

function hook_0x3C618() {
    let base_addr = Module.findBaseAddress("libqimei.so");
    if (!base_addr) return;

    let targetAddr = base_addr.add(0x3C618);

    Interceptor.attach(targetAddr, {
        onEnter(args) {
            // 无参数
        },
        onLeave(retval) {

            console.log(`\n[+] sub_3C618 (GetTimestampMs) 返回值: ${retval}`);

            console.log(`---`);
        }
    });
}

function hook_0xE090() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    Interceptor.attach(base_addr.add(0x3CF1C), {
        onEnter(args) {
            let haystack = args[0].readCString(); // 被检索的源字符串
            let needle = args[1].readCString();   // 正在查找的关键子串

            // 过滤掉一些无关的匹配，专注于路径或标识符
            // if (needle.indexOf("uuid") !== -1 || needle.indexOf("boot") !== -1 || haystack.indexOf("/sys/") !== -1) {
            console.log(`[strstr] 发现匹配行为!`);
            console.log(`源字符串: ${haystack}`);
            console.log(`查找内容: ${needle}`);
            console.log(`-----------------------------------`);
            // }
        }
    });
}

function test() {
    let base_addr = Module.findBaseAddress("libqimei.so");
    Interceptor.attach(base_addr.add(0x18788), {
        onEnter: function (args) {
            // 在 STRB 执行前，W9 已经存储了 EOR 的计算结果
            // W10 依然保持着之前 LDRB 加载的值

            const w9 = this.context.x9.and(0xFF);  // LDRB 操作的是单字节，取低8位
            const w10 = this.context.x10.and(0xFF);

            // 由于 EOR W9, W10, W9 会覆盖 W9，
            // 如果你想知道“原始的” W9（即 LDRB W9, [X9] 的结果），
            // 逻辑上它等于：当前W9 ^ 当前W10
            const originalW9 = w9.xor(w10).and(0xFF);

            console.log("--- Hook Log ---");
            console.log(`[+] W10 (LDRB 1): 0x${w10.toString(16)}`);
            console.log(`[+] W9 (LDRB 2) : 0x${originalW9.toString(16)}`);
            console.log(`[+] EOR Result  : 0x${w9.toString(16)}`);
        }
    });
}

function hook_0x1878C() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    Interceptor.attach(base_addr.add(0x1878C), {
        onEnter(args) {
            console.log(`call 0x1878C ${JSON.stringify(this.context.x9)}`);
        }
    });
}

function hook_0x1873C() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    Interceptor.attach(base_addr.add(0x1873C), {
        onEnter(args) {
            console.log(`call 0x1873C ${JSON.stringify(this.context.x10)}`);
        }
    });
}

function test1() {
    let base_addr = Module.findBaseAddress("libqimei.so");
    Interceptor.attach(base_addr.add(0x18690), {
        onEnter: function (args) {
            // 在 STRB 执行前，W9 已经存储了 EOR 的计算结果
            // W10 依然保持着之前 LDRB 加载的值

            const w9 = this.context.x9.and(0xFF);  // LDRB 操作的是单字节，取低8位
            const w10 = this.context.x10.and(0xFF);

            // 由于 EOR W9, W10, W9 会覆盖 W9，
            // 如果你想知道“原始的” W9（即 LDRB W9, [X9] 的结果），
            // 逻辑上它等于：当前W9 ^ 当前W10
            const originalW9 = w9.xor(w10).and(0xFF);

            console.log("--- Hook Log ---");
            console.log(`[+] W10 (LDRB 1): 0x${w10.toString(16)}`);
            console.log(`[+] W9 (LDRB 2) : 0x${originalW9.toString(16)}`);
            console.log(`[+] EOR Result  : 0x${w9.toString(16)}`);
        }
    });
}


function hook_0x15764() {
    let base_addr = Module.findBaseAddress("libqimei.so");

    Interceptor.attach(base_addr.add(0x15764), {
        onEnter(args) {
            console.log(`call 0x15764 arg0:${args[0]} arg1:${args[1]}`);
        }
    });
}