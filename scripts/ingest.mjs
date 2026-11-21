#!/usr/bin/env node
// The only writer of data/state.json (SPEC 6). Usage: see CLAUDE.md or `node scripts/ingest.mjs help`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, "data/state.json");
const CONFIG = join(ROOT, "data/config.json");
const SOURCES = ["rtrt", "garmin", "findmy", "manual"];
const KINDS = ["split", "gps", "finish"];

export function parseElapsed(v) {
  if (v == null || v === "") return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  const parts = String(v).split(":").map(Number);
  if (parts.some(Number.isNaN) || parts.length < 2 || parts.length > 3) throw new Error(`bad elapsed: ${v}`);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function easternDate(nowMs) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(nowMs));
}

export function parseAt(v, nowMs = Date.now()) {
  if (!v || v === "now") return new Date(nowMs).toISOString();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) {
    const [h, m, s = "00"] = v.split(":");
    v = `${easternDate(nowMs)}T${h.padStart(2, "0")}:${m}:${s}-05:00`;
  }
  const t = new Date(v);
  if (Number.isNaN(t.getTime()) || !/([zZ]|[+-]\d{2}:?\d{2})$/.test(v)) throw new Error(`--at needs ISO time with offset, HH:MM (ET), or now: ${v}`);
  return t.toISOString();
}

export function validateObservation(o, config) {
  const errs = [];
  const runner = config.runners.find((r) => r.id === o.runner);
  if (!runner) errs.push(`unknown runner "${o.runner}" (known: ${config.runners.map((r) => r.id).join(", ")})`);
  if (!SOURCES.includes(o.source)) errs.push(`source must be one of ${SOURCES.join(", ")}`);
  if (!KINDS.includes(o.kind)) errs.push(`kind must be one of ${KINDS.join(", ")}`);
  if (!o.observedAt || Number.isNaN(new Date(o.observedAt).getTime())) errs.push("observedAt required");
  if (o.kind === "split" && o.distanceMi == null) errs.push("split needs --distance");
  if (o.kind === "gps" && (o.lat == null || o.lng == null)) errs.push("gps needs --lat and --lng");
  if (o.lat != null && (o.lat < 39.8 || o.lat > 40.2 || o.lng < -75.4 || o.lng > -74.9)) errs.push("lat/lng outside Philadelphia");
  const race = runner && config.races[runner.race];
  if (race && o.distanceMi != null && (o.distanceMi < 0 || o.distanceMi > race.distanceMi + 0.3)) errs.push(`distance outside 0-${race.distanceMi}`);
  if (errs.length) throw new Error(errs.join("; "));
  return o;
}

export function buildObservation(args, config, nowMs = Date.now()) {
  const num = (k) => (args[k] == null ? null : Number(args[k]));
  const kind = args.kind || "split";
  const runnerRace = config.races[config.runners.find((r) => r.id === args.runner)?.race];
  const o = {
    runner: args.runner,
    source: args.source,
    kind,
    observedAt: parseAt(args.at, nowMs),
    recordedAt: new Date(nowMs).toISOString(),
    distanceMi: num("distance") ?? (kind === "finish" && runnerRace ? runnerRace.distanceMi : null),
    lat: num("lat"),
    lng: num("lng"),
    elapsedSec: parseElapsed(args.elapsed),
    label: args.label ?? null,
    note: args.note ?? null,
  };
  for (const k of Object.keys(o)) if (o[k] == null) delete o[k];
  o.id = `${o.runner}-${o.source}-${o.observedAt}`;
  return validateObservation(o, config);
}

export function mergeObservation(state, o) {
  const observations = state.observations.filter((x) => x.id !== o.id);
  observations.push(o);
  observations.sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
  return { updatedAt: o.recordedAt, observations };
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") || argv[i + 1] == null ? "true" : argv[++i];
    else args._.push(argv[i]);
  }
  return args;
}

const HELP = `node scripts/ingest.mjs <command>
  add --runner ID --source rtrt|garmin|findmy|manual [--kind split|gps|finish]
      [--at ISO|HH:MM(ET)|now] [--distance MI] [--lat N --lng N] [--elapsed SEC|H:MM:SS]
      [--label TEXT] [--note TEXT]
  list [--runner ID]
  remove --id ID
  clear --runner ID | --all`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const config = JSON.parse(readFileSync(CONFIG, "utf8"));
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  const save = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2) + "\n");
  if (cmd === "add") {
    const o = buildObservation(args, config);
    save(mergeObservation(state, o));
    console.log(JSON.stringify(o));
  } else if (cmd === "list") {
    for (const o of state.observations.filter((x) => !args.runner || x.runner === args.runner)) console.log(JSON.stringify(o));
  } else if (cmd === "remove") {
    save({ ...state, updatedAt: new Date().toISOString(), observations: state.observations.filter((x) => x.id !== args.id) });
  } else if (cmd === "clear") {
    if (!args.runner && args.all !== "true") throw new Error("clear needs --runner ID or --all");
    const keep = args.all === "true" ? [] : state.observations.filter((x) => x.runner !== args.runner);
    save({ updatedAt: new Date().toISOString(), observations: keep });
  } else {
    console.log(HELP);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch (e) { console.error(`error: ${e.message}`); process.exit(1); }
}
