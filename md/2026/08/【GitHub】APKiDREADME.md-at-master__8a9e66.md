---
title: 【GitHub】APKiD/README.md at master
source: https://github.com/rednaga/APKiD/blob/master/README.md
source_host: github.com
clip_date: 2026-08-14T17:23:00+08:00
trace_id: bc0b29b3-e9fb-42db-a718-388d0c94fc76
content_hash: ffb3a7c196faba408aca42b38a98128c20274fbb7d64cea42227815ba7885da7
status: synced
tags:
  - GitHub
  - Android逆向
  - 安全工具
series: null
feed_source: null
ai_summary: APKiD 是通过 YARA 规则识别 APK/DEX 编译器、加壳与混淆特征的 Android 版 PEiD 工具，支持命令行与 Docker 使用。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3bc75244-d011-814f-863e-c7a02674dce1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> APKiD 是通过 YARA 规则识别 APK/DEX 编译器、加壳与混淆特征的 Android 版 PEiD 工具，支持命令行与 Docker 使用。
> 
> - **定位：** 定位为“Android 版 PEiD”，用于识别 APK/DEX 的编译器、加壳、混淆器及其他异常特征；相关演讲覆盖编译指纹、盗版/恶意应用检测、AppShielding 与移动 RASP SDK 识别。
> - **安装与运行：** 通过 `pip install apkid` 安装；支持 Docker（构建后运行 `docker/apkid.sh`），扫描输出示例识别 `classes.dex` 的编译器为 `dx`。
> - **命令行选项：** 提供超时（`-t`）、递归目录（`-r`）、嵌套压缩包扫描深度（`--scan-depth`）、最大 zip entry 扫描大小、按 magic/filename 决定扫描类型，以及 JSON 输出（`-j`）和输出目录（`-o`）。
> - **规则贡献：** 遇到未识别 APK/DEX 时通过 GitHub issue 提交文件哈希与猜测类型；接受加壳/编译器/混淆器之外的反汇编、反 VM 等检测规则 PR，须附带样例哈希验证。
> - **许可与开发：** 采用商业许可与 GPL 双许可；开发时克隆仓库后运行 `python prep-release.py` 并 `pip install -e .[dev,test]`（可加 `--user`），修改规则后需重新运行 `prep-release.py` 编译规则；Windows 需先卸载旧 Yara 并安装 yara-python 3.11.0 及 MobSF 的 yara-python-dex。

## APKiD

APKiD gives you information about how an APK was made. It identifies many compilers, packers, obfuscators, and other weird stuff. It's [*PEiD*](https://www.aldeid.com/wiki/PEiD) for Android.

