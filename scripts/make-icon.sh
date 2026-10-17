#!/bin/bash
# Gera build/icon.icns a partir de build/icon.svg usando apenas ferramentas do macOS.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

qlmanage -t -s 1024 -o "$TMP" build/icon.svg >/dev/null
SRC="$TMP/icon.svg.png"
SET="$TMP/icon.iconset"
mkdir "$SET"
for size in 16 32 128 256 512; do
  sips -z $size $size "$SRC" --out "$SET/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) "$SRC" --out "$SET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o build/icon.icns
echo "build/icon.icns gerado"
