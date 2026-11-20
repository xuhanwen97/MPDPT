# MPDPT Spec - Philly Marathon Weekend Friend Tracker

Status: v1, approved for build 2026-11-20. Owner: Hanwen.
Process: spec-driven. Change this file first, then PLAN.md, then code.

## 1. Problem

Friends are running the 2026 Philadelphia Marathon Weekend. Spectators want one page,
reachable from any phone, showing where each runner is right now and when they will reach
the finish. Location data is scattered across three sources, none of which talks to the others:

| Source | What it gives | Access |
|---|---|---|
| Official tracker (RTRT.me, event `PHIL-MARATHON-2026`) | Chip splits at course checkpoints: time, distance, pace | Public web tracker https://track.rtrt.me/e/PHIL-MARATHON-2026 and the official app. No documented public API. |
| Apple Find My | Phone location shared with the spectator | Find My app only. No public API. |
| Garmin LiveTrack | Watch GPS position, distance, pace every ~1 min | Share link (email/app) to a web page. No documented public API. |

## 2. Goals

- G1. One deployed web page, usable on a phone, no login, showing every tracked runner.
- G2. Fuse all three sources into a single best-estimate position per runner, with the
  source and age of every reading visible.
- G3. Between readings, project position forward along the course using the runner's pace.
- G4. Show finish ETA and the latest split for each runner.
- G5. Data updates are automatic, or take at most one Claude prompt (`/update`).
- G6. Adding a runner is a one-line config change.

## 3. Non-goals

- Scraping or calling undocumented private APIs (RTRT, Garmin, iCloud). Data is read the way a
  person reads it: from the public web tracker page, the LiveTrack page, the Find My app, or
  screenshots the user shares.
- Accounts, auth, or write access from the web page.
- Exact official course geometry. The course line is hand-drawn and approximate; it is used
  for map display and projection only.
- Historical analytics after race weekend.

## 4. Race facts (source: philadelphiamarathon.com, read 2026-11-20)

| Race | Date | Start | Distance | Official checkpoints |
|---|---|---|---|---|
| Half | Sat 2026-11-21 | 7:00 AM ET, 22nd St & Ben Franklin Pkwy | 13.1 mi | 4.3K, 10K, 15K, 20K, finish |
| Full | Sun 2026-11-22 | 7:00 AM ET, same | 26.2 mi | 5K, 10K, 15K, 20K, 13.1 mi, 25K, 30K, 40K, finish |

Runners start in corrals by bib letter, so gun time != chip start. Elapsed times from RTRT are
chip times when available.

## 5. Runners (initial)

| id | Name | Race |
|---|---|---|
| daniel | Daniel | full |
| maddie | Maddie | half |
| paige | Paige | half |

More friends may be added later (G6).

## 6. Architecture

```
 sources (human-readable)          Claude /update             repo (GitHub)            GitHub Pages
 RTRT web tracker  ----+                                       data/state.json  ---->  index.html
 Garmin LiveTrack  ----+--> read via browser / screenshots -->  (observations)          polls state.json
 Find My app / pics ---+     scripts/ingest.mjs (validate)      git push                 every 30 s,
                                                                                         fuses + projects
```

- Static site, no build step: `index.html`, `js/*.js` (ES modules), Leaflet from cdnjs.
- Data is two JSON files in the repo:
  - `data/config.json`: event, races, course polylines with mile anchors, runners.
  - `data/state.json`: append-only list of observations.
- Writes happen only through `scripts/ingest.mjs` (validates, dedupes, sorts) and are published
  with `scripts/publish.sh` (commit + push). Pages redeploys in about 1 minute.
- Fusion and projection logic lives in `js/fusion.js`, a pure module used by the page and by
  the node tests. The page recomputes the estimate every few seconds so projections keep
  moving between data pushes.

### 6.1 Update mechanism (G5)

