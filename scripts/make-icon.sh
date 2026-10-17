#!/bin/bash
# Gera os ícones a partir de build/icon.svg usando ferramentas do macOS:
#   build/icon.icns (macOS), build/icon.ico (Windows) e src/assets/icon.png (janela no Linux).
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

# ICO com imagens PNG embutidas (formato aceito desde o Windows Vista)
ICO_SIZES="16 24 32 48 64 128 256"
for size in $ICO_SIZES; do
  sips -z $size $size "$SRC" --out "$TMP/ico-$size.png" >/dev/null
done
node -e '
  const fs = require("fs");
  const [dir, out, ...sizes] = process.argv.slice(1);
  const images = sizes.map((s) => ({ size: Number(s), data: fs.readFileSync(`${dir}/ico-${s}.png`) }));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(img.size >= 256 ? 0 : img.size, e);
    header.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(img.data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
  });
  fs.writeFileSync(out, Buffer.concat([header, ...images.map((i) => i.data)]));
' "$TMP" build/icon.ico $ICO_SIZES

mkdir -p src/assets
sips -z 512 512 "$SRC" --out src/assets/icon.png >/dev/null

echo "ícones gerados: build/icon.icns, build/icon.ico, src/assets/icon.png"
