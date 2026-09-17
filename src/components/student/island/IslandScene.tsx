"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CHARACTER_MODEL_HEIGHT, createChildCharacter, createPopBurst, type ChildCharacter } from "./character";
import { createGiftModel, createPuzzleAssemblyModel, createPuzzlePieceModel, disposeObject, GIFT_MODEL_HEIGHT, replaceLandscapeProps } from "./islandModel";
import { assetSizeScale, createAssetModel } from "./proceduralAsset";
import { loadIslandPropLibrary } from "./islandAssets";
import { createIslandSky } from "./islandSky";
import { canPlaceAmongGifts, ISLAND_SCALE, PLACEMENT_GRID_STEP, SURFACE_Y } from "./placement";
import { screenSunPosition } from "./sunlight";
import { createIslandCoordinates, getPuzzleDisplayRotation, getPuzzleTerrainMetrics, puzzlePieceContains, PUZZLE_SEED, PUZZLE_STUDENT_PIECE_MAP } from "./puzzle";
import { distanceToPuzzleRim } from "./puzzleDecorations";
import { getPieceLandscape } from "./pieceLandscape";
import { fitIslandCamera, HOME_ZOOM, projectedBoxRect, tweenCameraPose } from "./cameraFit";
import type { CameraPreset, GiftKind, IslandGift, IslandScreenRect, PlacementPhase, PlacementProposal, SceneHandle, ViewMode } from "./types";

type Props = {
  mode: ViewMode;
  gifts: IslandGift[];
  incomingAsset?: Pick<IslandGift, "assetFormat" | "geometrySpec">;
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
  onOverviewChange?: (overview: boolean) => void;
};

type Runtime = {
  camera: (preset: CameraPreset) => void;
  suggested: () => void;
  gifts: THREE.Group;
  giftScale: number;
  toDisplayedWorld: (point: { x: number; z: number }, y?: number) => THREE.Vector3;
  heightAt: (x: number, z: number) => number;
  surfaceAt: (x: number, z: number) => number;
  render: () => void;
  setCharacterState: (phase: PlacementPhase, proposal: PlacementProposal | null) => void;
  toggleOverview: () => void;
};

// First entry: the camera swings in from a little to the side and above,
// zooming in, and settles on the home view.
const INTRO_MS = 1500;
const INTRO_TURN = -0.55;
const INTRO_RISE = 0.14;
const INTRO_ZOOM = 0.72;
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
const FOCUS_TWEEN_MS = 600;
const FOLLOW_TWEEN_MS = 400;
const CHARACTER_ZOOM_IN_MS = 900;
const CHARACTER_HOLD_MS = 1200;
const CHARACTER_ZOOM_OUT_MS = 900;
const ZOOM_BUTTON_MS = 280;
const USER_ZOOM_RESPONSE = 18;
const USER_ZOOM_EPSILON = 0.0001;
const DRAG_THRESHOLD = 8;
const SAFE_EDGE = 0.15;
const CLASSROOM_SPACING = 33;

