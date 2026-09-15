import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { createProceduralModel, propKey, type PropKey } from "./landscapeProps";
import type { PropKind } from "./pieceLandscape";

// Poly Pizza (Quaternius, CC0) models cleaned up in Blender: parts joined,
// material colours baked to vertex colours, decimated, meshopt-compressed.
// Sources and licences: public/models/island/CREDITS.md.
export const ISLAND_MODEL_BASE = "/models/island/";

// "box": stretch to the procedural unit box (stairs, bridge, fence, rocks,
// bushes); "height"/"footprint": uniform scale matching the procedural
// model's height (trees) or widest footprint (houses).
type Fit = "box" | "height" | "footprint";
type AssetSpec = { file: string; fit: Fit; tint?: string };

export const ISLAND_ASSETS: Partial<Record<PropKey, AssetSpec>> = {
  "house:0": { file: "house-0.glb", fit: "footprint" },
  "house:1": { file: "house-1.glb", fit: "footprint" },
  "house:2": { file: "house-2.glb", fit: "footprint" },
  "broadleaf:0": { file: "broadleaf-0.glb", fit: "height" },
  "broadleaf:1": { file: "broadleaf-1.glb", fit: "height" },
  "broadleaf:2": { file: "broadleaf-0.glb", fit: "height", tint: "#cfe89a" },
  "conifer:0": { file: "conifer-0.glb", fit: "height" },
  "conifer:1": { file: "conifer-1.glb", fit: "height" },
  "conifer:2": { file: "conifer-2.glb", fit: "height" },
  "bush:0": { file: "bush-0.glb", fit: "box" },
  "bush:1": { file: "bush-0.glb", fit: "box", tint: "#d8f0a8" },
  "bush:2": { file: "bush-0.glb", fit: "box", tint: "#b8d890" },
  "boulder:0": { file: "boulder-0.glb", fit: "box" },
  "boulder:1": { file: "boulder-1.glb", fit: "box" },
  "boulder:2": { file: "boulder-2.glb", fit: "box" },
  "stone:0": { file: "stone-0.glb", fit: "box" },
  "stone:1": { file: "boulder-2.glb", fit: "box", tint: "#f0e2cc" },
  "stone:2": { file: "boulder-1.glb", fit: "box", tint: "#f0e2cc" },
  "stairs:0": { file: "stairs-0.glb", fit: "box" },
  "bridge:0": { file: "bridge-0.glb", fit: "box" },
  "fence:0": { file: "fence-0.glb", fit: "box" },
};

// Each file is fetched and decoded once per page, whatever the view.
const fileCache = new Map<string, Promise<THREE.BufferGeometry>>();
let libraryPromise: Promise<Map<PropKey, THREE.BufferGeometry>> | null = null;

function loader() {
  const gltf = new GLTFLoader();
  gltf.setMeshoptDecoder(MeshoptDecoder);
  return gltf;
}

// Meshopt output may be quantized/interleaved; bring every attribute back to
// plain Float32 so geometry can be transformed and instanced like the rest.
function toFloat(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, itemSize = attribute.itemSize) {
  const array = new Float32Array(attribute.count * itemSize);
  for (let i = 0; i < attribute.count; i++) for (let c = 0; c < itemSize; c++) array[i * itemSize + c] = attribute.getComponent(i, c);
  return new THREE.Float32BufferAttribute(array, itemSize);
}

function loadFile(file: string) {
  let pending = fileCache.get(file);
  if (!pending) {
    pending = loader().loadAsync(ISLAND_MODEL_BASE + file).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const parts: THREE.BufferGeometry[] = [];
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const source = object.geometry as THREE.BufferGeometry;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", toFloat(source.getAttribute("position")));
        const color = source.getAttribute("color");
        geometry.setAttribute("color", color ? toFloat(color, 3) : new THREE.Float32BufferAttribute(new Float32Array(source.getAttribute("position").count * 3).fill(0.8), 3));
        if (source.index) geometry.setIndex(Array.from(source.index.array));
        parts.push(geometry.toNonIndexed().applyMatrix4(object.matrixWorld));
        geometry.dispose();
      });
      if (!parts.length) throw new Error(`No mesh in ${file}`);
      const merged = parts.length === 1 ? parts[0] : mergeParts(parts);
      merged.computeVertexNormals();
      merged.computeBoundingBox();
      return merged;
    });
    fileCache.set(file, pending);
  }
  return pending;
}

function mergeParts(parts: THREE.BufferGeometry[]) {
  const count = parts.reduce((sum, part) => sum + part.getAttribute("position").count, 0);
  const position = new Float32Array(count * 3), color = new Float32Array(count * 3);
  let offset = 0;
  for (const part of parts) {
    position.set(part.getAttribute("position").array as Float32Array, offset * 3);
    color.set(part.getAttribute("color").array as Float32Array, offset * 3);
    offset += part.getAttribute("position").count;
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
  return geometry;
}

function radialReach(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  let reach = 0;
  for (let i = 0; i < position.count; i++) reach = Math.max(reach, Math.hypot(position.getX(i), position.getZ(i)));
  return reach;
}

// Fit a loaded model to the procedural model's box so every plan scale,
// footprint and orientation (front toward +Z) stays valid.
function fitToProcedural(source: THREE.BufferGeometry, kind: PropKind, variant: number, spec: AssetSpec) {
  const reference = createProceduralModel(kind, variant);
  reference.computeBoundingBox();
  const target = reference.boundingBox!.getSize(new THREE.Vector3());
  const targetCentre = reference.boundingBox!.getCenter(new THREE.Vector3());
  const geometry = source.clone();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const size = bounds.getSize(new THREE.Vector3());
  geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
  if (spec.fit === "box") geometry.scale(target.x / size.x, target.y / size.y, target.z / size.z);
  else {
    const s = spec.fit === "height" ? target.y / size.y : Math.max(target.x, target.z) / Math.max(size.x, size.z);
    geometry.scale(s, s, s);
  }
  // Box-fitted units (stairs, bridge, fence) also keep the reference centre.
  if (spec.fit === "box") geometry.translate(targetCentre.x, 0, targetCentre.z);
  // Never reach wider than the procedural model: the plan's containment
  // footprints (PROP_REACH) are measured from those.
  const limit = radialReach(reference), current = radialReach(geometry);
  if (current > limit) {
    const shrink = limit / current;
    geometry.scale(shrink, spec.fit === "box" ? 1 : shrink, shrink);
  }
  if (spec.tint) {
    const tint = new THREE.Color(spec.tint);
    const color = geometry.getAttribute("color");
    for (let i = 0; i < color.count; i++) color.setXYZ(i, color.getX(i) * tint.r, color.getY(i) * tint.g, color.getZ(i) * tint.b);
  }
  reference.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Resolves to every model that loaded; a missing file just keeps its
// procedural stand-in, so the island never waits on or breaks for assets.
export function loadIslandPropLibrary() {
  libraryPromise ??= Promise.all(Object.entries(ISLAND_ASSETS).map(async ([key, spec]) => {
    const [kind, variant] = key.split(":") as [PropKind, string];
    try {
      const source = await loadFile(spec!.file);
      return [key as PropKey, fitToProcedural(source, kind, Number(variant), spec!)] as const;
    } catch (error) {
      console.warn(`[island assets] ${spec!.file} unavailable, using the procedural model`, error);
      return null;
    }
  })).then((entries) => new Map(entries.filter((entry): entry is readonly [PropKey, THREE.BufferGeometry] => !!entry)));
  return libraryPromise;
}

export { propKey };
