import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { createPalette, disposeObject, Sculpt, type Palette } from "./islandModel";

export type CharacterPose = "carrying" | "waving" | "walking";

export const CHARACTER_MODEL_HEIGHT = 1.78;

const SKIN = "#ffdbbb";
const SHIRT = "#f2c86f";
const SHORTS = "#6687a0";
const HAIR = "#372a25";
const HAIR_SHADE = "#2d211e";
const EYE = "#312521";
const SHOE = "#f4f0df";
const SOLE = "#c9b99a";

// Shoulder [forward, sideways, outward], elbow [bend, inward] and arm
// length, for the right arm; the left arm mirrors the sideways and inward terms.
type ArmPose = { shoulder: readonly number[]; elbow: readonly number[]; reach: number };
const ARM_POSES = {
  rest: { shoulder: [0, 0, 0.22], elbow: [-0.3, 0], reach: 1 },
  // Bent over, both hands well forward so the item stays clear of the face.
  grabbing: { shoulder: [-1.3, 0, 0.12], elbow: [-0.1, 0], reach: 1.3 },
  // Raised straight up in front, hands at the item's sides on the crown. A
  // 2.2-head child's arms end at eye level, so they stretch, cartoon-style.
  carrying: { shoulder: [-Math.PI, 0, 0.09], elbow: [0, 0], reach: 1.85 },
} satisfies Record<string, ArmPose>;
const BREATH_SECONDS = 2.6;
const BEND_ANGLE = 0.35;
// Running leans the body forward and swings arms and legs wider.
const RUN_LEAN = 0.2;
// Extra stretch mid-raise, so the item arcs in front of the face and over the head.
const RAISE_STRETCH = 0.8;
// Pick-up: bend and reach until LIFT_GRAB, hold the grip, then stand and raise it overhead.
export const LIFT_GRAB = 0.35;
const LIFT_RISE = 0.5;
// A carried item is fitted to the gap between the raised hands.
export const CARRY_WIDTH = 0.76;
export const CARRY_HEIGHT = 0.8;

// Rigged Mixamo child (walk/run clips, in place); the sculpted child stands in
// until it loads, and stays if it fails.
const GLB_URL = "/models/minjun_walk_run.glb";
const GLB_CROSSFADE_SECONDS = 0.25;
// The fallback's shoulder/elbow Euler angles are replayed on the Mixamo arm
// bones in the character's frame, measured from each arm hanging straight down.
// Per-axis sign and offset (x forward, y twist, z outward) for tuning that mapping.
const GLB_ARM_SIGN = [1, 1, 1] as const;
const GLB_SHOULDER_OFFSET = [0, 0, 0] as const;
const GLB_ELBOW_OFFSET = [0, 0, 0] as const;
// Forward bend on the Spine bone, about the character's X axis; -1 flips it.
const GLB_BEND_SIGN = 1;
// Toddler proportions on the GLB: head bone scale, thigh/shin length (bone Y),
// torso and limb girth (X/Z), and the final height in metres after all of it.
const HEAD_SCALE = 1.4;
const LEG_LENGTH_SCALE = 0.85;
const BODY_WIDTH_SCALE = 1.15;
const LIMB_WIDTH_SCALE = 1.1;
const VISUAL_HEIGHT = 1.45;
// Holding, each hand aims at a point beside the item: HAND_GAP out from its
// side and HAND_DROP below its centre (model units). While grabbing, the hands
// aim at GRAB_TARGET's sides (low, in front of the feet) instead, and the aim
// moves up to the head as the item rises, swinging RAISE_FORWARD out in front
// mid-raise so the arms come up past the face rather than out to the sides.
const HAND_GAP = 0.02;
const HAND_DROP = 0.05;
const GRAB_TARGET = new THREE.Vector3(0, 0.25, 0.45);
const RAISE_FORWARD = 0.25;
// Elbows keep at least ELBOW_BEND (radians), bending towards ELBOW_POLE: down and back.
const ELBOW_BEND = 0.15;
const ELBOW_POLE = new THREE.Vector3(0, -1, -0.5).normalize();
// Arms (upper arm and forearm bone Y) stretch only when a target is out of
// reach, up to MAX_REACH, easing back to 1 when not holding anything.
const MAX_REACH = 1.6;
const GLB_REACH_EASE_SECONDS = 0.12;
// Stretched arms thicken by reach ** this, so they don't turn into sticks.
const ARM_THICKEN_EXPONENT = 0.4;
// A carried item rests this far above the HeadTop_End bone, in model units.
const GLB_HEAD_CARRY_OFFSET = new THREE.Vector3(0, 0.04, 0);

