#include <windows.h>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <limits>
#include <string>
#include <iostream>
#include <vector>

static bool ParseNumber(const char* text, unsigned long long& value) {
    if (!text || !*text || *text == '-' || *text == '+') return false;
    char* end = nullptr;
    errno = 0;
    value = std::strtoull(text, &end, 0);
    return errno == 0 && end != text && *end == '\0';
}

// Set an IDA/WinDbg breakpoint here: arguments are passed unchanged to the API.
__declspec(noinline) BOOL ReadRemoteMemory(HANDLE process, LPCVOID address,
    LPVOID buffer, SIZE_T size, SIZE_T* bytesRead) {
    return ReadProcessMemory(process, address, buffer, size, bytesRead);
}

int main(int argc, char* argv[]) {
    std::string pidText, addressText, sizeText;
    if (argc == 1) {
        std::cout << "Target PID (decimal): "; std::cin >> pidText;
        std::cout << "Target address (0x...): "; std::cin >> addressText;
        std::cout << "Bytes to read (1..4096): "; std::cin >> sizeText;
    } else if (argc == 4) {
        pidText = argv[1]; addressText = argv[2]; sizeText = argv[3];
    } else {
        std::printf("Usage: reader.exe <PID> <0xADDRESS> <SIZE>\n");
        return 2;
    }
    unsigned long long pid = 0, address = 0, size = 0;
    if (!ParseNumber(pidText.c_str(), pid) || pid == 0 ||
        pid > (std::numeric_limits<DWORD>::max)() ||
        !ParseNumber(addressText.c_str(), address) || address == 0 ||
        address > (std::numeric_limits<ULONG_PTR>::max)() ||
        !ParseNumber(sizeText.c_str(), size) || size == 0 || size > 4096) {
        std::printf("Invalid input. Use a decimal PID/size and a 0x-prefixed address.\n");
        return 2;
    }
    HANDLE process = OpenProcess(PROCESS_VM_READ, FALSE, static_cast<DWORD>(pid));
    if (!process) {
        const DWORD error = GetLastError();
        std::printf("OpenProcess failed: error=%lu\n", error);
        return 1;
    }
    std::vector<unsigned char> buffer(static_cast<size_t>(size), 0);
    SIZE_T bytesRead = 0;
    const BOOL ok = ReadRemoteMemory(process,
        reinterpret_cast<LPCVOID>(static_cast<ULONG_PTR>(address)),
        buffer.data(), buffer.size(), &bytesRead);
    // Capture the error immediately: subsequent API calls may overwrite it.
    const DWORD error = ok ? ERROR_SUCCESS : GetLastError();
    CloseHandle(process);
    std::printf("ReadProcessMemory: success=%d bytesRead=%zu error=%lu\n",
        ok != FALSE, bytesRead, error);
    std::printf("HEX:");
    for (SIZE_T i = 0; i < bytesRead && i < buffer.size(); ++i)
        std::printf(" %02X", static_cast<unsigned int>(buffer[i]));
    std::printf("\nTEXT: ");
    for (SIZE_T i = 0; i < bytesRead && i < buffer.size(); ++i) {
        const unsigned char c = buffer[i];
        std::putchar(c >= 32 && c <= 126 ? c : '.');
    }
    std::printf("\n");
    return ok ? 0 : 1;
}
