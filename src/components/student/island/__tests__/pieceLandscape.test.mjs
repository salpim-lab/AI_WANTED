import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { Group, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false });
const { createIslandLayout } = await jiti.import("../placement.ts");
const { getPuzzleLayout, puzzlePieceContains, createPuzzlePieceLayerGeometry, PUZZLE_SEED, PUZZLE_STUDENT_PIECE_MAP } = await jiti.import("../puzzle.ts");
const { distanceToPuzzleRim } = await jiti.import("../puzzleDecorations.ts");
const L = await jiti.import("../pieceLandscape.ts");
const { createPieceTerrainMeshes, landscapeCapHoles } = await jiti.import("../pieceTerrainMesh.ts");
const { createLandscapeProps, createProceduralModel } = await jiti.import("../landscapeProps.ts");
const { createGrassSkirt } = await jiti.import("../grassSkirt.ts");

const layout = createIslandLayout(17);
const pieces = getPuzzleLayout(layout).pieces;
const plans = pieces.map((piece) => L.getPieceLandscape(layout, piece.index));
const student = PUZZLE_STUDENT_PIECE_MAP[1];
// IslandScene: marker diameter ≈ 0.41 × giftScale (≈0.63) → radius ≈ 0.13, gap 2r.
const { ITEM_RADIUS, ITEM_GAP, ITEM_CAPACITY } = L;

function hull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const half = (list) => list.reduce((out, p) => {
    while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
    out.push(p);
    return out;
  }, []);
  const lower = half(sorted), upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

test("each piece's landscape is deterministic and differs between pieces", () => {
  const signature = (plan) => JSON.stringify({ tiers: plan.tiers, props: plan.props, paths: plan.paths });
  const again = L.createPieceLandscape(createIslandLayout(17), student);
  assert.equal(signature(again), signature(plans[student]));
  assert.notEqual(signature(plans[7]), signature(plans[student]));
});

test("every piece gets terraces, stairs, houses, fences and a dense tree rim", () => {
  let brooks = 0, bridges = 0, conifers = 0, broadleaves = 0;
  for (const plan of plans) {
    const count = (kind) => plan.props.filter((prop) => prop.kind === kind).length;
    assert.ok(plan.tiers.length >= 1 && plan.tiers.length <= 2, `piece ${plan.pieceIndex} terraces`);
    assert.ok(count("stairs") === plan.tiers.length, `piece ${plan.pieceIndex} one flight per terrace`);
    assert.ok(count("house") >= 1 && count("house") <= 3, `piece ${plan.pieceIndex} houses`);
    assert.ok(count("fence") > 0, `piece ${plan.pieceIndex} fences`);
    // Dense rim, but the item capacity wins on small corner pieces.
    assert.ok(count("conifer") + count("broadleaf") >= 5, `piece ${plan.pieceIndex} trees`);
    assert.ok(count("conifer") + count("broadleaf") + count("bush") >= Math.min(30, plan.piece.area / 6), `piece ${plan.pieceIndex} rim vegetation`);
    conifers += count("conifer"); broadleaves += count("broadleaf");
    assert.ok(count("boulder") >= 1, `piece ${plan.pieceIndex} rock hill`);
    if (plan.water) brooks++;
    if (count("bridge")) bridges++;
  }
  assert.ok(brooks >= 8, `${brooks} pieces with a brook`);
  assert.ok(broadleaves > 0.3 * (conifers + broadleaves), `mixed forest: ${conifers} conifers, ${broadleaves} broadleaf`);
  assert.ok(bridges >= 1);
});

test("PROP_REACH covers every procedural model the plan sizes by it", () => {
  const reach = (geometry) => {
    const position = geometry.getAttribute("position");
    let r = 0;
    for (let i = 0; i < position.count; i++) r = Math.max(r, Math.hypot(position.getX(i), position.getZ(i)));
    geometry.dispose();
    return r;
  };
  for (const [kind, limit] of Object.entries(L.PROP_REACH)) {
    const variants = kind === "flower" ? 4 : kind === "lily" ? 2 : kind === "foam" ? 1 : 3;
    for (let variant = 0; variant < variants; variant++) assert.ok(reach(createProceduralModel(kind, variant)) <= limit, `${kind}:${variant}`);
  }
  L.HOUSE_REACH.forEach((limit, variant) => assert.ok(reach(createProceduralModel("house", variant)) <= limit + 1e-3, `house:${variant}`));
});

test("no prop, terrace, water, path or curtain vertex leaves its puzzle outline", () => {
  for (const plan of plans) {
    const contains = (p) => puzzlePieceContains(plan.piece, { x: p.x, z: p.z });
    const props = createLandscapeProps(plan.props);
    const matrix = new Matrix4(), point = new Vector3();
    for (const mesh of props.children) {
      const position = mesh.geometry.getAttribute("position");
      const outline = hull(Array.from({ length: position.count }, (_, i) => ({ x: position.getX(i), z: position.getZ(i) })));
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        for (const p of outline) {
          point.set(p.x, 0, p.z).applyMatrix4(matrix);
          assert.ok(contains(point), `${mesh.name} #${i} on piece ${plan.pieceIndex} crosses the outline`);
        }
      }
      mesh.geometry.dispose();
    }
    props.children[0]?.material.dispose();
    const terrain = createPieceTerrainMeshes(plan);
    terrain.traverse((object) => {
      if (!object.isMesh) return;
      const position = object.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        assert.ok(contains({ x: position.getX(i), z: position.getZ(i) }), `${object.name} vertex on piece ${plan.pieceIndex}`);
      }
      object.geometry.dispose(); object.material.dispose();
    });
    for (const mode of ["personal", "classroom"]) {
      const skirt = createGrassSkirt(layout, plan.pieceIndex, mode).children[0];
      const position = skirt.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) assert.ok(contains({ x: position.getX(i), z: position.getZ(i) }), `skirt vertex on piece ${plan.pieceIndex}`);
      skirt.geometry.dispose(); skirt.material.dispose();
    }
  }
});

