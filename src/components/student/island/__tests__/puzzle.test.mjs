import assert from "node:assert/strict";
import test from "node:test";
import { Box3, Mesh, MeshBasicMaterial, Raycaster, SphereGeometry, Vector3 } from "three";
import { createIslandLayout } from "../placement.ts";
import { createPuzzleLayout, createPuzzlePieceLayerGeometry, getPuzzleBottomRockSpecs, getPuzzlePiecePolygon, getPuzzleTerrainMetrics, getPuzzleTerrainRing, puzzleAreaStats, puzzlePieceContains, PUZZLE_PIECE_COUNT, PUZZLE_STUDENT_PIECE_MAP } from "../puzzle.ts";

test("rendered piece and raycast hits use the same XZ direction as puzzle data", () => {
  const island = createIslandLayout(17);
  const piece = createPuzzleLayout(island).pieces[PUZZLE_STUDENT_PIECE_MAP[1]];
  const geometry = createPuzzlePieceLayerGeometry(island, piece.index, "grass", "personal");
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  const raycaster = new Raycaster();
  const samples = [piece.seed, { x: piece.seed.x + 0.35, z: piece.seed.z }, { x: piece.seed.x, z: piece.seed.z - 0.35 }];
  for (const sample of samples) {
    assert.equal(puzzlePieceContains(piece, sample), true);
    raycaster.set(new Vector3(sample.x, 10, sample.z), new Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(mesh)[0];
    assert.ok(hit, `world XZ ${sample.x}, ${sample.z} hits rendered piece`);
    assert.equal(puzzlePieceContains(piece, { x: hit.point.x, z: hit.point.z }), true);
  }
  geometry.dispose();
  mesh.material.dispose();
});

test("20 rendered pieces keep one surface hit on each side of shared seams", () => {
  const island = createIslandLayout(17);
  const layout = createPuzzleLayout(island);
  const material = new MeshBasicMaterial();
  const meshes = layout.pieces.map((piece) => {
    const mesh = new Mesh(createPuzzlePieceLayerGeometry(island, piece.index, "grass", "classroom"), material);
    mesh.updateMatrixWorld(true);
    return mesh;
  });
  const raycaster = new Raycaster();
  const hitCount = (point) => {
    raycaster.set(new Vector3(point.x, 10, point.z), new Vector3(0, -1, 0));
    return raycaster.intersectObjects(meshes).length;
  };
  for (const piece of layout.pieces) assert.equal(hitCount(piece.seed), 1, `seed ${piece.index} has exactly one surface`);
  const seams = layout.pieces.flatMap((piece) => piece.edges.filter((edge) => edge.internal)).slice(0, 10);
  for (const edge of seams) {
    const path = edge.tab;
    const midpoint = path[Math.floor(path.length / 2)];
    const dx = edge.b.x - edge.a.x, dz = edge.b.z - edge.a.z;
    const length = Math.hypot(dx, dz);
    for (const direction of [-1, 1]) {
      const point = { x: midpoint.x + direction * -dz / length * 0.03, z: midpoint.z + direction * dx / length * 0.03 };
      assert.equal(hitCount(point), 1, `shared seam side has exactly one surface`);
    }
  }
  meshes.forEach((mesh) => mesh.geometry.dispose());
  material.dispose();
});

test("personal terrain depth, rounded rocks and taper are proportional to its own width", () => {
  const island = createIslandLayout(17);
  const index = PUZZLE_STUDENT_PIECE_MAP[1];
  const metrics = getPuzzleTerrainMetrics(island, index, "personal");
  assert.ok(Math.abs(metrics.grass / metrics.W - 0.03) < 1e-8);
  assert.ok(Math.abs(metrics.soil / metrics.W - 0.08) < 1e-8);
  assert.ok(Math.abs(metrics.rock / metrics.W - 0.17) < 1e-8);
  const box = new Box3();
  for (const layer of ["grass", "soil", "rock"]) {
    const geometry = createPuzzlePieceLayerGeometry(island, index, layer, "personal");
    box.union(geometry.boundingBox);
    geometry.dispose();
  }
  const sphere = new SphereGeometry(1, 20, 14);
  const specs = getPuzzleBottomRockSpecs(island, "personal", index);
  assert.equal(specs.length, 5);
  for (const spec of specs) {
    assert.ok(spec.height <= metrics.total * 0.3);
    const rock = new Mesh(sphere);
    rock.position.copy(spec.position);
    rock.scale.copy(spec.scale);
    rock.rotation.set(spec.rotation.x, spec.rotation.y, spec.rotation.z);
    rock.updateMatrixWorld(true);
    box.union(new Box3().setFromObject(rock));
  }
  sphere.dispose();
  const ratio = box.getSize(new Vector3()).y / metrics.W;
  assert.ok(ratio >= 0.25 && ratio <= 0.38, `height/width ${ratio}`);
  const top = getPuzzleTerrainRing(island, index, "rock", "personal", 0);
  const bottom = getPuzzleTerrainRing(island, index, "rock", "personal", 1);
  const width = (ring) => ((Math.max(...ring.map((p) => p.x)) - Math.min(...ring.map((p) => p.x))) + (Math.max(...ring.map((p) => p.z)) - Math.min(...ring.map((p) => p.z)))) / 2;
  assert.ok(Math.abs(width(bottom) / width(top) - 0.65) < 1e-5);
  const grassTop = getPuzzleTerrainRing(island, index, "grass", "personal", 0);
  assert.ok(grassTop.every((point) => Math.abs(point.y - (island.surfaceY + 0.015)) < 1e-8));
});

test("classroom internal seams stay vertical while only exterior cliffs taper", () => {
  const island = createIslandLayout(17);
  const layout = createPuzzleLayout(island);
  const key = (point) => `${point.x.toFixed(4)},${point.z.toFixed(4)}`;
  let internal = 0, exterior = 0;
  for (const piece of layout.pieces) {
    const top = getPuzzleTerrainRing(island, piece.index, "rock", "classroom", 0);
    const bottom = getPuzzleTerrainRing(island, piece.index, "rock", "classroom", 1);
    const topMap = new Map(top.map((point, index) => [key(point), index]));
    for (const edge of piece.edges) {
      if (edge.internal) {
        for (const point of edge.tab) {
          const index = topMap.get(key(point));
          if (index === undefined) continue;
          assert.ok(top[index].distanceTo(bottom[index]) > 0, "inner cliff has depth");
          assert.ok(Math.abs(top[index].x - bottom[index].x) < 1e-5);
          assert.ok(Math.abs(top[index].z - bottom[index].z) < 1e-5);
          internal++;
        }
      } else {
        const midpoint = { x: (edge.a.x + edge.b.x) / 2, z: (edge.a.z + edge.b.z) / 2 };
        const nearest = top.reduce((best, point, index) => point.distanceTo(new Vector3(midpoint.x, point.y, midpoint.z)) < top[best].distanceTo(new Vector3(midpoint.x, top[best].y, midpoint.z)) ? index : best, 0);
        if (Math.hypot(top[nearest].x - bottom[nearest].x, top[nearest].z - bottom[nearest].z) > 0.01) exterior++;
      }
    }
  }
  assert.ok(internal > 100, `checked ${internal} shared-edge vertices`);
  assert.ok(exterior > 20, `checked ${exterior} tapered exterior edges`);
});

test("all terrain contours avoid crossed socket walls and keep outward-facing caps", () => {
  const island = createIslandLayout(17);
  const layout = createPuzzleLayout(island);
  const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const intersects = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < -1e-8 && cross(c, d, a) * cross(c, d, b) < -1e-8;
  for (const mode of ["personal", "classroom"]) for (const piece of layout.pieces) {
    for (const t of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
      const ring = getPuzzleTerrainRing(island, piece.index, "rock", mode, t);
      for (let i = 0; i < ring.length; i++) for (let j = i + 2; j < ring.length; j++) {
        if (i === 0 && j === ring.length - 1) continue;
        assert.equal(intersects(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length]), false,
          `crossed rock wall: ${mode} piece ${piece.index} level ${t}, edges ${i}/${j}`);
      }
    }
    for (const layer of ["grass", "soil", "rock"]) {
      const geometry = createPuzzlePieceLayerGeometry(island, piece.index, layer, mode);
      const position = geometry.getAttribute("position");
      const index = geometry.getIndex();
      const ringSize = getPuzzleTerrainRing(island, piece.index, layer, mode, 0).length;
      const ringCount = layer === "rock" ? 9 : layer === "grass" ? 5 : 3;
      const sideIndexCount = (ringCount - 1) * ringSize * 6;
      const orientation = piece.polygon.reduce((area, p, i) => {
        const next = piece.polygon[(i + 1) % piece.polygon.length];
        return area + p.x * next.z - next.x * p.z;
      }, 0) >= 0 ? 1 : -1;
      for (let row = 0; row < ringCount - 1; row++) for (let segment = 0; segment < ringSize; segment++) {
        const a = new Vector3().fromBufferAttribute(position, row * ringSize + segment);
        const b = new Vector3().fromBufferAttribute(position, row * ringSize + (segment + 1) % ringSize);
        const outward = new Vector3((b.z - a.z) * orientation, 0, (a.x - b.x) * orientation);
        for (let half = 0; half < 2; half++) {
          const offset = (row * ringSize + segment) * 6 + half * 3;
          const p = new Vector3().fromBufferAttribute(position, index.getX(offset));
          const q = new Vector3().fromBufferAttribute(position, index.getX(offset + 1));
          const r = new Vector3().fromBufferAttribute(position, index.getX(offset + 2));
          const normal = new Vector3().subVectors(q, p).cross(new Vector3().subVectors(r, p));
          assert.ok(normal.dot(outward) > -1e-5, `inverted side face: ${mode} ${piece.index} ${layer} ${row}/${segment}`);
        }
      }
      let topFaces = 0, bottomFaces = 0;
      for (let i = sideIndexCount; i < index.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(position, index.getX(i));
        const b = new Vector3().fromBufferAttribute(position, index.getX(i + 1));
        const c = new Vector3().fromBufferAttribute(position, index.getX(i + 2));
        const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
        if (index.getX(i) < ringSize) {
          assert.ok(normal.y > 1e-6, `inverted top face: ${mode} ${piece.index} ${layer}`);
          topFaces++;
        } else {
          assert.ok(normal.y < -1e-6, `inverted bottom face: ${mode} ${piece.index} ${layer}`);
          bottomFaces++;
        }
      }
      assert.ok(topFaces > 0 && bottomFaces > 0, `${mode} piece ${piece.index} ${layer} has both caps`);
      geometry.dispose();
    }
  }
});

