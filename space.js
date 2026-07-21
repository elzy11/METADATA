/*
  THE USER SPACE
*/

'use strict';

if (typeof window.MetaData === 'undefined') {
  throw new Error('MetaData module not loaded — check the meta_series.js <script> path in the HTML');
}
const YEAR0 = MetaData.YEAR0;
const EST_FROM = MetaData.estFrom;
const DAU_B = MetaData.DAU_B;
const ARPU_Q = MetaData.ARPU_Q;
const ENG_PCT = MetaData.ENG_PCT;
const INT_DAY = MetaData.INT_DAY;
const MIN_DAY = MetaData.MIN_DAY;

// ------------------------------------------------------------------
// DESIGN PARAMETERS
// ------------------------------------------------------------------
const P = {
  // data mapping — concurrency is fully derived in MetaData.concurrent():
  // DAP × (daily minutes ÷ 1440) × normalized rhythm. ~130M average,
  // ~285M at the 09:00/15:00 peaks, ~50M at night.
  usersPerStar: 2e5,        // 1 hero star ≈ 200k sessions — carries halos & lifecycle detail

  // swarm — the visible mass of sessions
  usersPerSwarmStar: 1000,  // STABLE render scale: 1 pixel-star = 1,000 sessions, never changes
  maxSwarm: 530000,         // must hold peak concurrency (~530M / 1000)
  swarmRes: 0.75,           // resolution/count trade for the 1k scale
  swarmChurn: 8000,
  exposure: 0.45,           // tone-curve exposure
  dimMin: 0.55, dimMax: 1.6,            // the dim 90% (×~2 to offset full-res)
  brightChance: 0.10, brightMin: 3.0, brightMax: 8.0, // the resolvable 10%
  outerDim: 1.2,            // extra dimming beyond the rim
  spawnCore: 0.15,          // no births inside this radius (×rim)
  spawnReach: 2.2,          // births out to this ×rim (past the screen edge)
  outerCalm: 1.8,           // beyond the rim everything slows: drift AND orbit
  scatterChance: 0.5,      // dim unbound background population
  scatterDim: 0.8,         // scatter stars are dimmer than arm stars
  pileUp: 0.7,              // deceleration near the void — captured sessions accumulate

  // session lifecycle (real seconds)
  rimSink: 900,             // ~15 min rim -> center at average pace
  fadeDur: 2.6, absorbDur: 1.3,
  spawnCap: 3, cullCap: 3,

  // haze field beneath the swarm — v2 "feel" parameters
  fieldPoints: 26000, knots: 320, dustPoints: 3800, bulgePoints: 6500,
  arms: 4, armWind: 3.1, armSpread: 0.11, densityPow: 1.65,
  radius: 0.44, sizeFMin: 0.62,
  fieldAlphaMin: 45, fieldAlphaMax: 100, // low: the swarm defines the arms

  // 3D — v2 disk: steep inclination, more screen tilt
  tilt: -0.16,              // screen-plane rotation
  incline: 1.137,           // ~65°: FLAT = cos(incline) ≈ 0.42, the v2 flatten
  camDrift: 0.035, camRate: 0.015, // slow parallax drift of the view
  zThin: 0.020, zBulge: 0.14,      // disk / bulge thickness (×rim)
  depthCue: 0.45,           // near/far brightness variation
  spin: 0.021,              // haze-field rotation (matches rim orbital rate)
  omegaBase: 0.021, omegaPow: 0.8, // v2 differential orbits: inner fast, outer slow
  eccMax: 0.5,              // v2 elliptical orbits
  wobble: 2.2,

  // the void — volume ∝ cumulative revenue since 2012; voidMax is its
  // size at the present moment, voidMin just keeps it renderable in 2012
  voidMin: 0.004, voidMax: 0.165,

  // hero stars
  sizeMin: 0.8, sizeMax: 2.0, bigChance: 0.10, bigMin: 2.2, bigMax: 3.0,
  warmChance: 0.12, twinkle: 0.30,

  // engagement halos — haloVis 1 = each user star booms at the TRUE
  // individual rate (one interaction per ~21 active minutes today)
  haloVis: 0.8, haloRise: 0.30, haloFall: 2, haloSize: 10,

  // sparks — world engagement, sampled: 1 shown per sparkSample real events
  sparkSample: 10000, sparkLife: 1.5, sparkSize: 5,

  timeScaleFast: 60,
};

const FLAT = Math.cos(P.incline);  // inclination projection of the disk plane
const SINI = Math.sin(P.incline);

// tone curve LUT: accumulated light -> screen value, log-style rolloff
const TONE = new Uint8Array(8192);
for (let i = 0; i < 8192; i++) {
  TONE[i] = Math.round(255 * (1 - Math.exp(-(i / 64) * P.exposure)));
}

// star temperaments: white / blue / yellow / orange
const PAL = [
  [255, 248, 240, 0.50],
  [168, 200, 255, 0.25],
  [255, 228, 170, 0.15],
  [255, 170, 110, 0.10],
];

// ------------------------------------------------------------------
// STATE
// ------------------------------------------------------------------
let stars = [];
let simT = 0;
let timeScale = 1;
let scrubYears = 0;
let fieldBuf, bgBuf;
let biasPool = null;
let noiseTick = 0;

// swarm typed arrays — two depth halves: behind / in front of the sphere
let swarmBufB = null, swarmBufF = null;
let swm = null;
let swarmN = 0;
let accRB, accGB, accBB;   // float accumulation, far side
let accRF, accGF, accBF;   // float accumulation, near side
let swarmPhase = 0;        // a third of the swarm updates per frame
let swarmForce = false;    // full refresh after scrub/resize

// intro flight + time-travel interaction
let intro = true;
let introT0 = 0;
const INTRO_DUR = 20;      // seconds, 2012 -> LIVE, linear
let heldL = 0, heldR = 0;  // arrow-hold timestamps for gliding
let sliderDrag = false;

// sparks: world engagement events, sampled
let sparks = [];
let sparkCarry = 0;

// ------------------------------------------------------------------
// TIME & SERIES
// ------------------------------------------------------------------
function nowYearFloat() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return d.getFullYear() + (d - start) / (365.25 * 24 * 3600 * 1000);
}

function viewYear() {
  return constrain(nowYearFloat() + scrubYears, YEAR0, nowYearFloat());
}

