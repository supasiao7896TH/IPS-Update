<#
.SYNOPSIS
  Step 2: reads the monthly IPS summary view directly from Lotus/HCL Notes (the real
  field values, not a screenshot) and writes a JSON file that the Kaizen Activity
  Tracker web app can import via its "นำเข้าจากไฟล์ Notes Export" button.

.BEFORE YOU RUN THIS
  Run notes-discover.ps1 first (see that file's header) and fill in the three
  values below — $dbServer, $dbPath, $viewName — from its output.

.OUTPUT
  Writes  %USERPROFILE%\Documents\IPS_Export\ips_export_<year>_<month>.json
  shaped as:  { "year": 2026, "month": 7, "rows": [ { "name": "...", "count": 3 }, ... ] }

.SCHEDULING
  Register with Windows Task Scheduler to run automatically once a month, e.g.:
    schtasks /Create /TN "IPS Notes Export" /SC MONTHLY /D 1 /ST 08:00 ^
      /TR "powershell.exe -ExecutionPolicy Bypass -File `"C:\path\to\notes-export-ips.ps1`""
  Use "Run only when user is logged on" so the task runs inside your normal
  interactive Notes session — a fully unattended (logged-off) run generally also
  needs your Notes ID password, which this script does not store or prompt for.

.NOTES ON COLUMN DETECTION
  This script doesn't assume fixed column positions: for each row it takes the
  first text column as the employee name and the first numeric column as the
  count. If the real report has extra columns (e.g. a department column before
  the name), check the output JSON once and adjust the detection loop below if
  it picks up the wrong column.
#>

# ── Fill these in after running notes-discover.ps1 ──────────────────────────
$dbServer  = ""              # e.g. "" for local, or "CN=YourServer/O=YourOrg"
$dbPath    = "TODO.nsf"      # e.g. "apps\ips_summary.nsf" — from "Database File" in discovery output
$viewName  = "TODO"          # e.g. "MonthlySummary" — from "Current View" in discovery output
# ──────────────────────────────────────────────────────────────────────────

$now   = Get-Date
$year  = $now.Year
$month = $now.Month

try {
    $session = New-Object -ComObject Lotus.NotesSession
    $session.Initialize()   # prompts for your Notes ID password if it isn't cached
} catch {
    Write-Error "Could not start a Notes session. Is HCL/Lotus Notes installed? $_"
    exit 1
}

$db = $session.GetDatabase($dbServer, $dbPath)
if ($null -eq $db -or -not $db.IsOpen) {
    Write-Error "Could not open database '$dbPath' on server '$dbServer'. Re-check the values from notes-discover.ps1."
    exit 1
}

$view = $db.GetView($viewName)
if ($null -eq $view) {
    Write-Error "View '$viewName' not found in '$dbPath'. Re-check the view name from notes-discover.ps1."
    exit 1
}

$rows = @()
$entries = $view.AllEntries
$entry = $entries.GetFirstEntry()
while ($null -ne $entry) {
    if (-not $entry.IsCategory -and -not $entry.IsTotal) {
        $name = $null
        $count = $null
        foreach ($v in $entry.ColumnValues) {
            if ($null -eq $v) { continue }
            if ($null -eq $name -and $v -is [string] -and $v.Trim().Length -gt 0) { $name = $v.Trim() }
            elseif ($null -eq $count -and ($v -is [double] -or $v -is [int])) { $count = [int]$v }
        }
        if ($name -and $null -ne $count) {
            $rows += [PSCustomObject]@{ name = $name; count = $count }
        }
    }
    $entry = $entries.GetNextEntry($entry)
}

if ($rows.Count -eq 0) {
    Write-Warning "No rows extracted — double-check `$viewName and the column-detection logic against a real row."
    exit 1
}

$outDir = Join-Path $env:USERPROFILE "Documents\IPS_Export"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outFile = Join-Path $outDir ("ips_export_{0}_{1:D2}.json" -f $year, $month)

[PSCustomObject]@{ year = $year; month = $month; rows = $rows } |
    ConvertTo-Json -Depth 4 |
    Out-File -FilePath $outFile -Encoding utf8

Write-Host "Wrote $($rows.Count) rows to $outFile" -ForegroundColor Green
