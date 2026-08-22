@echo off
REM Double-click this to schedule the monthly Lotus Notes export automatically
REM (default: day 5 of each month, 07:30). To change the day/time, pass -Day/-Time, e.g.:
REM   setup-scheduled-export.cmd -Day 5 -Time "06:45"
REM Re-running this replaces the previous schedule with the new one.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-scheduled-export.ps1" %*

echo.
pause
