$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $projectRoot "dist"
$blobPath = Join-Path $distDir "fabrix-bridge.blob"
$targetExe = Join-Path $distDir "fabrix-bridge.exe"
$nodeExe = (Get-Command node).Source
$sentinel = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"

New-Item -ItemType Directory -Force -Path $distDir | Out-Null
Remove-Item (Join-Path $distDir "scripts") -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Building SEA blob..."
Push-Location $projectRoot
try {
  node --experimental-sea-config sea-config.json
} finally {
  Pop-Location
}

Write-Host "Preparing executable..."
Copy-Item $nodeExe $targetExe -Force

$postjectCmd = Join-Path $projectRoot "node_modules\.bin\postject.cmd"
if (-not (Test-Path $postjectCmd)) {
  throw "postject is not installed. Run 'npm install' first."
}

Write-Host "Injecting SEA blob..."
& $postjectCmd $targetExe NODE_SEA_BLOB $blobPath --sentinel-fuse $sentinel --overwrite

Write-Host "Built $targetExe"
