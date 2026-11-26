// SKYWARD FURY — Archipelago Strike. A golden-hour jet-fighter game in one file:
// a procedural Web Audio synth, a three.js scene (sky-dome shader, animated ocean,
// volcanic islands, sea arches, a dreadnought carrier), three escalating waves of
// ring runs, dogfights and a carrier strike, a homing-missile lock-on system, and
// a full tactical HUD drawn on a 2D canvas over the 3D view. Everything is
// procedural — no texture, model or sound file is ever fetched.
//
// Screenshot states: ?state=title|canyon|dogfight|boss starts the engine in that
// live state; &hold=1 freezes the simulation on the composed frame so a headless
// capture sees exactly the moment the state was built for.

(() => {
'use strict';

/* ================= procedural Web Audio synth =================
   One noise loop becomes the jet turbine (its filter and gain ride the throttle);
   every other sound is a small oscillator voice struck on demand. Nothing is
   created until the first user gesture, as browsers require. */
const Sfx = {
  ctx: null, engineGain: null, engineFilter: null, lockClock: 0,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // brown-ish noise for the turbine bed
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      d[i] = (last + 0.04 * white) / 1.04;
      last = d[i];
      d[i] *= 2.6;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 170;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.07;
    src.connect(this.engineFilter); this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    src.start();
  },
  engine(throttle01, boosting, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(active ? (boosting ? 0.21 : 0.085 + throttle01 * 0.06) : 0.018, t, 0.09);
    this.engineFilter.frequency.setTargetAtTime(boosting ? 560 : 150 + throttle01 * 230, t, 0.09);
  },
  voice(type, from, to, dur, vol, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  cannon() { this.voice('sawtooth', 175 + Math.random() * 45, 46, 0.065, 0.1); },
  missile() { this.voice('triangle', 540, 130, 0.45, 0.17); },
  boom(big) { this.voice('sawtooth', big ? 92 : 128, 21, big ? 0.95 : 0.48, big ? 0.3 : 0.19); },
  ring() { [587.33, 880, 1174.66].forEach((f, i) => this.voice('sine', f, f, 0.25, 0.085, i * 0.05)); },
  lockBeep(locked, dt) {
    if (!this.ctx) return;
    this.lockClock -= dt;
    if (this.lockClock > 0) return;
    this.lockClock = locked ? 0.13 : 0.3;
    this.voice('sine', locked ? 1320 : 880, locked ? 1320 : 880, 0.055, 0.055);
  },
};

/* ================= scene, sky, ocean ================= */
const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const hud2d = hudCanvas.getContext('2d');

const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xd97b54, 0.00042);
const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 1, 14000);

// Golden-hour sky dome: twilight zenith melting through crimson to an amber
// horizon, with a two-lobe sun glow around the sun direction.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(11000, 32, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x13223f) },
      middle: { value: new THREE.Color(0x9a4654) },
      horizon: { value: new THREE.Color(0xf59e42) },
      sunDir: { value: new THREE.Vector3(0.45, 0.16, -0.88).normalize() },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 zenith; uniform vec3 middle; uniform vec3 horizon; uniform vec3 sunDir;',
      'varying vec3 vDir;',
      'void main(){',
      '  vec3 dir = normalize(vDir);',
      '  float h = clamp(dir.y, 0.0, 1.0);',
      '  vec3 col = mix(horizon, middle, smoothstep(0.0, 0.25, h));',
      '  col = mix(col, zenith, smoothstep(0.22, 0.78, h));',
      '  float s = max(dot(dir, sunDir), 0.0);',
      '  col += vec3(1.0, 0.72, 0.32) * pow(s, 16.0) * 0.65;',
      '  col += vec3(1.0, 0.95, 0.85) * pow(s, 240.0) * 1.4;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  }));
scene.add(sky);

scene.add(new THREE.HemisphereLight(0xffcfa3, 0x1e3a5f, 1.05));
const sun = new THREE.DirectionalLight(0xffb76b, 1.8);
sun.position.set(1800, 680, -3500);
scene.add(sun);

// Animated ocean: a subdivided plane whose vertices ride a slow swell; the base
// heights are kept aside so the wave phase can be added per frame.
const oceanGeo = new THREE.PlaneGeometry(22000, 22000, 96, 96);
oceanGeo.rotateX(-Math.PI / 2);
const oceanBase = new Float32Array(oceanGeo.attributes.position.count);
for (let i = 0; i < oceanBase.length; i++) {
  const x = oceanGeo.attributes.position.getX(i);
  const z = oceanGeo.attributes.position.getZ(i);
  oceanBase[i] = Math.sin(x * 0.008) * 1.8 + Math.cos(z * 0.008) * 1.8;
}
const ocean = new THREE.Mesh(oceanGeo, new THREE.MeshStandardMaterial({
  color: 0x0d3b52, emissive: 0x1a2639, emissiveIntensity: 0.35,
  roughness: 0.36, metalness: 0.42, flatShading: true,
}));
scene.add(ocean);

