import * as THREE from "three";

// Side decorations (moss, tufts) are seated on the rock the player actually
// sees, not on the puzzle outline: the stones are yawed, chiselled and pushed
// inward where a tab turns, so the outline is often a fair way in front of
// the wall and anything placed on it hangs in the air.
//
// A probe casts one horizontal ray per candidate from just outside the
// outline straight inward and takes the first stone it meets. It runs once,
// while the piece is built; nothing here is called per frame.
export const WALL_PROBE = {
  // Ray start outside the outline and extra reach inside it, both as a
  // fraction of the rock height. Stones sit at most ~0.36 H deep.
  standoff: 0.08,
  reach: 0.6,
  // A face steeper than this (|normal.y|) is a ledge top or an underside,
  // not wall, so nothing is seated on it.
  maxSlope: 0.55,
  // Neighbour rays either side of a hit, in units of the decoration's size;
  // a hit deeper than its neighbours is a crevice and scores higher.
  crevice: 0.9,
  // How much of the decoration's size is sunk into the rock along -normal.
  embed: [0.1, 0.2] as const,
} as const;

export type WallHit = {
  point: THREE.Vector3;
  // Face normal, outward from the rock, in the probe's space.
  normal: THREE.Vector3;
  // How much deeper this hit is than its neighbours (world units, ≥ 0 means recessed).
  recess: number;
};

// A volume that decorations must stay out of: a hanging grass lump, given as
// its instance matrix (and inverse) and its geometry's local box.
export type WallBlocker = { matrix: THREE.Matrix4; inverse: THREE.Matrix4; box: THREE.Box3 };

const UP = new THREE.Vector3(0, 1, 0);

// `cliff` is the rock group; hits come back in the space of its parent (or of
// the cliff itself when it has no parent yet), the same space its sibling
// decoration meshes are built in.
export function createWallProbe(cliff: THREE.Object3D, rockHeight: number, options: { ceiling?: number; blockers?: WallBlocker[] } = {}) {
  cliff.updateMatrixWorld(true);
  const stones = cliff.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);
  const toWorld = cliff.parent ? cliff.parent.matrixWorld.clone() : new THREE.Matrix4();
  const toLocal = toWorld.clone().invert();
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3(), direction = new THREE.Vector3();
  const instance = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3();
  const standoff = WALL_PROBE.standoff * rockHeight;
  raycaster.far = standoff + WALL_PROBE.reach * rockHeight;

  // First stone along a horizontal inward ray from `at` (on the outline).
  function cast(at: THREE.Vector3, inward: THREE.Vector3) {
    direction.set(inward.x, 0, inward.z).normalize();
    origin.copy(at).addScaledVector(direction, -standoff).applyMatrix4(toWorld);
    raycaster.set(origin, direction.clone().transformDirection(toWorld));
    let best: THREE.Intersection | undefined;
    for (const mesh of stones) {
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (hit && (!best || hit.distance < best.distance)) best = hit;
    }
    if (!best?.face || best.instanceId === undefined) return null;
    const mesh = best.object as THREE.InstancedMesh;
    mesh.getMatrixAt(best.instanceId, instance);
    instance.premultiply(mesh.matrixWorld).premultiply(toLocal);
    const normal = best.face.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(instance)).normalize();
    // The hit came from outside, so the face must look back along the ray.
    if (normal.dot(direction) > 0) normal.negate();
    return { point: best.point.clone().applyMatrix4(toLocal), normal, depth: best.distance - standoff };
  }

  const blocked = (point: THREE.Vector3, margin: number) => {
    if (options.ceiling !== undefined && point.y + margin > options.ceiling) return true;
    const local = new THREE.Vector3(), nearest = new THREE.Vector3();
    return (options.blockers ?? []).some(({ matrix, inverse, box }) => {
      local.copy(point).applyMatrix4(inverse);
      // Lumps are scaled far more along their hang than across it, so the
      // margin is measured in world units from the nearest point of the box.
      box.clampPoint(local, nearest);
      if (nearest.equals(local)) return true;
      return nearest.applyMatrix4(matrix).distanceTo(point) < margin;
    });
  };

  // Seat a decoration of `size` on the wall behind `at`. Returns null when
  // there is no rock there, the face is not wall, or the spot is under the
  // grass roll or a hanging lump.
  function seat(at: THREE.Vector3, inward: THREE.Vector3, size: number): WallHit | null {
    const hit = cast(at, inward);
    if (!hit || Math.abs(hit.normal.y) > WALL_PROBE.maxSlope) return null;
    if (blocked(hit.point, size * 0.6)) return null;
    // Neighbours along the wall: a crevice is deeper than both sides.
    const along = new THREE.Vector3().crossVectors(UP, inward).setY(0).normalize().multiplyScalar(size * WALL_PROBE.crevice);
    const sides = [1, -1].map((sign) => cast(at.clone().addScaledVector(along, sign), inward)?.depth ?? hit.depth);
    const recess = hit.depth - (sides[0] + sides[1]) / 2;
    return { point: hit.point, normal: hit.normal, recess };
  }

  return { seat };
}

// Basis for a decoration growing out of a wall face: local +z along the face
// normal, +y as close to world up as the face allows. The root is sunk
// `embed` of `size` into the rock along the normal.
export function wallMatrix(hit: WallHit, size: THREE.Vector3, embed: number, spin = new THREE.Matrix4()) {
  const z = hit.normal.clone();
  const y = UP.clone().addScaledVector(z, -UP.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const depth = Math.max(size.x, size.y, size.z) * embed;
  return new THREE.Matrix4().makeBasis(x, y, z)
    .multiply(spin)
    .scale(size)
    .setPosition(hit.point.clone().addScaledVector(z, -depth));
}

// Pick the `count` best candidates: crevices and recesses first, with a
// little seeded noise so a flat wall still spreads its picks out.
export function pickRecessed<T extends { hit: WallHit; size: number; noise: number }>(candidates: T[], count: number) {
  const score = (c: T) => c.hit.recess / Math.max(c.size, 1e-6) + c.noise * 0.35;
  return [...candidates].sort((a, b) => score(b) - score(a)).slice(0, count);
}
