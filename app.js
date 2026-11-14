/* ══════════════════════════════════════════════════════════════════════
   POWER//FLOW — interactive power-delivery cutaway
   Three.js r128 · no build step · single-page experience
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const DATA = window.POWER_DATA;
  const COMPONENTS = DATA.components;
  const CATEGORIES = DATA.categories;
  const STAGES = DATA.stages;
  const COMP_MAP = new Map(COMPONENTS.map(c => [c.id, c]));
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const now = () => performance.now() / 1000;
  const rr = (a, b) => a + Math.random() * (b - a);
  const fmt = (n, d) => Number(n).toFixed(d);

  const state = {
    stage: 0,
    running: false,
    online: false,
    totalTime: 0,
    stageTime: 0,
    selected: null,
    hovered: null,
    exploded: false,
    autoCam: true,
    autoCamPaused: false,
    sound: false,
    labels: true,
    bootStart: 0,
    lastUiUpdate: 0,
    skip: false,
    activePhases: 0,
    rails: { ac: 230, hv: 0, vsb: 5.02, v12: 0, v5: 0, v33: 0, vcore: 0, vsoc: 0, vddr: 0 },
    targets: { v12: 0, v5: 0, v33: 0, vcore: 0, vsoc: 0, vddr: 0 },
    display: { power: 1.8, temp: 27, fan: 0 },
    targetDisplay: { power: 1.8, temp: 27, fan: 0 },
    lastInteraction: now(),
    pointerDown: false,
    dragged: false,
    activePointers: new Map(),
    pinchDist: 0
  };

  const el = id => document.getElementById(id);
  const ui = {
    canvas: el('scene'), labels: el('labels-layer'), hoverTip: el('hover-tip'),
    statusChip: el('status-chip'), statusText: el('status-text'), clock: el('sim-clock'),
    railList: el('rail-list'), powerValue: el('power-value'), miniVcore: el('mini-vcore'),
    miniTemp: el('mini-temp'), miniFan: el('mini-fan'), postCode: el('post-code'),
    phaseCount: el('phase-count'), phaseDots: el('phase-dots'), logLines: el('log-lines'),
    logCount: el('log-count'), scope: el('scope'), scopeMode: el('scope-mode'),
    telemetry: el('telemetry'), detail: el('detail-panel'), detailClose: el('detail-close'),
    detailCode: el('detail-code'), detailCat: el('detail-cat'), detailName: el('detail-name'),
    detailEn: el('detail-en'), detailRail: el('detail-rail'), detailRole: el('detail-role'),
    detailDesc: el('detail-desc'), detailSpecs: el('detail-specs'), detailZone: el('detail-zone'),
    detailStage: el('detail-stage'), detailFocus: el('detail-focus'), detailRel: el('detail-rel'),
    related: el('related-list'), timeline: el('timeline'), capCode: el('cap-code'),
    capText: el('cap-text'), powerBtn: el('power-btn'), powerAction: el('power-action'),
    powerSub: el('power-sub'), powerLabel: el('power-label'), btnSkip: el('btn-skip'),
    btnReset: el('btn-reset'), powerSpark: el('power-spark'),
    timelineTime: el('timeline-time'),
    drawer: el('drawer'), drawerScrim: el('drawer-scrim'), drawerList: el('drawer-list'),
    search: el('search-input'), searchCount: el('search-count'), catFilters: el('cat-filters'),
    detailBadge: el('detail-cat'), helpScrim: el('help-scrim'), toast: el('toast'),
    loader: el('loader'), loaderStatus: el('loader-status'), phaseDotsWrap: el('phase-dots')
  };

  /* ── Renderer / scene ────────────────────────────────────────────── */
  let renderer, scene, camera, clock;
  let psuRoot, boardRoot, worldRoot;
  const pickables = [];
  const compObjects = new Map();
  const animatables = { fans: [], rgb: [], leds: [], charges: [], pulses: [] };
  const flowSystems = [];
  const macroLabels = [];
  let selectionHelper, selectionRing, selectionGlow, hoverGlow, labelSelected;
  let debugLeds = [];
  let psuChassisMats = [];
  let updater;

  function initRenderer() {
    renderer = new THREE.WebGLRenderer({
      canvas: ui.canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x05080d, 1);
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.86;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080d);
    scene.fog = new THREE.FogExp2(0x05080d, 0.0085);
    buildEnvironment();

    camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 220);
    camera.position.set(21, 19, 27);

    clock = new THREE.Clock();
    worldRoot = new THREE.Group();
    scene.add(worldRoot);
    buildLights();
    buildFloor();
    buildAtmosphere();
  }

  function buildEnvironment() {
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#02050a');
    sky.addColorStop(0.38, '#07131b');
    sky.addColorStop(0.52, '#081922');
    sky.addColorStop(0.7, '#03090d');
    sky.addColorStop(1, '#010304');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);

    const band = g.createLinearGradient(0, h * 0.42, 0, h * 0.62);
    band.addColorStop(0, 'rgba(52,180,210,0)');
    band.addColorStop(0.42, 'rgba(72,194,218,.24)');
    band.addColorStop(0.58, 'rgba(28,96,114,.16)');
    band.addColorStop(1, 'rgba(5,15,20,0)');
    g.fillStyle = band; g.fillRect(0, h * 0.38, w, h * 0.3);

    function light(x, y, rx, ry, color) {
      const gr = g.createRadialGradient(x, y, 0, x, y, rx);
      gr.addColorStop(0, color);
      gr.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.28)'));
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      g.translate(-x, -y);
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, rx, 0, TAU); g.fill();
      g.restore();
    }
    light(170, 210, 130, 72, 'rgba(255,162,92,.9)');
    light(615, 164, 170, 60, 'rgba(142,230,255,.8)');
    light(850, 236, 120, 46, 'rgba(182,138,255,.55)');
    light(430, 90, 210, 55, 'rgba(255,255,255,.32)');

    // vertical soft strips for specular interest
    for (let i = 0; i < 9; i++) {
      const x = 70 + i * 118;
      const grd = g.createLinearGradient(x, 0, x + 16, 0);
      grd.addColorStop(0, 'rgba(120,210,230,0)');
      grd.addColorStop(0.5, 'rgba(120,210,230,.05)');
      grd.addColorStop(1, 'rgba(120,210,230,0)');
      g.fillStyle = grd; g.fillRect(x, 0, 18, h);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.encoding = THREE.sRGBEncoding;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const rt = pmrem.fromEquirectangular(tex);
    scene.environment = rt.texture;
    tex.dispose();
    pmrem.dispose();
  }

  function buildLights() {
    const hemi = new THREE.HemisphereLight(0x88c5d8, 0x05090c, 0.4);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xd8efff, 1.12);
    key.position.set(15, 25, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 5;
    key.shadow.camera.far = 70;
    key.shadow.camera.left = -28;
    key.shadow.camera.right = 28;
    key.shadow.camera.top = 26;
    key.shadow.camera.bottom = -20;
    key.shadow.bias = -0.0006;
    key.shadow.radius = 3;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x3f9ec4, 0.38);
    fill.position.set(-18, 11, -12);
    scene.add(fill);

    const warm = new THREE.PointLight(0xff9952, 0.8, 30, 2);
    warm.position.set(-11.5, 6.4, 3.5);
    scene.add(warm);

    const cool = new THREE.PointLight(0x55dfff, 0.62, 30, 2);
    cool.position.set(5.5, 7.2, -2.5);
    scene.add(cool);

    const rim = new THREE.PointLight(0x9c7bff, 0.42, 25, 2);
    rim.position.set(-4, 4.5, 9);
    scene.add(rim);
  }

  function buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(44, 96),
      new THREE.MeshStandardMaterial({ color: 0x04090d, roughness: 0.72, metalness: 0.36 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.72;
    floor.receiveShadow = true;
    worldRoot.add(floor);

    const grid = new THREE.GridHelper(76, 76, 0x16333d, 0x0a1b22);
    grid.position.y = -0.705;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    worldRoot.add(grid);

    const grid2 = new THREE.GridHelper(38, 76, 0x15303a, 0x08151b);
    grid2.position.y = -0.7;
    grid2.material.transparent = true;
    grid2.material.opacity = 0.28;
    worldRoot.add(grid2);

    // illuminated technical rings
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x3cb6cf, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    const ring1 = new THREE.Mesh(new THREE.RingGeometry(22.7, 22.74, 160), ringMat);
    ring1.rotation.x = -Math.PI / 2;
    ring1.position.y = -0.69;
    worldRoot.add(ring1);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(27.5, 27.53, 160), ringMat.clone());
    ring2.material.opacity = 0.08;
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = -0.69;
    worldRoot.add(ring2);

    const arcMat = new THREE.MeshBasicMaterial({ color: 0x5ef2d6, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const arc = new THREE.Mesh(new THREE.RingGeometry(29 + i * 0.9, 29.04 + i * 0.9, 128, 1, i * 1.4, 0.55), arcMat.clone());
      arc.material.opacity = 0.08 + i * 0.025;
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = -0.685;
      worldRoot.add(arc);
    }

    // a subtle stage disc beneath the bench
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(18.2, 80),
      new THREE.MeshBasicMaterial({ color: 0x0b2229, transparent: true, opacity: 0.25, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(-1.2, -0.695, 0.3);
    worldRoot.add(disc);
  }

  function buildAtmosphere() {
    const count = 320;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rr(-28, 28);
      pos[i * 3 + 1] = rr(0.3, 13);
      pos[i * 3 + 2] = rr(-21, 23);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x8ac4d4, size: 0.045, transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true });
    const points = new THREE.Points(geo, mat);
    points.name = 'ambient-particles';
    scene.add(points);
    animatables.atmosphere = points;

    // faint radial halo sprites behind the set
    const tex = makeGlowTexture(128, 0.0, 0.55);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x1b6b7e, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(-2, 3.5, -11);
    halo.scale.set(30, 18, 1);
    scene.add(halo);
  }

  /* ── textures ────────────────────────────────────────────────────── */
  function makeGlowTexture(size = 64, inner = 0.05, mid = 0.32) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(mid, 'rgba(255,255,255,.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function makeBoardTexture() {
    const w = 2048, h = 1348;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const rand = seeded(1977);
    const base = g.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#06130e');
    base.addColorStop(0.45, '#081a13');
    base.addColorStop(1, '#05100d');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);

    // broad copper pours / power planes
    g.fillStyle = 'rgba(28, 94, 67, .18)';
    g.beginPath(); g.moveTo(60, 80); g.lineTo(930, 80); g.lineTo(1080, 240); g.lineTo(1050, 560); g.lineTo(120, 640); g.closePath(); g.fill();
    g.fillStyle = 'rgba(23, 79, 81, .13)';
    g.beginPath(); g.moveTo(1170, 100); g.lineTo(1910, 80); g.lineTo(1940, 1000); g.lineTo(1290, 1120); g.lineTo(1170, 790); g.closePath(); g.fill();
    g.fillStyle = 'rgba(58, 107, 74, .1)';
    g.beginPath(); g.moveTo(240, 800); g.lineTo(1050, 720); g.lineTo(1250, 1200); g.lineTo(180, 1260); g.closePath(); g.fill();

    // fine traces
    const traceColors = ['rgba(43, 116, 84, .32)', 'rgba(52, 128, 91, .22)', 'rgba(88, 138, 78, .19)', 'rgba(103, 126, 63, .16)'];
    for (let i = 0; i < 330; i++) {
      let x = rand() * w, y = rand() * h;
      g.beginPath(); g.moveTo(x, y);
      const segs = 3 + Math.floor(rand() * 6);
      for (let s = 0; s < segs; s++) {
        const horiz = rand() > 0.45;
        const len = (20 + rand() * 150) * (rand() > 0.5 ? 1 : -1);
        if (horiz) x += len; else y += len;
        g.lineTo(x, y);
      }
      g.strokeStyle = traceColors[Math.floor(rand() * traceColors.length)];
      g.lineWidth = 1 + rand() * 2.1;
      g.stroke();
    }

    // differential pairs around CPU / PCIe
    for (let i = 0; i < 56; i++) {
      const startX = 1140 + rand() * 300;
      const startY = 260 + rand() * 420;
      g.beginPath(); g.moveTo(startX, startY);
      let x = startX, y = startY;
      for (let s = 0; s < 5; s++) {
        x += 25 + rand() * 55; y += (rand() > 0.5 ? 1 : -1) * (8 + rand() * 22);
        g.lineTo(x, y);
      }
      g.strokeStyle = 'rgba(63, 143, 108, .25)';
      g.lineWidth = 1.2;
      g.stroke();
    }

    // vias and pads
    for (let i = 0; i < 820; i++) {
      const x = rand() * w, y = rand() * h;
      const r = rand() > 0.92 ? 4 : 1.2 + rand() * 1.5;
      g.beginPath(); g.arc(x, y, r, 0, TAU);
      g.fillStyle = rand() > 0.76 ? 'rgba(190, 155, 86, .34)' : 'rgba(91, 137, 97, .22)';
      g.fill();
    }

    // footprints for major blocks
    function footprint(x, y, fw, fh, label, sub) {
      g.strokeStyle = 'rgba(142, 192, 158, .26)';
      g.lineWidth = 2;
      g.strokeRect(x, y, fw, fh);
      g.fillStyle = 'rgba(12, 35, 25, .35)';
      g.fillRect(x, y, fw, fh);
      g.fillStyle = 'rgba(166, 207, 178, .44)';
      g.font = '600 22px "Segoe UI", sans-serif';
      g.fillText(label, x + 18, y + 34);
      if (sub) {
        g.fillStyle = 'rgba(126, 172, 151, .3)';
        g.font = '15px Consolas, monospace';
        g.fillText(sub, x + 18, y + 58);
      }
    }
    footprint(430, 500, 360, 340, 'VRM 8+2 PHASE', '12V → VCORE');
    footprint(930, 360, 430, 420, 'CPU SOCKET', 'LGA / VCORE');
    footprint(1430, 290, 330, 470, 'DDR5', 'VDD 1.1V');
    footprint(760, 840, 830, 270, 'PCIe 5.0 x16', '12V-2x6');
    footprint(1590, 830, 260, 220, 'PCH', '1.05V');
    footprint(150, 900, 320, 160, 'M.2 / NVMe', '3.3V');
    footprint(80, 1030, 260, 150, 'ATX 24-PIN', 'PG / PS_ON');
    footprint(490, 1010, 190, 120, 'EPS 8-PIN', 'CPU 12V');

    // silkscreen labels
    g.fillStyle = 'rgba(205, 235, 211, .48)';
    g.font = '600 18px "Segoe UI", sans-serif';
    const marks = [
      ['POWER//FLOW  X-48', 70, 74],
      ['REV 3.1', 1780, 74],
      ['VRM POWER', 430, 878],
      ['DDR5 CHANNEL A / B', 1450, 800],
      ['CPU FAN', 1510, 1060],
      ['PCH', 1800, 1000],
      ['CLR CMOS', 350, 1190],
      ['DEBUG', 70, 1190],
      ['12V-2x6', 1390, 1140],
      ['ATX 3.1 READY', 1760, 1200]
    ];
    for (const [text, x, y] of marks) g.fillText(text, x, y);

    // board edge dimension marks
    g.strokeStyle = 'rgba(91, 157, 125, .3)';
    for (let i = 0; i < 44; i++) {
      g.beginPath(); g.moveTo(35 + i * 45, 8); g.lineTo(35 + i * 45, 18); g.stroke();
      g.beginPath(); g.moveTo(2030, 40 + i * 29); g.lineTo(2040, 40 + i * 29); g.stroke();
    }

    // noise
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rand() - 0.5) * 11;
      d[i] = clamp(d[i] + n, 0, 255);
      d[i + 1] = clamp(d[i + 1] + n, 0, 255);
      d[i + 2] = clamp(d[i + 2] + n, 0, 255);
    }
    g.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  function makePsuBoardTexture() {
    const w = 1024, h = 1024;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const rand = seeded(8086);
    g.fillStyle = '#07150f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(25, 73, 52, .26)';
    g.fillRect(15, 15, w - 30, h - 30);
    g.strokeStyle = 'rgba(156, 178, 82, .34)';
    g.lineWidth = 2;
    for (let i = 0; i < 45; i++) {
      g.beginPath();
      let x = rand() * w, y = rand() * h;
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += (rand() - 0.5) * 120; y += (rand() - 0.5) * 120;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(202, 221, 179, .5)';
    g.font = '600 16px Consolas, monospace';
    g.fillText('PRIMARY / HV', 40, 56);
    g.fillText('ISOLATION ZONE', 690, 56);
    g.fillText('SECONDARY / SELV', 650, 960);
    g.fillStyle = 'rgba(214, 168, 59, .6)';
    g.font = '600 22px Consolas, monospace';
    g.fillText('⚠ HIGH VOLTAGE', 44, 960);
    g.strokeStyle = 'rgba(197, 221, 181, .3)';
    g.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      g.beginPath(); g.moveTo(30, 90 + i * 47); g.lineTo(55, 90 + i * 47); g.stroke();
    }
    for (let i = 0; i < 60; i++) {
      g.beginPath(); g.arc(rand() * w, rand() * h, 1 + rand() * 2, 0, TAU);
      g.fillStyle = 'rgba(177, 157, 86, .32)'; g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  function makeDecalTexture(text, sub = '', color = '#dcecee') {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.textAlign = 'center';
    g.fillStyle = color;
    g.font = '600 36px Bahnschrift, Segoe UI, sans-serif';
    g.fillText(text, 256, 58);
    if (sub) {
      g.fillStyle = 'rgba(170,215,220,.66)';
      g.font = '22px Consolas, monospace';
      g.fillText(sub, 256, 94);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function makeLabelTexture(lines, color = '#dff8f2') {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 160);
    g.fillStyle = 'rgba(5,11,13,.9)';
    g.fillRect(0, 0, 512, 160);
    g.strokeStyle = 'rgba(94,242,214,.32)';
    g.lineWidth = 3;
    g.strokeRect(2, 2, 508, 156);
    g.fillStyle = color;
    lines.forEach((line, i) => {
      g.font = i === 0 ? '600 40px Bahnschrift, Segoe UI, sans-serif' : '24px Consolas, monospace';
      g.fillStyle = i === 0 ? color : 'rgba(175,210,212,.7)';
      g.fillText(line, 26, 62 + i * 43);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ── material / mesh helpers ─────────────────────────────────────── */
  function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness === undefined ? 0.5 : opts.roughness,
      metalness: opts.metalness === undefined ? 0.25 : opts.metalness,
      emissive: opts.emissive === undefined ? 0x000000 : opts.emissive,
      emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity,
      transparent: !!opts.transparent,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      side: opts.side || THREE.FrontSide,
      depthWrite: opts.depthWrite === undefined ? true : opts.depthWrite,
      flatShading: false
    });
  }

  function basicMat(color, opts = {}) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: opts.transparent !== false,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      blending: opts.blending || THREE.NormalBlending,
      depthWrite: opts.depthWrite === undefined ? false : opts.depthWrite,
      side: opts.side || THREE.FrontSide,
      map: opts.map || null
    });
  }

  function addBox(parent, w, h, d, material, x, y, z, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = opts.castShadow !== false;
    m.receiveShadow = !!opts.receiveShadow;
    parent.add(m);
    return m;
  }

  function addCyl(parent, rTop, rBottom, h, seg, material, x, y, z, opts = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material);
    m.position.set(x, y, z);
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = opts.castShadow !== false;
    m.receiveShadow = !!opts.receiveShadow;
    parent.add(m);
    return m;
  }

  function addTorus(parent, radius, tube, material, x, y, z, opts = {}) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, opts.seg || 10, opts.radial || 36, opts.arc || TAU), material);
    m.position.set(x, y, z);
    m.rotation.x = opts.rx === undefined ? Math.PI / 2 : opts.rx;
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = opts.castShadow !== false;
    parent.add(m);
    return m;
  }

  function addLineBox(parent, w, h, d, color, x, y, z, opacity = 0.45) {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    line.position.set(x, y, z);
    parent.add(line);
    return line;
  }

  function addGlowSprite(parent, x, y, z, color, scale = 1, opacity = 0.8, tex) {
    const sm = new THREE.SpriteMaterial({
      map: tex || GLOW_TEX,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const s = new THREE.Sprite(sm);
    s.position.set(x, y, z);
    s.scale.set(scale, scale, 1);
    parent.add(s);
    return s;
  }

  let GLOW_TEX = null;

  function registerComponent(id, group, anchor, parent, opts = {}) {
    const data = COMP_MAP.get(id);
    if (!data) return;
    parent.add(group);
    const a = new THREE.Object3D();
    a.position.set(anchor[0], anchor[1], anchor[2]);
    group.add(a);
    const comp = {
      id, data, group, anchor: a,
      basePos: group.position.clone(),
      explode: new THREE.Vector3(),
      baseMaterials: [],
      focusRadius: opts.focusRadius || (['primary', 'secondary', 'grid'].includes(data.cat) ? 15 : 19)
    };
    group.traverse(o => {
      if (!o.isMesh) return;
      o.userData.componentId = id;
      pickables.push(o);
      if (o.material && o.material.emissive && o.material.isMeshStandardMaterial) {
        comp.baseMaterials.push({
          mat: o.material,
          emissive: o.material.emissive.getHex(),
          intensity: o.material.emissiveIntensity
        });
      }
    });
    compObjects.set(id, comp);
    return comp;
  }

  function makeFan(radius, accent, count = 7) {
    const g = new THREE.Group();
    const frameMat = mat(0x0d171c, { roughness: 0.55, metalness: 0.38 });
    addTorus(g, radius, 0.035, frameMat, 0, 0, 0, { rx: Math.PI / 2, radial: 48, castShadow: false });
    addTorus(g, radius * 0.94, 0.014, basicMat(accent, { opacity: 0.52, blending: THREE.AdditiveBlending }), 0, 0, 0, { rx: Math.PI / 2, radial: 48, castShadow: false });
    addTorus(g, radius * 0.78, 0.008, basicMat(accent, { opacity: 0.2, blending: THREE.AdditiveBlending }), 0, 0, 0, { rx: Math.PI / 2, radial: 48, castShadow: false });
    const hub = addCyl(g, radius * 0.17, radius * 0.19, 0.1, 20, mat(0x1c2b32, { roughness: 0.4, metalness: 0.6 }), 0, 0.02, 0);
    addGlowSprite(g, 0, 0.08, 0, accent, radius * 0.55, 0.22);
    addCyl(g, radius * 0.09, radius * 0.09, 0.11, 20, mat(0x2c3e46, { roughness: 0.3, metalness: 0.8 }), 0, 0.03, 0);
    const rotor = new THREE.Group();
    rotor.position.y = 0.045;
    const bladeMat = mat(0x080d10, { roughness: 0.8, metalness: 0.05 });
    for (let i = 0; i < count; i++) {
      const b = new THREE.Group();
      b.rotation.y = (i / count) * TAU;
      const blade = addBox(b, radius * 0.65, 0.018, radius * 0.24, bladeMat, radius * 0.48, 0, 0, { castShadow: false });
      blade.rotation.x = 0.32;
      blade.rotation.z = 0.08;
      rotor.add(b);
    }
    g.add(rotor);
    animatables.fans.push({ rotor, target: 0, speed: 0, id: g.uuid });
    return { group: g, rotor };
  }

  function makeCapacitor(radius, height, color = 0x1a2732, accent = 0xa9bfc7) {
    const g = new THREE.Group();
    addCyl(g, radius, radius, height, 20, mat(color, { roughness: 0.38, metalness: 0.48 }), 0, height / 2, 0);
    addCyl(g, radius * 0.96, radius * 0.96, 0.025, 20, mat(accent, { roughness: 0.25, metalness: 0.9 }), 0, height + 0.012, 0, { castShadow: false });
    addTorus(g, radius * 0.68, 0.015, mat(0x343f43, { roughness: 0.3, metalness: 0.7 }), 0, height + 0.03, 0, { rx: Math.PI / 2, radial: 24, castShadow: false });
    return g;
  }

  function makeToroid(radius, tube, color = 0xb96532) {
    const g = new THREE.Group();
    const coreMat = mat(0x1d2427, { roughness: 0.7, metalness: 0.2 });
    const copperMat = mat(color, { roughness: 0.34, metalness: 0.8 });
    addTorus(g, radius, tube, coreMat, 0, 0, 0, { rx: Math.PI / 2, radial: 32, castShadow: false });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const coil = addCyl(g, tube * 0.62, tube * 0.62, tube * 2.2, 6, copperMat, Math.cos(a) * radius, 0, Math.sin(a) * radius, { castShadow: false });
      coil.rotation.z = Math.PI / 2;
      coil.rotation.y = -a;
    }
    return g;
  }

  function makeHeatsink(w, h, d, fins = 8, color = 0x27363d) {
    const g = new THREE.Group();
    addBox(g, w, 0.1, d, mat(color, { roughness: 0.4, metalness: 0.7 }), 0, 0, 0);
    const fm = mat(color, { roughness: 0.42, metalness: 0.68 });
    const step = w / fins;
    for (let i = 0; i < fins; i++) {
      addBox(g, Math.max(0.025, step * 0.28), h, d, fm, -w / 2 + step * (i + 0.5), h / 2, 0, { castShadow: false });
    }
    return g;
  }

  function makeMosfet(color = 0x10161a) {
    const g = new THREE.Group();
    addBox(g, 0.34, 0.52, 0.1, mat(color, { roughness: 0.38, metalness: 0.45 }), 0, 0.28, 0);
    addBox(g, 0.26, 0.16, 0.02, mat(0x3c4b52, { roughness: 0.25, metalness: 0.8 }), 0, 0.31, 0.06, { castShadow: false });
    addBox(g, 0.19, 0.035, 0.06, mat(0xb8c3bd, { roughness: 0.2, metalness: 0.9 }), 0, 0.55, 0, { castShadow: false });
    return g;
  }

  function makeScrew(x, z, parent, y = 0.2, color = 0x7d8a8f) {
    addCyl(parent, 0.1, 0.1, 0.035, 12, mat(color, { roughness: 0.3, metalness: 0.85 }), x, y, z, { castShadow: false });
    addBox(parent, 0.09, 0.024, 0.018, mat(0x1b2225, { roughness: 0.3, metalness: 0.6 }), x, y + 0.02, z, { castShadow: false, ry: Math.PI / 4 });
  }

  /* ── bench + PSU ─────────────────────────────────────────────────── */
  function buildBench() {
    const bench = new THREE.Group();
    const top = addBox(bench, 34.5, 0.16, 17.5, mat(0x061016, { roughness: 0.48, metalness: 0.55 }), -1.5, -0.62, 0.2, { receiveShadow: true, castShadow: false });
    top.receiveShadow = true;
    addBox(bench, 34.6, 0.04, 17.6, mat(0x10262d, { roughness: 0.4, metalness: 0.7, emissive: 0x0c2931, emissiveIntensity: 0.35 }), -1.5, -0.715, 0.2, { castShadow: false });
    addLineBox(bench, 34.5, 0.16, 17.5, 0x2b5964, -1.5, -0.62, 0.2, 0.3);
    // feet
    for (const x of [-17, 14]) for (const z of [-7.6, 8.0]) {
      addBox(bench, 0.6, 0.3, 0.6, mat(0x091117, { roughness: 0.55, metalness: 0.3 }), x, -0.84, z, { castShadow: false });
    }
    // small dimensional markings
    const tickMat = basicMat(0x4e7d8a, { opacity: 0.35 });
    for (let i = 0; i < 28; i++) {
      addBox(bench, 0.02, 0.005, i % 5 === 0 ? 0.24 : 0.1, tickMat, -17.9 + i * 1.15, -0.535, 8.72, { castShadow: false });
    }
    worldRoot.add(bench);
  }

  function buildPSU() {
    psuRoot = new THREE.Group();
    psuRoot.position.set(-12.0, 0, 0.2);
    psuRoot.name = 'PSU';
    worldRoot.add(psuRoot);

    const chassis = new THREE.Group();
    psuRoot.add(chassis);
    const darkMetal = mat(0x151f25, { roughness: 0.42, metalness: 0.74 });
    const edgeMetal = mat(0x2b3b42, { roughness: 0.34, metalness: 0.82 });

    addBox(chassis, 7.0, 0.12, 9.0, darkMetal, 0, 0.08, 0, { receiveShadow: true });
    addBox(chassis, 6.8, 0.035, 8.8, mat(0x07130f, { roughness: 0.65, metalness: 0.3 }), 0, 0.16, 0, { receiveShadow: true, castShadow: false });
    // feet
    for (const x of [-2.9, 2.9]) for (const z of [-4.1, 4.1]) addCyl(chassis, 0.22, 0.24, 0.16, 12, mat(0x080d11, { roughness: 0.7 }), x, -0.02, z, { castShadow: false });
    // rear panel / walls (semi-transparent cutaway)
    addBox(chassis, 7.0, 3.2, 0.055, mat(0x111b20, { roughness: 0.5, metalness: 0.65, transparent: true, opacity: 0.48, depthWrite: false }), 0, 1.72, -4.52, { castShadow: false });
    const sideMatL = mat(0x28434b, { roughness: 0.28, metalness: 0.5, transparent: true, opacity: 0.055, depthWrite: false });
    const sideMatR = sideMatL.clone();
    psuChassisMats.push(sideMatL, sideMatR);
    addBox(chassis, 0.035, 3.1, 9.0, sideMatL, -3.5, 1.72, 0, { castShadow: false });
    addBox(chassis, 0.035, 3.1, 9.0, sideMatR, 3.5, 1.72, 0, { castShadow: false });
    addBox(chassis, 7.0, 3.1, 0.035, sideMatL.clone(), 0, 1.72, 4.48, { castShadow: false });
    // vertical corner posts
    for (const x of [-3.46, 3.46]) for (const z of [-4.46, 4.46]) addBox(chassis, 0.075, 3.18, 0.075, edgeMetal, x, 1.72, z, { castShadow: false });
    // top rails
    for (const x of [-3.46, 3.46]) addBox(chassis, 0.075, 0.06, 8.9, edgeMetal, x, 3.31, 0, { castShadow: false });
    for (const z of [-4.46, 4.46]) addBox(chassis, 6.95, 0.06, 0.075, edgeMetal, 0, 3.31, z, { castShadow: false });
    addLineBox(chassis, 7.0, 3.2, 9.0, 0x35616b, 0, 1.72, 0, 0.42);

    // side label plate
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 0.84),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture(['POWER//FLOW', 'ATX 3.1 · 1000W · 80+'], '#baf9ec'), transparent: true, opacity: 0.9 })
    );
    plate.position.set(3.48, 2.5, 2.15);
    plate.rotation.y = Math.PI / 2;
    chassis.add(plate);

    // a tiny warning strip
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffb45e, transparent: true, opacity: 0.46 });
    for (let i = 0; i < 8; i++) addBox(chassis, 0.22, 0.028, 0.025, stripMat, 3.48, 0.32, -3.7 + i * 0.32, { castShadow: false });

    // inner PCB
    addBox(chassis, 6.55, 0.07, 8.35, mat(0x081710, { roughness: 0.64, metalness: 0.28 }), 0, 0.22, 0, { receiveShadow: true, castShadow: false });
    const psuPcb = new THREE.Mesh(
      new THREE.PlaneGeometry(6.5, 8.3),
      new THREE.MeshStandardMaterial({ map: makePsuBoardTexture(), color: 0xa8b7b2, roughness: 0.8, metalness: 0.18 })
    );
    psuPcb.rotation.x = -Math.PI / 2;
    psuPcb.position.y = 0.262;
    psuPcb.receiveShadow = true;
    chassis.add(psuPcb);

    // cable output grommet
    addCyl(chassis, 0.33, 0.33, 0.34, 18, mat(0x05090b, { roughness: 0.75 }), 1.7, 1.05, 4.48, { rx: Math.PI / 2, castShadow: false });
    addTorus(chassis, 0.33, 0.035, edgeMetal, 1.7, 1.05, 4.66, { rx: 0, radial: 24, castShadow: false });

    /* AC terminal + inlet */
    const acGroup = new THREE.Group();
    const terminal = new THREE.Group();
    addBox(terminal, 1.2, 1.65, 0.36, darkMetal, 0, 0.9, 0, { castShadow: true });
    addBox(terminal, 0.8, 0.62, 0.05, mat(0x0b0e10, { roughness: 0.5 }), 0, 1.02, 0.2, { castShadow: false });
    for (const xx of [-0.2, 0, 0.2]) addBox(terminal, 0.07, 0.25, 0.03, mat(0x9b7a45, { roughness: 0.28, metalness: 0.9 }), xx, 1.02, 0.23, { castShadow: false });
    terminal.position.set(-4.45, 0, -6.0);
    acGroup.add(terminal);
    // bright terminal halo
    const acHalo = addGlowSprite(acGroup, -4.45, 1.02, -5.75, 0xff8a4c, 1.6, 0.38);
    acHalo.userData.pulse = true;
    registerComponent('ac-mains', acGroup, [-4.45, 1.1, -5.95], psuRoot, { focusRadius: 17 });

    const inlet = new THREE.Group();
    addBox(inlet, 1.25, 1.02, 0.48, mat(0x1a242a, { roughness: 0.38, metalness: 0.72 }), 0, 0, 0);
    addBox(inlet, 0.98, 0.72, 0.08, mat(0x080b0d, { roughness: 0.6 }), 0, 0, 0.26, { castShadow: false });
    for (const xx of [-0.24, 0.24]) addBox(inlet, 0.08, 0.36, 0.03, mat(0xc7a25c, { roughness: 0.3, metalness: 0.9 }), xx, 0, 0.31, { castShadow: false });
    addBox(inlet, 0.1, 0.16, 0.03, mat(0x9c845d, { roughness: 0.3, metalness: 0.9 }), 0, 0.34, 0.31, { castShadow: false });
    inlet.position.set(-2.3, 1.32, -4.63);
    registerComponent('ac-inlet', inlet, [0, 0, 0.2], psuRoot, { focusRadius: 14 });

    /* fuse */
    const fuse = new THREE.Group();
    addCyl(fuse, 0.12, 0.12, 0.62, 14, mat(0xd9e6e6, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 }), 0, 0, 0, { rx: Math.PI / 2 });
    addCyl(fuse, 0.14, 0.14, 0.11, 12, mat(0xaabcc0, { roughness: 0.28, metalness: 0.85 }), 0, 0, 0.31, { rx: Math.PI / 2 });
    addCyl(fuse, 0.14, 0.14, 0.11, 12, mat(0xaabcc0, { roughness: 0.28, metalness: 0.85 }), 0, 0, -0.31, { rx: Math.PI / 2 });
    addBox(fuse, 0.02, 0.02, 0.3, mat(0xc58a4d, { roughness: 0.4, metalness: 0.6 }), 0, 0, 0);
    fuse.position.set(-2.55, 1.32, -3.7);
    registerComponent('fuse', fuse, [0, 0, 0], psuRoot, { focusRadius: 13 });

    /* MOV */
    const mov = new THREE.Group();
    addCyl(mov, 0.3, 0.3, 0.1, 20, mat(0x1e5186, { roughness: 0.35, metalness: 0.25 }), 0, 0, 0, { rx: Math.PI / 2 });
    addCyl(mov, 0.1, 0.1, 0.13, 12, mat(0x9ca7a7, { roughness: 0.4, metalness: 0.6 }), 0, 0, 0.05, { rx: Math.PI / 2, castShadow: false });
    mov.position.set(-1.72, 1.3, -3.7);
    registerComponent('mov', mov, [0, 0, 0], psuRoot, { focusRadius: 13 });

    /* NTC + relay */
    const ntc = new THREE.Group();
    addBox(ntc, 0.85, 0.78, 0.7, mat(0x151b1e, { roughness: 0.4, metalness: 0.4 }), 0, 0.4, 0);
    addBox(ntc, 0.7, 0.16, 0.72, mat(0x283337, { roughness: 0.4, metalness: 0.65 }), 0, 0.86, 0);
    addCyl(ntc, 0.2, 0.2, 0.09, 16, mat(0x214b32, { roughness: 0.5 }), 0.7, 0.2, 0, { rx: Math.PI / 2, castShadow: false });
    ntc.position.set(-2.55, 0.3, -3.02);
    registerComponent('ntc-relay', ntc, [0, 0.5, 0], psuRoot, { focusRadius: 14 });

    /* EMI */
    const emi = new THREE.Group();
    const cmChoke = makeToroid(0.45, 0.17, 0xc1743e);
    cmChoke.position.set(-0.35, 0.24, -3.25);
    emi.add(cmChoke);
    const xcap = addBox(emi, 0.8, 0.48, 0.32, mat(0xc8a438, { roughness: 0.38, metalness: 0.18 }), 0.68, 0.48, -3.2);
    addBox(emi, 0.55, 0.02, 0.2, mat(0x221d12, { roughness: 0.5 }), 0.68, 0.73, -3.2, { castShadow: false });
    for (const xx of [1.34, 1.62]) addCyl(emi, 0.22, 0.22, 0.11, 18, mat(0x1f4678, { roughness: 0.34, metalness: 0.2 }), xx, 0.42, -3.42, { rx: Math.PI / 2, castShadow: false });
    emi.position.set(0.0, 0.3, 0);
    registerComponent('emi', emi, [0.25, 0.75, -3.25], psuRoot, { focusRadius: 15 });

    /* bridge */
    const bridge = new THREE.Group();
    const brSink = makeHeatsink(1.25, 0.55, 0.95, 7, 0x3a454b);
    brSink.position.set(-2.2, 0.31, -2.4);
    bridge.add(brSink);
    addBox(bridge, 0.8, 0.3, 0.6, mat(0x10171a, { roughness: 0.4, metalness: 0.42 }), -2.2, 0.48, -2.4);
    addBox(bridge, 0.6, 0.025, 0.4, mat(0x303f47, { roughness: 0.3, metalness: 0.7 }), -2.2, 0.65, -2.4, { castShadow: false });
    for (let i = 0; i < 4; i++) addBox(bridge, 0.06, 0.22, 0.06, mat(0xa3b2b5, { roughness: 0.3, metalness: 0.9 }), -2.5 + i * 0.2, 0.24, -1.98, { castShadow: false });
    registerComponent('bridge', bridge, [-2.2, 0.7, -2.35], psuRoot, { focusRadius: 14 });

    /* PFC controller */
    const pfcCtrl = new THREE.Group();
    const ctrlBoard = addBox(pfcCtrl, 1.5, 0.06, 1.0, mat(0x0a2617, { roughness: 0.55, metalness: 0.2 }), 2.05, 1.78, -2.55);
    addBox(pfcCtrl, 0.55, 0.08, 0.42, mat(0x141b1e, { roughness: 0.35, metalness: 0.4 }), 2.05, 1.84, -2.55, { castShadow: false });
    for (let i = 0; i < 5; i++) addBox(pfcCtrl, 0.12, 0.05, 0.08, mat(0x30383b, { roughness: 0.35 }), 1.55 + i * 0.2, 1.83, -2.2, { castShadow: false });
    for (const [x, z] of [[1.4, -2.9], [2.7, -2.9]]) addCyl(pfcCtrl, 0.035, 0.035, 0.42, 8, mat(0x7c898c, { roughness: 0.3, metalness: 0.8 }), x, 1.55, z, { castShadow: false });
    registerComponent('pfc-ctrl', pfcCtrl, [2.05, 1.9, -2.55], psuRoot, { focusRadius: 13 });

    /* PFC MOSFET */
    const pfcMos = new THREE.Group();
    const pfcSink = makeHeatsink(1.1, 0.8, 1.0, 6, 0x404b50);
    pfcSink.position.set(2.05, 0.28, -1.78);
    pfcMos.add(pfcSink);
    for (const xx of [1.8, 2.3]) {
      const mos = makeMosfet();
      mos.position.set(xx, 0.55, -1.78);
      mos.rotation.x = 0;
      pfcMos.add(mos);
    }
    registerComponent('pfc-mos', pfcMos, [2.05, 0.9, -1.78], psuRoot, { focusRadius: 14 });

    /* PFC diode */
    const pfcDiode = new THREE.Group();
    addBox(pfcDiode, 0.48, 0.4, 0.55, mat(0x0c1214, { roughness: 0.35, metalness: 0.4 }), 2.35, 0.65, -1.02);
    addBox(pfcDiode, 0.2, 0.05, 0.24, mat(0x8c9a9a, { roughness: 0.25, metalness: 0.85 }), 2.35, 0.88, -1.02, { castShadow: false });
    addBox(pfcDiode, 0.8, 0.08, 0.7, mat(0x303b3f, { roughness: 0.38, metalness: 0.7 }), 2.35, 0.33, -1.02);
    registerComponent('pfc-diode', pfcDiode, [2.35, 0.8, -1.02], psuRoot, { focusRadius: 13 });

    /* PFC inductor */
    const pfcInd = new THREE.Group();
    const pfcToroid = makeToroid(0.68, 0.24, 0xb96834);
    pfcToroid.position.set(-2.1, 0.5, -1.65);
    pfcInd.add(pfcToroid);
    addBox(pfcInd, 1.7, 0.08, 1.7, mat(0x1d2b26, { roughness: 0.6, metalness: 0.2 }), -2.1, 0.24, -1.65, { castShadow: false });
    registerComponent('pfc-inductor', pfcInd, [-2.1, 0.8, -1.65], psuRoot, { focusRadius: 14 });

    /* bulk capacitor */
    const bulk = new THREE.Group();
    const bulkCap = makeCapacitor(0.55, 2.05, 0x22303a, 0x9eb1b7);
    bulkCap.position.set(0.45, 0.29, -0.78);
    bulk.add(bulkCap);
    addCyl(bulk, 0.52, 0.56, 0.1, 22, mat(0x0a1114, { roughness: 0.5, metalness: 0.3 }), 0.45, 0.26, -0.78, { castShadow: false });
    addBox(bulk, 0.55, 0.5, 0.02, mat(0x0a0e10, { roughness: 0.4, metalness: 0.5 }), 0.45, 1.38, -0.24, { castShadow: false });
    registerComponent('bulk-cap', bulk, [0.45, 1.35, -0.78], psuRoot, { focusRadius: 14 });

    /* LLC controller */
    const llcCtrl = new THREE.Group();
    addBox(llcCtrl, 1.35, 0.05, 0.9, mat(0x09261a, { roughness: 0.5, metalness: 0.22 }), 2.1, 1.84, -0.15);
    addBox(llcCtrl, 0.48, 0.08, 0.36, mat(0x151d20, { roughness: 0.35, metalness: 0.4 }), 2.1, 1.91, -0.15, { castShadow: false });
    for (let i = 0; i < 6; i++) addBox(llcCtrl, 0.08, 0.04, 0.06, mat(0x2c3437), 1.55 + i * 0.18, 1.89, 0.2, { castShadow: false });
    registerComponent('llc-ctrl', llcCtrl, [2.1, 1.95, -0.15], psuRoot, { focusRadius: 13 });

    /* LLC MOSFETs */
    const llcMos = new THREE.Group();
    const llcSink = makeHeatsink(1.15, 0.85, 1.0, 6, 0x3b474d);
    llcSink.position.set(-2.05, 0.28, 0.08);
    llcMos.add(llcSink);
    for (const xx of [-2.3, -1.8]) {
      const m = makeMosfet(0x0d1316);
      m.position.set(xx, 0.56, 0.08);
      llcMos.add(m);
    }
    registerComponent('llc-mos', llcMos, [-2.05, 0.95, 0.08], psuRoot, { focusRadius: 14 });

    /* resonant tank */
    const res = new THREE.Group();
    const resToroid = makeToroid(0.45, 0.17, 0xc9793b);
    resToroid.position.set(0.2, 0.4, 0.25);
    res.add(resToroid);
    addBox(res, 0.48, 0.3, 0.32, mat(0x784d2a, { roughness: 0.4, metalness: 0.2 }), 1.15, 0.42, 0.28);
    addBox(res, 1.9, 0.07, 1.25, mat(0x1c2a25, { roughness: 0.6 }), 0.55, 0.22, 0.25, { castShadow: false });
    registerComponent('resonant', res, [0.55, 0.65, 0.25], psuRoot, { focusRadius: 14 });

    /* transformer */
    const tx = new THREE.Group();
    const coreDark = mat(0x1e282b, { roughness: 0.58, metalness: 0.42 });
    addBox(tx, 0.4, 2.0, 2.2, coreDark, -1.35, 1.25, 1.38);
    addBox(tx, 0.4, 2.0, 2.2, coreDark, 1.35, 1.25, 1.38);
    addBox(tx, 2.35, 1.55, 1.75, mat(0x9a542e, { roughness: 0.38, metalness: 0.7 }), 0, 1.25, 1.38);
    for (let i = 0; i < 6; i++) addBox(tx, 0.1, 1.68, 1.9, mat(0x6f3a20, { roughness: 0.45 }), -0.95 + i * 0.38, 1.25, 1.38, { castShadow: false });
    addBox(tx, 2.25, 0.15, 1.9, mat(0xe0b94e, { roughness: 0.45, metalness: 0.2, transparent: true, opacity: 0.7 }), 0, 2.0, 1.38, { castShadow: false });
    addBox(tx, 2.25, 0.15, 1.9, mat(0xe0b94e, { roughness: 0.45, metalness: 0.2, transparent: true, opacity: 0.7 }), 0, 0.5, 1.38, { castShadow: false });
    addTorus(tx, 1.0, 0.035, mat(0xd1935b, { roughness: 0.3, metalness: 0.8 }), 0, 2.2, 1.38, { rx: 0, ry: Math.PI / 2, radial: 32, castShadow: false });
    addBox(tx, 3.0, 0.08, 2.8, mat(0x1a2723, { roughness: 0.6 }), 0, 0.22, 1.38, { castShadow: false });
    registerComponent('transformer', tx, [0, 1.65, 1.38], psuRoot, { focusRadius: 15 });

    /* synchronous rectifier */
    const sr = new THREE.Group();
    const srSink = makeHeatsink(1.2, 0.8, 1.25, 6, 0x3c484d);
    srSink.position.set(2.0, 0.28, 2.25);
    sr.add(srSink);
    for (const xx of [1.75, 2.28]) {
      const m = makeMosfet();
      m.position.set(xx, 0.57, 2.25);
      sr.add(m);
    }
    registerComponent('sr-mos', sr, [2.0, 0.9, 2.25], psuRoot, { focusRadius: 14 });

    /* output chokes */
    const outChoke = new THREE.Group();
    for (const zz of [2.05, 2.92]) {
      const t = makeToroid(0.42, 0.18, 0xc57a3a);
      t.position.set(-1.8, 0.42, zz);
      outChoke.add(t);
    }
    addBox(outChoke, 1.5, 0.07, 1.7, mat(0x1b2823, { roughness: 0.6 }), -1.8, 0.2, 2.5, { castShadow: false });
    registerComponent('output-choke', outChoke, [-1.8, 0.75, 2.5], psuRoot, { focusRadius: 14 });

    /* output capacitors */
    const outCap = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const cap = makeCapacitor(0.24, 0.9, 0x1b2b35, 0xaebdc0);
      cap.position.set(0.2 + i * 0.48, 0.27, 3.2);
      outCap.add(cap);
    }
    registerComponent('output-cap', outCap, [0.9, 0.9, 3.2], psuRoot, { focusRadius: 14 });

    /* optocoupler */
    const opto = new THREE.Group();
    addBox(opto, 0.3, 0.12, 0.24, mat(0x171d1f, { roughness: 0.4 }), 2.52, 1.94, 1.12);
    for (let i = 0; i < 4; i++) addBox(opto, 0.02, 0.1, 0.02, mat(0xc8b77a, { roughness: 0.3, metalness: 0.8 }), 2.42 + i * 0.067, 1.86, 1.0, { castShadow: false });
    registerComponent('opto', opto, [2.52, 2.0, 1.12], psuRoot, { focusRadius: 12 });

    /* supervisor board */
    const supervisor = new THREE.Group();
    addBox(supervisor, 1.5, 0.06, 1.1, mat(0x08241a, { roughness: 0.52 }), 2.05, 1.72, 1.32);
    addBox(supervisor, 0.55, 0.1, 0.48, mat(0x141c1e, { roughness: 0.38, metalness: 0.35 }), 2.05, 1.79, 1.32, { castShadow: false });
    for (let i = 0; i < 8; i++) addBox(supervisor, 0.035, 0.03, 0.12, mat(0xa8b7a0, { roughness: 0.3, metalness: 0.7 }), 1.48 + i * 0.16, 1.76, 0.95, { castShadow: false });
    for (let i = 0; i < 4; i++) addCyl(supervisor, 0.08, 0.08, 0.2, 10, mat(0x1c2527), 2.58, 1.82, 1.65 + i * 0.16, { castShadow: false });
    registerComponent('supervisor', supervisor, [2.05, 1.82, 1.32], psuRoot, { focusRadius: 13 });

    /* 5VSB auxiliary supply */
    const sb = new THREE.Group();
    addBox(sb, 1.4, 0.06, 1.0, mat(0x0a2318, { roughness: 0.55 }), 2.15, 0.32, -3.55);
    const sbTx = makeToroid(0.28, 0.13, 0xb9763e);
    sbTx.position.set(1.75, 0.52, -3.55);
    sb.add(sbTx);
    const sbCap = makeCapacitor(0.2, 0.62, 0x1c2b33, 0xa4b8bc);
    sbCap.position.set(2.5, 0.35, -3.25);
    sb.add(sbCap);
    addBox(sb, 0.5, 0.08, 0.35, mat(0x151d20, { roughness: 0.35 }), 2.38, 0.4, -3.8, { castShadow: false });
    registerComponent('standby', sb, [2.2, 0.62, -3.55], psuRoot, { focusRadius: 13 });

    /* SATA power connectors */
    const sata = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      addBox(sata, 0.36, 0.55, 0.8, mat(0x141b1e, { roughness: 0.42, metalness: 0.42 }), 2.65 + i * 0.42, 0.62, 3.86);
      addBox(sata, 0.24, 0.2, 0.62, mat(0x0a0d0f, { roughness: 0.5 }), 2.83 + i * 0.42, 0.92, 3.86, { castShadow: false });
      addBox(sata, 0.02, 0.03, 0.5, mat(0xcf9b56, { roughness: 0.3, metalness: 0.8 }), 2.83 + i * 0.42, 0.63, 3.86, { castShadow: false });
    }
    registerComponent('sata-power', sata, [2.85, 0.7, 3.86], psuRoot, { focusRadius: 13 });

    /* PSU fan */
    const psuFan = new THREE.Group();
    const fan = makeFan(1.02, 0xffb45e, 7);
    fan.group.position.set(0.75, 3.08, -2.62);
    psuFan.add(fan.group);
    addBox(psuFan, 2.45, 0.06, 2.45, mat(0x111b20, { roughness: 0.4, metalness: 0.55, transparent: true, opacity: 0.75 }), 0.75, 3.02, -2.62, { castShadow: false });
    registerComponent('psu-fan', psuFan, [0.75, 3.15, -2.62], psuRoot, { focusRadius: 14 });
    compObjects.get('psu-fan').fanRotor = fan.rotor;

    // internal flow curve is built later, once all coords are known
  }

  /* ── motherboard ─────────────────────────────────────────────────── */
  function buildBoard() {
    boardRoot = new THREE.Group();
    boardRoot.position.set(3.5, 0, 0);
    boardRoot.name = 'MOTHERBOARD';
    worldRoot.add(boardRoot);

    const benchY = -0.54;
    // standoffs
    for (const [x, z] of [[-7.9, -5.1], [7.9, -5.1], [-7.9, 5.1], [7.9, 5.1]]) {
      addCyl(boardRoot, 0.16, 0.18, 0.55, 12, mat(0x54656a, { roughness: 0.34, metalness: 0.8 }), x, -0.275, z, { castShadow: false });
      addCyl(boardRoot, 0.26, 0.26, 0.12, 16, mat(0x0b1114, { roughness: 0.55 }), x, -0.56, z, { castShadow: false });
    }

    const boardMat = mat(0x0a160f, { roughness: 0.62, metalness: 0.3 });
    addBox(boardRoot, 17.5, 0.28, 11.5, boardMat, 0, 0, 0, { receiveShadow: true });
    addLineBox(boardRoot, 17.5, 0.28, 11.5, 0x30594a, 0, 0, 0, 0.45);
    // subtle edge glow
    const edgeMat = basicMat(0x3a9b84, { opacity: 0.25, blending: THREE.AdditiveBlending });
    addBox(boardRoot, 17.52, 0.012, 0.035, edgeMat, 0, 0.145, -5.74, { castShadow: false });
    addBox(boardRoot, 17.52, 0.012, 0.035, edgeMat, 0, 0.145, 5.74, { castShadow: false });
    addBox(boardRoot, 0.035, 0.012, 11.52, edgeMat, -8.74, 0.145, 0, { castShadow: false });
    addBox(boardRoot, 0.035, 0.012, 11.52, edgeMat, 8.74, 0.145, 0, { castShadow: false });

    const pcbPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(17.42, 11.42),
      new THREE.MeshStandardMaterial({ map: makeBoardTexture(), color: 0xb6c4be, roughness: 0.8, metalness: 0.18 })
    );
    pcbPlane.rotation.x = -Math.PI / 2;
    pcbPlane.position.y = 0.151;
    pcbPlane.receiveShadow = true;
    boardRoot.add(pcbPlane);

    // mounting holes
    for (const [x, z] of [[-8.1, -5.25], [8.1, -5.25], [-8.1, 5.2], [8.1, 5.2], [-4.5, 0], [4.9, 3.2]]) {
      addCyl(boardRoot, 0.16, 0.16, 0.02, 18, mat(0xc9a75b, { roughness: 0.2, metalness: 0.9 }), x, 0.16, z, { castShadow: false });
      addCyl(boardRoot, 0.09, 0.09, 0.025, 14, mat(0x030604), x, 0.165, z, { castShadow: false });
    }

    /* CPU socket */
    const socket = new THREE.Group();
    addBox(socket, 3.45, 0.24, 3.45, mat(0x11191c, { roughness: 0.46, metalness: 0.42 }), 0, 0.32, 0);
    addBox(socket, 3.1, 0.05, 3.1, mat(0x293944, { roughness: 0.32, metalness: 0.75 }), 0, 0.455, 0, { castShadow: false });
    addBox(socket, 3.25, 0.08, 0.13, mat(0x52646b, { roughness: 0.3, metalness: 0.85 }), 0, 0.58, -1.55, { castShadow: false });
    addBox(socket, 3.25, 0.08, 0.13, mat(0x52646b, { roughness: 0.3, metalness: 0.85 }), 0, 0.58, 1.55, { castShadow: false });
    addBox(socket, 3.25, 0.1, 0.12, mat(0x5f7075, { roughness: 0.3, metalness: 0.85 }), 0, 0.585, 1.48, { castShadow: false });
    addBox(socket, 0.3, 0.08, 0.9, mat(0x3e4c52, { roughness: 0.35, metalness: 0.8 }), 1.75, 0.51, 1.0, { castShadow: false, ry: 0.2 });
    registerComponent('cpu-socket', socket, [0, 0.58, 0], boardRoot, { focusRadius: 15 });

    /* CPU */
    const cpu = new THREE.Group();
    addBox(cpu, 2.72, 0.1, 2.72, mat(0x0e3828, { roughness: 0.5, metalness: 0.25 }), 0, 0.59, 0);
    addBox(cpu, 2.45, 0.18, 2.45, mat(0x9daeb3, { roughness: 0.38, metalness: 0.55 }), 0, 0.71, 0);
    addBox(cpu, 2.2, 0.02, 2.2, mat(0xc9d7d8, { roughness: 0.3, metalness: 0.62 }), 0, 0.815, 0, { castShadow: false });
    addBox(cpu, 0.55, 0.015, 0.18, mat(0x6d7d80, { roughness: 0.25, metalness: 0.9 }), -0.5, 0.83, -0.55, { castShadow: false });
    addBox(cpu, 0.12, 0.01, 0.12, mat(0xd2b15e, { roughness: 0.2, metalness: 0.9 }), -1.0, 0.83, 1.0, { castShadow: false });
    const cpuDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 0.36),
      new THREE.MeshBasicMaterial({ map: makeDecalTexture('CPU // CORE', 'VCORE · LGA', '#5a696b'), transparent: true, opacity: 0.8, depthWrite: false })
    );
    cpuDecal.rotation.x = -Math.PI / 2;
    cpuDecal.position.set(0, 0.831, 0.55);
    cpu.add(cpuDecal);
    const cpuGlow = addGlowSprite(cpu, 0, 0.86, 0, 0x5ef2d6, 2.8, 0.0);
    cpuGlow.userData.cpuGlow = true;
    const cpuFrameMat = basicMat(0x5ef2d6, { opacity: 0.2, blending: THREE.AdditiveBlending });
    addBox(cpu, 3.5, 0.012, 0.022, cpuFrameMat, 0, 0.845, -1.72, { castShadow: false });
    addBox(cpu, 3.5, 0.012, 0.022, cpuFrameMat, 0, 0.845, 1.72, { castShadow: false });
    addBox(cpu, 0.022, 0.012, 3.46, cpuFrameMat, -1.72, 0.845, 0, { castShadow: false });
    addBox(cpu, 0.022, 0.012, 3.46, cpuFrameMat, 1.72, 0.845, 0, { castShadow: false });
    animatables.cpuFrameMat = cpuFrameMat;
    registerComponent('cpu', cpu, [0, 0.85, 0], boardRoot, { focusRadius: 14 });
    compObjects.get('cpu').cpuGlow = cpuGlow;

    /* VRM row: 8 x DrMOS / choke / cap */
    const drmos = new THREE.Group();
    const chokes = new THREE.Group();
    const vrmCaps = new THREE.Group();
    const phaseLeds = [];
    for (let i = 0; i < 8; i++) {
      const x = -6.35 + i * 0.65;
      const z = -2.45;
      // DrMOS package
      addBox(drmos, 0.42, 0.16, 0.42, mat(0x101619, { roughness: 0.38, metalness: 0.4 }), x, 0.28, z);
      addBox(drmos, 0.3, 0.04, 0.3, mat(0x26343a, { roughness: 0.3, metalness: 0.65 }), x, 0.37, z, { castShadow: false });
      // choke
      addBox(chokes, 0.37, 0.5, 0.4, mat(0x505f61, { roughness: 0.38, metalness: 0.7 }), x, 0.4, z + 0.58);
      addBox(chokes, 0.3, 0.06, 0.32, mat(0x1e282b, { roughness: 0.4, metalness: 0.55 }), x, 0.67, z + 0.58, { castShadow: false });
      // caps
      const cap = makeCapacitor(0.12, 0.32, 0x26343b, 0xaebdc0);
      cap.position.set(x, 0.16, z - 0.49);
      vrmCaps.add(cap);
      // tiny phase LED
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), basicMat(0x1a2a2d, { opacity: 0.8 }));
      led.position.set(x + 0.23, 0.4, z - 0.22);
      drmos.add(led);
      phaseLeds.push(led);
    }
    registerComponent('drmos', drmos, [-2.1, 0.45, -2.45], boardRoot, { focusRadius: 14 });
    compObjects.get('drmos').phaseLeds = phaseLeds;
    registerComponent('vrm-choke', chokes, [-2.1, 0.7, -1.87], boardRoot, { focusRadius: 14 });
    registerComponent('vrm-cap', vrmCaps, [-2.1, 0.45, -2.94], boardRoot, { focusRadius: 14 });

    const vrmCtrl = new THREE.Group();
    addBox(vrmCtrl, 0.9, 0.08, 0.7, mat(0x0b2117, { roughness: 0.45 }), -3.45, 0.25, -3.28);
    addBox(vrmCtrl, 0.48, 0.08, 0.4, mat(0x131b1e, { roughness: 0.35 }), -3.45, 0.32, -3.28, { castShadow: false });
    for (let i = 0; i < 5; i++) addBox(vrmCtrl, 0.04, 0.025, 0.15, mat(0xa68d55, { roughness: 0.3, metalness: 0.8 }), -3.8 + i * 0.18, 0.3, -3.0, { castShadow: false });
    registerComponent('vrm-ctrl', vrmCtrl, [-3.45, 0.36, -3.28], boardRoot, { focusRadius: 13 });

    /* sensors */
    const sensors = new THREE.Group();
    addBox(sensors, 0.28, 0.08, 0.18, mat(0x11191c, { roughness: 0.4 }), -1.1, 0.25, -3.55);
    addBox(sensors, 0.16, 0.06, 0.12, mat(0x2a3b36, { roughness: 0.4 }), -0.82, 0.25, -3.55);
    addCyl(sensors, 0.04, 0.04, 0.34, 8, mat(0xb59c58, { roughness: 0.3, metalness: 0.8 }), -0.55, 0.32, -3.55, { castShadow: false });
    registerComponent('sensors', sensors, [-0.95, 0.32, -3.55], boardRoot, { focusRadius: 12 });

    /* EPS 8-pin */
    const eps = new THREE.Group();
    addBox(eps, 1.0, 1.0, 0.72, mat(0x101619, { roughness: 0.44, metalness: 0.4 }), -2.9, 0.52, -5.2);
    addBox(eps, 0.82, 0.68, 0.06, mat(0x1b252a, { roughness: 0.5 }), -2.9, 0.55, -4.81, { castShadow: false });
    for (let i = 0; i < 8; i++) addBox(eps, 0.09, 0.15, 0.08, mat(0xc5a35f, { roughness: 0.28, metalness: 0.9 }), -3.2 + (i % 4) * 0.2, 0.35 + Math.floor(i / 4) * 0.3, -4.79, { castShadow: false });
    registerComponent('eps8', eps, [-2.9, 0.9, -5.2], boardRoot, { focusRadius: 13 });

    /* ATX 24-pin */
    const atx = new THREE.Group();
    addBox(atx, 0.8, 1.15, 2.4, mat(0x101619, { roughness: 0.44, metalness: 0.4 }), -8.08, 0.58, 2.55);
    addBox(atx, 0.06, 0.86, 2.15, mat(0x1d282c, { roughness: 0.5 }), -7.65, 0.58, 2.55, { castShadow: false });
    for (let i = 0; i < 12; i++) addBox(atx, 0.08, 0.1, 0.08, mat(0xc5a35f, { roughness: 0.28, metalness: 0.9 }), -7.62, 0.25 + (i % 6) * 0.12, 1.7 + Math.floor(i / 6) * 0.8 + (i % 6) * 0.08, { castShadow: false });
    addBox(atx, 0.7, 0.06, 1.8, mat(0x25352f, { roughness: 0.5 }), -8.05, 1.17, 2.55, { castShadow: false });
    registerComponent('atx24', atx, [-8.05, 1.0, 2.55], boardRoot, { focusRadius: 13 });

    /* DC-DC bucks near ATX */
    const buck = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      addBox(buck, 0.75, 0.06, 0.55, mat(0x0b2318, { roughness: 0.5 }), -7.0 + i * 0.9, 0.23, 1.3);
      addBox(buck, 0.45, 0.12, 0.35, mat(0x303b3c, { roughness: 0.4, metalness: 0.5 }), -7.0 + i * 0.9, 0.32, 1.3, { castShadow: false });
      addBox(buck, 0.16, 0.18, 0.2, mat(0x4b5555, { roughness: 0.35, metalness: 0.6 }), -6.8 + i * 0.9, 0.39, 1.5, { castShadow: false });
    }
    registerComponent('buck', buck, [-6.1, 0.35, 1.3], boardRoot, { focusRadius: 12 });

    /* LDO */
    const ldo = new THREE.Group();
    addBox(ldo, 0.3, 0.1, 0.22, mat(0x11181b, { roughness: 0.4 }), -6.35, 0.25, 2.82);
    for (let i = 0; i < 4; i++) addBox(ldo, 0.025, 0.12, 0.06, mat(0xc9b477, { roughness: 0.3, metalness: 0.8 }), -6.47 + i * 0.08, 0.18, 2.72, { castShadow: false });
    registerComponent('ldo', ldo, [-6.35, 0.3, 2.82], boardRoot, { focusRadius: 11 });

    /* DIMM slots & modules */
    const dimms = new THREE.Group();
    const slotXs = [4.65, 5.3, 5.95, 6.6];
    slotXs.forEach((x, i) => {
      addBox(dimms, 0.09, 0.24, 4.6, mat(0x121a1d, { roughness: 0.46 }), x, 0.26, -0.1);
      if (i % 2 === 1) {
        // installed DIMM
        addBox(dimms, 0.12, 2.55, 4.4, mat(0x0b3024, { roughness: 0.5, metalness: 0.2 }), x, 1.55, -0.1);
        addBox(dimms, 0.2, 2.05, 4.42, mat(0x1b292f, { roughness: 0.36, metalness: 0.55 }), x, 1.5, -0.1);
        addBox(dimms, 0.22, 0.07, 4.42, mat(0x9eabad, { roughness: 0.3, metalness: 0.72 }), x, 2.62, -0.1, { castShadow: false });
        const rgb = addBox(dimms, 0.045, 0.06, 3.6, mat(0x5ef2d6, { emissive: 0x5ef2d6, emissiveIntensity: 0.8, roughness: 0.2 }), x + 0.13, 2.55, -0.1, { castShadow: false });
        animatables.rgb.push(rgb.material);
        for (let j = 0; j < 4; j++) addBox(dimms, 0.18, 0.12, 0.18, mat(0x394a50, { roughness: 0.3, metalness: 0.7 }), x, 2.0, -1.5 + j * 1.0, { castShadow: false });
      }
    });
    registerComponent('ddr5', dimms, [5.65, 1.6, -0.1], boardRoot, { focusRadius: 15 });

    /* PCIe slot & GPU */
    addBox(boardRoot, 6.6, 0.22, 0.34, mat(0x151d20, { roughness: 0.4 }), 2.65, 0.24, 4.3);
    addBox(boardRoot, 6.1, 0.06, 0.16, mat(0x323f44, { roughness: 0.35, metalness: 0.7 }), 2.65, 0.36, 4.3, { castShadow: false });
    addBox(boardRoot, 0.3, 0.12, 0.28, mat(0xc6a55e, { roughness: 0.28, metalness: 0.9 }), 5.85, 0.33, 4.3, { castShadow: false });

    const gpu = new THREE.Group();
    addBox(gpu, 6.9, 0.12, 2.6, mat(0x0b2b22, { roughness: 0.55, metalness: 0.25 }), 2.8, 0.95, 3.95);
    addBox(gpu, 7.05, 0.7, 2.75, mat(0x182329, { roughness: 0.4, metalness: 0.58 }), 2.8, 1.42, 3.9);
    addBox(gpu, 6.9, 0.08, 2.65, mat(0x0a1014, { roughness: 0.34, metalness: 0.6 }), 2.8, 1.8, 3.9, { castShadow: false });
    animatables.gpuFans = [];
    for (const x of [0.55, 2.8, 5.05]) {
      const fan = makeFan(0.52, 0x5ef2d6, 7);
      fan.group.position.set(x, 1.84, 3.9);
      gpu.add(fan.group);
      animatables.gpuFans.push(fan.rotor);
    }
    // GPU accent strips
    for (const z of [2.58, 5.22]) {
      const strip = addBox(gpu, 5.8, 0.035, 0.04, mat(0xc4a7ff, { emissive: 0xc4a7ff, emissiveIntensity: 0.7, roughness: 0.2 }), 2.8, 1.78, z, { castShadow: false });
      animatables.rgb.push(strip.material);
    }
    const gpuBadge = new THREE.Mesh(
      new THREE.PlaneGeometry(2.35, 0.72),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture(['GRAPHICS', '12V-2×6 · 16-PIN'], '#d7f3ff'), transparent: true, opacity: 0.86 })
    );
    gpuBadge.position.set(2.8, 1.36, 5.285);
    gpu.add(gpuBadge);
    const gpuLineMat = basicMat(0x5ef2d6, { opacity: 0.42, blending: THREE.AdditiveBlending });
    addBox(gpu, 5.2, 0.012, 0.022, gpuLineMat, 2.8, 1.805, 2.45, { castShadow: false });
    addBox(gpu, 5.2, 0.012, 0.022, gpuLineMat, 2.8, 1.805, 5.35, { castShadow: false });
    registerComponent('gpu', gpu, [2.8, 1.45, 3.9], boardRoot, { focusRadius: 16 });

    /* GPU VRM */
    const gpuVrm = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      addBox(gpuVrm, 0.28, 0.1, 0.28, mat(0x11191c, { roughness: 0.4 }), 0.15 + i * 0.42, 1.05, 3.0);
      addBox(gpuVrm, 0.3, 0.28, 0.3, mat(0x5a6768, { roughness: 0.36, metalness: 0.7 }), 0.15 + i * 0.42, 1.14, 3.32);
      addCyl(gpuVrm, 0.08, 0.08, 0.2, 8, mat(0x27343b), 0.15 + i * 0.42, 1.05, 2.7, { castShadow: false });
    }
    registerComponent('gpu-vrm', gpuVrm, [1.0, 1.15, 3.1], boardRoot, { focusRadius: 13 });

    /* 12V-2x6 component registered on GPU connector position */
    const hpwr = new THREE.Group();
    addBox(hpwr, 0.95, 0.55, 0.5, mat(0x090c0e, { roughness: 0.4, metalness: 0.3 }), 6.45, 1.38, 3.2);
    for (let i = 0; i < 12; i++) addBox(hpwr, 0.03, 0.1, 0.03, mat(0xc7a65e, { roughness: 0.28, metalness: 0.9 }), 6.22 + (i % 6) * 0.08, 1.27 + Math.floor(i / 6) * 0.15, 3.43, { castShadow: false });
    for (let i = 0; i < 4; i++) addBox(hpwr, 0.04, 0.04, 0.03, mat(0x7c8a8b, { roughness: 0.3, metalness: 0.8 }), 6.4 + i * 0.06, 1.5, 3.43, { castShadow: false });
    registerComponent('hpwr', hpwr, [6.45, 1.55, 3.2], boardRoot, { focusRadius: 13 });

    /* PCH */
    const pch = new THREE.Group();
    addBox(pch, 1.8, 0.18, 1.6, mat(0x10181b, { roughness: 0.4 }), 7.4, 0.31, 4.75);
    const pchSink = makeHeatsink(1.75, 0.5, 1.55, 8, 0x344349);
    pchSink.position.set(7.4, 0.4, 4.75);
    pch.add(pchSink);
    addBox(pch, 0.55, 0.02, 0.9, mat(0xc4a7ff, { emissive: 0xc4a7ff, emissiveIntensity: 0.25, roughness: 0.3 }), 7.4, 0.91, 4.75, { castShadow: false });
    registerComponent('pch', pch, [7.4, 0.8, 4.75], boardRoot, { focusRadius: 13 });

    /* M.2 NVMe */
    const nvme = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const z = 4.35 + i * 0.78;
      addBox(nvme, 3.4, 0.05, 0.34, mat(0x0b1b16, { roughness: 0.5 }), -5.45, 0.28, z);
      addBox(nvme, 2.9, 0.08, 0.78, mat(0x1b292e, { roughness: 0.4, metalness: 0.55 }), -5.6, 0.37, z);
      addBox(nvme, 2.6, 0.04, 0.5, mat(0x324247, { roughness: 0.33, metalness: 0.72 }), -5.6, 0.44, z, { castShadow: false });
      const led = addBox(nvme, 0.05, 0.02, 0.05, basicMat(0x5ef2d6, { opacity: 0.9 }), -4.25, 0.3, z, { castShadow: false });
      animatables.leds.push({ mesh: led, on: false });
    }
    registerComponent('nvme', nvme, [-5.4, 0.5, 4.74], boardRoot, { focusRadius: 14 });

    /* BIOS */
    const bios = new THREE.Group();
    addBox(bios, 0.48, 0.1, 0.35, mat(0x141c1f, { roughness: 0.4 }), -7.4, 0.26, -1.85);
    addBox(bios, 0.36, 0.04, 0.24, mat(0x303b3d, { roughness: 0.3 }), -7.4, 0.33, -1.85, { castShadow: false });
    for (let i = 0; i < 8; i++) addBox(bios, 0.03, 0.02, 0.08, mat(0xc6ab69, { roughness: 0.28, metalness: 0.8 }), -7.62 + i * 0.06, 0.22, -2.0, { castShadow: false });
    registerComponent('bios', bios, [-7.4, 0.34, -1.85], boardRoot, { focusRadius: 12 });

    /* CMOS battery */
    const cmos = new THREE.Group();
    addCyl(cmos, 0.44, 0.44, 0.16, 28, mat(0xb9c2bf, { roughness: 0.28, metalness: 0.9 }), -7.1, 0.31, 3.0);
    addCyl(cmos, 0.36, 0.36, 0.015, 24, mat(0x243033, { roughness: 0.4 }), -7.1, 0.395, 3.0, { castShadow: false });
    addBox(cmos, 0.55, 0.08, 0.18, mat(0x1b2427, { roughness: 0.4 }), -7.1, 0.28, 3.46, { castShadow: false });
    registerComponent('cmos', cmos, [-7.1, 0.42, 3.0], boardRoot, { focusRadius: 12 });

    /* clock generator */
    const clk = new THREE.Group();
    addBox(clk, 0.55, 0.12, 0.42, mat(0xb0b9ba, { roughness: 0.25, metalness: 0.92 }), -2.1, 0.26, 1.72);
    addBox(clk, 0.38, 0.02, 0.28, mat(0x5c6a6e, { roughness: 0.3, metalness: 0.8 }), -2.1, 0.33, 1.72, { castShadow: false });
    registerComponent('clock', clk, [-2.1, 0.35, 1.72], boardRoot, { focusRadius: 11 });

    /* fan / ARGB headers */
    const fanRgb = new THREE.Group();
    for (const [x, z, ry] of [[-7.1, 4.9, 0], [7.2, -3.7, 0]]) {
      addBox(fanRgb, 0.42, 0.18, 0.3, mat(0x141c1f, { roughness: 0.4 }), x, 0.27, z);
      for (let i = 0; i < 4; i++) addBox(fanRgb, 0.03, 0.16, 0.03, mat(0xc3a45f, { roughness: 0.3, metalness: 0.9 }), x - 0.13 + i * 0.09, 0.27, z - 0.05, { castShadow: false });
    }
    const rgbStrip = addBox(fanRgb, 6.3, 0.025, 0.035, mat(0x5ef2d6, { emissive: 0x5ef2d6, emissiveIntensity: 0.45, roughness: 0.2 }), -2.6, 0.17, 5.61, { castShadow: false });
    animatables.rgb.push(rgbStrip.material);
    registerComponent('fan-rgb', fanRgb, [-4.0, 0.32, 5.0], boardRoot, { focusRadius: 14 });

    /* rear I/O block */
    const io = new THREE.Group();
    addBox(io, 3.15, 0.82, 0.62, mat(0x19252a, { roughness: 0.38, metalness: 0.62 }), 7.25, 0.72, -5.28);
    addBox(io, 2.9, 0.7, 0.05, mat(0x090d0f, { roughness: 0.5 }), 7.25, 0.72, -5.6, { castShadow: false });
    // USB ports
    for (let i = 0; i < 4; i++) addBox(io, 0.26, 0.17, 0.08, mat(0x26363d, { roughness: 0.4, metalness: 0.6 }), 6.25 + i * 0.35, 0.9, -5.63, { castShadow: false });
    addBox(io, 0.45, 0.35, 0.08, mat(0x2e3c41, { roughness: 0.4 }), 7.9, 0.9, -5.63, { castShadow: false });
    for (let i = 0; i < 3; i++) addCyl(io, 0.09, 0.09, 0.06, 12, mat(0x1a2326, { roughness: 0.4 }), 8.33, 0.56 + i * 0.12, -5.63, { rx: Math.PI / 2, castShadow: false });
    addBox(io, 2.7, 0.05, 0.7, mat(0x323f44, { roughness: 0.35, metalness: 0.7 }), 7.25, 1.16, -5.25, { castShadow: false });
    registerComponent('io', io, [7.25, 0.85, -5.28], boardRoot, { focusRadius: 14 });

    /* POST debug LEDs */
    const dbg = new THREE.Group();
    addBox(dbg, 0.72, 0.08, 0.26, mat(0x0b1114, { roughness: 0.45 }), -7.55, 0.24, -4.7);
    for (let i = 0; i < 4; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.08), basicMat(0x351313, { opacity: 0.9 }));
      led.position.set(-7.82 + i * 0.18, 0.3, -4.7);
      dbg.add(led);
      debugLeds.push(led);
    }
    addBox(dbg, 0.38, 0.01, 0.1, mat(0x263033, { roughness: 0.3 }), -7.55, 0.29, -4.9, { castShadow: false });
    registerComponent('debug', dbg, [-7.55, 0.34, -4.7], boardRoot, { focusRadius: 12 });

    /* 3D power button */
    const pbtn = new THREE.Group();
    addBox(pbtn, 0.85, 0.3, 0.7, mat(0x111a1e, { roughness: 0.4, metalness: 0.55 }), -8.1, 0.3, -0.2);
    addCyl(pbtn, 0.28, 0.28, 0.08, 24, mat(0x1c282c, { roughness: 0.35, metalness: 0.7 }), -8.1, 0.47, -0.2);
    const btnLed = addTorus(pbtn, 0.26, 0.025, mat(0xffb45e, { emissive: 0xff9e64, emissiveIntensity: 1.4, roughness: 0.25 }), -8.1, 0.52, -0.2, { radial: 32, castShadow: false });
    animatables.leds.push({ mesh: btnLed, on: true, pulse: true });
    addBox(pbtn, 0.5, 0.025, 0.35, mat(0x263238, { roughness: 0.35 }), -8.1, 0.42, -0.2, { castShadow: false });
    registerComponent('power-button', pbtn, [-8.1, 0.55, -0.2], boardRoot, { focusRadius: 12 });
  }

  /* ── cables, board traces, energy flow ───────────────────────────── */
  const cableGroup = new THREE.Group();
  const cableMaterials = [];

  function makeCurve(points) {
    return new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.4);
  }

  function addCable(points, radius, opts = {}) {
    const curve = makeCurve(points);
    const cableGlow = {
      ac: 0xff8a4c, hv: 0xff5f5f, lv: 0xffd166, vsb: 0xb58cff, v12: 0xffd166, gpu: 0xffd166
    }[opts.key] || 0x5ef2d6;
    const material = new THREE.MeshStandardMaterial({
      color: 0x04080a,
      roughness: 0.84,
      metalness: 0.08,
      emissive: cableGlow,
      emissiveIntensity: 0.03
    });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 92, radius, 8, false), material);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    cableGroup.add(mesh);
    cableMaterials.push({ mat: material, key: opts.key || 'v12', base: material.emissiveIntensity });
    // subtle seam rings for a braided-cable silhouette
    if (opts.rings !== false && radius > 0.07) {
      for (let i = 1; i < 18; i++) {
        const t = i / 18;
        const p = curve.getPoint(t);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(radius * 1.04, radius * 0.12, 5, 12),
          new THREE.MeshBasicMaterial({ color: 0x1c2a2f, transparent: true, opacity: 0.5, depthWrite: false })
        );
        ring.position.copy(p);
        // orient the ring roughly along the local tangent
        const tangent = curve.getTangent(t).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
        ring.quaternion.copy(q);
        cableGroup.add(ring);
      }
    }
    return curve;
  }

  function addFlow(points, color, opts = {}) {
    const curve = makeCurve(points);
    const count = opts.count || 11;
    const size = opts.size || 0.38;
    const mat = new THREE.SpriteMaterial({
      map: GLOW_TEX, color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
    });
    const group = new THREE.Group();
    const sprites = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(mat);
      s.scale.set(size * (0.7 + (i % 3) * 0.2), size * (0.7 + (i % 3) * 0.2), 1);
      group.add(s);
      sprites.push(s);
    }
    worldRoot.add(group);
    const f = {
      curve, group, sprites, mat, color, key: opts.key || 'v12',
      speed: opts.speed || 0.085, size, intensity: 0, target: 0,
      offset: opts.offset || Math.random(), pulse: opts.pulse !== false
    };
    flowSystems.push(f);
    return f;
  }

  const traceGroup = new THREE.Group();
  function addTrace(points, color, opacity = 0.32, radius = 0.018) {
    const curve = makeCurve(points);
    const material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, radius, 4, false), material);
    traceGroup.add(mesh);
    return mesh;
  }

  function buildPowerNetwork() {
    worldRoot.add(cableGroup);
    worldRoot.add(traceGroup);
    const pw = (x, y, z) => [x - 12.0, y, z + 0.2];
    const bw = (x, y, z) => [x + 3.5, y, z];

    // ─ AC / PSU internals ─
    const acPath = [
      [-16.45, 1.0, -5.65], [-15.8, 1.02, -5.15], [-14.95, 1.15, -4.72], [-14.3, 1.3, -4.35]
    ];
    addCable(acPath, 0.075, { color: 0x20150d, key: 'ac', rings: false });
    addFlow(acPath, 0xff8a4c, { key: 'ac', count: 7, speed: 0.075, size: 0.25 });

    const hvPath = [
      [-14.3, 1.32, -4.3], [-14.55, 1.25, -3.6], [-13.8, 0.95, -3.15],
      [-14.2, 0.75, -2.35], [-14.1, 0.9, -1.5], [-11.55, 2.45, -0.5],
      [-12.35, 1.1, 0.2], [-12.1, 1.62, 1.58]
    ];
    addCable(hvPath, 0.052, { color: 0x2a1010, key: 'hv', rings: false });
    addFlow(hvPath, 0xff5f5f, { key: 'hv', count: 12, speed: 0.12, size: 0.3 });

    const lvPath = [
      [-12.1, 1.55, 1.58], [-12.0, 1.2, 2.1], [-10.05, 0.95, 2.42],
      [-13.8, 0.85, 2.52], [-11.1, 0.95, 3.35], [-10.32, 1.1, 4.42]
    ];
    addCable(lvPath, 0.07, { color: 0x1a150b, key: 'lv', rings: false });
    addFlow(lvPath, 0xffd166, { key: 'lv', count: 9, speed: 0.14, size: 0.3 });

    const vsbInner = [
      [-9.8, 0.55, -3.35], [-9.4, 0.7, -1.0], [-9.7, 0.8, 2.6], [-10.3, 1.1, 4.4]
    ];
    addCable(vsbInner, 0.035, { color: 0x1a1226, key: 'vsb', rings: false });
    addFlow(vsbInner, 0xb58cff, { key: 'vsb', count: 6, speed: 0.1, size: 0.2 });

    // ─ detachable cables ─
    const atxPath = [
      [-10.3, 1.08, 4.45], [-9.1, 2.35, 4.55], [-7.3, 2.4, 4.0],
      [-5.5, 1.45, 3.15], [-4.62, 1.05, 2.6]
    ];
    addCable(atxPath, 0.115, { color: 0x0b1114, key: 'v12' });
    addFlow(atxPath, 0xffd166, { key: 'v12', count: 12, speed: 0.09, size: 0.42 });

    const vsbCable = [
      [-10.35, 0.9, 4.38], [-8.85, 1.35, 4.1], [-6.8, 1.35, 3.2],
      [-5.4, 0.95, 2.9], [-4.58, 0.86, 2.38]
    ];
    addCable(vsbCable, 0.048, { color: 0x160f23, key: 'vsb', rings: false });
    addFlow(vsbCable, 0xb58cff, { key: 'vsb', count: 6, speed: 0.1, size: 0.24 });

    const epsPath = [
      [-10.4, 1.2, -1.4], [-8.4, 2.9, -2.6], [-6.0, 3.65, -5.15],
      [-2.2, 3.25, -6.55], [0.55, 1.75, -6.0], [0.6, 1.12, -5.25]
    ];
    addCable(epsPath, 0.09, { color: 0x0b1012, key: 'v12' });
    addFlow(epsPath, 0xffd166, { key: 'v12', count: 13, speed: 0.1, size: 0.35 });

    const hpwrPath = [
      [-10.3, 1.2, 3.4], [-8.4, 2.55, 5.45], [-4.3, 3.55, 6.55],
      [1.6, 3.8, 6.9], [6.6, 3.35, 6.2], [8.95, 2.45, 4.45],
      [9.95, 1.9, 3.28]
    ];
    addCable(hpwrPath, 0.115, { color: 0x0a0f12, key: 'gpu' });
    addFlow(hpwrPath, 0xffd166, { key: 'gpu', count: 16, speed: 0.095, size: 0.4 });

    // ─ board power traces ─
    addTrace([bw(-2.9, 0.18, -4.95), bw(-3.9, 0.18, -4.0), bw(-5.2, 0.18, -3.0), bw(-4.2, 0.18, -2.55)], 0xffd166, 0.26, 0.022);
    addTrace([bw(-3.8, 0.18, -2.1), bw(-2.7, 0.18, -1.55), bw(-1.2, 0.18, -0.25), bw(-0.35, 0.18, -0.1)], 0x5ef2d6, 0.32, 0.024);
    addTrace([bw(-7.9, 0.18, 2.5), bw(-6.0, 0.18, 3.7), bw(1.0, 0.18, 3.0), bw(4.9, 0.18, 0.4)], 0xff9e64, 0.16, 0.016);
    addTrace([bw(6.35, 0.18, 3.1), bw(4.0, 0.18, 3.2), bw(1.2, 0.18, 3.1)], 0xffd166, 0.3, 0.022);
    addTrace([bw(-6.2, 0.18, 2.4), bw(-5.6, 0.18, 4.2), bw(-5.2, 0.18, 4.45)], 0x7dd3fc, 0.22, 0.014);
    addTrace([bw(3.6, 0.18, 5.0), bw(7.4, 0.18, 4.7)], 0x7dd3fc, 0.2, 0.015);

    const vrmFlowPath = [
      bw(-5.05, 0.2, -2.55), bw(-3.8, 0.2, -2.1), bw(-2.6, 0.2, -1.2), bw(-1.3, 0.2, -0.2), bw(-0.35, 0.2, -0.05)
    ];
    addFlow(vrmFlowPath, 0x5ef2d6, { key: 'vcore', count: 8, speed: 0.09, size: 0.28 });
    const gpuTraceFlow = [
      bw(6.35, 0.2, 3.1), bw(4.6, 0.2, 3.15), bw(2.7, 0.2, 3.1), bw(1.2, 0.2, 3.1)
    ];
    addFlow(gpuTraceFlow, 0xffd166, { key: 'gpu', count: 5, speed: 0.08, size: 0.24 });
    const ddrTrace = [
      bw(-7.8, 0.2, 2.5), bw(-5.2, 0.2, 3.4), bw(-0.5, 0.2, 2.7), bw(4.6, 0.2, 0.5)
    ];
    addFlow(ddrTrace, 0xc4a7ff, { key: 'dram', count: 9, speed: 0.07, size: 0.24 });

    // high-voltage / transformer halo
    const hvHalo = addGlowSprite(worldRoot, -11.5, 2.0, 1.8, 0xff8a4c, 3.6, 0.0);
    hvHalo.userData.hvHalo = true;
    animatables.hvHalo = hvHalo;
  }

  /* ── labels / markers ────────────────────────────────────────────── */
  const tmpV = new THREE.Vector3();
  const worldPos = new THREE.Vector3();

  function createLabelEl(className) {
    const b = document.createElement('button');
    b.className = 'scene-label ' + className;
    b.type = 'button';
    b.innerHTML = '<i class="label-dot"></i><i class="label-line"></i><span class="label-pill"></span>';
    ui.labels.appendChild(b);
    return b;
  }

  function buildLabels() {
    const macros = [
      { comp: 'ac-mains', text: 'AC 230V / 50Hz', anchor: [-16.2, 2.1, -5.9], color: '#ff8a4c', p: 8 },
      { comp: 'emi', text: 'EMI / 整流 / PFC', anchor: [-12.2, 3.55, -2.4], color: '#ff6b6b', p: 7 },
      { comp: 'transformer', text: 'LLC + 高频隔离', anchor: [-11.8, 3.7, 1.6], color: '#ffd166', p: 6 },
      { comp: 'sr-mos', text: '+12V 同步整流', anchor: [-10.0, 2.25, 2.55], color: '#ffd166', p: 5 },
      { comp: 'drmos', text: 'VRM 8 相', anchor: [1.6, 2.25, -2.45], color: '#5ef2d6', p: 9 },
      { comp: 'cpu', text: 'CPU / VCORE', anchor: [3.3, 1.85, 0.2], color: '#5ef2d6', p: 10 },
      { comp: 'ddr5', text: 'DDR5 / PMIC', anchor: [8.9, 3.25, 0.1], color: '#c4a7ff', p: 4 },
      { comp: 'gpu', text: 'GPU / 12V-2×6', anchor: [6.2, 2.75, 4.15], color: '#c4a7ff', p: 6 },
      { comp: 'nvme', text: 'NVMe / 3.3V', anchor: [-1.9, 1.1, 4.7], color: '#7dd3fc', p: 3 },
      { comp: 'pch', text: 'PCH / I/O', anchor: [10.9, 1.35, 4.8], color: '#7dd3fc', p: 2 }
    ];
    macros.forEach(m => {
      const node = createLabelEl('macro');
      node.querySelector('.label-pill').textContent = m.text;
      node.style.setProperty('--c', m.color);
      node.addEventListener('click', e => {
        e.stopPropagation();
        selectComponent(m.comp, { focus: true });
      });
      const entry = {
        el: node, anchor: new THREE.Vector3(...m.anchor), compId: m.comp,
        priority: m.p, visible: true, w: 80
      };
      macroLabels.push(entry);
    });

    labelSelected = createLabelEl('selected');
    labelSelected.style.setProperty('--c', '#5ef2d6');
    labelSelected.addEventListener('click', () => {
      if (state.selected) selectComponent(state.selected, { focus: true });
    });
    labelSelected.classList.add('hidden');
  }

  function setupMarkers() {
    const dummy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), basicMat(0x5ef2d6, { opacity: 0 }));
    dummy.visible = false;
    selectionHelper = new THREE.BoxHelper(dummy, 0x6ff7ff);
    selectionHelper.material.transparent = true;
    selectionHelper.material.opacity = 0.5;
    selectionHelper.material.depthTest = false;
    selectionHelper.renderOrder = 50;
    selectionHelper.visible = false;
    scene.add(selectionHelper);

    selectionRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.015, 6, 48),
      new THREE.MeshBasicMaterial({ color: 0x6ff7ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    selectionRing.rotation.x = Math.PI / 2;
    selectionRing.visible = false;
    scene.add(selectionRing);

    selectionGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX, color: 0x6ff7ff, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    selectionGlow.scale.set(1.7, 1.7, 1);
    selectionGlow.visible = false;
    scene.add(selectionGlow);

    hoverGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX, color: 0x9ffbff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    hoverGlow.scale.set(0.9, 0.9, 1);
    scene.add(hoverGlow);
  }

  function anchorWorld(comp, out) {
    comp.anchor.getWorldPosition(out || worldPos);
    return out || worldPos;
  }

  function applyHighlight(comp, active) {
    if (!comp) return;
    comp.baseMaterials.forEach(b => {
      if (!b.mat.emissive) return;
      if (active) {
        b.mat.emissive.setHex(0x47d9c6);
        b.mat.emissiveIntensity = Math.min(1.05, b.intensity + 0.05);
      } else {
        b.mat.emissive.setHex(b.emissive);
        b.mat.emissiveIntensity = b.intensity;
      }
    });
  }

  function setHover(id) {
    if (state.hovered === id) return;
    if (state.hovered && state.hovered !== state.selected) applyHighlight(compObjects.get(state.hovered), false);
    state.hovered = id;
    if (id && id !== state.selected) {
      const comp = compObjects.get(id);
      applyHighlight(comp, true);
      anchorWorld(comp);
      hoverGlow.position.copy(worldPos);
      hoverGlow.material.color.set(CATEGORIES[comp.data.cat].color);
      hoverGlow.material.opacity = 0.55;
    } else {
      hoverGlow.material.opacity = 0;
    }
    ui.canvas.classList.toggle('pointing', !!id);
    const tip = ui.hoverTip;
    if (id) {
      const d = COMP_MAP.get(id);
      const cat = CATEGORIES[d.cat];
      tip.style.setProperty('--c', cat.color);
      tip.innerHTML = `<span class="ht-cat">${cat.name} · ${d.code}</span><span class="ht-name">${d.name}</span><span class="ht-en">${d.en}</span><span class="ht-hint">点击查看供电作用</span>`;
      tip.classList.add('show');
    } else {
      tip.classList.remove('show');
    }
  }

  function positionHoverTip(x, y) {
    const w = 230, h = 100;
    let px = x + 18, py = y + 18;
    if (px + w > window.innerWidth - 10) px = x - w - 18;
    if (py + h > window.innerHeight - 10) py = y - h - 18;
    ui.hoverTip.style.left = px + 'px';
    ui.hoverTip.style.top = py + 'px';
  }

  /* ── camera orbit ────────────────────────────────────────────────── */
  const cam = {
    theta: 0.58, phi: 1.03, radius: 44,
    target: new THREE.Vector3(-1.1, 0.95, 0.2),
    goalTheta: 0.58, goalPhi: 1.03, goalRadius: 44,
    goalTarget: new THREE.Vector3(-1.1, 0.95, 0.2),
    minRadius: 12, maxRadius: 68
  };

  function setupCamera() {
    const mobile = window.innerWidth < 720;
    camera.fov = mobile ? 60 : 36;
    if (mobile) {
      cam.theta = cam.goalTheta = 0.58;
      cam.phi = cam.goalPhi = 1.0;
      cam.radius = cam.goalRadius = 50;
      cam.target.set(-1.3, 1.1, 0.2);
      cam.goalTarget.copy(cam.target);
    }
    camera.updateProjectionMatrix();
    updateCamera(0.016, true);
  }

  function updateCamera(dt, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 5.5);
    cam.theta = lerp(cam.theta, cam.goalTheta, k);
    cam.phi = lerp(cam.phi, cam.goalPhi, k);
    cam.radius = lerp(cam.radius, cam.goalRadius, k);
    cam.target.lerp(cam.goalTarget, k);
    const sp = Math.sin(cam.phi);
    camera.position.set(
      cam.target.x + cam.radius * sp * Math.sin(cam.theta),
      cam.target.y + cam.radius * Math.cos(cam.phi),
      cam.target.z + cam.radius * sp * Math.cos(cam.theta)
    );
    camera.lookAt(cam.target);
  }

  const views = {
    overview: { target: [-1.1, 0.95, 0.2], radius: 44, theta: 0.58, phi: 1.03 },
    psu: { target: [-12.0, 1.55, 0.2], radius: 21, theta: 0.38, phi: 1.0 },
    vrm: { target: [2.4, 1.15, -1.0], radius: 17, theta: 0.5, phi: 0.9 },
    gpu: { target: [6.2, 1.3, 3.3], radius: 19, theta: 0.72, phi: 0.93 }
  };

  function setView(name, manual = true) {
    if (name === 'explode') {
      toggleExplode();
      return;
    }
    const v = views[name];
    if (!v) return;
    cam.goalTarget.set(v.target[0], v.target[1], v.target[2]);
    cam.goalRadius = v.radius;
    cam.goalTheta = v.theta;
    cam.goalPhi = v.phi;
    if (manual) {
      state.autoCam = false;
      state.autoCamPaused = true;
      markInteraction();
      syncCameraButton();
    }
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('is-active', b.dataset.view === name && !state.exploded));
  }

  function cinematic(stage) {
    if (!state.autoCam) return;
    const map = {
      1: { target: [-11.9, 1.55, 0.2], radius: 22, theta: 0.42, phi: 1.0 },
      2: { target: [-11.6, 1.6, 1.0], radius: 23, theta: 0.48, phi: 0.98 },
      3: { target: [2.0, 1.15, -1.2], radius: 17, theta: 0.52, phi: 0.9 },
      4: { target: [6.2, 1.4, 3.1], radius: 20, theta: 0.74, phi: 0.94 },
      5: { target: [-0.8, 1.0, 0.3], radius: 42, theta: 0.62, phi: 1.01 }
    };
    const v = map[stage];
    if (!v) return;
    cam.goalTarget.set(v.target[0], v.target[1], v.target[2]);
    cam.goalRadius = v.radius;
    cam.goalTheta = v.theta;
    cam.goalPhi = v.phi;
    if (window.innerWidth < 720) {
      if (stage === 5) {
        cam.goalTarget.set(-1.3, 1.15, 0.2);
        cam.goalRadius = 50;
      } else {
        cam.goalRadius = Math.min(38, v.radius * 1.22);
      }
    }
  }

  function markInteraction() {
    state.lastInteraction = now();
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('is-active'));
  }

  function syncCameraButton() {
    const b = el('btn-camera');
    b.setAttribute('aria-pressed', state.autoCam ? 'true' : 'false');
  }

  /* ── UI construction ─────────────────────────────────────────────── */
  const railOrder = ['vsb', 'v12', 'v5', 'v33', 'vcore', 'vddr'];
  const railRanges = { vsb: 6, v12: 12.6, v5: 5.5, v33: 3.6, vcore: 1.35, vddr: 1.25 };
  const railRefs = new Map();
  const stageEls = [];
  let logTotal = 0;
  let activeView = 'overview';

  function buildRailList() {
    railOrder.forEach(key => {
      const meta = DATA.railMeta[key];
      const row = document.createElement('div');
      row.className = 'rail-item';
      row.style.setProperty('--c', meta.color);
      row.innerHTML = `<span class="rail-name">${meta.label}</span><div class="rail-track"><i></i></div><span class="rail-val"><b>0.00</b><small>${meta.unit}</small></span>`;
      ui.railList.appendChild(row);
      railRefs.set(key, {
        row, fill: row.querySelector('.rail-track i'), val: row.querySelector('.rail-val b')
      });
    });
  }

  function buildTimeline() {
    STAGES.forEach((stage, i) => {
      const b = document.createElement('button');
      b.className = 'tl-stage';
      b.type = 'button';
      b.dataset.stage = String(i);
      b.title = `${stage.code} ${stage.name}`;
      b.innerHTML = `<span class="tl-bar"><i class="tl-dot"></i><i class="tl-fill"></i></span><span class="tl-name">${stage.short}</span><span class="tl-code">${stage.code}</span>`;
      b.addEventListener('click', () => {
        if (i === 0) resetDemo();
        else if (!state.running) beginBoot(i);
        else {
          state.totalTime = STAGES.slice(0, i).reduce((a, s) => a + s.duration, 0);
          setStage(i);
        }
      });
      ui.timeline.appendChild(b);
      stageEls.push({ node: b, fill: b.querySelector('.tl-fill') });
    });
    for (let i = 0; i < 8; i++) {
      const d = document.createElement('i');
      ui.phaseDots.appendChild(d);
    }
  }

  function buildCategoryFilters() {
    const all = document.createElement('button');
    all.className = 'cat-filter active';
    all.dataset.cat = 'all';
    all.textContent = '全部 48';
    all.style.setProperty('--c', '#5ef2d6');
    ui.catFilters.appendChild(all);
    Object.keys(CATEGORIES).sort((a, b) => CATEGORIES[a].order - CATEGORIES[b].order).forEach(key => {
      const c = CATEGORIES[key];
      const count = COMPONENTS.filter(x => x.cat === key).length;
      const b = document.createElement('button');
      b.className = 'cat-filter';
      b.dataset.cat = key;
      b.textContent = `${c.name.replace(/\s+/g, '')} ${count}`;
      b.style.setProperty('--c', c.color);
      ui.catFilters.appendChild(b);
    });
    ui.catFilters.addEventListener('click', e => {
      const b = e.target.closest('.cat-filter');
      if (!b) return;
      ui.catFilters.querySelectorAll('.cat-filter').forEach(x => x.classList.toggle('active', x === b));
      drawerCat = b.dataset.cat;
      renderDrawer();
    });
  }

  let drawerCat = 'all';
  let drawerQuery = '';

  function renderDrawer() {
    const q = drawerQuery.trim().toLowerCase();
    const filtered = COMPONENTS.filter(c => {
      if (drawerCat !== 'all' && c.cat !== drawerCat) return false;
      if (!q) return true;
      const hay = `${c.name} ${c.en} ${c.code} ${c.rail} ${c.zone} ${c.role}`.toLowerCase();
      return hay.includes(q);
    });
    ui.searchCount.textContent = String(filtered.length);
    ui.drawerList.innerHTML = '';
    if (!filtered.length) {
      ui.drawerList.innerHTML = '<div class="no-results">NO COMPONENT FOUND<br><br>尝试其他关键词</div>';
      return;
    }
    const groups = {};
    filtered.forEach(c => (groups[c.cat] = groups[c.cat] || []).push(c));
    Object.keys(CATEGORIES).sort((a, b) => CATEGORIES[a].order - CATEGORIES[b].order).forEach(cat => {
      const items = groups[cat];
      if (!items) return;
      const meta = CATEGORIES[cat];
      const wrap = document.createElement('div');
      wrap.className = 'cat-group';
      wrap.innerHTML = `<div class="cat-group-head" style="--c:${meta.color}"><i></i>${meta.name} / ${meta.en}</div>`;
      items.forEach(c => {
        const b = document.createElement('button');
        b.className = 'component-row' + (state.selected === c.id ? ' active' : '');
        b.type = 'button';
        b.innerHTML = `<span class="comp-code">${c.code}</span><span class="comp-name"><b>${c.name}</b><small>${c.en} · ${c.rail}</small></span><span class="comp-arrow">›</span>`;
        b.addEventListener('click', () => {
          closeDrawer();
          selectComponent(c.id, { focus: true, tight: true });
        });
        wrap.appendChild(b);
      });
      ui.drawerList.appendChild(wrap);
    });
  }

  function openDrawer() {
    ui.drawer.classList.add('open');
    ui.drawerScrim.classList.add('open');
    ui.drawer.setAttribute('aria-hidden', 'false');
    state.autoCamPaused = true;
    setTimeout(() => ui.search.focus({ preventScroll: true }), 150);
    renderDrawer();
  }

  function closeDrawer() {
    ui.drawer.classList.remove('open');
    ui.drawerScrim.classList.remove('open');
    ui.drawer.setAttribute('aria-hidden', 'true');
  }

  function railColorFor(token) {
    const t = token.toUpperCase();
    if (t.includes('5VSB')) return '#b58cff';
    if (t.includes('VCORE')) return '#5ef2d6';
    if (t.includes('12V')) return '#ffd166';
    if (t.includes('3.3')) return '#ff9e64';
    if (t.includes('+5V') || t.includes('5V')) return '#ff7b72';
    if (t.includes('VDD') || t.includes('DDR')) return '#c4a7ff';
    if (t.includes('HV') || t.includes('390')) return '#ff6b6b';
    if (t.includes('AC')) return '#ff8a4c';
    if (t.includes('12')) return '#ffd166';
    return '#7dd3fc';
  }

  /* ── detail panel ────────────────────────────────────────────────── */
  function populateDetail(data) {
    const cat = CATEGORIES[data.cat];
    ui.detail.style.setProperty('--c', cat.color);
    ui.detailCat.textContent = cat.name;
    ui.detailCode.textContent = data.code;
    ui.detailName.textContent = data.name;
    ui.detailEn.textContent = data.en;
    ui.detailRole.textContent = data.role;
    ui.detailDesc.textContent = data.detail;
    ui.detailZone.textContent = data.zone;
    const stage = STAGES[data.stage];
    ui.detailStage.textContent = `参与阶段 ${stage.code} · ${stage.short}`;
    ui.detailRail.innerHTML = data.rail.split('/').map(x => x.trim()).filter(Boolean).map(x =>
      `<span class="rail-chip" style="--c:${railColorFor(x)}"><i></i>${x}</span>`
    ).join('');
    ui.detailSpecs.innerHTML = data.specs.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    ui.related.innerHTML = '';
    data.related.forEach(id => {
      const rel = COMP_MAP.get(id);
      if (!rel) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = rel.name;
      b.addEventListener('click', () => selectComponent(id, { focus: true, tight: true }));
      ui.related.appendChild(b);
    });
    ui.detailFocus.onclick = () => {
      if (!state.selected) return;
      const comp = compObjects.get(state.selected);
      if (comp) focusComponent(comp, true);
    };
    ui.detailRel.onclick = () => {
      const first = data.related.find(id => COMP_MAP.has(id));
      if (first) selectComponent(first, { focus: true, tight: true });
    };
  }

  function focusComponent(comp, tight = false) {
    anchorWorld(comp);
    cam.goalTarget.copy(worldPos);
    const mobile = window.innerWidth <= 720;
    if (mobile) {
      cam.goalTarget.y -= 3.2;
      cam.goalRadius = clamp(comp.focusRadius + 7, 21, 34);
    } else {
      cam.goalTarget.y += 0.25;
      const isTiny = ['primary', 'secondary', 'grid'].includes(comp.data.cat);
      cam.goalRadius = clamp(comp.focusRadius + (tight ? 0 : 5), isTiny ? 12 : 15, 38);
    }
    state.autoCam = false;
    state.autoCamPaused = true;
    syncCameraButton();
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('is-active'));
  }

  function selectComponent(id, opts = {}) {
    const comp = compObjects.get(id);
    const data = COMP_MAP.get(id);
    if (!comp || !data) return;
    setHover(null);
    if (state.selected && state.selected !== id) {
      const old = compObjects.get(state.selected);
      if (old) applyHighlight(old, false);
    }
    state.selected = id;
    state.autoCamPaused = true;
    applyHighlight(comp, true);
    anchorWorld(comp);
    selectionRing.position.set(worldPos.x, worldPos.y + 0.03, worldPos.z);
    selectionGlow.position.copy(worldPos);
    selectionRing.visible = true;
    selectionGlow.visible = true;
    selectionHelper.visible = true;
    selectionHelper.setFromObject(comp.group);
    populateDetail(data);
    ui.detail.classList.add('is-open');
    ui.detail.setAttribute('aria-hidden', 'false');
    ui.telemetry.classList.add('is-hidden');
    ui.telemetry.classList.remove('mobile-open');
    labelSelected.classList.remove('hidden');
    labelSelected.querySelector('.label-pill').textContent = data.name;
    labelSelected.style.setProperty('--c', CATEGORIES[data.cat].color);
    document.querySelectorAll('.component-row').forEach(r => {
      r.classList.toggle('active', r.querySelector('.comp-name b')?.textContent === data.name);
    });
    if (opts.focus) focusComponent(comp, opts.tight);
  }

  function deselectComponent() {
    if (!state.selected) return;
    const comp = compObjects.get(state.selected);
    if (comp) applyHighlight(comp, false);
    state.selected = null;
    if (state.hovered) {
      const hoveredComp = compObjects.get(state.hovered);
      if (hoveredComp) applyHighlight(hoveredComp, true);
    }
    ui.detail.classList.remove('is-open');
    ui.detail.setAttribute('aria-hidden', 'true');
    ui.telemetry.classList.remove('is-hidden');
    selectionRing.visible = false;
    selectionGlow.visible = false;
    selectionHelper.visible = false;
    labelSelected.classList.add('hidden');
    document.querySelectorAll('.component-row').forEach(r => r.classList.remove('active'));
  }

  /* ── audio ───────────────────────────────────────────────────────── */
  class Sfx {
    constructor() {
      this.enabled = false;
      this.ctx = null;
      this.master = null;
      this.humGain = null;
      this.fanGain = null;
      this.humStarted = false;
    }
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);

      const hum = this.ctx.createGain();
      hum.gain.value = 0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 220;
      hum.connect(lp); lp.connect(this.master);
      [60, 120].forEach((f, i) => {
        const o = this.ctx.createOscillator();
        o.type = i ? 'sine' : 'sawtooth';
        o.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.value = i ? 0.04 : 0.02;
        o.connect(g); g.connect(hum);
        o.start();
      });
      this.humGain = hum.gain;

      // filtered noise for fan / air
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf; noise.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 720; bp.Q.value = 0.5;
      const fg = this.ctx.createGain(); fg.gain.value = 0;
      noise.connect(bp); bp.connect(fg); fg.connect(this.master);
      noise.start();
      this.fanGain = fg.gain;
      this.humStarted = true;
    }
    async enable(on) {
      this.init();
      this.enabled = on;
      if (!this.ctx) return;
      await this.ctx.resume();
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(on ? 0.16 : 0, this.ctx.currentTime + 0.2);
      this.setRunning(state.running || state.online, state.display.fan);
    }
    setRunning(on, rpm) {
      if (!this.ctx || !this.humStarted) return;
      const t = this.ctx.currentTime;
      this.humGain.cancelScheduledValues(t);
      this.humGain.linearRampToValueAtTime(on ? 0.65 : 0, t + 0.7);
      this.fanGain.linearRampToValueAtTime(on ? clamp(rpm / 1600, 0.02, 0.4) * 0.3 : 0, t + 1.0);
    }
    updateFan(rpm) {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      this.fanGain.linearRampToValueAtTime(state.running || state.online ? clamp(rpm / 2400, 0.01, 0.3) : 0, t + 0.2);
    }
    click() {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(780, t);
      o.frequency.exponentialRampToValueAtTime(390, t + 0.12);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
    }
    relay() {
      if (!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const len = this.ctx.sampleRate * 0.04;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = this.ctx.createGain(); g.gain.value = 0.22;
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    }
  }
  const sfx = new Sfx();

  /* ── boot state machine ──────────────────────────────────────────── */
  const totalBootDuration = STAGES.reduce((a, s) => a + s.duration, 0);
  const firedEvents = new Set();
  let lastSpark = 0;
  let lastScope = 0;
  let lastUi = 0;
  let lastLabel = 0;
  let lastBox = 0;
  let firstFrame = true;

  const STAGE_EVENTS = {
    1: [
      { t: 0.2, text: 'PWR_BTN# → LOW · PCH 待机逻辑唤醒', cls: 'warn' },
      { t: 0.8, text: 'PS_ON# → LOW · PSU 从 5VSB 唤醒' },
      { t: 1.35, text: '继电器闭合 · NTC 浪涌旁路' },
      { t: 1.95, text: 'PFC 母线 0 → 390V · LLC 软启动', cls: 'warn' }
    ],
    2: [
      { t: 0.25, text: 'PFC 稳定 391V · LLC 开关频率 98.4kHz' },
      { t: 0.85, text: '+12V 12.04V · +5V 5.02V · +3.3V 3.31V' },
      { t: 1.45, text: 'PWR_OK ↑ · 主板释放上电时序', cls: 'ok' },
      { t: 2.05, text: '24-pin / EPS 主轨就绪 · 待 VRM 使能' }
    ],
    3: [
      { t: 0.2, text: 'VRM_EN ↑ · 8 相控制器就绪' },
      { t: 0.8, text: 'DrMOS 相序 1→8 · 动态均流校准' },
      { t: 1.45, text: 'VCORE 0.900V → 1.180V · AVFS 请求', cls: 'ok' },
      { t: 2.0, text: 'CPU RESET# ↑ · 100MHz BCLK 稳定', cls: 'ok' }
    ],
    4: [
      { t: 0.3, text: 'DDR5 内存训练 · 5600 MT/s / 1.10V' },
      { t: 1.0, text: 'PCIe 5.0 x16 链路训练完成' },
      { t: 1.6, text: 'NVMe 枚举 · 启动设备识别' },
      { t: 2.2, text: 'POST 0xA0 · 显示输出初始化', cls: 'ok' }
    ],
    5: [
      { t: 0.25, text: 'OS LOADER · 内核解压' },
      { t: 0.95, text: '电源管理接管 · SVID 动态调压' },
      { t: 1.6, text: '风扇曲线上线 · 封装温度 42°C' },
      { t: 2.25, text: 'SYSTEM ONLINE · 全部电压轨正常', cls: 'ok' }
    ]
  };

  function pad(n, len = 2) { return String(n).padStart(len, '0'); }
  function simTime(sec) {
    const ms = Math.max(0, Math.floor(sec * 1000));
    const m = Math.floor(ms / 60000);
    const s = Math.floor(ms / 1000) % 60;
    const milli = ms % 1000;
    return `T+${pad(m)}:${pad(s)}.${pad(milli, 3)}`;
  }

  function addLog(text, cls = '') {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.innerHTML = `<time>${simTime(state.running || state.online ? state.totalTime : 0)}</time><span></span>`;
    p.querySelector('span').textContent = text;
    ui.logLines.appendChild(p);
    while (ui.logLines.children.length > 8) ui.logLines.removeChild(ui.logLines.firstElementChild);
    logTotal++;
    ui.logCount.textContent = `${logTotal} EVENTS`;
    ui.logLines.scrollTop = ui.logLines.scrollHeight;
    if (state.running) sfx.lastLog = text;
  }

  function clearLogs() {
    ui.logLines.innerHTML = '';
    logTotal = 0;
    ui.logCount.textContent = '0 EVENTS';
  }

  function syncPowerControls() {
    const running = state.running;
    const online = state.online;
    ui.powerBtn.dataset.online = online ? 'true' : 'false';
    if (running) {
      ui.powerAction.textContent = '中止演示';
      ui.powerSub.textContent = 'ABORT · SPACE';
      ui.powerLabel.textContent = 'POWER SEQUENCE';
      ui.statusText.textContent = `BOOT · S${state.stage}`;
      ui.statusChip.dataset.state = 'boot';
    } else if (online) {
      ui.powerAction.textContent = '重新演示';
      ui.powerSub.textContent = 'RE-RUN · SPACE';
      ui.powerLabel.textContent = 'SYSTEM ONLINE';
      ui.statusText.textContent = 'ONLINE · ALL RAILS';
      ui.statusChip.dataset.state = 'online';
    } else {
      ui.powerAction.textContent = '启动系统';
      ui.powerSub.textContent = 'PRESS SPACE';
      ui.powerLabel.textContent = 'SYSTEM POWER';
      ui.statusText.textContent = 'STANDBY · 5VSB';
      ui.statusChip.dataset.state = 'standby';
    }
    ui.btnSkip.disabled = !running;
    ui.btnReset.disabled = !running && !online;
  }

  function setStage(n, opts = {}) {
    n = clamp(n, 0, STAGES.length - 1);
    state.stage = n;
    state.stageTime = 0;
    const stage = STAGES[n];
    state.targets = Object.assign({}, stage.targets);
    state.targetDisplay = { power: stage.power, temp: stage.temp, fan: stage.fan };
    state.activePhases = n < 3 ? 0 : n === 3 ? 1 : 8;
    ui.capCode.textContent = stage.code;
    ui.capText.textContent = stage.caption;
    syncPowerControls();
    if (opts.log !== false && n > 0) {
      addLog(`${stage.code} · ${stage.name}`, n === 5 ? 'ok' : '');
    }
    if (n === 1) {
      sfx.relay();
    }
    if (state.running && state.autoCam) cinematic(n);
    if (n === 5 && !state.running) {
      ui.statusText.textContent = 'ONLINE · ALL RAILS';
      ui.statusChip.dataset.state = 'online';
    }
  }

  function beginBoot(startAt = 1) {
    if (state.running) return;
    state.running = true;
    state.online = false;
    state.stageTime = 0;
    state.totalTime = STAGES.slice(0, Math.max(1, startAt)).reduce((a, s) => a + s.duration, 0);
    firedEvents.clear();
    if (ui.drawer.classList.contains('open')) closeDrawer();
    if (ui.helpScrim.classList.contains('open')) closeHelp();
    clearLogs();
    Object.assign(state.rails, { v12: 0, v5: 0, v33: 0, vcore: 0, vsoc: 0, vddr: 0, hv: 0 });
    state.display.power = 1.8;
    addLog('BOOT SEQUENCE · PWR_BTN 触发');
    if (startAt > 1) addLog(`JUMP → ${STAGES[startAt].code} · ${STAGES[startAt].name}`, 'warn');
    setStage(startAt, { log: true });
    syncPowerControls();
    sfx.click();
    sfx.setRunning(true, 600);
    if (state.autoCam) cinematic(startAt);
    showToast('虚拟启动开始 · 观察供电逐级建立');
  }

  function finishBoot() {
    state.running = false;
    state.online = true;
    state.stage = 5;
    state.stageTime = STAGES[5].duration;
    state.totalTime = totalBootDuration;
    state.targets = Object.assign({}, STAGES[5].targets);
    state.targetDisplay = { power: STAGES[5].power, temp: STAGES[5].temp, fan: STAGES[5].fan };
    state.activePhases = 8;
    addLog('SYSTEM ONLINE · OS 接管电源管理', 'ok');
    addLog('ALL RAILS NOMINAL · 演示完成', 'ok');
    syncPowerControls();
    if (state.autoCam) cinematic(5);
    sfx.click();
    sfx.setRunning(true, STAGES[5].fan);
    showToast('启动完成 · SYSTEM ONLINE');
  }

  function resetDemo(silent = false) {
    const wasRunning = state.running || state.online;
    state.running = false;
    state.online = false;
    state.stage = 0;
    state.stageTime = 0;
    state.totalTime = 0;
    state.targets = Object.assign({}, STAGES[0].targets);
    state.targetDisplay = { power: STAGES[0].power, temp: STAGES[0].temp, fan: 0 };
    state.activePhases = 0;
    firedEvents.clear();
    ui.capCode.textContent = STAGES[0].code;
    ui.capText.textContent = STAGES[0].caption;
    syncPowerControls();
    if (wasRunning) addLog('SYSTEM RESET · 主轨放电，5VSB 保持', 'warn');
    sfx.setRunning(false, 0);
    if (state.autoCam) setView('overview', false);
    if (!silent) showToast('已回到待机 · 5VSB 保持');
  }

  function togglePower() {
    if (state.running) {
      resetDemo();
    } else if (state.online) {
      resetDemo(true);
      beginBoot(1);
    } else {
      beginBoot(1);
    }
  }

  function skipBoot() {
    if (!state.running) return;
    state.targets = Object.assign({}, STAGES[5].targets);
    state.targetDisplay = { power: STAGES[5].power, temp: STAGES[5].temp, fan: STAGES[5].fan };
    addLog('⏩ 快进至 S5 · 跳过逐级演示', 'warn');
    finishBoot();
  }

  function fireStageEvents() {
    const events = STAGE_EVENTS[state.stage] || [];
    events.forEach((e, i) => {
      const key = `${state.stage}:${i}`;
      if (!firedEvents.has(key) && state.stageTime >= e.t) {
        firedEvents.add(key);
        addLog(e.text, e.cls || '');
        if (e.cls === 'ok') sfx.click();
      }
    });
  }

  function updateBoot(dt) {
    if (!state.running) return;
    state.totalTime += dt;
    state.stageTime += dt;
    const stage = STAGES[state.stage];
    fireStageEvents();
    if (state.stage >= 1 && state.stageTime >= stage.duration) {
      if (state.stage < 5) {
        setStage(state.stage + 1, { log: true });
      } else {
        finishBoot();
      }
    }
  }

  /* ── telemetry ───────────────────────────────────────────────────── */
  function updateRails(dt) {
    const keys = ['v12', 'v5', 'v33', 'vcore', 'vsoc', 'vddr'];
    const k = 1 - Math.exp(-dt * 3.4);
    keys.forEach(key => {
      state.rails[key] = lerp(state.rails[key], state.targets[key] || 0, k);
      if (Math.abs(state.rails[key] - (state.targets[key] || 0)) < 0.0005) state.rails[key] = state.targets[key] || 0;
    });
    state.rails.hv = lerp(state.rails.hv, state.stage >= 1 ? 391 : 0, 1 - Math.exp(-dt * 2.2));
    state.rails.ac = 230;
    state.rails.vsb = 5.02;
    const dk = 1 - Math.exp(-dt * 2.5);
    state.display.power = lerp(state.display.power, state.targetDisplay.power, dk);
    state.display.temp = lerp(state.display.temp, state.targetDisplay.temp, dk);
    state.display.fan = lerp(state.display.fan, state.targetDisplay.fan, dk);
    state.activePhases = state.stage < 3 ? 0 : state.stage === 3 ? clamp(1 + Math.floor(state.stageTime / 0.17), 0, 8) : 8;
  }

  function updateTelemetry(dt) {
    const t = now();
    if (t - lastUi < 0.075) return;
    lastUi = t;
    railOrder.forEach(key => {
      const ref = railRefs.get(key);
      if (!ref) return;
      const v = state.rails[key];
      const meta = DATA.railMeta[key];
      ref.val.textContent = fmt(v, meta.digits);
      ref.fill.style.width = clamp((v / railRanges[key]) * 100, 0, 100) + '%';
    });
    ui.powerValue.innerHTML = `${Math.max(0, Math.round(state.display.power))}<span>W</span>`;
    ui.miniVcore.innerHTML = `${fmt(state.rails.vcore, 3)}<small>V</small>`;
    ui.miniTemp.innerHTML = `${Math.round(state.display.temp)}<small>°C</small>`;
    ui.miniFan.innerHTML = `${Math.round(state.display.fan)}<small>rpm</small>`;
    ui.postCode.textContent = STAGES[state.stage].debug;
    ui.phaseCount.textContent = `${state.activePhases} / 8`;
    [...ui.phaseDots.children].forEach((d, i) => d.classList.toggle('on', i < state.activePhases));
    ui.scopeMode.textContent = STAGES[state.stage].en;
    ui.clock.textContent = simTime(state.totalTime);
    ui.timelineTime.textContent = simTime(state.totalTime).replace(/(\.\d)\d{2}$/, '$1');
    document.body.classList.toggle('cinematic', state.running || !!state.selected || state.exploded);
    stageEls.forEach((s, i) => {
      const done = state.online || i < state.stage;
      const active = state.running && i === state.stage;
      s.node.classList.toggle('is-done', done);
      s.node.classList.toggle('is-active', active);
      let pct = 0;
      if (done) pct = 100;
      else if (active && STAGES[i].duration > 0) pct = clamp(state.stageTime / STAGES[i].duration * 100, 0, 100);
      s.fill.style.width = pct + '%';
    });
    if (t - lastSpark > 0.18) {
      lastSpark = t;
      [...ui.powerSpark.children].forEach((bar, i) => {
        const base = state.running || state.online ? 20 + Math.random() * 80 : 12 + Math.random() * 15;
        bar.style.height = base + '%';
        bar.style.opacity = 0.25 + base / 140;
      });
    }
  }

  function drawScope(t) {
    const c = ui.scope;
    const g = c.getContext('2d');
    const w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(3,8,12,.35)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(110,170,185,.1)';
    g.lineWidth = 1;
    for (let x = 0; x <= w; x += w / 12) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    for (let y = 0; y <= h; y += h / 5) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    const high = state.stage >= 2;
    const v12 = state.rails.v12;
    const vc = state.rails.vcore;
    const phase = t * 1.8;
    const drawWave = (color, baseY, amp, freq, active, glow) => {
      g.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const n = active ? Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 5.1 + phase * 1.8) * amp * 0.14 : 0;
        const y = baseY + n;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.strokeStyle = color;
      g.lineWidth = 1.35;
      g.shadowBlur = glow ? 7 : 0;
      g.shadowColor = color;
      g.stroke();
      g.shadowBlur = 0;
    };
    drawWave('rgba(255,209,102,.9)', 142 - clamp(v12 / 12.6, 0, 1) * 78, high ? 1.6 : 0.15, 0.07, high, high);
    drawWave('rgba(94,242,214,.9)', 155 - clamp(vc / 1.35, 0, 1) * 76, vc > 0.1 ? 1.2 : 0.1, 0.11, vc > 0.1, vc > 0.1);

    // PWR_OK digital
    g.beginPath();
    const pgY = high ? 33 : 66;
    g.moveTo(0, pgY); g.lineTo(w, pgY);
    g.strokeStyle = high ? 'rgba(181,140,255,.9)' : 'rgba(181,140,255,.28)';
    g.lineWidth = 1.2;
    g.shadowBlur = high ? 6 : 0;
    g.shadowColor = '#b58cff';
    g.stroke();
    g.shadowBlur = 0;

    // moving scan
    const sx = ((t * 38) % w);
    const grd = g.createLinearGradient(sx - 28, 0, sx + 3, 0);
    grd.addColorStop(0, 'rgba(94,231,255,0)');
    grd.addColorStop(1, 'rgba(94,231,255,.12)');
    g.fillStyle = grd;
    g.fillRect(sx - 28, 0, 31, h);
    g.strokeStyle = 'rgba(94,231,255,.28)';
    g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, h); g.stroke();

    g.font = '9px Consolas, monospace';
    g.fillStyle = 'rgba(255,209,102,.55)'; g.fillText('+12V', 8, 18);
    g.fillStyle = 'rgba(94,242,214,.55)'; g.fillText('VCORE', 8, 31);
    g.fillStyle = 'rgba(181,140,255,.55)'; g.fillText('PWR_OK', 8, 44);
  }

  /* ── scene animation ─────────────────────────────────────────────── */
  function updateFlows(dt, t) {
    const s = state.stage;
    const targets = {
      ac: 0.6,
      hv: s >= 1 ? 0.9 : 0.08,
      lv: s >= 2 ? 0.95 : s === 1 ? 0.35 : 0,
      vsb: 0.85,
      v12: clamp(state.rails.v12 / 12, 0, 1),
      gpu: s >= 4 ? 0.9 : 0,
      vcore: clamp(state.rails.vcore / 1.17, 0, 1),
      dram: s >= 4 ? 0.65 : 0
    };
    flowSystems.forEach((f, fi) => {
      const target = targets[f.key] === undefined ? 0 : targets[f.key];
      f.intensity = lerp(f.intensity, target, 1 - Math.exp(-dt * 2.3));
      f.mat.opacity = f.intensity * (f.pulse ? 0.78 + Math.sin(t * 5 + fi) * 0.12 : 1);
      f.group.visible = f.intensity > 0.015 && !state.exploded;
      if (!f.group.visible) return;
      for (let i = 0; i < f.sprites.length; i++) {
        const p = (i / f.sprites.length + f.offset + t * f.speed) % 1;
        const pos = f.curve.getPoint(p);
        f.sprites[i].position.set(pos.x, pos.y + Math.sin(t * 4 + i) * 0.008, pos.z);
        const sc = f.size * (0.76 + 0.22 * Math.sin(t * 6 + i * 1.7));
        f.sprites[i].scale.set(sc, sc, 1);
      }
    });
    cableMaterials.forEach(c => {
      const target = targets[c.key] === undefined ? 0 : targets[c.key];
      c.mat.emissiveIntensity = 0.03 + target * 0.24;
    });
    if (animatables.hvHalo) {
      animatables.hvHalo.material.opacity = s >= 1 ? 0.08 + Math.sin(t * 2.6) * 0.025 : 0;
    }
    traceGroup.visible = !state.exploded;
  }

  function updateAnimated(dt, t) {
    const psuRpm = state.stage >= 1 ? STAGES[state.stage].fan : 0;
    const gpuRpm = state.stage >= 4 ? STAGES[state.stage].fan * 1.08 : 0;
    const psuRotor = compObjects.get('psu-fan')?.fanRotor;
    const gpuSet = animatables.gpuFans || [];
    animatables.fans.forEach(entry => {
      const isGpu = gpuSet.indexOf(entry.rotor) !== -1;
      const targetRpm = isGpu ? gpuRpm : psuRpm;
      const targetSpeed = targetRpm / 60 * TAU * 0.045;
      entry.speed = lerp(entry.speed, targetSpeed, 1 - Math.exp(-dt * 1.5));
      entry.rotor.rotation.y += dt * entry.speed;
    });
    // RGB drift
    animatables.rgb.forEach((m, i) => {
      if (state.stage >= 4 || state.online) {
        const hue = (t * 0.018 + i * 0.12) % 1;
        m.emissive.setHSL(hue, 0.82, 0.55);
        m.emissiveIntensity = 0.75 + Math.sin(t * 2 + i) * 0.15;
      } else if (state.stage >= 1) {
        m.emissive.setHex(0x2fa99b); m.emissiveIntensity = 0.25;
      } else {
        m.emissive.setHex(0x153f42); m.emissiveIntensity = 0.14;
      }
    });
    // phase LEDs
    const pLeds = compObjects.get('drmos')?.phaseLeds || [];
    pLeds.forEach((led, i) => {
      const on = i < state.activePhases;
      led.material.color.setHex(on ? 0x5ef2d6 : 0x1b2b2d);
      led.material.opacity = on ? 1 : 0.6;
    });
    // debug LEDs
    debugLeds.forEach((led, i) => {
      const on = i < Math.min(4, state.stage + 1);
      led.material.color.setHex(on ? (state.stage >= 4 ? 0x5ef2d6 : 0xff9e64) : 0x2a1414);
    });
    // AIO / CPU glow
    const cpuGlow = compObjects.get('cpu')?.cpuGlow;
    if (cpuGlow) cpuGlow.material.opacity = state.stage >= 3 ? 0.16 + Math.sin(t * 3.3) * 0.04 : 0;
    if (animatables.cpuFrameMat) {
      animatables.cpuFrameMat.opacity = state.stage >= 3 ? 0.36 + Math.sin(t * 2.8) * 0.1 : 0.14;
    }
    // power button halo
    animatables.leds.forEach(l => {
      if (l.pulse && l.mesh.material && l.mesh.material.emissive) {
        l.mesh.material.emissiveIntensity = state.online ? 0.7 + Math.sin(t * 2.5) * 0.25 : 1.15 + Math.sin(t * 2.2) * 0.35;
      }
    });
    if (animatables.atmosphere) {
      animatables.atmosphere.rotation.y = t * 0.006;
      animatables.atmosphere.position.y = Math.sin(t * 0.1) * 0.12;
    }
    if (Math.abs(state.display.fan - psuRpm) > 1) sfx.updateFan(state.display.fan);
  }

  function updateExplosion(dt) {
    const k = 1 - Math.exp(-dt * 5);
    const hasExplode = state.exploded;
    compObjects.forEach(comp => {
      const target = hasExplode ? comp.explode : new THREE.Vector3(0, 0, 0);
      comp.group.position.lerp(target, k);
    });
    psuChassisMats.forEach(m => {
      m.opacity = lerp(m.opacity, hasExplode ? 0.012 : 0.055, k);
    });
    if (cableGroup) cableGroup.visible = !hasExplode;
    if (state.selected) {
      const comp = compObjects.get(state.selected);
      if (comp) {
        anchorWorld(comp);
        selectionRing.position.set(worldPos.x, worldPos.y + 0.03, worldPos.z);
        selectionGlow.position.copy(worldPos);
      }
    }
  }

  function toggleExplode() {
    state.exploded = !state.exploded;
    if (state.exploded) {
      let index = 0;
      compObjects.forEach(comp => {
        const i = index++;
        const a = comp.anchor.position;
        const isPSU = comp.group.parent === psuRoot;
        if (isPSU) {
          comp.explode.set(a.x * 0.08, 0.22 + (i % 4) * 0.13, a.z * 0.2);
        } else {
          let lift = 0.72 + (i % 5) * 0.13;
          if (comp.id === 'cpu' || comp.id === 'gpu') lift += 0.42;
          comp.explode.set(a.x * 0.045, lift, a.z * 0.06);
        }
      });
      showToast('分解视图 · 器件逐层脱离装配');
    } else {
      showToast('装配视图 · 回到整机结构');
    }
    document.querySelectorAll('.view-btn').forEach(b => {
      b.classList.toggle('is-active', b.dataset.view === 'explode' ? state.exploded : false);
    });
    if (state.autoCam) {
      cam.goalTarget.set(-1.1, 1.7, 0.2);
      cam.goalRadius = 42;
    }
  }

  function updateLabels(force = false) {
    const t = now();
    if (!force && t - lastLabel < 0.05) return;
    lastLabel = t;
    const w = window.innerWidth, h = window.innerHeight;
    const kept = [];
    if (state.labels) {
      macroLabels
        .slice()
        .sort((a, b) => b.priority - a.priority)
        .forEach(l => {
          l.anchor.clone().project(camera);
          const p = l.anchor.clone().project(camera);
          const x = (p.x * 0.5 + 0.5) * w;
          const y = (-p.y * 0.5 + 0.5) * h;
          const inView = p.z > -1 && p.z < 1 && x > 10 && x < w - 10 && y > 78 && y < h - 20;
          if (!inView) {
            l.el.classList.add('hidden');
            l.el.classList.remove('visible');
            return;
          }
          const lw = l.w || 100;
          const box = { x: x - 2, y: y - 12, w: lw + 8, h: 25 };
          const collide = kept.some(k => !(box.x + box.w < k.x || box.x > k.x + k.w || box.y + box.h < k.y || box.y > k.y + k.h));
          if (collide && state.selected !== l.compId) {
            l.el.classList.add('hidden');
            l.el.classList.remove('visible');
            return;
          }
          kept.push(box);
          l.el.classList.remove('hidden');
          l.el.classList.add('visible');
          l.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(0, -50%)`;
          l.el.classList.toggle('active', state.selected === l.compId);
          if (!l.w) l.w = Math.max(80, l.el.offsetWidth);
        });
    } else {
      macroLabels.forEach(l => { l.el.classList.add('hidden'); l.el.classList.remove('visible'); });
    }
    if (state.selected && state.labels) {
      const comp = compObjects.get(state.selected);
      if (comp) {
        anchorWorld(comp);
        const p = worldPos.clone().project(camera);
        const x = (p.x * 0.5 + 0.5) * w;
        const y = (-p.y * 0.5 + 0.5) * h;
        labelSelected.classList.remove('hidden');
        labelSelected.classList.add('visible');
        labelSelected.style.transform = `translate3d(${x}px, ${y - 18}px, 0) translate(0, -50%)`;
      }
    } else {
      labelSelected.classList.add('hidden');
      labelSelected.classList.remove('visible');
    }
  }

  function updateSelection(dt, t) {
    if (!state.selected) { hoverGlow.material.opacity = 0; return; }
    const comp = compObjects.get(state.selected);
    if (!comp) return;
    anchorWorld(comp);
    selectionRing.position.set(worldPos.x, worldPos.y + 0.03, worldPos.z);
    selectionGlow.position.copy(worldPos);
    const pulse = 1 + Math.sin(t * 3.5) * 0.12;
    selectionRing.scale.set(pulse, pulse, 1);
    selectionRing.material.opacity = 0.45 + Math.sin(t * 3.5) * 0.18;
    selectionGlow.material.opacity = 0.35 + Math.sin(t * 2.6) * 0.1;
    if (t - lastBox > 0.09) {
      lastBox = t;
      comp.group.updateMatrixWorld(true);
      selectionHelper.setFromObject(comp.group);
    }
    if (state.hovered) {
      const hc = compObjects.get(state.hovered);
      if (hc) {
        anchorWorld(hc);
        hoverGlow.position.copy(worldPos);
        hoverGlow.material.opacity = 0.38 + Math.sin(t * 4) * 0.12;
      }
    }
  }

  /* ── interaction ─────────────────────────────────────────────────── */
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  let dragStart = null;
  let hoverCheck = 0;

  function pickAt(clientX, clientY) {
    const rect = ui.canvas.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    for (let i = 0; i < hits.length; i++) {
      const id = hits[i].object.userData.componentId;
      if (id && compObjects.has(id)) return id;
    }
    return null;
  }

  function setupCanvasEvents() {
    const canvas = ui.canvas;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      cam.goalRadius = clamp(cam.goalRadius * (1 + e.deltaY * 0.0011), cam.minRadius, cam.maxRadius);
      state.autoCam = false;
      state.autoCamPaused = true;
      syncCameraButton();
      markInteraction();
    }, { passive: false });

    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      canvas.setPointerCapture(e.pointerId);
      state.pointerDown = true;
      state.dragged = false;
      state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      if (state.activePointers.size === 1) dragStart = { x: e.clientX, y: e.clientY };
      if (state.activePointers.size === 2) {
        const p = [...state.activePointers.values()];
        state.pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      }
      canvas.classList.add('dragging');
      markInteraction();
    });

    canvas.addEventListener('pointermove', e => {
      const entry = state.activePointers.get(e.pointerId);
      if (state.pointerDown && state.activePointers.size === 1 && entry) {
        const dx = e.clientX - entry.x;
        const dy = e.clientY - entry.y;
        entry.x = e.clientX; entry.y = e.clientY;
        if (Math.hypot(e.clientX - entry.sx, e.clientY - entry.sy) > 5) state.dragged = true;
        if (state.dragged) {
          cam.goalTheta -= dx * 0.006;
          cam.goalPhi = clamp(cam.goalPhi - dy * 0.0048, 0.22, 1.43);
          state.autoCam = false;
          state.autoCamPaused = true;
          syncCameraButton();
          setHover(null);
          ui.hoverTip.classList.remove('show');
        }
        markInteraction();
        return;
      }
      if (state.pointerDown && state.activePointers.size === 2) {
        const p = [...state.activePointers.values()];
        if (entry) { entry.x = e.clientX; entry.y = e.clientY; }
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (state.pinchDist > 0) {
          cam.goalRadius = clamp(cam.goalRadius * (state.pinchDist / d), cam.minRadius, cam.maxRadius);
        }
        state.pinchDist = d;
        state.dragged = true;
        return;
      }
      if (state.pointerDown) return;
      // hover
      const t = now();
      if (t - hoverCheck < 0.042) return;
      hoverCheck = t;
      const id = pickAt(e.clientX, e.clientY);
      setHover(id);
      positionHoverTip(e.clientX, e.clientY);
    });

    const finishPointer = e => {
      const wasClick = !state.dragged && state.activePointers.size === 1;
      state.activePointers.delete(e.pointerId);
      if (state.activePointers.size === 0) {
        state.pointerDown = false;
        canvas.classList.remove('dragging');
        if (wasClick) {
          const id = pickAt(e.clientX, e.clientY);
          if (id) selectComponent(id, { focus: true });
          else deselectComponent();
        }
      }
      state.pinchDist = 0;
    };
    canvas.addEventListener('pointerup', finishPointer);
    canvas.addEventListener('pointercancel', finishPointer);
    canvas.addEventListener('pointerleave', () => {
      if (!state.pointerDown) {
        setHover(null);
        ui.hoverTip.classList.remove('show');
      }
    });
  }

  function setupKeyboard() {
    document.addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePower();
      } else if (e.key === 'Escape') {
        if (ui.helpScrim.classList.contains('open')) closeHelp();
        else if (ui.drawer.classList.contains('open')) closeDrawer();
        else deselectComponent();
      } else if (e.key.toLowerCase() === 'r') {
        resetDemo();
      } else if (e.key.toLowerCase() === 'e') {
        toggleExplode();
      } else if (e.key.toLowerCase() === 'l') {
        ui.drawer.classList.contains('open') ? closeDrawer() : openDrawer();
      } else if (e.key.toLowerCase() === 'h') {
        openHelp();
      } else if (e.key.toLowerCase() === 'm') {
        toggleSound();
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      } else if (e.key.toLowerCase() === 't') {
        state.labels = !state.labels;
        showToast(state.labels ? '场景标签已显示' : '场景标签已隐藏');
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        setView(['overview', 'psu', 'vrm', 'gpu'][Number(e.key) - 1]);
      }
    });
  }

  function toggleSound() {
    state.sound = !state.sound;
    sfx.enable(state.sound);
    el('btn-sound').setAttribute('aria-pressed', state.sound ? 'true' : 'false');
    el('sound-label').textContent = state.sound ? '声音' : '静音';
    showToast(state.sound ? '声音已开启 · 继电器 / 风扇 / 电流声' : '声音已关闭');
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
  }

  function openHelp() {
    ui.helpScrim.classList.add('open');
    state.autoCamPaused = true;
    ui.helpScrim._open = true;
  }
  function closeHelp() {
    ui.helpScrim.classList.remove('open');
    ui.helpScrim._open = false;
  }

  /* ── UI setup / events ───────────────────────────────────────────── */
  function setupUI() {
    buildRailList();
    buildTimeline();
    buildCategoryFilters();
    renderDrawer();
    applyStageInitial();
    setupCanvasEvents();
    setupKeyboard();

    el('power-btn').addEventListener('click', togglePower);
    ui.statusChip.addEventListener('click', () => {
      if (window.innerWidth <= 1120) {
        ui.telemetry.classList.toggle('mobile-open');
      }
    });
    el('telemetry-close').addEventListener('click', () => ui.telemetry.classList.remove('mobile-open'));
    el('btn-reset').addEventListener('click', () => resetDemo());
    el('btn-skip').addEventListener('click', skipBoot);
    el('btn-library').addEventListener('click', openDrawer);
    el('catalog-fab').addEventListener('click', openDrawer);
    el('drawer-close').addEventListener('click', closeDrawer);
    el('drawer-scrim').addEventListener('click', closeDrawer);
    el('detail-close').addEventListener('click', deselectComponent);
    el('btn-help').addEventListener('click', openHelp);
    el('help-close').addEventListener('click', closeHelp);
    el('help-ok').addEventListener('click', closeHelp);
    el('help-scrim').addEventListener('click', e => { if (e.target === ui.helpScrim) closeHelp(); });
    el('btn-fullscreen').addEventListener('click', toggleFullscreen);
    el('btn-sound').addEventListener('click', toggleSound);
    el('btn-camera').addEventListener('click', () => {
      state.autoCam = !state.autoCam;
      state.autoCamPaused = !state.autoCam;
      syncCameraButton();
      if (state.autoCam) {
        if (state.running || state.online) cinematic(state.stage);
        else setView('overview', false);
        showToast('自动运镜已开启');
      } else {
        showToast('自动运镜已关闭 · 自由探索');
      }
    });
    el('brand-home').addEventListener('click', e => {
      e.preventDefault();
      deselectComponent();
      setView('overview');
    });
    document.querySelectorAll('.view-btn').forEach(b => {
      b.addEventListener('click', () => {
        const v = b.dataset.view;
        if (v === 'explode') {
          toggleExplode();
        } else {
          setView(v);
          document.querySelectorAll('.view-btn').forEach(x => x.classList.toggle('is-active', x === b));
          activeView = v;
        }
      });
    });
    ui.search.addEventListener('input', e => {
      drawerQuery = e.target.value;
      renderDrawer();
    });
    ui.search.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', () => {});
    syncCameraButton();
    syncPowerControls();
  }

  function applyStageInitial() {
    state.stage = 0;
    state.targets = Object.assign({}, STAGES[0].targets);
    state.targetDisplay = { power: STAGES[0].power, temp: STAGES[0].temp, fan: 0 };
    state.rails.vsb = 5.02;
    ui.capCode.textContent = STAGES[0].code;
    ui.capText.textContent = STAGES[0].caption;
    addLog('AC 230V · 50Hz 接入', '');
    addLog('5VSB READY · 主轨与计算负载关闭', 'ok');
    addLog('等待 PWR_BTN# 触发虚拟启动', '');
    syncPowerControls();
  }

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    const mobile = window.innerWidth < 720;
    camera.fov = mobile ? 60 : 36;
    camera.updateProjectionMatrix();
    if (mobile) cam.goalRadius = Math.max(cam.goalRadius, 50);
    document.querySelectorAll('.scene-label').forEach(l => l.w = 0);
  }

  /* ── render loop / init ──────────────────────────────────────────── */
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    updateBoot(dt);
    updateRails(dt);
    updateExplosion(dt);
    updateFlows(dt, t);
    updateAnimated(dt, t);
    updateCamera(dt);
    updateLabels();
    updateSelection(dt, t);
    updateTelemetry(dt);
    if (t - lastScope > 0.045) { lastScope = t; drawScope(t); }
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      setTimeout(() => {
        ui.loader.classList.add('done');
        ui.loaderStatus.textContent = '场景就绪';
        setTimeout(() => { ui.loader.style.display = 'none'; }, 900);
      }, 420);
    }
  }

  function init() {
    if (!window.THREE) {
      ui.loaderStatus.textContent = 'THREE.JS 加载失败';
      return;
    }
    try {
      initRenderer();
      GLOW_TEX = makeGlowTexture(128);
      buildBench();
      buildPSU();
      buildBoard();
      buildPowerNetwork();
      buildLabels();
      setupMarkers();
      setupCamera();
      setupUI();
      // store GPU fan rotors for the animation pass
      animatables.gpuFans = animatables.gpuFans || [];
      window.__POWERFLOW__ = { scene, camera, renderer, state, compObjects, selectComponent, setView, toggleExplode };
      ui.canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault();
        showToast('WebGL 上下文丢失 · 请刷新页面');
      });
      animate();
    } catch (err) {
      console.error(err);
      ui.loader.classList.remove('done');
      ui.loaderStatus.textContent = '初始化失败 · 请确认浏览器已启用 WebGL / 硬件加速';
      showToast('3D 初始化失败，请刷新或更换浏览器');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
