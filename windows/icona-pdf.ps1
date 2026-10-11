# Posa la icona de document PDF als fitxers .pdf associats a PDF Simple (PWA de Chrome/Edge).
# Chrome deixa DefaultIcon buit (",0") al registre; aquest script l'omple. Només toca HKCU.
# Execució: powershell -ExecutionPolicy Bypass -File windows\icona-pdf.ps1
# Cal tornar-lo a executar si es reinstal·la la PWA (el navegador regenera el registre).
$dir = Join-Path $env:LOCALAPPDATA 'PDFSimple'
New-Item -ItemType Directory -Force $dir | Out-Null
$ico = Join-Path $dir 'pdf-file.ico'
Copy-Item (Join-Path $PSScriptRoot 'pdf-file.ico') $ico -Force

$n = 0
foreach ($k in Get-ChildItem 'HKCU:\Software\Classes' | Where-Object { $_.PSChildName -like 'Chrome.*' -or $_.PSChildName -like 'MSEdge*.*' }) {
  $app = Get-ItemProperty (Join-Path $k.PSPath 'Application') -ErrorAction SilentlyContinue
  $ext = (Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue).FileExtensions
  if ($app.ApplicationName -eq 'PDF Simple' -and $ext -match '\.pdf') {
    New-Item -Force (Join-Path $k.PSPath 'DefaultIcon') -Value "$ico,0" | Out-Null
    $n++
  }
}
if ($n -eq 0) { Write-Host "No s'ha trobat l'associacio .pdf de PDF Simple. Instal-la la PWA i torna-ho a provar."; exit 1 }
& ie4uinit.exe -show
Write-Host "Icona aplicada a $n associacio(ns). Si no es veu, reinicia l'Explorador."
