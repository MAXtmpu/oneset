#!/usr/bin/env python3
"""Regenerate the web app icons from tools/icon-1024.png (the same artwork as the iPhone app icon).
Uses macOS's built-in `sips`, so no extra packages are needed."""
import os, subprocess

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, 'icon-1024.png')
out = os.path.join(here, '..', 'app', 'icons')
os.makedirs(out, exist_ok=True)
for n in (180, 192, 512):
    subprocess.run(['sips', '-z', str(n), str(n), src, '--out', os.path.join(out, f'icon-{n}.png')],
                   check=True, stdout=subprocess.DEVNULL)
print('icons written')
