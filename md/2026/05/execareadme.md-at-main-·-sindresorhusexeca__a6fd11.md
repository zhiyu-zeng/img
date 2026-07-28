---
title: execa/readme.md at main · sindresorhus/execa
source: https://github.com/sindresorhus/execa/blob/main/readme.md
source_host: github.com
clip_date: 2026-05-12T14:13:49+08:00
trace_id: b2cba70c-a6d3-4994-a70e-55202e901d57
content_hash: 9b3024664a42b2ed13fadc98faaf411e346d9294c274495ba2a19e85756d4145
status: synced
tags:
  - GitHub
  - 安全工具
  - 漏洞分析
series: null
ai_summary: |-
  execa 是一个优化的 Node.js 进程执行库，提供简单语法和避免 shell 注入的功能，用于在脚本和应用中安全运行命令。

  - **安装命令：** 使用 `npm install execa` 安装该库，基于 Node.js 的 `child_process` 模块构建。
  - **语法与安全：** 采用模板字符串和 Promise 语法，无需手动转义或引用命令，有效防止 shell 注入风险。
  - **跨平台支持：** 改进 Windows 兼容性，包括处理 shebangs、PATHEXT 环境变量和优雅终止功能。
  - **输入输出灵活性：** 支持文件、字符串、流、二进制数据等多种输入类型，输出可分割为文本行、重定向到文件或进行转换过滤。
  - **高级用法：** 支持管道多个子进程、进程间消息交换、优雅终止以及详细错误报告，便于调试和复杂任务处理。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3ab75244-d011-8129-9e0c-d4df429474ec
---

> 💡 **AI 总结（key-points）**
>
> execa 是一个优化的 Node.js 进程执行库，提供简单语法和避免 shell 注入的功能，用于在脚本和应用中安全运行命令。
> 
> - **安装命令：** 使用 `npm install execa` 安装该库，基于 Node.js 的 `child_process` 模块构建。
> - **语法与安全：** 采用模板字符串和 Promise 语法，无需手动转义或引用命令，有效防止 shell 注入风险。
> - **跨平台支持：** 改进 Windows 兼容性，包括处理 shebangs、PATHEXT 环境变量和优雅终止功能。
> - **输入输出灵活性：** 支持文件、字符串、流、二进制数据等多种输入类型，输出可分割为文本行、重定向到文件或进行转换过滤。
> - **高级用法：** 支持管道多个子进程、进程间消息交换、优雅终止以及详细错误报告，便于调试和复杂任务处理。

