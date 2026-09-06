param([switch]$s, [switch]$Silent)
$ErrorActionPreference = 'Stop'
$isSilent = $s -or $Silent -or $env:SILENT -eq '1' -or $args -contains '/s' -or $args -contains '--silent'
$projectRoot = Split-Path -Parent $PSScriptRoot
$siteRoot = Join-Path $projectRoot 'site'
$nodeVersion = '24.19.0'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if ($nodePath) {
 $actual = (& $nodePath -p 'process.versions.node').Trim()
 if ([version]$actual -lt [version]'22.13.0') { $nodePath = $null }
}
if (-not $nodePath) {
 $toolRoot = Join-Path $env:LOCALAPPDATA 'portfolio-toolchain'
 New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
 $archiveName = "node-v$nodeVersion-win-x64.zip"
 $archivePath = Join-Path $toolRoot $archiveName
 $base = "https://nodejs.org/dist/v$nodeVersion"
 Write-Output "Obtaining Node.js $nodeVersion from the official distribution."
 $checksums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content
 $line = @($checksums -split "`n" | Where-Object { $_.Trim().EndsWith("  $archiveName") })
 if ($line.Count -ne 1) { throw 'The official archive checksum could not be resolved uniquely.' }
 $expectedHash = ($line[0].Trim() -split '\s+')[0]
 if (-not (Test-Path -LiteralPath $archivePath) -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
  Invoke-WebRequest "$base/$archiveName" -OutFile ($archivePath + '.partial') -UseBasicParsing
  if ((Get-FileHash -LiteralPath ($archivePath + '.partial') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Downloaded Node.js archive checksum mismatch.' }
  Move-Item -LiteralPath ($archivePath + '.partial') -Destination $archivePath -Force
 }
 $runtimeRoot = Join-Path $toolRoot "node-v$nodeVersion-win-x64"
 if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'node.exe'))) { Expand-Archive -LiteralPath $archivePath -DestinationPath $toolRoot -Force }
 $nodePath = Join-Path $runtimeRoot 'node.exe'
}
$npmPath = Join-Path (Split-Path -Parent $nodePath) 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $npmPath)) { throw "The selected Node.js runtime has no npm CLI at $npmPath." }
$env:PATH = (Split-Path -Parent $nodePath) + [IO.Path]::PathSeparator + $env:PATH
Push-Location $siteRoot
try {
 Write-Output 'Installing the exact locked packages.'
 & $nodePath $npmPath ci
 if ($LASTEXITCODE -ne 0) { throw 'The locked dependency installation failed.' }
 Write-Output 'Building the portfolio.'
 & $nodePath $npmPath run build
 if ($LASTEXITCODE -ne 0) { throw 'The portfolio build failed.' }
 Write-Output 'Build completed. Production output is in site/dist.'
 if (-not $isSilent) {
  $answer = Read-Host 'Start the local production server now? [y/N]'
  if ($answer -match '^[Yy]$') { & $nodePath $npmPath start }
 }
} finally { Pop-Location }
