import * as THREE from 'three';

/**
 * GameCube-era menu space used by Tuned In: a glossy indigo void with
 * floating clearcoat cubes, a translucent cube-in-a-cube centrepiece and
 * bubbly player avatars. Smoother and shinier than the N64 village.
 */

const CUBE_COLORS = [0x6a4cff, 0x8f6bff, 0x4b2fc9, 0xb9a6ff, 0x3a2390, 0xd8d2ff];

/** Background tint per Tuned In phase. */
const PHASE_TINT: Record<string, number> = {
  clue: 0x2a1166,
  guess: 0x1a1450,
  counter: 0x30105a,
  reveal: 0x4a1a78,
  gameOver: 0x22186a,
};
const DEFAULT_TINT = 0x1d1456;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function glossy(color: THREE.ColorRepresentation, extra: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08, ...extra });
}

export function buildCubeWorld() {
  const group = new THREE.Group();
  const rand = rng(1337);

  // Reflective floor with a soft violet grid fading into fog.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(80, 48), glossy(0x140c3d, { roughness: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  const grid = new THREE.GridHelper(120, 60, 0x8f6bff, 0x3a2390);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.45;
  group.add(floor, grid);

  // Centrepiece: a slowly turning translucent cube with a solid one inside.
  const centre = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 3.2, 3.2),
    glossy(0x9b80ff, { transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false }),
  );
  const core = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), glossy(0x5b3bea, { emissive: 0x2a1080, emissiveIntensity: 0.6 }));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(shell.geometry),
    new THREE.LineBasicMaterial({ color: 0xe6deff, transparent: true, opacity: 0.8 }),
  );
  centre.add(shell, core, edges);
  centre.position.y = 3.2;
  group.add(centre);

  // Floating cubes on a big shell around the stage.
  const floaters: { mesh: THREE.Mesh; spin: THREE.Vector3; baseY: number; phase: number }[] = [];
  for (let i = 0; i < 44; i++) {
    const s = 0.4 + rand() * 1.4;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), glossy(CUBE_COLORS[i % CUBE_COLORS.length]!));
    const a = rand() * Math.PI * 2;
    const r = 12 + rand() * 30;
    const y = 1.5 + rand() * 14;
    mesh.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    mesh.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    floaters.push({ mesh, spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.6), baseY: y, phase: rand() * 6 });
    group.add(mesh);
  }

  // Sparkles.
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(260 * 3);
  for (let i = 0; i < 260; i++) sparkPos.set([(rand() - 0.5) * 100, rand() * 40, (rand() - 0.5) * 100], i * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xd8ccff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8 }));
  group.add(sparks);

  // Coloured lights that orbit for moving specular highlights.
  const violet = new THREE.PointLight(0xa070ff, 60, 40, 1.6);
  const cyan = new THREE.PointLight(0x50d8ff, 45, 40, 1.6);
  group.add(violet, cyan);

  const tint = new THREE.Color(DEFAULT_TINT);
  const target = new THREE.Color();

  return {
    group,
    /** Animates the world; returns the background colour to use this frame. */
    update(t: number, phase: string | undefined, k: number) {
      centre.rotation.set(t * 0.25, t * 0.4, 0);
      core.rotation.set(-t * 0.6, -t * 0.3, t * 0.2);
      centre.position.y = 3.2 + Math.sin(t * 1.2) * 0.25;
      for (const f of floaters) {
        f.mesh.rotation.x += f.spin.x * 0.02;
        f.mesh.rotation.y += f.spin.y * 0.02;
        f.mesh.position.y = f.baseY + Math.sin(t * 0.8 + f.phase) * 0.5;
      }
      violet.position.set(Math.cos(t * 0.5) * 9, 6, Math.sin(t * 0.5) * 9);
      cyan.position.set(Math.cos(t * 0.5 + Math.PI) * 9, 4, Math.sin(t * 0.5 + Math.PI) * 9);
      (sparks.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(t * 2) * 0.25;
      tint.lerp(target.set((phase && PHASE_TINT[phase]) ?? DEFAULT_TINT), k);
      return tint;
    },
  };
}

/** A glossy bubble avatar with a little shine, used instead of village figures. */
export function makeBubble(color: string) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 20), glossy(color));
  ball.position.y = 1.1;
  const shine = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }),
  );
  shine.position.set(-0.28, 1.45, 0.52);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a0f45 });
  const eyeGeo = new THREE.CapsuleGeometry(0.07, 0.16, 4, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.2, 1.18, 0.7);
  eyeR.position.set(0.2, 1.18, 0.7);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 0.25, 32), glossy(0xd8d2ff, { metalness: 0.5 }));
  base.position.y = 0.12;
  body.add(ball, shine, eyeL, eyeR);
  group.add(body, base);
  // Tuned In has no deaths; "grave" is just an empty stand.
  const grave = new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial());
  grave.visible = false;
  group.add(grave);
  return { group, body, grave, alive: true };
}

export function makeHalo() {
  return new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.1, 12, 32),
    new THREE.MeshPhysicalMaterial({ color: 0xffe066, emissive: 0xffc400, emissiveIntensity: 0.6, clearcoat: 1, roughness: 0.2 }),
  );
}
