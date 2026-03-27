<#
.SYNOPSIS
  Push a dotenv file to Vercel using `vercel env add` (no native bulk import in CLI).

.DESCRIPTION
  Run from apps/web with the project linked (`.vercel` or `vercel link`).
  Skips blank lines and lines starting with #.
  Uses --force so existing keys are overwritten.

.EXAMPLE
  cd apps/web
  .\scripts\push-env-to-vercel.ps1 -Path .env.local -Environment production

.EXAMPLE
  Dry run (prints keys only):
  .\scripts\push-env-to-vercel.ps1 -Path .env.local -Environment production -DryRun
#>
param(
  [string] $Path = ".env.local",
  [ValidateSet("production", "preview", "development")]
  [string] $Environment = "production",
  [switch] $DryRun,
  [switch] $Force = $true
)

$ErrorActionPreference = "Stop"
# scripts/ lives under apps/web — Vercel project link is per apps/web
$webRoot = Split-Path -Parent $PSScriptRoot
Set-Location $webRoot

if (-not (Test-Path $Path)) {
  Write-Error "File not found: $Path (cwd: $(Get-Location))"
}

function Test-SensitiveName([string] $name) {
  $n = $name.ToUpperInvariant()
  foreach ($frag in @("SECRET", "KEY", "TOKEN", "PASSWORD", "PRIVATE", "DSN", "CREDENTIAL")) {
    if ($n.Contains($frag)) { return $true }
  }
  return $false
}

function Parse-DotenvLine([string] $line) {
  $t = $line.Trim()
  if ($t.Length -eq 0 -or $t.StartsWith("#")) { return $null }
  $eq = $t.IndexOf("=")
  if ($eq -lt 1) { return $null }
  $key = $t.Substring(0, $eq).Trim()
  $val = $t.Substring($eq + 1).Trim()
  if ($val.Length -ge 2 -and $val.StartsWith('"') -and $val.EndsWith('"')) {
    $val = $val.Substring(1, $val.Length - 2).Replace('\"', '"')
  } elseif ($val.Length -ge 2 -and $val.StartsWith("'") -and $val.EndsWith("'")) {
    $val = $val.Substring(1, $val.Length - 2).Replace("''", "'")
  }
  if ($key.Length -eq 0) { return $null }
  return [PSCustomObject]@{ Key = $key; Value = $val }
}

$lines = Get-Content -LiteralPath $Path -Encoding UTF8
$count = 0
foreach ($line in $lines) {
  $pair = Parse-DotenvLine $line
  if ($null -eq $pair) { continue }
  if ($pair.Value.Length -eq 0) {
    Write-Warning "Skipping empty value: $($pair.Key)"
    continue
  }
  $sensitive = Test-SensitiveName $pair.Key
  $count++
  if ($DryRun) {
    Write-Host "[dry-run] $($pair.Key) sensitive=$sensitive"
    continue
  }
  $argList = @("env", "add", $pair.Key, $Environment)
  if ($Force) { $argList += "--force" }
  if ($sensitive) { $argList += "--sensitive" }
  $pair.Value | & vercel @argList
  if ($LASTEXITCODE -ne 0) {
    Write-Error "vercel env add failed for $($pair.Key) (exit $LASTEXITCODE)"
  }
  Write-Host "OK $($pair.Key)"
}

Write-Host "Done. Variables processed: $count"
