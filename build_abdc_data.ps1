param(
  [string]$Workbook = "E:\@VScode\rankings\ABDC-JQL-2025-v1-260326.xlsx",
  [string]$OutFile = ".\data\abdc-2025.json"
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
  foreach ($row in $sheet.SelectNodes("//x:sheetData/x:row[@r > 8]", $ns)) {
    $cells = @{}
    foreach ($cell in $row.SelectNodes("x:c", $ns)) {
      $cells[(Convert-CellRefToColumn -Ref $cell.GetAttribute("r"))] = Get-CellValue -Cell $cell -SharedStrings $sharedStrings -Ns $ns
    }

    $title = if ($cells.ContainsKey("B")) { $cells["B"] } else { "" }
    if ([string]::IsNullOrWhiteSpace($title)) { continue }

    $records.Add([ordered]@{
      title = $title.Trim()
      publisher = if ($cells.ContainsKey("C")) { $cells["C"].Trim() } else { "" }
      issn = if ($cells.ContainsKey("D")) { ($cells["D"] -replace "\s", "").Trim() } else { "" }
      eissn = if ($cells.ContainsKey("E")) { ($cells["E"] -replace "\s", "").Trim() } else { "" }
      yearInception = if ($cells.ContainsKey("F")) { ($cells["F"] -replace "\s", "").Trim() } else { "" }
      fieldOfResearch = if ($cells.ContainsKey("G")) { $cells["G"].Trim() } else { "" }
      abdc2025 = if ($cells.ContainsKey("H")) { $cells["H"].Trim() } else { "" }
    })
  }

  $metadata = [ordered]@{
    source = $Workbook
    builtAt = (Get-Date).ToString("s")
    count = $records.Count
    records = $records
  }

  $outPath = Join-Path (Get-Location) $OutFile
  $outDir = Split-Path -Parent $outPath
  if (-not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  }

  $metadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $outPath -Encoding UTF8
  Write-Host "Wrote $($records.Count) ABDC records to $outPath"
}
finally {
  $zip.Dispose()
}
