import * as THREE from 'three';
import type { MafiaView, Phase } from '@friendslopped/mafia';
import { getState, subscribe } from './net.ts';
import { playerColor } from './colors.ts';

/** Render at a fraction of screen size and let the browser blur it up — the N64 look. */
const RENDER_SCALE = 0.38;
const FIGURE_RING = 5.2;

type Mood = 'day' | 'dusk' | 'night' | 'dawn';
const MOODS: Record<Mood, { sky: number; ambient: number; sun: number; sunIntensity: number; fire: number; celestial: number }> = {
  day: { sky: 0x78c0ff, ambient: 0xbfd8ff, sun: 0xfff1cc, sunIntensity: 2.2, fire: 0.6, celestial: 0xfff07a },
  dusk: { sky: 0xff8a5c, ambient: 0x9a6a9a, sun: 0xffb070, sunIntensity: 1.4, fire: 1.6, celestial: 0xffa040 },
  night: { sky: 0x0b0f3a, ambient: 0x3a3f8a, sun: 0x8090ff, sunIntensity: 0.55, fire: 3.2, celestial: 0xe8ecff },
  dawn: { sky: 0xf6b48a, ambient: 0xa08ab0, sun: 0xffd2a0, sunIntensity: 1.6, fire: 1.2, celestial: 0xffd080 },
};

function moodFor(phase: Phase | undefined, idle: number): Mood {
  switch (phase) {
    case 'night':
      return 'night';
    case 'dawn':
      return 'dawn';
    case 'day':
    case 'vote':
    case 'gameOver':
      return 'day';
    case 'reveal':
    case 'verdict':
      return 'dusk';
    default:
      // Outside a game the sky slowly cycles.
      return (['day', 'dusk', 'night', 'dawn'] as const)[Math.floor(idle / 20) % 4]!;
  }
}

