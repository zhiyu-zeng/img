#include <windows.h>
#include <cstdio>
#include <cstring>

int main(int argc, char**) {
    SYSTEM_INFO info{};
    GetSystemInfo(&info);
    auto memory = static_cast<char*>(VirtualAlloc(nullptr, info.dwPageSize,
        MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE));
    if (!memory) {
        std::printf("VirtualAlloc failed: %lu\n", GetLastError());
        return 1;
    }
    const char message[] = "Hello from target.exe - ReadProcessMemory lab!";
    std::memcpy(memory, message, sizeof(message));
    std::printf("PID=%lu\nADDRESS=0x%llX\nSIZE=%zu\nTEXT=%s\n",
        GetCurrentProcessId(), reinterpret_cast<unsigned long long>(memory),
        sizeof(message), memory);
    std::printf("Reader command: reader.exe %lu 0x%llX %zu\n",
        GetCurrentProcessId(), reinterpret_cast<unsigned long long>(memory), sizeof(message));
    std::printf(argc > 1 ? "Auto mode: keeping memory alive for 60 seconds.\n"
                        : "Keep this window open. Press Enter AFTER reading to exit.\n");
    std::fflush(stdout);
    if (argc > 1) Sleep(60000);
    else (void)std::getchar();
    VirtualFree(memory, 0, MEM_RELEASE);
    return 0;
}
