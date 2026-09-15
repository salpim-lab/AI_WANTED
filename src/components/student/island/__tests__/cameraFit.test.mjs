import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { Box3, MathUtils, Vector3 } from "three";

const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false });
const { createPuzzlePieceModel, createPuzzleAssemblyModel } = await jiti.import("../islandModel.ts");
const { fitIslandCamera, projectedBoxRect, tweenCameraPose } = await jiti.import("../cameraFit.ts");

const screens = [[1440, 900], [1024, 768], [390, 844]];

test("both island views fit all eight box corners into their UI-safe screen area", () => {
  for (const [mode, model] of [["island", createPuzzlePieceModel(17, 12)], ["classroom", createPuzzleAssemblyModel(17)]]) {
    const bounds = new Box3().setFromObject(model.group);
    const centre = bounds.getCenter(new Vector3());
    for (const [width, height] of screens) {
      const fit = fitIslandCamera(bounds, width, height, mode);
      assert.ok(fit.target.distanceTo(centre) < 1e-8, `${mode} aims at complete group box centre`);
      assert.equal(fit.camera.zoom, 1);
      const diff = fit.home.clone().sub(fit.target);
      assert.ok(Math.abs(Math.atan2(diff.x, diff.z) - Math.PI / 4) < 1e-8);
      assert.ok(Math.abs(Math.asin(diff.y / diff.length()) - MathUtils.degToRad(35)) < 1e-8);
      const projected = projectedBoxRect(bounds, fit.camera, width, height);
      assert.equal(fit.insideSafe, true, `${mode} ${width}x${height} fits UI-safe rectangle`);
      assert.ok(projected.left >= fit.safe.left && projected.right <= fit.safe.right);
      assert.ok(projected.top >= fit.safe.top && projected.bottom <= fit.safe.bottom);
      assert.ok(fit.widthRatio >= 0.53 && fit.widthRatio <= 0.601, `${mode} width share ${fit.widthRatio}`);
      assert.ok(fit.maxZoom >= 1 && fit.maxZoom <= 1.8);
      assert.ok(fit.minZoom >= 0.7 && fit.minZoom < 1);
      const next = fitIslandCamera(bounds, height, width, mode);
      assert.ok(next.home.distanceTo(fit.home) < 1e-8, "resize does not alter the home direction or centre");
      assert.equal(next.insideSafe, true, "portrait/landscape refit stays visible");
    }
  }
});

test("the 500ms home interpolation ends exactly at its bounding-box preset", () => {
  const model = createPuzzlePieceModel(17, 12);
  const fit = fitIslandCamera(new Box3().setFromObject(model.group), 1024, 768, "island");
  const away = fit.home.clone().add(new Vector3(5, 3, -2));
  const halfway = tweenCameraPose(away, fit.home, 1.2, 1, 0.5);
  assert.ok(halfway.position.distanceTo(fit.home) > 0);
  const finished = tweenCameraPose(away, fit.home, 1.2, 1, 1);
  assert.ok(finished.position.distanceTo(fit.home) < 1e-8);
  assert.equal(finished.zoom, 1);
});

test("the unchanged character bubble anchor remains on-screen after the camera refit", () => {
  const model = createPuzzlePieceModel(17, 12);
  const bounds = new Box3().setFromObject(model.group);
  const seed = model.puzzle.pieces[12].seed;
  for (const [width, height] of screens) {
    const fit = fitIslandCamera(bounds, width, height, "island");
    // IslandScene's existing anchor is 1.86 character units, scaled by 1.5.
    const anchor = new Vector3(seed.x, model.layout.surfaceY + 0.02 + 1.86 * 1.5, seed.z).project(fit.camera);
    const x = (anchor.x + 1) * width / 2, y = (1 - anchor.y) * height / 2;
    assert.ok(anchor.z > -1 && anchor.z < 1);
    assert.ok(x > fit.safe.left && x < fit.safe.right);
    assert.ok(y > fit.safe.top && y < fit.safe.bottom);
  }
});