test("all 20 class pieces match the neighbouring wall at every shared height", () => {
  const island = createIslandLayout(17);
  const layout = createPuzzleLayout(island);
  const key = (p) => `${p.x.toFixed(5)},${p.z.toFixed(5)}`;
  const shared = new Map();
  for (const piece of layout.pieces) for (const edge of piece.edges) {
    if (!edge.internal) continue;
    const id = [key(edge.a), key(edge.b)].sort().join("|");
    for (const layer of ["grass", "soil", "rock"]) {
      const fractions = layer === "rock" ? [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]
        : layer === "grass" ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1];
      for (const t of fractions) {
        const ring = getPuzzleTerrainRing(island, piece.index, layer, "classroom", t);
        const rimByPoint = new Map(ring.map((p) => [key(p), p]));
        const path = edge.tab.map((point) => rimByPoint.get(key(point)));
        assert.ok(path.every(Boolean), `missing shared edge sample: ${piece.index} ${id}`);
        const slot = `${id}:${layer}:${t}`;
        const previous = shared.get(slot);
        if (previous) {
          assert.equal(path.length, previous.length);
          for (let i = 0; i < path.length; i++) assert.ok(path[i].distanceTo(previous[i]) < 1e-5,
            `seam gap at ${slot} vertex ${i}`);
        } else shared.set(slot, path);
      }
    }
  }
  assert.ok(shared.size > 100);
});

