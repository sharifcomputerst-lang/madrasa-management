#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME=/tmp/android-setup/jdk-17.0.21.1+2
export PATH="$JAVA_HOME/bin:$PATH"
SDK=/tmp/android-setup/sdk
BT=$SDK/build-tools/34.0.0
PLAT=$SDK/platforms/android-34/android.jar
BUILD="$ROOT/build"

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/out"

echo "[1/7] aapt2 compile resources"
"$BT/aapt2" compile --dir "$ROOT/res" -o "$BUILD/res.zip"

echo "[2/7] aapt2 link"
"$BT/aapt2" link \
  -I "$PLAT" \
  --manifest "$ROOT/AndroidManifest.xml" \
  -A "$ROOT/assets" \
  --java "$BUILD/gen" \
  -o "$BUILD/base.apk" \
  "$BUILD/res.zip"
"$BT/aapt2" link --version-id 1 >/dev/null 2>&1 || true

echo "[3/7] javac"
find "$ROOT/java" "$BUILD/gen" -name '*.java' > "$BUILD/sources.txt"
"$JAVA_HOME/bin/javac" --release 11 -classpath "$PLAT" -d "$BUILD/classes" @"$BUILD/sources.txt"

echo "[4/7] d8 dex"
find "$BUILD/classes" -name '*.class' > "$BUILD/classes.txt"
"$BT/d8" --release --lib "$PLAT" --min-api 24 --output "$BUILD/out" @"$BUILD/classes.txt"

echo "[5/7] pack dex into apk"
cd "$BUILD/out"
zip -q -j "$BUILD/base.apk" classes.dex
cd "$ROOT"

echo "[6/7] zipalign"
"$BT/zipalign" -f -p 4 "$BUILD/base.apk" "$BUILD/aligned.apk"

echo "[7/7] sign"
KS="$ROOT/tools/madrasa.keystore"
if [ ! -f "$KS" ]; then
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore "$KS" -alias madrasa \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass madrasa123 -keypass madrasa123 \
    -dname "CN=Madrasa Management, OU=Madrasa, O=Madrasa, C=BD"
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:madrasa123 --key-pass pass:madrasa123 \
  --out "$ROOT/MadrasaManagement.apk" "$BUILD/aligned.apk"

"$BT/aapt" dump badging "$ROOT/MadrasaManagement.apk" | head -5
"$BT/apksigner" verify --print-certs "$ROOT/MadrasaManagement.apk" | head -3
echo "DONE: $ROOT/MadrasaManagement.apk"
