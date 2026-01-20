#!/bin/bash
# Generates properly sized .icns file for macOS with all Retina sizes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SOURCE="$ROOT_DIR/build/icon.png"
ICONSET="$ROOT_DIR/build/Kowalski.iconset"
OUTPUT="$ROOT_DIR/build/icon.icns"

echo "🎨 Generating macOS icon with Retina support..."

# Check source exists
if [ ! -f "$SOURCE" ]; then
    echo "❌ Source icon not found: $SOURCE"
    echo "   Please ensure build/icon.png exists (should be 1024x1024 or larger)"
    exit 1
fi

# Create iconset directory
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# Generate all required sizes for Retina displays
echo "   Generating icon sizes..."
sips -z 16 16     "$SOURCE" --out "$ICONSET/icon_16x16.png" > /dev/null
sips -z 32 32     "$SOURCE" --out "$ICONSET/icon_16x16@2x.png" > /dev/null
sips -z 32 32     "$SOURCE" --out "$ICONSET/icon_32x32.png" > /dev/null
sips -z 64 64     "$SOURCE" --out "$ICONSET/icon_32x32@2x.png" > /dev/null
sips -z 128 128   "$SOURCE" --out "$ICONSET/icon_128x128.png" > /dev/null
sips -z 256 256   "$SOURCE" --out "$ICONSET/icon_128x128@2x.png" > /dev/null
sips -z 256 256   "$SOURCE" --out "$ICONSET/icon_256x256.png" > /dev/null
sips -z 512 512   "$SOURCE" --out "$ICONSET/icon_256x256@2x.png" > /dev/null
sips -z 512 512   "$SOURCE" --out "$ICONSET/icon_512x512.png" > /dev/null
sips -z 1024 1024 "$SOURCE" --out "$ICONSET/icon_512x512@2x.png" > /dev/null

# Convert iconset to icns
echo "   Converting to .icns format..."
iconutil -c icns "$ICONSET" -o "$OUTPUT"

# Cleanup
rm -rf "$ICONSET"

echo "✅ Generated $OUTPUT with all Retina sizes"
echo "   Sizes: 16, 32, 64, 128, 256, 512, 1024 (including @2x variants)"
