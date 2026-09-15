import { Camera, Vector3 } from "three";

// Keep the light's screen X/Y fixed at upper left. Adapt only its depth to
// elevation so it remains above ground and behind the island at every angle.
const cameraOffset = new Vector3(-8, 10, 5);
const backward = new Vector3();
export function screenSunPosition(camera: Camera, target: Vector3, distanceScale: number, result = new Vector3()): Vector3 {
  backward.set(0, 0, 1).applyQuaternion(camera.quaternion);
  const sine = Math.max(0, Math.min(1, backward.y));
  const cosine = Math.sqrt(1 - sine * sine);
  cameraOffset.z = 5 * (sine - cosine);
  return result.copy(cameraOffset).applyQuaternion(camera.quaternion).multiplyScalar(distanceScale).add(target);
}
