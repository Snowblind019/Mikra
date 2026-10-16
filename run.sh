#!/usr/bin/env bash
# Mikra launcher for Linux and WSL.
# Usage: ./run.sh            start and open the app
#        ./run.sh --no-browser
#        ./run.sh --port 8800
set -u
cd "$(dirname "$(readlink -f "$0")")" || exit 1

find_python() {
  for p in python3 python; do
    if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' 2>/dev/null; then
      echo "$p"; return 0
    fi
  done
  return 1
}

PY="$(find_python)" || {
  echo "Python 3.8 or newer is needed."
  echo "  Fedora:        sudo dnf install python3"
  echo "  Ubuntu / WSL:  sudo apt install python3"
  exit 1
}

# Pronunciation audio uses edge-tts. It is optional; we try to set it up once in a private folder (.venv).
# The version is pinned, so a new release is never installed before it has been tried. To move to a newer one,
# change it here and delete the .venv folder.
EDGE_TTS="edge-tts==7.2.8"
# a setup that failed (no internet, say) is tried again a day later
find . -maxdepth 1 -name .tts-setup-tried -mtime +0 -exec rm -f {} + 2>/dev/null
if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
elif ! "$PY" -c "import edge_tts" >/dev/null 2>&1 && [ ! -f ".tts-setup-tried" ]; then
  echo "Setting up pronunciation audio (one time, needs internet)..."
  touch .tts-setup-tried
  PIPOPTS="--quiet --disable-pip-version-check --timeout 15 --retries 1"
  if "$PY" -m venv .venv >/dev/null 2>&1 && .venv/bin/python -m pip install $PIPOPTS "$EDGE_TTS"; then
    PY=".venv/bin/python"
    rm -f .tts-setup-tried
    echo "Audio is ready."
  else
    rm -rf .venv
    if "$PY" -m pip install --user $PIPOPTS "$EDGE_TTS" >/dev/null 2>&1; then
      rm -f .tts-setup-tried
      echo "Audio is ready."
    else
      echo "Could not set up audio. The app works without it (your browser's Hebrew voice is used if it has one)."
      echo "It will be tried again tomorrow. On Ubuntu and WSL it may need: sudo apt install python3-venv"
      echo "See README.md for more."
    fi
  fi
fi

exec "$PY" app/server.py "$@"
