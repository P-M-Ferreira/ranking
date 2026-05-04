param(
  [string]$Workbook = "E:\@VScode\rankings\JCR-ImapctFactor-2025.xlsx",
  [string]$OutFile = ".\data\jcr-2025.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Issn {
  param([string]$Value)

  $compact = ($Value.ToUpperInvariant() -replace "[^0-9X]", "")
  if ($compact.Length -ne 8) { return "" }
  return "$($compact.Substring(0, 4))-$($compact.Substring(4, 4))"
}

function Clean-Text {
  param($Value)

  return ([string]$Value).Trim()
}

function Get-Cell {
  param($Values, [int]$Row, [int]$Column)

  return Clean-Text $Values[$Row, $Column]
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $null

try {
  $wb = $excel.Workbooks.Open($Workbook)
  $sheet = $wb.Worksheets.Item(1)
  $used = $sheet.UsedRange
  $rows = $used.Rows.Count
  $values = $used.Value2

  $records = [System.Collections.Generic.List[object]]::new()
  for ($r = 2; $r -le $rows; $r++) {
    $title = Get-Cell $values $r 2
    if (-not $title) { continue }

    $categoryRaw = Get-Cell $values $r 10
    $categoryParts = $categoryRaw -split "\|"
    $field = if ($categoryParts.Count -ge 1) { $categoryParts[0].Trim() } else { "" }
    $categoryQuartile = if ($categoryParts.Count -ge 2) { $categoryParts[1].Trim() } else { "" }
    $categoryRank = if ($categoryParts.Count -ge 3) { $categoryParts[2].Trim() } else { "" }

    $records.Add([ordered]@{
      title = $title
      abbreviatedTitle = Get-Cell $values $r 3
      publisher = Get-Cell $values $r 4
      issn = Normalize-Issn (Get-Cell $values $r 11)
      eissn = Normalize-Issn (Get-Cell $values $r 12)
      field = $field
      quartile = if ($categoryQuartile) { $categoryQuartile } else { Get-Cell $values $r 9 }
      categoryRank = $categoryRank
      jif = Get-Cell $values $r 5
      fiveYearJif = Get-Cell $values $r 6
      jci = Get-Cell $values $r 8
      jifRank = Get-Cell $values $r 18
    })
  }

  $metadata = [ordered]@{
    source = $Workbook
    sourceName = "JCR Impact Factor 2025"
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
  Write-Host "Wrote $($records.Count) JCR records to $outPath"
}
finally {
  if ($wb) { $wb.Close($false) }
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
