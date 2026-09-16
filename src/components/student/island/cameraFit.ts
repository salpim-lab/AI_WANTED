import { Box3, MathUtils, OrthographicCamera, Vector3 } from "three";

export type IslandCameraMode = "island" | "classroom";
export type ScreenRect = { left: number; right: number; top: number; bottom: number };

export const HOME_ZOOM = 1.42;

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
  const bottom = narrow ? 96 : mode === "island" ? 86 : 72;
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
  const target = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  // Orthographic apparent size is independent of distance; this offset keeps
  // clipping planes well clear of the tallest tree and lowest bottom rock.
  const distance = size.length() * 2.2 + 5;
  // The personal piece is vertically narrow on desktop and needs a lower
  // angle on short landscape screens to keep its width near the 68% target.
  const elevation = mode === "island" ? 38 : 35;
  const azimuth = mode === "island" ? 0 : Math.PI / 4;
  const back = new Vector3().setFromSphericalCoords(1, Math.PI / 2 - MathUtils.degToRad(elevation), azimuth);
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
  // The personal island aims for roughly 68% of the canvas; the classroom
  // preview keeps its existing 60% framing. Portrait views may be height-limited.
  const widthTarget = mode === "island" ? 0.68 : 0.6;
  const unitsPerPixel = Math.max(visibleWidth / (width * widthTarget), visibleHeight / (safeHeight * 0.98));
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
  // Keep a little more room for the enlarged footprint when zooming out.
  const minZoom = 0.72;
  // Orthographic zoom controls apparent size; allow close inspection of
  // characters and gifts rather than keeping the whole island in frame.
  const maxZoom = 8;
  return { camera, home, target, safe, projected, widthRatio, insideSafe, distance, minZoom, maxZoom, homeZoom: HOME_ZOOM };
}

export function tweenCameraPose(from: Vector3, to: Vector3, fromZoom: number, toZoom: number, progress: number) {
  const t = MathUtils.clamp(progress, 0, 1);
  const eased = 1 - (1 - t) ** 3;
  return { position: from.clone().lerp(to, eased), zoom: MathUtils.lerp(fromZoom, toZoom, eased) };
}
