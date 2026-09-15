"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CHARACTER_MODEL_HEIGHT, createChildCharacter, createPopBurst, type ChildCharacter } from "./character";
import { createGiftModel, createPuzzleAssemblyModel, createPuzzlePieceModel, disposeObject, GIFT_MODEL_HEIGHT } from "./islandModel";
import { createIslandSky } from "./islandSky";
import { canPlaceAmongGifts, ISLAND_RADIUS, SURFACE_Y } from "./placement";
import { screenSunPosition } from "./sunlight";
import { getPuzzleTerrainMetrics, islandCoordinates, puzzlePieceContains, PUZZLE_STUDENT_PIECE_MAP, ISLAND_DISPLAY_ROTATION } from "./puzzle";
import { distanceToPuzzleRim, getPuzzleDecorationPlan } from "./puzzleDecorations";
import { fitIslandCamera, projectedBoxRect, tweenCameraPose } from "./cameraFit";
import type { CameraPreset, GiftKind, IslandGift, IslandScreenRect, PlacementPhase, PlacementProposal, SceneHandle, ViewMode } from "./types";

type Props = {
  mode: ViewMode;
  gifts: IslandGift[];
  selected: GiftKind | null;
  proposal: PlacementProposal | null;
  phase: PlacementPhase;
  onPropose: (kind: GiftKind, x: number, z: number) => void;
  onArrive: () => void;
  onChooseAgain: () => void;
  onConfirm: () => void;
  onFinish: () => void;
  controlsRef: Ref<SceneHandle>;
  onIslandScreenRect?: (rect: IslandScreenRect) => void;
  onIntroComplete?: () => void;
};

type Runtime = {
  camera: (preset: CameraPreset) => void;
  suggested: () => void;
  gifts: THREE.Group;
  giftScale: number;
  heightAt: (x: number, z: number) => number;
  render: () => void;
  setCharacterState: (phase: PlacementPhase, proposal: PlacementProposal | null) => void;
};

// First entry: the camera swings in from a little to the side and above,
// zooming in, and settles on the home view.
const INTRO_MS = 1500;
const INTRO_TURN = -0.55;
const INTRO_RISE = 0.14;
const INTRO_ZOOM = 0.8;
// The character pops in (0 → 1.15 → 1), sparkles trail on a little longer,
// and its bubble follows once the pop has landed.
const POP_MS = 400;
const BURST_MS = 700;
const BUBBLE_DELAY_MS = 0;
// easeOutBack with this overshoot peaks at 1.15.
const POP_OVERSHOOT = 2.165;
// Just above the hair, in the character's own units.

const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
const easeOutBack = (t: number) => 1 + (POP_OVERSHOOT + 1) * (t - 1) ** 3 + POP_OVERSHOOT * (t - 1) ** 2;

const HOME_TWEEN_MS = 500;
const CLASSROOM_SPACING = 33;