/* ================= procedural mesh builders ================= */
// One fighter builder serves the player and the crimson squadron: delta wings
// from an extruded planform, twin canted fins, a tinted canopy, wingtip pods and
// twin afterburner flames whose scale the flight loop drives.
function fighterMesh(bodyHex, accentHex, hostile) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: bodyHex, roughness: 0.35, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.4, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({
    color: hostile ? 0xef4444 : 0x38bdf8, roughness: 0.1, metalness: 0.9,
    emissive: hostile ? 0x450a0a : 0x082f49, emissiveIntensity: 0.5,
  });

  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.35, 14, 8), body);
  fus.rotation.x = Math.PI / 2;
  g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.95, 4.8, 8), dark);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -9.4;
  g.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.92, 12, 8), glass);
  canopy.scale.set(0.85, 0.72, 2.6); canopy.position.set(0, 0.85, -2.5);
  g.add(canopy);

  const plan = new THREE.Shape();
  plan.moveTo(0, 0); plan.lineTo(8.5, 3.8); plan.lineTo(8.5, 5.4); plan.lineTo(0, 4.8); plan.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(plan, { depth: 0.24, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2);
  const wingR = new THREE.Mesh(wingGeo, body); wingR.position.set(0.6, 0.05, -0.5); g.add(wingR);
  const wingL = new THREE.Mesh(wingGeo, body); wingL.scale.x = -1; wingL.position.set(-0.6, 0.05, -0.5); g.add(wingL);

  for (const x of [-8.9, 8.9]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.4, 6), accent);
    pod.rotation.x = Math.PI / 2; pod.position.set(x, 0, 4.2);
    g.add(pod);
  }
  [-1.1, 1.1].forEach((x, i) => {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.7, 2.8), accent);
    fin.position.set(x, 1.35, 5.1);
    fin.rotation.z = i === 0 ? 0.32 : -0.32; fin.rotation.x = -0.25;
    g.add(fin);
  });
  const flames = [];
  for (const x of [-0.65, 0.65]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.38, 1.2, 8), dark);
    nozzle.rotation.x = Math.PI / 2; nozzle.position.set(x, 0, 7.2);
    g.add(nozzle);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 4.2, 8),
      new THREE.MeshBasicMaterial({ color: hostile ? 0xff4500 : 0x38bdf8, transparent: true, opacity: 0.9 }));
    flame.rotation.x = Math.PI / 2; flame.position.set(x, 0, 9.6);
    g.add(flame); flames.push(flame);
  }
  g.userData.flames = flames;
  return g;
}

// A volcanic island: a jittered cone vertex-coloured sand -> jungle -> rock.
function islandMesh(x, z, radius, height) {
  const geo = new THREE.ConeGeometry(radius, height, 11, 5);
  const pos = geo.attributes.position;
  const colours = [];
  const sand = new THREE.Color(0xd6a86c), jungle = new THREE.Color(0x2f5d46), rock = new THREE.Color(0x57534e);
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
    const hn = (vy + height * 0.5) / height;
    if (hn < 0.95) {
      const j = Math.sin(vx * 0.05 + vz * 0.04) * 0.18 + 1;
      pos.setX(i, vx * j); pos.setZ(i, vz * j);
    }
    const c = hn < 0.14 ? sand : (hn < 0.62 ? jungle : rock);
    colours.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true }));
  mesh.position.set(x, height * 0.45, z);
  scene.add(mesh);
  return { x, z, radius: radius * 0.85, height };
}

// A giant stone sea arch — a half-torus standing in the swell.
function seaArch(x, z, rotY) {
  const arch = new THREE.Mesh(new THREE.TorusGeometry(95, 18, 7, 16, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x5c4d44, roughness: 0.9, flatShading: true }));
  arch.position.set(x, 0, z);
  arch.rotation.y = rotY;
  scene.add(arch);
}

// The Dreadnought Carrier: hull, deck with runway stripes, and the island tower
// whose bridge core is the strike's final target.
function carrierMesh(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.6 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.3 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(58, 22, 340), hullMat);
  hull.position.y = 10; g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(74, 4, 360), deckMat);
  deck.position.y = 22; g.add(deck);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  for (let s = -140; s <= 140; s += 35) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 16), stripeMat);
    line.position.set(-8, 24.2, s); g.add(line);
  }
  const tower = new THREE.Mesh(new THREE.BoxGeometry(14, 28, 44), hullMat);
  tower.position.set(24, 37, 20); g.add(tower);
  scene.add(g);
  return g;
}

const islands = [
  [-650, -900, 240, 260], [680, -1100, 290, 320], [-950, -2100, 340, 380],
  [850, -2300, 260, 290], [0, -3100, 380, 420], [-1250, -3400, 310, 330],
  [1200, -3600, 350, 390], [-520, -4500, 280, 310], [640, -4700, 320, 340],
  [1600, -1500, 300, 310], [-1700, -1400, 280, 290], [0, -5600, 420, 460],
].map(([x, z, r, h]) => islandMesh(x, z, r, h));
seaArch(0, -1350, 0.15);
seaArch(-320, -2550, -0.35);
seaArch(360, -3850, 0.25);

/* ================= game state & entities ================= */
const params = new URLSearchParams(window.location.search);
const stateParam = params.get('state');
const holdFrame = params.get('hold') === '1';

const game = {
  mode: 'title',           // title | playing | victory | gameover
  wave: 1, score: 0, kills: 0,
  combo: 1, comboTimer: 0,
  shotsFired: 0, shotsHit: 0,
  cockpit: false, shake: 0, time: 0,
};

const jet = {
  mesh: fighterMesh(0xf1f5f9, 0xf97316, false),
  pos: new THREE.Vector3(0, 140, 0),
  quat: new THREE.Quaternion(),
  speed: 195, cruise: 195, topSpeed: 340,
  hull: 100, hullMax: 100, boost: 100,
  cannonCd: 0, missileCd: 0,
  lockTarget: null, lockProgress: 0,
};
scene.add(jet.mesh);