const smooth = (t: number) => {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const mixPose = (a: ArmPose, b: ArmPose, t: number): ArmPose => ({
  shoulder: a.shoulder.map((value, i) => THREE.MathUtils.lerp(value, b.shoulder[i], t)),
  elbow: a.elbow.map((value, i) => THREE.MathUtils.lerp(value, b.elbow[i], t)),
  reach: THREE.MathUtils.lerp(a.reach, b.reach, t),
});

/** 0 while bending and grabbing, then 0 → 1 as the item is raised overhead. */
export const liftRise = (progress: number) => smooth((progress - LIFT_RISE) / (1 - LIFT_RISE));

function liftPose(progress: number) {
  if (progress < LIFT_GRAB) {
    const t = smooth(progress / LIFT_GRAB);
    return { arms: mixPose(ARM_POSES.rest, ARM_POSES.grabbing, t), bend: t };
  }
  const t = liftRise(progress);
  const arms = mixPose(ARM_POSES.grabbing, ARM_POSES.carrying, t);
  arms.reach += Math.sin(Math.PI * t) * RAISE_STRETCH;
  return { arms, bend: 1 - t };
}

type AnimState = {
  pose: CharacterPose;
  liftProgress: number | null;
  doorReach: number;
  running: boolean;
  seconds: number;
  stride: number;
  greetingProgress?: number;
};

// Shoulder and elbow angles of one arm: the base pose plus breathing, walk
// swing, a greeting, a door reach or waving. Side 1 is the +X arm.
function poseArm(side: -1 | 1, base: ArmPose, holding: boolean, breath: number, state: AnimState, shoulder: THREE.Euler, elbow: THREE.Euler) {
  const { seconds, stride, running, greetingProgress, doorReach, pose } = state;
  // Arms drift a touch with each breath; the carried item keeps them steadier.
  const sway = holding ? 0.25 : 1;
  const swing = holding ? 0 : -side * stride * (running ? 0.7 : 0.35);
  shoulder.set(
    base.shoulder[0] + swing + Math.sin(seconds * 1.7 + side) * 0.035 * sway,
    side * base.shoulder[1],
    side * (base.shoulder[2] + breath * 0.03 * sway),
  );
  elbow.set(base.elbow[0] + breath * 0.04 * sway, 0, side * base.elbow[1]);
  if (greetingProgress !== undefined && pose !== "waving" && side === 1) {
    // One greeting: smoothly lift, wave twice, then return to the pose.
    const progress = THREE.MathUtils.clamp(greetingProgress, 0, 1);
    const edge = Math.min(progress / 0.2, (1 - progress) / 0.2, 1);
    const lift = edge * edge * (3 - 2 * edge);
    shoulder.x = THREE.MathUtils.lerp(shoulder.x, 0, lift);
    shoulder.y = THREE.MathUtils.lerp(shoulder.y, 0, lift);
    shoulder.z = THREE.MathUtils.lerp(shoulder.z, 2.3, lift);
    elbow.x = THREE.MathUtils.lerp(elbow.x, 0, lift);
    elbow.z = lift * (0.42 + Math.sin(progress * Math.PI * 4) * 0.38);
  }
  if (doorReach > 0 && side === 1) {
    shoulder.x = THREE.MathUtils.lerp(shoulder.x, -1.35, doorReach);
    shoulder.z = THREE.MathUtils.lerp(shoulder.z, 0.1, doorReach);
    elbow.x = THREE.MathUtils.lerp(elbow.x, -0.25, doorReach);
  }
  if (pose === "waving" && side === 1) {
    // Raised high and out, the forearm swinging between out-and-up and
    // straight up, never across the face.
    shoulder.set(0, 0, 2.3 + breath * 0.03);
    elbow.set(0, 0, 0.42 + Math.sin(seconds * 9) * 0.38);
  }
}

type Rig = {
  body: THREE.Object3D;
  // Poses the body and moves `grip` (a child of the character root).
  animate(state: AnimState, grip: THREE.Object3D): void;
};

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

// A sculpted 2.2-heads-tall child, facing +Z with feet at y = 0. Arms bend at
// the elbow and legs at the knee so the pose, breathing and walk can animate.
function createShapeRig(): Rig {
  const palette = createPalette();
  const body = new THREE.Group();
  // Everything above the hips rises and falls with each breath.
  const upper = new THREE.Group();
  body.add(upper);

  upper.add(part(palette, (s) => {
    // Shoulders wider than the waist: a tapered, oval-sectioned torso.
    s.mesh(new THREE.CylinderGeometry(1, 0.78, 1, 16), SHIRT, [0, 0.775, 0], [0.27, 0.43, 0.17]);
    s.sphere(SHIRT, [0, 0.975, 0], [0.27, 0.07, 0.17]);
    s.mesh(new THREE.CylinderGeometry(1, 1.08, 1, 16), SHORTS, [0, 0.5, 0], [0.22, 0.16, 0.145]);
    s.rod(SKIN, [0, 1.0, 0], [0.07, 0.08, 0.07]);
  }));

  const head = joint(upper, 0, 1.0, 0, part(palette, (s) => {
    // The photo has a soft oval face, visible ears and an uneven, swept fringe.
    s.sphere(SKIN, [0, 0.36, 0], [0.35, 0.39, 0.34]);
    for (const side of [-1, 1]) {
      s.sphere(SKIN, [side * 0.35, 0.31, 0.005], [0.075, 0.105, 0.065]);
      s.sphere("#e9aa89", [side * 0.385, 0.31, 0.056], [0.025, 0.045, 0.01]);
    }

    const hair = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, 2.12);
    const positions = hair.getAttribute("position");
    const uv = hair.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) {
      const phi = uv.getX(i) * Math.PI * 2;
      const back = (1 - Math.sin(phi)) / 2;
      const x = -Math.cos(phi);
      // Longer locks dip over the forehead; the sides and back remain cropped.
      const fringe = 0.16 * Math.exp(-(((x + 0.17) / 0.2) ** 2))
        + 0.22 * Math.exp(-(((x - 0.08) / 0.13) ** 2));
      const theta = (1 - uv.getY(i)) * (THREE.MathUtils.lerp(1.25 + fringe, 2.12, back));
      positions.setXYZ(i, -Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
    }
    hair.computeVertexNormals();
    s.mesh(hair, HAIR, [0, 0.385, -0.005], [0.378, 0.405, 0.357]);
    // Two pointed tufts break the otherwise round crown silhouette.
    s.mesh(new THREE.ConeGeometry(1, 1, 8), HAIR, [0.13, 0.78, -0.035], [0.085, 0.16, 0.085], [0, 0, -0.52]);
    s.mesh(new THREE.ConeGeometry(1, 1, 8), HAIR, [-0.23, 0.72, 0.02], [0.07, 0.14, 0.07], [0, 0, 0.72]);

    for (const side of [-1, 1]) {
      const x = side * 0.14;
      s.sphere("#fffaf1", [x, 0.37, 0.32], [0.067, 0.078, 0.026]);
      s.sphere(EYE, [x + side * 0.008, 0.36, 0.347], [0.041, 0.05, 0.014]);
      s.sphere("#ffffff", [x - 0.012, 0.384, 0.36], [0.012, 0.013, 0.006]);
      s.sphere("#f8ae91", [side * 0.23, 0.27, 0.255], [0.048, 0.026, 0.012]);
      const brow = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x - 0.052, 0.492, 0.302),
        new THREE.Vector3(x, 0.515, 0.311),
        new THREE.Vector3(x + 0.052, 0.49, 0.302),
      ]);
      s.mesh(new THREE.TubeGeometry(brow, 8, 0.009, 5, false), HAIR_SHADE, [0, 0, 0]);
    }
    s.sphere("#e7a887", [0, 0.282, 0.338], [0.023, 0.013, 0.012]);
    const smile = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.065, 0.202, 0.316),
      new THREE.Vector3(0, 0.184, 0.322),
      new THREE.Vector3(0.065, 0.202, 0.316),
    ]);
    s.mesh(new THREE.TubeGeometry(smile, 12, 0.008, 5, false), HAIR_SHADE, [0, 0, 0]);
  }));

  // Shoulder ball and sleeve, upper arm, then elbow ball, forearm and hand.
  // The arm segments are separate so they can stretch without distorting the joints.
  const arms = ([-1, 1] as const).map((side) => {
    const shoulder = joint(upper, side * 0.3, 0.92, 0, part(palette, (s) => {
      s.sphere(SHIRT, [0, 0, 0], [0.085, 0.085, 0.085]);
      s.mesh(new THREE.CylinderGeometry(1, 1.1, 1, 12), SHIRT, [0, -0.06, 0], [0.08, 0.13, 0.08]);
    }));
    const upperArm = joint(shoulder, 0, 0, 0, part(palette, (s) => s.rod(SKIN, [0, -0.13, 0], [0.058, 0.2, 0.058])));
    const elbow = joint(shoulder, 0, -0.23, 0, part(palette, (s) => s.sphere(SKIN, [0, 0, 0], [0.057, 0.057, 0.057])));
    const forearm = joint(elbow, 0, 0, 0, part(palette, (s) => {
      s.mesh(new THREE.CylinderGeometry(1, 0.87, 1, 12), SKIN, [0, -0.095, 0], [0.055, 0.19, 0.055]);
    }));
    const hand = joint(elbow, 0, -0.235, 0.005, part(palette, (s) => s.sphere(SKIN, [0, 0, 0], [0.068, 0.075, 0.06])));
    return { side, shoulder, upperArm, elbow, forearm, hand };
  });

  // Shorts leg and thigh, then calf and shoe; soles rest on y = 0.
  const legs = ([-1, 1] as const).map((side) => {
    const hip = joint(body, side * 0.105, 0.5, 0, part(palette, (s) => {
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

  const leftHand = new THREE.Vector3();
  const rightHand = new THREE.Vector3();

  body.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });

  return {
    body,
    animate(state, grip) {
      const { pose, liftProgress, running, seconds, stride } = state;
      const breath = Math.sin(seconds * Math.PI * 2 / BREATH_SECONDS);
      const lift = liftProgress === null ? null : liftPose(liftProgress);
      // Bend forward at the hips.
      const lean = (lift?.bend ?? 0) * BEND_ANGLE + (running ? RUN_LEAN : 0);
      upper.rotation.x = lean;
      upper.position.set(0, 0.5 - 0.5 * Math.cos(lean) + (breath + 1) * 0.008, -0.5 * Math.sin(lean));
      head.rotation.set(breath * 0.025, 0, Math.sin(seconds * 0.8) * 0.035);

      for (const { side, shoulder, upperArm, elbow, forearm, hand } of arms) {
        const holding = pose === "carrying" || !!lift;
        const base = lift?.arms ?? (pose === "carrying" ? ARM_POSES.carrying : ARM_POSES.rest);
        upperArm.scale.y = forearm.scale.y = base.reach;
        elbow.position.y = -0.23 * base.reach;
        hand.position.y = -0.235 * base.reach;
        poseArm(side, base, holding, breath, state, shoulder.rotation, elbow.rotation);
      }

      // Midway between the hands: a carried item rides here.
      arms[0].hand.getWorldPosition(leftHand);
      arms[1].hand.getWorldPosition(rightHand);
      grip.position.copy(grip.parent!.worldToLocal(leftHand.add(rightHand).multiplyScalar(0.5)));

      for (const { side, hip, knee } of legs) {
        const swing = side * stride * (running ? 0.85 : 0.5);
        hip.rotation.x = swing;
        // The trailing leg bends at the knee.
        knee.rotation.x = Math.max(0, swing) * (running ? 1.4 : 0.9);
      }
    },
  };
}

// Fetched and parsed once per page; every character clones it.
let glbPromise: Promise<GLTF> | null = null;
let glbLoaded: GLTF | null = null;
function loadGlb() {
  glbPromise ??= new GLTFLoader().loadAsync(GLB_URL).then((gltf) => {
    // Scale keys, and bone-length keys other than the hips' travel, would
    // overwrite the proportions and arm reach every frame.
    for (const clip of gltf.animations) {
      clip.tracks = clip.tracks.filter((track) =>
        !track.name.endsWith(".scale") && (!track.name.endsWith(".position") || /Hips\.position$/.test(track.name)));
    }
    return (glbLoaded = gltf);
  });
  return glbPromise;
}
if (typeof window !== "undefined") loadGlb().catch(() => {});

const DOWN = new THREE.Vector3(0, -1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

function createGlbRig(gltf: GLTF): Rig {
  const model = cloneSkinned(gltf.scene);
  const body = new THREE.Group();
  body.add(model);

  // Loaders may strip the ":" from "mixamorig:Hips", so match either way.
  const bone = (name: string) => {
    let found: THREE.Object3D | undefined;
    model.traverse((object) => {
      if (!found && (object as THREE.Bone).isBone && object.name.replace(/^mixamorig:?/, "") === name) found = object;
    });
    if (!found) throw new Error(`${GLB_URL}: bone ${name} not found`);
    return found;
  };
  const hips = bone("Hips");
  const spine = bone("Spine");
  const spine2 = bone("Spine2");
  const head = bone("Head");
  const headTop = bone("HeadTop_End");
  // The model faces +Z, so Mixamo's Left* arm is on +X: the fallback's side 1.
  const arms = ([-1, 1] as const).map((side) => {
    const prefix = side === 1 ? "Left" : "Right";
    const scale = new THREE.Vector3(LIMB_WIDTH_SCALE, 1, LIMB_WIDTH_SCALE);
    return { side, arm: bone(`${prefix}Arm`), foreArm: bone(`${prefix}ForeArm`), hand: bone(`${prefix}Hand`), scale, reach: 1 };
  });

  // Target scale of each bone along its own axes, parents before children.
  // Bones not listed simply inherit their parent's.
  const girth = new THREE.Vector3(BODY_WIDTH_SCALE, 1, BODY_WIDTH_SCALE);
  const legLength = new THREE.Vector3(LIMB_WIDTH_SCALE, LEG_LENGTH_SCALE, LIMB_WIDTH_SCALE);
  const unscaled = new THREE.Vector3(1, 1, 1);
  const shape = new Map<THREE.Object3D, THREE.Vector3>([
    [spine, girth], [bone("Spine1"), girth], [spine2, girth],
    [bone("Neck"), unscaled], [bone("LeftShoulder"), unscaled], [bone("RightShoulder"), unscaled],
    [head, new THREE.Vector3(HEAD_SCALE, HEAD_SCALE, HEAD_SCALE)],
    ...(["Left", "Right"] as const).flatMap((prefix) => [
      [bone(`${prefix}UpLeg`), legLength], [bone(`${prefix}Leg`), legLength], [bone(`${prefix}Foot`), unscaled],
    ] as const),
    ...arms.flatMap(({ arm, foreArm, hand, scale }) => [[arm, scale], [foreArm, scale], [hand, unscaled]] as const),
  ]);
  // Three.js scale is inherited, so each bone divides out, axis by axis, how
  // much its parent's target stretches it (exact while the joint is straight).
  const axis = new THREE.Vector3();
  const applyShape = () => {
    for (const [object, want] of shape) {
      const inherited = shape.get(object.parent!) ?? unscaled;
      for (let i = 0; i < 3; i++) {
        axis.set(0, 0, 0).setComponent(i, 1).applyQuaternion(object.quaternion).multiply(inherited);
        object.scale.setComponent(i, want.getComponent(i) / axis.length());
      }
    }
  };

  // Rotation in the character's frame (the body group only scales and shifts).
  const frameQuat = (object: THREE.Object3D, target: THREE.Quaternion) => {
    target.identity();
    for (let o: THREE.Object3D | null = object; o && o !== body; o = o.parent) target.premultiply(o.quaternion);
    return target;
  };
  const parentQuat = new THREE.Quaternion();
  const setFrameQuat = (object: THREE.Object3D, q: THREE.Quaternion) => {
    object.quaternion.copy(frameQuat(object.parent!, parentQuat).invert().multiply(q));
  };
  // Local → character-root transform, from local matrices so a zero-scale root is harmless.
  const toRoot = (object: THREE.Object3D, target: THREE.Matrix4) => {
    target.identity();
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      o.updateMatrix();
      target.premultiply(o.matrix);
      if (o === body) break;
    }
    return target;
  };
  const toRootMatrix = new THREE.Matrix4();
  const rootPosition = (object: THREE.Object3D, target: THREE.Vector3) =>
    target.setFromMatrixPosition(toRoot(object, toRootMatrix));

  // Bind pose, measured in the original units (Mixamo cm under a 0.01 armature),
  // before and after the proportions: the shorter legs lift the feet, so every
  // clip's hips are lowered by that much.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  applyShape();
  model.updateMatrixWorld(true);
  const shapedBox = new THREE.Box3().setFromObject(model, true);
  const hipsWorld = hips.getWorldPosition(new THREE.Vector3());
  const hipsDrop = hips.parent!.worldToLocal(hipsWorld.clone().setY(hipsWorld.y - (shapedBox.min.y - box.min.y)))
    .sub(hips.parent!.worldToLocal(hipsWorld.clone()));

  // The clips key the hips about a metre above the bind pose, so standing
  // still is its own one-frame clip: bind rotations, hips raised onto the ground.
  const standTracks: THREE.KeyframeTrack[] = [];
  model.traverse((object) => {
    if ((object as THREE.Bone).isBone) standTracks.push(new THREE.QuaternionKeyframeTrack(`${object.name}.quaternion`, [0], object.quaternion.toArray()));
  });
  const standHips = hips.getWorldPosition(new THREE.Vector3());
  standHips.y -= box.min.y;
  standTracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, [0], hips.parent!.worldToLocal(standHips).toArray()));

  const clip = (name: string) => {
    const found = THREE.AnimationClip.findByName(gltf.animations, name);
    if (!found) throw new Error(`${GLB_URL}: clip ${name} not found`);
    return found;
  };
  const mixer = new THREE.AnimationMixer(model);
  const actions = {
    stand: mixer.clipAction(new THREE.AnimationClip("stand", 1, standTracks)),
    walk: mixer.clipAction(clip("walk")),
    run: mixer.clipAction(clip("run")),
  };
  const weights = { stand: 1, walk: 0, run: 0 };
  const clips = ["stand", "walk", "run"] as const;
  for (const name of clips) actions[name].setEffectiveWeight(weights[name]).play();
  mixer.update(0);
  // The mixer only writes a bone when its clip value changes, so overridden
  // bones are put back to the clip pose before each update.
  const overridden = [hips, spine, head, ...arms.flatMap(({ arm, foreArm }) => [arm, foreArm])]
    .map((object) => ({ object, position: object.position.clone(), quaternion: object.quaternion.clone() }));
  hips.position.add(hipsDrop);

  // Height fitted to VISUAL_HEIGHT, feet on y = 0, centred on the origin.
  const scale = VISUAL_HEIGHT / (shapedBox.max.y - shapedBox.min.y);
  const center = shapedBox.getCenter(new THREE.Vector3());
  body.scale.setScalar(scale);
  body.position.set(-center.x * scale, 0, -center.z * scale);

  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    if (object instanceof THREE.SkinnedMesh) {
      // Bounds for the standing pose; raised arms may leave them, so skip culling.
      object.computeBoundingBox();
      object.frustumCulled = false;
    }
  });

  // Standing-pose references: the torso, and each arm segment hanging straight down.
  const spine2RestInverse = frameQuat(spine2, new THREE.Quaternion()).invert();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const hang = (segment: THREE.Object3D, end: THREE.Object3D) => {
    rootPosition(segment, from);
    rootPosition(end, to);
    return new THREE.Quaternion()
      .setFromUnitVectors(to.sub(from).normalize(), DOWN)
      .multiply(frameQuat(segment, new THREE.Quaternion()));
  };
  // Rest direction, length and rotation of each arm segment, for aiming it.
  const segment = (start: THREE.Object3D, end: THREE.Object3D) => {
    const a = rootPosition(start, new THREE.Vector3());
    const b = rootPosition(end, new THREE.Vector3());
    return {
      hang: hang(start, end),
      direction: b.clone().sub(a).normalize(),
      length: a.distanceTo(b),
      inverse: frameQuat(start, new THREE.Quaternion()).invert(),
    };
  };
  const armRest = arms.map(({ arm, foreArm, hand }) => ({ arm: segment(arm, foreArm), foreArm: segment(foreArm, hand) }));

  // The carried item's bounds in the grip's frame (which only translates), or
  // null before one is handed over.
  const itemBox = new THREE.Box3();
  const meshBox = new THREE.Box3();
  const itemMatrix = new THREE.Matrix4();
  const measureItem = (grip: THREE.Object3D) => {
    itemBox.makeEmpty();
    grip.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      itemMatrix.identity();
      for (let o: THREE.Object3D = object; o !== grip; o = o.parent!) {
        o.updateMatrix();
        itemMatrix.premultiply(o.matrix);
      }
      itemBox.union(meshBox.copy(object.geometry.boundingBox!).applyMatrix4(itemMatrix));
    });
    return itemBox.isEmpty() ? null : itemBox;
  };
  // Turns a segment (in the character's frame) from where it points now towards `want`.
  const now = new THREE.Vector3();
  const aimSegment = (object: THREE.Object3D, rest: ReturnType<typeof segment>, want: THREE.Vector3, amount: number) => {
    frameQuat(object, current);
    now.copy(rest.direction).applyQuaternion(q.copy(current).multiply(rest.inverse));
    target.setFromUnitVectors(now, want).multiply(current);
    setFrameQuat(object, current.slerp(target, amount));
  };

  const q = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const torso = new THREE.Quaternion();
  const target = new THREE.Quaternion();
  const current = new THREE.Quaternion();
  const shoulderAngles = new THREE.Euler();
  const elbowAngles = new THREE.Euler();
  const position = new THREE.Vector3();
  const other = new THREE.Vector3();
  const headGrip = new THREE.Vector3();
  const itemCenter = new THREE.Vector3();
  const handGoal = new THREE.Vector3();
  const shoulder = new THREE.Vector3();
  const toGoal = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const upperDirection = new THREE.Vector3();
  const foreDirection = new THREE.Vector3();
  const tune = (angles: THREE.Euler, offset: readonly number[]) =>
    angles.set(
      angles.x * GLB_ARM_SIGN[0] + offset[0],
      angles.y * GLB_ARM_SIGN[1] + offset[1],
      angles.z * GLB_ARM_SIGN[2] + offset[2],
    );
  let lastSeconds: number | null = null;

  return {
    body,
    animate(state, grip) {
      for (const { object, position, quaternion } of overridden) {
        object.position.copy(position);
        object.quaternion.copy(quaternion);
      }
      // Clamped: `seconds` may jump or freeze (reduced motion passes 0).
      const delta = lastSeconds === null ? 0 : THREE.MathUtils.clamp(state.seconds - lastSeconds, 0, 0.1);
      lastSeconds = state.seconds;

      // Stand at stride 0, otherwise walk or run; weights fade linearly and are normalised.
      const moving = state.stride !== 0;
      const goal = { stand: moving ? 0 : 1, walk: moving && !state.running ? 1 : 0, run: moving && state.running ? 1 : 0 };
      const step = delta / GLB_CROSSFADE_SECONDS;
      let total = 0;
      for (const name of clips) {
        weights[name] += THREE.MathUtils.clamp(goal[name] - weights[name], -step, step);
        total += weights[name];
      }
      for (const name of clips) actions[name].setEffectiveWeight(weights[name] / total);
      const standing = weights.stand / total;
      mixer.update(delta);
      for (const { object, position, quaternion } of overridden) {
        position.copy(object.position);
        quaternion.copy(object.quaternion);
      }
      hips.position.add(hipsDrop);

      // Overrides on top of the clip: lift bend and breathing on the spine, a head wobble.
      const breath = Math.sin(state.seconds * Math.PI * 2 / BREATH_SECONDS);
      const lift = state.liftProgress === null ? null : liftPose(state.liftProgress);
      turn.setFromAxisAngle(X_AXIS, (lift?.bend ?? 0) * BEND_ANGLE * GLB_BEND_SIGN);
      setFrameQuat(spine, frameQuat(spine, q).premultiply(turn));
      toRoot(hips, toRootMatrix);
      position.copy(spine.position).applyMatrix4(toRootMatrix);
      position.y += (breath + 1) * 0.008;
      spine.position.copy(position.applyMatrix4(toRootMatrix.invert()));
      turn.setFromEuler(shoulderAngles.set(breath * 0.025, 0, Math.sin(state.seconds * 0.8) * 0.035));
      setFrameQuat(head, frameQuat(head, q).premultiply(turn));

      // Arms follow the fallback's angles, relative to the (clip-driven) torso.
      // Walking arms stay on the clip; standing, holding or waving takes them over.
      frameQuat(spine2, torso).multiply(spine2RestInverse);
      const holding = state.pose === "carrying" || !!lift;
      const base = lift?.arms ?? (state.pose === "carrying" ? ARM_POSES.carrying : ARM_POSES.rest);
      arms.forEach(({ side, arm, foreArm }, i) => {
        const weight = holding || (side === 1 && state.pose === "waving") ? 1 : standing;
        if (weight === 0) return;
        poseArm(side, base, holding, breath, state, shoulderAngles, elbowAngles);
        q.copy(torso).multiply(turn.setFromEuler(tune(shoulderAngles, GLB_SHOULDER_OFFSET)));
        setFrameQuat(arm, frameQuat(arm, current).slerp(target.copy(q).multiply(armRest[i].arm.hang), weight));
        q.multiply(turn.setFromEuler(tune(elbowAngles, GLB_ELBOW_OFFSET)));
        setFrameQuat(foreArm, frameQuat(foreArm, current).slerp(target.copy(q).multiply(armRest[i].foreArm.hang), weight));
      });

      // Holding: the angle pose above only sets the twist and starting line;
      // each arm is then aimed (two-bone IK) at a point beside the item.
      const rise = state.liftProgress !== null ? liftRise(state.liftProgress) : state.pose === "carrying" ? 1 : 0;
      const aim = !holding ? 0 : state.liftProgress !== null && state.liftProgress < LIFT_GRAB ? smooth(state.liftProgress / LIFT_GRAB) : 1;
      rootPosition(headTop, headGrip).add(GLB_HEAD_CARRY_OFFSET);
      const item = aim > 0 ? measureItem(grip) : null;
      const halfWidth = item ? (item.max.x - item.min.x) / 2 : CARRY_WIDTH / 2;
      if (item) item.getCenter(itemCenter);
      else itemCenter.set(0, CARRY_HEIGHT / 2, 0);
      arms.forEach((limb, i) => {
        const rest = armRest[i];
        let reachGoal = 1;
        if (aim > 0) {
          const out = limb.side * (halfWidth + HAND_GAP);
          handGoal.set(out, GRAB_TARGET.y, GRAB_TARGET.z)
            .lerp(other.copy(headGrip).add(itemCenter).add(position.set(out, -HAND_DROP, 0)), rise);
          handGoal.z += RAISE_FORWARD * Math.sin(Math.PI * rise);
          rootPosition(limb.arm, shoulder);
          const distance = toGoal.subVectors(handGoal, shoulder).length();
          const span = Math.sqrt(rest.arm.length ** 2 + rest.foreArm.length ** 2
            + 2 * rest.arm.length * rest.foreArm.length * Math.cos(ELBOW_BEND));
          reachGoal = THREE.MathUtils.lerp(1, THREE.MathUtils.clamp(distance / span, 1, MAX_REACH), aim);
        }
        limb.reach = delta > 0
          ? reachGoal + (limb.reach - reachGoal) * Math.exp(-delta / GLB_REACH_EASE_SECONDS)
          : reachGoal;
        const thickness = LIMB_WIDTH_SCALE * limb.reach ** ARM_THICKEN_EXPONENT;
        limb.scale.set(thickness, limb.reach, thickness);
        if (aim === 0) return;

        // Elbow on the ELBOW_POLE side of the shoulder→goal line, bent at least ELBOW_BEND.
        const upper = rest.arm.length * limb.reach;
        const fore = rest.foreArm.length * limb.reach;
        const distance = toGoal.length();
        toGoal.divideScalar(distance);
        const span = THREE.MathUtils.clamp(distance, Math.abs(upper - fore) + 1e-4,
          Math.sqrt(upper * upper + fore * fore + 2 * upper * fore * Math.cos(ELBOW_BEND)));
        const cosine = THREE.MathUtils.clamp((upper * upper + span * span - fore * fore) / (2 * upper * span), -1, 1);
        pole.copy(ELBOW_POLE).addScaledVector(toGoal, -ELBOW_POLE.dot(toGoal));
        if (pole.lengthSq() < 1e-8) pole.set(0, 0, -1);
        pole.normalize();
        upperDirection.copy(toGoal).multiplyScalar(cosine).addScaledVector(pole, Math.sqrt(1 - cosine * cosine));
        foreDirection.copy(toGoal).multiplyScalar(span).addScaledVector(upperDirection, -upper).normalize();
        aimSegment(limb.arm, rest.arm, upperDirection, aim);
        aimSegment(limb.foreArm, rest.foreArm, foreDirection, aim);
      });
      applyShape();

      // Between the hands while grabbing, sliding up onto the head as the item is raised.
      rootPosition(arms[0].hand, position).add(rootPosition(arms[1].hand, other)).multiplyScalar(0.5);
      grip.position.lerpVectors(position, headGrip, rise);
    },
  };
}