function series(arr, yf) {
  const x = constrain(yf - YEAR0, 0, arr.length - 1);
  const i = Math.min(Math.floor(x), arr.length - 2);
  return lerp(arr[i], arr[i + 1], x - i);
}

function localHourFloat() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

// weekday (0 = Sun … 6 = Sat) of the VIEWED moment — live or scrubbed
function viewDow() {
  return new Date(Date.now() + scrubYears * 365.25 * 86400 * 1000).getDay();
}

// concurrent users, fully derived:
// DAP × (daily minutes ÷ 1440) × weekday-aware normalized rhythm
// (v3 rhythmWeek: weekends damped, weekly average preserved; the
// dayFactor guard keeps the sketch running against a pre-v3 module)
function activeSessions(yf) {
  const df = MetaData.dayFactor ? MetaData.dayFactor(viewDow(), yf) : 1;
  return MetaData.concurrent(yf, localHourFloat()) * df;
}

// live engagement events per second at the viewed moment (v4 module
// helper, shared by all three visualizations; ÷60 for this piece's
// per-second display). Falls back to the daily average pre-v4.
function liveEventsPerSec(yf) {
  return MetaData.eventsPerMinLive
    ? MetaData.eventsPerMinLive(yf, localHourFloat(), viewDow()) / 60
    : MetaData.eventsPerSec(yf);
}

// IPO S-1 / early reports). v5 module helper; falls back if pre-v5.
function revCumTotal(yf) {
  return MetaData.revCumTotal
    ? MetaData.revCumTotal(yf)
    : 6.94e9 + MetaData.revCum(yf);
}

// cumulative ADVERTISING revenue incl. pre-2012 (v7 module helper;
// fallback approximates ads as 97.6% of total if pre-v7 loads)
function adRevCumTotal(yf) {
  return MetaData.adRevCumTotal
    ? MetaData.adRevCumTotal(yf)
    : revCumTotal(yf) * 0.976;
}

// ---- navigation targets (FAKE URLS — replace with your real pages) ----
const NAV_NEXT = 'end-survey.html';
const NAV_BACK = 'spaceintro.html';
const NAV_HOME = 'index.html';

// ---- display currency: EUR by default, [\u20ac/$] toggle switches to USD ----
let currency = 'EUR';
function fxRate() { return currency === 'EUR' ? (MetaData.FX_EUR ? MetaData.FX_EUR.rate : 0.877) : 1; }
function curSym() { return currency === 'EUR' ? '\u20ac' : '$'; }

// ------------------------------------------------------------------
// CSV — per-star engagement propensity, calibrated to mean 1
// ------------------------------------------------------------------
function buildBiasPool(tables) {
  const vals = [];
  for (const t of tables) {
    if (!t) continue;
    const cols = t.columns.map(c => c.toLowerCase().trim());
    const idx = (n) => cols.findIndex(c => c.includes(n));
    const iL = idx('like'), iC = idx('comment'), iS = idx('share');
    let iR = idx('reach'); if (iR < 0) iR = idx('impression');
    if (iL < 0 || iR < 0) continue;
    for (let r = 0; r < t.getRowCount(); r++) {
      const row = t.getRow(r).arr;
      const reach = float(row[iR]);
      if (!reach || reach <= 0) continue;
      const er = ((float(row[iL]) || 0) + (iC >= 0 ? float(row[iC]) || 0 : 0)
        + (iS >= 0 ? float(row[iS]) || 0 : 0)) / reach;
      if (er > 0 && er < 2) vals.push(er);
    }
  }
  if (vals.length >= 8) {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    biasPool = vals.map(v => constrain(v / mean, 0.25, 4));
    for (const s of stars) s.bias = sampleBias();
  }
}

function sampleBias() {
  if (biasPool) return random(biasPool);
  return constrain(Math.exp(randomGaussian() * 0.55), 0.25, 4);
}

// ------------------------------------------------------------------
// USER STAR — one sampled session, carries halos and lifecycle detail
// ------------------------------------------------------------------
class Star {
  constructor() {
    this.born = simT;
    this.arm = floor(random(P.arms));
    this.jit = random() < P.scatterChance
      ? random(-PI, PI)
      : randomGaussian() * P.armSpread * 1.05;
    // sessions appear anywhere outside the galaxy center
    this.rN = 0.30 + 0.90 * Math.pow(random(), 0.8);
    this.vSink = 1.10 / (P.rimSink * random(0.75, 1.4));
    this.ph = 0;
    this.ecc = random(P.eccMax);
    this.peri = random(TWO_PI);
    this.sessionLen = constrain(Math.exp(Math.log(660) + randomGaussian() * 0.85), 25, 3600);
    this.size = random() < P.bigChance ? random(P.bigMin, P.bigMax) : random(P.sizeMin, P.sizeMax);
    this.warm = random() < P.warmChance;
    this.seed = random(1000);
    this.bias = sampleBias();
    this.state = 'live';
    this.endAt = -1;
    this.haloAt = -1e9;
  }

  theta() {
    const rC = Math.min(this.rN, 1.0);
    const drift = (noise(this.seed, simT * 0.045) - 0.5) * 0.34;
    return (TWO_PI / P.arms) * this.arm
      + this.jit * (0.12 + 1.15 * rC)   
      - P.armWind * rC
      + this.ph                          
      + drift;
  }

  // v2 elliptical radius for drawing
  drawR(rimPx) {
    const th = this.theta();
    const ec = this.ecc;
    return this.rN * (1 - ec * ec) / (1 + ec * Math.cos(th - this.peri)) * rimPx;
  }

  update(dt, voidN) {
    const elapsed = simT - this.born;
    const calm = this.rN > 1 ? 1 / (1 + P.outerCalm * (this.rN - 1)) : 1;
    this.ph += P.omegaBase * Math.pow(Math.max(this.rN, 0.08), -P.omegaPow) * calm * dt;
    if (this.state !== 'fading') {
      // decelerate near the void: captured sessions pile up
      const pile = (1 - P.pileUp) + P.pileUp * constrain((this.rN - voidN * 1.15) / 0.25, 0, 1);
      this.rN -= this.vSink * dt * calm * pile;
    }
    if (this.state === 'live') {
      if (this.rN <= voidN * 1.04) {
        this.state = 'absorbing'; this.endAt = simT;
      } else if (elapsed > this.sessionLen) {
        this.state = 'fading'; this.endAt = simT;
      }
    }
  }

