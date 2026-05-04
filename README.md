# Journal Ranking Explorer

Static browser app for exploring the ABDC 2025 Journal Quality List, ABS/AJG 2024, JCR 2025 metrics, and SJR 2025 quartiles.

## Run

```powershell
node server.js
```

Open `http://localhost:5178`.

## Rebuild ABDC Data

```powershell
powershell -ExecutionPolicy Bypass -File .\build_abdc_data.ps1
```

## Rebuild ABS/AJG Data

```powershell
powershell -ExecutionPolicy Bypass -File .\build_abs_data.ps1
```

ABS/AJG source file: `E:\@VScode\rankings\ABS2024.xlsx`

## Rebuild SJR Data

```powershell
powershell -ExecutionPolicy Bypass -File .\build_sjr_data.ps1
```

SJR source file: `E:\@VScode\rankings\scimagojr 2025.csv`

## Rebuild JCR Data

```powershell
powershell -ExecutionPolicy Bypass -File .\build_jcr_data.ps1
```

JCR source file: `E:\@VScode\rankings\JCR-ImapctFactor-2025.xlsx`

## Imported CSV Matching

The app matches preloaded and imported ranking rows to ABDC journals by ISSN, eISSN, or normalized journal title. Imported rankings are stored in the browser's local storage.

Accepted columns:

- ABS/AJG: `title`, `issn`, `eissn`, `field`, `abs`, `ajg`, `rating`, `category`
- JCR: `title`, `issn`, `eissn`, `category`, `field`, `jif`, `jci`, `ais`, `article influence score`, `quartile`
- SJR/JSR: `title`, `issn`, `eissn`, `field`, `category`, `quartile`, `sjr`, `jsr`
