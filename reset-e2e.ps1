# LIFE RPG — Reset E2E data directory (Windows PowerShell)
# Removes .e2e-data before running Playwright tests so each run starts clean.

$ErrorActionPreference = 'Continue'

$e2eData = Join-Path $PWD '.e2e-data'
if (Test-Path $e2eData) {
  Write-Host "Removing .e2e-data..." -ForegroundColor Cyan
  Remove-Item -Recurse -Force $e2eData -ErrorAction SilentlyContinue
  Write-Host "E2E data reset complete." -ForegroundColor Green
} else {
  Write-Host "No .e2e-data directory found." -ForegroundColor Yellow
}