test("the half-island is a deterministic 20-piece organic Voronoi layout", () => {
  const layout = createPuzzleLayout(createIslandLayout(17), 20260915);
  assert.equal(layout.pieces.length, PUZZLE_PIECE_COUNT);
  assert.deepEqual(layout, createPuzzleLayout(createIslandLayout(17), 20260915));
  assert.ok(puzzleAreaStats(layout).ratio <= 1.5, `area ratio ${puzzleAreaStats(layout).ratio}`);
  assert.ok(layout.pieces.every((piece) => getPuzzlePiecePolygon(piece).length >= 4));
});

test("internal puzzle edges are shared by two pieces with the same curved path", () => {
  const layout = createPuzzleLayout(createIslandLayout(17), 20260915);
  const edges = new Map();
  for (const piece of layout.pieces) for (const edge of piece.edges) {
    if (!edge.internal) continue;
    const id = [
      `${edge.a.x.toFixed(4)},${edge.a.z.toFixed(4)}`,
      `${edge.b.x.toFixed(4)},${edge.b.z.toFixed(4)}`,
    ].sort().join("|");
    const path = edge.tab.map((point) => [point.x.toFixed(4), point.z.toFixed(4)]);
    const previous = edges.get(id);
    if (previous) assert.deepEqual(path, previous.path);
    else edges.set(id, { path });
  }
  assert.ok(edges.size >= 15, `internal edges ${edges.size}`);
});