[![Screen Shot 2019-05-07 at 10 55 00 AM](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6b02cbe6aecaf08d.png)](https://user-images.githubusercontent.com/1356658/57322793-49be9c00-70b9-11e9-84da-1e64d9459a8a.png)

For more information on what this tool can be used for, check out:

-   [Android Compiler Fingerprinting](http://hitcon.org/2016/CMT/slide/day1-r0-e-1.pdf)
-   [Detecting Pirated and Malicious Android Apps with APKiD](http://rednaga.io/2016/07/31/detecting_pirated_and_malicious_android_apps_with_apkid/)
-   [APKiD: PEiD for Android Apps (BlackHat EU/UK Arsenal 2018)](https://github.com/enovella/cve-bio-enovella/blob/master/slides/bheu18-enovella-APKID.pdf)
-   [APKiD: Fast Identification of AppShielding Products](https://github.com/enovella/cve-bio-enovella/blob/master/slides/APKiD-NowSecure-Connect19-enovella.pdf)
-   [APKiD: Fast Identification of Mobile RASP SDKs (BlackHat USA Arsenal 2023)](https://github.com/enovella/cve-bio-enovella/blob/master/slides/bheu23-enovella-APKID.pdf)

## Installing

```bash
pip install apkid
```

### Docker

You can also run APKiD with [Docker](https://www.docker.com/community-edition)! Of course, this requires that you have git and Docker installed.

Here's how to use Docker:

```bash
git clone https://github.com/rednaga/APKiD
cd APKiD/
docker build . -t rednaga:apkid
docker/apkid.sh ~/reverse/targets/android/example/example.apk
[+] APKiD 2.1.0 :: from RedNaga :: rednaga.io
[*] example.apk!classes.dex
 |-> compiler : dx
```

## Usage

```lua
usage: apkid [-h] [-v] [-t TIMEOUT] [-r] [--scan-depth SCAN_DEPTH]
             [--entry-max-scan-size ENTRY_MAX_SCAN_SIZE] [--typing {magic,filename,none}] [-j]
             [-o DIR]
             [FILE [FILE ...]]

APKiD - Android Application Identifier v2.1.2

positional arguments:
  FILE                                       apk, dex, or directory

optional arguments:
  -h, --help                                 show this help message and exit
  -v, --verbose                              log debug messages

scanning:
  -t TIMEOUT, --timeout TIMEOUT              Yara scan timeout (in seconds)
  -r, --recursive                            recurse into subdirectories
  --scan-depth SCAN_DEPTH                    how deep to go when scanning nested zips
  --entry-max-scan-size ENTRY_MAX_SCAN_SIZE  max zip entry size to scan in bytes, 0 = no limit
  --typing {magic,filename,none}             method to decide which files to scan

output:
  -j, --json                                 output scan results in JSON format
  -o DIR, --output-dir DIR                   write individual results here (implies --json)
```

## Submitting New Packers / Compilers / Obfuscators

If you come across an APK or DEX which APKiD does not recognize, please open a GitHub issue and tell us:

-   what you think it is -- obfuscated, packed, etc.
-   the file hash (either MD5, SHA1, SHA256)

We are open to any type of concept you might have for "something interesting" to detect, so do not limit yourself solely to packers, compilers or obfuscators. If there is an interesting anti-disassembler, anti-vm, anti-\* trick, please make an issue.

Pull requests are welcome. If you're submitting a new rule, be sure to include a file hash of the APK / DEX so we can check the rule.

## License

This tool is available under a dual license: a commercial one suitable for closed source projects and a GPL license that can be used in open source software.

Depending on your needs, you must choose one of them and follow its policies. A detail of the policies and agreements for each license type are available in the [LICENSE.COMMERCIAL](https://github.com/rednaga/APKiD/blob/master/LICENSE.COMMERCIAL) and [LICENSE.GPL](https://github.com/rednaga/APKiD/blob/master/LICENSE.GPL) files.

## Hacking

If you want to install the latest version in order to make changes, develop your own rules, and so on, simply clone this repository, compile the rules, and install the package in editable mode:

```bash
git clone https://github.com/rednaga/APKiD
cd APKiD
python prep-release.py
pip install -e .[dev,test]
```

If the above doesn't work, due to permission errors dependent on your local machine and where Python has been installed, try specifying the `--user` flag. This is likely needed if you're not using a virtual environment:

```bash
pip install -e .[dev,test] --user
```

If you update any of the rules, be sure to run `prep-release.py` to recompile them.

If you are using Windows, uninstall any previous versions of Yara and install Yara 3.11.0 and yara-python-dex before compiling

```bash
pip uninstall -y yara-python yara-python-dex
pip install yara-python==3.11.0 wheel
pip wheel --wheel-dir=yara-python-dex git+https://github.com/MobSF/yara-python-dex.git
pip install --no-index --find-links=yara-python-dex yara-python-dex
```

## For Package Maintainers

When releasing a new version, make sure the version has been updated in [apkid/ **init**.py](https://github.com/rednaga/APKiD/blob/master/apkid/__init__.py).

As for running tests, check out [.travis.yml](https://github.com/rednaga/APKiD/blob/master/.travis.yml) to see how the dev and test environments are setup and tests are run.

Update the compiled rules, the readme, build the package and upload to PyPI:

```
./prep-release.py readme
rm -f dist/*
python setup.py sdist bdist_wheel
twine upload --repository-url https://upload.pypi.org/legacy/ dist/*
```

For more information see [Packaging Projects](https://packaging.python.org/tutorials/packaging-projects/).
