#!/bin/sh
# Screenshots of preview.html with headless Chrome, then per-section crops. Run: sh shoot.sh
cd "$(dirname "$0")"
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
U="file://$(pwd)/preview.html"
P="${TMPDIR:-/tmp}/mutick-charts-chrome"
shot() { "$C" --headless=new --hide-scrollbars --force-color-profile=srgb --user-data-dir="$P" --virtual-time-budget=4000 --window-size="$1" --screenshot="shots/$2.png" "$U" >/dev/null 2>&1; echo "shots/$2.png"; }
shot 1440,2200 preview-full
# crop: height width y-offset x-offset (pixels of the 1440-wide full shot)
crop() { sips -c "$1" "$2" --cropOffset "$3" "$4" shots/preview-full.png --out "shots/$5.png" >/dev/null; echo "shots/$5.png"; }
crop 560 1440 185 0 preview-kpis
crop 640 1440 790 0 preview-bars
crop 470 1440 1465 0 preview-compare