// Wingtip contrails: two ribbons of the last 48 tip positions, drawn as lines.
const TRAIL_LEN = 48;
function makeTrail() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
  line.frustumCulled = false;
  scene.add(line);
  return { line, pts: [] };
}
const trails = [makeTrail(), makeTrail()];

let rings = [], foes = [], bullets = [], missiles = [], debris = [], carrier = null;

function clearField() {
  for (const r of rings) scene.remove(r.mesh);
  for (const e of foes) scene.remove(e.mesh);
  for (const b of bullets) scene.remove(b.mesh);
  for (const m of missiles) scene.remove(m.mesh);
  for (const p of debris) scene.remove(p.mesh);
  if (carrier) { scene.remove(carrier); carrier = null; }
  rings = []; foes = []; bullets = []; missiles = []; debris = [];
}

function addRing(x, y, z) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.add(new THREE.Mesh(new THREE.TorusGeometry(42, 2.4, 8, 28), new THREE.MeshBasicMaterial({ color: 0x38bdf8 })));
  const inner = new THREE.Mesh(new THREE.TorusGeometry(35, 1.1, 6, 28),
    new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.75 }));
  grp.add(inner);
  scene.add(grp);
  rings.push({ mesh: grp, pos: grp.position, inner, radius: 48, passed: false });
}

// Foes come in three kinds: fighters that hunt the player, radar/AA turrets that
// sit and shoot, and the carrier's bridge core — one big target that ends it.
function addFoe(kind, x, y, z) {
  let mesh;
  if (kind === 'fighter') {
    mesh = fighterMesh(0x991b1b, 0xef4444, true); // crimson squadron: reads against the sky
  } else {
    mesh = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.5 }));
    mesh.add(base);
    const head = new THREE.Mesh(new THREE.SphereGeometry(kind === 'core' ? 8 : 6, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x7f1d1d, emissiveIntensity: 0.6 }));
    head.position.y = kind === 'core' ? 7 : 5;
    mesh.add(head);
  }
  mesh.position.set(x, y, z);
  scene.add(mesh);
  foes.push({
    kind, mesh, pos: mesh.position, quat: new THREE.Quaternion(),
    hp: kind === 'core' ? 130 : kind === 'turret' ? 60 : 45,
    speed: kind === 'fighter' ? 168 + Math.random() * 25 : 0,
    fireCd: 1.5 + Math.random() * 2,
    seed: Math.random() * Math.PI * 2,
  });
}

function setupWave(n) {
  game.wave = n;
  if (n === 1) {
    // canyon gate run: six rings threaded through the sea arches, four drones
    addRing(0, 95, -1350); addRing(-320, 105, -2550); addRing(120, 160, -3200);
    addRing(360, 100, -3850); addRing(-140, 130, -4400); addRing(60, 150, -5050);
    addFoe('fighter', -260, 210, -1800); addFoe('fighter', 320, 230, -2400);
    addFoe('fighter', 0, 250, -3500); addFoe('fighter', -420, 265, -4300);
  } else if (n === 2) {
    // archipelago intercept: six crimson fighters and three island radar towers
    addRing(0, 180, -2200); addRing(-450, 210, -3600);
    for (let i = 0; i < 6; i++) addFoe('fighter', (i - 2.5) * 320, 220 + (i % 2) * 70, -1900 - i * 420);
    addFoe('turret', -650, 262, -900); addFoe('turret', 680, 322, -1100); addFoe('turret', -950, 382, -2100);
  } else {
    // dreadnought strike: four AA turrets and the bridge core, fighter escort.
    // The carrier rides open water far east of the island chain — the first
    // berth sat inside a big island's cone, the second in its shadow.
    carrier = carrierMesh(2100, -4200);
    addFoe('turret', 2078, 26, -4310); addFoe('turret', 2122, 26, -4260);
    addFoe('turret', 2078, 26, -4120); addFoe('turret', 2122, 26, -4080);
    addFoe('core', 2124, 55, -4180);
    addFoe('fighter', 1720, 260, -3600); addFoe('fighter', 2480, 280, -3800); addFoe('fighter', 2100, 340, -4400);
  }
}

// Advance the debris field by hand: a held screenshot frame shows an explosion
// as it looks a beat after the burst — dispersed and grown — not as a clump.
function ageDebris(seconds) {
  for (const p of debris) {
    p.mesh.position.addScaledVector(p.vel, seconds);
    p.mesh.scale.addScalar(p.grow * seconds);
    p.life -= seconds * 0.5;
  }
}

function startGame(preset) {
  Sfx.init();
  clearField();
  game.mode = 'playing';
  game.score = 0; game.kills = 0; game.combo = 1; game.comboTimer = 0;
  game.shotsFired = 0; game.shotsHit = 0; game.shake = 0;
  jet.pos.set(0, 145, 0); jet.quat.identity();
  jet.speed = jet.cruise; jet.hull = jet.hullMax; jet.boost = 100;
  jet.lockTarget = null; jet.lockProgress = 0;
  for (const t of trails) t.pts.length = 0;
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.add('hidden');

  if (preset === 'canyon') {
    setupWave(1);
    jet.pos.set(-15, 95, -980);
    jet.quat.setFromEuler(new THREE.Euler(0.03, 0, -0.38));
  } else if (preset === 'dogfight') {
    setupWave(2);
    game.score = 4250; game.kills = 5; game.combo = 4; game.comboTimer = 5.5;
    jet.pos.set(0, 220, -1350);
    const first = foes.find((f) => f.kind === 'fighter');
    if (first) {
      first.pos.set(55, 232, -1560);
      jet.lockTarget = first; jet.lockProgress = 1;
      explode(new THREE.Vector3(-70, 242, -1520), 1.5);
      ageDebris(0.35);
    }
  } else if (preset === 'boss') {
    setupWave(3);
    game.score = 9800; game.kills = 11; game.combo = 6; game.comboTimer = 6;
    jet.pos.set(2100, 175, -3350);
    jet.quat.setFromEuler(new THREE.Euler(-0.14, 0, 0.22));
    explode(new THREE.Vector3(2078, 34, -4310), 1.6);
    ageDebris(0.4);
  } else {
    setupWave(1);
  }
}