  env() {
    let e = constrain((simT - this.born) / 1.2, 0, 1);
    if (this.state === 'fading') e *= 1 - constrain((simT - this.endAt) / P.fadeDur, 0, 1);
    if (this.state === 'absorbing') e *= 1 - constrain((simT - this.endAt) / P.absorbDur, 0, 1);
    return e;
  }

  dead() {
    if (this.state === 'fading') return simT - this.endAt > P.fadeDur;
    if (this.state === 'absorbing') return simT - this.endAt > P.absorbDur;
    return false;
  }
}

// ------------------------------------------------------------------
// SWARM — the mass of sessions. Accumulated in float RGB, tone-mapped.
// ------------------------------------------------------------------
function initSwarm() {
  const M = P.maxSwarm;
  swm = {
    rN: new Float32Array(M), v: new Float32Array(M),
    ang0: new Float32Array(M), jit: new Float32Array(M), zN: new Float32Array(M),
    ph: new Float32Array(M), ecc: new Float32Array(M), per: new Float32Array(M),
    sx: new Float32Array(M), sy: new Float32Array(M),
    aR: new Float32Array(M), aG: new Float32Array(M), aB: new Float32Array(M),
    bR: new Uint8Array(M), bG: new Uint8Array(M), bB: new Uint8Array(M),
    b: new Float32Array(M), fr: new Uint8Array(M),
  };
  swarmN = 0;
  makeSwarmBuf();
}

function makeSwarmBuf() {
  const w = Math.max(2, Math.floor(width * P.swarmRes));
  const h = Math.max(2, Math.floor(height * P.swarmRes));
  swarmBufB = createGraphics(w, h); swarmBufB.pixelDensity(1);
  swarmBufF = createGraphics(w, h); swarmBufF.pixelDensity(1);
  accRB = new Float32Array(w * h); accGB = new Float32Array(w * h); accBB = new Float32Array(w * h);
  accRF = new Float32Array(w * h); accGF = new Float32Array(w * h); accBF = new Float32Array(w * h);
  swarmForce = true;
}

function pickPalette() {
  let x = Math.random();
  for (const [r, g, b, w] of PAL) { if ((x -= w) <= 0) return [r, g, b]; }
  return [255, 248, 240];
}

function swarmSpawn(i) {
  const arm = (Math.random() * P.arms) | 0;
  swm.ang0[i] = (TWO_PI / P.arms) * arm + Math.random() * 0.0001;
  // arm stars cluster tightly; scatter stars form the dim background
  const scatter = Math.random() < P.scatterChance;
  if (scatter) {
    swm.jit[i] = (Math.random() * 2 - 1) * Math.PI;
    swm.rN[i] = P.spawnCore + (P.spawnReach - P.spawnCore) * Math.pow(Math.random(), 0.5);
  } else {
    swm.jit[i] = randomGaussian() * P.armSpread * 0.6; // tight clusters in the arms
    swm.rN[i] = P.spawnCore + (P.spawnReach - P.spawnCore) * Math.pow(Math.random(), 1.25);
  }
  swm.v[i] = 1.10 / (P.rimSink * (0.75 + Math.random() * 0.65));
  swm.zN[i] = randomGaussian();
  swm.ph[i] = 0;
  swm.ecc[i] = Math.random() * P.eccMax;
  swm.per[i] = Math.random() * TWO_PI;
  const col = pickPalette();
  swm.bR[i] = col[0]; swm.bG[i] = col[1]; swm.bB[i] = col[2];
  let b = Math.random() < P.brightChance
    ? P.brightMin + Math.random() * (P.brightMax - P.brightMin)
    : P.dimMin + Math.random() * (P.dimMax - P.dimMin);
  if (scatter) b *= P.scatterDim;
  swm.b[i] = b;
}

