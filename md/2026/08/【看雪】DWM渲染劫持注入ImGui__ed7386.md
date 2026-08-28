---
title: 【看雪】DWM渲染劫持注入ImGui
source: https://bbs.kanxue.com/thread-292797.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-28T11:30:12+08:00
trace_id: af3aca04-8f6f-4fa7-b485-075989368a44
content_hash: adfa844727c5ae969c22dc75aba7907b11a2b14d0755e96db5a064f60bd44b68
status: synced
tags:
  - 看雪
  - Windows逆向
  - DWM注入
series: null
feed_source: 看雪·逆向工程
ai_summary: DWM进程不走常规Present路径，需Hook CDXGISwapChain::PresentDWM注入ImGui；该方法在虚拟机正常，物理机因DWM未创建CDXGISwapChain实例而失效。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3ca75244-d011-81a9-ba0f-eef53df61aca
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> DWM进程不走常规Present路径，需Hook CDXGISwapChain::PresentDWM注入ImGui；该方法在虚拟机正常，物理机因DWM未创建CDXGISwapChain实例而失效。
> 
> - **常规方案局限：** D3D11渲染劫持通常Hook CDXGISwapChain::Present，通过thiscall获取实例指针并初始化ImGui；但DWM桌面合成不走这条公开调用路径。
> - **断点定位：** 使用WinDbg双机调试，切换dwm进程上下文后对多个dxgi函数下断点，确认DWM仅执行CDXGISwapChain::PresentDWM和PresentImpl。
> - **Hook对象：** 选择Hook CDXGISwapChain::PresentDWM（含9个参数），通过特征码定位函数，win10 22h2与win11 25h2均可使用。
> - **注入流程：** Hook回调中通过GetDevice/GetBuffer初始化ImGui DX11后端，创建RenderTargetView，绘制前景DrawList后调用原函数；如需鼠标交互还需安装全局鼠标钩子。
> - **物理机失效原因：** 物理机dwm进程没有创建CDXGISwapChain类实例对象，未走CDXGISwapChain流程，作者推测是显卡驱动原因。

## 一、前言

在 Direct3D 11 渲染劫持的常见方案中，核心实现方式是 Hook **CDXGISwapChain::Present** 方法。CDXGISwapChain 是 DXGI 交换链的内部 C++ 实现类，其中的成员函数遵循 thiscall 调用约定，首参数隐式传递指向类实例的 this 指针。成功劫持该函数后，就可以获取到实例指针完成 ImGui 渲染上下文初始化，注入自定义绘制逻辑。

但是，DWM进程采用独立的桌面合成渲染管线，其帧提交与合成逻辑并不经过 **CDXGISwapChain::Present** 这一公开调用路径，常规的 Present 劫持手段对 DWM 进程不生效。

## 二、IDA分析dxgi.dll

将dxgi.dll拖入IDA，函数列表中搜索CDXGISwapChain::Present

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f8291f150428fab0.webp)

其中 **CDXGISwapChain::PresentImplCore** 被 **CDXGISwapChain::PresentImpl** 调用

**CDXGISwapChain::PresentMultiplaneOverlayInternal** 被 **CDXGISwapChain::PresentMultiplaneOverlay** 调用

想要找到DWM调用了哪些函数，我的方法是给这些函数都下断点，但是DWM进程是桌面窗口管理器，DWM被暂停后整个桌面画面也会暂停

## 三、双机调试

1\. WinDbg附加到虚拟机后需要Break后才能输入指令

**!process 0 0 dwm.exe**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9e2ce48b270a80b9.webp)

2\. 我们将进程上下文切换到dwm.exe，使用.process /i <PROCESS>

**.process /i ffffe10bbdfa4080**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/723571469a89ae68.webp)

3\. 这里提示我们需要继续执行以切换上下文。使用 g 继续执行，上下文就来到了dwm进程空间

然后我们需要使用 **.reload /f dxgi.dll** 加载符号 可以使用 **lm m dxgi** 查看符号是否加载成功

4.现在可以直接给函数下断点了

**bp dxgi!CDXGISwapChain::PresentBuffer**

**bp dxgi!CDXGISwapChain::PresentDWM**

**bp dxgi!CDXGISwapChain::PresentImpl**

**bp dxgi!CDXGISwapChain::PresentMultiplaneOverlay**

**bp dxgi!CDXGISwapChain::PresentFullscreenFlip**

之后一直使用 g 继续执行，看哪些函数被断下来了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4fa1bebc967125d5.webp)

最终dwm只执行了 **CDXGISwapChain::PresentDWM** 和 **CDXGISwapChain::PresentImpl** 这两个函数

## 四、挂钩函数

我们选择对 **CDXGISwapChain::PresentDWM** 进行Hook，函数原型为

\_int64 \__fastcall CDXGISwapChain::PresentDWM(

CDXGISwapChain \*this,

int a2,

unsigned int a3,

int a4,

const struct tagRECT \*a5,

unsigned int a6,

const struct DXGI_SCROLL_RECT \*a7,

struct IDXGIResource \*a8,

unsigned int a9);

