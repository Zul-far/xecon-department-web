@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
powershell.exe -NoProfile -Command "$ErrorActionPreference = 'Stop'; $tracks = @(Get-ChildItem -LiteralPath './music' -File | Where-Object { $_.Extension -match '^\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$' } | Sort-Object Name | ForEach-Object { $_.Name }); $json = ConvertTo-Json -InputObject $tracks; $text = 'window.GALLERY_TRACKS = ' + $json + ';'; [IO.File]::WriteAllText((Join-Path (Get-Location) 'music/tracks.js'), $text, (New-Object Text.UTF8Encoding $false)); Write-Host ('Playlist updated: ' + $tracks.Count + ' song(s).'); Write-Host 'Upload music/tracks.js together with your audio files, then refresh the gallery.'"
if errorlevel 1 (
  echo Playlist update failed. Check that the music folder exists and is writable.
  popd
  pause
  exit /b 1
)
popd
pause
