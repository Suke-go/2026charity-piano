@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Charity Local - Bootstrap

cd /d %~dp0

REM ============================================================
REM   Charity Local - One-click startup
REM   - detect LAN IPv4
REM   - ensure firewall rule
REM   - kill stale processes on 8789 / 5174 / 5175
REM   - launch API + admin Vite + audience Vite in 3 windows
REM   - open admin in default browser at LAN IP
REM ============================================================

REM === Detect LAN IPv4 (prefer 192.168.x, then 10.x) ===
set "LAN_IP="
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' } ^| Where-Object { $_.InterfaceAlias -notmatch 'Loopback^|WSL^|vEthernet^|Bluetooth' } ^| Select-Object -First 1).IPAddress"') do set "LAN_IP=%%a"

if not defined LAN_IP (
  echo.
  echo [ERROR] LAN IPv4 not detected.
  echo   - Ensure the PC is connected to the venue LAN ^(wired preferred^)
  echo   - Disable other networks ^(Wi-Fi tethering, VPN^) if they shadow the LAN
  echo.
  pause
  exit /b 1
)

echo.
echo =========================================
echo   Charity Local System
echo =========================================
echo   LAN IP:   !LAN_IP!
echo   Admin:    http://!LAN_IP!:5174/
echo   Audience: http://!LAN_IP!:5175/
echo   Password: jundaiokano
echo =========================================
echo.

REM === Ensure firewall rule (idempotent) ===
powershell -NoProfile -Command "if (-not (Get-NetFirewallRule -DisplayName 'Vite-Local-Test' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName 'Vite-Local-Test' -Direction Inbound -LocalPort 5174,5175,8789 -Protocol TCP -Action Allow -Profile Any | Out-Null ; Write-Host '[OK] Firewall rule created.' -ForegroundColor Green } else { Write-Host '[OK] Firewall rule present.' -ForegroundColor Green }"

REM === Kill stale processes on our ports ===
echo.
echo [..] Checking for stale processes on 8789 / 5174 / 5175 ...
for %%p in (8789 5174 5175) do (
  powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort %%p -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop ; Write-Host ('[OK] Killed stale process on port %%p (PID ' + $_.OwningProcess + ')') -ForegroundColor Yellow } catch {} }"
)

REM === Launch services in separate terminals ===
echo.
echo [..] Launching services ...
start "Charity API (8789)" cmd /k "cd /d %~dp0 && npm run start:local-answer-api"
timeout /t 3 /nobreak >nul
start "Charity Admin (5174)" cmd /k "cd /d %~dp0 && npm run dev:local-admin"
start "Charity Audience (5175)" cmd /k "cd /d %~dp0 && npm run dev:local-audience"

timeout /t 5 /nobreak >nul

REM === Open admin in browser at LAN IP ===
echo.
echo [..] Opening admin in browser ...
start "" "http://!LAN_IP!:5174/"

echo.
echo =========================================
echo   Launched.
echo   - Admin window (PC):   http://!LAN_IP!:5174/
echo   - Audience (phone):    http://!LAN_IP!:5175/
echo   - Password:            jundaiokano
echo.
echo   To stop everything: close the 3 service windows
echo   ^(Charity API / Admin / Audience^).
echo =========================================
echo.

endlocal
