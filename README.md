# CSC Adherence Timer — v0.5-build1

PROJECT: CSC Adherence Timer — build1 baseline

This package is a clean baseline matching your current on-disk manifest, with standardized version headers across HTML/CSS/JS and a ready-to-run local server script.

## Run locally
- Windows: double-click `start_webserver.bat` then open http://localhost:5173
- Or run `python -m http.server 5173` from this folder.

## Contents
- index.html, styles.css, app.js, sfx.js, sw.js
- manifest.webmanifest, demo-week-schedule.json
- icons: android-chrome-*.png, apple-touch-icon.png, favicon.ico, favicon-16x16.png, favicon-32x32.png
- screenshot-wide.png, logo.png
- sounds/ (drop audio files here)

## Notes
- Service worker only works on http(s), not file://
- iCal export produces a simple .ics from the demo schedule.
