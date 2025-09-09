@echo off
REM PROJECT: CSC Adherence Timer — build1 baseline | v0.5-build1 | 2025-09-08 21:59:53
set PORT=5173
pushd "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  echo Starting local server at http://localhost:%PORT%/
  python -m http.server %PORT%
) else (
  echo Python not found. Attempting PowerShell fallback...
  powershell -NoProfile -Command "cd $PSScriptRoot; $Listener = New-Object System.Net.HttpListener; $Listener.Prefixes.Add('http://*:8080/'); $Listener.Start(); Write-Host 'Minimal listener running on 8080. Press Ctrl+C to quit.'; while ($true) { $ctx=$Listener.GetContext(); $resp=$ctx.Response; $path = Join-Path $PSScriptRoot ($ctx.Request.Url.AbsolutePath.TrimStart('/')); if ([string]::IsNullOrWhiteSpace($path)) { $path = Join-Path $PSScriptRoot 'index.html' }; if (Test-Path $path) { $bytes=[System.IO.File]::ReadAllBytes($path); $resp.ContentLength64=$bytes.Length; $resp.OutputStream.Write($bytes,0,$bytes.Length) } else { $resp.StatusCode=404 }; $resp.Close() }"
)
popd
pause