export default function IslandScene({
  mode,
  gifts,
  incomingAsset,
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
  onOverviewChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const onIslandScreenRectRef = useRef(onIslandScreenRect);
  const onIntroCompleteRef = useRef(onIntroComplete);
  const onOverviewChangeRef = useRef(onOverviewChange);
  const incomingAssetRef = useRef(incomingAsset);
  useEffect(() => { incomingAssetRef.current = incomingAsset; }, [incomingAsset]);
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
    onOverviewChangeRef.current = onOverviewChange;
    stateRef.current = { gifts, selected, proposal, phase, onPropose, onArrive };
    runtimeRef.current?.render();
  }, [gifts, selected, proposal, phase, onPropose, onArrive, onIslandScreenRect, onIntroComplete, onOverviewChange]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  useImperativeHandle(controlsRef, () => ({
    camera: (preset) => runtimeRef.current?.camera(preset),
    placeSuggested: () => runtimeRef.current?.suggested(),
    toggleOverview: () => runtimeRef.current?.toggleOverview(),
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Neutral keeps the saturated greens and warm roofs that ACES washes out.
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const canvas = renderer.domElement;
    canvas.setAttribute("aria-label", mode === "island"
      ? "회전할 수 있는, 하늘에 떠 있는 큰 섬. 잔디를 누르면 캐릭터가 아이템을 들고 그 자리로 걸어갑니다."
      : "20개의 퍼즐 조각이 맞춰진 우리 반 섬 미리 보기");
    canvas.setAttribute("role", "img");
    canvas.tabIndex = 0;
    host.appendChild(canvas);

    const classroom = mode === "classroom";
    const scene = new THREE.Scene();
    // The assembled 20-piece island is much wider than one personal piece;
    // keep the atmospheric backdrop without fogging the whole diorama out.
    // Keep the lower rock band crisp; the sky and clouds already provide depth.
    scene.fog = null;
    // Reduced motion: no intro, pop or idle loop; the character simply stands there.
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The student's own island is seed 17; in the classroom it is the first of nine.
    const studentPieceIndex = PUZZLE_STUDENT_PIECE_MAP[1];
    const islands = classroom
      ? [createPuzzleAssemblyModel(17)]
      : [createPuzzlePieceModel(17, studentPieceIndex)];
    const island = islands[0];
    const displayRotation = classroom ? 0 : getPuzzleDisplayRotation(island.layout, studentPieceIndex, PUZZLE_SEED);
    const displayedCoordinates = createIslandCoordinates(displayRotation);
    if (!classroom) island.group.rotation.y = displayRotation;
    islands.forEach((model) => scene.add(model.group));
    const pieceMetrics = !classroom ? getPuzzleTerrainMetrics(island.layout, studentPieceIndex, "personal", 17) : null;
    const characterScale = pieceMetrics ? (pieceMetrics.W / 2.75) * 0.10 / CHARACTER_MODEL_HEIGHT : 0;
    // The student's own piece defines item heights in both views: terraces
    // lift items, and water, banks, houses, stairs and paths reject them.
    const pieceLandscape = getPieceLandscape(island.layout, studentPieceIndex);
    const heightAt = (x: number, z: number) => pieceLandscape.heightAt(x, z);

    // The entire terrain, bottom rocks and garden contribute to one box.
    // Eight projected box corners fit inside the canvas UI's safe rectangle.
    const islandBox = new THREE.Box3().setFromObject(island.group);
    // Added after measuring, so the clouds never enter the camera fit.
    const sky = createIslandSky(classroom, islandBox);
    scene.add(sky.group);
    const initialSize = host.getBoundingClientRect();
    let homeFit = fitIslandCamera(islandBox, Math.max(initialSize.width, 1), Math.max(initialSize.height, 1), mode);
    const { target, home } = homeFit;
    const viewDistance = homeFit.distance;
    const camera = homeFit.camera;

    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(target);
    camera.zoom = homeFit.homeZoom;
    camera.updateProjectionMatrix();
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.enablePan = false;
    controls.enableRotate = true;
    controls.minPolarAngle = THREE.MathUtils.degToRad(30);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(65);
    controls.minZoom = homeFit.minZoom;
    controls.maxZoom = homeFit.maxZoom;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 1.4;
    controls.zoomToCursor = true;
    // Handle zoom in the frame loop: OrbitControls damping only smooths rotation/pan.
    controls.enableZoom = false;
    controls.minDistance = viewDistance * 0.1;
    controls.maxDistance = viewDistance;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    controls.update();
    controls.saveState();

    // Hemisphere + a warm ambient floor keep shaded rock mid-toned instead of green-black.
    // Warm late-morning sun over a soft sky/earth bounce; shadows stay soft.
    scene.add(new THREE.HemisphereLight("#cdeaf5", "#9a7550", 1.15));
    scene.add(new THREE.AmbientLight("#fff1dc", 0.38));
    const sunlight = new THREE.DirectionalLight("#ffd8a3", 2.7);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    const islandSize = Math.max(islandBox.getSize(new THREE.Vector3()).x, islandBox.getSize(new THREE.Vector3()).z);
    const shadowSize = islandSize * 0.72 + (classroom ? CLASSROOM_SPACING : 0);
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
    const fill = new THREE.DirectionalLight("#bfe0ee", 0.6);
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
    const markerSource = createGiftModel("star");
    const markerBaseDiameter = markerSource.userData.baseDiameter as number;
    disposeObject(markerSource);
    const giftScale = pieceMetrics ? (pieceMetrics.W / 2.75) * 0.07 / GIFT_MODEL_HEIGHT : 1;
    const markerDiameter = markerBaseDiameter * giftScale;
    // Medium footprint; small and large items scale their placement circle with their size class.
    const itemRadius = markerDiameter / 2;
    const giftRadius = (gift: Pick<IslandGift, "assetFormat" | "geometrySpec">) => itemRadius * assetSizeScale(gift);
    const incomingRadius = () => giftRadius(incomingAssetRef.current ?? {});
    const marker = new THREE.Mesh(new THREE.RingGeometry(markerDiameter * 0.42, markerDiameter * 0.5, 48), markerMaterial);
    marker.visible = false;
    scene.add(marker);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const ringFacing = new THREE.Vector3(0, 0, 1);
    const groundNormal = new THREE.Vector3();
    const studentPieceSeed = island.puzzle.pieces[studentPieceIndex].seed;
    const initialCharacterPosition = displayedCoordinates.toDisplayedWorld(studentPieceSeed, heightAt(studentPieceSeed.x, studentPieceSeed.z) + 0.02);
    const homeOffset = new THREE.Spherical().setFromVector3(home.clone().sub(target));
    const introOffset = new THREE.Spherical();
    let pointerDown: { x: number; y: number; id: number; dragged: boolean } | null = null;
    const activePointers = new Set<number>();
    let hoverPointer: PointerEvent | null = null;
    let characterShot = false;
    let greetingStartAt: number | null = null;
    let userZoom: { zoom: number; cursor: THREE.Vector3 } | null = null;
    let lastFrameAt = performance.now();
    const touchPoints = new Map<number, THREE.Vector2>();
    let pinchDistance = 0;
    let frame = 0;
    let disposed = false;
    let visible = true;
    let character: ChildCharacter | null = null;
    let characterBaseY = initialCharacterPosition.y;
    // Clicks and the bubble wait until the pop-in has landed.
    let characterReadyAt = 0;
    let entrance: { start: number; burst: ReturnType<typeof createPopBurst> } | null = null;
    let lastScreenRect: IslandScreenRect | null = null;
    let walk: { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number; clickData?: { x: number; z: number }; farewell?: boolean } | null = null;
    let overview = false;
    let placementCamera = false;
    let tween: { from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; target: THREE.Vector3; start: number; duration: number; zoom: number; nextZoom: number; home: boolean; easeInOut?: boolean; onDone?: () => void } | null = null;
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
      camera.zoom = THREE.MathUtils.lerp(HOME_ZOOM, INTRO_ZOOM, remaining);
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
      const next = createChildCharacter("star", incomingAssetRef.current);
      next.root.position.copy(initialCharacterPosition);
      next.root.scale.setScalar(characterScale);
      characterBaseY = initialCharacterPosition.y;
      characterGroup.add(next.root);
      characterReadyAt = 0;
      if (pop && !calm) {
        const burst = createPopBurst();
        burst.group.position.copy(initialCharacterPosition);
        burst.group.scale.setScalar(pieceMetrics ? (pieceMetrics.W / ISLAND_SCALE) * 0.025 : characterScale);
        scene.add(burst.group);
        entrance = { start: performance.now(), burst };
        characterReadyAt = entrance.start + POP_MS + BUBBLE_DELAY_MS;
        next.root.scale.setScalar(0);
      }
      return next;
    }

    const pieceTargetBounds = () => {
      const polygon = island.puzzle.pieces[studentPieceIndex].polygon;
      const points = polygon.map((point) => displayedCoordinates.toDisplayedWorld(point));
      return new THREE.Box3().setFromPoints(points);
    };
    const clampPlacementTarget = (candidate: THREE.Vector3) => {
      const bounds = pieceTargetBounds();
      return new THREE.Vector3(
        THREE.MathUtils.clamp(candidate.x, bounds.min.x, bounds.max.x),
        target.y,
        THREE.MathUtils.clamp(candidate.z, bounds.min.z, bounds.max.z),
      );
    };
    const poseForTarget = (nextTarget: THREE.Vector3, zoom: number) => {
      const offset = homeOffset.clone();
      return { position: new THREE.Vector3().setFromSpherical(offset).add(nextTarget), zoom };
    };
    const correctFocusTarget = (candidate: THREE.Vector3, zoom: number) => {
      let corrected = clampPlacementTarget(candidate);
      const centre = target.clone();
      const visibleEnough = (point: THREE.Vector3) => {
        const probe = camera.clone();
        const pose = poseForTarget(point, zoom);
        probe.position.copy(pose.position);
        probe.zoom = zoom;
        probe.updateProjectionMatrix();
        return projectedBoxRect(islandBox, probe, canvas.clientWidth, canvas.clientHeight).left <= canvas.clientWidth * 0.25
          && projectedBoxRect(islandBox, probe, canvas.clientWidth, canvas.clientHeight).right >= canvas.clientWidth * 0.75
          && projectedBoxRect(islandBox, probe, canvas.clientWidth, canvas.clientHeight).top <= canvas.clientHeight * 0.25
          && projectedBoxRect(islandBox, probe, canvas.clientWidth, canvas.clientHeight).bottom >= canvas.clientHeight * 0.75;
      };
      for (let index = 0; index < 8 && !visibleEnough(corrected); index++) corrected = corrected.lerp(centre, 0.5);
      return corrected;
    };
    const focusTarget = (worldTarget: THREE.Vector3, duration = FOCUS_TWEEN_MS, onDone?: () => void) => {
      if (classroom || !character) { onDone?.(); return; }
      const desiredZoom = THREE.MathUtils.clamp(80 * (camera.right - camera.left) / Math.max(canvas.clientWidth * markerDiameter, 0.001), homeFit.minZoom, homeFit.maxZoom);
      const nextTarget = correctFocusTarget(worldTarget, desiredZoom);
      const pose = poseForTarget(nextTarget, desiredZoom);
      overview = false;
      onOverviewChangeRef.current?.(false);
      controls.enabled = false;
      tween = { from: camera.position.clone(), to: pose.position, fromTarget: controls.target.clone(), target: nextTarget, start: performance.now(), duration, zoom: camera.zoom, nextZoom: desiredZoom, home: false, onDone };
      render();
    };
    const setPlacementControls = (active: boolean) => {
      placementCamera = active;
      controls.enableRotate = true;
      controls.enablePan = active && !overview;
    };

    function finishCharacterShot() {
      if (!characterShot) return;
      characterShot = false;
      greetingStartAt = null;
      tween = null;
      camera.position.copy(home);
      camera.zoom = homeFit.homeZoom;
      controls.target.copy(target);
      camera.updateProjectionMatrix();
      controls.enabled = true;
      controls.update();
      render();
    }

    function startCharacterShot(
      worldFocus = initialCharacterPosition.clone().add(new THREE.Vector3(0, characterScale * CHARACTER_MODEL_HEIGHT / 2, 0)),
      closeZoom = homeFit.homeZoom * 3.5,
    ) {
      if (calm) return;
      characterShot = true;
      controls.enabled = false;
      marker.visible = false;
      const focus = worldFocus.clone();
      const zoom = THREE.MathUtils.clamp(closeZoom, controls.minZoom, controls.maxZoom);
      // The fitted orthographic frustum is shifted for the toolbar safe area.
      // Compensate that shift so the character projects to actual canvas centre.
      const focusProbe = camera.clone();
      focusProbe.position.copy(poseForTarget(focus, zoom).position);
      focusProbe.lookAt(focus);
      focusProbe.updateMatrixWorld(true);
      focus.addScaledVector(new THREE.Vector3().setFromMatrixColumn(focusProbe.matrixWorld, 0), -(camera.left + camera.right) / 2);
      focus.addScaledVector(new THREE.Vector3().setFromMatrixColumn(focusProbe.matrixWorld, 1), -(camera.top + camera.bottom) / 2);
      userZoom = null;
      const transition = (nextTarget: THREE.Vector3, nextZoom: number, duration: number, onDone: () => void) => {
        const pose = poseForTarget(nextTarget, nextZoom);
        controls.enabled = false;
        tween = { from: camera.position.clone(), to: pose.position, fromTarget: controls.target.clone(), target: nextTarget.clone(), start: performance.now(), duration, zoom: camera.zoom, nextZoom, home: false, easeInOut: true, onDone };
        render();
      };
      transition(focus, zoom, CHARACTER_ZOOM_IN_MS, () => {
        greetingStartAt = stateRef.current.phase === "choosing" ? performance.now() : null;
        transition(focus, zoom, CHARACTER_HOLD_MS, () => {
          greetingStartAt = null;
          transition(target, homeFit.homeZoom, CHARACTER_ZOOM_OUT_MS, () => {
            characterShot = false;
            controls.enabled = true;
          });
        });
      });
    }

    function characterDestination(nextProposal: PlacementProposal) {
      const destination = displayedCoordinates.toDisplayedWorld(nextProposal);
      const destinationData = displayedCoordinates.fromDisplayedWorld(destination);
      destination.y = heightAt(destinationData.x, destinationData.z) + 0.02;
      console.log("[island placement] character move target", JSON.stringify({
        proposalData: nextProposal,
        destination,
      }));
      return destination;
    }

    function farewellDestination(proposal: PlacementProposal) {
      const origin = characterDestination(proposal);
      const bodyRadius = characterScale * 0.45;
      const clearance = giftRadius(proposal) * 1.6 + bodyRadius;
      camera.updateMatrixWorld(true);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const sideAngle = Math.atan2(right.z, right.x);
      const safeTerrain = (point: THREE.Vector3) => {
        const data = displayedCoordinates.fromDisplayedWorld(point);
        return pieceLandscape.canPlace(data.x, data.z, bodyRadius);
      };
      const clearOfGifts = (point: THREE.Vector3, departing = false) => stateRef.current.gifts.every((gift) => {
        // The first steps leave the item that was just deposited.
        if (departing && Math.hypot(gift.x - proposal.x, gift.z - proposal.z) < 1e-6) return true;
        const position = displayedCoordinates.toDisplayedWorld(gift);
        return Math.hypot(position.x - point.x, position.z - point.z) >= giftRadius(gift) * 1.6 + bodyRadius;
      });
      // Prefer either screen side, then try nearby angles further inside the island.
      for (let ring = 1; ring <= 6; ring++) {
        for (let index = 0; index < 16; index++) {
          const angle = sideAngle + (index % 2 ? Math.PI : 0) + Math.floor(index / 2) * Math.PI / 8;
          const destination = origin.clone().add(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(clearance * (1 + (ring - 1) * 0.35)));
          if (!safeTerrain(destination) || !clearOfGifts(destination)) continue;
          let clearPath = true;
          for (let step = 1; step <= 12; step++) {
            const point = origin.clone().lerp(destination, step / 12);
            if (!safeTerrain(point) || !clearOfGifts(point, true)) { clearPath = false; break; }
          }
          if (!clearPath) continue;
          const data = displayedCoordinates.fromDisplayedWorld(destination);
          destination.y = heightAt(data.x, data.z) + 0.02;
          return destination;
        }
      }
      return null;
    }

    function beginFarewellWave() {
      if (disposed || stateRef.current.phase !== "farewell" || !character) return;
      character.setPose("waving");
      character.root.rotation.y = Math.atan2(camera.position.x - character.root.position.x, camera.position.z - character.root.position.z);
      character.animate(calm ? 0 : performance.now() / 1000);
      if (calm) { moveCamera("home"); return; }
      // Frame the actual deposited gift and character together, including room
      // for the raised hand, so neither is cropped by the close-up.
      const subjects = new THREE.Box3().setFromObject(character.root);
      const placedGift = giftGroup.children[giftGroup.children.length - 1];
      if (placedGift) subjects.union(new THREE.Box3().setFromObject(placedGift));
      subjects.expandByScalar(characterScale * 0.5);
      const centre = subjects.getCenter(new THREE.Vector3());
      const probe = camera.clone();
      probe.position.copy(poseForTarget(centre, 1).position);
      probe.lookAt(centre);
      probe.zoom = 1;
      probe.updateProjectionMatrix();
      const rect = projectedBoxRect(subjects, probe, canvas.clientWidth, canvas.clientHeight);
      const zoom = Math.min(homeFit.homeZoom * 3.5,
        canvas.clientWidth * 0.7 / Math.max(rect.right - rect.left, 0.001),
        canvas.clientHeight * 0.55 / Math.max(rect.bottom - rect.top, 0.001));
      startCharacterShot(centre, zoom);
    }

    function setCharacterState(nextPhase: PlacementPhase, nextProposal: PlacementProposal | null, pop = true) {
      setPlacementControls(nextPhase === "choosing" || nextPhase === "confirming");
      if (classroom || nextPhase === "ready" || nextPhase === "complete") {
        walk = null;
        if (characterShot) finishCharacterShot();
        removeCharacter();
        setPlacementControls(false);
        render();
        return;
      }

      const appearing = !character;
      const current = character ?? (character = summonCharacter(pop));
      if (appearing && pop && nextPhase === "choosing") startCharacterShot();
      current.setPose(nextPhase === "farewell" ? "walking" : "holding");
      const farewellTarget = nextPhase === "farewell" && nextProposal ? farewellDestination(nextProposal) : null;
      if ((nextPhase === "moving" && nextProposal) || farewellTarget) {
        const destination = farewellTarget ?? characterDestination(nextProposal!);
        const distance = current.root.position.distanceTo(destination);
        walk = {
          from: current.root.position.clone(),
          to: destination,
          start: performance.now(),
          duration: THREE.MathUtils.clamp(distance / 4.8 * 1000, 480, 2200),
          clickData: nextPhase === "moving" ? nextProposal ?? undefined : undefined,
          farewell: nextPhase === "farewell",
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
      if (nextPhase === "farewell" && !walk) beginFarewellWave();
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
      const deltaSeconds = Math.min(Math.max((now - lastFrameAt) / 1000, 0), 0.05);
      lastFrameAt = now;

      if (!current.selected || current.phase === "moving" || current.phase === "farewell" || current.phase === "complete") marker.visible = false;

      if (intro) {
        const progress = Math.min((now - intro.start) / INTRO_MS, 1);
        placeIntroCamera(1 - easeInOutCubic(progress));
        if (progress === 1) {
          camera.position.copy(home);
          camera.zoom = homeFit.homeZoom;
          camera.updateProjectionMatrix();
          intro = null;
          controls.enabled = true;
          onIntroCompleteRef.current?.();
        }
        else keepAnimating = true;
      }

      if (tween) {
        const progress = Math.min((now - tween.start) / tween.duration, 1);
        const eased = tween.easeInOut ? easeInOutCubic(progress) : 1 - (1 - progress) ** 3;
        const pose = tween.easeInOut
          ? { position: tween.from.clone().lerp(tween.to, eased), zoom: THREE.MathUtils.lerp(tween.zoom, tween.nextZoom, eased) }
          : tweenCameraPose(tween.from, tween.to, tween.zoom, tween.nextZoom, progress);
        camera.position.copy(pose.position);
        camera.zoom = pose.zoom;
        controls.target.copy(tween.fromTarget).lerp(tween.target, eased);
        camera.updateProjectionMatrix();
        if (progress === 1) {
          camera.position.copy(tween.to);
          camera.zoom = tween.nextZoom;
          controls.target.copy(tween.target);
          if (tween.home) controls.reset();
          const done = tween.onDone;
          tween = null;
          controls.enabled = true;
          setPlacementControls(placementCamera);
          done?.();
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
          const projectedCharacter = root.position.clone().project(camera);
          if (!tween && (projectedCharacter.x < -1 + SAFE_EDGE * 2 || projectedCharacter.x > 1 - SAFE_EDGE * 2 || projectedCharacter.y < -1 + SAFE_EDGE * 2 || projectedCharacter.y > 1 - SAFE_EDGE * 2)) {
            focusTarget(root.position, FOLLOW_TWEEN_MS);
          }
          const walkPoint = displayedCoordinates.fromDisplayedWorld(root.position);
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
            clickData: activeWalk.clickData,
            clickToCharacterDataDistance: activeWalk.clickData ? Math.hypot(
              displayedCoordinates.fromDisplayedWorld(root.position).x - activeWalk.clickData.x,
              displayedCoordinates.fromDisplayedWorld(root.position).z - activeWalk.clickData.z,
            ) : null,
            }));
            if (activeWalk.farewell) beginFarewellWave();
            else current.onArrive();
          } else {
            keepAnimating = true;
          }
        } else {
          const hop = current.phase === "farewell" && !calm ? Math.abs(Math.sin(now * 0.006)) * 0.05 : 0;
          root.position.y = characterBaseY + hop;
          root.rotation.y = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
          const greetingProgress = greetingStartAt === null ? undefined : THREE.MathUtils.clamp((now - greetingStartAt) / CHARACTER_HOLD_MS, 0, 1);
          character.animate(seconds, 0, greetingProgress);
        }
        // Breathing and waving keep the loop running while the character is out.
        if (!calm) keepAnimating = true;
      }

      if (userZoom && !tween && !intro && !characterShot) {
        const motion = userZoom;
        const remaining = Math.log(motion.zoom / camera.zoom);
        const settled = Math.abs(remaining) < USER_ZOOM_EPSILON;
        const nextZoom = settled ? motion.zoom : camera.zoom * Math.exp(remaining * (1 - Math.exp(-USER_ZOOM_RESPONSE * deltaSeconds)));
        camera.updateMatrixWorld(true);
        const before = motion.cursor.clone().unproject(camera);
        camera.zoom = nextZoom;
        camera.updateProjectionMatrix();
        const shift = before.sub(motion.cursor.clone().unproject(camera));
        camera.position.add(shift);
        controls.target.add(shift);
        if (settled) userZoom = null;
        else keepAnimating = true;
      }
      const changing = controls.update();
      // After controls.update(), so the cloud layer tracks this frame's camera.
      if (sky.update(now, camera, controls.target, calm)) keepAnimating = true;
      giftGroup.children.forEach((gift) => {
        gift.rotation.y = Math.atan2(camera.position.x - gift.position.x, camera.position.z - gift.position.z);
        if (gift.userData.sparkle && !calm) {
          gift.scale.setScalar(giftScale * (gift.userData.sizeScale ?? 1) * (1 + Math.sin(now * 0.006) * 0.035));
        }
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
      if (characterShot) { finishCharacterShot(); return; }
      intro = null;
      userZoom = null;
      controls.enabled = false;
      let next = camera.position.clone();
      let nextZoom = camera.zoom;
      if (preset === "home") { next = home.clone(); nextZoom = homeFit.homeZoom; }
      if (preset === "top") next = new THREE.Vector3().setFromSphericalCoords(viewDistance, controls.minPolarAngle, 0).add(controls.target);
      if (preset === "left" || preset === "right") {
        next.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), preset === "left" ? -Math.PI / 6 : Math.PI / 6).add(controls.target);
      }
      if (preset === "in" || preset === "out") {
        nextZoom = THREE.MathUtils.clamp(camera.zoom * (preset === "in" ? 1.2 : 1 / 1.2), homeFit.minZoom, homeFit.maxZoom);
      }
      const nextTarget = preset === "home" ? target.clone() : controls.target.clone();
      tween = { from: camera.position.clone(), to: next, fromTarget: controls.target.clone(), target: nextTarget, start: performance.now(), duration: preset === "in" || preset === "out" ? ZOOM_BUTTON_MS : HOME_TWEEN_MS, zoom: camera.zoom, nextZoom, home: preset === "home" };
      if (preset === "home") { overview = false; setPlacementControls(placementCamera); }
      render();
    }

    const validPoint = (x: number, z: number) => {
      const data = displayedCoordinates.fromDisplayedWorld(new THREE.Vector3(x, 0, z));
      const radius = incomingRadius();
      if (classroom) return canPlaceAmongGifts(data.x, data.z, island.layout, stateRef.current.gifts, null, radius, radius * 2, giftRadius);
      return pieceLandscape.canPlace(data.x, data.z, radius)
        && canPlaceAmongGifts(data.x, data.z, island.layout, stateRef.current.gifts, null, radius, radius * 2, giftRadius);
    };
    const resolvePlacement = (data: { x: number; z: number }) => {
      if (classroom || !pieceMetrics) return validPoint(data.x, data.z) ? data : null;
      const insidePiece = puzzlePieceContains(island.puzzle.pieces[studentPieceIndex], data);
      const awayFromRim = distanceToPuzzleRim(data, pieceLandscape.polygon) >= pieceLandscape.edgeMargin;
      if (!insidePiece || !awayFromRim) return null;
      const world = displayedCoordinates.toDisplayedWorld(data);
      if (validPoint(world.x, world.z)) return data;
      const step = Math.max(0.12, (pieceMetrics.W / ISLAND_SCALE) * 0.025);
      for (let radius = step; radius <= pieceMetrics.W * 0.34; radius += step) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
          const candidate = { x: data.x + Math.cos(angle) * radius, z: data.z + Math.sin(angle) * radius };
          const candidateWorld = displayedCoordinates.toDisplayedWorld(candidate);
          if (validPoint(candidateWorld.x, candidateWorld.z)) return candidate;
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
      camera.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(island.surface)[0];
      // Water sits below the meadow; it still answers (and resolves to the shore).
      return hit && (hit.point.y >= SURFACE_Y - 0.01 || hit.object.userData.surfaceKind === "water") ? hit : undefined;
    };

    const canChooseLocation = () => {
      const current = stateRef.current;
      return !!current.selected && !classroom && !!character && performance.now() >= characterReadyAt
        && !overview && !tween && (current.phase === "choosing" || current.phase === "confirming");
    };

    const onMove = (event: PointerEvent) => {
      hoverPointer = event;
      if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) >= DRAG_THRESHOLD) pointerDown.dragged = true;
      if (!canChooseLocation()) return;
      const hit = intersect(event);
      marker.visible = !!hit;
      marker.scale.setScalar(assetSizeScale(incomingAssetRef.current ?? {}));
      if (hit?.face) {
        // Lay the ring on the facet under the pointer so slopes don't clip it.
        groundNormal.copy(hit.face.normal).transformDirection(island.surface.matrixWorld);
        marker.quaternion.setFromUnitVectors(ringFacing, groundNormal);
        marker.position.copy(hit.point).addScaledVector(groundNormal, 0.05);
      const data = displayedCoordinates.fromDisplayedWorld(hit.point);
        markerMaterial.color.set(resolvePlacement(data) ? "#fff9d4" : "#c57967");
      }
      render();
    };

    const onDown = (event: PointerEvent) => {
      activePointers.add(event.pointerId);
      if (activePointers.size > 1) { pointerDown = null; return; }
      if (characterShot) { finishCharacterShot(); pointerDown = null; return; }
      if (event.button === 0) pointerDown = { x: event.clientX, y: event.clientY, id: event.pointerId, dragged: false };
    };

    const onUp = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      const down = pointerDown;
      pointerDown = null;
      const current = stateRef.current;
      if (!down || down.id !== event.pointerId || down.dragged || activePointers.size) return;
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) >= DRAG_THRESHOLD) return;
      if (overview && current.phase === "choosing") { focusTarget(character?.root.position ?? initialCharacterPosition); return; }
      if (!canChooseLocation() || !current.selected) return;
      const point = intersect(event)?.point;
      const data = point && displayedCoordinates.fromDisplayedWorld(point);
      const resolved = data && resolvePlacement(data);
      console.log("[island placement] click pipeline", JSON.stringify({
        click: { x: event.clientX, y: event.clientY },
        hitMesh: point ? (intersect(event)?.object.name ?? null) : null,
        hit: point,
        placementData: data,
        targetBeforeAdjustment: data,
        resolvedPlacement: resolved,
        targetAfterAdjustment: resolved,
        adjusted: !!data && !!resolved && (Math.hypot(resolved.x - data.x, resolved.z - data.z) > 1e-6),
        valid: !!resolved,
      }));
      if (data && resolved) {
        setPlacementNotice(null);
        current.onPropose(current.selected, resolved.x, resolved.z);
        marker.position.copy(displayedCoordinates.toDisplayedWorld(resolved, heightAt(resolved.x, resolved.z) + 0.05));
        marker.scale.setScalar(assetSizeScale(incomingAssetRef.current ?? {}));
        marker.visible = true;
        render();
      } else if (data) {
        setPlacementNotice("조각 안쪽의 빈 윗면을 눌러 주세요.");
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = window.setTimeout(() => setPlacementNotice(null), 2200);
      }
    };

    const onLeave = () => { hoverPointer = null; marker.visible = false; render(); };
    const onCancel = (event: PointerEvent) => { activePointers.delete(event.pointerId); pointerDown = null; onLeave(); };
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
      if (tween) {
        const pose = poseForTarget(tween.target, tween.nextZoom);
        tween.to.copy(pose.position);
      }
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
    const onControlStart = () => { tween = null; controls.enabled = true; if (performance.now() - introStartRef.current! >= INTRO_MS) intro = null; };
    const onControlChange = () => {
      if (hoverPointer) onMove(hoverPointer);
      render();
    };
    const requestUserZoom = (zoom: number, clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      userZoom = {
        zoom: THREE.MathUtils.clamp(zoom, controls.minZoom, controls.maxZoom),
        cursor: new THREE.Vector3((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1, 0),
      };
      render();
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (characterShot) { finishCharacterShot(); return; }
      if (intro) return;
      tween = null;
      controls.enabled = true;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
      requestUserZoom((userZoom?.zoom ?? camera.zoom) * Math.exp(-THREE.MathUtils.clamp(delta, -240, 240) * (event.ctrlKey ? 0.008 : 0.0025)), event.clientX, event.clientY);
    };
    const onTouchDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      touchPoints.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      if (touchPoints.size === 2) {
        const [a, b] = [...touchPoints.values()];
        pinchDistance = a.distanceTo(b);
      }
    };
    const onTouchMove = (event: PointerEvent) => {
      if (!touchPoints.has(event.pointerId)) return;
      touchPoints.get(event.pointerId)!.set(event.clientX, event.clientY);
      if (touchPoints.size !== 2 || intro || characterShot) return;
      const [a, b] = [...touchPoints.values()];
      const distance = a.distanceTo(b);
      if (pinchDistance > 0 && distance > 0) {
        requestUserZoom((userZoom?.zoom ?? camera.zoom) * distance / pinchDistance, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      pinchDistance = distance;
    };
    const onTouchEnd = (event: PointerEvent) => {
      touchPoints.delete(event.pointerId);
      pinchDistance = 0;
    };
    const onContextLost = (event: Event) => { event.preventDefault(); setError(true); };
    controls.addEventListener("change", onControlChange);
    controls.addEventListener("start", onControlStart);
    canvas.addEventListener("pointerdown", onTouchDown, true);
    canvas.addEventListener("pointermove", onTouchMove, true);
    canvas.addEventListener("pointerup", onTouchEnd, true);
    canvas.addEventListener("pointercancel", onTouchEnd, true);
    canvas.addEventListener("wheel", onWheel, { capture: true, passive: false });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("webglcontextlost", onContextLost);
    document.addEventListener("visibilitychange", render);

    // Poly Pizza models replace the procedural stand-ins once decoded. The
    // loading card waits briefly for them so the swap is rarely visible.
    const assetsReady = loadIslandPropLibrary().then((library) => {
      if (disposed || !library.size) return;
      island.props = replaceLandscapeProps(island.group, island.props, island.layout, island.pieceIndices, library);
      render();
    }).catch((error) => console.warn("[island assets] failed to load", error));

    runtimeRef.current = {
      camera: moveCamera,
      gifts: giftGroup,
      giftScale,
      toDisplayedWorld: displayedCoordinates.toDisplayedWorld.bind(displayedCoordinates),
      heightAt,
      surfaceAt: pieceLandscape.surfaceAt,
      render,
      setCharacterState,
      suggested: () => {
        const current = stateRef.current;
        if (!current.selected || !canChooseLocation()) return;
        // Scan in puzzle data coordinates: (x, z) is what gets proposed.
        const polygon = island.puzzle.pieces[studentPieceIndex].polygon;
        const bounds = new THREE.Box3().setFromPoints(polygon.map((point) => new THREE.Vector3(point.x, 0, point.z)));
        for (let x = bounds.min.x; x <= bounds.max.x; x += PLACEMENT_GRID_STEP) {
          for (let z = bounds.min.z; z <= bounds.max.z; z += PLACEMENT_GRID_STEP) {
            const world = displayedCoordinates.toDisplayedWorld({ x, z });
            if (validPoint(world.x, world.z)) {
              console.log("[island placement] suggested placement", JSON.stringify({ x, z }));
              const projected = world.clone().project(camera);
              const reveal = projected.x < -1 || projected.x > 1 || projected.y < -1 || projected.y > 1;
              const propose = () => current.onPropose(current.selected!, x, z);
              if (reveal) focusTarget(world, FOCUS_TWEEN_MS, propose);
              else propose();
              return;
            }
          }
        }
      },
      toggleOverview: () => {
        const current = stateRef.current;
        if (!character || current.phase !== "choosing") return;
        if (overview) focusTarget(character.root.position);
        else {
          overview = true;
          onOverviewChangeRef.current?.(true);
          moveCamera("home");
          controls.enablePan = false;
        }
      },
    };

    resize();
    setCharacterState(stateRef.current.phase, stateRef.current.proposal, false);
    Promise.race([assetsReady, new Promise((resolve) => window.setTimeout(resolve, 2500))]).then(() => { if (!disposed) setReady(true); });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersectionObserver.disconnect();
      controls.removeEventListener("change", onControlChange);
      controls.removeEventListener("start", onControlStart);
      controls.dispose();
      canvas.removeEventListener("pointerdown", onTouchDown, true);
      canvas.removeEventListener("pointermove", onTouchMove, true);
      canvas.removeEventListener("pointerup", onTouchEnd, true);
      canvas.removeEventListener("pointercancel", onTouchEnd, true);
      canvas.removeEventListener("wheel", onWheel, true);
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
      const model = createAssetModel(gift);
      const scale = runtime.giftScale * (model.userData.sizeScale ?? 1);
      // Rest on the visible ground and sink 2% of the item so round bottoms read as touching it.
      model.position.copy(runtime.toDisplayedWorld(gift, runtime.surfaceAt(gift.x, gift.z) - scale * 0.02));
      model.scale.setScalar(scale);
      model.name = gift.name;
      model.userData.sparkle = gift.id === gifts[gifts.length - 1]?.id;
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
