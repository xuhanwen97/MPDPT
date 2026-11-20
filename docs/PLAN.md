# MPDPT Build Plan

Derived from `docs/SPEC.md`. Each task names the spec item(s) it covers.

| # | Task | Spec | Done when |
|---|---|---|---|
| T1 | Repo skeleton, context docs | 6 | CLAUDE.md, README, SPEC, PLAN, PROGRESS, SOURCES committed |
| T2 | `data/config.json`: event, races, approximate course polylines with mile anchors, runners | 4, 5, 6 | Loads in node and browser |
| T3 | `js/fusion.js`: course geometry (length, point-at-distance, snap), pace, anchor, projection, ETA, status | 8 | Unit tests pass |
| T4 | `scripts/ingest.mjs`: add / list / clear observations with validation and dedupe | 6, 7 | Unit tests pass |
| T5 | `scripts/publish.sh`: commit + push data only | 6 | Push triggers Pages deploy |
| T6 | Page: `index.html`, `js/app.js`, `styles.css`, map, cards, polling, stale warning, dark mode | 9 | Renders sample data on phone width |
| T7 | `.claude/commands/update.md`: the `/update` routine | 6.1 | One prompt ingests and publishes |
| T8 | GitHub repo (public) + Pages deploy | 6 | Live URL serves page |
| T9 | Verify acceptance criteria A1-A4 | 10 | All pass, results in PROGRESS.md |

Out of scope for v1: anything in SPEC section 3.
