<#
    export-kaizen-from-notes.ps1

    Phase A spike: connect to Lotus Notes via COM automation and export the
    "Individual Kaizen - Improvement \ By Section" view to a CSV that the
    Kaizen Activity Tracker web app can import (Phase B, not built yet).

    This script does NOT touch index.html. Run it standalone first with
    -DryRun and manually confirm the printed column mapping matches what you
    see on screen in Lotus Notes before ever trusting the CSV output.

    Usage:
        powershell -ExecutionPolicy Bypass -File export-kaizen-from-notes.ps1 -DryRun
        powershell -ExecutionPolicy Bypass -File export-kaizen-from-notes.ps1
    (or just double-click export-kaizen-from-notes.cmd)
#>

param(
    [switch]$DryRun
)

# ── Config — values confirmed by the user from their Lotus Notes client ──
$ServerHint  = '5pta6lotus'
$ReplicaId   = '47256F1D:0006F32C'
$ViewName    = 'Improvement\By Section'
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

# ── Step 4: walk entries, handle categorized (grouped) rows ───────────────
Write-Info "[4/4] Reading entries$(if ($DryRun) { ' (DRY RUN — printing raw data, not writing CSV)' })..."

$rows = New-Object System.Collections.Generic.List[Object]
$currentCategory = ''
$entry = $view.GetFirstEntry()
$printed = 0

while ($entry -ne $null) {
    $colVals = $entry.ColumnValues

    if ($DryRun -and $printed -lt $DryRunRows) {
        $valsDump = @()
        for ($i = 0; $i -lt $colVals.Count; $i++) {
            $v = $colVals.Item($i)
            $t = if ($null -eq $v) { 'null' } else { $v.GetType().Name }
            $valsDump += "[$i]=$v ($t)"
        }
        Write-Host "  entry#$printed IsCategory=$($entry.IsCategory) Indent=$($entry.Indent) -- $($valsDump -join ' | ')"
        $printed++
    }

    if ($entry.IsCategory) {
        # Category header row -- first column value is typically the group label (department).
        try { $currentCategory = [string]$colVals.Item(0) } catch { }
    } else {
        try {
            $name  = [string]$colVals.Item(0)
            $count = $colVals.Item(1)
            $date  = $colVals.Item(2)
            $rows.Add([PSCustomObject]@{
                EmployeeName = $name
                Department   = $currentCategory
                Count        = $count
                Date         = $date
            })
        } catch {
            Write-Warn2 "  -> skipped one entry, could not read ColumnValues: $($_.Exception.Message)"
        }
    }

    $entry = $view.GetNextEntry($entry)
}

Write-Ok "  -> read $($rows.Count) document row(s), category label seen: '$currentCategory'"

if ($DryRun) {
    Write-Info ""
    Write-Info "DRY RUN complete. Nothing was written to disk."
    Write-Info "Compare the printed values above against what you see on screen in Lotus Notes:"
    Write-Info "  - Is column [0] really the employee name?"
    Write-Info "  - Is column [1] really the Count?"
    Write-Info "  - Is column [2] really the Date, and is IsCategory correctly marking department headers?"
    Write-Info "If anything is off, adjust the column indices in this script (search for 'colVals.Item')"
    Write-Info "and re-run -DryRun until the mapping is confirmed correct."
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
try {
    $writer.WriteLine('EmployeeName,Department,Count,Date')
    foreach ($r in $rows) {
        $line = @(
            (CsvQuote $r.EmployeeName),
            (CsvQuote $r.Department),
            (CsvQuote $r.Count),
            (CsvQuote $r.Date)
        ) -join ','
        $writer.WriteLine($line)
    }
} finally {
    $writer.Close()
}

Write-Ok ""
Write-Ok "Done. Wrote $($rows.Count) row(s) to:"
Write-Ok "  $OutputPath"
