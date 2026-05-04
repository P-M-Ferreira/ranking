param(
  [string]$Workbook = "E:\@VScode\rankings\ABS2024.xlsx",
  [string]$OutFile = ".\data\abs-ajg-2024.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-SharedStrings {
  param($Zip)

  $entry = $Zip.GetEntry("xl/sharedStrings.xml")
  if (-not $entry) { return @() }

  $reader = [System.IO.StreamReader]::new($entry.Open())
  try {
    [xml]$xml = $reader.ReadToEnd()
  }
  finally {
    $reader.Close()
  }

  $ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
  $ns.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

  $strings = [System.Collections.Generic.List[string]]::new()
  foreach ($node in $xml.SelectNodes("//x:si", $ns)) {
    $parts = @()
    foreach ($textNode in $node.SelectNodes(".//x:t", $ns)) {
      $parts += $textNode.InnerText
    }
    $strings.Add(($parts -join ""))
  }

  return $strings
}

function Convert-CellRefToColumn {
  param([string]$Ref)
  return ($Ref -replace "\d", "")
}

function Get-CellValue {
  param($Cell, $SharedStrings, $Ns)

  $valueNode = $Cell.SelectSingleNode("x:v", $Ns)
  if (-not $valueNode) { return "" }

  $value = $valueNode.InnerText
  if ($Cell.GetAttribute("t") -eq "s" -and $value -ne "") {
    return $SharedStrings[[int]$value].Trim()
  }

  return $value.Trim()
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($Workbook)
try {
  $sharedStrings = Get-SharedStrings -Zip $zip

  $sheetEntry = $zip.GetEntry("xl/worksheets/sheet1.xml")
  $reader = [System.IO.StreamReader]::new($sheetEntry.Open())
  try {
    [xml]$sheet = $reader.ReadToEnd()
  }
  finally {
    $reader.Close()
  }

  $ns = [System.Xml.XmlNamespaceManager]::new($sheet.NameTable)
  $ns.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

  $records = [System.Collections.Generic.List[object]]::new()
  $rows = $sheet.SelectNodes("//x:sheetData/x:row", $ns)
  foreach ($row in $rows) {
    $rowNumber = 0
    if (-not [int]::TryParse($row.GetAttribute("r"), [ref]$rowNumber)) { continue }
    if ($rowNumber -le 2) { continue }

    $cells = @{}
    foreach ($cell in $row.SelectNodes("x:c", $ns)) {
      $cells[(Convert-CellRefToColumn -Ref $cell.GetAttribute("r"))] = Get-CellValue -Cell $cell -SharedStrings $sharedStrings -Ns $ns
    }

    $title = if ($cells.ContainsKey("C")) { $cells["C"].Trim() } else { "" }
    if ([string]::IsNullOrWhiteSpace($title)) { continue }

    $records.Add([ordered]@{
      id = if ($cells.ContainsKey("A")) { $cells["A"].Trim() } else { "" }
      field = if ($cells.ContainsKey("B")) { $cells["B"].Trim() } else { "" }
      title = $title
      publisher = ""
      issn = ""
      ajg2024 = if ($cells.ContainsKey("D")) { $cells["D"].Trim() } else { "" }
      ajg2021 = ""
      ajg2018 = ""
    })
  }

  $metadata = [ordered]@{
    source = $Workbook
    sourceName = "Academic Journal Guide 2024"
    builtAt = (Get-Date).ToString("s")
    count = $records.Count
    records = $records
  }

  $outPath = Join-Path (Get-Location) $OutFile
  $outDir = Split-Path -Parent $outPath
  if (-not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  }

  $metadata | ConvertTo-Json -Depth 5 -Compress | Set-Content -LiteralPath $outPath -Encoding UTF8
  Write-Host "Wrote $($records.Count) ABS/AJG records to $outPath"
}
finally {
  $zip.Dispose()
}
