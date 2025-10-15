# CSC Adherence Timer (v0.5.5)

A lightweight, offline-capable web app to show the current time, countdown to the next event, color-coded status, audible alerts, and a weekly planner.

## Features
- Live clock with 12/24h and time zone selection
- Countdown to next event with status color states:
  - Green: on track
  - Yellow: within lead warning
  - Red: at/after event and not acknowledged
- Status acknowledge buttons (On Queue, Available, C2C, Break, Meal, Meeting, Busy, Shift End)
- Manager Escalation: mutes all alerts except Break/Meal
- Event timing sliders: Lead, First Overdue, Second Overdue (defaults 5, 2, 5 minutes)
- Timeline bar with day progress and event markers
- Schedule cards with inline edit/delete
- Weekly planner (drag to reorder across days; quick add; popup editor)
- Profiles (create/delete, per-profile ad-hoc list and full planner)
- Import/Export:
  - Export current list
  - Export All (adhoc + planner for the profile)
  - Import flexible JSON (array for current list, or `{ profile, adhoc, week }`)
  - Sample: `demo-week-schedule.json`
- Sounds:
  - Click sound on UI actions (toggleable)
  - Alert sounds for lead/at/overdue/shift end stages
  - Dropdowns auto-populate from `/sounds/manifest.json`
  - Upload custom `.mp3` files (stored in localStorage as data URLs)
  - Preview buttons for all sound choices
- PWA:
  - Installable (when served over http/https)
  - Offline caching of core assets

## Update Notes
### v0.5.5
- Added shift end sound option that plays when the shift ends (after last event)
- Enhanced sound upload validation with file size limits and MIME type checking
- Improved JSON import validation with better error handling
- Added Subresource Integrity (SRI) hashes for external CDN resources
- Enhanced accessibility with focus indicators for keyboard navigation

### v0.5.4A
- Hotfix for event editing modal functionality and countdown display
- Improved time format handling for 12h and 24h inputs
- GitHub repository: https://github.com/aeger/CSC-Timer

### v0.5.4
- Added Update Notes button in settings to view recent changes
- Added tooltips to settings for better usability

### v0.5.3
- Automatic day switching when page left open past midnight
- Delayed countdown display until configured minutes before first event
- Added countdown delay setting (default 15 minutes)

### v0.5.2
- Fixed lead time alert timing and sound selection
- Added dedicated dropdown for deleting custom MP3 sounds
- Improved event editing logic for ad-hoc schedules
- Updated default lead sound to 'notification tone.mp3'

## Getting Started
1. Unzip into a folder.
2. Put your audio in `/sounds/` (e.g., `click.mp3`, `a.mp3`). Update `/sounds/manifest.json` if you add more.
3. Serve locally (don’t open from `file://`):
   - Python: `python3 -m http.server 8000`
   - Node (serve): `npx serve .`
4. Open `http://localhost:8000`.
5. Optional: click “Install” to install PWA (only appears when the `beforeinstallprompt` event fires).

## Using the App
- **Profiles**: Select from the header. Add/Delete in Settings. “default” can’t be deleted, and at least one profile must exist.
- **Ad-hoc schedule**: Use “Quick Add” or the inline editor in the cards.
- **Planner**: Click a day header to select it. Use the + to add, drag to reorder, edit or delete via buttons.
- **Expected vs Actual**:
  - When within lead time: clock turns yellow.
  - At/after the event: clock turns red; the expected button shows as “expected.”
  - Click a status to acknowledge. Green means you matched the expected; red means you didn’t.
  - Shift End only goes red when the shift end event is due.
  - Outside first/last event window: “You are not scheduled to work at this time.”
- **Manager Escalation**: When ON, only Break/Meal alerts play.
- **Import**:
  - Array format updates the current list/day: `[{"time":"09:00","type":"On Queue"}, …]`.
  - Full payload merges planner and sets adhoc:  
    `{ "profile":"Name","adhoc":[…],"week": { "Mon":[…], "Tue":[…], … } }`
- **Export**: “Export” for current list; “Export All” for adhoc + planner for the current profile.

## Troubleshooting
- **No sounds**: Click the page once to satisfy autoplay policies; make sure Sounds are enabled in Settings; choose files in the dropdowns.
- **Dropdowns empty**: Ensure `/sounds/manifest.json` lists your MP3 filenames.
- **PWA install button disabled**: You’re on `file://`. Use a local server.
- **Old assets showing**: Hard refresh, clear site data, and if needed unregister service worker, then reload.
- **Time format mismatch**: Time display respects the “Time format” setting; re-render occurs on change.

## Files
- `index.html`, `styles.css`, `app.js`, `sfx.js`
- `manifest.webmanifest`, `sw.js`, `logo.png`, `favicon.ico`
- `sounds/manifest.json`
- `demo-week-schedule.json` (sample import)

## Data Storage
- `localStorage` keys per profile: `schedule_<name>`, `schedule_week_<name>`, plus `settings` and `customSounds`.
