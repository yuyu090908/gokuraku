#!/usr/bin/env bash
# Encode the owner's grow-room clips (media/source/*.mov) into light web videos in media/videos/.
# Usage: bash tools/encode_footage.sh
# All outputs are silent H.264 with faststart. Sources are phone clips (540x960, 30fps).
set -euo pipefail
cd "$(dirname "$0")/.."
S=media/source
V=media/videos
X="-an -c:v libx264 -preset veryslow -profile:v high -pix_fmt yuv420p -movflags +faststart"

# full clips for the Living Soil gallery (tap to play)
for n in bud-closeup color-leaves aisle-walk led-canopy green-canopy; do
  ffmpeg -v error -y -i "$S/$n.mov" -vf "fps=24,scale=540:960" $X -crf 30 "$V/$n.mp4"
  ffmpeg -v error -y -ss 1 -i "$S/$n.mov" -frames:v 1 -q:v 80 "$V/$n.webp"
done

# 3:4 ambient loops for the philosophy cards
ffmpeg -v error -y -i "$S/green-canopy.mov" -t 6 -vf "fps=24,crop=540:720:0:120,scale=480:640" $X -crf 33 "$V/green-canopy-loop.mp4"
ffmpeg -v error -y -i "$S/bud-closeup.mov" -vf "fps=24,crop=540:720:0:60,scale=480:640" $X -crf 33 "$V/bud-loop.mp4"

# 16:9 background bands
# aisle-walk: from 3s the phone was turned sideways; rotating it back gives an upright landscape shot
ffmpeg -v error -y -ss 3 -i "$S/aisle-walk.mov" -vf "fps=24,transpose=2,scale=960:540" $X -crf 32 "$V/aisle-band.mp4"
ffmpeg -v error -y -ss 4 -i "$S/aisle-walk.mov" -vf "transpose=2" -frames:v 1 -q:v 85 "$V/aisle-band.webp"
ffmpeg -v error -y -i "$S/color-leaves.mov" -vf "fps=24,crop=540:304:0:300,scale=960:540" $X -crf 32 "$V/leaves-band.mp4"
ffmpeg -v error -y -ss 1 -i "$S/color-leaves.mov" -vf "crop=540:304:0:300" -frames:v 1 -q:v 85 "$V/leaves-band.webp"
ffmpeg -v error -y -i "$S/led-canopy.mov" -vf "fps=24,crop=540:304:0:180,scale=960:540" $X -crf 32 "$V/led-band.mp4"
ffmpeg -v error -y -ss 1 -i "$S/led-canopy.mov" -vf "crop=540:304:0:180" -frames:v 1 -q:v 85 "$V/led-band.webp"
ls -la "$V"
