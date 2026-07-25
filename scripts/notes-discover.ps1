<#
.SYNOPSIS
  Step 1 of setting up automated IPS export: find the exact database + view that
  backs the monthly IPS summary report, straight from your already-open Notes client.

.HOW TO RUN
  1. Open HCL/Lotus Notes and navigate to the IPS summary report you check every
     month (the one showing "ชื่อพนักงาน + จำนวน"). Leave it as the active window/tab.
  2. Right-click this file > "Run with PowerShell", or from a PowerShell prompt:
       powershell -ExecutionPolicy Bypass -File notes-discover.ps1
  3. Send the printed output back — it tells us the database file, server, and view
     name so scripts/notes-export-ips.ps1 can be pointed at the right place.

  This only reads information from the Notes session you're already logged into —
  it does not need any Domino admin/Designer rights.
#>

try {
    $ws = New-Object -ComObject Notes.NotesUIWorkspace
} catch {
    Write-Error "Could not reach the running Notes client via COM. Make sure Notes is open and try again. $_"
    exit 1
}

$uidb = $ws.CurrentDatabase
if ($null -eq $uidb) {
    Write-Warning "No database looks focused in Notes right now. Click into the IPS report window, then re-run this script."
    exit 1
}
$db = $uidb.Database

Write-Host "=== Currently open in Notes ===" -ForegroundColor Cyan
Write-Host "Database Title : $($db.Title)"
Write-Host "Database File  : $($db.FilePath)"
Write-Host "Server         : $($db.Server)"
Write-Host ""

$uiview = $ws.CurrentView
if ($null -ne $uiview) {
    Write-Host "Current View   : $($uiview.ViewName)" -ForegroundColor Green
} else {
    Write-Warning "No view is focused (you might be inside a single open document). Click back into the report's list/table view and re-run for the 'Current View' line above."
}

Write-Host ""
Write-Host "All views available in this database (in case the one above isn't the report itself):"
foreach ($v in $db.Views) {
    Write-Host ("  - {0}" -f $v.Name)
}
