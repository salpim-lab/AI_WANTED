import * as THREE from "three";
import { createPalette, Sculpt, type Palette } from "./islandModel";
import type { GiftKind } from "./types";
import { createAssetModel } from "./proceduralAsset";

export type CharacterPose = "holding" | "waving" | "walking";

export const CHARACTER_MODEL_HEIGHT = 1.78;

const SKIN = "#e8b98d";
const SHIRT = "#f2c86f";
const SHORTS = "#6687a0";
const HAIR = "#4f3a30";
const SHOE = "#f4f0df";
const SOLE = "#c9b99a";

// Shoulder [forward, sideways, outward] and elbow bend, for the right arm;
// the left arm mirrors the sideways and outward terms.
const ARM_POSES = {
  rest: { shoulder: [0, 0, 0.22], elbow: -0.3 },
  holding: { shoulder: [-0.75, 0.05, -0.25], elbow: -0.35 },
} as const;
const BREATH_SECONDS = 2.6;
// Widest footprint that still sits between the holding hands.
const HELD_WIDTH = 0.34;

// One rigid body part: sculpted in the joint's own frame, merged per colour.
function part(palette: Palette, build: (sculpt: Sculpt) => void) {
  const sculpt = new Sculpt(palette);
  build(sculpt);
  return sculpt.finish();
}

function joint(parent: THREE.Object3D, x: number, y: number, z: number, ...parts: THREE.Object3D[]) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.add(...parts);
  parent.add(pivot);
  return pivot;
}