test("the rim stays at the shared meadow height so the 20 pieces meet flush", () => {
  for (const plan of plans) {
    for (const vertex of plan.polygon) {
      const inward = { x: vertex.x + (plan.piece.seed.x - vertex.x) * 0.02, z: vertex.z + (plan.piece.seed.z - vertex.z) * 0.02 };
      if (!puzzlePieceContains(plan.piece, inward) || distanceToPuzzleRim(inward, plan.polygon) > 0.8) continue;
      assert.equal(plan.heightAt(inward.x, inward.z), layout.surfaceY, `piece ${plan.pieceIndex} rim`);
    }
    for (const tier of plan.tiers) {
      for (let k = 0; k < tier.radii.length; k++) {
        const foot = L.tierRingPoint(tier, k / tier.radii.length * Math.PI * 2, L.TIER_PROFILE.at(-1).offset + 0.06);
        assert.ok(distanceToPuzzleRim(foot, plan.polygon) > 1, `piece ${plan.pieceIndex} terrace foot keeps off the rim`);
      }
    }
  }
});

test("heightAt matches the rendered meadow and terrace tops", () => {
  const plan = plans[student];
  const surface = new Group();
  const cap = new Mesh(createPuzzlePieceLayerGeometry(layout, student, "grass", "personal", PUZZLE_SEED, landscapeCapHoles(plan)), new MeshBasicMaterial());
  surface.add(cap, createPieceTerrainMeshes(plan));
  surface.updateMatrixWorld(true);
  const raycaster = new Raycaster();
  let checked = 0, onTerrace = 0;
  const xs = plan.polygon.map((p) => p.x), zs = plan.polygon.map((p) => p.z);
  for (let x = Math.min(...xs); x < Math.max(...xs); x += 0.7) for (let z = Math.min(...zs); z < Math.max(...zs); z += 0.7) {
    if (!plan.canPlace(x, z, ITEM_RADIUS)) continue;
    raycaster.set(new Vector3(x, 30, z), new Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(surface, true).find((h) => h.object.userData.surfaceKind !== "path");
    assert.ok(hit, `surface under ${x}, ${z}`);
    assert.ok(Math.abs(hit.point.y - plan.surfaceAt(x, z)) < 2e-3, `height at ${x.toFixed(2)}, ${z.toFixed(2)}: mesh ${hit.point.y} plan ${plan.surfaceAt(x, z)}`);
    if (plan.heightAt(x, z) > layout.surfaceY + 0.1) onTerrace++;
    checked++;
  }
  assert.ok(checked > 200 && onTerrace > 40, `${checked} placements, ${onTerrace} on terraces`);
});

test("water, banks, houses, stairs, bridges and paths reject items", () => {
  for (const plan of plans) {
    if (plan.water) {
      const g = plan.water.grid;
      for (let j = 0; j < g.nz; j += 2) for (let i = 0; i < g.nx; i += 2) {
        if (g.values[i + j * g.nx] < 0) assert.equal(plan.canPlace(g.minX + i * g.cell, g.minZ + j * g.cell, ITEM_RADIUS), false, `water on piece ${plan.pieceIndex}`);
      }
    }
    for (const tier of plan.tiers) {
      for (let k = 0; k < tier.radii.length; k += 4) {
        const bank = L.tierRingPoint(tier, k / tier.radii.length * Math.PI * 2, 0);
        assert.equal(plan.canPlace(bank.x, bank.z, ITEM_RADIUS), false, `bank on piece ${plan.pieceIndex}`);
      }
    }
    for (const blocker of plan.blockers) {
      if (/^(house|shed|stairs|bridge|path|fence|waterfall|pool|mountain)/.test(blocker.id)) {
        assert.equal(plan.canPlace(blocker.x, blocker.z, ITEM_RADIUS), false, `${blocker.id} on piece ${plan.pieceIndex}`);
      }
    }
  }
});

test("every island still holds more than 210 items on flat, free ground", () => {
  for (const plan of plans) {
    const xs = plan.polygon.map((p) => p.x), zs = plan.polygon.map((p) => p.z);
    let fits = 0;
    // Grid spacing equals the item gap, so every accepted cell is a legal set.
    for (let x = Math.min(...xs); x < Math.max(...xs); x += ITEM_GAP) for (let z = Math.min(...zs); z < Math.max(...zs); z += ITEM_GAP) {
      if (plan.canPlace(x, z, ITEM_RADIUS)) fits++;
    }
    assert.ok(fits >= ITEM_CAPACITY, `piece ${plan.pieceIndex} holds ${fits}`);
  }
});
