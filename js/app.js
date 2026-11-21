import { buildCourse, estimateRunner } from "./fusion.js";

const POLL_MS = 30000;
const TICK_MS = 5000;
const SOURCE_COLORS = { rtrt: "#1d47e8", garmin: "#0f766e", findmy: "#16a34a", manual: "#6b7280" };
const SOURCE_NAMES = { rtrt: "Official", garmin: "Garmin", findmy: "Find My", manual: "Manual" };
const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");
// Demo clock: starts mid-half and runs in real time, so projections visibly move.
const demoOffset = DEMO ? new Date("2026-11-21T08:20:00-05:00").getTime() - Date.now() : 0;
const now = () => Date.now() + demoOffset;

let config, state, map;
const courses = {}, layers = { courses: {}, runners: {}, dots: null };
let raceFilter = params.get("race") || "today";

const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : "-";
const fmtPace = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}/mi`;
const fmtDur = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
const fmtAge = (min) => min == null ? "" : min < 1 ? "just now" : min < 60 ? `${Math.round(min)} min ago` : `${Math.floor(min / 60)}h ${Math.round(min % 60)}m ago`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function getJSON(path) {
  const r = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

function todayET() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now()));
}

function activeRaces() {
  if (raceFilter === "all") return Object.keys(config.races);
  if (raceFilter === "today") {
    const t = Object.keys(config.races).filter((k) => config.races[k].date === todayET());
    return t.length ? t : Object.keys(config.races);
  }
  return [raceFilter];
}

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([39.975, -75.185], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  for (const [key, race] of Object.entries(config.races)) {
    courses[key] = buildCourse(race);
    const line = L.polyline(race.course.map(([a, b]) => [a, b]), { color: race.color, weight: 4, opacity: 0.55 });
    layers.courses[key] = line;
  }
  const start = config.races.half.course[0];
  const finish = config.races.half.course.at(-1);
  L.circleMarker([start[0], start[1]], { radius: 6, color: "#111", fillColor: "#fff", fillOpacity: 1 }).bindTooltip("Start").addTo(map);
  L.circleMarker([finish[0], finish[1]], { radius: 6, color: "#111", fillColor: "#111", fillOpacity: 1 }).bindTooltip("Finish").addTo(map);
  layers.dots = L.layerGroup().addTo(map);
}

function pinIcon(runner, est) {
  const cls = est.confidence === "stale" ? "runner-pin stale" : "runner-pin";
  return L.divIcon({
    className: "", iconSize: [30, 30], iconAnchor: [15, 15],
    html: `<div class="${cls}" style="background:${runner.color}">${esc(runner.name[0])}</div>`,
  });
}

function sourceRow(src, o, nowMs) {
  if (!o) return `<li><span>${SOURCE_NAMES[src]}</span><span class="muted">no data</span></li>`;
  const age = (nowMs - new Date(o.observedAt).getTime()) / 60000;
  const what = o.kind === "finish" ? "Finished" : o.label || (o.distanceMi != null ? `${o.distanceMi.toFixed(2)} mi` : "GPS fix");
  return `<li><span><span class="swatch" style="background:${SOURCE_COLORS[src]}"></span> ${SOURCE_NAMES[src]}: ${esc(what)}</span><span class="muted">${fmtTime(o.observedAt)} (${fmtAge(age)})</span></li>`;
}

function card(est, nowMs) {
  const { runner, race } = est;
  const pct = Math.min(100, (est.mi / race.distanceMi) * 100);
  let pill, stats;
  if (est.status === "finished") {
    pill = `<span class="pill live">Finished</span>`;
    stats = `<div><b>${est.finishElapsedSec ? fmtDur(est.finishElapsedSec) : fmtTime(est.finishedAt)}</b><span>${est.finishElapsedSec ? "chip time" : "finished at"}</span></div>`;
  } else if (est.status === "not-started") {
    pill = `<span class="pill none">Not started</span>`;
    stats = `<div><b>${fmtTime(race.start)}</b><span>gun time</span></div>`;
  } else {
    const label = { live: "Live", recent: "Recent", stale: "Stale" }[est.confidence];
    const basis = est.anchor.obs ? `${SOURCE_NAMES[est.anchor.obs.source]}, ${fmtAge(est.ageMin)}` : "assumed gun start";
    pill = `<span class="pill ${est.confidence}" title="Anchored on ${esc(basis)}">${label}</span>`;
    stats = `
      <div><b>${est.mi.toFixed(1)}</b><span>mile (est)</span></div>
      <div><b>${fmtPace(est.pace.sec)}</b><span title="${esc(est.pace.basis)}">pace</span></div>
      <div><b>${fmtTime(est.eta)}</b><span>finish ETA</span></div>
      ${est.nextCheckpoint ? `<div><b>${fmtTime(est.nextCheckpoint.eta)}</b><span>${esc(est.nextCheckpoint.label)} ETA</span></div>` : ""}`;
  }
  const garmin = runner.garminUrl ? `<a href="${esc(runner.garminUrl)}" target="_blank" rel="noopener">Garmin LiveTrack</a>` : "";
  return `<article class="card">
    <h2><span class="swatch" style="background:${runner.color}"></span>${esc(runner.name)} ${pill}<span class="race">${esc(race.name)}</span></h2>
    <div class="big">${stats}</div>
    <div class="bar"><div style="width:${pct}%;background:${runner.color}"></div></div>
    <ul class="sources">${["rtrt", "garmin", "findmy", "manual"].filter((s) => s !== "manual" || est.lastBySource.manual).map((s) => sourceRow(s, est.lastBySource[s], nowMs)).join("")}</ul>
    <div class="links"><a href="${esc(config.event.rtrtTrackerUrl)}" target="_blank" rel="noopener">Official tracker</a>${garmin}</div>
    ${est.status === "racing" ? `<div class="muted" style="font-size:12px;margin-top:4px">Pace basis: ${esc(est.pace.basis)}${est.projectionCapped ? ". No new data for 45+ min, projection paused." : ""}</div>` : ""}
  </article>`;
}

function render() {
  const nowMs = now();
  const races = activeRaces();
  for (const [key, line] of Object.entries(layers.courses)) {
    if (races.includes(key)) line.addTo(map); else line.remove();
  }
  layers.dots.clearLayers();
  const ests = config.runners.filter((r) => races.includes(r.race)).map((r) => estimateRunner(config, state, r.id, nowMs, courses));
  for (const r of config.runners) {
    const est = ests.find((e) => e.runner.id === r.id);
    let m = layers.runners[r.id];
    if (!est) { if (m) { m.remove(); delete layers.runners[r.id]; } continue; }
    const ll = [est.position.lat, est.position.lng];
    if (!m) m = layers.runners[r.id] = L.marker(ll, { icon: pinIcon(r, est), zIndexOffset: 1000 }).addTo(map);
    m.setLatLng(ll).setIcon(pinIcon(r, est)).bindTooltip(`${r.name}: mile ${est.mi.toFixed(1)}`);
    for (const d of est.dots) {
      L.circleMarker([d.lat, d.lng], { radius: 4, color: SOURCE_COLORS[d.source], fillOpacity: 0.8, weight: 1 })
        .bindTooltip(`${r.name} - ${SOURCE_NAMES[d.source]} ${d.label ? esc(d.label) + " " : ""}${fmtTime(d.observedAt)}`)
        .addTo(layers.dots);
    }
  }
  document.getElementById("cards").innerHTML = ests.map((e) => card(e, nowMs)).join("") || `<p class="muted">No runners in this race.</p>`;

  const pushedAge = state.updatedAt ? (nowMs - new Date(state.updatedAt).getTime()) / 60000 : null;
  document.getElementById("pushed").textContent = `${DEMO ? "DEMO DATA. " : ""}Last data push: ${state.updatedAt ? `${fmtTime(state.updatedAt)} (${fmtAge(pushedAge)})` : "none yet"}`;
  const racing = ests.some((e) => e.status === "racing");
  const banner = document.getElementById("banner");
  banner.hidden = !(racing && (pushedAge == null || pushedAge > 15));
  banner.textContent = "No new data in 15+ minutes. Positions are projected from pace; check the official tracker for the latest splits.";
  for (const b of document.querySelectorAll(".filters button")) b.setAttribute("aria-pressed", String(b.dataset.race === raceFilter));
}

async function refresh() {
  try {
    state = await getJSON(DEMO ? "data/demo-state.json" : "data/state.json");
    render();
  } catch (e) {
    document.getElementById("pushed").textContent = `Could not load data (${e.message}). Retrying.`;
  }
}

async function main() {
  config = await getJSON("data/config.json");
  document.getElementById("rtrt").href = config.event.rtrtTrackerUrl;
  for (const b of document.querySelectorAll(".filters button")) {
    b.addEventListener("click", () => { raceFilter = b.dataset.race; render(); });
  }
  initMap();
  await refresh();
  setInterval(refresh, POLL_MS);
  setInterval(() => state && render(), TICK_MS);
}

main();
