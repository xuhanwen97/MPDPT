# Data Source Research (2026-11-20)

What was verified, what was not, and how each source is read.

## Official tracker - RTRT.me

- Verified: philadelphiamarathon.com/race-app links the web tracker
  https://track.rtrt.me/e/PHIL-MARATHON-2026 and the official "Philadelphia Marathon Weekend"
  app (RTRT). The tracker page loads an embed for event `PHIL-MARATHON-2026`.
- Verified: checkpoints listed on the race pages. Half: 4.3K, 10K, 15K, 20K. Full: 5K, 10K,
  15K, 20K, 13.1 mi, 25K, 30K, 40K.
- Not used: RTRT's JSON API. It is undocumented for public use and needs app credentials, so
  MPDPT does not call it (SPEC section 3). Claude reads the public tracker page in the browser
  pane instead, the same way a spectator would.
- Results after the race: MyChipTime (half id 17625, full id 17626), "Coming Soon" as of today.

## Garmin LiveTrack

- Runner starts LiveTrack on their watch and adds the spectator as a recipient; Garmin emails a
  link like `https://livetrack.garmin.com/session/<id>/token/<token>`.
- No documented public API. Community projects call internal endpoints, which have changed
  before. MPDPT does not. Claude opens the share page and reads position, distance and time.
- Put each runner's link in `data/config.json` under `garminUrl` on race morning. Links
  expire when the session ends.

## Apple Find My

- No API for friends' locations. Options, in order of preference:
  1. User attaches a Find My screenshot to `/update` (or any prompt).
  2. Claude reads the Find My app on the Mac via computer use, only if the user allows it.
- Find My shows a map and street-level place, not coordinates. Claude converts the place to an
  approximate lat/lng, and that inference is labeled in the observation note.

## Course geometry

- Official course maps are images/PDFs at philadelphiamarathon.com/maps. The polylines in
  `data/config.json` are hand-drawn approximations of the route with mile anchors at the start,
  the 13.1 return to the Art Museum, the Manayunk turnaround (about mile 20) and the finish.
  Replace them with a GPX trace if one becomes available.