- Primary: user types `/update` in Claude Code in this repo. The command
  (`.claude/commands/update.md`) tells Claude to, for each runner whose race is today:
  1. Open the RTRT web tracker in the browser pane, search the runner, read the latest split.
  2. Open the runner's Garmin LiveTrack link if configured, read position, distance, time.
  3. Use any Find My screenshots attached to the prompt, or Find My on the Mac via computer
     use if the user allows it.
  4. Record each reading with `ingest.mjs`, then run `publish.sh`.
- Optional: a Claude desktop scheduled task that runs `/update` every 10 minutes from 7:00 to
  11:30 AM ET on race days. Zero prompts once set up.
- Fallback: the user sends a free-text message such as "Maddie passed 10K at 8:05" or a
  screenshot, and Claude ingests it the same way.

## 7. Data model

`Observation` (one reading from one source):

| field | type | req | notes |
|---|---|---|---|
| id | string | yes | `<runner>-<source>-<observedAt>`; dedupe key |
| runner | string | yes | runner id from config |
| source | `rtrt` \| `garmin` \| `findmy` \| `manual` | yes | |
| kind | `split` \| `gps` \| `finish` | yes | |
| observedAt | ISO 8601 with offset | yes | when the reading was true, not when recorded |
| recordedAt | ISO 8601 | yes | set by ingest |
| distanceMi | number | split/finish | course distance at the reading |
| lat, lng | number | gps | |
| elapsedSec | number | no | chip time at the reading |
| label | string | no | e.g. `10K`, `Kelly Dr near Falls Bridge` |
| note | string | no | free text |

## 8. Fusion rules (js/fusion.js)

For runner R at time `now`:

1. Status: `not-started` if now < start time and no observations; `finished` if a `finish`
   observation exists; otherwise `racing`.
2. Pace (sec/mi): from the latest split with `elapsedSec` = elapsedSec / distanceMi. Else from
   the last two observations with known distance. Else the runner's `goalPaceSec` from config.
3. Anchor: the most recent observation by `observedAt` that yields a course distance.
   - split/finish: `distanceMi` directly.
   - gps: snap lat/lng to the nearest point on R's course polyline; distance = position along
     the course. If the snap is more than 0.3 mi off course, keep the dot on the map but do not
     use it as an anchor.
4. Projected distance = anchor distance + (now - anchor.observedAt) / pace, clamped to
   [anchor distance, race distance - 0.05]. Projection stops after 45 minutes with no new data
   and is marked stale.
5. Projected position = point on the course polyline at the projected distance.
6. Finish ETA = now + (race distance - projected distance) * pace.
7. Confidence label from the anchor age: `live` < 3 min, `recent` < 15 min, `stale` otherwise.

The map shows the projected position as the main marker and every raw observation from the
last 30 minutes as a small dot colored by source.

## 9. Page requirements

- Map (Leaflet + OpenStreetMap tiles) with both course lines, start/finish, and runner markers.
- One card per runner: name, race, status, projected mile, pace, finish ETA, last reading per
  source with age, and links to the runner's RTRT and LiveTrack pages.
- Race filter: today's race by default, toggle to all.
- "Last data push" time. Warn when it is older than 15 minutes during a race.
- Works on a 375 px wide phone screen. Light and dark mode.
- No personal data beyond first names. No bib numbers on the page.

## 10. Acceptance criteria

- A1. `node --test` passes: ingest validation, dedupe, pace, GPS snap, projection, clamping,
  finish, stale handling.
- A2. With sample data, the page shows all runners, markers on the course, and ETAs.
- A3. `/update` with one manual reading produces a commit, and the deployed page shows the new
  reading within about 2 minutes.
- A4. Adding a runner to `config.json` makes a new card appear with no code change.

## 11. Risks

| Risk | Mitigation |
|---|---|
| RTRT or LiveTrack pages change or block automation | Manual and screenshot fallback; the page still projects from the last reading |
| GitHub Pages CDN caching delays updates | Cache-busting query on every poll |
| Approximate course line puts markers slightly off the street | Shown as approximate; anchored on real splits |
| Public URL exposes friends' live positions | First names only, no bibs, data only on race weekend; can wipe `state.json` after |
| Runner name spelled wrong ("Paige") | Confirm with user; one-line config fix |
