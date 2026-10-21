param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8000,
    [string]$DatabasePath = (Join-Path $env:LOCALAPPDATA 'EIMS\forge.sqlite3')
)

$ErrorActionPreference = 'Stop'
$server = Join-Path $PSScriptRoot 'server.py'
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    throw 'Python 3 is required on the computer running EIMS. Install it through your approved company software process.'
}

if ($DatabasePath.StartsWith('\\')) {
    throw 'Choose a local disk for the live SQLite database. Use the network share for application files and backups only.'
}

Write-Host 'EIMS - Equipment Incident Management System'
Write-Host "Application files: $PSScriptRoot"
Write-Host "Database on this computer: $DatabasePath"
Write-Host "Open http://localhost:$Port in your browser after the server starts."
Write-Host 'Keep this window open while using EIMS. Press Ctrl+C to stop.'
Write-Host 'Starting this launcher on a different computer uses a separate local database.'
& $python.Source -u $server --port $Port --db $DatabasePath
exit $LASTEXITCODE
