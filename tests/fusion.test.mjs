import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCourse, pointAtMile, snapToCourse, estimateRunner, paceFor, haversineMi } from "../js/fusion.js";

const config = JSON.parse(readFileSync(new URL("../data/config.json", import.meta.url)));
const half = buildCourse(config.races.half);
const full = buildCourse(config.races.full);
const st = (...observations) => ({ updatedAt: null, observations });
const ob = (o) => ({ id: `${o.runner}-${o.source}-${o.observedAt}`, recordedAt: o.observedAt, ...o });

test("course polylines are plausible lengths for their races", () => {
  assert.ok(half.cum.at(-1) > 9 && half.cum.at(-1) < 17, `half geo length ${half.cum.at(-1)}`);
  assert.ok(full.cum.at(-1) > 18 && full.cum.at(-1) < 32, `full geo length ${full.cum.at(-1)}`);
});

test("pointAtMile hits start and finish", () => {
  const s = pointAtMile(half, 0), f = pointAtMile(half, 13.1);
  assert.ok(haversineMi(s, half.pts[0]) < 0.01);
  assert.ok(haversineMi(f, half.pts.at(-1)) < 0.01);
});

test("snap round-trips a point on course", () => {
  const p = pointAtMile(half, 6);
  const s = snapToCourse(half, p.lat, p.lng);
  assert.ok(Math.abs(s.mi - 6) < 0.05, `got ${s.mi}`);
  assert.ok(s.offMi < 0.01);
});

test("snap uses hint on out-and-back section", () => {
  const p = pointAtMile(full, 17);
  assert.ok(Math.abs(snapToCourse(full, p.lat, p.lng, 17).mi - 17) < 0.1);
  // Same spot on the way back; out and back legs have different mile scales, so mirror is ~22.7.
  assert.ok(snapToCourse(full, p.lat, p.lng, 23).mi > 21);
});

test("pace prefers chip time, then readings, then goal, then default", () => {
  const r = { id: "x", goalPaceSec: 540 };
  assert.equal(paceFor(r, [{ distanceMi: 6.21, elapsedSec: 3726 }], 600).sec, 600);
  const two = [
    { distanceMi: 2, observedAt: "2026-11-21T07:20:00-05:00" },
    { distanceMi: 4, observedAt: "2026-11-21T07:38:00-05:00" },
  ];
  assert.equal(paceFor(r, two, 600).sec, 540);
  assert.equal(paceFor(r, [], 600).basis, "goal pace");
  assert.equal(paceFor({}, [], 600).sec, 600);
});

test("not-started before gun with no data", () => {
  const e = estimateRunner(config, st(), "maddie", "2026-11-21T06:30:00-05:00");
  assert.equal(e.status, "not-started");
});

test("projects forward from a split at chip pace", () => {
  const s = st(ob({ runner: "maddie", source: "rtrt", kind: "split", distanceMi: 6.21, elapsedSec: 6.21 * 600, observedAt: "2026-11-21T08:05:00-05:00", label: "10K" }));
  const e = estimateRunner(config, s, "maddie", "2026-11-21T08:15:00-05:00");
  assert.equal(e.status, "racing");
  assert.ok(Math.abs(e.mi - 7.21) < 0.01, `mi ${e.mi}`);
  assert.equal(e.confidence, "recent");
  assert.equal(e.nextCheckpoint.label, "15K");
  const etaMin = (new Date(e.eta) - new Date("2026-11-21T08:15:00-05:00")) / 60000;
  assert.ok(Math.abs(etaMin - (13.1 - 7.21) * 10) < 0.1);
});

test("newer GPS reading overrides older split", () => {
  const p = pointAtMile(half, 8);
  const s = st(
    ob({ runner: "paige", source: "rtrt", kind: "split", distanceMi: 6.21, elapsedSec: 3726, observedAt: "2026-11-21T08:05:00-05:00" }),
    ob({ runner: "paige", source: "findmy", kind: "gps", lat: p.lat, lng: p.lng, observedAt: "2026-11-21T08:22:00-05:00" }),
  );
  const e = estimateRunner(config, s, "paige", "2026-11-21T08:22:30-05:00");
  assert.equal(e.anchor.obs.source, "findmy");
  assert.ok(Math.abs(e.mi - 8.05) < 0.1, `mi ${e.mi}`);
  assert.equal(e.confidence, "live");
});

test("off-course GPS is shown but not used as anchor", () => {
  const s = st(
    ob({ runner: "paige", source: "rtrt", kind: "split", distanceMi: 6.21, elapsedSec: 3726, observedAt: "2026-11-21T08:05:00-05:00" }),
    ob({ runner: "paige", source: "findmy", kind: "gps", lat: 39.90, lng: -75.30, observedAt: "2026-11-21T08:10:00-05:00" }),
  );
  const e = estimateRunner(config, s, "paige", "2026-11-21T08:10:00-05:00");
  assert.equal(e.anchor.obs.source, "rtrt");
  assert.equal(e.dots.length, 2);
});

test("projection clamps before finish and caps after 45 min", () => {
  const s = st(ob({ runner: "maddie", source: "rtrt", kind: "split", distanceMi: 12.43, elapsedSec: 12.43 * 600, observedAt: "2026-11-21T09:05:00-05:00" }));
  const e = estimateRunner(config, s, "maddie", "2026-11-21T10:30:00-05:00");
  assert.ok(e.mi <= 13.05 + 1e-9);
  assert.equal(e.confidence, "stale");
  assert.equal(e.projectionCapped, true);
});

test("finish observation marks finished", () => {
  const s = st(ob({ runner: "daniel", source: "rtrt", kind: "finish", distanceMi: 26.2, elapsedSec: 14400, observedAt: "2026-11-22T11:05:00-05:00" }));
  const e = estimateRunner(config, s, "daniel", "2026-11-22T11:30:00-05:00");
  assert.equal(e.status, "finished");
  assert.equal(e.mi, 26.2);
});

test("observations in the future are ignored", () => {
  const s = st(ob({ runner: "maddie", source: "rtrt", kind: "split", distanceMi: 6.21, observedAt: "2026-11-21T09:00:00-05:00" }));
  const e = estimateRunner(config, s, "maddie", "2026-11-21T08:00:00-05:00");
  assert.equal(e.anchor.assumed, "gun start");
});

test("every runner in config gets an estimate (A4)", () => {
  for (const r of config.runners) assert.ok(estimateRunner(config, st(), r.id, "2026-11-21T08:00:00-05:00"));
});
