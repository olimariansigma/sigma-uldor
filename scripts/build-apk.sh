#!/usr/bin/env bash
# Builds a signed APK without Gradle: aapt2 + javac + d8 + zipalign + apksigner.
# Needs: JDK 17+, ANDROID_SDK (build-tools 34 + platform 34). Run `npm run build` first.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK:-/opt/android-sdk}"
BT="${BUILD_TOOLS:-$SDK/android-14}"          # build-tools 34 zip extracts to android-14
PLATFORM="${ANDROID_JAR:-$SDK/android-34/android.jar}"
OUT="$ROOT/android/build"
VERSION="$(node -p "require('$ROOT/package.json').version")"
APK="$ROOT/build/WreckingYard-$VERSION-Android.apk"
rm -rf "$OUT" && mkdir -p "$OUT/res" "$OUT/classes" "$OUT/assets/game" "$OUT/gen"

# icons
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  mkdir -p "$OUT/res-src/mipmap-${d%%:*}"
  node "$ROOT/scripts/resize-icon.mjs" "$ROOT/electron/icon.png" "${d##*:}" "$OUT/res-src/mipmap-${d%%:*}/ic_launcher.png"
done
cp -r "$ROOT/android/res/"* "$OUT/res-src/"

"$BT/aapt2" compile --dir "$OUT/res-src" -o "$OUT/res/res.zip"
cp -r "$ROOT/dist/"* "$OUT/assets/game/"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$PLATFORM" --manifest "$ROOT/android/AndroidManifest.xml" \
  -A "$OUT/assets" --java "$OUT/gen" "$OUT/res/res.zip" --auto-add-overlay -0 js
javac --release 11 -classpath "$PLATFORM" -d "$OUT/classes" $(find "$ROOT/android/src" "$OUT/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$PLATFORM" --output "$OUT" $(find "$OUT/classes" -name '*.class')
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

KS="${KEYSTORE:-$ROOT/android/release.keystore}"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass wreckingyard -keypass wreckingyard -alias wreckingyard \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Wrecking Yard, O=Wrecking Yard, C=US" >/dev/null 2>&1
fi
mkdir -p "$ROOT/build"
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:wreckingyard --key-pass pass:wreckingyard --ks-key-alias wreckingyard \
  --out "$APK" "$OUT/aligned.apk"
"$BT/apksigner" verify "$APK" && echo "APK ready: $APK"