export default function IslandScene({
  mode,
  gifts,
  selected,
  proposal,
  phase,
  onPropose,
  onArrive,
  onChooseAgain,
  onConfirm,
  onFinish,
  controlsRef,
  onIslandScreenRect,
  onIntroComplete,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const onIslandScreenRectRef = useRef(onIslandScreenRect);
  const onIntroCompleteRef = useRef(onIntroComplete);
  const noticeTimerRef = useRef<number | null>(null);
  const stateRef = useRef({ gifts, selected, proposal, phase, onPropose, onArrive });
  // When the intro began: it plays once per visit, and a rebuilt scene
  // (StrictMode re-run, quick view switch) picks it up where it was.
  const introStartRef = useRef<number | null>(null);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [placementNotice, setPlacementNotice] = useState<string | null>(null);

  useEffect(() => {
    onIslandScreenRectRef.current = onIslandScreenRect;
    onIntroCompleteRef.current = onIntroComplete;
    stateRef.current = { gifts, selected, proposal, phase, onPropose, onArrive };
    runtimeRef.current?.render();
  }, [gifts, selected, proposal, phase, onPropose, onArrive, onIslandScreenRect, onIntroComplete]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  useImperativeHandle(controlsRef, () => ({
    camera: (preset) => runtimeRef.current?.camera(preset),
    placeSuggested: () => runtimeRef.current?.suggested(),
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      // Transparent so the host's CSS sky gradient shows through.
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      queueMicrotask(() => setError(true));
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.12;

    const canvas = renderer.domElement;
    canvas.setAttribute("aria-label", mode === "island"
      ? "회전할 수 있는, 하늘에 떠 있는 큰 섬. 잔디를 누르면 캐릭터가 아이템을 들고 그 자리로 걸어갑니다."
      : "20개의 퍼즐 조각이 맞춰진 우리 반 섬 미리 보기");
    canvas.setAttribute("role", "img");
    canvas.tabIndex = 0;
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const classroom = mode === "classroom";
    // Reduced motion: no intro, pop or idle loop; the character simply stands there.
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The student's own island is seed 17; in the classroom it is the first of nine.
    const studentPieceIndex = PUZZLE_STUDENT_PIECE_MAP[1];
    const islands = classroom
      ? [createPuzzleAssemblyModel(17)]
      : [createPuzzlePieceModel(17, studentPieceIndex)];
    const island = islands[0];
    if (!classroom) island.group.rotation.y = ISLAND_DISPLAY_ROTATION;
    islands.forEach((model) => scene.add(model.group));
    const sky = createIslandSky(classroom);
    scene.add(sky);
    const pieceMetrics = !classroom ? getPuzzleTerrainMetrics(island.layout, studentPieceIndex, "personal", 17) : null;
    const characterScale = pieceMetrics ? pieceMetrics.W * 0.10 / CHARACTER_MODEL_HEIGHT : 0;
    const pieceDecorationPlan = !classroom ? getPuzzleDecorationPlan(island.layout, studentPieceIndex, 17) : null;
    const heightAt = (x: number, z: number) => {
      const data = islandCoordinates.toData({ x, z });
      return island.layout.heightAt(data.x, data.z);
    };

    // The entire terrain, bottom rocks and garden contribute to one box.
    // Eight projected box corners fit inside the canvas UI's safe rectangle.
    const islandBox = new THREE.Box3().setFromObject(island.group);
    const initialSize = host.getBoundingClientRect();
    let homeFit = fitIslandCamera(islandBox, Math.max(initialSize.width, 1), Math.max(initialSize.height, 1), mode);
    const { target, home } = homeFit;
    const viewDistance = homeFit.distance;
    const camera = homeFit.camera;

    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.enablePan = false;
    controls.minPolarAngle = 0.035;
    controls.maxPolarAngle = Math.PI / 2.12;
    controls.minZoom = homeFit.minZoom;
    controls.maxZoom = homeFit.maxZoom;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.update();
    controls.saveState();

    // Hemisphere + a warm ambient floor keep shaded rock mid-toned instead of green-black.
    scene.add(new THREE.HemisphereLight("#d4f1e7", "#c4b19a", 1.4));
    scene.add(new THREE.AmbientLight("#f4ead8", 0.55));
    const sunlight = new THREE.DirectionalLight("#fff0d4", 2.0);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    const shadowSize = ISLAND_RADIUS * 1.5 + (classroom ? CLASSROOM_SPACING : 0);
    // The sun sits this far from the target, clear of every island it lights.
    const sunDistance = shadowSize * 2.2;
    Object.assign(sunlight.shadow.camera, {
      left: -shadowSize,
      right: shadowSize,
      top: shadowSize,
      bottom: -shadowSize,
      near: 0.5,
      far: sunDistance * 2.5,
    });
    sunlight.shadow.normalBias = 0.035;
    sunlight.shadow.bias = -0.0002;
    sunlight.shadow.radius = 4;
    sunlight.target.position.copy(target);
    scene.add(sunlight, sunlight.target);

    // Soft sky bounce from the viewer's lower right keeps the hanging rock readable.
    const fill = new THREE.DirectionalLight("#bfe0ee", 0.85);
    const fillOffset = new THREE.Vector3(6, -3.5, 9);
    fill.target.position.copy(target);
    scene.add(fill, fill.target);

    const giftGroup = new THREE.Group();
    const characterGroup = new THREE.Group();
    scene.add(giftGroup, characterGroup);

    const markerMaterial = new THREE.MeshBasicMaterial({
      color: "#fff9d4",
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const itemRadius = pieceMetrics ? pieceMetrics.W * 0.07 * 0.22 : 0.5;
    const markerDiameter = pieceMetrics ? pieceMetrics.W * 0.07 * 1.6 : 1;
    const marker = new THREE.Mesh(new THREE.RingGeometry(markerDiameter * 0.42, markerDiameter * 0.5, 48), markerMaterial);
    marker.visible = false;
    scene.add(marker);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const ringFacing = new THREE.Vector3(0, 0, 1);
    const groundNormal = new THREE.Vector3();
    const studentPieceSeed = island.puzzle.pieces[studentPieceIndex].seed;
    const initialCharacterPosition = islandCoordinates.toDisplayedWorld(studentPieceSeed, heightAt(studentPieceSeed.x, studentPieceSeed.z) + 0.02);
    const homeOffset = new THREE.Spherical().setFromVector3(home.clone().sub(target));
    const introOffset = new THREE.Spherical();
    let pointerDown: { x: number; y: number } | null = null;
    let frame = 0;
    let disposed = false;
    let visible = true;
    let character: ChildCharacter | null = null;
    let characterBaseY = initialCharacterPosition.y;
    // Clicks and the bubble wait until the pop-in has landed.
    let characterReadyAt = 0;
    let entrance: { start: number; burst: ReturnType<typeof createPopBurst> } | null = null;
    let lastScreenRect: IslandScreenRect | null = null;
    let walk: { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number } | null = null;
    let tween: { from: THREE.Vector3; to: THREE.Vector3; start: number; zoom: number; nextZoom: number; home: boolean } | null = null;
    introStartRef.current ??= calm ? -Infinity : performance.now();
    let intro: { start: number } | null = performance.now() - introStartRef.current < INTRO_MS ? { start: introStartRef.current } : null;
    if (intro) placeIntroCamera(1 - easeInOutCubic((performance.now() - intro.start) / INTRO_MS));
    else queueMicrotask(() => { if (!disposed) onIntroCompleteRef.current?.(); });
    controls.enabled = !intro;

    // `remaining` 1 is the intro's opening shot, 0 the home view.
    function placeIntroCamera(remaining: number) {
      introOffset.copy(homeOffset);
      introOffset.theta += remaining * INTRO_TURN;
      introOffset.phi -= remaining * INTRO_RISE;
      camera.position.setFromSpherical(introOffset).add(target);
      camera.zoom = THREE.MathUtils.lerp(1, INTRO_ZOOM, remaining);
      camera.updateProjectionMatrix();
    }

    function endEntrance() {
      if (!entrance) return;
      scene.remove(entrance.burst.group);
      disposeObject(entrance.burst.group);
      entrance = null;
    }

    function removeCharacter() {
      endEntrance();
      if (!character) return;
      characterGroup.remove(character.root);
      disposeObject(character.root);
      character = null;
    }

    // `pop` plays the entrance; a rebuilt scene (view switch) shows the character as is.
    function summonCharacter(pop: boolean) {
      const next = createChildCharacter("star");
      next.root.position.copy(initialCharacterPosition);
      next.root.scale.setScalar(characterScale);
      characterBaseY = initialCharacterPosition.y;
      characterGroup.add(next.root);
      characterReadyAt = 0;
      if (pop && !calm) {
        const burst = createPopBurst();
        burst.group.position.copy(initialCharacterPosition);
        burst.group.scale.setScalar(pieceMetrics ? pieceMetrics.W * 0.025 : characterScale);
        scene.add(burst.group);
        entrance = { start: performance.now(), burst };
        characterReadyAt = entrance.start + POP_MS + BUBBLE_DELAY_MS;
        next.root.scale.setScalar(0);
      }
      return next;
    }

    function characterDestination(nextProposal: PlacementProposal) {
      const proposalWorld = islandCoordinates.toDisplayedWorld(nextProposal);
      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
      const destination = proposalWorld.clone().addScaledVector(cameraRight, (pieceMetrics?.W ?? 4) * 0.12);
      const destinationData = islandCoordinates.fromDisplayedWorld(destination);
      destination.y = heightAt(destinationData.x, destinationData.z) + 0.02;
      console.log("[island placement] character move target", JSON.stringify({
        proposalData: nextProposal,
        proposalWorld,
        destination,
      }));
      return destination;
    }

    function setCharacterState(nextPhase: PlacementPhase, nextProposal: PlacementProposal | null, pop = true) {
      if (classroom || nextPhase === "ready" || nextPhase === "complete") {
        walk = null;
        removeCharacter();
        render();
        return;
      }

      const current = character ?? (character = summonCharacter(pop));
      current.setPose(nextPhase === "farewell" ? "waving" : "holding");
      if (nextPhase === "moving" && nextProposal) {
        const destination = characterDestination(nextProposal);
        const distance = current.root.position.distanceTo(destination);
        walk = {
          from: current.root.position.clone(),
          to: destination,
          start: performance.now(),
          duration: THREE.MathUtils.clamp(distance / 4.8 * 1000, 480, 2200),
        };
        console.log("[island placement] walk started", JSON.stringify({
          from: current.root.position.clone(),
          to: destination,
          distance,
        }));
      } else {
        walk = null;
        current.root.position.y = characterBaseY;
      }
      render();
    }

    function updateBubble() {
      // Guidance is a fixed overlay card; it never follows or occludes the character.
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

      if (intro) {
        const progress = Math.min((now - intro.start) / INTRO_MS, 1);
        placeIntroCamera(1 - easeInOutCubic(progress));
        if (progress === 1) {
          camera.position.copy(home);
          camera.zoom = 1;
          camera.updateProjectionMatrix();
          intro = null;
          controls.enabled = true;
          onIntroCompleteRef.current?.();
        }
        else keepAnimating = true;
      }

      if (tween) {
        const progress = Math.min((now - tween.start) / HOME_TWEEN_MS, 1);
        const pose = tweenCameraPose(tween.from, tween.to, tween.zoom, tween.nextZoom, progress);
        camera.position.copy(pose.position);
        camera.zoom = pose.zoom;
        camera.updateProjectionMatrix();
        if (progress === 1) {
          camera.position.copy(tween.to);
          camera.zoom = tween.nextZoom;
          controls.target.copy(target);
          if (tween.home) controls.reset();
          tween = null;
        }
        else keepAnimating = true;
      }

      if (character) {
        const root = character.root;
        const seconds = calm ? 0 : now / 1000;
        if (entrance) {
          const elapsed = now - entrance.start;
          root.scale.setScalar(characterScale * easeOutBack(Math.min(elapsed / POP_MS, 1)));
          entrance.burst.update(Math.min(elapsed / BURST_MS, 1));
          if (elapsed >= BURST_MS) endEntrance();
          keepAnimating = true;
        }

        if (activeWalk) {
          const progress = Math.min((now - activeWalk.start) / activeWalk.duration, 1);
          const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
          // Five strides, one hop per step.
          const stride = Math.sin(progress * Math.PI * 10);
          root.position.lerpVectors(activeWalk.from, activeWalk.to, eased);
          const walkPoint = islandCoordinates.toData(root.position);
          root.position.y = heightAt(walkPoint.x, walkPoint.z) + 0.02 + Math.abs(stride) * 0.1;
          root.rotation.set(0, Math.atan2(activeWalk.to.x - activeWalk.from.x, activeWalk.to.z - activeWalk.from.z), 0);
          character.animate(seconds, progress === 1 ? 0 : stride);
          if (progress === 1) {
            root.position.copy(activeWalk.to);
            characterBaseY = activeWalk.to.y;
            walk = null;
            console.log("[island placement] walk arrived", JSON.stringify({
              characterPosition: root.position.clone(),
              target: activeWalk.to,
              error: root.position.distanceTo(activeWalk.to),
            }));
            current.onArrive();
          } else {
            keepAnimating = true;
          }
        } else {
          const hop = current.phase === "farewell" && !calm ? Math.abs(Math.sin(now * 0.006)) * 0.05 : 0;
          root.position.y = characterBaseY + hop;
          root.rotation.y = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
          character.animate(seconds);
        }
        // Breathing and waving keep the loop running while the character is out.
        if (!calm) keepAnimating = true;
      }

      const changing = controls.update();
      if (sky.userData.cloudDrift) {
        sky.children.forEach((cloud, index) => {
          cloud.position.x = Math.sin(now * 0.00008 + index * 1.7) * 0.45;
        });
        keepAnimating = true;
      }
      giftGroup.children.forEach((gift) => {
        gift.rotation.y = Math.atan2(camera.position.x - gift.position.x, camera.position.z - gift.position.z);
      });
      screenSunPosition(camera, controls.target, sunDistance / 16, sunlight.position);
      fill.position.copy(fillOffset).applyQuaternion(camera.quaternion).add(controls.target);
      updateBubble();
      if (onIslandScreenRectRef.current && !intro) {
        const rect = projectedBoxRect(islandBox, camera, canvas.clientWidth, canvas.clientHeight);
        if (!lastScreenRect || Object.keys(rect).some((key) => Math.abs(rect[key as keyof IslandScreenRect] - lastScreenRect![key as keyof IslandScreenRect]) > 1)) {
          lastScreenRect = rect;
          onIslandScreenRectRef.current(rect);
        }
      }
      renderer.render(scene, camera);
      if (changing || tween || keepAnimating) render();
    }

    function moveCamera(preset: CameraPreset) {
      intro = null;
      let next = camera.position.clone();
      let nextZoom = camera.zoom;
      if (preset === "home") { next = home.clone(); nextZoom = 1; }
      if (preset === "top") next = new THREE.Vector3(0, viewDistance, 0.02).add(target);
      if (preset === "left" || preset === "right") {
        next.sub(target).applyAxisAngle(new THREE.Vector3(0, 1, 0), preset === "left" ? -Math.PI / 6 : Math.PI / 6).add(target);
      }
      if (preset === "in" || preset === "out") {
        nextZoom = THREE.MathUtils.clamp(camera.zoom * (preset === "in" ? 1.2 : 1 / 1.2), homeFit.minZoom, homeFit.maxZoom);
      }
      tween = { from: camera.position.clone(), to: next, start: performance.now(), zoom: camera.zoom, nextZoom, home: preset === "home" };
      render();
    }

    const validPoint = (x: number, z: number) => {
      const data = islandCoordinates.fromDisplayedWorld(new THREE.Vector3(x, 0, z));
      const inPiece = classroom || puzzlePieceContains(island.puzzle.pieces[studentPieceIndex], data);
      const awayFromRim = classroom || !pieceDecorationPlan || distanceToPuzzleRim(data, pieceDecorationPlan.polygon) >= pieceDecorationPlan.edgeMargin;
      const clearOfPieceDecorations = classroom || !pieceDecorationPlan || pieceDecorationPlan.decorations.every((detail) =>
        Math.hypot(detail.x - data.x, detail.z - data.z) >= detail.footprint + 0.08,
      );
      return inPiece && awayFromRim && clearOfPieceDecorations
        && canPlaceAmongGifts(data.x, data.z, island.layout, stateRef.current.gifts, null, itemRadius, itemRadius * 2);
    };
    const resolvePlacement = (data: { x: number; z: number }) => {
      if (classroom || !pieceDecorationPlan) return validPoint(data.x, data.z) ? data : null;
      const insidePiece = puzzlePieceContains(island.puzzle.pieces[studentPieceIndex], data);
      const awayFromRim = distanceToPuzzleRim(data, pieceDecorationPlan.polygon) >= pieceDecorationPlan.edgeMargin;
      if (!insidePiece || !awayFromRim) return null;
      if (validPoint(data.x, data.z)) return data;
      const step = Math.max(0.12, pieceDecorationPlan.W * 0.025);
      for (let radius = step; radius <= pieceDecorationPlan.W * 0.34; radius += step) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
          const candidate = { x: data.x + Math.cos(angle) * radius, z: data.z + Math.sin(angle) * radius };
          if (validPoint(candidate.x, candidate.z)) return candidate;
        }
      }
      return null;
    };
    // First terrain hit, kept only when it lands on the meadow (not the lip, cliff or pebbles).
    const intersect = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      scene.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(island.surface)[0];
      return hit && hit.point.y >= SURFACE_Y - 0.01 ? hit : undefined;
    };

    const canChooseLocation = () => {
      const current = stateRef.current;
      return !!current.selected && !classroom && !!character && performance.now() >= characterReadyAt
        && (current.phase === "choosing" || current.phase === "confirming");
    };

    const onMove = (event: PointerEvent) => {
      if (!canChooseLocation()) return;
      const hit = intersect(event);
      marker.visible = !!hit;
      if (hit?.face) {
        // Lay the ring on the facet under the pointer so slopes don't clip it.
        groundNormal.copy(hit.face.normal).transformDirection(island.surface.matrixWorld);
        marker.quaternion.setFromUnitVectors(ringFacing, groundNormal);
        marker.position.copy(hit.point).addScaledVector(groundNormal, 0.05);
      const data = islandCoordinates.fromDisplayedWorld(hit.point);
        markerMaterial.color.set(resolvePlacement(data) ? "#fff9d4" : "#c57967");
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
      const point = intersect(event)?.point;
      const data = point && islandCoordinates.fromDisplayedWorld(point);
      const resolved = data && resolvePlacement(data);
      console.log("[island placement] click pipeline", JSON.stringify({
        click: { x: event.clientX, y: event.clientY },
        hit: point,
        placementData: data,
        resolvedPlacement: resolved,
        adjusted: !!data && !!resolved && (Math.hypot(resolved.x - data.x, resolved.z - data.z) > 1e-6),
        valid: !!resolved,
      }));
      if (data && resolved) {
        setPlacementNotice(null);
        current.onPropose(current.selected, resolved.x, resolved.z);
        marker.visible = false;
        render();
      } else if (data) {
        setPlacementNotice("조각 안쪽의 빈 윗면을 눌러 주세요.");
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = window.setTimeout(() => setPlacementNotice(null), 2200);
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
      homeFit = fitIslandCamera(islandBox, width, height, mode);
      camera.left = homeFit.camera.left;
      camera.right = homeFit.camera.right;
      camera.top = homeFit.camera.top;
      camera.bottom = homeFit.camera.bottom;
      controls.minZoom = homeFit.minZoom;
      controls.maxZoom = homeFit.maxZoom;
      camera.zoom = THREE.MathUtils.clamp(camera.zoom, controls.minZoom, controls.maxZoom);
      if (tween) tween.nextZoom = THREE.MathUtils.clamp(tween.nextZoom, controls.minZoom, controls.maxZoom);
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
    const onControlStart = () => { tween = null; if (performance.now() - introStartRef.current! >= INTRO_MS) intro = null; };
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
      giftScale: pieceMetrics ? pieceMetrics.W * 0.07 / GIFT_MODEL_HEIGHT : 1,
      heightAt,
      render,
      setCharacterState,
      suggested: () => {
        const current = stateRef.current;
        if (!current.selected || !canChooseLocation()) return;
        for (let radius = 0; radius < ISLAND_RADIUS; radius += 0.9) {
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 7) {
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (validPoint(x, z)) {
              console.log("[island placement] suggested placement", JSON.stringify({ x, z }));
              current.onPropose(current.selected, x, z);
              return;
            }
          }
        }
      },
    };

    resize();
    setCharacterState(stateRef.current.phase, stateRef.current.proposal, false);
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
      model.position.copy(islandCoordinates.toDisplayedWorld(gift, runtime.heightAt(gift.x, gift.z) + 0.02));
      model.scale.setScalar(runtime.giftScale);
      model.name = gift.name;
      runtime.gifts.add(model);
    });
    runtime.render();
  }, [gifts, mode]);

  useEffect(() => {
    runtimeRef.current?.setCharacterState(phase, proposal);
  }, [proposal, phase, mode]);

  const bubbleVisible = mode === "island" && phase !== "ready" && phase !== "moving" && phase !== "complete";

  return <div
    ref={hostRef}
    className="absolute inset-0 bg-[linear-gradient(180deg,#9fd3ea_0%,#c9e8f0_52%,#e4f3ec_100%)] [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:touch-none [&_canvas]:outline-offset-[-4px]"
    style={{ cursor: selected && (phase === "choosing" || phase === "confirming") ? "crosshair" : "grab" }}
  >
    {/* Fixed guidance card; it is reserved by cameraFit's top safe strip. */}
    {bubbleVisible && <div
      key={phase}
    className="island-bubble island-guidance-card absolute left-1/2 top-4 z-30 flex w-[min(320px,calc(100%-24px))] -translate-x-1/2 items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/55 px-3 py-2 text-left leading-snug shadow-[0_8px_24px_#496b5530] backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      {phase === "choosing" && <>
        <div className="min-w-0 flex-1"><p className="text-[15px] font-bold tracking-[-0.35px] break-keep">오늘 아이템 어디에 놓을까?</p><p className="text-[12px] text-[#8b7664] break-keep">반짝이 별을 놓을 자리를 골라 줘!</p>{placementNotice && <p className="text-[11px] font-semibold text-[#b36c55]" role="status">{placementNotice}</p>}</div>
        <button onClick={() => runtimeRef.current?.suggested()} className="h-[30px] shrink-0 rounded-full border border-[#ccd7c5] bg-white px-2.5 text-[12px] font-semibold text-[#397258]">빈자리 추천</button>
      </>}
      {phase === "confirming" && <>
        <div className="min-w-0 flex-1"><p className="text-[15px] font-bold tracking-[-0.35px]">여기로 정할까?</p><p className="text-[12px] text-[#8b7664]">정하면 수정 못 해!</p></div>
        <div className="flex shrink-0 gap-1.5"><button onClick={onChooseAgain} className="h-[30px] rounded-full border border-[#d8ddcf] bg-white px-2 text-[12px] text-[#71806f]">다른 자리</button><button onClick={onConfirm} className="h-[30px] rounded-full bg-[#347657] px-2 text-[12px] font-semibold text-white">정하기</button></div>
      </>}
      {phase === "farewell" && <>
        <div className="min-w-0 flex-1"><p className="text-[15px] font-bold text-[#347657]">내일 또 봐!</p><p className="text-[12px] text-[#809079]">여기서 계속 인사하고 있을게 👋</p></div>
        <button onClick={onFinish} className="h-[30px] shrink-0 rounded-full bg-[#347657] px-2.5 text-[12px] font-semibold text-white">배치 종료</button>
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
