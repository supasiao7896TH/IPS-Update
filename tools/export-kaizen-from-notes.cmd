@echo off
REM Double-click this file to run the Lotus Notes export script.
REM Add "-DryRun" as an argument to preview data without writing the CSV, e.g.:
REM   export-kaizen-from-notes.cmd -DryRun

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0export-kaizen-from-notes.ps1" %*

echo.
pause
