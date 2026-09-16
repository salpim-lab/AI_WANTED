import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { Box3, Matrix4, Vector3 } from "three";
const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false });
const { createRockCliff, rockBoxInside, ROCK_VARIANTS } = await jiti.import("../rockCliff.ts");
const { createIslandLayout } = await jiti.import("../placement.ts");
const { getPuzzleLayout, getPuzzlePiecePolygon, puzzlePieceContains, getPuzzleTerrainMetrics } = await jiti.import("../puzzle.ts");

test("all 20 pieces in both modes contain every complete stone bounding box", () => {
  const layout = createIslandLayout(17);
  for (const mode of ["personal", "classroom"]) for (const piece of getPuzzleLayout(layout).pieces) {
    const cliff = createRockCliff(layout, piece.index, mode);
    const polygon = getPuzzlePiecePolygon(piece);
    const metrics = getPuzzleTerrainMetrics(layout, piece.index, mode);
    const instances = cliff.children.filter(mesh => mesh.isInstancedMesh);
    assert.equal(instances.length, ROCK_VARIANTS);
    for (const mesh of instances) {
      assert.equal(mesh.material.flatShading, true);
      assert.equal(mesh.material.transparent, false);
      assert.equal(mesh.material.fog, false);
      assert.equal(mesh.material.map, null);
      assert.equal(mesh.geometry.getAttribute("color"), undefined);
      for (let i = 0; i < mesh.count; i++) {
        const matrix = new Matrix4(); mesh.getMatrixAt(i, matrix);
        const box = mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
        assert.ok(rockBoxInside(box, polygon, p => puzzlePieceContains(piece, p)), `${mode} piece ${piece.index} instance ${i}`);
        assert.ok(box.min.y >= layout.surfaceY + 0.015 - metrics.total - 1e-5);
      }
      mesh.geometry.dispose();
    }
    instances[0].material.dispose();
    cliff.children[0].geometry.dispose(); cliff.children[0].material.dispose();
  }
});

test("a concave notch crossing an AABB is rejected even when all four corners are inside", () => {
  const polygon = [{x:0,z:0},{x:4,z:0},{x:4,z:4},{x:2.2,z:4},{x:2.2,z:1},{x:1.8,z:1},{x:1.8,z:4},{x:0,z:4}];
  const box = new Box3(new Vector3(1,0,0.5), new Vector3(3,1,3));
  assert.equal(rockBoxInside(box, polygon, () => true), false);
});
