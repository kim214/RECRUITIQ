# Run this script when you have internet access to push to GitHub
# Right-click → Run with PowerShell, OR run: .\push-to-github.ps1

Write-Host "=== Reqruit IQ - Push to GitHub ===" -ForegroundColor Cyan
Set-Location $PSScriptRoot

Write-Host "`n1. Checking git status..." -ForegroundColor Yellow
git status

Write-Host "`n2. Testing connection to GitHub..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://github.com" -Method Head -TimeoutSec 15 -UseBasicParsing
    Write-Host "   GitHub is reachable (status $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: Cannot reach GitHub. Try mobile hotspot or different network." -ForegroundColor Red
    Write-Host "   Details: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "`nPress Enter to exit"
    exit 1
}

Write-Host "`n3. Pushing to https://github.com/kim214/RECRUITIQ.git ..." -ForegroundColor Yellow
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSUCCESS! Code uploaded to GitHub." -ForegroundColor Green
    Write-Host "View at: https://github.com/kim214/RECRUITIQ" -ForegroundColor Green
} else {
    Write-Host "`nPush failed. If asked for password, use a GitHub Personal Access Token:" -ForegroundColor Red
    Write-Host "   https://github.com/settings/tokens (enable 'repo' scope)" -ForegroundColor Yellow
}

Read-Host "`nPress Enter to exit"