![execa logo](https://github.com/sindresorhus/execa/raw/main/media/logo.svg)

[![Coverage Status](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/05/b87ca28c83b96c9c.bin)](https://codecov.io/gh/sindresorhus/execa)

> Process execution for humans

* * *

[Sindre's open source work is supported by the community](https://github.com/sponsors/sindresorhus)

Special thanks to:  
  
[![CodeRabbit logo](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/05/c511ebaaccd83e6a.png)](https://coderabbit.ai/?utm_source=sindre&utm_medium=execa)  
  
[

![KRUU logo](https://camo.githubusercontent.com/0747e8997dbb22348092402ffd2717e2cbe7980bf64f742a3c0109e5e778c450/68747470733a2f2f73696e647265736f726875732e636f6d2f6173736574732f7468616e6b732f6b7275752d6c6f676f2d6c696768742e7376673f79)

](https://kruu.com/)  
  
[

![Depot logo](https://camo.githubusercontent.com/ab8813a90486b6a95520d3d2d7516eaeadac9fa75678b60f7d497140e4d5eba3/68747470733a2f2f73696e647265736f726875732e636f6d2f6173736574732f7468616e6b732f6465706f742d6c6f676f2d6c696768742e737667)

**Fast remote container builds and GitHub Actions runners.**](https://depot.dev/?utm_source=github&utm_medium=sindresorhus)  

* * *

Execa runs commands in your script, application or library. Unlike shells, it is [optimized](https://github.com/sindresorhus/execa/blob/main/docs/bash.md) for programmatic usage. Built on top of the [`child_process`](https://nodejs.org/api/child_process.html) core module.

## Features

-   [Simple syntax](#simple-syntax): promises and [template strings](https://github.com/sindresorhus/execa/blob/main/docs/execution.md#template-string-syntax), like [`zx`](https://github.com/sindresorhus/execa/blob/main/docs/bash.md).
-   [Script](#script) interface.
-   [No escaping](https://github.com/sindresorhus/execa/blob/main/docs/escaping.md) nor quoting needed. No risk of shell injection.
-   Execute [locally installed binaries](#local-binaries) without `npx`.
-   Improved [Windows support](https://github.com/sindresorhus/execa/blob/main/docs/windows.md): [shebangs](https://github.com/sindresorhus/execa/blob/main/docs/windows.md#shebang), [`PATHEXT`](https://ss64.com/nt/path.html#pathext), [graceful termination](#graceful-termination), [and more](https://github.com/moxystudio/node-cross-spawn?tab=readme-ov-file#why).
-   [Detailed errors](#detailed-error), [verbose mode](#verbose-mode) and [custom logging](#custom-logging), for [debugging](https://github.com/sindresorhus/execa/blob/main/docs/debugging.md).
-   [Pipe multiple subprocesses](#pipe-multiple-subprocesses) better than in shells: retrieve [intermediate results](https://github.com/sindresorhus/execa/blob/main/docs/pipe.md#result), use multiple [sources](https://github.com/sindresorhus/execa/blob/main/docs/pipe.md#multiple-sources-1-destination) / [destinations](https://github.com/sindresorhus/execa/blob/main/docs/pipe.md#1-source-multiple-destinations), [unpipe](https://github.com/sindresorhus/execa/blob/main/docs/pipe.md#unpipe).
-   [Split](#split-into-text-lines) the output into text lines, or [iterate](#iterate-over-text-lines) progressively over them.
-   Strip [unnecessary newlines](https://github.com/sindresorhus/execa/blob/main/docs/lines.md#newlines).
-   Pass any [input](https://github.com/sindresorhus/execa/blob/main/docs/input.md) to the subprocess: [files](#file-input), [strings](#simple-input), [`Uint8Array` s](https://github.com/sindresorhus/execa/blob/main/docs/binary.md#binary-input), [iterables](https://github.com/sindresorhus/execa/blob/main/docs/streams.md#iterables-as-input), [objects](https://github.com/sindresorhus/execa/blob/main/docs/transform.md#object-mode) and almost any [other type](#any-input-type).
-   Return [almost any type](#any-output-type) from the subprocess, or redirect it to [files](#file-output).
-   Get [interleaved output](#interleaved-output) from `stdout` and `stderr` similar to what is printed on the terminal.
-   Retrieve the output [programmatically and print it](#programmatic--terminal-output) on the console at the same time.
-   [Transform or filter](#transformfilter-output) the input and output with [simple functions](https://github.com/sindresorhus/execa/blob/main/docs/transform.md).
-   Pass [Node.js streams](https://github.com/sindresorhus/execa/blob/main/docs/streams.md#nodejs-streams) or [web streams](#web-streams) to subprocesses, or [convert](#convert-to-duplex-stream) subprocesses to [a stream](https://github.com/sindresorhus/execa/blob/main/docs/streams.md#converting-a-subprocess-to-a-stream).
-   [Exchange messages](#exchange-messages) with the subprocess.
-   Ensure subprocesses exit even when they [intercept termination signals](https://github.com/sindresorhus/execa/blob/main/docs/termination.md#forceful-termination), or when the current process [ends abruptly](https://github.com/sindresorhus/execa/blob/main/docs/termination.md#current-process-exit).

## Install

```
npm install execa
```

## Documentation

Execution:

-   ▶️
    
    [Basic execution](https://github.com/sindresorhus/execa/blob/main/docs/execution.md)
-   💬 [Escaping/quoting](https://github.com/sindresorhus/execa/blob/main/docs/escaping.md)
-   💻 [Shell](https://github.com/sindresorhus/execa/blob/main/docs/shell.md)
-   📜 [Scripts](https://github.com/sindresorhus/execa/blob/main/docs/scripts.md)
-   🐢 [Node.js files](https://github.com/sindresorhus/execa/blob/main/docs/node.md)
-   🌐 [Environment](https://github.com/sindresorhus/execa/blob/main/docs/environment.md)
-   ❌ [Errors](https://github.com/sindresorhus/execa/blob/main/docs/errors.md)
-   🏁 [Termination](https://github.com/sindresorhus/execa/blob/main/docs/termination.md)

Input/output:

-   🎹 [Input](https://github.com/sindresorhus/execa/blob/main/docs/input.md)
-   📢 [Output](https://github.com/sindresorhus/execa/blob/main/docs/output.md)
-   📃 [Text lines](https://github.com/sindresorhus/execa/blob/main/docs/lines.md)
-   🤖 [Binary data](https://github.com/sindresorhus/execa/blob/main/docs/binary.md)
-   🧙 [Transforms](https://github.com/sindresorhus/execa/blob/main/docs/transform.md)

Advanced usage:

-   🔀 [Piping multiple subprocesses](https://github.com/sindresorhus/execa/blob/main/docs/pipe.md)
-   ⏳️ [Streams](https://github.com/sindresorhus/execa/blob/main/docs/streams.md)
-   📞 [Inter-process communication](https://github.com/sindresorhus/execa/blob/main/docs/ipc.md)
-   🐛 [Debugging](https://github.com/sindresorhus/execa/blob/main/docs/debugging.md)
-   📎 [Windows](https://github.com/sindresorhus/execa/blob/main/docs/windows.md)
-   🔍 [Difference with Bash and zx](https://github.com/sindresorhus/execa/blob/main/docs/bash.md)
-   🐭 [Small packages](https://github.com/sindresorhus/execa/blob/main/docs/small.md)
-   🤓 [TypeScript](https://github.com/sindresorhus/execa/blob/main/docs/typescript.md)
-   📔 [API reference](https://github.com/sindresorhus/execa/blob/main/docs/api.md)

## Examples

### Execution

#### Simple syntax

```
import {execa} from 'execa';

const {stdout} = await execa`npm run build`;
// Print command's output
console.log(stdout);
```

#### Script

```
import {$} from 'execa';

const {stdout: name} = await $`cat package.json`.pipe`grep name`;
console.log(name);

const branch = await $`git branch --show-current`;
await $`dep deploy --branch=${branch}`;

await Promise.all([
    $`sleep 1`,
    $`sleep 2`,
    $`sleep 3`,
]);

const directoryName = 'foo bar';
await $`mkdir /tmp/${directoryName}`;
```

#### Local binaries

```
$ npm install -D eslint
```

```
await execa({preferLocal: true})`eslint`;
```

#### Pipe multiple subprocesses

```
const {stdout, pipedFrom} = await execa`npm run build`
    .pipe`sort`
    .pipe`head -n 2`;

// Output of `npm run build | sort | head -n 2`
console.log(stdout);
// Output of `npm run build | sort`
console.log(pipedFrom[0].stdout);
// Output of `npm run build`
console.log(pipedFrom[0].pipedFrom[0].stdout);
```

### Input/output

#### Interleaved output

```
const {all} = await execa({all: true})`npm run build`;
// stdout + stderr, interleaved
console.log(all);
```

#### Programmatic + terminal output

```
const {stdout} = await execa({stdout: ['pipe', 'inherit']})`npm run build`;
// stdout is also printed to the terminal
console.log(stdout);
```

#### Simple input

```
const getInputString = () => { /* ... */ };
const {stdout} = await execa({input: getInputString()})`sort`;
console.log(stdout);
```

#### File input

```
// Similar to: npm run build < input.txt
await execa({stdin: {file: 'input.txt'}})`npm run build`;
```

#### File output

```
// Similar to: npm run build > output.txt
await execa({stdout: {file: 'output.txt'}})`npm run build`;
```

#### Split into text lines

```
const {stdout} = await execa({lines: true})`npm run build`;
// Print first 10 lines
console.log(stdout.slice(0, 10).join('\n'));
```

### Streaming

#### Iterate over text lines

```
for await (const line of execa`npm run build`) {
    if (line.includes('WARN')) {
        console.warn(line);
    }
}
```

#### Transform/filter output

```
let count = 0;

// Filter out secret lines, then prepend the line number
const transform = function * (line) {
    if (!line.includes('secret')) {
        yield `[${count++}] ${line}`;
    }
};

await execa({stdout: transform})`npm run build`;
```

#### Web streams

```
const response = await fetch('https://example.com');
await execa({stdin: response.body})`sort`;
```

#### Convert to Duplex stream

```
import {execa} from 'execa';
import {pipeline} from 'node:stream/promises';
import {createReadStream, createWriteStream} from 'node:fs';

await pipeline(
    createReadStream('./input.txt'),
    execa`node ./transform.js`.duplex(),
    createWriteStream('./output.txt'),
);
```

### IPC

#### Exchange messages

```
// parent.js
import {execaNode} from 'execa';

const subprocess = execaNode`child.js`;
await subprocess.sendMessage('Hello from parent');
const message = await subprocess.getOneMessage();
console.log(message); // 'Hello from child'
```

```
// child.js
import {getOneMessage, sendMessage} from 'execa';

const message = await getOneMessage(); // 'Hello from parent'
const newMessage = message.replace('parent', 'child'); // 'Hello from child'
await sendMessage(newMessage);
```

#### Any input type

```
// main.js
import {execaNode} from 'execa';

const ipcInput = [
    {task: 'lint', ignore: /test\.js/},
    {task: 'copy', files: new Set(['main.js', 'index.js']),
}];
await execaNode({ipcInput})`build.js`;
```

```
// build.js
import {getOneMessage} from 'execa';

const ipcInput = await getOneMessage();
```

#### Any output type

```
// main.js
import {execaNode} from 'execa';

const {ipcOutput} = await execaNode`build.js`;
console.log(ipcOutput[0]); // {kind: 'start', timestamp: date}
console.log(ipcOutput[1]); // {kind: 'stop', timestamp: date}
```

```
// build.js
import {sendMessage} from 'execa';

const runBuild = () => { /* ... */ };

await sendMessage({kind: 'start', timestamp: new Date()});
await runBuild();
await sendMessage({kind: 'stop', timestamp: new Date()});
```

#### Graceful termination

```
// main.js
import {execaNode} from 'execa';

const controller = new AbortController();
setTimeout(() => {
    controller.abort();
}, 5000);

await execaNode({
    cancelSignal: controller.signal,
    gracefulCancel: true,
})`build.js`;
```

```
// build.js
import {getCancelSignal} from 'execa';

const cancelSignal = await getCancelSignal();
const url = 'https://example.com/build/info';
const response = await fetch(url, {signal: cancelSignal});
```

### Debugging

#### Detailed error

```
import {execa, ExecaError} from 'execa';

try {
    await execa`unknown command`;
} catch (error) {
    if (error instanceof ExecaError) {
        console.log(error);
    }
    /*
    ExecaError: Command failed with ENOENT: unknown command
    spawn unknown ENOENT
            at ...
            at ... {
        shortMessage: 'Command failed with ENOENT: unknown command\nspawn unknown ENOENT',
        originalMessage: 'spawn unknown ENOENT',
        command: 'unknown command',
        escapedCommand: 'unknown command',
        cwd: '/path/to/cwd',
        durationMs: 28.217566,
        failed: true,
        timedOut: false,
        isCanceled: false,
        isTerminated: false,
        isMaxBuffer: false,
        code: 'ENOENT',
        stdout: '',
        stderr: '',
        stdio: [undefined, '', ''],
        pipedFrom: []
        [cause]: Error: spawn unknown ENOENT
                at ...
                at ... {
            errno: -2,
            code: 'ENOENT',
            syscall: 'spawn unknown',
            path: 'unknown',
            spawnargs: [ 'command' ]
        }
    }
    */
}
```

#### Verbose mode

```
await execa`npm run build`;
await execa`npm run test`;
```

[![execa verbose output](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/05/d2587a64088d281d.png)](https://github.com/sindresorhus/execa/blob/main/media/verbose.png)

#### Custom logging

```
import {execa as execa_} from 'execa';
import {createLogger, transports} from 'winston';

// Log to a file using Winston
const transport = new transports.File({filename: 'logs.txt'});
const logger = createLogger({transports: [transport]});
const LOG_LEVELS = {
    command: 'info',
    output: 'verbose',
    ipc: 'verbose',
    error: 'error',
    duration: 'info',
};

const execa = execa_({
    verbose(verboseLine, {message, ...verboseObject}) {
        const level = LOG_LEVELS[verboseObject.type];
        logger[level](message, verboseObject);
    },
});

await execa`npm run build`;
await execa`npm run test`;
```
