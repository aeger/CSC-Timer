# CSC Adherence Timer

A PWA for work schedule alerts with visual/audible reminders.

## Setup
- Run `start_webserver.bat` for local server[](http://localhost:8000).
- Install as PWA via browser.

## Files
- index.html: Main structure
- styles.css: Styles
- script.js: Core logic
- sounds.js: Audio handling
- sw.js: Service worker
- manifest.webmanifest: PWA config
- sounds/: Audio files (a.mp3, click.mp3)

## Dependencies (CDN)
- Font Awesome, Sortable.js, Howler.js, Google Fonts

## Known Issues
- Audio requires user interaction (click/tap).
- Test on mobile for PWA install.