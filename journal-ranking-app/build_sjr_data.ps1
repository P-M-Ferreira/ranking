param(
  [string]$Csv = "E:\@VScode\rankings\scimagojr 2025.csv",
  [string]$OutFile = ".\data\sjr-2025.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Issn {
  param([string]$Value)

  $compact = ($Value.ToUpperInvariant() -replace "[^0-9X]", "")
  if ($compact.Length -ne 8) { return "" }
  return "$($compact.Substring(0, 4))-$($compact.Substring(4, 4))"
}

function Get-Issns {
  param([string]$Value)

  $issns = [System.Collections.Generic.List[string]]::new()
  foreach ($part in ($Value -split ",")) {
    $issn = Normalize-Issn $part
    if ($issn -and -not $issns.Contains($issn)) {
      $issns.Add($issn)
    }
  }
  return $issns
}

function Get-Categories {
  param([string]$Value)

  $categories = [System.Collections.Generic.List[object]]::new()
  foreach ($part in ($Value -split ";")) {
    $text = $part.Trim()
    if (-not $text) { continue }

    $match = [regex]::Match($text, "^(?<field>.+?)\s+\((?<quartile>Q[1-4])\)$")
    if ($match.Success) {
      $categories.Add([ordered]@{
        field = $match.Groups["field"].Value.Trim()
        quartile = $match.Groups["quartile"].Value.Trim()
      })
    }
    else {
      $categories.Add([ordered]@{
        field = $text
        quartile = ""
      })
    }
  }
  return $categories
}

$headers = @(
  "Rank",
  "Sourceid",
  "Title",
  "Type",
  "Issn",
  "Publisher",
  "Open Access",
  "Open Access Diamond",
  "SJR",
  "SJR Best Quartile",
  "H index",
  "Total Docs. (2025)",
  "Total Docs. (3years)",
  "Total Refs.",
  "Total Citations (3years)",
  "Citable Docs. (3years)",
  "Citations / Doc. (2years)",
  "Ref. / Doc.",
  "%Female",
  "Overton",
  "Country",
  "Region",
  "Publisher Duplicate",
  "Coverage",
  "Categories",
  "Areas"
)

$rows = Get-Content -LiteralPath $Csv | Select-Object -Skip 1 | ConvertFrom-Csv -Delimiter ";" -Header $headers
$records = [System.Collections.Generic.List[object]]::new()

foreach ($row in $rows) {
  if ($row.Type -and $row.Type -ne "journal") { continue }

  $issns = @(Get-Issns $row.Issn)
  $categories = @(Get-Categories $row.Categories)
  if ($categories.Count -eq 0) {
    $categories.Add([ordered]@{ field = ""; quartile = $row."SJR Best Quartile" })
  }

  foreach ($category in $categories) {
    $records.Add([ordered]@{
      title = $row.Title
      issns = $issns
      issn = if ($issns.Count -gt 0) { $issns[0] } else { "" }
      sourceId = $row.Sourceid
      field = $category.field
      quartile = if ($category.quartile) { $category.quartile } else { $row."SJR Best Quartile" }
      bestQuartile = $row."SJR Best Quartile"
      sjr = $row.SJR
    })
  }
}

$metadata = [ordered]@{
  source = $Csv
  sourceName = "SCImago Journal Rank 2025"
  builtAt = (Get-Date).ToString("s")
  count = $records.Count
  records = $records
}

$outPath = Join-Path (Get-Location) $OutFile
$outDir = Split-Path -Parent $outPath
if (-not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$metadata | ConvertTo-Json -Depth 6 -Compress | Set-Content -LiteralPath $outPath -Encoding UTF8
Write-Host "Wrote $($records.Count) SJR category records to $outPath"