function finishGame(won) {
  game.mode = won ? 'victory' : 'gameover';
  document.getElementById('end-badge').textContent = won ? 'Mission Accomplished' : 'Aircraft Down';
  document.getElementById('end-title').textContent = won ? 'AIR SUPERIORITY' : 'MAYDAY // MIA';
  document.getElementById('end-sub').textContent = won
    ? 'The Dreadnought Carrier is sinking and the archipelago airspace is secure.'
    : 'Hull integrity critical. Ejecting over the archipelago.';
  document.getElementById('stat-score').textContent = game.score.toLocaleString();
  document.getElementById('stat-kills').textContent = game.kills;
  document.getElementById('stat-rank').textContent = !won ? 'C' : (game.score >= 12000 ? 'S' : game.score >= 8000 ? 'A' : 'B');
  document.getElementById('end-screen').classList.remove('hidden');
}

/* ================= combat ================= */
function explode(at, scale) {
  game.shake = Math.min(game.shake + 0.45 * scale, 1.2);
  const count = Math.floor(14 * scale);
  for (let i = 0; i < count; i++) {
    const fire = i % 2 === 0;
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry((fire ? 3.2 : 2.2) * scale, 0),
      new THREE.MeshBasicMaterial({
        color: fire ? (Math.random() > 0.4 ? 0xfb923c : 0xfef08a) : 0x334155,
        transparent: true, opacity: 0.95,
      }));
    mesh.position.copy(at);
    scene.add(mesh);
    debris.push({
      mesh,
      vel: new THREE.Vector3((Math.random() - 0.5) * 95 * scale, (Math.random() - 0.3) * 95 * scale, (Math.random() - 0.5) * 95 * scale),
      life: 0.55 + Math.random() * 0.45, maxLife: 0.9, grow: fire ? 6 : 2,
    });
  }
}

function fireCannon() {
  if (jet.cannonCd > 0) return;
  jet.cannonCd = 0.095;
  Sfx.cannon();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(jet.quat);
  for (const side of [-2.4, 2.4]) {
    const origin = jet.pos.clone().add(new THREE.Vector3(side, -0.3, -4).applyQuaternion(jet.quat));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 14), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    mesh.position.copy(origin);
    mesh.quaternion.copy(jet.quat);
    scene.add(mesh);
    bullets.push({ mesh, pos: mesh.position, vel: fwd.clone().multiplyScalar(820), hostile: false, life: 1.4 });
    game.shotsFired++;
  }
}

function fireMissile() {
  if (jet.missileCd > 0) return;
  jet.missileCd = 2.4;
  Sfx.missile();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(jet.quat);
  const geo = new THREE.CylinderGeometry(0.35, 0.35, 5.5, 6);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xf87171 }));
  mesh.position.copy(jet.pos).addScaledVector(fwd, 6);
  mesh.quaternion.copy(jet.quat);
  scene.add(mesh);
  missiles.push({
    mesh, pos: mesh.position, quat: jet.quat.clone(), speed: 460,
    target: jet.lockProgress >= 0.95 ? jet.lockTarget : null, life: 3.6,
  });
}

function hurtFoe(foe, dmg) {
  foe.hp -= dmg;
  game.shotsHit++;
  if (foe.hp > 0) return;
  foes.splice(foes.indexOf(foe), 1);
  scene.remove(foe.mesh);
  Sfx.boom(foe.kind !== 'fighter');
  explode(foe.pos, foe.kind === 'fighter' ? 1.3 : 1.8);
  game.kills++;
  game.combo = Math.min(game.combo + 1, 10);
  game.comboTimer = 6.5;
  game.score += (foe.kind === 'fighter' ? 450 : foe.kind === 'core' ? 1500 : 600) * game.combo;
  if (foes.length === 0) {
    if (game.wave < 3) {
      jet.hull = Math.min(jet.hullMax, jet.hull + 25); // repair crews between waves
      setupWave(game.wave + 1);
    } else {
      if (carrier) explode(carrier.position.clone().add(new THREE.Vector3(0, 28, 0)), 3.2);
      setTimeout(() => finishGame(true), 700);
    }
  }
}

/* ================= input ================= */
const keys = {};
const mouse = { x: 0, y: 0, down: false };
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyC' && game.mode === 'playing') game.cockpit = !game.cockpit;
  if ((e.code === 'KeyF' || e.code === 'Enter') && game.mode === 'playing') fireMissile();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});
window.addEventListener('mousedown', (e) => {
  if (game.mode !== 'playing') return;
  if (e.button === 0) mouse.down = true;
  if (e.button === 2) fireMissile();
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.getElementById('start-btn').addEventListener('click', () => startGame());
document.getElementById('restart-btn').addEventListener('click', () => startGame());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  hudCanvas.width = window.innerWidth;
  hudCanvas.height = window.innerHeight;
});
hudCanvas.width = window.innerWidth;
hudCanvas.height = window.innerHeight;

/* ================= main simulation ================= */
let lastNow = performance.now();

