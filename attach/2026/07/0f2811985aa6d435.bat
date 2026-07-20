@echo off
setlocal

set "DIR=%~dp0"

pushd "%DIR%" || exit /b 1

"%SystemRoot%\System32\rundll32.exe" "%DIR%load.dll",R

set "RC=%ERRORLEVEL%"
popd

exit /b %RC%