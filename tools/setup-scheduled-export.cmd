@echo off
REM Double-click this ONCE to schedule the daily Lotus Notes export automatically.
REM To change the time, pass -Time, e.g.:
REM   setup-scheduled-export.cmd -Time "06:45"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-scheduled-export.ps1" %*

echo.
pause
