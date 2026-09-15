"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createChildCharacter, createGiftModel, createIslandModel, disposeObject, ISLAND_SHADOW_Y } from "./islandModel";
import { canPlaceAmongGifts, classroomEdges, SURFACE_Y, TILE_SIZE } from "./puzzleGeometry";
import { screenSunPosition } from "./sunlight";
import type { CameraPreset, GiftKind, IslandGift, PlacementPhase, PlacementProposal, SceneHandle, ViewMode } from "./types";

type Props = {
  mode: ViewMode;
  gifts: IslandGift[];
  selected: GiftKind | null;
  proposal: PlacementProposal | null;
  phase: PlacementPhase;
  itemName: string;
  onPropose: (kind: GiftKind, x: number, z: number) => void;
  onArrive: () => void;
  onChooseAgain: () => void;
  onConfirm: () => void;
  onFinish: () => void;
  controlsRef: Ref<SceneHandle>;
};

type CharacterPose = "holding" | "waving";

type Runtime = {
  camera: (preset: CameraPreset) => void;
  suggested: () => void;
  gifts: THREE.Group;
  render: () => void;
  setCharacterState: (phase: PlacementPhase, proposal: PlacementProposal | null) => void;
};

export default function IslandScene({
  mode,
  gifts,
  selected,
  proposal,
  phase,
  itemName,
  onPropose,
  onArrive,
  onChooseAgain,
  onConfirm,
  onFinish,
  controlsRef,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const stateRef = useRef({ gifts, selected, proposal, phase, onPropose, onArrive });
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    stateRef.current = { gifts, selected, proposal, phase, onPropose, onArrive };
    runtimeRef.current?.render();
  }, [gifts, selected, proposal, phase, onPropose, onArrive]);

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
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;

    const canvas = renderer.domElement;
    canvas.setAttribute("aria-label", mode === "island"
      ? "회전할 수 있는 큰 퍼즐 섬. 잔디를 누르면 캐릭터가 아이템을 들고 그 자리로 걸어갑니다."
      : "아홉 개의 퍼즐 섬이 맞물린 우리 반 섬 미리 보기");
    canvas.setAttribute("role", "img");
    canvas.tabIndex = 0;
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#dceee5");
    const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 440);
    const classroom = mode === "classroom";
    const scale = (classroom ? 2.9 : 0.82) * (TILE_SIZE / 5);
    const target = new THREE.Vector3(0, classroom ? -1.45 : -0.45, 0);
    // ~24° elevation: the meadow leads while the cliff still reads as its supporting rim.
    const home = new THREE.Vector3(9.6, 6.95, 12.3).multiplyScalar(scale).add(target);
    camera.position.copy(home);
    const viewDistance = home.distanceTo(target);
    scene.fog = new THREE.Fog("#dceee5", viewDistance * 0.95, viewDistance * 2.6);

    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.enablePan = false;
    controls.minPolarAngle = 0.035;
    controls.maxPolarAngle = Math.PI / 2.12;
    controls.minZoom = 0.65;
    controls.maxZoom = 4.5;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.update();

    // Hemisphere + a warm ambient floor keep shaded rock mid-toned instead of green-black.
    scene.add(new THREE.HemisphereLight("#dcf2ea", "#b5ab91", 1.7));
    scene.add(new THREE.AmbientLight("#f4ead8", 0.85));
    const sunlight = new THREE.DirectionalLight("#fff0d4", 2.4);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    const shadowSize = (classroom ? 13 : 6) * TILE_SIZE / 5;
    Object.assign(sunlight.shadow.camera, {
      left: -shadowSize,
      right: shadowSize,
      top: shadowSize,
      bottom: -shadowSize,
      near: 0.5,
      far: 220,
    });
    sunlight.shadow.normalBias = 0.035;
    sunlight.shadow.bias = -0.0002;
    sunlight.shadow.radius = 4;
    sunlight.target.position.copy(target);
    scene.add(sunlight, sunlight.target);

    // Soft teal bounce from the viewer's lower right keeps the camera-facing cliff readable.
    const fill = new THREE.DirectionalLight("#a8ddd4", 1.55);
    const fillOffset = new THREE.Vector3(6, -3.5, 9);
    fill.target.position.copy(target);
    scene.add(fill, fill.target);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.ShadowMaterial({ color: "#5b8572", opacity: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = ISLAND_SHADOW_Y;
    floor.receiveShadow = true;
    scene.add(floor);

    const island = createIslandModel(classroomEdges(1, 1), classroom ? 565 : 17);
    scene.add(island.group);
    if (classroom) {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (row === 1 && col === 1) continue;
          const other = createIslandModel(classroomEdges(row, col), 17 + (row * 3 + col) * 137);
          other.group.position.set((col - 1) * (TILE_SIZE + 0.28), 0, (row - 1) * (TILE_SIZE + 0.28));
          scene.add(other.group);
        }
      }
    }

    const giftGroup = new THREE.Group();
    const characterGroup = new THREE.Group();
    scene.add(giftGroup, characterGroup);

    const markerMaterial = new THREE.MeshBasicMaterial({
      color: "#fff9d4",
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.61, 48), markerMaterial);
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    scene.add(marker);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const bubbleAnchor = new THREE.Vector3();
    const initialCharacterPosition = new THREE.Vector3(-1.8, SURFACE_Y + 0.02, 3.2);
    let pointerDown: { x: number; y: number } | null = null;
    let frame = 0;
    let disposed = false;
    let visible = true;
    let characterPose: CharacterPose | null = null;
    let walk: { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number } | null = null;
    let tween: { from: THREE.Vector3; to: THREE.Vector3; start: number; zoom: number; nextZoom: number } | null = null;

    function ensureCharacter(pose: CharacterPose) {
      const previousPosition = characterGroup.children[0]?.position.clone() ?? initialCharacterPosition.clone();
      if (characterPose === pose && characterGroup.children[0]) return characterGroup.children[0];
      disposeObject(characterGroup);
      characterGroup.clear();
      const character = createChildCharacter("star", pose === "holding");
      character.position.copy(previousPosition);
      character.scale.setScalar(1.5);
      character.userData.baseY = previousPosition.y;
      characterGroup.add(character);
      characterPose = pose;
      return character;
    }

    function characterDestination(nextProposal: PlacementProposal) {
      const destination = new THREE.Vector2(nextProposal.x, nextProposal.z);
      const towardCenter = destination.clone().multiplyScalar(-1);
      if (towardCenter.lengthSq() < 0.01) towardCenter.set(1, 0.7);
      towardCenter.normalize().multiplyScalar(1.35);
      return new THREE.Vector3(
        destination.x + towardCenter.x,
        SURFACE_Y + 0.02,
        destination.y + towardCenter.y,
      );
    }

    function setCharacterState(nextPhase: PlacementPhase, nextProposal: PlacementProposal | null) {
      if (classroom || nextPhase === "complete") {
        walk = null;
        disposeObject(characterGroup);
        characterGroup.clear();
        characterPose = null;
        render();
        return;
      }

      if (nextPhase === "farewell") {
        walk = null;
        ensureCharacter("waving");
        render();
        return;
      }

      const character = ensureCharacter("holding");
      if (nextPhase === "moving" && nextProposal) {
        const destination = characterDestination(nextProposal);
        const distance = character.position.distanceTo(destination);
        walk = {
          from: character.position.clone(),
          to: destination,
          start: performance.now(),
          duration: THREE.MathUtils.clamp(distance / 4.8 * 1000, 480, 2200),
        };
      } else {
        walk = null;
        character.position.y = character.userData.baseY as number;
      }
      render();
    }

    function updateBubble() {
      const bubble = bubbleRef.current;
      const character = characterGroup.children[0];
      const current = stateRef.current;
      if (!bubble || !character || classroom || current.phase === "moving" || current.phase === "complete") {
        if (bubble) bubble.style.opacity = "0";
        return;
      }

      character.updateWorldMatrix(true, false);
      bubbleAnchor.set(0, 2.0, 0).applyMatrix4(character.matrixWorld).project(camera);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const x = THREE.MathUtils.clamp((bubbleAnchor.x * 0.5 + 0.5) * width, 150, width - 150);
      const y = THREE.MathUtils.clamp((-bubbleAnchor.y * 0.5 + 0.5) * height, 145, height - 30);
      bubble.style.left = `${x}px`;
      bubble.style.top = `${y}px`;
      bubble.style.opacity = bubbleAnchor.z > -1 && bubbleAnchor.z < 1 ? "1" : "0";
    }

    function render() {
      if (disposed || !visible || document.hidden || frame) return;
      frame = requestAnimationFrame(animate);
    }

    function animate(now: number) {
      frame = 0;
      if (disposed) return;
      const current = stateRef.current;
      const activeWalk = walk;
      let keepAnimating = false;

      if (!current.selected || current.phase === "moving" || current.phase === "farewell" || current.phase === "complete") marker.visible = false;

      if (tween) {
        const progress = Math.min((now - tween.start) / 480, 1);
        const eased = 1 - (1 - progress) ** 3;
        camera.position.lerpVectors(tween.from, tween.to, eased);
        camera.zoom = THREE.MathUtils.lerp(tween.zoom, tween.nextZoom, eased);
        camera.updateProjectionMatrix();
        if (progress === 1) tween = null;
        else keepAnimating = true;
      }

      const character = characterGroup.children[0];
      if (character && activeWalk) {
        const progress = Math.min((now - activeWalk.start) / activeWalk.duration, 1);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
        character.position.lerpVectors(activeWalk.from, activeWalk.to, eased);
        character.position.y = activeWalk.to.y + Math.abs(Math.sin(progress * Math.PI * 10)) * 0.1;
        character.rotation.y = Math.atan2(activeWalk.to.x - activeWalk.from.x, activeWalk.to.z - activeWalk.from.z);
        if (progress === 1) {
          character.position.copy(activeWalk.to);
          character.userData.baseY = activeWalk.to.y;
          walk = null;
          current.onArrive();
        } else {
          keepAnimating = true;
        }
      } else if (character) {
        const baseY = character.userData.baseY as number;
        character.position.y = current.phase === "farewell" ? baseY + Math.sin(now * 0.012) * 0.06 : baseY;
        character.lookAt(camera.position.x, character.position.y, camera.position.z);
        if (current.phase === "farewell") {
          character.rotateY(Math.sin(now * 0.008) * 0.09);
          keepAnimating = true;
        }
      }

      const changing = controls.update();
      screenSunPosition(camera, controls.target, classroom ? 3 : 1.7, sunlight.position);
      fill.position.copy(fillOffset).applyQuaternion(camera.quaternion).add(controls.target);
      updateBubble();
      renderer.render(scene, camera);
      if (changing || tween || keepAnimating) render();
    }

    function moveCamera(preset: CameraPreset) {
      let next = camera.position.clone();
      let nextZoom = camera.zoom;
      if (preset === "home") { next = home.clone(); nextZoom = 1; }
      if (preset === "top") next = new THREE.Vector3(0, 15 * scale, 0.02).add(target);
      if (preset === "left" || preset === "right") {
        next.sub(target).applyAxisAngle(new THREE.Vector3(0, 1, 0), preset === "left" ? -Math.PI / 6 : Math.PI / 6).add(target);
      }
      if (preset === "in" || preset === "out") {
        nextZoom = THREE.MathUtils.clamp(camera.zoom * (preset === "in" ? 1.2 : 1 / 1.2), 0.65, 4.5);
      }
      tween = { from: camera.position.clone(), to: next, start: performance.now(), zoom: camera.zoom, nextZoom };
      render();
    }

    const validPoint = (x: number, z: number) => canPlaceAmongGifts(x, z, island.outline, stateRef.current.gifts);
    const intersect = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      scene.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(island.surface)[0]?.point;
    };

    const canChooseLocation = () => {
      const current = stateRef.current;
      return !!current.selected && !classroom && (current.phase === "choosing" || current.phase === "confirming");
    };

    const onMove = (event: PointerEvent) => {
      if (!canChooseLocation()) return;
      const point = intersect(event);
      marker.visible = !!point;
      if (point) {
        marker.position.set(point.x, SURFACE_Y + 0.025, point.z);
        markerMaterial.color.set(validPoint(point.x, point.z) ? "#fff9d4" : "#c57967");
      }
      render();
    };

    const onDown = (event: PointerEvent) => {
      if (event.button === 0) pointerDown = { x: event.clientX, y: event.clientY };
    };

    const onUp = (event: PointerEvent) => {
      const down = pointerDown;
      pointerDown = null;
      const current = stateRef.current;
      if (!down || !canChooseLocation() || !current.selected) return;
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const point = intersect(event);
      if (point && validPoint(point.x, point.z)) {
        current.onPropose(current.selected, point.x, point.z);
        marker.visible = false;
        render();
      }
    };

    const onLeave = () => { marker.visible = false; render(); };
    const onCancel = () => { pointerDown = null; onLeave(); };
    const onKey = (event: KeyboardEvent) => {
      const map: Record<string, CameraPreset> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "top",
        ArrowDown: "home",
        "+": "in",
        "=": "in",
        "-": "out",
        Home: "home",
      };
      if (map[event.key]) {
        event.preventDefault();
        moveCamera(map[event.key]);
      }
    };

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      const aspect = width / height;
      const span = Math.max(7.5, (classroom ? 8.5 : 10) / aspect) * scale;
      // Portrait: sit the island lower so the character's bubble fits above it.
      const lift = classroom ? 0 : span * THREE.MathUtils.clamp((1.1 - aspect) * 0.2, 0, 0.12);
      camera.left = -span * aspect / 2;
      camera.right = span * aspect / 2;
      camera.top = span / 2 + lift;
      camera.bottom = -span / 2 + lift;
      camera.updateProjectionMatrix();
      render();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) render();
    });
    intersectionObserver.observe(host);
    const onControlStart = () => { tween = null; };
    const onContextLost = (event: Event) => { event.preventDefault(); setError(true); };
    controls.addEventListener("change", render);
    controls.addEventListener("start", onControlStart);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("webglcontextlost", onContextLost);
    document.addEventListener("visibilitychange", render);

    runtimeRef.current = {
      camera: moveCamera,
      gifts: giftGroup,
      render,
      setCharacterState,
      suggested: () => {
        const current = stateRef.current;
        if (!current.selected || classroom || (current.phase !== "choosing" && current.phase !== "confirming")) return;
        for (let radius = 0; radius < TILE_SIZE / 2 - 0.6; radius += 0.9) {
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 7) {
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (validPoint(x, z)) {
              current.onPropose(current.selected, x, z);
              return;
            }
          }
        }
      },
    };

    resize();
    setCharacterState(stateRef.current.phase, stateRef.current.proposal);
    queueMicrotask(() => { if (!disposed) setReady(true); });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersectionObserver.disconnect();
      controls.removeEventListener("change", render);
      controls.removeEventListener("start", onControlStart);
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
      model.scale.setScalar(1.35);
      model.name = gift.name;
      runtime.gifts.add(model);
    });
    runtime.render();
  }, [gifts, mode]);

  useEffect(() => {
    runtimeRef.current?.setCharacterState(phase, proposal);
  }, [proposal, phase, mode]);

  const bubbleVisible = mode === "island" && phase !== "moving" && phase !== "complete";

  return <div
    ref={hostRef}
    className="absolute inset-0 [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:touch-none [&_canvas]:outline-offset-[-4px]"
    style={{ cursor: selected && (phase === "choosing" || phase === "confirming") ? "crosshair" : "grab" }}
  >
    {bubbleVisible && <div
      ref={bubbleRef}
      className="absolute z-30 w-[min(286px,76%)] -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-[20px] border border-white/90 bg-[#fffdf5]/96 px-5 py-4 text-center shadow-[0_14px_38px_#496b5538] opacity-0 backdrop-blur-sm transition-opacity"
      role="status"
      aria-live="polite"
    >
      <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-white/90 bg-[#fffdf5]" aria-hidden="true"/>
      {phase === "choosing" && <>
        <p className="text-[16px] font-bold tracking-[-0.35px]">오늘 아이템 어디에 배치할까?</p>
        <p className="mt-1.5 text-[11px] text-[#8b7664]">{itemName}을 놓을 자리를 골라 줘!</p>
        <button onClick={() => runtimeRef.current?.suggested()} className="mt-3 rounded-full border border-[#ccd7c5] bg-white px-4 py-2 text-[11px] font-semibold text-[#397258]">빈자리 추천받기</button>
      </>}
      {phase === "confirming" && <>
        <p className="text-[17px] font-bold tracking-[-0.4px]">여기로 정할까?</p>
        <p className="mt-1.5 text-[12px] text-[#8b7664]">정하면 수정 못 해!</p>
        <div className="mt-3 flex justify-center gap-2">
          <button onClick={onChooseAgain} className="rounded-full border border-[#d8ddcf] bg-white px-4 py-2.5 text-xs text-[#71806f]">다른 자리 볼래</button>
          <button onClick={onConfirm} className="rounded-full bg-[#347657] px-4 py-2.5 text-xs font-semibold text-white">여기로 정할래</button>
        </div>
      </>}
      {phase === "farewell" && <>
        <p className="text-[20px] font-bold text-[#347657]">내일 또 봐!</p>
        <p className="mt-1.5 text-[11px] text-[#809079]">여기서 계속 인사하고 있을게 👋</p>
        <button onClick={onFinish} className="mt-3 rounded-full bg-[#347657] px-5 py-2.5 text-xs font-semibold text-white">배치 종료</button>
      </>}
    </div>}

    {!ready && !error && <div className="absolute inset-0 z-40 grid place-items-center bg-[#dceee5] text-sm text-[#547766]" role="status">섬을 준비하고 있어요…</div>}
    {error && <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#e7f0e7] p-8 text-center">
      <p className="font-semibold">3D 섬을 불러오지 못했어요.</p>
      <p className="text-sm">브라우저의 그래픽 가속을 켜고 다시 열어 주세요.</p>
      <button className="rounded-full bg-[#2b7355] px-5 py-2 text-sm text-white" onClick={() => window.location.reload()}>다시 불러오기</button>
    </div>}
  </div>;
}
