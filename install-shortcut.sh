#!/usr/bin/env bash
# Adds "Mikra" to your Linux app menu (GNOME, KDE, Niri launchers that read .desktop files).
set -e
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"

# Desktop entries treat these characters specially, and a folder name containing them would
# break the launcher or change what it runs. Ask for a plain folder name instead.
case "$DIR" in
  *[\"\`\$\\%]* | *$'\n'*)
    echo "The folder path contains a character the app menu can't handle (\" \` \$ \\ or %):"
    echo "  $DIR"
    echo "Move the mikra folder somewhere with a plain name, for example ~/mikra, and run this again."
    exit 1
    ;;
esac

mkdir -p "$APPS"
chmod +x "$DIR/run.sh"
rm -f "$APPS/hebrew-reader.desktop"  # the old name of the app
cat > "$APPS/mikra.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Mikra
Comment=Learn Biblical Hebrew reading the Old Testament next to the KJV or Cornilescu
Exec="$DIR/run.sh"
Icon=$DIR/web/icon.svg
Terminal=false
Categories=Education;Languages;
EOF
update-desktop-database "$APPS" >/dev/null 2>&1 || true
echo "Added Mikra to your app menu: $APPS/mikra.desktop"
