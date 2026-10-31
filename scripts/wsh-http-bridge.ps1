# Requires Windows PowerShell 5.1 / .NET Framework; NO Node.js at runtime.
# Thin HTTP transport bridge; ALL fetching and browser control happens in cscript.
param(
  [Parameter(Mandatory=$true)][string]$QueueDir,
  [int]$Port = 8765
)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
New-Item -ItemType Directory -Force -Path $QueueDir | Out-Null
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

function Send-Json($context, [string]$text, [int]$status = 200) {
  $bytes = $utf8.GetBytes($text)
  $context.Response.StatusCode = $status
  $context.Response.ContentType = 'application/json; charset=utf-8'
  $context.Response.Headers.Set('Cache-Control', 'no-store')
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.Close()
}

try {
  $listener.Start()
  while ($listener.IsListening) {
    $pending = $listener.GetContextAsync()
    while (-not $pending.Wait(400)) {
      $beat = Join-Path $QueueDir 'heartbeat'
      if ((Test-Path $beat) -and
          ((Get-Date).ToUniversalTime() - (Get-Item $beat).LastWriteTimeUtc).TotalSeconds -gt 12) {
        $listener.Stop()
        break
      }
    }
    if (-not $listener.IsListening) { break }
    $context = $pending.Result
    try {
      $origin = $context.Request.Headers.Get('Origin')
      $allowedOrigin = ($null -eq $origin -or $origin -eq 'null' -or
        $origin -eq "http://127.0.0.1:$Port" -or $origin -eq "http://localhost:$Port")
      $hostAllowed = $context.Request.Url.Host -eq '127.0.0.1'
      if (-not $allowedOrigin -or -not $hostAllowed) {
        Send-Json $context '{"success":false,"error":"Origin or host not permitted"}' 403
        continue
      }
      if ($null -ne $origin) {
        $context.Response.Headers.Set('Access-Control-Allow-Origin', $origin)
        $context.Response.Headers.Set('Vary', 'Origin')
      }
      $context.Response.Headers.Set('Access-Control-Allow-Methods', 'GET, OPTIONS')
      $context.Response.Headers.Set('Access-Control-Allow-Headers', 'Content-Type')
      if ($context.Request.HttpMethod -eq 'OPTIONS') {
        $context.Response.StatusCode = 204
        $context.Response.Close()
        continue
      }
      if ($context.Request.HttpMethod -ne 'GET') {
        Send-Json $context '{"success":false,"error":"Method not allowed"}' 405
        continue
      }
      if ($context.Request.Url.AbsolutePath -eq '/health') {
        Send-Json $context '{"success":true,"engine":"cscript"}'
        continue
      }
      if ($context.Request.Url.AbsolutePath -ne '/fetch') {
        Send-Json $context '{"success":false,"error":"Only /fetch is supported"}' 404
        continue
      }
      $url = [System.Web.HttpUtility]::ParseQueryString($context.Request.Url.Query).Get('url')
      $mode = [System.Web.HttpUtility]::ParseQueryString($context.Request.Url.Query).Get('mode')
      if ([string]::IsNullOrEmpty($url)) {
        Send-Json $context '{"success":false,"error":"Missing URL"}' 400
        continue
      }
      if ([string]::IsNullOrEmpty($mode)) { $mode = 'static' }
      $id = [guid]::NewGuid().ToString()
      $reqPath = Join-Path $QueueDir "$id.req"
      $tmpPath = Join-Path $QueueDir "$id.tmp"
      $resPath = Join-Path $QueueDir "$id.res"
      $payload = @{ url = $url; mode = $mode } | ConvertTo-Json -Compress
      [System.IO.File]::WriteAllText($tmpPath, $payload, $utf8)
      [System.IO.File]::Move($tmpPath, $reqPath)
      $start = Get-Date
      while (-not (Test-Path $resPath) -and ((Get-Date) - $start).TotalSeconds -lt 40) {
        Start-Sleep -Milliseconds 100
      }
      if (Test-Path $resPath) {
        $result = [System.IO.File]::ReadAllText($resPath, $utf8)
        Remove-Item -LiteralPath $resPath -Force -ErrorAction SilentlyContinue
        Send-Json $context $result
      } else {
        Send-Json $context '{"success":false,"error":"cscript backend timed out"}' 504
      }
    } catch {
      if ($context.Response.OutputStream.CanWrite) {
        Send-Json $context '{"success":false,"error":"HTTP bridge failed"}' 500
      }
    }
  }
} finally {
  $listener.Close()
}