// A 2.2-heads-tall child, facing +Z with feet at y = 0. Arms bend at the
// elbow and legs at the knee so the pose, breathing and walk can animate.
export function createChildCharacter(kind: GiftKind, asset?: { assetFormat?: "glb" | "procedural"; geometrySpec?: unknown }) {
  const palette = createPalette();
  const root = new THREE.Group();
  root.name = "child-character";
  // Everything above the hips rises and falls with each breath.
  const upper = new THREE.Group();
  root.add(upper);

  upper.add(part(palette, (s) => {
    // Shoulders wider than the waist: a tapered, oval-sectioned torso.
    s.mesh(new THREE.CylinderGeometry(1, 0.78, 1, 16), SHIRT, [0, 0.775, 0], [0.27, 0.43, 0.17]);
    s.sphere(SHIRT, [0, 0.975, 0], [0.27, 0.07, 0.17]);
    s.mesh(new THREE.CylinderGeometry(1, 1.08, 1, 16), SHORTS, [0, 0.5, 0], [0.22, 0.16, 0.145]);
    s.rod(SKIN, [0, 1.0, 0], [0.07, 0.08, 0.07]);
  }));

  const head = joint(upper, 0, 1.0, 0, part(palette, (s) => {
    s.sphere(SKIN, [0, 0.36, 0], [0.35, 0.39, 0.34]);
    s.sphere(HAIR, [0, 0.59, -0.02], [0.36, 0.19, 0.35]);
    s.sphere(HAIR, [-0.27, 0.5, 0], [0.12, 0.18, 0.17]);
    s.sphere(HAIR, [0.27, 0.5, 0], [0.12, 0.18, 0.17]);
    s.sphere("#47372f", [-0.11, 0.38, 0.31], [0.027, 0.037, 0.018]);
    s.sphere("#47372f", [0.11, 0.38, 0.31], [0.027, 0.037, 0.018]);
    s.sphere("#d88f79", [0, 0.25, 0.33], [0.08, 0.025, 0.018]);
    s.sphere("#efa38a", [-0.2, 0.3, 0.27], [0.055, 0.03, 0.02]);
    s.sphere("#efa38a", [0.2, 0.3, 0.27], [0.055, 0.03, 0.02]);
  }));

  // Shoulder ball and sleeve, upper arm, then elbow ball, forearm and hand.
  const arms = ([-1, 1] as const).map((side) => {
    const shoulder = joint(upper, side * 0.3, 0.92, 0, part(palette, (s) => {
      s.sphere(SHIRT, [0, 0, 0], [0.085, 0.085, 0.085]);
      s.mesh(new THREE.CylinderGeometry(1, 1.1, 1, 12), SHIRT, [0, -0.06, 0], [0.08, 0.13, 0.08]);
      s.rod(SKIN, [0, -0.13, 0], [0.058, 0.2, 0.058]);
    }));
    const elbow = joint(shoulder, 0, -0.23, 0, part(palette, (s) => {
      s.sphere(SKIN, [0, 0, 0], [0.057, 0.057, 0.057]);
      s.mesh(new THREE.CylinderGeometry(1, 0.87, 1, 12), SKIN, [0, -0.095, 0], [0.055, 0.19, 0.055]);
      s.sphere(SKIN, [0, -0.235, 0.005], [0.068, 0.075, 0.06]);
    }));
    return { side, shoulder, elbow };
  });

  // Shorts leg and thigh, then calf and shoe; soles rest on y = 0.
  const legs = ([-1, 1] as const).map((side) => {
    const hip = joint(root, side * 0.105, 0.5, 0, part(palette, (s) => {
      s.mesh(new THREE.CylinderGeometry(1, 0.95, 1, 12), SHORTS, [0, -0.03, 0], [0.1, 0.12, 0.1]);
      s.rod(SKIN, [0, -0.11, 0], [0.074, 0.14, 0.074]);
    }));
    const knee = joint(hip, 0, -0.18, 0, part(palette, (s) => {
      s.sphere(SKIN, [0, 0, 0], [0.072, 0.06, 0.072]);
      s.mesh(new THREE.CylinderGeometry(1, 0.82, 1, 12), SKIN, [0, -0.11, 0], [0.07, 0.22, 0.07]);
      s.block(SHOE, [0, -0.255, 0.035], [0.15, 0.11, 0.24]);
      s.block(SOLE, [0, -0.305, 0.035], [0.158, 0.03, 0.25]);
    }));
    return { side, hip, knee };
  });

  const gift = createAssetModel({ kind, assetFormat: asset?.assetFormat, geometrySpec: asset?.geometrySpec });
  // Hands close at x = ±0.19, y = 0.66. Generated items arrive normalised to
  // 1 unit, which would swallow the hands and hide the face, so shrink any
  // footprint wider than the preset gift's pot until the hands grip its sides.
  const footprint = new THREE.Box3().setFromObject(gift).getSize(new THREE.Vector3());
  gift.scale.setScalar(Math.min(0.78, HELD_WIDTH / Math.max(footprint.x, footprint.z)));
  gift.position.set(0, 0.56, 0.36);
  upper.add(gift);

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });

  let pose: CharacterPose = "holding";

  return {
    root,
    setPose(next: CharacterPose) {
      pose = next;
      gift.visible = next === "holding";
    },
    // `seconds` drives breathing and waving; `stride` in [-1, 1] swings the
    // legs mid-walk and is 0 while standing.
    animate(seconds: number, stride = 0, greetingProgress?: number) {
      const breath = Math.sin(seconds * Math.PI * 2 / BREATH_SECONDS);
      upper.position.y = (breath + 1) * 0.008;
      head.rotation.set(breath * 0.025, 0, Math.sin(seconds * 0.8) * 0.035);

      for (const { side, shoulder, elbow } of arms) {
        const holding = pose === "holding";
        const base = holding ? ARM_POSES.holding : ARM_POSES.rest;
        // Arms drift a touch with each breath; the held item keeps them steadier.
        const sway = holding ? 0.25 : 1;
        const swing = holding ? 0 : -side * stride * 0.35;
        shoulder.rotation.set(
          base.shoulder[0] + swing + Math.sin(seconds * 1.7 + side) * 0.035 * sway,
          side * base.shoulder[1],
          side * (base.shoulder[2] + breath * 0.03 * sway),
        );
        elbow.rotation.set(base.elbow + breath * 0.04 * sway, 0, 0);
        if (greetingProgress !== undefined && pose !== "waving" && side === 1) {
          // One greeting: smoothly lift, wave twice, then return to the pose.
          const progress = THREE.MathUtils.clamp(greetingProgress, 0, 1);
          const edge = Math.min(progress / 0.2, (1 - progress) / 0.2, 1);
          const lift = edge * edge * (3 - 2 * edge);
          shoulder.rotation.x = THREE.MathUtils.lerp(shoulder.rotation.x, 0, lift);
          shoulder.rotation.y = THREE.MathUtils.lerp(shoulder.rotation.y, 0, lift);
          shoulder.rotation.z = THREE.MathUtils.lerp(shoulder.rotation.z, 2.3, lift);
          elbow.rotation.x = THREE.MathUtils.lerp(elbow.rotation.x, 0, lift);
          elbow.rotation.z = lift * (0.42 + Math.sin(progress * Math.PI * 4) * 0.38);
        }
        if (pose === "waving" && side === 1) {
          // Raised high and out, the forearm swinging between out-and-up and
          // straight up, never across the face.
          shoulder.rotation.set(0, 0, 2.3 + breath * 0.03);
          elbow.rotation.set(0, 0, 0.42 + Math.sin(seconds * 9) * 0.38);
        }
      }

      for (const { side, hip, knee } of legs) {
        const swing = side * stride * 0.5;
        hip.rotation.x = swing;
        // The trailing leg bends at the knee.
        knee.rotation.x = Math.max(0, swing) * 0.9;
      }
    },
  };
}

