import { Box3, MathUtils, OrthographicCamera, Vector3 } from "three";
import { islandCoordinates } from "./puzzle";

export type IslandCameraMode = "island" | "classroom";
export type ScreenRect = { left: number; right: number; top: number; bottom: number };

export function boxCorners(box: Box3) {
  const { min, max } = box;
  return [min.x, max.x].flatMap((x) => [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => new Vector3(x, y, z))));
}

function safeScreenRect(width: number, height: number, mode: IslandCameraMode): ScreenRect {
  const narrow = width < 500;
  const side = narrow ? 12 : 20;
  // Header badges end below the title. The camera controls and placement
  // toolbar occupy the bottom strip; this inset is within the canvas itself.
  const top = narrow ? 112 : mode === "island" ? 116 : 108;
  const bottom = narrow ? 88 : 68;
  return { left: side, right: width - side, top, bottom: height - bottom };
}

export function projectedBoxRect(box: Box3, camera: OrthographicCamera, width: number, height: number): ScreenRect {
  camera.updateMatrixWorld(true);
  const pixels = boxCorners(box).map((corner) => corner.project(camera));
  return {
    left: Math.min(...pixels.map((point) => (point.x + 1) * width / 2)),
    right: Math.max(...pixels.map((point) => (point.x + 1) * width / 2)),
    top: Math.min(...pixels.map((point) => (1 - point.y) * height / 2)),
    bottom: Math.max(...pixels.map((point) => (1 - point.y) * height / 2)),
  };
}

export function fitIslandCamera(box: Box3, width: number, height: number, mode: IslandCameraMode) {
  if (box.isEmpty() || width <= 0 || height <= 0) throw new Error("Camera fit needs a nonempty island box and canvas size");
  const rawCentre = box.getCenter(new Vector3());
  const target = islandCoordinates.toWorld(islandCoordinates.toData(rawCentre), rawCentre.y);
  const size = box.getSize(new Vector3());
  // Orthographic apparent size is independent of distance; this offset keeps
  // clipping planes well clear of the tallest tree and lowest bottom rock.
  const distance = size.length() * 2.2 + 5;
  const back = new Vector3().setFromSphericalCoords(1, Math.PI / 2 - MathUtils.degToRad(35), Math.PI / 4);
  const home = target.clone().addScaledVector(back, distance);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, distance * 4);
  camera.position.copy(home);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);

  // Project all eight world-box corners onto the camera's right/up axes.
  // Fitting the box is conservative even for irregular puzzle silhouettes.
  const view = boxCorners(box).map((corner) => corner.applyMatrix4(camera.matrixWorldInverse));
  const visibleWidth = Math.max(...view.map((point) => point.x)) - Math.min(...view.map((point) => point.x));
  const visibleHeight = Math.max(...view.map((point) => point.y)) - Math.min(...view.map((point) => point.y));
  const safe = safeScreenRect(width, height, mode);
  const safeHeight = Math.max(1, safe.bottom - safe.top);
  // Width aims for 60% of the canvas; portrait views may be height-limited.
  const unitsPerPixel = Math.max(visibleWidth / (width * 0.6), visibleHeight / (safeHeight * 0.98));
  const xShift = (width / 2 - (safe.left + safe.right) / 2) * unitsPerPixel;
  const yShift = ((safe.top + safe.bottom) / 2 - height / 2) * unitsPerPixel;
  camera.left = -width * unitsPerPixel / 2 + xShift;
  camera.right = width * unitsPerPixel / 2 + xShift;
  camera.top = height * unitsPerPixel / 2 + yShift;
  camera.bottom = -height * unitsPerPixel / 2 + yShift;
  camera.updateProjectionMatrix();
  const projected = projectedBoxRect(box, camera, width, height);
  const widthRatio = (projected.right - projected.left) / width;
  const insideSafe = projected.left >= safe.left - 1e-6 && projected.right <= safe.right + 1e-6
    && projected.top >= safe.top - 1e-6 && projected.bottom <= safe.bottom + 1e-6;
  const minZoom = 0.78;
  const centreX = (projected.left + projected.right) / 2;
  const centreY = (projected.top + projected.bottom) / 2;
  // User-initiated zoom may cross the overlay safe strip, but the complete
  // box stays on the canvas with an 8px edge. Home always restores safe fit.
  const maxZoom = Math.max(1, Math.min(1.8,
    (centreX - 8) / ((centreX - projected.left) || 1),
    (width - centreX - 8) / ((projected.right - centreX) || 1),
    (centreY - 8) / ((centreY - projected.top) || 1),
    (height - centreY - 8) / ((projected.bottom - centreY) || 1),
  ) * 0.96);
  return { camera, home, target, safe, projected, widthRatio, insideSafe, distance, minZoom, maxZoom };
}

export function tweenCameraPose(from: Vector3, to: Vector3, fromZoom: number, toZoom: number, progress: number) {
  const t = MathUtils.clamp(progress, 0, 1);
  const eased = 1 - (1 - t) ** 3;
  return { position: from.clone().lerp(to, eased), zoom: MathUtils.lerp(fromZoom, toZoom, eased) };
}
