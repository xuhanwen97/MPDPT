// Pure fusion and projection logic (SPEC section 8). Shared by the page and node tests.

const EARTH_MI = 3958.8;
const OFF_COURSE_MI = 0.3;
const PROJECTION_CAP_MIN = 45;
const RECENT_DOT_MIN = 30;

export function haversineMi(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.sqrt(h));
}

export function buildCourse(race) {
  const pts = race.course.map(([lat, lng, mi]) => ({ lat, lng, mi }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineMi(pts[i - 1], pts[i]));
  const anchors = pts.flatMap((p, i) => (p.mi == null ? [] : [{ geo: cum[i], mi: p.mi }]));
  if (anchors.length < 2 || anchors[0].geo !== 0 || anchors.at(-1).geo !== cum.at(-1)) {
    throw new Error("course needs mile anchors on its first and last point");
  }
  return { pts, cum, anchors, distanceMi: race.distanceMi };
}

function interp(x, x0, x1, y0, y1) {
  return x1 === x0 ? y0 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

function geoToMi(c, g) {
  for (let i = 1; i < c.anchors.length; i++) {
    const a = c.anchors[i - 1], b = c.anchors[i];
    if (g <= b.geo || i === c.anchors.length - 1) return interp(g, a.geo, b.geo, a.mi, b.mi);
  }
  return 0;
}

function miToGeo(c, mi) {
  for (let i = 1; i < c.anchors.length; i++) {
    const a = c.anchors[i - 1], b = c.anchors[i];
    if (mi <= b.mi || i === c.anchors.length - 1) return interp(mi, a.mi, b.mi, a.geo, b.geo);
  }
  return 0;
}

export function pointAtMile(c, mi) {
  const g = Math.min(Math.max(miToGeo(c, mi), 0), c.cum.at(-1));
  for (let i = 1; i < c.pts.length; i++) {
    if (g <= c.cum[i] || i === c.pts.length - 1) {
      const t = c.cum[i] === c.cum[i - 1] ? 0 : (g - c.cum[i - 1]) / (c.cum[i] - c.cum[i - 1]);
      const a = c.pts[i - 1], b = c.pts[i];
      return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
    }
  }
  return { lat: c.pts[0].lat, lng: c.pts[0].lng };
}

// Snap a GPS point to the course. Out-and-back sections are ambiguous, so when hintMi is
// given, prefer the near-equally-close candidate closest to the expected mile.
export function snapToCourse(c, lat, lng, hintMi = null) {
  const kx = 69.17 * Math.cos((lat * Math.PI) / 180), ky = 69.0;
  const cands = [];
  for (let i = 1; i < c.pts.length; i++) {
    const a = c.pts[i - 1], b = c.pts[i];
    const ax = a.lng * kx, ay = a.lat * ky, bx = b.lng * kx, by = b.lat * ky, px = lng * kx, py = lat * ky;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
    const off = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    cands.push({ off, mi: geoToMi(c, c.cum[i - 1] + t * (c.cum[i] - c.cum[i - 1])) });
  }
  const best = Math.min(...cands.map((x) => x.off));
  let pick = cands.find((x) => x.off === best);
  if (hintMi != null) {
    const near = cands.filter((x) => x.off <= best + 0.15);
    pick = near.reduce((p, x) => (Math.abs(x.mi - hintMi) < Math.abs(p.mi - hintMi) ? x : p), near[0]);
  }
  return { mi: pick.mi, offMi: pick.off };
}

const ms = (iso) => new Date(iso).getTime();

export function paceFor(runner, obs, defaultPaceSec) {
  const timed = obs.filter((o) => o.elapsedSec > 0 && o.distanceMi > 0.5);
  if (timed.length) {
    const o = timed.at(-1);
    return { sec: o.elapsedSec / o.distanceMi, basis: `chip time at ${o.label || o.distanceMi.toFixed(1) + " mi"}` };
  }
  const known = obs.filter((o) => o.distanceMi != null);
  for (let i = known.length - 1; i > 0; i--) {
    const a = known[i - 1], b = known[i];
    const dt = (ms(b.observedAt) - ms(a.observedAt)) / 1000, dd = b.distanceMi - a.distanceMi;
    if (dt > 60 && dd > 0.1) return { sec: dt / dd, basis: "between last two readings" };
  }
  if (runner.goalPaceSec) return { sec: runner.goalPaceSec, basis: "goal pace" };
  return { sec: defaultPaceSec, basis: "default pace (no data yet)" };
}

export function confidenceFor(ageMin) {
  if (ageMin < 3) return "live";
  if (ageMin < 15) return "recent";
  return "stale";
}

export function estimateRunner(config, state, runnerId, now, courseCache = {}) {
  const runner = config.runners.find((r) => r.id === runnerId);
  if (!runner) throw new Error(`unknown runner ${runnerId}`);
  const race = config.races[runner.race];
  const course = (courseCache[runner.race] ||= buildCourse(race));
  const nowMs = typeof now === "number" ? now : ms(now);
  const startMs = ms(race.start);
  const obs = state.observations
    .filter((o) => o.runner === runnerId && ms(o.observedAt) <= nowMs)
    .sort((a, b) => ms(a.observedAt) - ms(b.observedAt));

  const lastBySource = {};
  for (const o of obs) lastBySource[o.source] = o;

  const pace = paceFor(runner, obs, config.event.defaultPaceSec);
  const base = { runner, race, raceKey: runner.race, pace, lastBySource, observations: obs };

  const dots = obs
    .filter((o) => nowMs - ms(o.observedAt) <= RECENT_DOT_MIN * 60000)
    .map((o) => {
      const p = o.lat != null ? { lat: o.lat, lng: o.lng } : o.distanceMi != null ? pointAtMile(course, o.distanceMi) : null;
      return p && { ...p, source: o.source, observedAt: o.observedAt, label: o.label };
    })
    .filter(Boolean);

  const finish = obs.find((o) => o.kind === "finish");
  if (finish) {
    return {
      ...base, status: "finished", mi: race.distanceMi, position: pointAtMile(course, race.distanceMi),
      finishedAt: finish.observedAt, finishElapsedSec: finish.elapsedSec ?? null, eta: null,
      anchor: finish, ageMin: (nowMs - ms(finish.observedAt)) / 60000, confidence: "live", dots, nextCheckpoint: null,
    };
  }

  if (nowMs < startMs && obs.length === 0) {
    return {
      ...base, status: "not-started", mi: 0, position: pointAtMile(course, 0), eta: null,
      anchor: null, ageMin: null, confidence: null, dots, nextCheckpoint: null,
    };
  }

  let anchor = null;
  for (let i = obs.length - 1; i >= 0 && !anchor; i--) {
    const o = obs[i];
    if (o.distanceMi != null) anchor = { obs: o, mi: o.distanceMi, t: ms(o.observedAt) };
    else if (o.lat != null) {
      const hint = Math.max(0, (ms(o.observedAt) - startMs) / 1000 / pace.sec);
      const s = snapToCourse(course, o.lat, o.lng, hint);
      if (s.offMi <= OFF_COURSE_MI) anchor = { obs: o, mi: s.mi, t: ms(o.observedAt) };
    }
  }
  if (!anchor) anchor = { obs: null, mi: 0, t: startMs, assumed: "gun start" };

  const ageMin = (nowMs - anchor.t) / 60000;
  const projMin = Math.min(Math.max(ageMin, 0), PROJECTION_CAP_MIN);
  const maxMi = race.distanceMi - 0.05;
  const mi = Math.min(Math.max(anchor.mi + (projMin * 60) / pace.sec, anchor.mi), Math.max(maxMi, anchor.mi));
  const etaMs = nowMs + (race.distanceMi - mi) * pace.sec * 1000;
  const cp = race.checkpoints.find((c) => c.mi > mi + 0.01);
  return {
    ...base, status: "racing", mi, position: pointAtMile(course, mi),
    eta: new Date(etaMs).toISOString(), anchor, ageMin, confidence: confidenceFor(ageMin),
    projectionCapped: ageMin > PROJECTION_CAP_MIN, dots,
    nextCheckpoint: cp ? { ...cp, eta: new Date(nowMs + (cp.mi - mi) * pace.sec * 1000).toISOString() } : null,
  };
}
