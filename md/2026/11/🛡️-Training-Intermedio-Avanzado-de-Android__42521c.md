---
title: 🛡️ Training Intermedio / Avanzado de Android
source: https://cmrodriguez.me/blog/advanced-android-exploitation-es/
source_host: cmrodriguez.me
clip_date: 2026-11-09T10:21:04+08:00
trace_id: 7697f740-c118-48bc-92be-df32a63fb772
content_hash: 4d40f5adc0c1857911ba3928776c99ef4796250feec39f3e2b584a4aff204da2
status: synced
tags: []
series: null
feed_source: Cesar Rodriguez·Android/Frida
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41375244-d011-81dc-afc7-d690882ae88f
ioc: null
---

[Trainings](https://cmrodriguez.me/categories/trainings) [Android](https://cmrodriguez.me/categories/android)

## Explotacion Avanzada de Android

![Explotacion Avanzada de Android](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4540d239fb0cfc76.png)

## 🛡️ Training Intermedio / Avanzado de Android

## 🔥 ¿Qué vas a encontrar en este curso?

Un entrenamiento **profesional y práctico**, 100% enfocado en llevar tus habilidades de análisis y explotación de aplicaciones Android al siguiente nivel. Diseñado para quienes ya tienen una base y quieren ir **más allá del análisis básico**, este curso combina:

✅ Más de **40 ejercicios prácticos**, incluyendo *demos*, *PoCs* y desafíos reales.  
✅ **Clases en vivo** con expertos, vía Zoom, con intercambio de experiencias reales.  
✅ **Seguimiento personalizado** para ayudarte a resolver dudas técnicas fuera del horario de clase.  
✅ Comunidad: acceso a grupo privado para compartir avances, materiales y herramientas.

* * *

## 🧠 Requisitos

Este no es un curso para principiantes:  
✔️ Necesitás tener experiencia previa haciendo assessments de Android.  
✔️ Tener configurado un entorno con `adb` y `frida-cli`, además de un dispositivo (real o emulado) con acceso root (no obligatorio pero recomendado).  
✔️ Se espera que puedas interactuar fluidamente con tu dispositivo desde la PC.

> Si bien el soporte en tiempo real durante la clase está enfocado en los contenidos, ofrecemos **asistencia fuera de clase** para resolver dudas puntuales sobre entorno o ejecución de ejercicios.

* * *

## 🎓 Modalidad

-   Modalidad **online en vivo**, vía Zoom.
-   Clases **1 vez por semana**, de 3 a 4 horas.
-   El día y hora se coordina con los participantes según su zona horaria.
-   Cada clase incluye:
    -   Fundamentos teóricos y contexto del tema.
    -   Análisis de vulnerabilidades en código real (Kotlin y Java).
    -   Ejercicios en vivo o demostraciones prácticas.
    -   Ejercicios para resolver entre clases (opcional pero altamente recomendado).
    -   Revisión grupal de soluciones o dudas al inicio de la clase siguiente.

* * *

## 📚 Contenidos del curso

### 🔗 IPC avanzado (2 clases)

En este módulo nos enfocamos en técnicas avanzadas de abuso de IPCs, uno de los vectores más vigentes y efectivos en Android moderno.  
Ya no alcanza con buscar componentes exportados: el ataque se basa en entender cómo funciona la comunicación entre apps y qué se puede forzar desde fuera.

**Veremos:**

-   Acceso a componentes y contenidos no exportados:
    -   mediante componentes de proxy.
    -   mediante parámetros específicos en deep links.
    -   abuso de `grantUriPermissions`.
    -   robo arbitrario de archivos con path traversal.
    -   abuso de `startActivityForResult`.

* * *

### 🌐 Explotación y post-explotación en WebViews (2 clases)

Este módulo está centrado en cómo exfiltrar datos, escalar privilegios o lograr ejecución remota explotando vulnerabilidades en WebViews.

**Veremos:**

-   Condiciones reales para lograr exfiltración y RCE.
-   Variantes web alternativas a WebView y su impacto.
-   Casos de explotación no triviales aún vigentes.
-   Análisis de casos reales.
-   Ejercicios prácticos de complejidad media/alta para lograr PoCs reales.

* * *

### 🧩 Deserializaciones en Android (2 clases)

Vamos a comparar la deserialización típica en Java con la específica de Android. En Android es muy fácil triggerear una deserialización, pero lo difícil es lograr una ejecución interesante o arbitraria.

**Veremos:**

-   Cómo detectar y explotar deserializaciones.
-   Limitaciones del entorno Android.
-   Diferencias clave respecto a entornos Java tradicionales.
-   Cómo construir un chain útil para ejecución.

* * *

### 🧪 Frida para pentesters (3 clases)

Frida es una herramienta potente y flexible pero con una curva de aprendizaje importante. Este módulo te va a ayudar a usarla con confianza en entornos reales.

**Veremos:**

-   Cómo crear scripts desde cero.
-   Cómo extender y usar scripts de terceros.
-   Limitaciones reales de Frida.
-   Bypass de controles, análisis de lógica y modificación de comportamiento.
-   Herramientas útiles derivadas o basadas en Frida.

* * *

### 🤖 Automatizando el pentest con herramientas open-source (3 clases)

Un módulo pensado para mejorar la productividad durante los análisis. Veremos cómo usar herramientas libres o de código abierto para acelerar tareas comunes del pentest.

**Veremos:**

-   Uso práctico de:
    -   `nuclei`
    -   `semgrep`
    -   `androguard`
    -   `jadx` (engine)
-   Cómo automatizar workflows, crear reglas propias y extender herramientas.
-   Integración con IA para análisis de código, generación de reportes y reversing asistido.

* * *

### 💥 Técnicas de Remote Code Execution (2 clases)

En este módulo abordamos vulnerabilidades menos comunes pero de impacto crítico: ejecución remota de código.

**Veremos:**

-   Riesgos de librerías y zonas compartidas.
-   Carga dinámica de código y errores comunes.
-   Técnicas de post-explotación.
-   Cómo construir PoCs sólidos para presentar hallazgos de alto valor.

* * *

### 🧬 Reversing nativo ARM (3 clases)

Este módulo te introduce al análisis de librerías nativas en Android. No se requieren conocimientos previos en ARM.

**Veremos:**

-   Introducción a ARM 64 bits.
-   Estructura de procesos y `.so`.
-   Cómo conectar lo nativo con la capa Java.
-   Uso de Ghidra, `gdb` y `radare2` para análisis.
-   Priorización: qué mirar primero en una `.so` durante un assessment.

* * *

### 🛡️ RASP Primer (4 clases)

Las soluciones comerciales de RASP son cada vez más sofisticadas. En este módulo vamos a ver cómo entenderlas, analizarlas y superarlas.

**Veremos:**

-   Metodología de detección de controles.
-   Análisis de protecciones en Java y nativas.
-   Bypass de técnicas comunes: `PTRACE`, `Frida`, detección de root.
-   Ofuscación y deofuscación.
-   Análisis y bypass de packers.

* * *

## 💰 Costo y formas de pago

-   **2000 USD (pagable en 5 cuotas)**
-   **Descuento por pago anticipado** del total del curso.
-   **Aceptamos pagos en criptomonedas.**
-   **Para Argentina:** transferencia en pesos + factura.

* * *

## 🚀 ¿Querés reservar tu lugar?

Este curso no es teórico: es un entrenamiento **para aplicar en entornos reales**, con ejercicios, seguimiento y herramientas que usamos día a día.  
Si querés avanzar en tu carrera de pentester o analista móvil, este curso es para vos.

**Consultanos y segui las novedades en nuestro Discord: [Entra ahora](https://discord.gg/TaNjNbG58p).**