/** Deterministic PRNG so the village looks the same every visit. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function colored(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, jitter = 0.08, rand = Math.random) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const base = new THREE.Color(color);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  // One shade per face for that chunky faceted look.
  for (let i = 0; i < pos.count; i += 3) {
    const c = base.clone().offsetHSL(0, 0, (rand() - 0.5) * jitter);
    for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function buildVillage(scene: THREE.Scene) {
  const rand = rng(64);

  const ground = new THREE.PlaneGeometry(150, 150, 30, 30);
  ground.rotateX(-Math.PI / 2);
  const gp = ground.getAttribute('position');
  for (let i = 0; i < gp.count; i++) {
    const r = Math.hypot(gp.getX(i), gp.getZ(i));
    if (r > 12) gp.setY(i, (rand() - 0.3) * Math.min(3, (r - 12) * 0.12));
  }
  scene.add(new THREE.Mesh(colored(ground, 0x3f9a3a, 0.12, rand), vcMat));

  const plaza = new THREE.CircleGeometry(8, 10);
  plaza.rotateX(-Math.PI / 2);
  plaza.translate(0, 0.06, 0);
  scene.add(new THREE.Mesh(colored(plaza, 0xc9a66b, 0.1, rand), vcMat));

  const roofColors = [0xc0392b, 0x2a5db0, 0x7a4a2a, 0x2e8b57, 0x8e44ad];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const r = 15 + rand() * 4;
    const house = new THREE.Group();
    const w = 2.6 + rand() * 1.4;
    const body = new THREE.Mesh(colored(new THREE.BoxGeometry(w, 2.2, w), 0xeadcbc, 0.1, rand), vcMat);
    body.position.y = 1.1;
    const roof = new THREE.Mesh(
      colored(new THREE.ConeGeometry(w * 0.85, 1.8, 4), roofColors[i % roofColors.length]!, 0.12, rand),
      vcMat,
    );
    roof.position.y = 3.1;
    roof.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.05), new THREE.MeshLambertMaterial({ color: 0x4a2a14 }));
    door.position.set(0, 0.55, w / 2 + 0.03);
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xffd46b });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), windowMat);
    win.position.set(w * 0.28, 1.5, w / 2 + 0.03);
    win.userData.window = true;
    house.add(body, roof, door, win);
    house.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    house.lookAt(0, 0, 0);
    scene.add(house);
  }

  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2;
    const r = 23 + rand() * 30;
    const s = 0.8 + rand() * 1.1;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(colored(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 5), 0x6b4423, 0.1, rand), vcMat);
    trunk.position.y = 0.6;
    const leaves = new THREE.Mesh(colored(new THREE.ConeGeometry(1.3, 3, 6), 0x1f6e2c, 0.15, rand), vcMat);
    leaves.position.y = 2.6;
    tree.add(trunk, leaves);
    tree.scale.setScalar(s);
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    scene.add(tree);
  }

  // Campfire in the plaza.
  const fire = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const log = new THREE.Mesh(colored(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 5), 0x5a3a1a), vcMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 6) * Math.PI;
    log.position.y = 0.12;
    fire.add(log);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 5), new THREE.MeshBasicMaterial({ color: 0xff8a1a }));
  flame.position.y = 0.8;
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 5), new THREE.MeshBasicMaterial({ color: 0xffe26b }));
  core.position.y = 0.6;
  fire.add(flame, core);
  scene.add(fire);
  return { flame, core };
}

interface Figure {
  group: THREE.Group;
  body: THREE.Group;
  grave: THREE.Mesh;
  alive: boolean;
}

function makeFigure(color: string): Figure {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const torso = new THREE.Mesh(colored(new THREE.CylinderGeometry(0.35, 0.55, 1.3, 6), color, 0.15), vcMat);
  torso.position.y = 0.65;
  const head = new THREE.Mesh(colored(new THREE.IcosahedronGeometry(0.42, 0), 0xf2c79c, 0.1), vcMat);
  head.position.y = 1.62;
  const hat = new THREE.Mesh(colored(new THREE.ConeGeometry(0.45, 0.5, 6), color, 0.1), vcMat);
  hat.position.y = 2.05;
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.05), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  eyes.position.set(0, 1.68, 0.38);
  body.add(torso, head, hat, eyes);
  const grave = new THREE.Mesh(colored(new THREE.BoxGeometry(0.9, 1.2, 0.3), 0x8a8fa0, 0.12), vcMat);
  grave.position.y = 0.6;
  grave.visible = false;
  group.add(body, grave);
  return { group, body, grave, alive: true };
}

export function mountScene(container: HTMLDivElement): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.domElement.className = 'scene-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x78c0ff, 18, 62);
  scene.background = new THREE.Color(0x78c0ff);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

  const ambient = new THREE.HemisphereLight(0xbfd8ff, 0x2a3a1a, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(20, 30, 10);
  const fireLight = new THREE.PointLight(0xff8a2a, 1, 18, 1.4);
  fireLight.position.y = 1.5;
  scene.add(ambient, sun, fireLight);

  const celestial = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), new THREE.MeshBasicMaterial({ color: 0xfff07a, fog: false }));
  scene.add(celestial);

  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(300 * 3);
  const sr = rng(7);
  for (let i = 0; i < 300; i++) {
    const t = sr() * Math.PI * 2;
    const p = sr() * 0.45 + 0.08;
    starPos.set([Math.cos(t) * Math.cos(p) * 90, Math.sin(p) * 90, Math.sin(t) * Math.cos(p) * 90], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, fog: false, transparent: true });
  scene.add(new THREE.Points(starGeo, starMat));

  const { flame, core } = buildVillage(scene);
  const windows: THREE.Mesh[] = [];
  scene.traverse((o) => o.userData.window && windows.push(o as THREE.Mesh));

  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
  marker.visible = false;
  scene.add(marker);

  const figures = new Map<string, Figure>();
  let meId: string | null = null;
  let phase: Phase | undefined;

  const sync = () => {
    const { lobby, me } = getState();
    const game = lobby?.game as MafiaView | null | undefined;
    phase = game?.phase;
    meId = me?.id ?? null;
    const people = lobby
      ? lobby.players.map((p) => ({
          id: p.id,
          color: playerColor(p.color),
          alive: game ? (game.players.find((g) => g.id === p.id)?.alive ?? false) : true,
        }))
      : [];
    const ids = new Set(people.map((p) => p.id));
    for (const [id, f] of figures) {
      if (!ids.has(id)) {
        scene.remove(f.group);
        figures.delete(id);
      }
    }
    people.forEach((p, i) => {
      let f = figures.get(p.id);
      if (!f) {
        f = makeFigure(p.color);
        figures.set(p.id, f);
        scene.add(f.group);
      }
      const a = (i / people.length) * Math.PI * 2;
      f.group.position.set(Math.cos(a) * FIGURE_RING, 0, Math.sin(a) * FIGURE_RING);
      f.group.lookAt(0, 0, 0);
      f.alive = p.alive;
      f.body.visible = p.alive;
      f.grave.visible = !p.alive;
    });
  };
  sync();
  const unsubscribe = subscribe(sync);

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(Math.max(1, Math.ceil(w * RENDER_SCALE)), Math.max(1, Math.ceil(h * RENDER_SCALE)), false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const sky = new THREE.Color();
  const target = { sky: new THREE.Color(), ambient: new THREE.Color(), sun: new THREE.Color(), celestial: new THREE.Color() };
  const start = performance.now();
  let last = start;
  let raf = 0;

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const nowMs = performance.now();
    const dt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    const t = (nowMs - start) / 1000;
    const mood = MOODS[moodFor(phase, t)];
    const k = 1 - Math.exp(-dt * 1.5);

    target.sky.set(mood.sky);
    sky.lerp(target.sky, k);
    (scene.background as THREE.Color).copy(sky);
    scene.fog!.color.copy(sky);
    ambient.color.lerp(target.ambient.set(mood.ambient), k);
    sun.color.lerp(target.sun.set(mood.sun), k);
    sun.intensity += (mood.sunIntensity - sun.intensity) * k;
    const night = mood === MOODS.night;
    starMat.opacity += ((night ? 1 : 0) - starMat.opacity) * k;
    (celestial.material as THREE.MeshBasicMaterial).color.lerp(target.celestial.set(mood.celestial), k);
    for (const w of windows) (w.material as THREE.MeshBasicMaterial).color.setHex(night ? 0xffd46b : 0x6a7a99);

    const flicker = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
    fireLight.intensity += (mood.fire * flicker * 6 - fireLight.intensity) * k * 4;
    flame.scale.set(1, flicker, 1);
    core.scale.set(1, 1.2 - flicker * 0.3, 1);
    flame.rotation.y = t * 1.5;

    // Slow orbit around the plaza.
    const orbit = t * 0.06;
    const radius = figures.size ? 15 : 22;
    camera.position.set(Math.cos(orbit) * radius, figures.size ? 7.5 : 9, Math.sin(orbit) * radius);
    camera.lookAt(0, figures.size ? 1.2 : 2, 0);
    celestial.position.set(Math.cos(orbit + 2.4) * 70, 34, Math.sin(orbit + 2.4) * 70);

    let i = 0;
    for (const [id, f] of figures) {
      if (f.alive) f.body.position.y = Math.abs(Math.sin(t * 2.2 + i * 1.3)) * 0.12;
      if (id === meId) {
        marker.visible = f.alive;
        marker.position.set(f.group.position.x, 3 + Math.sin(t * 3) * 0.15, f.group.position.z);
        marker.rotation.y = t * 2.5;
      }
      i++;
    }
    if (!meId || !figures.has(meId)) marker.visible = false;

    renderer.render(scene, camera);
  };
  frame();

  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    unsubscribe();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
