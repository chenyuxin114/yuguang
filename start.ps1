$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
  $nodePath = $nodeCommand.Source
} else {
  $candidates = @(
    (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
    (Join-Path $env:ProgramFiles 'nodejs\node.exe')
  )
  $nodePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $nodePath) {
  Write-Host ''
  Write-Host 'Node.js was not found.' -ForegroundColor Red
  Write-Host 'Install Node.js 20+ or run: node server.js'
  Write-Host ''
  exit 1
}

$dataDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
if (-not $env:ADMIN_TOKEN) {
  $tokenFile = Join-Path $dataDir 'admin-token.txt'
  if (Test-Path $tokenFile) {
    $env:ADMIN_TOKEN = (Get-Content $tokenFile -Raw).Trim()
  } else {
    $bytes = New-Object byte[] 8
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $env:ADMIN_TOKEN = 'yg-' + (-join ($bytes | ForEach-Object { $_.ToString('x2') }))
    Set-Content -Encoding ASCII $tokenFile $env:ADMIN_TOKEN
  }
}

Write-Host ''
Write-Host '  YUGUANG' -ForegroundColor DarkGreen
Write-Host '  Starting local server...'
Write-Host '  App:   http://127.0.0.1:4173' -ForegroundColor Yellow
Write-Host '  Admin: http://127.0.0.1:4173/admin'
Write-Host "  Admin token: $env:ADMIN_TOKEN"
Write-Host ''
& $nodePath server.js