function updateSwarm(dt, target, voidN, rimPx, tiltNow) {
  // population
  let churn = P.swarmChurn;
  while (swarmN < target && churn-- > 0) swarmSpawn(swarmN++);
  churn = P.swarmChurn;
  while (swarmN > target && churn-- > 0) {
    const k = (Math.random() * swarmN) | 0;
    swarmN--;
    for (const key of ['rN', 'v', 'ang0', 'jit', 'zN', 'ph', 'ecc', 'per',
      'sx', 'sy', 'aR', 'aG', 'aB', 'b', 'fr']) {
      swm[key][k] = swm[key][swarmN];
    }
    swm.bR[k] = swm.bR[swarmN]; swm.bG[k] = swm.bG[swarmN]; swm.bB[k] = swm.bB[swarmN];
  }

  const k = P.swarmRes;
  const cx = width / 2 * k, cy = height / 2 * k;
  const cosT = Math.cos(tiltNow), sinT = Math.sin(tiltNow);
  const wind = P.armWind, rPx = rimPx * k;

  // update a third of the swarm per frame (positions change slowly;
  // this pays for the higher star count of the stable 1k scale)
  swarmPhase = (swarmPhase + 1) % 3;
  const step = swarmForce ? 1 : 3;
  const start = swarmForce ? 0 : swarmPhase;
  const dt2 = swarmForce ? dt : dt * 3;
  for (let i = start; i < swarmN; i += step) {
    let r = swm.rN[i];
    // inward flow: the outer field is nearly still, the core races.
    // calm slows BOTH drift and orbit beyond the rim.
    const calm = r > 1 ? 1 / (1 + P.outerCalm * (r - 1)) : 1;
    const pile = (1 - P.pileUp) + P.pileUp * Math.min(Math.max((r - voidN * 1.15) / 0.25, 0), 1);
    r -= swm.v[i] * dt2 * calm * pile;
    if (r < voidN * 1.02) { swarmSpawn(i); r = swm.rN[i]; } // extracted -> a new session begins
    swm.rN[i] = r;

    // differential orbit: inner stars circle fast, outer stars barely move
    swm.ph[i] += P.omegaBase * Math.pow(r > 0.08 ? r : 0.08, -P.omegaPow) * calm * dt2;

    const rC = r < 1 ? r : 1;
    // arm convergence: chaos at the rim locks onto the arm spirals inward
    const th = swm.ang0[i]
      + swm.jit[i] * (0.05 + 1.5 * rC) * (r > 1 ? 1.6 : 1)
      - wind * rC + swm.ph[i];
    // v2 elliptical orbit
    const ec = swm.ecc[i];
    const R = r * (1 - ec * ec) / (1 + ec * Math.cos(th - swm.per[i])) * rPx;
    const px = R * Math.cos(th), py0 = R * Math.sin(th);
    const zAmp = P.zThin + P.zBulge * Math.pow(Math.max(0, 1 - rC), 1.5);
    const gz = swm.zN[i] * zAmp * rPx;
    const py = py0 * FLAT - gz * SINI;
    swm.sx[i] = cx + px * cosT - py * sinT;
    swm.sy[i] = cy + px * sinT + py * cosT;

    // depth: which side of the sphere, plus a brightness cue for nearness
    const dN = (py0 * SINI + gz * FLAT) / rPx;
    swm.fr[i] = dN >= 0 ? 1 : 0;
    let cue = 1 + P.depthCue * dN;
    if (cue < 0.6) cue = 0.6; else if (cue > 1.4) cue = 1.4;

    // dim beyond the rim; warm-shift toward the bulge
    const outer = r > 1 ? 1 / (1 + P.outerDim * (r - 1)) : 1;
    const w2 = 0.55 * (1 - rC) * (1 - rC);
    const cr = swm.bR[i] + (255 - swm.bR[i]) * w2;
    const cg = swm.bG[i] + (225 - swm.bG[i]) * w2;
    const cb = swm.bB[i] + (175 - swm.bB[i]) * w2;
    const bb = swm.b[i] * cue * outer;
    swm.aR[i] = bb * cr / 255;
    swm.aG[i] = bb * cg / 255;
    swm.aB[i] = bb * cb / 255;
  }
  swarmForce = false;

  // ---- accumulate: bilinear sub-pixel splatting into depth halves ----
  accRB.fill(0); accGB.fill(0); accBB.fill(0);
  accRF.fill(0); accGF.fill(0); accBF.fill(0);
  const W = swarmBufB.width, H = swarmBufB.height;
  for (let i = 0; i < swarmN; i++) {
    const x = swm.sx[i], y = swm.sy[i];
    const x0 = x | 0, y0 = y | 0;
    if (x0 < 1 || x0 >= W - 2 || y0 < 1 || y0 >= H - 2) continue;
    const fx = x - x0, fy = y - y0;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy, w11 = fx * fy;
    const idx = y0 * W + x0;
    const aR = swm.aR[i], aG = swm.aG[i], aB = swm.aB[i];
    let R, G, B;
    if (swm.fr[i]) { R = accRF; G = accGF; B = accBF; }
    else { R = accRB; G = accGB; B = accBB; }
    R[idx] += aR * w00; G[idx] += aG * w00; B[idx] += aB * w00;
    R[idx + 1] += aR * w10; G[idx + 1] += aG * w10; B[idx + 1] += aB * w10;
    R[idx + W] += aR * w01; G[idx + W] += aG * w01; B[idx + W] += aB * w01;
    R[idx + W + 1] += aR * w11; G[idx + W + 1] += aG * w11; B[idx + W + 1] += aB * w11;
    if (swm.b[i] > 2.2) { // brightest stars get a soft cross halo
      const q = 0.2;
      R[idx - 1] += aR * q; G[idx - 1] += aG * q; B[idx - 1] += aB * q;
      R[idx + 2] += aR * q; G[idx + 2] += aG * q; B[idx + 2] += aB * q;
      R[idx - W] += aR * q; G[idx - W] += aG * q; B[idx - W] += aB * q;
      R[idx + W + W] += aR * q; G[idx + W + W] += aG * q; B[idx + W + W] += aB * q;
    }
  }

  // ---- tone map both halves ----
  toneMapInto(swarmBufB, accRB, accGB, accBB, W, H);
  toneMapInto(swarmBufF, accRF, accGF, accBF, W, H);
}

function toneMapInto(buf, aR, aG, aB, W, H) {
  buf.loadPixels();
  const pix = buf.pixels;
  pix.fill(0);
  for (let p2 = 0, n = W * H; p2 < n; p2++) {
    const r = aR[p2], g = aG[p2], b2 = aB[p2];
    if (r + g + b2 < 0.02) continue;
    const o = p2 * 4;
    let qi = (r * 64) | 0; pix[o] = TONE[qi > 8191 ? 8191 : qi];
    qi = (g * 64) | 0; pix[o + 1] = TONE[qi > 8191 ? 8191 : qi];
    qi = (b2 * 64) | 0; pix[o + 2] = TONE[qi > 8191 ? 8191 : qi];
    pix[o + 3] = 255;
  }
  buf.updatePixels();
}

// ------------------------------------------------------------------
// HAZE FIELD — soft luminous body beneath the swarm (built once)
// ------------------------------------------------------------------
const FR = 560;

