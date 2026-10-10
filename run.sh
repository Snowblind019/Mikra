#!/usr/bin/env bash
# Mikra launcher for Linux and WSL.
# Usage: ./run.sh            start and open the app
#        ./run.sh --no-browser
#        ./run.sh --port 8800
set -u
cd "$(dirname "$(readlink -f "$0")")"

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
if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
elif ! "$PY" -c "import edge_tts" >/dev/null 2>&1 && [ ! -f ".tts-setup-tried" ]; then
  echo "Setting up pronunciation audio (one time, needs internet)..."
  touch .tts-setup-tried
  if "$PY" -m venv .venv >/dev/null 2>&1 && .venv/bin/python -m pip install --quiet --disable-pip-version-check edge-tts; then
    PY=".venv/bin/python"
    echo "Audio is ready."
  else
    rm -rf .venv
    "$PY" -m pip install --user --quiet edge-tts >/dev/null 2>&1 \
      || "$PY" -m pip install --user --quiet --break-system-packages edge-tts >/dev/null 2>&1 \
      || echo "Could not install edge-tts. The app works without it; audio will use your browser's voice if it has Hebrew. See README.md."
  fi
fi

exec "$PY" app/server.py "$@"
