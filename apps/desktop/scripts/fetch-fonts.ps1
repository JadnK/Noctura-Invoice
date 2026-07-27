# Holt die eingebetteten Schriften fuer lokale Windows-Builds.
# Aufruf:
#   powershell -ExecutionPolicy Bypass -File apps\desktop\scripts\fetch-fonts.ps1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Dest = Join-Path (Split-Path -Parent $PSScriptRoot) 'src-tauri\fonts'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$MinBytes = 2048

function Test-ValidFont {
    param([string]$Path)
    return (Test-Path $Path) -and ((Get-Item $Path).Length -ge $MinBytes)
}

function Get-RemoteFile {
    param([string]$Url, [string]$Target)

    $temporary = "$Target.download"
    Remove-Item -Path $temporary -ErrorAction SilentlyContinue
    try {
        Invoke-WebRequest -Uri $Url -OutFile $temporary -UseBasicParsing -TimeoutSec 60
    } catch {
        Remove-Item -Path $temporary -ErrorAction SilentlyContinue
        throw "Download fehlgeschlagen: $Url`n$($_.Exception.Message)"
    }
    if (-not (Test-ValidFont $temporary)) {
        Remove-Item -Path $temporary -ErrorAction SilentlyContinue
        throw "Die Antwort fuer $(Split-Path -Leaf $Target) ist keine gueltige Schriftdatei."
    }
    Move-Item -Path $temporary -Destination $Target -Force
}

function Get-FontFile {
    param([string]$Url, [string]$Name)

    $target = Join-Path $Dest $Name
    if (Test-ValidFont $target) {
        Write-Host "vorhanden: $Name"
        return
    }
    Write-Host "lade: $Name"
    Get-RemoteFile -Url $Url -Target $target
}

function Get-InterFonts {
    $regular = Join-Path $Dest 'Inter-Regular.ttf'
    $semibold = Join-Path $Dest 'Inter-SemiBold.ttf'
    if ((Test-ValidFont $regular) -and (Test-ValidFont $semibold)) {
        Write-Host 'vorhanden: Inter-Regular.ttf'
        Write-Host 'vorhanden: Inter-SemiBold.ttf'
        return
    }

    $temporary = Join-Path ([System.IO.Path]::GetTempPath()) ("noctura-inter-" + [Guid]::NewGuid())
    $archive = Join-Path $temporary 'Inter-4.0.zip'
    $expanded = Join-Path $temporary 'expanded'
    New-Item -ItemType Directory -Force -Path $expanded | Out-Null

    try {
        Write-Host 'lade: Inter 4.0'
        Invoke-WebRequest `
            -Uri 'https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip' `
            -OutFile $archive `
            -UseBasicParsing `
            -TimeoutSec 120
        Expand-Archive -Path $archive -DestinationPath $expanded -Force

        $regularSource = Get-ChildItem -Path $expanded -Recurse -File -Filter 'Inter-Regular.ttf' | Select-Object -First 1
        $semiboldSource = Get-ChildItem -Path $expanded -Recurse -File -Filter 'Inter-SemiBold.ttf' | Select-Object -First 1
        if (-not $regularSource -or -not $semiboldSource) {
            throw 'Das Inter-Archiv enthaelt die erwarteten TTF-Dateien nicht.'
        }
        if ($regularSource.Length -lt $MinBytes -or $semiboldSource.Length -lt $MinBytes) {
            throw 'Die Inter-Dateien im Archiv sind ungueltig oder unvollstaendig.'
        }

        Copy-Item -Path $regularSource.FullName -Destination $regular -Force
        Copy-Item -Path $semiboldSource.FullName -Destination $semibold -Force
    } finally {
        Remove-Item -Path $temporary -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Get-InterFonts
Get-FontFile `
    'https://raw.githubusercontent.com/IBM/plex/v6.4.0/IBM-Plex-Mono/fonts/complete/ttf/IBMPlexMono-Regular.ttf' `
    'IBMPlexMono-Regular.ttf'
Get-FontFile `
    'https://raw.githubusercontent.com/adobe-fonts/source-serif/4.005R/TTF/SourceSerif4-Regular.ttf' `
    'SourceSerif4-Regular.ttf'

Write-Host "Alle Schriften liegen unter $Dest."
