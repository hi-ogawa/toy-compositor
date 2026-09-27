#!/usr/bin/env bash
# Install ImageMagick 7 for text layers. Ubuntu runners only have ImageMagick 6,
# which has no `magick` command. The AppImage is extracted because runners lack FUSE.
set -euo pipefail

dir="$RUNNER_TEMP/imagemagick"
mkdir -p "$dir"
cd "$dir"
curl -fsSL -o magick.AppImage https://github.com/ImageMagick/ImageMagick/releases/download/7.1.2-32/ImageMagick-7.1.2-32-gcc-x86_64.AppImage
chmod +x magick.AppImage
./magick.AppImage --appimage-extract >/dev/null
mkdir -p bin
ln -s "$dir/squashfs-root/AppRun" bin/magick
echo "$dir/bin" >>"$GITHUB_PATH"
