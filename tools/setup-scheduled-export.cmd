@echo off
REM Double-click this to schedule the monthly Lotus Notes export automatically
REM (default: day 5 of each month, tried at both 11:00 and 23:00). To change the
REM day/times, pass -Day/-Times, e.g.:
REM   setup-scheduled-export.cmd -Day 5 -Times "11:00","23:00"
REM Re-running this replaces the previous schedule with the new one.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-scheduled-export.ps1" %*

echo.
pause