function update(dt) {
  game.time += dt;

  // ocean swell
  const oPos = ocean.geometry.attributes.position;
  for (let i = 0; i < oPos.count; i += 2) {
    oPos.setY(i, oceanBase[i] + Math.sin(game.time * 2.2 + i * 0.15) * 1.1);
  }
  oPos.needsUpdate = true;

  // title attract mode: an autopilot flyby circles a clear-water bay (the
  // circle clears every island footprint) while the camera rides wide on the
  // jet's shoulder, so the title screen shows sea, sunset and islands
  if (game.mode === 'title') {
    const t = game.time * 0.24;
    jet.pos.set(Math.sin(t) * 420, 168 + Math.sin(t * 2) * 22, -500 + Math.cos(t) * 420);
    const ahead = new THREE.Vector3(Math.sin(t + 0.05) * 420, 168 + Math.sin((t + 0.05) * 2) * 22, -500 + Math.cos(t + 0.05) * 420);
    jet.mesh.position.copy(jet.pos);
    jet.mesh.lookAt(ahead);
    jet.mesh.rotateZ(Math.cos(t) * 0.35);
    jet.quat.copy(jet.mesh.quaternion);
    const off = new THREE.Vector3(24, 8, 32).applyQuaternion(jet.mesh.quaternion);
    camera.position.copy(jet.pos).add(off);
    camera.lookAt(jet.pos.clone().add(new THREE.Vector3(0, 2, -25).applyQuaternion(jet.mesh.quaternion)));
    Sfx.engine(0.3, false, false);
    return;
  }
  if (game.mode !== 'playing') return;

  jet.cannonCd = Math.max(0, jet.cannonCd - dt);
  jet.missileCd = Math.max(0, jet.missileCd - dt);
  game.shake = Math.max(0, game.shake - dt * 1.8);
  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) game.combo = 1;
  }

  // --- flight: keyboard first, mouse aim-assist when the keys are quiet ---
  let pitchIn = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
  let rollIn = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
  let yawIn = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
  if (Math.abs(pitchIn) < 0.01 && Math.abs(rollIn) < 0.01) {
    pitchIn = THREE.MathUtils.clamp(-mouse.y * 1.15, -1, 1);
    rollIn = THREE.MathUtils.clamp(-mouse.x * 1.45, -1.3, 1.3);
    yawIn = THREE.MathUtils.clamp(-mouse.x * 0.35, -0.4, 0.4);
  }
  const boosting = Boolean(keys.ShiftLeft || keys.ShiftRight) && jet.boost > 2;
  if (boosting) {
    jet.boost = Math.max(0, jet.boost - 28 * dt);
    jet.speed = THREE.MathUtils.lerp(jet.speed, jet.topSpeed, 4 * dt);
  } else {
    jet.boost = Math.min(100, jet.boost + 14 * dt);
    jet.speed = THREE.MathUtils.lerp(jet.speed, jet.cruise, 3 * dt);
  }
  Sfx.engine((jet.speed - 150) / 200, boosting, true);

  const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchIn * 1.55 * dt, yawIn * 0.85 * dt, rollIn * 2.4 * dt, 'YXZ'));
  jet.quat.multiply(dq).normalize();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(jet.quat);
  jet.pos.addScaledVector(fwd, jet.speed * dt);

  // --- the world pushes back: sea, islands, hull ---
  if (jet.pos.y < 8) {
    jet.hull -= 45 * dt;
    jet.pos.y = 8.5;
    game.shake = 0.5;
  }
  for (const isl of islands) {
    const dx = jet.pos.x - isl.x, dz = jet.pos.z - isl.z;
    const dist = Math.hypot(dx, dz);
    const maxR = isl.radius * (1 - THREE.MathUtils.clamp(jet.pos.y / isl.height, 0, 1));
    if (dist < maxR && jet.pos.y < isl.height) {
      jet.hull -= 60 * dt;
      jet.pos.x += (dx / (dist || 1)) * 40 * dt;
      jet.pos.z += (dz / (dist || 1)) * 40 * dt;
      game.shake = 0.7;
    }
  }
  if (jet.hull <= 0) {
    explode(jet.pos, 2.2);
    Sfx.boom(true);
    finishGame(false);
    return;
  }

  jet.mesh.position.copy(jet.pos);
  jet.mesh.quaternion.copy(jet.quat);
  jet.mesh.visible = !game.cockpit;
  const flameScale = boosting ? 1.75 + Math.sin(game.time * 45) * 0.25 : 0.75 + Math.sin(game.time * 30) * 0.1;
  for (const f of jet.mesh.userData.flames) f.scale.set(1, flameScale, 1);

  // contrails from the wingtips
  [-8.9, 8.9].forEach((wx, idx) => {
    const tip = new THREE.Vector3(wx, 0, 5.2).applyQuaternion(jet.quat).add(jet.pos);
    const tr = trails[idx];
    tr.pts.unshift(tip);
    if (tr.pts.length > TRAIL_LEN) tr.pts.pop();
    const arr = tr.line.geometry.attributes.position.array;
    for (let i = 0; i < TRAIL_LEN; i++) {
      const p = tr.pts[i] || tip;
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    }
    tr.line.geometry.attributes.position.needsUpdate = true;
  });

  // --- camera: chase or cockpit, FOV surging with the afterburner ---
  camera.fov = THREE.MathUtils.lerp(camera.fov, boosting ? 78 : 64, 5 * dt);
  camera.updateProjectionMatrix();
  const shakeVec = new THREE.Vector3(
    (Math.random() - 0.5) * game.shake * 4,
    (Math.random() - 0.5) * game.shake * 4,
    (Math.random() - 0.5) * game.shake * 4);
  if (game.cockpit) {
    camera.position.copy(new THREE.Vector3(0, 1.35, -3.2).applyQuaternion(jet.quat).add(jet.pos)).add(shakeVec);
    camera.quaternion.copy(jet.quat);
  } else {
    const want = new THREE.Vector3(0, 5.6, 23).applyQuaternion(jet.quat).add(jet.pos);
    camera.position.lerp(want, Math.min(1, 14 * dt)).add(shakeVec);
    camera.up.set(0, 1, 0).applyQuaternion(jet.quat);
    camera.lookAt(new THREE.Vector3(0, 1.5, -45).applyQuaternion(jet.quat).add(jet.pos));
  }

  if (keys.Space || mouse.down) fireCannon();

  // --- rings: thread one for score, combo and a boost refill ---
  for (const r of rings) {
    r.inner.rotation.z += 2.2 * dt;
    if (!r.passed && jet.pos.distanceTo(r.pos) < r.radius) {
      r.passed = true;
      r.mesh.visible = false;
      Sfx.ring();
      game.score += 300 * game.combo;
      game.combo = Math.min(game.combo + 1, 10);
      game.comboTimer = 6.5;
      jet.boost = Math.min(100, jet.boost + 35);
    }
  }

  // --- missile lock: hold the best in-cone target near the reticle ---
  let best = null, bestAngle = 0.34;
  for (const e of foes) {
    const to = e.pos.clone().sub(jet.pos);
    if (to.length() > 2600) continue;
    const ang = fwd.angleTo(to.normalize());
    if (ang < bestAngle) { bestAngle = ang; best = e; }
  }
  if (best && best === jet.lockTarget) {
    jet.lockProgress = Math.min(1, jet.lockProgress + dt * 1.45);
    Sfx.lockBeep(jet.lockProgress >= 0.95, dt);
  } else {
    jet.lockTarget = best;
    jet.lockProgress = best ? 0.15 : 0;
  }

  // --- foe AI: fighters hunt with a weaving offset; everything shoots ---
  for (const e of foes) {
    const toJet = jet.pos.clone().sub(e.pos);
    const dist = toJet.length();
    if (e.kind === 'fighter') {
      const weave = new THREE.Vector3(
        Math.sin(game.time * 0.9 + e.seed) * 180,
        Math.cos(game.time * 1.1 + e.seed) * 65,
        Math.cos(game.time * 0.9 + e.seed) * 180);
      const dir = toJet.clone().add(weave).normalize();
      const m = new THREE.Matrix4().lookAt(e.pos, e.pos.clone().add(dir), new THREE.Vector3(0, 1, 0));
      e.quat.slerp(new THREE.Quaternion().setFromRotationMatrix(m), 1.8 * dt);
      const ef = new THREE.Vector3(0, 0, -1).applyQuaternion(e.quat);
      e.pos.addScaledVector(ef, e.speed * dt);
      e.pos.y = Math.max(35, e.pos.y);
      e.mesh.quaternion.copy(e.quat);
    }
    e.fireCd -= dt;
    if (e.fireCd <= 0 && dist < 1500) {
      e.fireCd = e.kind === 'fighter' ? 2.3 : 1.7;
      const aim = toJet.normalize();
      const bm = new THREE.Mesh(new THREE.SphereGeometry(1.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0xf87171 }));
      bm.position.copy(e.pos).addScaledVector(aim, 8);
      scene.add(bm);
      bullets.push({ mesh: bm, pos: bm.position, vel: aim.multiplyScalar(390), hostile: true, life: 3.2 });
    }
  }

  // --- bullets ---
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.pos.addScaledVector(b.vel, dt);
    let hit = false;
    if (!b.hostile) {
      for (const e of foes) {
        if (b.pos.distanceTo(e.pos) < (e.kind === 'fighter' ? 14 : 18)) { hurtFoe(e, 15); hit = true; break; }
      }
    } else if (b.pos.distanceTo(jet.pos) < 8) {
      jet.hull -= 7;
      game.shake = 0.35;
      hit = true;
    }
    if (hit || b.life <= 0) { scene.remove(b.mesh); bullets.splice(i, 1); }
  }

  // --- homing missiles ---
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.life -= dt;
    if (m.target && foes.includes(m.target)) {
      const dir = m.target.pos.clone().sub(m.pos).normalize();
      const mat = new THREE.Matrix4().lookAt(m.pos, m.pos.clone().add(dir), new THREE.Vector3(0, 1, 0));
      m.quat.slerp(new THREE.Quaternion().setFromRotationMatrix(mat), 6.5 * dt);
    }
    m.pos.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(m.quat), m.speed * dt);
    m.mesh.quaternion.copy(m.quat);
    let hit = false;
    for (const e of foes) {
      if (m.pos.distanceTo(e.pos) < 22) { hurtFoe(e, 65); hit = true; break; }
    }
    if (hit || m.life <= 0) {
      if (hit) explode(m.pos, 1.1);
      scene.remove(m.mesh); missiles.splice(i, 1);
    }
  }

  // --- explosion debris ---
  for (let i = debris.length - 1; i >= 0; i--) {
    const p = debris[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.scale.addScalar(p.grow * dt);
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    if (p.life <= 0) { scene.remove(p.mesh); debris.splice(i, 1); }
  }
}

