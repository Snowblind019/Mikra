@echo off
rem Mikra launcher for Windows.
setlocal
cd /d "%~dp0"

set "PY="
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
  if not errorlevel 1 set "PY=py -3"
)
if not defined PY (
  python -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  echo Python 3.8 or newer is needed.
  echo Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
  pause
  exit /b 1
)

rem Pronunciation audio uses edge-tts (optional). Try to install it once.
%PY% -c "import edge_tts" >nul 2>nul
if errorlevel 1 (
  if not exist ".tts-setup-tried" (
    echo Setting up pronunciation audio, one time, needs internet...
    type nul > ".tts-setup-tried"
    %PY% -m pip install --user --quiet --disable-pip-version-check edge-tts
    if errorlevel 1 echo Could not install edge-tts. The app works without it. See README.md.
  )
)

%PY% app\server.py %*
if errorlevel 1 pause
endlocal
