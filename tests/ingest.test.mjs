import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildObservation, mergeObservation, parseAt, parseElapsed } from "../scripts/ingest.mjs";

const config = JSON.parse(readFileSync(new URL("../data/config.json", import.meta.url)));
const NOW = new Date("2026-11-21T13:30:00Z").getTime();

test("parseElapsed accepts seconds and clock strings", () => {
  assert.equal(parseElapsed("3720"), 3720);
  assert.equal(parseElapsed("1:02:00"), 3720);
  assert.equal(parseElapsed("62:00"), 3720);
  assert.throws(() => parseElapsed("abc"));
});

test("parseAt handles ISO, HH:MM in ET, now; rejects naive ISO", () => {
  assert.equal(parseAt("2026-11-21T08:05:00-05:00"), "2026-11-21T13:05:00.000Z");
  assert.equal(parseAt("8:05", NOW), "2026-11-21T13:05:00.000Z");
  assert.equal(parseAt("now", NOW), new Date(NOW).toISOString());
  assert.throws(() => parseAt("2026-11-21T08:05:00"));
});

test("builds a valid split", () => {
  const o = buildObservation({ runner: "maddie", source: "rtrt", kind: "split", distance: "6.21", label: "10K", at: "8:05", elapsed: "1:02:00" }, config, NOW);
  assert.equal(o.id, "maddie-rtrt-2026-11-21T13:05:00.000Z");
  assert.equal(o.elapsedSec, 3720);
  assert.equal(o.lat, undefined);
});

test("finish defaults distance to race distance", () => {
  const o = buildObservation({ runner: "daniel", source: "rtrt", kind: "finish", at: "now" }, config, NOW);
  assert.equal(o.distanceMi, 26.2);
});

test("rejects bad input", () => {
  assert.throws(() => buildObservation({ runner: "nobody", source: "rtrt", distance: "1" }, config, NOW), /unknown runner/);
  assert.throws(() => buildObservation({ runner: "maddie", source: "strava", distance: "1" }, config, NOW), /source/);
  assert.throws(() => buildObservation({ runner: "maddie", source: "findmy", kind: "gps" }, config, NOW), /lat/);
  assert.throws(() => buildObservation({ runner: "maddie", source: "findmy", kind: "gps", lat: "40.7", lng: "-74" }, config, NOW), /Philadelphia/);
  assert.throws(() => buildObservation({ runner: "maddie", source: "rtrt", distance: "20" }, config, NOW), /distance/);
  assert.throws(() => buildObservation({ runner: "maddie", source: "rtrt" }, config, NOW), /--distance/);
});

test("merge dedupes by id and sorts by time", () => {
  const a = buildObservation({ runner: "maddie", source: "rtrt", distance: "6.21", at: "8:05" }, config, NOW);
  const b = buildObservation({ runner: "maddie", source: "rtrt", distance: "3", at: "7:30" }, config, NOW);
  const a2 = { ...a, label: "10K" };
  let s = { updatedAt: null, observations: [] };
  s = mergeObservation(mergeObservation(mergeObservation(s, a), b), a2);
  assert.equal(s.observations.length, 2);
  assert.equal(s.observations[0].distanceMi, 3);
  assert.equal(s.observations[1].label, "10K");
});
