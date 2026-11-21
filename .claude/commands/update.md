---
description: Pull the latest runner readings from all sources and publish them to the MPDPT page
---

Update MPDPT race data (SPEC 6.1). Extra input from the user, if any: $ARGUMENTS

1. Read `data/config.json`. Work only on runners whose race `date` is today in ET, unless the
   user names runners. Read `node scripts/ingest.mjs list` to see what is already recorded.
2. For each runner, gather new readings. Skip a source that is unavailable; do not stop.
   - Official (RTRT): open the event's `rtrtTrackerUrl` in the browser pane, search the
     runner's name (ask the user for the last name once if needed, and do not store it in the
     repo), and read every split shown: label, time of day, chip time. Record each split
     not already in state with `--source rtrt --kind split --distance <mi from the race's
     checkpoints> --label <label> --at <time> --elapsed <chip time>`. A finish becomes
     `--kind finish`.
   - Garmin: if the runner has `garminUrl`, open it in the browser pane and read the latest
     distance, elapsed time, and map position. Record `--source garmin --kind gps
     --distance <mi> --elapsed <time>` plus `--lat/--lng` if shown.
   - Find My: use screenshots or text the user attached. Find My shows a place, not
     coordinates: estimate lat/lng for the street or landmark, and put "approximate, from
     Find My place <name>" in `--note`. Use the time shown in Find My ("Now" = now).
   - Any free-text update from the user ("Maddie passed mile 8 at 8:40") becomes
     `--source manual`.
3. Never call RTRT, Garmin or iCloud JSON APIs directly; read pages like a person (SPEC 3).
4. Run `node --test tests/` if any code changed, then `scripts/publish.sh "data: <summary>"`.
5. Reply with a short table: runner, newest reading per source, and the estimate the page
   should now show. Note anything that could not be read.
