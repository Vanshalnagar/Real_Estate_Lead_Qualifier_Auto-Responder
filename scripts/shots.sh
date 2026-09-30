#!/usr/bin/env bash
# Viewport screenshots of the running site (static layout: reduced motion forced, so appear
# animations render their final state) with the system Chrome's built-in headless
# --screenshot flag (no Playwright). Output: docs/visual-diff/<width>-<name>.png
#   bash scripts/shots.sh [widths] [sections]
# Defaults: all four widths, every home-page section (reached via #hash scrolling).
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME=${CHROME:-"/c/Program Files/Google/Chrome/Application/chrome.exe"}
BASE=${BASE:-http://127.0.0.1:5173}
OUT=docs/visual-diff
PROFILE=${PROFILE:-D:/.tmp/chrome-shots}
mkdir -p "$OUT"
WIDTHS=${1:-"1440 1200 810 390"}
SECTIONS=${2:-"hero:/ services:/#service-section about:/#about-us why:/#why-us process:/#process projects:/#projects reviews:/#reviews areas:/#areas-we-serve blog:/#blogs faq:/#faq cta:/#cta"}
for w in $WIDTHS; do
  h=900; [ "$w" = "390" ] && h=844
  for s in $SECTIONS; do
    name=${s%%:*}; path=${s#*:}
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --force-prefers-reduced-motion --user-data-dir="$PROFILE" \
      --window-size="$w,$h" --virtual-time-budget=6000 --screenshot="$(pwd -W 2>/dev/null || pwd)/$OUT/$w-$name.png" "$BASE$path" >/dev/null 2>&1 || echo "failed $w $name"
  done
  echo "captured @$w"
done
