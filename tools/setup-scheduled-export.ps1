<#
    setup-scheduled-export.ps1

    One-time setup: registers a Windows Scheduled Task (current user, no
    admin rights needed) that runs export-kaizen-from-notes.ps1 automatically
    every day at a fixed time, without -DryRun.

    Run this ONCE. Re-run it any time to change the scheduled time (it
    replaces the existing task of the same name).

    IMPORTANT: if Lotus Notes client happens to be open when the scheduled
    time hits, that day's run will fail (see the "ID file is locked" issue
    documented in export-kaizen-from-notes.ps1) -- but it fails safely: the
    existing CSV file is left untouched, so the web app just keeps using
    yesterday's data until the next successful run. Check export_log.txt in
    the same folder as the CSV to see the real success/failure history and
    adjust -Time below if scheduled runs keep failing.

    Usage:
        powershell -ExecutionPolicy Bypass -File setup-scheduled-export.ps1
        powershell -ExecutionPolicy Bypass -File setup-scheduled-export.ps1 -Time "06:45"
    (or just double-click setup-scheduled-export.cmd)
#>

param(
    [string]$Time = '07:30'
)

$TaskName   = 'KaizenTracker_ExportFromNotes'
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath = Join-Path $ScriptDir 'export-kaizen-from-notes.ps1'

function Write-Info($msg)  { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host $msg -ForegroundColor Green }
function Write-Err2($msg)  { Write-Host $msg -ForegroundColor Red }

if (-not (Test-Path $ScriptPath)) {
    Write-Err2 "FAILED: could not find export-kaizen-from-notes.ps1 next to this setup script."
    exit 1
}

Write-Info "Registering scheduled task '$TaskName' to run daily at $Time..."

try {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

    $trigger = New-ScheduledTaskTrigger -Daily -At $Time

    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Description 'Exports this month''s Kaizen tally from Lotus Notes for the Kaizen Activity Tracker web app.' `
        -Force | Out-Null

    Write-Ok "Done. Task '$TaskName' will run daily at $Time."
    Write-Ok "It calls: powershell.exe -File `"$ScriptPath`" (no -DryRun, current year/month by default)"
    Write-Info ""
    Write-Info "Reminder: if Lotus Notes client is open at $Time, that day's run will fail safely (old CSV kept)."
    Write-Info "Check the export_log.txt file next to kaizen_export.csv to see the real success/failure history."
    Write-Info "You can also see/edit this task any time in Windows 'Task Scheduler' under Task Scheduler Library."
} catch {
    Write-Err2 "FAILED to register scheduled task: $($_.Exception.Message)"
    Write-Err2 "If this is blocked by IT policy, ask your IT admin, or just keep running the export manually."
    exit 1
}
