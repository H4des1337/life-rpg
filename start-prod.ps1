# LIFE RPG — Production startup (Windows PowerShell)
# Builds both frontends, then starts the production server on loopback only.

$ErrorActionPreference = 'Stop'

# Set loopback-only environment
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
$env:LOG_LEVEL = 'info'

# Optional: point data dir to %LOCALAPPDATA%\LIFE_RPG_WEB (default)
# $env:LIFERPG_DATA_DIR = "$env:LOCALAPPDATA\LIFE_RPG_WEB"

# Optional: disable auto-backups
# $env:LIFERPG_DISABLE_AUTO_BACKUP = '1'

Write-Host "Building LIFE RPG for production..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed." -ForegroundColor Red
  exit 1
}

Write-Host "Starting LIFE RPG production server..." -ForegroundColor Cyan
Write-Host "  API:    http://127.0.0.1:3000" -ForegroundColor Green
Write-Host "  Health: http://127.0.0.1:3000/api/health" -ForegroundColor Green
Write-Host "  Bind:   Loopback only (127.0.0.1) — never 0.0.0.0" -ForegroundColor Yellow

npm start
