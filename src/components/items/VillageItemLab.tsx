"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createPuzzlePieceModel, disposeObject } from "@/components/student/island/islandModel";
import { createProceduralModel } from "@/components/student/island/landscapeProps";
import { getPieceLandscape } from "@/components/student/island/pieceLandscape";
import { createIslandCoordinates, getPuzzleDisplayRotation, getPuzzleTerrainMetrics, PUZZLE_STUDENT_PIECE_MAP } from "@/components/student/island/puzzle";
import { fitIslandCamera } from "@/components/student/island/cameraFit";
import { CHARACTER_MODEL_HEIGHT, createChildCharacter } from "@/components/student/island/character";
import { createLabItem, HOUSE_SPEC } from "@/lib/items/assembledItem";
import { STAR_SPEC } from "@/lib/items/extrudedItem";
import { findCapacityLayout } from "@/lib/items/placementCapacity";

export default function VillageItemLab() {
  const host = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLParagraphElement>(null);
  const capacityDetails = useRef<HTMLParagraphElement>(null);
  const actions = useRef<{ home: () => void; focus: () => void; capacity: () => void; compare: () => void } | null>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { element.textContent = "3D 화면을 시작하지 못했어요."; return () => { element.textContent = ""; }; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#DCEEE5");
    scene.add(new THREE.HemisphereLight(0xffffff, 0x78866a, 2.5));
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(-15, 35, 20);
    scene.add(sun);
    const index = PUZZLE_STUDENT_PIECE_MAP[1];
    const island = createPuzzlePieceModel(17, index);
    const rotation = getPuzzleDisplayRotation(island.layout, index);
    island.group.rotation.y = rotation;
    scene.add(island.group);
    const coords = createIslandCoordinates(rotation);
    const landscape = getPieceLandscape(island.layout, index);
    const metrics = getPuzzleTerrainMetrics(island.layout, index, "personal", 17);
    const villageHouses = landscape.props.filter(p => p.kind === "house");
    const measuredHouses = villageHouses.map(p => {
      const geometry = createProceduralModel("house", p.variant);
      geometry.computeBoundingBox();
      const size = geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(new THREE.Vector3(...p.scale));
      geometry.dispose();
      return size;
    });
    const largestHouse = measuredHouses.sort((a, b) => b.x * b.y * b.z - a.x * a.y * a.z)[0] ?? new THREE.Vector3(2.76, 3, 2.4);
    // Keep all three dimensions visibly below the largest scenery house.
    const itemLimits = largestHouse.clone().multiplyScalar(0.65);
    const fitItem = (model: THREE.Group, desiredHeight: number) => {
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      const scale = Math.min(desiredHeight / size.y, itemLimits.x / size.x, itemLimits.y / size.y, itemLimits.z / size.z);
      model.scale.setScalar(scale);
      return size.y * scale;
    };
    const house = createLabItem(HOUSE_SPEC);
    const houseHeight = fitItem(house, itemLimits.y);
    const houseBounds = new THREE.Box3().setFromObject(house).getSize(new THREE.Vector3());
    const radius = Math.hypot(houseBounds.x, houseBounds.z) / 2;
    const star = createLabItem(STAR_SPEC);
    const starHeight = fitItem(star, (metrics.W / 2.75) * 0.07);
    const starSize = new THREE.Box3().setFromObject(star).getSize(new THREE.Vector3());
    const starRadius = Math.hypot(starSize.x, starSize.z) / 2;
    const charScale = (metrics.W / 2.75) * 0.10 / CHARACTER_MODEL_HEIGHT;
    const character = createChildCharacter("star");
    character.root.scale.setScalar(charScale);
    const charRadius = (metrics.W / 2.75) * 0.04;
    const polygon = landscape.polygon;
    const minX = Math.min(...polygon.map(p => p.x)), maxX = Math.max(...polygon.map(p => p.x));
    const minZ = Math.min(...polygon.map(p => p.z)), maxZ = Math.max(...polygon.map(p => p.z));
    let chosen: { x: number; z: number } | null = null;
    
    // Test all footprints against terrain blockers and the rim before placing.
    const candidates: { x: number; z: number }[] = [];
    for (let x = minX; x <= maxX; x += 0.35) for (let z = minZ; z <= maxZ; z += 0.35) {
      if (landscape.canPlace(x, z, radius)) candidates.push({ x, z });
    }
    candidates.sort((a, b) => {
      const aw = coords.toDisplayedWorld(a), bw = coords.toDisplayedWorld(b);
      return bw.z - aw.z;
    });
    chosen = candidates[0] ?? null;
    const comparison = new THREE.Group();
    scene.add(comparison);
    const packed = new THREE.Group();
    scene.add(packed);
    if (chosen) {
      const place = (model: THREE.Group, x: number, z: number) => {
        model.position.copy(coords.toDisplayedWorld({ x, z }, landscape.surfaceAt(x, z) + 0.015));
        model.rotation.y = 0;
        comparison.add(model);
      };
      place(house, chosen.x, chosen.z);
      const occupied = [{ ...chosen, r: radius }];
      const placeNearby = (model: THREE.Group, r: number, side: number) => {
        const desired = coords.toDisplayedWorld(chosen!);
        desired.x += side * (radius + r + 0.25);
        desired.z += radius + r + 0.25;
        const preferred = coords.fromDisplayedWorld(desired);
        const spots: { x: number; z: number }[] = [];
        for (let x = minX; x <= maxX; x += 0.2) for (let z = minZ; z <= maxZ; z += 0.2) {
          if (landscape.canPlace(x, z, r) && occupied.every(p => Math.hypot(x - p.x, z - p.z) > p.r + r + 0.1)) spots.push({ x, z });
        }
        spots.sort((a, b) => Math.hypot(a.x - preferred.x, a.z - preferred.z) - Math.hypot(b.x - preferred.x, b.z - preferred.z));
        const spot = spots[0];
        if (spot) { place(model, spot.x, spot.z); occupied.push({ ...spot, r }); }
        else disposeObject(model);
      };
      placeNearby(star, starRadius, 1);
      placeNearby(character.root, charRadius, -1);
    } else {
      disposeObject(house); disposeObject(star); disposeObject(character.root);
    }
    if (details.current) details.current.textContent = chosen
      ? `아이템은 가장 큰 마을 집의 가로·높이·깊이 각각 65% 이내로 제한했어요. 별 높이는 집의 약 ${(starHeight / houseHeight * 100).toFixed(0)}%예요. 캐릭터는 현재 섬 배율을 적용했어요.`
      : "집·별·캐릭터가 함께 들어갈 안전한 공간을 찾지 못했어요. 크기 기준을 함께 조정해야 해요.";
    const bounds = new THREE.Box3().setFromObject(island.group);
    const initial = element.getBoundingClientRect();
    const fit = fitIslandCamera(bounds, Math.max(initial.width, 1), Math.max(initial.height, 1), "island");
    const camera = fit.camera;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minZoom = 0.6;
    controls.maxZoom = 18;
    const applyFit = (box: THREE.Box3) => {
      const rect = element.getBoundingClientRect();
      const next = fitIslandCamera(box, Math.max(rect.width, 1), Math.max(rect.height, 1), "island");
      camera.position.copy(next.home);
      controls.target.copy(next.target);
      camera.left = next.camera.left; camera.right = next.camera.right;
      camera.top = next.camera.top; camera.bottom = next.camera.bottom;
      camera.zoom = 1;
      camera.updateProjectionMatrix(); controls.update();
    };
    const home = () => applyFit(bounds);
    const focus = () => {
      const visibleGroup = packed.visible && packed.children.length ? packed : comparison;
      if (visibleGroup.children.length) applyFit(new THREE.Box3().setFromObject(visibleGroup));
    };
    home();
    const capacity = () => {
      if (!capacityDetails.current) return;
      const layout = findCapacityLayout(landscape, radius);
      const smallLayout = findCapacityLayout(landscape, 0.15, 0, 210);
      packed.clear();
      comparison.visible = false;
      // Share the five source meshes' resources across all test copies.
      layout.slice(0, 210).forEach((point, i) => {
        const copy = house.clone();
        copy.name = `capacity-house-${i + 1}`;
        copy.position.copy(coords.toDisplayedWorld(point, landscape.surfaceAt(point.x, point.z) + 0.015));
        copy.rotation.y = 0;
        packed.add(copy);
      });
      packed.visible = true;
      capacityDetails.current.textContent = `현재 집 크기: 가로 ${houseBounds.x.toFixed(2)}, 깊이 ${houseBounds.z.toFixed(2)}, 배치 반경 ${radius.toFixed(2)}. 16가지 격자 배치 중 가장 많이 들어간 결과는 ${layout.length}개 / 목표 210개예요. 기존 작은 아이템 반경 0.15 기준으로는 ${smallLayout.length >= 210 ? "210개 이상" : `${smallLayout.length}개`} 배치를 확인했어요. ${layout.length >= 210 ? "210개를 놓을 수 있는 배치를 찾았어요." : "현재 크기로는 210개 배치를 확인하지 못했어요. 크기를 유지하려면 배치 공간을 늘리는 방향을 논의해야 해요."}`;
      home();
    };
    const compare = () => { comparison.visible = true; packed.visible = false; home(); };
    actions.current = { home, focus, capacity, compare };
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      const next = fitIslandCamera(bounds, width, height, "island").camera;
      camera.left = next.left; camera.right = next.right; camera.top = next.top; camera.bottom = next.bottom;
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => { actions.current = null; resize.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); disposeObject(scene); renderer.dispose(); renderer.domElement.remove(); };
  }, []);
  return <main lang="ko" className="min-h-screen bg-[#f7f8f2] p-5 text-[#344332] md:p-10">
    <div className="mx-auto max-w-6xl">
      <a href="/item-lab" className="text-sm underline">별·집 설계서로 돌아가기</a>
      <h1 className="mt-4 text-3xl font-bold">마을 안에서 크기 비교</h1>
      <p ref={details} className="mt-3 text-sm" aria-live="polite">마을 기준 크기를 확인하고 있어요.</p>
      <div ref={host} className="mt-5 h-[65vh] min-h-[440px] overflow-hidden rounded-3xl border border-[#d6e3d7]" aria-label="실제 섬의 기존 집과 나무, 새 집·별·캐릭터 크기 비교" />
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="rounded-xl border px-4 py-2" onClick={() => actions.current?.home()}>섬 전체 보기</button>
        <button className="rounded-xl bg-[#47694b] px-4 py-2 text-white" onClick={() => actions.current?.focus()}>집·별 가까이 보기</button>
        <button className="rounded-xl border px-4 py-2" onClick={() => actions.current?.capacity()}>현재 집 크기로 210개 테스트</button>
        <button className="rounded-xl border px-4 py-2" onClick={() => actions.current?.compare()}>크기 비교로 돌아가기</button>
      </div>
      <p ref={capacityDetails} className="mt-3 text-sm" aria-live="polite">210개 테스트는 나무·물·지형을 피하고, 아이템 사이 간격과 바닥 원 전체를 검사해요. 자동 배치 결과이며 자유 배치 시 수용량은 달라질 수 있어요.</p>
      <p className="mt-3 text-sm">드래그로 회전하고 휠로 확대할 수 있어요. 크기 비교용 임시 배치이며 저장되지 않아요.</p>
    </div>
  </main>;
}
