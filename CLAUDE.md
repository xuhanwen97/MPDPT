# CLAUDE.md - MPDPT

Philly Marathon Weekend 2026 tracker for friends (Maddie, Paige, Daniel, maybe more).
Static page on GitHub Pages that fuses official splits (RTRT), Garmin LiveTrack and Find My
readings into one projected position per runner.

Read at session start: `docs/SPEC.md` (source of truth), `docs/PLAN.md`, `docs/PROGRESS.md`.
Process is spec-driven: change the spec first, then plan, then code.

## Key facts
- Half: Sat 2026-11-21, full: Sun 2026-11-22, both 7:00 AM ET (-05:00).
- RTRT event: `PHIL-MARATHON-2026`, web tracker https://track.rtrt.me/e/PHIL-MARATHON-2026
- Repo is PUBLIC. First names only. Never commit bibs, phone numbers, emails, or LiveTrack
  tokens into anything the page renders. LiveTrack links in config are fine only during the
  race and must be removed after (they expire anyway).
- Do not call undocumented RTRT / Garmin / iCloud APIs. Read pages like a person (SPEC 3).

## Layout
- `index.html`, `styles.css`, `js/app.js` (UI), `js/fusion.js` (pure logic, tested)
- `data/config.json` (runners, races, course), `data/state.json` (observations)
- `scripts/ingest.mjs` (only way to write state), `scripts/publish.sh` (commit + push data)
- `tests/*.test.mjs` - run `node --test tests/`
- `.claude/commands/update.md` - the `/update` routine

## Commands
- Tests: `node --test tests/`
- Local preview: `python3 -m http.server 8000` then open http://localhost:8000
- Add reading: `node scripts/ingest.mjs add --runner maddie --source rtrt --kind split --distance 6.21 --label 10K --at 2026-11-21T08:05:00-05:00 --elapsed 3720`
- Publish: `scripts/publish.sh "msg"`