function buildField() {
  fieldBuf = createGraphics(FR * 2.4, FR * 2.4);
  const g = fieldBuf;
  const c = g.width / 2;
  g.noStroke();
  const ctx = g.drawingContext;

  const armTheta = (arm, aN) => (TWO_PI / P.arms) * arm - P.armWind * aN;

  let grad = ctx.createRadialGradient(c, c, 0, c, c, FR);
  grad.addColorStop(0, 'rgba(70,92,140,0.18)');
  grad.addColorStop(0.5, 'rgba(42,60,104,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  g.circle(c, c, FR * 2);

  for (let i = 0; i < P.fieldPoints; i++) {
    const aN = 0.04 + 0.96 * Math.pow(random(), P.densityPow);
    const arm = floor(random(P.arms));
    const th = armTheta(arm, aN) + randomGaussian() * P.armSpread * (0.35 + 0.95 * aN);
    const r = aN * FR * random(0.97, 1.03);
    const inner = 1 - aN;
    const cr = lerp(130, 240, inner), cg = lerp(160, 222, inner), cb = lerp(215, 200, inner);
    g.fill(cr, cg, cb, random(7, 18));
    g.circle(c + r * Math.cos(th), c + r * Math.sin(th), random(1.5, 4.5));
  }

  for (let k = 0; k < P.knots; k++) {
    const aN = 0.15 + 0.80 * Math.pow(random(), 1.35);
    const arm = floor(random(P.arms));
    const th0 = armTheta(arm, aN) + randomGaussian() * P.armSpread * 0.5;
    const kx = c + aN * FR * Math.cos(th0), ky = c + aN * FR * Math.sin(th0);
    const nPts = floor(random(10, 34));
    const spread = random(4, 14);
    for (let j = 0; j < nPts; j++) {
      const b = random(150, 255);
      g.fill(b * 0.86, b * 0.95, 255, random(14, 30));
      g.circle(kx + randomGaussian() * spread, ky + randomGaussian() * spread, random(1, 3));
    }
  }

  for (let i = 0; i < P.dustPoints; i++) {
    const aN = 0.18 + 0.72 * Math.pow(random(), 1.1);
    const arm = floor(random(P.arms));
    const th = armTheta(arm, aN) - 0.10 + randomGaussian() * 0.05;
    const r = aN * FR * random(0.98, 1.02);
    g.fill(4, 5, 9, random(22, 46));
    g.circle(c + r * Math.cos(th), c + r * Math.sin(th), random(3, 9));
  }

  for (let i = 0; i < P.bulgePoints; i++) {
    const r = Math.abs(randomGaussian()) * FR * 0.11;
    const th = random(TWO_PI);
    g.fill(255, 238, 208, random(12, 26));
    g.circle(c + r * Math.cos(th), c + r * Math.sin(th), random(1.5, 5));
  }

  grad = ctx.createRadialGradient(c, c, 0, c, c, FR * 0.26);
  grad.addColorStop(0, 'rgba(255,250,238,0.95)');
  grad.addColorStop(0.22, 'rgba(255,240,212,0.55)');
  grad.addColorStop(0.55, 'rgba(240,214,180,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  g.circle(c, c, FR * 0.52);

  g.filter(BLUR, 2);
}

// ------------------------------------------------------------------
// BACKGROUND — haze + vignette only; the swarm owns the whole screen
// ------------------------------------------------------------------
function buildBackground() {
  bgBuf = createGraphics(width, height);
  const g = bgBuf;
  g.background(1, 2, 5);
  const ctx = g.drawingContext;
  let grad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.min(width, height) * 0.8);
  grad.addColorStop(0, 'rgba(24,36,68,0.14)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  g.noStroke();
  g.rect(0, 0, width, height);
  grad = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.38,
    width / 2, height / 2, Math.max(width, height) * 0.78);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = grad;
  g.rect(0, 0, width, height);
}

// ------------------------------------------------------------------
// HOW-TO-READ CARD — built by the sketch itself (no HTML edits needed).
// Collapsed chip bottom-right; expands on click. DOM elements sit on
// top of the canvas, so their clicks never reach the slider.
// ------------------------------------------------------------------
function buildHowToRead() {
  if (document.getElementById('htr')) return;

  const css = document.createElement('style');
  css.textContent = `
    #htr{position:fixed;right:24px;bottom:72px;z-index:9;
      display:flex;flex-direction:column;align-items:flex-end;gap:8px;
      font-family:'Courier New',Courier,monospace;}
    #htr-chip{font-family:inherit;font-size:12px;letter-spacing:1px;
      color:rgba(192,206,222,.9);background:rgba(1,2,5,.85);
      border:1px solid rgba(150,168,188,.5);padding:7px 14px;cursor:pointer;}
    #htr-chip:hover,#cur-btn:hover{background:rgba(30,40,60,.9);}
    #cur-btn{font-family:inherit;font-size:10px;letter-spacing:0;
      color:rgba(192,206,222,.9);background:rgba(1,2,5,.85);
      border:1px solid rgba(150,168,188,.5);padding:3px 8px;cursor:pointer;}
    #htr-panel{width:min(340px,86vw);max-height:60vh;overflow-y:auto;
      background:rgba(1,2,5,.94);border:1px solid rgba(150,168,188,.5);
      padding:16px 18px;color:rgba(172,188,206,.95);
      font-size:12px;line-height:1.65;}
    #htr-head{display:flex;justify-content:space-between;align-items:center;
      color:rgba(192,206,222,1);font-size:13px;letter-spacing:1px;
      margin-bottom:10px;}
    #htr-close{cursor:pointer;padding:0 4px;color:rgba(150,168,188,.8);}
    #htr-close:hover{color:#fff;}
    #htr-panel .htr-metaphor{border-left:2px solid rgba(150,168,188,.5);
      padding-left:10px;margin-bottom:10px;color:rgba(192,206,222,.95);}
    #htr-panel p{margin-bottom:10px;}
    #htr-panel .htr-instr{color:rgba(150,168,188,.9);font-size:11.5px;}
  `;
  document.head.appendChild(css);

  const root = document.createElement('div');
  root.id = 'htr';
  root.innerHTML = `
    <button id="cur-btn" title="switch currency">$</button>
    <button id="htr-chip">? how to read</button>
    <div id="htr-panel" hidden>
      <div id="htr-head"><span>? how to read</span><span id="htr-close">&times;</span></div>
      <p class="htr-metaphor">
        attention as gravity — every session online is a star; the black hole
        at the center is the advertising revenue extracted from all of them.
      </p>
      <p>
        each small star is 1,000 real sessions happening right now, following
        the platform's true daily and weekly rhythm. the larger stars are
        single users, simulated live at true statistical rates — pink booms
        are their interactions. cyan sparks are the world's engagement,
        one shown per 10,000 real events. the black hole's volume is every
        advertising dollar taken since 2004; sessions that stay too long
        sink into it.
      </p>
      <p>
        time here is your now, transposed: travelling to 2021 shows that
        year's real population and weekly rhythm — but always at your
        current hour of day, on that date's true weekday. you are not
        watching a recording of the past; you are visiting it at this
        exact moment.
      </p>
      <p class="htr-instr">
        drag the timeline &mdash; jump to any date, 2012 &rarr; now<br>
        tap [&larr;][&rarr;] &mdash; step half a year<br>
        hold [&larr;][&rarr;] &mdash; glide through time<br>
        [F] &mdash; time-lapse &times;60 gravity<br>
        &euro; / $ (top right) &mdash; switch currency
      </p>
    </div>`;
  document.body.appendChild(root);

  const chip = document.getElementById('htr-chip');
  const panel = document.getElementById('htr-panel');
  document.getElementById('htr-close').addEventListener('click', () => {
    panel.hidden = true; chip.hidden = false;
  });
  chip.addEventListener('click', () => {
    panel.hidden = false; chip.hidden = true;
  });
  const curBtn = document.getElementById('cur-btn');
  curBtn.addEventListener('click', () => {
    currency = currency === 'EUR' ? 'USD' : 'EUR';
    curBtn.textContent = currency === 'EUR' ? '$' : '\u20ac';
  });
}

// ------------------------------------------------------------------
function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  frameRate(60);
  textFont('monospace');
  buildHowToRead();
  buildField();
  buildBackground();
  initSwarm();

  // intro flight: begin in 2012, travel linearly to LIVE
  scrubYears = YEAR0 - nowYearFloat();
  introT0 = millis();

  // CSVs: try the shared /data folder first, then local fallbacks
  const tabs = [null, null];
  const done = () => buildBiasPool(tabs);
  const tryLoad = (paths, cb) => {
    if (!paths.length) return;
    try {
      loadTable(paths[0], 'csv', 'header', t => cb(t), () => tryLoad(paths.slice(1), cb));
    } catch (e) { /* offline / file:// — random variation stands */ }
  };
  tryLoad(['shared/data/meta_data.csv', '../data/meta_data.csv',
    'data/meta_data.csv', 'meta_data.csv'],
    t => { tabs[0] = t; done(); });
  tryLoad(['shared/data/instagram_data.csv', '../data/instagram_data.csv',
    'data/instagram_data.csv', 'instagram_data.csv'],
    t => { tabs[1] = t; done(); });

  // prefill heroes at staggered session ages
  const target = Math.round(activeSessions(viewYear()) / P.usersPerStar);
  for (let i = 0; i < target; i++) {
    const s = new Star();
    const age = random(0, s.sessionLen * 0.9);
    s.born = simT - age;
    s.rN = Math.max(0.2, s.rN - s.vSink * age);
    stars.push(s);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildBackground();
  makeSwarmBuf();
}

// ------------------------------------------------------------------
function draw() {
  const dtReal = Math.min(deltaTime / 1000, 0.05);
  const dt = dtReal * timeScale;
  simT += dt;
  noiseTick += dtReal;

  // intro flight: 2012 -> LIVE, linear, interruptible by any input
  if (intro) {
    const t = (millis() - introT0) / 1000;
    scrubYears = lerp(YEAR0 - nowYearFloat(), 0, Math.min(t / INTRO_DUR, 1));
    if (t >= INTRO_DUR) { intro = false; scrubYears = 0; }
  } else {
    // holding an arrow glides through time (~1.2 years per second)
    if (heldL && millis() - heldL > 300) {
      scrubYears = Math.max(scrubYears - 1.2 * dtReal, YEAR0 - nowYearFloat());
    }
    if (heldR && millis() - heldR > 300) {
      scrubYears = Math.min(scrubYears + 1.2 * dtReal, 0);
    }
  }

  const yf = viewYear();
  const dau = series(DAU_B, yf);
  const arpu = series(ARPU_Q, yf);
  const eng = series(ENG_PCT, yf);
  const sessions = activeSessions(yf);
  const target = Math.max(24, Math.round(sessions / P.usersPerStar));

  const minDim = Math.min(width, height);
  const sizeF = map(dau, DAU_B[0], DAU_B[DAU_B.length - 1], P.sizeFMin, 1.0);
  const rimPx = minDim * P.radius * sizeF;
  // the void's VOLUME = cumulative ADVERTISING revenue extracted since 2004
  const voidN = P.voidMax * Math.cbrt(adRevCumTotal(yf) / adRevCumTotal(nowYearFloat()));
  const tiltNow = P.tilt + P.camDrift * Math.sin(simT * P.camRate);

  // ---- hero population ----
  for (let i = stars.length - 1; i >= 0; i--) if (stars[i].dead()) stars.splice(i, 1);
  let alive = 0;
  for (const s of stars) if (s.state === 'live') alive++;
  if (alive < target) {
    for (let k = 0; k < Math.min(P.spawnCap, target - alive); k++) stars.push(new Star());
  } else if (alive > target * 1.15) {
    let cull = Math.min(P.cullCap, alive - target);
    for (let i = 0; i < stars.length && cull > 0; i++) {
      const s = stars[i];
      if (s.state === 'live' && random() < 0.2) { s.state = 'fading'; s.endAt = simT; cull--; }
    }
  }

  // ---- engagement events ----
  const haloP = MetaData.eventsPerActiveSec(yf) * P.haloVis * dt;
  for (const s of stars) {
    s.update(dt, voidN);
    if (s.state === 'live' && random() < haloP * s.bias) s.haloAt = simT;
  }

  // ---- swarm: exact partition — swarmN × 1,000 + userStarN × 1 = sessions ----
  const swarmTarget = Math.min(P.maxSwarm,
    Math.round((sessions - target) / P.usersPerSwarmStar));
  updateSwarm(dt, swarmTarget, voidN, rimPx, tiltNow);

  // ================================================================
  image(bgBuf, 0, 0);

  // haze field
  push();
  translate(width / 2, height / 2);
  rotate(tiltNow);
  scale(1, FLAT);
  push();
  rotate(P.spin * simT);
  const fieldA = map(dau, DAU_B[0], DAU_B[DAU_B.length - 1], P.fieldAlphaMin, P.fieldAlphaMax);
  tint(255, fieldA);
  imageMode(CENTER);
  const drawW = (fieldBuf.width / FR) * rimPx;
  image(fieldBuf, 0, 0, drawW, drawW);
  noTint();
  imageMode(CORNER);
  pop();
  pop();

  // far side of the galaxy, behind the sphere
  blendMode(ADD);
  image(swarmBufB, 0, 0, width, height);
  blendMode(BLEND);
  drawHeroes(rimPx, tiltNow, false);

  // the void — a sphere sitting IN the disk: far stars behind it,
  // near stars pass in front of it
  push();
  translate(width / 2, height / 2);
  const vr = voidN * rimPx;
  const ctx = drawingContext;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, vr * 1.45);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.69, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  noStroke();
  circle(0, 0, vr * 2.9);
  pop();

  // near side, in front of the sphere
  blendMode(ADD);
  image(swarmBufF, 0, 0, width, height);
  blendMode(BLEND);
  drawHeroes(rimPx, tiltNow, true);

  // ---- sparks: world engagement, 1 shown per P.sparkSample real events,
  // at the LIVE rate (hour rhythm + weekend damping) ----
  sparkCarry += (liveEventsPerSec(yf) / P.sparkSample) * dt;
  while (sparkCarry >= 1 && swarmN > 0) {
    sparkCarry -= 1;
    const i = (Math.random() * swarmN) | 0; // events happen where sessions are
    sparks.push({ x: swm.sx[i] / P.swarmRes, y: swm.sy[i] / P.swarmRes, t0: simT });
    if (sparks.length > 400) sparks.shift();
  }
  blendMode(ADD);
  noStroke();
  for (let i = sparks.length - 1; i >= 0; i--) {
    const sp = sparks[i];
    const age = (simT - sp.t0) / P.sparkLife;
    if (age >= 1) { sparks.splice(i, 1); continue; }
    const env = age < 0.25 ? age / 0.25 : 1 - (age - 0.25) / 0.75;
    fill(160, 230, 255, 190 * env); // increase brightnes 4 spark
    sparkShape(sp.x, sp.y, P.sparkSize * (0.5 + 0.5 * env));
  }
  blendMode(BLEND);

  drawHUD(yf, dau, arpu, eng, sessions);
}

