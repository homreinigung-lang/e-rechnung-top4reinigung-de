param(
  [Parameter(Mandatory=$true)][string]$SourceName,
  [string]$MigrationRoot = "..\gebcalc-migration"
)

$ErrorActionPreference = "Stop"

function Read-PlainSecret([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) { throw "pg_dump is not installed or not on PATH." }
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "node is not installed or not on PATH." }

$sourceDir = Join-Path $MigrationRoot $SourceName
$dbDir = Join-Path $sourceDir "db"
$storageDir = Join-Path $sourceDir "storage"
New-Item -ItemType Directory -Force -Path $dbDir, $storageDir | Out-Null

$dbUrl = Read-PlainSecret "PostgreSQL connection URI for $SourceName"
if ([string]::IsNullOrWhiteSpace($dbUrl)) { throw "No database URI entered." }

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$dump = Join-Path $dbDir "$SourceName-$stamp.dump"
$meta = Join-Path $dbDir "$SourceName-$stamp.meta.txt"

& $pgDump.Source --dbname=$dbUrl --format=custom --no-owner --no-privileges --file=$dump
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
$dbUrl = $null

$hash = (Get-FileHash -Algorithm SHA256 -Path $dump).Hash.ToLowerInvariant()
$pgVersion = (& $pgDump.Source --version) -join " "
@(
  "source=$SourceName",
  "created_utc=$stamp",
  "pg_dump_version=$pgVersion",
  "dump_file=$([IO.Path]::GetFileName($dump))",
  "sha256=$hash"
) | Set-Content -Encoding UTF8 $meta
"$hash  $([IO.Path]::GetFileName($dump))" | Set-Content -Encoding ASCII "$dump.sha256"

Write-Host "BACKUP_OK: $dump"
Write-Host "CHECKSUM_OK: $dump.sha256"
Write-Host "META_OK: $meta"

$supabaseUrl = Read-Host -Prompt "Supabase project URL for $SourceName"
if ([string]::IsNullOrWhiteSpace($supabaseUrl)) { throw "No Supabase URL entered." }
$supabaseSecret = Read-PlainSecret "Supabase secret/service-role key for $SourceName"
if ([string]::IsNullOrWhiteSpace($supabaseSecret)) { throw "No Supabase secret key entered." }

$oldUrl = $env:SUPABASE_URL
$oldSecret = $env:SUPABASE_SECRET_KEY
try {
  $env:SUPABASE_URL = $supabaseUrl
  $env:SUPABASE_SECRET_KEY = $supabaseSecret
  & $node.Source "scripts/download-storage.mjs" $SourceName $storageDir
  if ($LASTEXITCODE -ne 0) { throw "Storage download failed with exit code $LASTEXITCODE" }
}
finally {
  $env:SUPABASE_URL = $oldUrl
  $env:SUPABASE_SECRET_KEY = $oldSecret
  $supabaseSecret = $null
}

Write-Host "SOURCE_BACKUP_OK: $SourceName"
Write-Host "OUTPUT: $sourceDir"
