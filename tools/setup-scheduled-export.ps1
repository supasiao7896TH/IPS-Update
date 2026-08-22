<#
    setup-scheduled-export.ps1

    One-time setup: registers Windows Scheduled Tasks (current user, no
    admin rights or password needed) that run export-kaizen-from-notes.ps1
    automatically once a month, without -DryRun. Registers one task per
    time in -Times (default: 11:00 and 23:00) on the same day, so a run
    that fails because Lotus Notes happens to be open at one time still
    gets a second chance later the same day.

    Registered to run ONLY when you are logged on to Windows on this PC (the
    safer default) -- this matters because this PC is shared with other
    employees' Windows logins:
      - If you are NOT logged in on the scheduled day, the tasks simply do
        not run that month (no error, no interference with anyone else's
        session on this PC) -- you'd just run the export manually next time
        you're in, or wait for next month's trigger.
      - We deliberately do NOT use "run whether logged on or not" -- that
        needs your Windows password stored with the task, and Lotus Notes
        COM automation has only ever worked here by reusing an already
        logged-in, unlocked interactive Notes session -- a non-interactive
        background run would have no such session to reuse and would likely
        hang waiting for a password prompt nobody is there to answer.

    Run this ONCE. Re-run it any time to change the day/times (it replaces
    the existing tasks of the same names).

    Usage:
        powershell -ExecutionPolicy Bypass -File setup-scheduled-export.ps1
        powershell -ExecutionPolicy Bypass -File setup-scheduled-export.ps1 -Day 5 -Times "11:00","23:00"
    (or just double-click setup-scheduled-export.cmd)
#>

param(
    [int]$Day = 5,
    [string[]]$Times = @('11:00', '23:00')
)

$TaskNamePrefix = 'KaizenTracker_ExportFromNotes'
$ScriptDir      = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath     = Join-Path $ScriptDir 'export-kaizen-from-notes.ps1'

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
if ($Times.Count -eq 0) {
    Write-Err2 "FAILED: -Times must have at least one HH:mm value."
    exit 1
}

Write-Info "Registering $($Times.Count) scheduled task(s) to run monthly on day $Day at: $($Times -join ', ')"
Write-Info "(only while you are logged on to Windows on this PC -- see the comment header in this script for why)"

# schtasks.exe /SC MONTHLY /D <day> is the simplest reliable way to get a true
# "day N of every month" trigger (Register-ScheduledTask has no such trigger built
# in, and hand-building one via the MSFT_TaskMonthlyTrigger CIM class failed here
# with "The parameter is incorrect"). schtasks.exe's /TR value needs the target
# path (which has spaces, e.g. "IPS Auto Update") wrapped in its own escaped
# quotes -- calling schtasks.exe directly from PowerShell mangles that (PowerShell
# re-quotes the whole argument on top of our embedded quotes, confirmed on-site:
# "ERROR: Invalid argument/option - 'Auto'"). Routing the fully-built command
# through cmd.exe /c avoids that: cmd.exe re-tokenizes and quotes the line itself
# the way schtasks.exe expects, since that's how it's normally invoked anyway.
$psCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $ScriptPath + '\"'
$createdNames = @()
$failed = @()

foreach ($t in $Times) {
    $suffix = $t -replace ':', ''
    $taskName = "${TaskNamePrefix}_$suffix"
    $fullCmd = 'schtasks /Create /TN "' + $taskName + '" /TR "' + $psCommand + '" /SC MONTHLY /D ' + $Day + ' /ST ' + $t + ' /F'

    $output = cmd.exe /c $fullCmd 2>&1
    if ($LASTEXITCODE -eq 0) {
        $createdNames += $taskName
    } else {
        $failed += @{ Name = $taskName; Output = ($output -join ' ') }
    }
}

if ($failed.Count -gt 0) {
    foreach ($f in $failed) { Write-Err2 "FAILED to register '$($f.Name)': $($f.Output)" }
    Write-Err2 "If this is blocked by IT policy, ask your IT admin, or just keep running the export manually."
    exit 1
}

Write-Ok ""
Write-Ok "Done. $($createdNames.Count) task(s) registered, each running on day $Day of every month:"
foreach ($n in $createdNames) { Write-Ok "  - $n" }
Write-Ok "All of them run ONLY while you are logged on to Windows on this PC."
Write-Info ""
Write-Info "If you're not at work / not logged in that day, that month's export just won't run"
Write-Info "(no error, nothing breaks) -- run '.\export-kaizen-from-notes.cmd' manually when"
Write-Info "you're back, or just wait for next month's trigger. The web app's Auto-Sync button"
Write-Info "will also show a reminder if this month's data hasn't been synced yet."
Write-Info "Reminder: if Lotus Notes client is open at the trigger time, that run will fail safely (old CSV kept) --"
Write-Info "that's exactly why there are $($createdNames.Count) tries a day instead of just one."
Write-Info "Check export_log.txt next to kaizen_export.csv to see the real success/failure history."
Write-Info "You can also see/edit these tasks any time in Windows 'Task Scheduler' under Task Scheduler Library."
