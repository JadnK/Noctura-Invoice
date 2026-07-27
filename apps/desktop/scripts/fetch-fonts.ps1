# PowerShell-Entsprechung zu fetch-fonts.sh, fuer Windows ohne Git Bash/WSL.
#   powershell -ExecutionPolicy Bypass -File apps\desktop\scripts\fetch-fonts.ps1
$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 handshaked ohne diese Zeile oft nicht automatisch mit
# TLS 1.2. GitHub verlangt mindestens TLS 1.2; ohne die Zeile bricht die
# Verbindung ab, bevor ueberhaupt eine Antwort ankommt - "Die Verbindung wurde
# unerwartet getrennt", nicht "404". PowerShell 7 (pwsh) braucht das nicht,
# schadet dort aber auch nicht.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Dest = Join-Path (Split-Path -Parent $PSScriptRoot) 'src-tauri\fonts'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

# Eine Schriftdatei ist niemals kleiner als ein paar KB. Kommt stattdessen eine
# Fehlerseite oder ein leerer Rumpf zurueck, faellt das hier auf statt still
# eine kaputte Datei abzulegen, die erst beim Kompilieren als raetselhafter
# Fehler auftaucht.
$MinBytes = 2048

function Get-FontFile {
    param([string]$Url, [string]$Name)
    $Target = Join-Path $Dest $Name

    if ((Test-Path $Target) -and (Get-Item $Target).Length -ge $MinBytes) {
        Write-Host "vorhanden: $Name"
        return
    }

    Write-Host "lade: $Name"
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Target -UseBasicParsing -TimeoutSec 30
    } catch {
        Remove-Item -Path $Target -ErrorAction SilentlyContinue
        Write-Host ""
        Write-Host "  Download fehlgeschlagen: $Name" -ForegroundColor Yellow
        Write-Host "  $($_.Exception.Message)"
        Write-Host "  Moegliche Ursachen: Firmennetz/Proxy blockiert den Zugriff auf GitHub,"
        Write-Host "  oder die hinterlegte URL stimmt nicht mehr. Manueller Weg: siehe"
        Write-Host "  apps\desktop\src-tauri\fonts\README.md, Abschnitt 'Manuell besorgen'."
        Write-Host ""
        throw
    }

    if ((Get-Item $Target).Length -lt $MinBytes) {
        Remove-Item -Path $Target -ErrorAction SilentlyContinue
        throw "Antwort fuer $Name ist zu klein fuer eine echte Schriftdatei (vermutlich eine Fehlerseite). URL pruefen oder manuell besorgen, siehe fonts/README.md."
    }
}

$Inter = 'https://github.com/rsms/inter/raw/v4.0/docs/font-files'
$Plex  = 'https://github.com/IBM/plex/raw/v6.4.0/IBM-Plex-Mono/fonts/complete/ttf'
$Serif = 'https://github.com/adobe-fonts/source-serif/raw/4.005R/TTF'

Get-FontFile "$Inter/Inter-Regular.ttf"        'Inter-Regular.ttf'
Get-FontFile "$Inter/Inter-SemiBold.ttf"       'Inter-SemiBold.ttf'
Get-FontFile "$Plex/IBMPlexMono-Regular.ttf"   'IBMPlexMono-Regular.ttf'
Get-FontFile "$Serif/SourceSerif4-Regular.ttf" 'SourceSerif4-Regular.ttf'

Write-Host "Alle Schriften liegen unter $Dest."