/* ================= tactical HUD (2D canvas) ================= */
function toScreen(worldPos) {
  const v = worldPos.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * hudCanvas.width, y: (-v.y * 0.5 + 0.5) * hudCanvas.height, behind: v.z > 1 };
}

function drawHud() {
  const w = hudCanvas.width, h = hudCanvas.height;
  hud2d.clearRect(0, 0, w, h);
  if (game.mode !== 'playing') return;
  const cx = w * 0.5, cy = h * 0.5;
  const green = '#4ade80', amber = '#fb923c', red = '#ef4444';

  const euler = new THREE.Euler().setFromQuaternion(jet.quat, 'YXZ');
  const pitchDeg = THREE.MathUtils.radToDeg(euler.x);
  const headingDeg = (Math.round(-THREE.MathUtils.radToDeg(euler.y)) % 360 + 360) % 360;

  // artificial horizon + pitch ladder, rolled with the jet
  hud2d.save();
  hud2d.translate(cx, cy);
  hud2d.rotate(-euler.z);
  hud2d.strokeStyle = 'rgba(74,222,128,.52)';
  hud2d.fillStyle = 'rgba(74,222,128,.85)';
  hud2d.font = '600 11px monospace';
  hud2d.lineWidth = 1.5;
  for (let deg = -30; deg <= 30; deg += 10) {
    const yOff = (pitchDeg - deg) * 5.2;
    if (Math.abs(yOff) > 150) continue;
    const half = deg === 0 ? 110 : 54;
    hud2d.beginPath();
    hud2d.setLineDash(deg < 0 ? [5, 4] : []);
    hud2d.moveTo(-half, yOff); hud2d.lineTo(-22, yOff);
    hud2d.moveTo(22, yOff); hud2d.lineTo(half, yOff);
    hud2d.stroke();
    if (deg !== 0) {
      hud2d.fillText(Math.abs(deg), half + 6, yOff + 4);
      hud2d.fillText(Math.abs(deg), -half - 22, yOff + 4);
    }
  }
  hud2d.restore();
  hud2d.setLineDash([]);

  // gun reticle + mouse steering pip
  hud2d.strokeStyle = green; hud2d.lineWidth = 2;
  hud2d.beginPath();
  hud2d.arc(cx, cy, 18, 0, Math.PI * 2);
  hud2d.moveTo(cx - 28, cy); hud2d.lineTo(cx - 10, cy);
  hud2d.moveTo(cx + 10, cy); hud2d.lineTo(cx + 28, cy);
  hud2d.moveTo(cx, cy - 28); hud2d.lineTo(cx, cy - 10);
  hud2d.stroke();
  hud2d.strokeStyle = 'rgba(253,224,71,.65)';
  hud2d.beginPath();
  hud2d.arc(cx + mouse.x * w * 0.28, cy + mouse.y * h * 0.28, 8, 0, Math.PI * 2);
  hud2d.stroke();

  // speed / altitude readouts
  hud2d.fillStyle = 'rgba(15,23,42,.55)'; hud2d.strokeStyle = 'rgba(74,222,128,.65)'; hud2d.lineWidth = 1.5;
  hud2d.fillRect(cx - 250, cy - 22, 82, 44); hud2d.strokeRect(cx - 250, cy - 22, 82, 44);
  hud2d.fillStyle = green; hud2d.font = 'bold 18px monospace';
  hud2d.fillText(String(Math.round(jet.speed * 2.1)), cx - 240, cy + 2);
  hud2d.font = '10px monospace'; hud2d.fillText('KTS', cx - 240, cy + 15);
  hud2d.fillStyle = 'rgba(15,23,42,.55)';
  hud2d.fillRect(cx + 168, cy - 22, 86, 44); hud2d.strokeRect(cx + 168, cy - 22, 86, 44);
  hud2d.fillStyle = green; hud2d.font = 'bold 18px monospace';
  hud2d.fillText(String(Math.round(jet.pos.y * 12)), cx + 176, cy + 2);
  hud2d.font = '10px monospace'; hud2d.fillText('ALT FT', cx + 176, cy + 15);

  // heading + wave banner, score + combo
  hud2d.fillStyle = 'rgba(15,23,42,.65)';
  hud2d.fillRect(cx - 110, 18, 220, 30); hud2d.strokeRect(cx - 110, 18, 220, 30);
  hud2d.fillStyle = '#fde047'; hud2d.font = 'bold 14px monospace'; hud2d.textAlign = 'center';
  hud2d.fillText('HDG ' + String(headingDeg).padStart(3, '0') + '°  //  WAVE ' + game.wave + '/3', cx, 38);
  hud2d.textAlign = 'right';
  hud2d.fillStyle = '#ffffff'; hud2d.font = 'bold 24px monospace';
  hud2d.fillText(game.score.toLocaleString(), w - 28, 42);
  hud2d.fillStyle = amber; hud2d.font = 'bold 13px monospace';
  hud2d.fillText('COMBO x' + game.combo + '  |  HOSTILES: ' + foes.length, w - 28, 62);
  hud2d.textAlign = 'left';

  // projected markers: gate diamonds for rings, brackets for foes, and the
  // rotating lock diamond on the tracked target
  for (const r of rings) {
    if (r.passed) continue;
    const sc = toScreen(r.pos);
    if (sc.behind) continue;
    hud2d.strokeStyle = '#38bdf8'; hud2d.lineWidth = 2;
    hud2d.beginPath();
    hud2d.moveTo(sc.x, sc.y - 16); hud2d.lineTo(sc.x + 16, sc.y);
    hud2d.lineTo(sc.x, sc.y + 16); hud2d.lineTo(sc.x - 16, sc.y);
    hud2d.closePath(); hud2d.stroke();
    hud2d.fillStyle = '#38bdf8'; hud2d.font = '11px monospace';
    hud2d.fillText('GATE ' + Math.round(jet.pos.distanceTo(r.pos)) + 'M', sc.x + 20, sc.y + 4);
  }
  for (const e of foes) {
    const sc = toScreen(e.pos);
    if (sc.behind) continue;
    const tracked = e === jet.lockTarget;
    const locked = tracked && jet.lockProgress >= 0.95;
    hud2d.strokeStyle = locked ? red : (tracked ? '#fde047' : green);
    hud2d.lineWidth = locked ? 2.5 : 1.7;
    const sz = locked ? 22 : 16;
    hud2d.strokeRect(sc.x - sz, sc.y - sz, sz * 2, sz * 2);
    if (tracked) {
      hud2d.save();
      hud2d.translate(sc.x, sc.y);
      hud2d.rotate(Math.PI / 4 + game.time * (locked ? 3 : 1));
      hud2d.strokeRect(-sz * 0.85, -sz * 0.85, sz * 1.7, sz * 1.7);
      hud2d.restore();
    }
    hud2d.fillStyle = hud2d.strokeStyle; hud2d.font = 'bold 11px monospace';
    const dist = Math.round(jet.pos.distanceTo(e.pos));
    hud2d.fillText((locked ? 'LOCKED [F] ' : e.kind.toUpperCase() + ' ') + dist + 'M', sc.x + sz + 6, sc.y - 2);
  }

  // mini-radar, bottom-left: relative blips in the jet's own frame
  const rX = 88, rY = h - 88, rRad = 62;
  hud2d.fillStyle = 'rgba(15,23,42,.72)'; hud2d.strokeStyle = 'rgba(74,222,128,.65)'; hud2d.lineWidth = 2;
  hud2d.beginPath(); hud2d.arc(rX, rY, rRad, 0, Math.PI * 2); hud2d.fill(); hud2d.stroke();
  hud2d.strokeStyle = 'rgba(74,222,128,.25)'; hud2d.lineWidth = 1.5;
  hud2d.beginPath();
  hud2d.moveTo(rX - rRad, rY); hud2d.lineTo(rX + rRad, rY);
  hud2d.moveTo(rX, rY - rRad); hud2d.lineTo(rX, rY + rRad);
  hud2d.stroke();
  const inv = jet.quat.clone().invert();
  for (const e of foes) {
    const rel = e.pos.clone().sub(jet.pos).applyQuaternion(inv);
    const bx = THREE.MathUtils.clamp((rel.x / 3500) * rRad, -rRad + 6, rRad - 6);
    const bz = THREE.MathUtils.clamp((rel.z / 3500) * rRad, -rRad + 6, rRad - 6);
    hud2d.fillStyle = e.kind === 'fighter' ? red : amber;
    hud2d.beginPath(); hud2d.arc(rX + bx, rY + bz, 3.5, 0, Math.PI * 2); hud2d.fill();
  }

  // hull + boost/missile bars, bottom-right
  const barX = w - 230;
  hud2d.fillStyle = 'rgba(15,23,42,.72)';
  hud2d.fillRect(barX, h - 68, 200, 14);
  hud2d.fillStyle = jet.hull > 35 ? green : red;
  hud2d.fillRect(barX, h - 68, 200 * Math.max(0, jet.hull) / jet.hullMax, 14);
  hud2d.strokeStyle = 'rgba(74,222,128,.65)'; hud2d.lineWidth = 1.5;
  hud2d.strokeRect(barX, h - 68, 200, 14);
  hud2d.fillStyle = '#ffffff'; hud2d.font = 'bold 11px monospace';
  hud2d.fillText('HULL ' + Math.max(0, Math.round(jet.hull)) + '%', barX, h - 73);
  hud2d.fillStyle = 'rgba(15,23,42,.72)';
  hud2d.fillRect(barX, h - 34, 200, 12);
  hud2d.fillStyle = '#38bdf8';
  hud2d.fillRect(barX, h - 34, 200 * jet.boost / 100, 12);
  hud2d.strokeRect(barX, h - 34, 200, 12);
  hud2d.fillStyle = '#bae6fd';
  hud2d.fillText(jet.missileCd > 0 ? 'MSL RELOAD ' + jet.missileCd.toFixed(1) + 'S' : 'MSL READY [F / RMB]', barX, h - 39);
}

/* ================= boot & loop ================= */
if (stateParam && stateParam !== 'title') startGame(stateParam);

// A held frame still needs ONE simulation step: it syncs the jet mesh and lets
// the camera take its composed place (snapped, not lerped) on the exact preset
// moment — explosion debris, lock state and all — before the freeze.
let holdComposed = false;
function composeHeldFrame() {
  update(1 / 30);
  if (game.cockpit) {
    camera.position.copy(new THREE.Vector3(0, 1.35, -3.2).applyQuaternion(jet.quat).add(jet.pos));
    camera.quaternion.copy(jet.quat);
  } else {
    camera.position.copy(new THREE.Vector3(0, 5.6, 23).applyQuaternion(jet.quat).add(jet.pos));
    camera.up.set(0, 1, 0).applyQuaternion(jet.quat);
    camera.lookAt(new THREE.Vector3(0, 1.5, -45).applyQuaternion(jet.quat).add(jet.pos));
  }
  holdComposed = true;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  if (holdFrame) {
    if (!holdComposed) composeHeldFrame();
  } else {
    update(dt);
  }
  renderer.render(scene, camera);
  drawHud();
}
requestAnimationFrame(frame);
})();
