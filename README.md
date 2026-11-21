# MPDPT

Live tracker for our friends at the 2026 Philadelphia Marathon Weekend (Maddie and Paige run
the half on Sat Nov 21, Daniel runs the full on Sun Nov 22).

One page fuses three sources into a projected position per runner:
official RTRT chip splits, Garmin LiveTrack, and Apple Find My.

- Live page: https://xuhanwen97.github.io/MPDPT/
- Demo with sample data: https://xuhanwen97.github.io/MPDPT/?demo=1
- Spec: [docs/SPEC.md](docs/SPEC.md), plan: [docs/PLAN.md](docs/PLAN.md), progress: [docs/PROGRESS.md](docs/PROGRESS.md)

## Race morning

1. Runners: start Garmin LiveTrack and add Hanwen as a recipient; share Find My location.
2. Paste each LiveTrack link into `data/config.json` as `garminUrl` (optional) and push.
3. In Claude Code in this repo, run `/update` whenever you want fresh data (attach Find My
   screenshots if you have them). It reads the sources, records readings, and pushes. The page
   picks them up within about 2 minutes and projects positions in between.
4. Hands-free option: a Claude desktop scheduled task that runs `/update` every 10 minutes
   from 7:00 to 11:30 AM ET.

## Add a runner

Add one entry to `runners` in `data/config.json` (`id`, `name`, `race`: `half` or `full`,
`color`, optional `goalPaceSec`, `garminUrl`) and push.

## Dev

```bash
node --test tests/
npx --yes http-server -p 8765 -c-1 .
```
