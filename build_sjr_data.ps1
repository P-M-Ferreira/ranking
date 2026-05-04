param(
  [string]$Csv = "E:\@VScode\rankings\scimagojr 2025.csv",
  [string]$JcrFile = ".\data\jcr-2025.json",
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

function Normalize-Title {
  param([string]$Value)

  $text = ([string]$Value).ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD)
  $text = [regex]::Replace($text, "\p{Mn}", "")
  $text = $text.Replace("&", "and")
  return [regex]::Replace($text, "[^a-z0-9]+", "")
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

function Add-Jcr-Key {
  param($Keys, $Record)

  $values = [System.Collections.Generic.List[string]]::new()
  if ($Record.PSObject.Properties.Name -contains "issns" -and $Record.issns) {
    foreach ($value in @($Record.issns)) {
      $values.Add([string]$value)
    }
  }
  foreach ($name in @("issn", "eissn")) {
    if ($Record.PSObject.Properties.Name -contains $name -and $Record.$name) {
      $values.Add([string]$Record.$name)
    }
  }

  foreach ($value in $values) {
    $issn = Normalize-Issn ([string]$value)
    if ($issn) { [void]$Keys.Issns.Add($issn) }
  }

  $titleValue = if ($Record.PSObject.Properties.Name -contains "title") { [string]$Record.title } else { "" }
  $title = Normalize-Title $titleValue
  if ($title) { [void]$Keys.Titles.Add($title) }
}

function Test-Jcr-Match {
  param($Keys, [string]$Title, [string[]]$Issns)

  foreach ($issn in $Issns) {
    if ($Keys.Issns.Contains($issn)) { return $true }
  }

  $titleKey = Normalize-Title $Title
  return $titleKey -and $Keys.Titles.Contains($titleKey)
}

$jcrPath = Join-Path (Get-Location) $JcrFile
if (-not (Test-Path -LiteralPath $jcrPath)) {
  throw "JCR data file not found: $jcrPath. Rebuild JCR data before rebuilding SJR data."
}

$jcrPayload = Get-Content -LiteralPath $jcrPath -Raw | ConvertFrom-Json
$jcrKeys = @{
  Issns = [System.Collections.Generic.HashSet[string]]::new()
  Titles = [System.Collections.Generic.HashSet[string]]::new()
}
foreach ($record in @($jcrPayload.records)) {
  Add-Jcr-Key $jcrKeys $record
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
$skippedNotInJcr = 0

foreach ($row in $rows) {
  if ($row.Type -and $row.Type -ne "journal") { continue }

  $issns = @(Get-Issns $row.Issn)
  if (-not (Test-Jcr-Match $jcrKeys $row.Title $issns)) {
    $skippedNotInJcr += 1
    continue
  }

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
  jcrFilter = $jcrPath
  builtAt = (Get-Date).ToString("s")
  count = $records.Count
  skippedNotInJcr = $skippedNotInJcr
  records = $records
}

$outPath = Join-Path (Get-Location) $OutFile
$outDir = Split-Path -Parent $outPath
if (-not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$metadata | ConvertTo-Json -Depth 6 -Compress | Set-Content -LiteralPath $outPath -Encoding UTF8
Write-Host "Wrote $($records.Count) JCR-matched SJR category records to $outPath; skipped $skippedNotInJcr SJR journals not found in JCR"
