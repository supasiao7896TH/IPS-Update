<#
    export-kaizen-from-notes.ps1

    Connect to Lotus Notes via COM automation, read the "Improvement\By
    Section" view (a flat list of individual Kaizen submissions -- one row
    per idea, NOT pre-aggregated), filter it down to one department and one
    month, tally how many rows each employee has, and write that tally out
    as a CSV the Kaizen Activity Tracker web app can import (Phase B).

    This script does NOT touch index.html. Run it standalone first with
    -DryRun and manually confirm the printed tally matches what you see on
    screen in Lotus Notes before ever trusting the CSV output.

    Usage:
        powershell -ExecutionPolicy Bypass -File export-kaizen-from-notes.ps1 -DryRun
        powershell -ExecutionPolicy Bypass -File export-kaizen-from-notes.ps1
        powershell -ExecutionPolicy Bypass -File export-kaizen-from-notes.ps1 -DryRun -Year 2026 -Month 7
    (or just double-click export-kaizen-from-notes.cmd)
#>

param(
    [switch]$DryRun,
    [int]$Year  = (Get-Date).Year,
    [int]$Month = (Get-Date).Month
)

# ── Config — values confirmed by the user from their Lotus Notes client ──
$ServerHint  = '5pta6lotus'
$ReplicaId   = '47256F1D:0006F32C'
$ViewName    = 'Improvement\By Section'
$Department  = 'PE1'
$OutputDir   = Join-Path $env:USERPROFILE 'Documents\KaizenExport'
$OutputPath  = Join-Path $OutputDir 'kaizen_export.csv'
$DryRunRows  = 15

