<#
    setup-scheduled-export.ps1

    One-time setup: registers a Windows Scheduled Task (current user, no
    admin rights or password needed) that runs export-kaizen-from-notes.ps1
    automatically once a month, without -DryRun.

    Registered to run ONLY when you are logged on to Windows on this PC (the
    safer default) -- this matters because this PC is shared with other
    employees' Windows logins:
      - If you are NOT logged in on the scheduled day, the task simply does
        not run that month (no error, no interference with anyone else's
        session on this PC) -- you'd just run the export manually next time
        you're in, or wait for next month's trigger.
      - We deliberately do NOT use "run whether logged on or not" -- that
        needs your Windows password stored with the task, and Lotus Notes
        COM automation has only ever worked here by reusing an already
        logged-in, unlocked interactive Notes session -- a non-interactive
        background run would have no such session to reuse and would likely
        hang waiting for a password prompt nobody is there to answer.

    Run this ONCE. Re-run it any time to change the day/time (it replaces
    the existing task of the same name).

    Usage:
        powershell -ExecutionPolicy Bypass -File setup-scheduled-export.ps1
        powershell -ExecutionPolicy Bypass -File setup-scheduled-export.ps1 -Day 5 -Time "07:30"
    (or just double-click setup-scheduled-export.cmd)
#>

param(
    [int]$Day = 5,
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
if ($Day -lt 1 -or $Day -gt 28) {
    Write-Err2 "FAILED: -Day must be between 1 and 28 (days 29-31 don't exist in every month)."
    exit 1
}

Write-Info "Registering scheduled task '$TaskName' to run monthly on day $Day at $Time..."
Write-Info "(only while you are logged on to Windows on this PC -- see the comment header in this script for why)"

# schtasks.exe (not Register-ScheduledTask -- that cmdlet has no built-in monthly-day
# trigger) supports /SC MONTHLY /D <day> directly. Omitting /RU and /RP registers the
# task under the current user with an interactive logon type: no password needed, and
# it only runs while that user is logged on -- exactly the safer behavior we want.
$taskRun = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

try {
    & schtasks.exe /Create /TN $TaskName /TR $taskRun /SC MONTHLY /D $Day /ST $Time /F
    if ($LASTEXITCODE -ne 0) { throw "schtasks.exe exited with code $LASTEXITCODE" }

    Write-Ok ""
    Write-Ok "Done. Task '$TaskName' will run on day $Day of every month at $Time,"
    Write-Ok "but ONLY while you are logged on to Windows on this PC."
    Write-Info ""
    Write-Info "If you're not at work / not logged in that day, that month's export just won't run"
    Write-Info "(no error, nothing breaks) -- run '.\export-kaizen-from-notes.cmd' manually when"
    Write-Info "you're back, or just wait for next month's trigger."
    Write-Info "Reminder: if Lotus Notes client is open at $Time, that day's run will fail safely (old CSV kept)."
    Write-Info "Check export_log.txt next to kaizen_export.csv to see the real success/failure history."
    Write-Info "You can also see/edit this task any time in Windows 'Task Scheduler' under Task Scheduler Library."
} catch {
    Write-Err2 "FAILED to register scheduled task: $($_.Exception.Message)"
    Write-Err2 "If this is blocked by IT policy, ask your IT admin, or just keep running the export manually."
    exit 1
}