// four-pointed sparkle diamond (✨-style, singular)
function sparkShape(x, y, s) {
  const q = s * 0.28;
  beginShape();
  vertex(x, y - s); vertex(x + q, y - q); vertex(x + s, y);
  vertex(x + q, y + q); vertex(x, y + s); vertex(x - q, y + q);
  vertex(x - s, y); vertex(x - q, y - q);
  endShape(CLOSE);
}

// ------------------------------------------------------------------
// HERO PASS — front=true draws only the viewer's side of the disk
// ------------------------------------------------------------------
function drawHeroes(rimPx, tiltNow, front) {
  push();
  translate(width / 2, height / 2);
  rotate(tiltNow);
  scale(1, FLAT);
  blendMode(ADD);
  noStroke();
  for (const s of stars) {
    const e = s.env();
    if (e <= 0.01) continue;
    const th = s.theta();
    if ((Math.sin(th) >= 0) !== front) continue; // depth half
    const rf = 1 + (noise(s.seed + 50, noiseTick * 0.06) - 0.5) * 0.1;
    const r = s.drawR(rimPx) * rf;
    const wob = (noise(s.seed, noiseTick * 0.2) - 0.5) * 2 * P.wobble;
    const x = r * Math.cos(th), y = r * Math.sin(th) + wob;
    const tw = 1 - P.twinkle / 2 + P.twinkle * noise(s.seed, noiseTick * 0.5);
    const b = (50 + 135 * (s.size / P.bigMax)) * tw * e;

    const hAge = simT - s.haloAt;
    if (hAge < P.haloRise + P.haloFall) {
      const hv = hAge < P.haloRise ? hAge / P.haloRise : 1 - (hAge - P.haloRise) / P.haloFall;
      fill(255, 110, 170, 160 * hv * e);
      circle(x, y, s.size * P.haloSize * (0.6 + 0.4 * hv));
      fill(255, 165, 205, 220 * hv * e);
      circle(x, y, s.size * 3.2);
    }

    if (s.warm) fill(b, b * 0.82, b * 0.62, 235 * e);
    else fill(b * 0.88, b * 0.93, b, 235 * e);
    circle(x, y, s.size);
  }
  blendMode(BLEND);
  pop();
}

