"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createGiftModel, createIslandModel, disposeObject } from "./islandModel";
import { canPlaceGift, classroomEdges, SURFACE_Y, TILE_SIZE } from "./puzzleGeometry";
import type { CameraPreset, GiftKind, IslandGift, SceneHandle, ViewMode } from "./types";

type Props = {
  mode: ViewMode;
  gifts: IslandGift[];
  selected: GiftKind | null;
  onPlace: (kind: GiftKind, x: number, z: number) => void;
  controlsRef: Ref<SceneHandle>;
};

type Runtime = {
  camera: (preset: CameraPreset) => void;
  suggested: () => void;
  gifts: THREE.Group;
  render: () => void;
};

export default function IslandScene({ mode, gifts, selected, onPlace, controlsRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const stateRef = useRef({ selected, onPlace, gifts });
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { stateRef.current = { selected, onPlace, gifts }; }, [selected, onPlace, gifts]);
  useImperativeHandle(controlsRef, () => ({
    camera: (preset) => runtimeRef.current?.camera(preset),
    placeSuggested: () => runtimeRef.current?.suggested(),
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    } catch {
      queueMicrotask(() => setError(true));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-label", mode === "island" ? "회전할 수 있는 퍼즐 섬. 방향키로 회전하고 +, - 키로 확대 및 축소합니다." : "아홉 개의 퍼즐 섬이 맞물린 우리 반 마을 미리 보기");
    canvas.setAttribute("role", "img");
    canvas.tabIndex = 0;
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#dceee5");
    scene.fog = new THREE.Fog("#dceee5", 35, 90);
    const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 150);
    const classroom = mode === "classroom";
    const scale = classroom ? 2.9 : 1;
    const target = new THREE.Vector3(0, 1.12, 0);
    const home = new THREE.Vector3(7.5, 7.2, 10).multiplyScalar(scale).add(target);
    camera.position.copy(home);
    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.enablePan = false;
    controls.minPolarAngle = 0.035;
    controls.maxPolarAngle = Math.PI / 2.12;
    controls.minZoom = 0.65;
    controls.maxZoom = 2.3;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.update();
    scene.add(new THREE.HemisphereLight("#fff9e7", "#73816a", 1.7));
    const sunlight = new THREE.DirectionalLight("#fff0ce", 2.6);
    sunlight.position.set(-5, 10, 5);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    const shadowSize = classroom ? 13 : 6;
    Object.assign(sunlight.shadow.camera, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 0.5, far: 40 });
    sunlight.shadow.normalBias = 0.035;
    sunlight.shadow.bias = -0.0002;
    sunlight.shadow.radius = 4;
    scene.add(sunlight);
    const fill = new THREE.DirectionalLight("#d8ece4", 0.7);
    fill.position.set(5, 4, -4);
    scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: "#527b67", opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.28;
    floor.receiveShadow = true;
    scene.add(floor);

    const island = createIslandModel(classroomEdges(1, 1));
    scene.add(island.group);
    if (classroom) {
      const roofs = ["#b38158", "#879a80", "#b98768", "#c7a460", "#cb763b", "#8798aa", "#bb8684", "#989064", "#a7805d"];
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        if (row === 1 && col === 1) continue;
        const other = createIslandModel(classroomEdges(row, col), 30 + row * 3 + col, false, roofs[row * 3 + col]);
        // A tiny seam keeps each child's piece legible. The connectors use the
        // same curve with inverse signs, so all internal edges fit together.
        other.group.position.set((col - 1) * (TILE_SIZE + 0.14), 0, (row - 1) * (TILE_SIZE + 0.14));
        scene.add(other.group);
      }
    }
    const giftGroup = new THREE.Group();
    scene.add(giftGroup);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: "#fff9d4", transparent: true, opacity: 0.9, depthWrite: false });
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.23, 0.29, 40), markerMaterial);
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    scene.add(marker);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    let frame = 0;
    let disposed = false;
    let visible = true;
    let tween: { from: THREE.Vector3; to: THREE.Vector3; start: number; zoom: number; nextZoom: number } | null = null;

    const render = () => {
      if (disposed || !visible || document.hidden || frame) return;
      frame = requestAnimationFrame(animate);
    };
    function animate(now: number) {
      frame = 0;
      if (disposed) return;
      if (!stateRef.current.selected) marker.visible = false;
      if (tween) {
        const t = Math.min((now - tween.start) / 480, 1);
        const eased = 1 - (1 - t) ** 3;
        camera.position.lerpVectors(tween.from, tween.to, eased);
        camera.zoom = THREE.MathUtils.lerp(tween.zoom, tween.nextZoom, eased);
        camera.updateProjectionMatrix();
        if (t === 1) tween = null;
      }
      const changing = controls.update();
      renderer.render(scene, camera);
      if (changing || tween) render();
    }
    const moveCamera = (preset: CameraPreset) => {
      let next = camera.position.clone();
      let nextZoom = camera.zoom;
      if (preset === "home") { next = home.clone(); nextZoom = 1; }
      if (preset === "top") next = new THREE.Vector3(0, 15 * scale, 0.02).add(target);
      if (preset === "left" || preset === "right") next.sub(target).applyAxisAngle(new THREE.Vector3(0, 1, 0), preset === "left" ? -Math.PI / 6 : Math.PI / 6).add(target);
      if (preset === "in" || preset === "out") nextZoom = THREE.MathUtils.clamp(camera.zoom * (preset === "in" ? 1.2 : 1 / 1.2), 0.65, 2.3);
      tween = { from: camera.position.clone(), to: next, start: performance.now(), zoom: camera.zoom, nextZoom };
      render();
    };
    const validPoint = (x: number, z: number) => canPlaceGift(x, z, island.outline) && !stateRef.current.gifts.some((gift) => Math.hypot(gift.x - x, gift.z - z) < 0.52);
    const intersect = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      scene.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(island.surface)[0]?.point;
    };
    const onMove = (event: PointerEvent) => {
      if (!stateRef.current.selected || classroom) return;
      const point = intersect(event);
      marker.visible = !!point;
      if (point) {
        marker.position.set(point.x, SURFACE_Y + 0.02, point.z);
        markerMaterial.color.set(validPoint(point.x, point.z) ? "#fff9d4" : "#c57967");
      }
      render();
    };
    const onDown = (event: PointerEvent) => { if (event.button === 0) pointerDown = { x: event.clientX, y: event.clientY }; };
    const onUp = (event: PointerEvent) => {
      const down = pointerDown;
      pointerDown = null;
      const kind = stateRef.current.selected;
      if (!down || !kind || classroom || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const point = intersect(event);
      if (point && validPoint(point.x, point.z)) {
        stateRef.current.onPlace(kind, point.x, point.z);
        marker.visible = false;
        render();
      }
    };
    const onLeave = () => { marker.visible = false; render(); };
    const onCancel = () => { pointerDown = null; onLeave(); };
    const onKey = (event: KeyboardEvent) => {
      const map: Record<string, CameraPreset> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "top", ArrowDown: "home", "+": "in", "=": "in", "-": "out", Home: "home" };
      if (map[event.key]) { event.preventDefault(); moveCamera(map[event.key]); }
    };
    const onStart = () => { tween = null; };
    const onContextLost = (event: Event) => { event.preventDefault(); setError(true); };
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      const aspect = width / height;
      const span = Math.max(7.5, 8.5 / aspect) * scale;
      camera.left = -span * aspect / 2;
      camera.right = span * aspect / 2;
      camera.top = span / 2;
      camera.bottom = -span / 2;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) render(); });
    intersectionObserver.observe(host);
    controls.addEventListener("change", render);
    controls.addEventListener("start", onStart);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("webglcontextlost", onContextLost);
    document.addEventListener("visibilitychange", render);
    runtimeRef.current = {
      camera: moveCamera, gifts: giftGroup, render,
      suggested: () => {
        const kind = stateRef.current.selected;
        if (!kind || classroom) return;
        for (const [x, z] of [[-0.75, 1.3], [0.1, 1.4], [-1.65, 1.7], [1.7, 1.6], [-2.5, 0], [0.0, -1.25], [-1.1, 0.7]]) {
          if (validPoint(x, z)) { stateRef.current.onPlace(kind, x, z); return; }
        }
      },
    };
    resize();
    queueMicrotask(() => { if (!disposed) setReady(true); });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersectionObserver.disconnect();
      controls.dispose();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      document.removeEventListener("visibilitychange", render);
      disposeObject(scene);
      renderer.dispose();
      canvas.remove();
      runtimeRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    disposeObject(runtime.gifts);
    runtime.gifts.clear();
    gifts.forEach((gift) => {
      const model = createGiftModel(gift.kind);
      model.position.set(gift.x, SURFACE_Y + 0.02, gift.z);
      model.name = gift.name;
      runtime.gifts.add(model);
    });
    runtime.render();
  }, [gifts, mode]);

  useEffect(() => { runtimeRef.current?.render(); }, [selected]);

  return (
    <div ref={hostRef} className="absolute inset-0 [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:touch-none [&_canvas]:outline-offset-[-4px]" style={{ cursor: selected ? "crosshair" : "grab" }}>
      {!ready && !error && <div className="absolute inset-0 grid place-items-center text-sm text-[#547766]" role="status">작은 섬을 준비하고 있어요…</div>}
      {error && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#e7f0e7] p-8 text-center">
        <p className="font-semibold">3D 섬을 불러오지 못했어요.</p>
        <p className="text-sm">브라우저의 그래픽 가속을 켜고 다시 열어 주세요.</p>
        <button className="rounded-full bg-[#2b7355] px-5 py-2 text-sm text-white" onClick={() => window.location.reload()}>다시 불러오기</button>
      </div>}
    </div>
  );
}