export type ChildCharacter = ReturnType<typeof createChildCharacter>;

// Sparkles fly up from the chest while dust puffs roll out along the ground.
export function createPopBurst() {
  const group = new THREE.Group();
  group.name = "pop-burst";
  const gold = new THREE.MeshBasicMaterial({ color: "#ffe27a", transparent: true, depthWrite: false });
  const white = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false });
  const dust = new THREE.MeshStandardMaterial({ color: "#fffaf0", flatShading: true, transparent: true, depthWrite: false, roughness: 1 });
  const diamond = new THREE.OctahedronGeometry(1, 0);
  const puff = new THREE.IcosahedronGeometry(1, 0);

  const sparkles = Array.from({ length: 11 }, (_, k) => {
    const mesh = new THREE.Mesh(diamond, k % 3 ? gold : white);
    const angle = k / 11 * Math.PI * 2 + Math.random() * 0.5;
    const rise = 0.35 + Math.random() * 0.6;
    const direction = new THREE.Vector3(Math.cos(angle), rise, Math.sin(angle)).normalize();
    group.add(mesh);
    return { mesh, direction, reach: 0.8 + Math.random() * 0.55, size: 0.08 + Math.random() * 0.05, spin: 4 + Math.random() * 6 };
  });
  const puffs = Array.from({ length: 9 }, (_, k) => {
    const mesh = new THREE.Mesh(puff, dust);
    const angle = k / 9 * Math.PI * 2 + Math.random() * 0.4;
    mesh.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
    group.add(mesh);
    return { mesh, angle, reach: 0.55 + Math.random() * 0.35, size: 0.12 + Math.random() * 0.08 };
  });

  return {
    group,
    // `progress` runs 0 → 1 over the burst.
    update(progress: number) {
      const out = 1 - (1 - progress) ** 3;
      for (const sparkle of sparkles) {
        sparkle.mesh.position.set(0, 0.9, 0).addScaledVector(sparkle.direction, sparkle.reach * out);
        const size = sparkle.size * Math.sin(Math.PI * Math.min(1, progress * 1.15));
        sparkle.mesh.scale.set(size * 0.55, size, size * 0.55);
        sparkle.mesh.rotation.y = progress * sparkle.spin;
      }
      for (const dustPuff of puffs) {
        const r = 0.25 + dustPuff.reach * out;
        dustPuff.mesh.position.set(Math.cos(dustPuff.angle) * r, 0.08 + progress * 0.18, Math.sin(dustPuff.angle) * r);
        dustPuff.mesh.scale.setScalar(dustPuff.size * (0.6 + out * 0.8));
      }
      gold.opacity = white.opacity = 1 - Math.max(0, progress - 0.6) / 0.4;
      dust.opacity = 0.85 * (1 - progress) ** 1.5;
    },
  };
}