function Write-Info($msg)  { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host $msg -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err2($msg)  { Write-Host $msg -ForegroundColor Red }

# ── Step 1: connect to a Notes session via COM ───────────────────────────
Write-Info "[1/4] Connecting to Lotus Notes session..."

$session = $null
$progIdsTried = @()
foreach ($progId in @('Lotus.NotesSession', 'Notes.NotesSession')) {
    try {
        $progIdsTried += $progId
        $session = New-Object -ComObject $progId
        Write-Ok "  -> COM object created via ProgID '$progId'"
        break
    } catch {
        Write-Warn2 "  -> ProgID '$progId' not available: $($_.Exception.Message)"
    }
}

if (-not $session) {
    Write-Err2 "FAILED: could not create a Notes COM session object."
    Write-Err2 "Tried ProgIDs: $($progIdsTried -join ', ')"
    Write-Err2 "This usually means Lotus/IBM/HCL Notes is not installed on this PC,"
    Write-Err2 "or corporate IT policy blocks COM automation of Notes."
    exit 1
}

$initialized = $false
foreach ($attempt in @(
    @{ Label = 'no password (reuse logged-in session)'; Args = @() },
    @{ Label = 'empty-string password';                 Args = @('') }
)) {
    try {
        Write-Info "  -> trying Initialize() with $($attempt.Label)..."
        if ($attempt.Args.Count -eq 0) { $session.Initialize() }
        else { $session.Initialize($attempt.Args[0]) }
        $initialized = $true
        Write-Ok "  -> Initialize() succeeded ($($attempt.Label))"
        break
    } catch {
        Write-Warn2 "  -> failed: $($_.Exception.Message)"
    }
}

if (-not $initialized) {
    Write-Warn2 "  -> falling back to manual password prompt (last resort)."
    Write-Warn2 "     This means Notes ID password caching is NOT working for COM automation"
    Write-Warn2 "     on this PC -- worth flagging to IT if you wanted a fully silent run."
    try {
        $secure = Read-Host -Prompt 'Notes ID password' -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        $session.Initialize($plain)
        $plain = $null
        $initialized = $true
        Write-Ok "  -> Initialize() succeeded with manual password"
    } catch {
        Write-Err2 "FAILED to initialize Notes session even with manual password: $($_.Exception.Message)"
        exit 1
    }
}

# ── Step 2: open the database (server replica, fallback to local replica) ─
# Notes displays the Replica ID with a ':' separator for readability (e.g. 47256F1D:0006F32C),
# but OpenDatabaseByReplicaID() expects the 16 hex chars with no separator. Try both forms.
$ReplicaIdNoColon = $ReplicaId -replace ':', ''
Write-Info "[2/4] Opening database (Replica ID $ReplicaId)..."

$db = $null
foreach ($serverAttempt in @($ServerHint, '')) {
    foreach ($ridAttempt in @($ReplicaId, $ReplicaIdNoColon)) {
        try {
            $serverLabel = if ($serverAttempt -eq '') { 'local replica' } else { "server '$serverAttempt'" }
            $ridLabel    = if ($ridAttempt -eq $ReplicaId) { 'with colon' } else { 'no colon' }
            Write-Info "  -> trying $serverLabel, replica id $ridLabel ($ridAttempt)..."
            $dbDir = $session.GetDbDirectory($serverAttempt)
            $candidate = $dbDir.OpenDatabaseByReplicaID($ridAttempt)
            if ($candidate -and $candidate.IsOpen) {
                $db = $candidate
                Write-Ok "  -> opened via $serverLabel, replica id $ridLabel"
                break
            }
        } catch {
            Write-Warn2 "  -> failed via $serverLabel, replica id $ridLabel`: $($_.Exception.Message)"
        }
    }
    if ($db) { break }
}

if (-not $db) {
    Write-Err2 "FAILED: could not open database with Replica ID $ReplicaId"
    Write-Err2 "(tried both with and without the ':' separator) via server '$ServerHint' or a local replica."
    Write-Err2 "Verify the Replica ID and that this PC has network/replica access to that database."
    exit 1
}

Write-Ok "  Title:    $($db.Title)"
Write-Ok "  Server:   $($db.Server)"
Write-Ok "  FilePath: $($db.FilePath)"

# ── Step 3: open the view ─────────────────────────────────────────────────
Write-Info "[3/4] Opening view '$ViewName'..."

$view = $null
try { $view = $db.GetView($ViewName) } catch { $view = $null }

if (-not $view) {
    Write-Warn2 "  -> view '$ViewName' not found directly. Listing all views/folders"
    Write-Warn2 "     in this database so you can find the correct name:"
    try {
        foreach ($v in $db.Views) {
            $aliases = try { ($v.Aliases -join ', ') } catch { '' }
            Write-Host "     - Name: '$($v.Name)'  Aliases: '$aliases'"
        }
    } catch {
        Write-Err2 "  -> could not enumerate views: $($_.Exception.Message)"
    }
    Write-Err2 "FAILED: update `$ViewName` in this script to the correct value from the list above and re-run."
    exit 1
}

Write-Ok "  -> view opened successfully"
$view.AutoUpdate = $false

# ── Step 4: walk entries, filter to one department + month, tally by name ──
# This view is a flat list of individual Kaizen submissions (one row per idea),
# not a pre-aggregated "employee + count" summary -- confirmed via -DryRun on
# real data. Column layout (confirmed, positional -- no internal field names
# available via COM): [0]=Department code, [1]=Year, [2]=Month, [4]=Employee
# full name. Status ([6]) is intentionally NOT filtered -- every submission
# counts regardless of approval state, per the user's confirmed business rule.
Write-Info "[4/4] Reading entries for Department=$Department, Year=$Year, Month=$Month$(if ($DryRun) { ' (DRY RUN)' })..."

$tally = [ordered]@{}
# NotesView.GetFirstEntry()/GetNextEntry() aren't exposed via COM automation on this
# Notes version -- the older, COM-compatible way is via the AllEntries collection instead.
$entries = $view.AllEntries
$entry = $entries.GetFirstEntry()
$printed = 0
$totalSeen = 0
$matchedCount = 0

while ($entry -ne $null) {
    $colVals = $entry.ColumnValues
    $totalSeen++

    if (-not $entry.IsCategory) {
        try {
            $dept = ([string]$colVals.Item(0)).Trim()
            $yr   = [int]$colVals.Item(1)
            $mo   = [int]$colVals.Item(2)
            $name = ([string]$colVals.Item(4)).Trim()

            $isMatch = ($dept -eq $Department) -and ($yr -eq $Year) -and ($mo -eq $Month)

            if ($DryRun -and $printed -lt $DryRunRows) {
                Write-Host "  entry#$printed Dept=$dept Year=$yr Month=$mo Name=$name $(if ($isMatch) { '<== MATCH' })"
                $printed++
            }

            if ($isMatch -and $name) {
                $matchedCount++
                if ($tally.Contains($name)) { $tally[$name] = $tally[$name] + 1 }
                else { $tally[$name] = 1 }
            }
        } catch {
            Write-Warn2 "  -> skipped one entry, could not read ColumnValues: $($_.Exception.Message)"
        }
    }

    $entry = $entries.GetNextEntry($entry)
}

Write-Ok "  -> scanned $totalSeen entries; $matchedCount matched Department=$Department Year=$Year Month=$Month"
Write-Ok "  -> $($tally.Count) distinct employee(s) in that tally"

if ($DryRun) {
    Write-Info ""
    Write-Info "Per-employee tally for Department=$Department, Year=$Year, Month=${Month}:"
    if ($tally.Count -eq 0) {
        Write-Warn2 "  (none -- check Department/Year/Month above against the raw entries printed earlier)"
    } else {
        foreach ($k in $tally.Keys) { Write-Host ("  {0,-30} {1}" -f $k, $tally[$k]) }
    }
    Write-Info ""
    Write-Info "DRY RUN complete. Nothing was written to disk."
    Write-Info "Compare the tally above against what you see on screen in Lotus Notes for this department/month."
    Write-Info "Also sanity-check the raw entries printed above: Dept/Year/Month/Name should read correctly."
    Write-Info "If anything is off, adjust the column indices in this script (search for 'colVals.Item')"
    Write-Info "and re-run -DryRun until the tally is confirmed correct."
    exit 0
}

# ── Write CSV (UTF-8 with BOM, quoted fields) ──────────────────────────────
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

function CsvQuote($value) {
    $s = if ($null -eq $value) { '' } else { [string]$value }
    return '"' + ($s -replace '"', '""') + '"'
}

$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$writer = New-Object System.IO.StreamWriter($OutputPath, $false, $utf8Bom)
$dateLabel = "{0:D2}/{1}" -f $Month, $Year
try {
    $writer.WriteLine('EmployeeName,Department,Count,Date')
    foreach ($name in $tally.Keys) {
        $line = @(
            (CsvQuote $name),
            (CsvQuote $Department),
            (CsvQuote $tally[$name]),
            (CsvQuote $dateLabel)
        ) -join ','
        $writer.WriteLine($line)
    }
} finally {
    $writer.Close()
}

Write-Ok ""
Write-Ok "Done. Wrote $($tally.Count) row(s) to:"
Write-Ok "  $OutputPath"
