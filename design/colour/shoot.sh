#!/bin/sh
# Screenshots of preview.html with headless Chrome. Run: sh shoot.sh
cd "$(dirname "$0")"
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
U="file://$(pwd)/preview.html"
P="${TMPDIR:-/tmp}/mutick-colour-chrome"
shot() { "$C" --headless=new --hide-scrollbars --force-color-profile=srgb --user-data-dir="$P" --virtual-time-budget=3000 --window-size="$1" --screenshot="shots/$2.png" "$3" >/dev/null 2>&1; echo "shots/$2.png"; }
for p in current ink brass mono; do
  shot 1440,900 "desk-$p" "$U?p=$p&v=desk&bare=1"
  shot 1440,900 "start-$p" "$U?p=$p&v=start&bare=1"
done
shot 1520,1500 compare-desk "$U?v=desk"
shot 1520,1500 compare-start "$U?v=start"