// ------------------------------------------------------------------
// HUD
// ------------------------------------------------------------------
function drawHUD(yf, dau, arpu, eng, sessions) {
  const isNow = scrubYears === 0;
  const est = yf >= EST_FROM;

  const wander = (noise(noiseTick * 0.7) - 0.5) * 0.0006;
  const liveCount = Math.round(sessions * (1 + wander));

  // all derived figures come from the shared MetaData module
  const revPerSec = MetaData.revPerSec(yf);
  const arpuYr = MetaData.arpuYear(yf);
  const revPerSession = MetaData.revPerSession(yf);
  const passivity = MetaData.passivity(yf) * 100;

  let stamp;
  const DOWS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  if (isNow) {
    const d = new Date();
    stamp = `${d.getFullYear()}-${nf(d.getMonth() + 1, 2)}-${nf(d.getDate(), 2)} ${DOWS[d.getDay()]} ` +
      `${nf(d.getHours(), 2)}:${nf(d.getMinutes(), 2)}:${nf(d.getSeconds(), 2)} GLOBAL LIVE`;
  } else {
    // the viewed moment as a real calendar date: your now, transposed
    const d = new Date(Date.now() + scrubYears * 365.25 * 86400 * 1000);
    stamp = `${d.getFullYear()}-${nf(d.getMonth() + 1, 2)}-${nf(d.getDate(), 2)} ${DOWS[d.getDay()]} ` +
      `${nf(d.getHours(), 2)}:${nf(d.getMinutes(), 2)} GLOBAL HISTORICAL`;
  }

  const c1 = color(192, 206, 222, 245);  // values — lighter
  const c2 = color(172, 188, 206, 165);  // labels — lighter
  const c3 = color(150, 168, 188, 115);  // fine print

  noStroke();
  textAlign(LEFT, TOP);
  const L = 28; let y = 26;

  fill(c1); textSize(17);
  text('THE USER SPACE', L, y);
  // timestamp: top-right corner of the screen, small and dark
  // (right-aligning it inside the HUD column collides with the title)
  const titleW = textWidth('THE USER SPACE');
  textSize(11); fill(c1);
  textStyle(BOLD);
  text(stamp, L + titleW + 14, y + 3);
  textStyle(NORMAL);
  y += 19;
  stroke(172, 188, 206, 70); line(L, y, L + 250, y); noStroke(); y += 12;

  textSize(11);
  const row = (label, val, estTag, sub) => {
    fill(c2); text(label, L, y);
    fill(c1); text(val, L + 158, y);
    if (estTag) {
      const w = textWidth(val);
      textSize(7); fill(c3);
      text('EST', L + 158 + w + 6, y + 2);
      textSize(11);
    }
    y += 17;
    if (sub) { textSize(8); fill(c3); text(sub, L, y - 3); y += 11; textSize(11); }
  };
  textSize(11);
  row('ACTIVE SESSIONS NOW', liveCount.toLocaleString('en-US'), est);
  row('STARS RENDERED', swarmN.toLocaleString('en-US')
    + '  (1 = ' + P.usersPerSwarmStar.toLocaleString('en-US') + ' SESSIONS)');
  row('USER STARS', stars.length.toLocaleString('en-US')
    + '  (1 PER ' + P.usersPerStar.toLocaleString('en-US') + ')');
  row('REVENUE', curSym() + Math.round(revPerSec * fxRate()).toLocaleString('en-US') + ' / SECOND', est);
  const cum = adRevCumTotal(yf) * fxRate();
  row('CUMULATIVE AD REVENUE', cum >= 1e12
    ? curSym() + nf(cum / 1e12, 1, 2) + ' T'
    : curSym() + Math.round(cum / 1e9).toLocaleString('en-US') + ' B', true);
  row('REVENUE / SESSION', curSym() + nf(revPerSession * fxRate(), 1, 3), true);
  row('ARPU / YEAR', curSym() + nf(arpuYr * fxRate(), 1, 2), est);
  row('ENGAGEMENT RATE', nf(eng, 1, 2) + ' %', est);
  const eventsPerSec = liveEventsPerSec(yf);
  row('ENGAGEMENT EVENTS', '≈ ' + Math.round(eventsPerSec).toLocaleString('en-US') + ' / SEC', true);
  row('PASSIVITY INDEX', nf(passivity, 1, 1) + ' %', true,
    '% OF PLATFORM TIME WITHOUT CONSCIOUS ACTION');
  if (timeScale !== 1) { fill(c1); text(`[TIME-LAPSE ×${timeScale} GRAVITY]`, L, y + 4); }

  // ---- key (bottom-left, above the timeline), with drawn icons ----
  textAlign(LEFT, BOTTOM);
  textSize(11);
  fill(c2);
  text('KEY', L, height - 135);
  const kT = L + 18, kI = L + 6; // text column, icon column
  fill(c1);
  text('STAR — ' + P.usersPerSwarmStar.toLocaleString('en-US') + ' ACTIVE SESSIONS', kT, height - 121);
  text("USER STAR — ONE USER'S SESSION, SIMULATED LIVE", kT, height - 107);
  text("PINK BOOM — THAT USER'S ENGAGEMENT ACTIVITY", kT, height - 93);
  text('SPARK — GLOBAL ENGAGEMENT, 1 SHOWN PER '
    + P.sparkSample.toLocaleString('en-US') + ' EVENTS', kT, height - 79);
  text('BLACK HOLE — EXTRACTED CUMULATIVE AD REVENUE (since 2004)', kT, height - 65);

  // icons — small miniatures of the real objects, aligned to their lines
  noStroke();
  fill(200, 214, 235, 200);                       // star
  circle(kI, height - 128, 1.8);
  fill(235, 242, 255, 225);                       // user star
  circle(kI, height - 114, 3.2);
  fill(255, 110, 170, 70);                        // pink boom: faint halo + small core
  circle(kI, height - 100, 8);
  fill(255, 165, 205, 140);
  circle(kI, height - 100, 2.8);
  fill(160, 230, 255, 170);                       // spark diamond
  sparkShape(kI, height - 86, 4);
  fill(0);                                        // black hole: disc + ring
  circle(kI, height - 72, 8);
  noFill(); stroke(150, 168, 188, 120);
  circle(kI, height - 72, 8.8);
  noStroke();

  // ---- sources + controls ----
  textSize(8);
  fill(150, 168, 188, 90);
  textAlign(LEFT, BOTTOM);
  text('DATA: meta ir / sec 10-k · rival iq · socialinsider · hootsuite · emarketer / statista (time spent) · verduyn et al. 2015 (passive use) · kaggle: elblgihy 2024, bedmutha 2024 · 2026 est', L, height - 18);  textAlign(RIGHT, BOTTOM);
  textSize(9);
  fill(192, 206, 222, 175);
  text('press · [←][→] TRAVEL TIME · [F] TIME-LAPSE ×60 GRAVITY', width - L, height - 20);

  // ---- timeline slider ----
  const t = (yf - YEAR0) / (nowYearFloat() - YEAR0);
  stroke(150, 168, 188, 90);
  strokeWeight(4);                                  // → strokeWeight(4); and alpha 60 → 90
  line(L, height - 38, width - L, height - 38);
  strokeWeight(3);                                  // → strokeWeight(3);
  const px = lerp(L, width - L, constrain(t, 0, 1));
  stroke(205, 220, 238, 220);                       // → alpha 170 → 220
  line(px, height - 46, px, height - 30);           // → line(px, height - 46, px, height - 30);  (taller marker)
  noStroke();
  textSize(10); fill(c3);
  textAlign(LEFT, BOTTOM); text('2012', L, height - 48);
  textAlign(RIGHT, BOTTOM); text('NOW', width - L, height - 48);

  // ---- nav guide + currency toggle (top-right, clickable) ----
  textAlign(RIGHT, TOP);
  textSize(10);
  fill(c3);
  text('next: [N]', width - L, 26);
  text('back: [B]', width - L, 41);
  text('home: [H]', width - L, 56);
  textAlign(LEFT, TOP);
}

