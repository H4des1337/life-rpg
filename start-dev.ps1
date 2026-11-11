# LIFE RPG — Development startup (Windows PowerShell)
# Starts the API server and web dev server on loopback only.

$ErrorActionPreference = 'Stop'

# Set loopback-only environment
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
$env:LOG_LEVEL = 'debug'

# Optional: point data dir to a local folder for dev
# $env:LIFERPG_DATA_DIR = "$PWD\.liferpg-dev-data"

Write-Host "Starting LIFE RPG in development mode..." -ForegroundColor Cyan
Write-Host "  API:    http://127.0.0.1:3000" -ForegroundColor Green
Write-Host "  Web:    http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "  Health: http://127.0.0.1:3000/api/health" -ForegroundColor Green
Write-Host "  Bind:   Loopback only (127.0.0.1) — never 0.0.0.0" -ForegroundColor Yellow

# Run server + web dev server concurrently
npm run dev
