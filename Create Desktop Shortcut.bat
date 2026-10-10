@echo off
rem Puts a "Mikra" shortcut on your Windows desktop.
setlocal
cd /d "%~dp0"
rem The folder path goes to PowerShell through an environment variable, so a name with an
rem apostrophe (for example C:\Users\O'Brien) can't break or change the command.
set "HR_DIR=%~dp0"
powershell -NoProfile -NonInteractive -Command ^
  "$d = $env:HR_DIR;" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Mikra.lnk'));" ^
  "$s.TargetPath = (Join-Path $d 'run.bat');" ^
  "$s.WorkingDirectory = $d;" ^
  "$s.WindowStyle = 7;" ^
  "$s.Description = 'Mikra: learn Biblical Hebrew';" ^
  "$s.Save()"
if errorlevel 1 (echo Could not create the shortcut.) else (echo Shortcut created on your desktop.)
pause
