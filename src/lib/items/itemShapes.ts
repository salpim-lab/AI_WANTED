import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Extra shape families. Existing box/ellipsoid/pyramid accept their variants through parameters. */
export type ExtendedShape =
  | { shape: "sphere" | "hemisphere"; radius: number }
  | { shape: "ellipticCylinder"; radiusX: number; radiusZ: number; height: number }
  | { shape: "prism"; radius: number; height: number; sides: number }
  | { shape: "cone"; radius: number; height: number }
  | { shape: "frustum"; radiusTop: number; radiusBottom: number; height: number }
  | { shape: "capsule"; radius: number; length: number }
  | { shape: "torus"; radius: number; tubeRadius: number }
  | { shape: "torusArc"; radius: number; tubeRadius: number; arc: number }
  | { shape: "curvedPlate"; width: number; height: number; depth: number; bend: number }
  | { shape: "hollowContainer"; radiusTop: number; radiusBottom: number; height: number; wallThickness: number; bottomThickness: number };

export function parseExtendedShape(p: Record<string, unknown>): ExtendedShape {
  const n = (key: string, min = 0, max = Infinity): number => {
    const v = p[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${key}는 ${min}~${max} 숫자여야 해요.`);
    return v;
  };
  const d = (key: string): number => {
    const value = n(key);
    if (value === 0) throw new Error(`${key}는 0보다 커야 해요.`);
    return value;
  };
  switch (p.shape) {
    case "sphere": case "hemisphere": return { shape: p.shape, radius: d("radius") };
    case "ellipticCylinder": return { shape: p.shape, radiusX: d("radiusX"), radiusZ: d("radiusZ"), height: d("height") };
    case "prism": {
      const sides = n("sides", 3, 12);
      if (!Number.isInteger(sides)) throw new Error("sides는 정수여야 해요.");
      return { shape: p.shape, radius: d("radius"), height: d("height"), sides };
    }
    case "cone": return { shape: p.shape, radius: d("radius"), height: d("height") };
    case "frustum": return { shape: p.shape, radiusTop: n("radiusTop"), radiusBottom: d("radiusBottom"), height: d("height") };
    case "capsule": return { shape: p.shape, radius: d("radius"), length: n("length") };
    case "torus": case "torusArc": {
      const radius = d("radius"), tubeRadius = d("tubeRadius");
      return p.shape === "torus" ? { shape: p.shape, radius, tubeRadius } : { shape: p.shape, radius, tubeRadius, arc: n("arc", 0.1, Math.PI * 2) };
    }
    case "curvedPlate": return { shape: p.shape, width: d("width"), height: d("height"), depth: d("depth"), bend: n("bend", -Math.PI, Math.PI) };
    case "hollowContainer": {
      const radiusTop = d("radiusTop"), radiusBottom = d("radiusBottom"), height = d("height");
      // Preserve a hollow interior without rejecting the whole generated item.
      const wallThickness = Math.min(d("wallThickness"), Math.min(radiusTop, radiusBottom) * 0.99);
      const bottomThickness = Math.min(n("bottomThickness"), height * 0.99);
      return { shape: p.shape, radiusTop, radiusBottom, height, wallThickness, bottomThickness };
    }
    default: throw new Error("지원하지 않는 도형이에요. 도형 목록을 확인해 주세요.");
  }
}

function merged(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  if (!geometry) throw new Error("도형을 결합하지 못했어요.");
  return geometry;
}

export function createExtendedGeometry(p: ExtendedShape): THREE.BufferGeometry {
  switch (p.shape) {
    case "sphere": return new THREE.SphereGeometry(p.radius, 24, 16);
    case "hemisphere": {
      const dome = new THREE.SphereGeometry(p.radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const bottom = new THREE.CircleGeometry(p.radius, 24).rotateX(Math.PI / 2);
      return merged([dome, bottom]);
    }
    case "ellipticCylinder": return new THREE.CylinderGeometry(1, 1, p.height, 24).scale(p.radiusX, 1, p.radiusZ);
    case "prism": return new THREE.CylinderGeometry(p.radius, p.radius, p.height, p.sides);
    case "cone": return new THREE.ConeGeometry(p.radius, p.height, 24);
    case "frustum": return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 24);
    case "capsule": return new THREE.CapsuleGeometry(p.radius, p.length, 8, 20);
    case "torus": return new THREE.TorusGeometry(p.radius, p.tubeRadius, 12, 40);
    case "torusArc": {
      const arc = new THREE.TorusGeometry(p.radius, p.tubeRadius, 12, 40, p.arc);
      const start = new THREE.CircleGeometry(p.tubeRadius, 12).rotateX(Math.PI / 2).translate(p.radius, 0, 0);
      const end = new THREE.CircleGeometry(p.tubeRadius, 12).rotateX(-Math.PI / 2).rotateZ(p.arc).translate(p.radius * Math.cos(p.arc), p.radius * Math.sin(p.arc), 0);
      return merged([arc, start, end]);
    }
    case "curvedPlate": {
      // Bend about local Y. Thickness is carried along the curved surface normal.
      const geometry = new THREE.BoxGeometry(p.width, p.height, p.depth, 20, 1, 1);
      if (Math.abs(p.bend) > 0.0001) {
        const position = geometry.getAttribute("position"), radius = p.width / p.bend;
        for (let i = 0; i < position.count; i++) {
          const angle = position.getX(i) / radius, z = position.getZ(i);
          position.setXYZ(i, (radius + z) * Math.sin(angle), position.getY(i), (radius + z) * Math.cos(angle) - radius);
        }
        geometry.computeVertexNormals();
      }
      return geometry;
    }
    case "hollowContainer": {
      const bottomY = -p.height / 2, topY = p.height / 2;
      const innerBottomY = bottomY + p.bottomThickness;
      const innerBottomRadius = p.radiusBottom + (p.radiusTop - p.radiusBottom) * p.bottomThickness / p.height - p.wallThickness;
      const profile = p.bottomThickness === 0
        ? [[p.radiusBottom - p.wallThickness, bottomY], [p.radiusBottom, bottomY], [p.radiusTop, topY], [p.radiusTop - p.wallThickness, topY], [p.radiusBottom - p.wallThickness, bottomY]]
        : [[0, bottomY], [p.radiusBottom, bottomY], [p.radiusTop, topY], [p.radiusTop - p.wallThickness, topY], [innerBottomRadius, innerBottomY], [0, innerBottomY]];
      return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 32);
    }
  }
}
