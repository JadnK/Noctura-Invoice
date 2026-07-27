# PowerShell-Entsprechung zu fetch-fonts.sh, fuer Windows ohne Git Bash/WSL.
#   powershell -ExecutionPolicy Bypass -File apps\desktop\scripts\fetch-fonts.ps1
$ErrorActionPreference = 'Stop'

$Dest = Join-Path (Split-Path -Parent $PSScriptRoot) 'src-tauri\fonts'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

function Get-FontFile {
    param([string]$Url, [string]$Name)
    $Target = Join-Path $Dest $Name
    if (Test-Path $Target) { Write-Host "vorhanden: $Name"; return }
    Write-Host "lade: $Name"
    Invoke-WebRequest -Uri $Url -OutFile $Target
}

$Inter = 'https://github.com/rsms/inter/raw/v4.0/docs/font-files'
$Plex  = 'https://github.com/IBM/plex/raw/v6.4.0/IBM-Plex-Mono/fonts/complete/ttf'
$Serif = 'https://github.com/adobe-fonts/source-serif/raw/4.005R/TTF'

Get-FontFile "$Inter/Inter-Regular.ttf"        'Inter-Regular.ttf'
Get-FontFile "$Inter/Inter-SemiBold.ttf"      'Inter-SemiBold.ttf'
Get-FontFile "$Plex/IBMPlexMono-Regular.ttf"   'IBMPlexMono-Regular.ttf'
Get-FontFile "$Serif/SourceSerif4-Regular.ttf" 'SourceSerif4-Regular.ttf'

Write-Host "Alle Schriften liegen unter $Dest."
