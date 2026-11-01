@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title AceExam 旧版本清理

echo 此脚本只清理下列已核实的旧版构建目录，以及备份中的旧 APK 副本：
echo   C:\aceexam-build-20260922
echo   C:\AceExamBuildSounds
echo   C:\kaojiang-apk-build
echo   C:\kaojiang-apk-build2
echo   C:\kaojiang-apk-build3
echo   C:\kaojiang-build-scratch
echo   C:\kaojiang-build-v021-20260922
echo   C:\kaojiang-mobile-build-v010
echo   当前用户备份目录中的 6 个 v0.1.0 / v0.2.x APK 副本
echo.
echo 会保留当前 v0.3.2、AceExam 源码、数据库和整个备份目录。
echo.

if /I not "%USERPROFILE:~0,9%"=="C:\Users\" (
  echo 安全检查失败：用户目录不在 C:\Users 下，已停止。
  pause
  exit /b 2
)

choice /C YN /N /M "确认删除以上旧版文件？按 Y 删除，按 N 取消: "
if errorlevel 2 goto :cancel

set "FAILED=0"
for %%D in (
  "C:\aceexam-build-20260922"
  "C:\AceExamBuildSounds"
  "C:\kaojiang-apk-build"
  "C:\kaojiang-apk-build2"
  "C:\kaojiang-apk-build3"
  "C:\kaojiang-build-scratch"
  "C:\kaojiang-build-v021-20260922"
  "C:\kaojiang-mobile-build-v010"
) do call :RemoveOldBuild "%%~D"

set "BACKUP=%USERPROFILE%\Documents\ChatGPT\aceexam-backups\aceexam-2026-09-22-before-redesign"
call :RemoveOldApk "%BACKUP%\mobile\kaojiang-v0.1.0.apk"
call :RemoveOldApk "%BACKUP%\mobile\kaojiang-v0.2.0.apk"
call :RemoveOldApk "%BACKUP%\mobile\kaojiang-v0.2.1.apk"
call :RemoveOldApk "%BACKUP%\mobile\kaojiang-v0.2.2.apk"
call :RemoveOldApk "%BACKUP%\public\downloads\kaojiang-v0.2.1.apk"
call :RemoveOldApk "%BACKUP%\public\downloads\kaojiang-v0.2.2.apk"

echo.
if "%FAILED%"=="0" (
  echo 清理完成。当前版本、源码和数据库备份已保留。
) else (
  echo 清理未完全完成。请查看上面的失败路径；未删除的项目仍在原处。
)
pause
if "%FAILED%"=="0" exit /b 0
exit /b 1

:RemoveOldBuild
set "TARGET=%~1"
if not exist "%TARGET%\" (
  echo [跳过] 目录不存在：%TARGET%
  exit /b 0
)
for %%P in ("%TARGET%") do set "TARGET_PARENT=%%~dpP"
for %%N in ("%TARGET%") do set "TARGET_NAME=%%~nxN"
if /I not "%TARGET_PARENT%"=="C:\" (
  echo [拒绝] 目标不在 C:\ 根目录：%TARGET%
  set "FAILED=1"
  exit /b 1
)
set "ALLOWED="
for %%A in (aceexam-build-20260922 AceExamBuildSounds kaojiang-apk-build kaojiang-apk-build2 kaojiang-apk-build3 kaojiang-build-scratch kaojiang-build-v021-20260922 kaojiang-mobile-build-v010) do if /I "%TARGET_NAME%"=="%%A" set "ALLOWED=1"
if not defined ALLOWED (
  echo [拒绝] 目标名称不在固定清单中：%TARGET%
  set "FAILED=1"
  exit /b 1
)
powershell -NoProfile -Command "$p = '%TARGET%'; $i = Get-Item -LiteralPath $p -Force -ErrorAction Stop; if (-not $i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint)) { exit 2 }; $bad = Get-ChildItem -LiteralPath $p -Force -Recurse -ErrorAction Stop | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1; if ($bad) { exit 3 }"
if errorlevel 1 (
  echo [拒绝] 目录包含链接或无法完成安全检查：%TARGET%
  set "FAILED=1"
  exit /b 1
)
echo [删除旧构建] %TARGET%
rmdir /s /q "%TARGET%"
if exist "%TARGET%\" (
  echo [失败] 无法完全删除：%TARGET%
  set "FAILED=1"
) else (
  echo [完成] %TARGET%
)
exit /b 0

:RemoveOldApk
set "TARGET=%~1"
if not exist "%TARGET%" (
  echo [跳过] APK 不存在：%TARGET%
  exit /b 0
)
for %%P in ("%TARGET%") do set "TARGET_PARENT=%%~dpP"
if /I not "%TARGET_PARENT:~0,9%"=="C:\Users\" (
  echo [拒绝] APK 不在当前用户的 C:\Users 目录中：%TARGET%
  set "FAILED=1"
  exit /b 1
)
for %%N in ("%TARGET%") do set "TARGET_NAME=%%~nxN"
if /I not "%TARGET_NAME:~-4%"==".apk" (
  echo [拒绝] 目标不是 APK：%TARGET%
  set "FAILED=1"
  exit /b 1
)
echo [删除旧 APK] %TARGET%
del /f /q "%TARGET%"
if exist "%TARGET%" (
  echo [失败] 无法删除：%TARGET%
  set "FAILED=1"
) else (
  echo [完成] %TARGET%
)
exit /b 0

:cancel
echo 已取消；没有删除任何文件。
pause
exit /b 0
