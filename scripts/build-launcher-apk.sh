#!/usr/bin/env bash
# Builds the signed Android launcher APK (no game inside: it downloads game versions from GitHub releases).
# Same toolchain as build-apk.sh: aapt2 + javac + d8 + zipalign + apksigner. Signed with the same key as the
# old stand-alone app, so it installs over it and keeps the saves.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK:-/opt/android-sdk}"
BT="${BUILD_TOOLS:-$SDK/android-14}"
PLATFORM="${ANDROID_JAR:-$SDK/android-34/android.jar}"
OUT="$ROOT/android/build-launcher"
APK="$ROOT/launcher/android/WreckingYard-Launcher.apk"
rm -rf "$OUT" && mkdir -p "$OUT/res" "$OUT/classes" "$OUT/assets/launcher" "$OUT/gen"
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  mkdir -p "$OUT/res-src/mipmap-${d%%:*}"
  node "$ROOT/scripts/resize-icon.mjs" "$ROOT/electron/icon.png" "${d##*:}" "$OUT/res-src/mipmap-${d%%:*}/ic_launcher.png"
done
cp -r "$ROOT/android/res/"* "$OUT/res-src/"
cp -r "$ROOT/launcher/ui/"* "$OUT/assets/launcher/"
cp "$ROOT/public/img/logo.png" "$OUT/assets/launcher/logo.png"
"$BT/aapt2" compile --dir "$OUT/res-src" -o "$OUT/res/res.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$PLATFORM" --manifest "$ROOT/launcher/android/AndroidManifest.xml" \
  -A "$OUT/assets" --java "$OUT/gen" "$OUT/res/res.zip" --auto-add-overlay
javac --release 8 -parameters -classpath "$PLATFORM" -d "$OUT/classes" $(find "$ROOT/launcher/android/src" "$OUT/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$PLATFORM" --output "$OUT" $(find "$OUT/classes" -name '*.class')
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
KS="${KEYSTORE:-$ROOT/android/release.keystore}"
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:wreckingyard --key-pass pass:wreckingyard --ks-key-alias wreckingyard --out "$APK" "$OUT/aligned.apk"
"$BT/apksigner" verify "$APK" && echo "Launcher APK ready: $APK"
