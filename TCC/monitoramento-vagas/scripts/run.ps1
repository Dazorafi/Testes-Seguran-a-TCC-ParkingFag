param([switch]$Headless)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) { throw 'Crie o ambiente Python .venv conforme o README' }
if ($Headless) {
    & .venv/Scripts/python.exe -m parking_monitor.main --headless
} else {
    & .venv/Scripts/python.exe -m parking_monitor.main --preview
}