// ------------------------------------------------------------------
function keyPressed() {
  intro = false;
  if (keyCode === LEFT_ARROW) {
    if (!heldL) { // first press steps; browser key-repeat is ignored (glide handles holds)
      scrubYears = Math.max(scrubYears - 0.5, YEAR0 - nowYearFloat());
      swarmForce = true;
      heldL = millis();
    }
    return false;
  }
  if (keyCode === RIGHT_ARROW) {
    if (!heldR) {
      scrubYears = Math.min(scrubYears + 0.5, 0);
      swarmForce = true;
      heldR = millis();
    }
    return false;
  }
  if (key === 'f' || key === 'F') timeScale = timeScale === 1 ? P.timeScaleFast : 1;
}

function keyReleased() {
  if (keyCode === LEFT_ARROW) heldL = 0;
  if (keyCode === RIGHT_ARROW) heldR = 0;
}

// ---- timeline slider: click to jump, drag to scrub ----
function timelineSeek(mx) {
  const L = 28;
  const t = constrain((mx - L) / (width - 2 * L), 0, 1);
  scrubYears = Math.min(0, YEAR0 + t * (nowYearFloat() - YEAR0) - nowYearFloat());
}

function mousePressed() {
  intro = false;
  // top-right controls: nav guide + currency toggle
  if (mouseX >= width - 130 && mouseX <= width - 14) {
    if (mouseY >= 24 && mouseY < 39) { window.location.href = NAV_NEXT; return; }
    if (mouseY >= 39 && mouseY < 54) { window.location.href = NAV_BACK; return; }
    if (mouseY >= 54 && mouseY < 69) { window.location.href = NAV_HOME; return; }
  }
  if (Math.abs(mouseY - (height - 38)) < 10 && mouseX >= 14 && mouseX <= width - 14) {
    timelineSeek(mouseX);
    swarmForce = true;
    sliderDrag = true;
  }
}

function mouseDragged() {
  if (sliderDrag) timelineSeek(mouseX);
}

function mouseReleased() {
  sliderDrag = false;
}