1\. 寻找函数位置直接用最简单的方法：搜函数特征码

```cpp
		// CDXGISwapChain::PresentDWM 函数特征码
		const unsigned char PresentDWM_Bytes[68] = {
			0x48, 0x89, 0x5C, 0x24, 0x10, 0x55, 0x56, 0x57,
			0x41, 0x54, 0x41, 0x55, 0x41, 0x56, 0x41, 0x57,
			0x48,			'?', '?', '?', '?', '?', '?', '?', '?',			'?', '?', '?', '?', '?', '?', '?', '?',			'?', '?', '?', '?', '?', '?', '?', '?',			'?', '?', '?', '?', '?', '?', '?', '?',			'?', '?', '?', '?', '?', '?', '?', '?',			'?', '?', '?', '?',
			0x8B,			'?', '?', '?', '?', '?',
			0x00
		};
```

经测试win10 22h2 和 win11 25h2 均可使用此特征码

2\. 对函数进行Hook后，以下是Hook回调伪代码

```cpp
static __int64 CDXGISwapChain_PresentDWM_hook(IDXGISwapChain* _this, int a2, unsigned int a3, int a4, PVOID a5, unsigned int a6, PVOID a7, PVOID a8, unsigned int a9)
{	if (!g_imguiinited)
	{		// 仅初始化一次
		g_imguiinited = true;		
		// ImGui初始化
		_this->GetDevice(__uuidof(ID3D11Device), (void**)&g_pd3dDevice);
		g_pd3dDevice->GetImmediateContext(&g_pd3dContext);		ID3D11Texture2D* buf = nullptr;		_this->GetBuffer(0, __uuidof(ID3D11Texture2D), (void**)&buf);		if (!buf)
		{
			g_imguiinited = false;			return CDXGISwapChain_PresentDWM_orig(_this, a2, a3, a4, a5, a6, a7, a8, a9);
		}

		g_pd3dDevice->CreateRenderTargetView(buf, nullptr, &view);
		buf->Release();

		ImGui::CreateContext();
		ImGui_ImplDX11_Init(g_pd3dDevice, g_pd3dContext);

		log("[+] ImGui initialized successfully\n");
	}	// 获取当前后备缓冲区
	ID3D11Texture2D* backBuffer = nullptr;	if (FAILED(_this->GetBuffer(0, __uuidof(ID3D11Texture2D), (void**)&backBuffer)))		return CDXGISwapChain_PresentDWM_orig(_this, a2, a3, a4, a5, a6, a7, a8, a9);	// 获取后备缓冲区尺寸
	D3D11_TEXTURE2D_DESC bbDesc;
	backBuffer->GetDesc(&bbDesc);	// 设置 ImGui 显示尺寸
	ImGui::GetIO().DisplaySize = ImVec2((float)bbDesc.Width, (float)bbDesc.Height);	// 释放旧 RTV 并创建新 RTV
	if (view) { view->Release(); view = nullptr; }	if (FAILED(g_pd3dDevice->CreateRenderTargetView(backBuffer, nullptr, &view)))
	{
		backBuffer->Release();		return CDXGISwapChain_PresentDWM_orig(_this, a2, a3, a4, a5, a6, a7, a8, a9);
	}
	backBuffer->Release();	// 保存原始渲染目标
	ID3D11RenderTargetView* prevRTV = nullptr;	ID3D11DepthStencilView* prevDSV = nullptr;
	g_pd3dContext->OMGetRenderTargets(1, &prevRTV, &prevDSV);	// 设置我们的渲染目标
	g_pd3dContext->OMSetRenderTargets(1, &view, nullptr);	// 开始 ImGui 帧
	ImGui_ImplDX11_NewFrame();
	ImGui::NewFrame();	// 绘制矩形
	ImDrawList* draw_list = ImGui::GetForegroundDrawList();
	draw_list->AddRectFilled(ImVec2(100, 100), ImVec2(300, 200), IM_COL32(255, 0, 0, 255));

	ImGui::Render();
	ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());	// 调用原函数
	return CDXGISwapChain_PresentDWM_orig(_this, a2, a3, a4, a5, a6, a7, a8, a9);
}
```

初始化ImGui后，就可以进行ImGui绘图了。如果需要ImGui鼠标事件与ImGui窗口交互，还需要安装全局鼠标钩子

3\. 测试效果

win11 25h2

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1264214aa61b76c1.webp)

win10 22h2

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7e20caf9cc221360.webp)

## 五、总结

**虚拟机测试正常后，然后到物理机就没有效果了。**

经过调试发现物理机dwm进程没有创建 **CDXGISwapChain** 类实例对象，也就是没有使用 **CDXGISwapChain** 类.......................

应该是显卡驱动的原因吧

新手小白，大佬嘴下留情

源码地址： [XiaoBeiik/Dwm-Injection-ImGui](https://github.com/XiaoBeiik/Dwm-Injection-ImGui)

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#系统底层](https://bbs.kanxue.com/forum-4-1-2.htm)