// Returns at once with the sculpted child, swapped for the rigged GLB model
// as soon as it has loaded (immediately if already cached).
export function createChildCharacter() {
  const root = new THREE.Group();
  root.name = "child-character";
  // Updated every frame: a carried item rides here.
  const grip = new THREE.Group();
  root.add(grip);

  const state: AnimState = { pose: "walking", liftProgress: null, doorReach: 0, running: false, seconds: 0, stride: 0 };
  let animated = false;
  const glbRig = (gltf: GLTF) => {
    try {
      return createGlbRig(gltf);
    } catch (error) {
      console.warn("Keeping the sculpted character:", error);
      return null;
    }
  };
  let rig = (glbLoaded && glbRig(glbLoaded)) || createShapeRig();
  root.add(rig.body);
  if (!glbLoaded) {
    loadGlb().then((gltf) => {
      const next = glbRig(gltf);
      if (!next) return;
      root.remove(rig.body);
      disposeObject(rig.body);
      rig = next;
      root.add(rig.body);
      if (animated) rig.animate(state, grip);
    }).catch((error) => console.warn("Keeping the sculpted character:", error));
  }

  return {
    root,
    grip,
    setPose(next: CharacterPose) {
      state.pose = next;
    },
    setDoorReach(progress: number) { state.doorReach = THREE.MathUtils.clamp(progress, 0, 1); },
    setRunning(next: boolean) { state.running = next; },
    // Pick-up progress in [0, 1], or null when not picking anything up.
    setLift(progress: number | null) {
      state.liftProgress = progress;
    },
    // `seconds` drives breathing, waving and the walk clips; `stride` in
    // [-1, 1] swings the legs mid-walk and is 0 while standing.
    animate(seconds: number, stride = 0, greetingProgress?: number) {
      Object.assign(state, { seconds, stride, greetingProgress });
      animated = true;
      rig.animate(state, grip);
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
