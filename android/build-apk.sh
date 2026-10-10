#!/bin/sh
# Builds android/build/Mikra.apk without Gradle or Android Studio, using the Android tools that Debian and Ubuntu package:
#
#   sudo apt install default-jdk-headless aapt dalvik-exchange zipalign apksigner android-sdk-platform-23
#
# The APK is signed with android/mikra-release.keystore. The first build creates it, with a random password saved
# next to it in mikra-release.keystore.txt. Keep both files safe and private: an update to an installed app must be
# signed with the same key, otherwise the phone refuses it and the app has to be uninstalled first (which deletes
# its saved progress). Neither file is ever committed (see .gitignore).
#
# Settings (environment variables): ANDROID_JAR, BUILD_TOOLS, MIKRA_KEYSTORE, MIKRA_KEYSTORE_PASS.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
BUILD_TOOLS=${BUILD_TOOLS:-/usr/lib/android-sdk/build-tools/debian}
KEYSTORE=${MIKRA_KEYSTORE:-$HERE/mikra-release.keystore}
OUT=$HERE/build

for tool in javac keytool aapt zipalign apksigner; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing $tool. See the apt install line at the top of this script."; exit 1; }
done
[ -f "$ANDROID_JAR" ] || { echo "Missing $ANDROID_JAR (package android-sdk-platform-23)."; exit 1; }
DX="$BUILD_TOOLS/dx"
[ -x "$DX" ] || DX=$(command -v dx || command -v dalvik-exchange || true)
[ -n "$DX" ] || { echo "Missing dx (package dalvik-exchange)."; exit 1; }
[ -f "$ROOT/data/mikra.db" ] || { echo "Missing data/mikra.db. Build it first: python build/build_db.py"; exit 1; }

echo "1/5 compiling"
rm -rf "$OUT"
mkdir -p "$OUT/stubs" "$OUT/classes" "$OUT/assets/web"
JAVAC="javac -source 8 -target 8 -Xlint:-options -encoding UTF-8 -nowarn -bootclasspath $ANDROID_JAR"
# stand-ins for a few newer Android classes, needed to compile only (the phone has the real ones)
$JAVAC -d "$OUT/stubs" "$HERE"/stubs/android/webkit/*.java
$JAVAC -classpath "$OUT/stubs" -d "$OUT/classes" "$HERE"/src/io/github/snowblind019/mikra/*.java "$HERE"/app/io/github/snowblind019/mikra/*.java

echo "2/5 converting to Android bytecode"
"$DX" --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"

echo "3/5 packing the app, the web pages and the database"
cp -R "$ROOT/web/." "$OUT/assets/web/"
find "$OUT/assets" -name '.DS_Store' -delete
cp "$ROOT/data/mikra.db" "$OUT/assets/mikra.db"
aapt package -f -M "$HERE/AndroidManifest.xml" -S "$HERE/res" -A "$OUT/assets" -I "$ANDROID_JAR" -F "$OUT/unsigned.apk"
(cd "$OUT" && aapt add -f unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "4/5 signing"
PASSFILE="$KEYSTORE.txt"
if [ ! -f "$KEYSTORE" ]; then
  PASS=${MIKRA_KEYSTORE_PASS:-$(od -An -N18 -tx1 /dev/urandom | tr -d ' \n')}
  keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 -alias mikra -keyalg RSA -keysize 3072 -validity 36500 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=Mikra, O=Snowblind019" >/dev/null 2>&1
  printf '%s\n' "$PASS" > "$PASSFILE"
  chmod 600 "$KEYSTORE" "$PASSFILE"
  echo "   created $KEYSTORE (password in $PASSFILE): keep both safe"
fi
PASS=${MIKRA_KEYSTORE_PASS:-$(cat "$PASSFILE")}
MIKRA_KS_PASS=$PASS apksigner sign --ks "$KEYSTORE" --ks-key-alias mikra --ks-pass env:MIKRA_KS_PASS --key-pass env:MIKRA_KS_PASS \
  --out "$OUT/Mikra.apk" "$OUT/aligned.apk"

echo "5/5 checking"
apksigner verify "$OUT/Mikra.apk"
rm -f "$OUT/unsigned.apk" "$OUT/aligned.apk" "$OUT/Mikra.apk.idsig"
ls -l "$OUT/Mikra.apk"
echo "Done: $OUT/Mikra.apk"
