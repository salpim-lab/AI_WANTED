"use client";

import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CARRY_HEIGHT, CARRY_WIDTH, CHARACTER_MODEL_HEIGHT, createChildCharacter, LIFT_GRAB, liftRise, createPopBurst, type ChildCharacter } from "./character";
import { createGiftModel, createPuzzleAssemblyModel, createPuzzlePieceModel, disposeObject, GIFT_MODEL_HEIGHT, replaceLandscapeProps } from "./islandModel";
import { assetSizeScale, createAssetModel } from "./proceduralAsset";
import { loadIslandPropLibrary } from "./islandAssets";
import { createIslandSky } from "./islandSky";
import { canPlaceAmongGifts, ISLAND_SCALE, PLACEMENT_GRID_STEP, SURFACE_Y } from "./placement";
import { screenSunPosition } from "./sunlight";
import { createIslandCoordinates, getPuzzleDisplayRotation, getPuzzleTerrainMetrics, puzzlePieceContains, PUZZLE_SEED, PUZZLE_STUDENT_PIECE_MAP } from "./puzzle";
import { distanceToPuzzleRim } from "./puzzleDecorations";
import { findWalkingPath } from "./walkingPath";
import { getPieceLandscape } from "./pieceLandscape";
import { fitIslandCamera, HOME_ZOOM, projectedBoxRect, tweenCameraPose } from "./cameraFit";
import type { CameraPreset, GiftKind, IslandGift, PlacementPhase, PlacementProposal, SceneHandle, ViewMode } from "./types";

type Props = {
  mode: ViewMode;
  gifts: IslandGift[];
  incomingAsset?: Pick<IslandGift, "name" | "assetFormat" | "geometrySpec">;
  /** Today's item is generated: it drops in front of the character. */
  itemReady?: boolean;
  /** Bubble beside the dropped item: its name, why it was made, and the place button. */
  itemBubble?: ReactNode;
  selected: GiftKind | null;
  proposal: PlacementProposal | null;
  phase: PlacementPhase;
  onPropose: (kind: GiftKind, x: number, z: number, alreadyAtPosition?: boolean) => void;
  onArrive: () => void;
  onChooseAgain: () => void;
  onConfirm: () => void;
  onItemPlaced: () => void;
  onRetryHome: () => void;
  onHomeEntered: () => void;
  onHomeBlocked: () => void;
  controlsRef: Ref<SceneHandle>;
  onIntroComplete?: () => void;
  onOverviewChange?: (overview: boolean) => void;
  onPlacementNoticeChange: (notice: string | null) => void;
  onHomeGreetingChange: (greeting: "none" | "greeting" | "closed") => void;
  onPlacementInteraction: () => void;
};

type Runtime = {
  camera: (preset: CameraPreset) => void;
  walk: (key: string, pressed: boolean, seconds?: number) => void;
  suggested: () => void;
  gifts: THREE.Group;
  giftScale: number;
  toDisplayedWorld: (point: { x: number; z: number }, y?: number) => THREE.Vector3;
  heightAt: (x: number, z: number) => number;
  surfaceAt: (x: number, z: number) => number;
  render: () => void;
  setCharacterState: (phase: PlacementPhase, proposal: PlacementProposal | null) => void;
  syncItem: () => void;
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
// Today's item falls and bounces in front of the character, which later
// bends, grabs it and raises it onto its head.
const DROP_MS = 800;
const LIFT_MS = 1400;
const PUT_DOWN_MS = 1500;
// Once grabbed, it settles into the hands over this share of the lift.
const GRAB_SETTLE = 0.2;
const UPRIGHT = new THREE.Quaternion();
// Carried, the hands grip just above the item's base, in character units;
// while grabbing they hold it at mid-height.
const GRIP_OFFSET = new THREE.Vector3(0, -0.03, 0);

const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
const easeOutBack = (t: number) => 1 + (POP_OVERSHOOT + 1) * (t - 1) ** 3 + POP_OVERSHOOT * (t - 1) ** 2;
function easeOutBounce(t: number) {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t - 1.5 / 2.75) ** 2 + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t - 2.25 / 2.75) ** 2 + 0.9375;
  return 7.5625 * (t - 2.625 / 2.75) ** 2 + 0.984375;
}

const HOME_TWEEN_MS = 500;
const FOCUS_TWEEN_MS = 600;
const FOLLOW_TWEEN_MS = 400;
// Walks longer than this many body heights become a run.
const RUN_FROM_BODY_HEIGHTS = 3;
const CHARACTER_ZOOM_IN_MS = 900;
const CHARACTER_HOLD_MS = 1200;
const CHARACTER_ZOOM_OUT_MS = 900;
const ZOOM_BUTTON_MS = 280;
const USER_ZOOM_RESPONSE = 18;
const USER_ZOOM_EPSILON = 0.0001;
// Once home, the island settles at this fraction of the home zoom; it is also the furthest the student can zoom out. Larger = bigger island.
const FINAL_ZOOM_RATIO = 0.4;
const DRAG_THRESHOLD = 8;
const CLASSROOM_SPACING = 33;

export default function IslandScene({
  mode,
  gifts,
  incomingAsset,
  itemReady = false,
  itemBubble,
  selected,
  proposal,
  phase,
  onPropose,
  onArrive,
  onChooseAgain,
  onConfirm,
  onItemPlaced,
  onRetryHome,
  onHomeEntered,
  onHomeBlocked,
  controlsRef,
  onIntroComplete,
  onOverviewChange,
  onPlacementNoticeChange,
  onHomeGreetingChange,
  onPlacementInteraction,
}: Props) {
  const itemPlacedRef = useRef(onItemPlaced);
  useEffect(() => { itemPlacedRef.current = onItemPlaced; }, [onItemPlaced]);
  const homeCallbacksRef = useRef({ onHomeEntered, onHomeBlocked });
  useEffect(() => { homeCallbacksRef.current = { onHomeEntered, onHomeBlocked }; }, [onHomeEntered, onHomeBlocked]);
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const onIntroCompleteRef = useRef(onIntroComplete);
  const onOverviewChangeRef = useRef(onOverviewChange);
  const incomingAssetRef = useRef(incomingAsset);
  useEffect(() => { incomingAssetRef.current = incomingAsset; }, [incomingAsset]);
  const itemReadyRef = useRef(itemReady);
  const reasonBubbleRef = useRef<HTMLDivElement>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const stateRef = useRef({ gifts, selected, proposal, phase, onPropose, onArrive, onChooseAgain });
  // When the intro began: it plays once per visit, and a rebuilt scene
  // (StrictMode re-run, quick view switch) picks it up where it was.
  const introStartRef = useRef<number | null>(null);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const placementInteractionRef = useRef(onPlacementInteraction);
  useEffect(() => { placementInteractionRef.current = onPlacementInteraction; }, [onPlacementInteraction]);
  const placementNoticeCallbackRef = useRef(onPlacementNoticeChange);
  useEffect(() => { placementNoticeCallbackRef.current = onPlacementNoticeChange; }, [onPlacementNoticeChange]);
  const homeGreetingRef = useRef(onHomeGreetingChange);
  useEffect(() => { homeGreetingRef.current = onHomeGreetingChange; }, [onHomeGreetingChange]);

  useEffect(() => {
    onIntroCompleteRef.current = onIntroComplete;
    onOverviewChangeRef.current = onOverviewChange;
    stateRef.current = { gifts, selected, proposal, phase, onPropose, onArrive, onChooseAgain };
    runtimeRef.current?.render();
  }, [gifts, selected, proposal, phase, onPropose, onArrive, onChooseAgain, onIntroComplete, onOverviewChange]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  useImperativeHandle(controlsRef, () => ({
    camera: (preset) => runtimeRef.current?.camera(preset),
    walk: (key, pressed, seconds) => runtimeRef.current?.walk(key, pressed, seconds),
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
      ? "회전할 수 있는, 하늘에 떠 있는 큰 섬. 방향키로 캐릭터를 움직일 수 있습니다. 잔디를 누르면 캐릭터가 아이템을 들고 그 자리로 걸어갑니다."
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
    // The character stands at the island's centre, which is also where the camera looks.
    const islandCentre = displayedCoordinates.fromDisplayedWorld(target);
    const initialCharacterPosition = displayedCoordinates.toDisplayedWorld(islandCentre, heightAt(islandCentre.x, islandCentre.z) + 0.02);
    const homeOffset = new THREE.Spherical().setFromVector3(home.clone().sub(target));
    const introOffset = new THREE.Spherical();
    let pointerDown: { x: number; y: number; id: number; dragged: boolean } | null = null;
    const activePointers = new Set<number>();
    let hoverPointer: PointerEvent | null = null;
    let characterShot = false;
    // Where an interrupted shot snaps to: home, or the close-up for the landing shot.
    let shotEnd: { position: THREE.Vector3; target: THREE.Vector3; zoom: number } | null = null;
    let greetingStartAt: number | null = null;
    let userZoom: { zoom: number; cursor: THREE.Vector3 } | null = null;
    const movementKeys = new Set<string>();
    const arrowKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
    const keyboardDirection = new THREE.Vector3();
    const keyboardRight = new THREE.Vector3();
    const keyboardForward = new THREE.Vector3();
    const keyboardDestination = new THREE.Vector3();
    let keyboardStride = 0;
    let buttonWalking = false;
    let buttonMoved = false;
    const canMoveWithKeyboard = () => !!character && !classroom && !intro && !characterShot
      && performance.now() >= characterReadyAt
      && (stateRef.current.phase === "ready" || stateRef.current.phase === "choosing"
        || stateRef.current.phase === "moving" || stateRef.current.phase === "confirming");
    let lastFrameAt = performance.now();
    const touchPoints = new Map<number, THREE.Vector2>();
    let pinchDistance = 0;
    let frame = 0;
    let disposed = false;
    let visible = true;
    let character: ChildCharacter | null = null;
    let item: {
      object: THREE.Object3D;
      drop?: { from: THREE.Vector3; to: THREE.Vector3; start: number };
      lift?: { start: number; from: THREE.Vector3; carryScale: number; carryHeight: number; grabbed?: { position: THREE.Vector3; rotation: THREE.Quaternion; scale: number } };
    } | null = null;
    let characterBaseY = initialCharacterPosition.y;
    // Clicks and the bubble wait until the pop-in has landed.
    let characterReadyAt = 0;
    let entrance: { start: number; burst: ReturnType<typeof createPopBurst> } | null = null;
    let walk: { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number; route: { points: THREE.Vector3[]; distances: number[]; length: number }; run?: boolean; clickData?: { x: number; z: number }; farewell?: boolean; pickup?: boolean } | null = null;
    let settingDown: { start: number; from: THREE.Vector3; stand: THREE.Vector3; to: THREE.Vector3; scale: number; height: number; released?: { from: THREE.Vector3; scale: number; rotation: THREE.Quaternion } } | null = null;
    let homecoming: { points: THREE.Vector3[]; index: number; from: THREE.Vector3; start: number; facingFrom: number; stage: "facing" | "walking" | "greeting" | "opening" | "entering" | "closing"; threshold: THREE.Vector3; inside: THREE.Vector3; run: boolean } | null = null;
    let overview = false;
    let finishingHome = false;
    // Set once the student zooms out; until then the camera keeps the character close-up.
    let zoomedOut = false;
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
      removeItem();
      if (!character) return;
      characterGroup.remove(character.root);
      disposeObject(character.root);
      character = null;
    }

    // `pop` plays the entrance; a rebuilt scene (view switch) shows the character as is.
    function summonCharacter(pop: boolean) {
      const next = createChildCharacter();
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

    // Placement size, the same as the gift it becomes.
    function createItem() {
      const object = createAssetModel({ kind: "star", ...incomingAssetRef.current });
      object.scale.setScalar(giftScale * (object.userData.sizeScale ?? 1));
      object.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
      return object;
    }

    function removeItem() {
      if (!item) return;
      item.object.removeFromParent();
      disposeObject(item.object);
      item = null;
    }

    // Body radius plus the item's real half-width, which can exceed its footprint.
    function itemStandOff(object: THREE.Object3D) {
      const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
      return characterScale * 0.45 + Math.max(incomingRadius(), Math.max(size.x, size.z) / 2);
    }

    // Lands beside the character: a new item falls from the sky, a
    // cancelled placement puts it down from the head.
    function dropItem() {
      if (!character) return;
      const root = character.root;
      item ??= { object: createItem() };
      const from = item.object.parent ? item.object.getWorldPosition(new THREE.Vector3()) : null;
      scene.attach(item.object);
      item.object.scale.setScalar(giftScale * (item.object.userData.sizeScale ?? 1));
      // Beside the character across the view, never between it and the camera,
      // so even a big item can't hide it. Screen-left keeps the reason bubble
      // (left of the item) off the character; screen-right if left is blocked.
      camera.updateMatrixWorld(true);
      const screenLeft = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize().negate();
      const standOff = itemStandOff(item.object);
      let to = root.position.clone().addScaledVector(screenLeft, standOff);
      if (!validPoint(to.x, to.z)) {
        const right = root.position.clone().addScaledVector(screenLeft, -standOff);
        if (validPoint(right.x, right.z)) to = right;
      }
      const data = displayedCoordinates.fromDisplayedWorld(to);
      to.y = pieceLandscape.surfaceAt(data.x, data.z) - item.object.scale.x * 0.02;
      // A new item waits for the intro's close-up of the character.
      const start = intro ? intro.start + INTRO_MS + CHARACTER_ZOOM_IN_MS : performance.now();
      item.drop = { from: from ?? to.clone().setY(to.y + characterScale * CHARACTER_MODEL_HEIGHT * 2), to, start };
      item.lift = undefined;
      render();
    }

    // Local scale that fits the item between the raised hands, and its height there.
    function carryFit(object: THREE.Object3D) {
      const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).divideScalar(characterScale);
      const fit = Math.min(CARRY_WIDTH / Math.max(size.x, size.z, 1e-6), CARRY_HEIGHT / Math.max(size.y, 1e-6));
      return { scale: object.scale.x / characterScale * fit, height: size.y * fit };
    }

    // The character faces the item on the ground; 0 → 1 over the pick-up.
    const liftProgress = (now: number) => item?.lift ? (calm ? 1 : THREE.MathUtils.clamp((now - item.lift.start) / LIFT_MS, 0, 1)) : null;

    function startLift() {
      if (!character || !item) return;
      character.setPose("carrying");
      item.drop = undefined;
      item.object.visible = true;
      const fit = carryFit(item.object);
      item.lift = { start: performance.now(), from: item.object.position.clone(), carryScale: fit.scale, carryHeight: fit.height };
      // Choosing a spot waits until the item is on the head.
      characterReadyAt = item.lift.start + LIFT_MS;
      render();
    }

    function syncItem(phase = stateRef.current.phase) {
      if (phase === "placing") return;
      if (!character || phase === "farewell" || phase === "returning" || phase === "complete") { removeItem(); return; }
      if (phase === "ready") {
        // A cancelled pick-up frees the character and puts the item back down.
        if (!entrance) characterReadyAt = 0;
        if (!itemReadyRef.current) removeItem();
        else if (item?.object.parent !== scene || item.lift) dropItem();
        return;
      }
      if (item && (item.lift || item.object.parent === character.grip || walk?.pickup)) return;
      if (!item) {
        // A rebuilt scene mid-placement: already on the head.
        const object = createItem();
        object.scale.setScalar(carryFit(object).scale);
        object.position.copy(GRIP_OFFSET);
        character.grip.add(object);
        item = { object };
        return;
      }
      // Walk back to the item first if the character has wandered off.
      const root = character.root;
      const itemAt = item.drop?.to ?? item.object.position;
      const standOff = itemStandOff(item.object);
      const away = new THREE.Vector3(root.position.x - itemAt.x, 0, root.position.z - itemAt.z);
      if (away.length() <= standOff * 1.3) { startLift(); return; }
      const destination = itemAt.clone().addScaledVector(away.normalize(), standOff);
      const data = displayedCoordinates.fromDisplayedWorld(destination);
      destination.y = heightAt(data.x, data.z) + 0.02;
      character.setPose("walking");
      characterReadyAt = Infinity;
      walk = { ...straightWalk(destination), pickup: true };
      render();
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
    // The close-up zoom used everywhere the camera frames the character: the placement ring spans 80px.
    const characterZoom = () => THREE.MathUtils.clamp(80 * (camera.right - camera.left) / Math.max(canvas.clientWidth * markerDiameter, 0.001), homeFit.minZoom, homeFit.maxZoom);
    const characterCentre = () => {
      const feet = character?.root.position ?? initialCharacterPosition;
      return new THREE.Vector3(feet.x, feet.y + characterScale * CHARACTER_MODEL_HEIGHT / 2, feet.z);
    };
    // Orbit target that shows `point` at canvas centre from `offset` (camera minus target).
    // The frustum is shifted off-axis to clear the header and toolbar, and zoom does not
    // scale that shift, so the target is moved by it.
    const centredTarget = (point: THREE.Vector3, offset: THREE.Vector3) => {
      const probe = camera.clone();
      probe.position.copy(point).add(offset);
      probe.lookAt(point);
      probe.updateMatrixWorld(true);
      return point.clone()
        .addScaledVector(new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 0), -(camera.left + camera.right) / 2)
        .addScaledVector(new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 1), -(camera.top + camera.bottom) / 2);
    };
    // `exact` centres on the point itself instead of nudging it back toward the island.
    const focusTarget = (worldTarget: THREE.Vector3, duration = FOCUS_TWEEN_MS, onDone?: () => void, exact = false) => {
      if (classroom || !character) { onDone?.(); return; }
      const desiredZoom = characterZoom();
      const nextTarget = exact ? centredTarget(worldTarget, new THREE.Vector3().setFromSpherical(homeOffset)) : correctFocusTarget(worldTarget, desiredZoom);
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

    // Slides the camera (and orbit target) so `point` moves `strength` of the way to canvas centre.
    function centreOn(point: THREE.Vector3, strength: number) {
      camera.updateMatrixWorld(true);
      const ndc = point.clone().project(camera);
      const shift = new THREE.Vector3()
        .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), ndc.x * (camera.right - camera.left) / (2 * camera.zoom))
        .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), ndc.y * (camera.top - camera.bottom) / (2 * camera.zoom))
        .multiplyScalar(strength);
      camera.position.add(shift);
      controls.target.add(shift);
    }

    function finishCharacterShot() {
      if (!characterShot) return;
      characterShot = false;
      greetingStartAt = null;
      tween = null;
      camera.position.copy(shotEnd?.position ?? home);
      camera.zoom = shotEnd?.zoom ?? homeFit.homeZoom;
      controls.target.copy(shotEnd?.target ?? target);
      camera.updateProjectionMatrix();
      controls.enabled = true;
      controls.update();
      render();
    }

    function startCharacterShot(
      worldFocus = initialCharacterPosition.clone().add(new THREE.Vector3(0, characterScale * CHARACTER_MODEL_HEIGHT / 2, 0)),
      closeZoom = characterZoom(),
      stay = false,
    ) {
      if (calm) return;
      characterShot = true;
      controls.enabled = false;
      marker.visible = false;
      const zoom = THREE.MathUtils.clamp(closeZoom, controls.minZoom, controls.maxZoom);
      const focus = centredTarget(worldFocus, new THREE.Vector3().setFromSpherical(homeOffset));
      userZoom = null;
      shotEnd = stay ? { position: poseForTarget(focus, zoom).position, target: focus.clone(), zoom } : null;
      const transition = (nextTarget: THREE.Vector3, nextZoom: number, duration: number, onDone: () => void) => {
        const pose = poseForTarget(nextTarget, nextZoom);
        controls.enabled = false;
        tween = { from: camera.position.clone(), to: pose.position, fromTarget: controls.target.clone(), target: nextTarget.clone(), start: performance.now(), duration, zoom: camera.zoom, nextZoom, home: false, easeInOut: true, onDone };
        render();
      };
      transition(focus, zoom, CHARACTER_ZOOM_IN_MS, () => {
        greetingStartAt = stateRef.current.phase === "choosing" || stateRef.current.phase === "ready" ? performance.now() : null;
        transition(focus, zoom, CHARACTER_HOLD_MS, () => {
          greetingStartAt = null;
          if (stay) { characterShot = false; return; }
          transition(target, homeFit.homeZoom, CHARACTER_ZOOM_OUT_MS, () => {
            characterShot = false;
            controls.enabled = true;
          });
        });
      });
    }

    // Far destinations are run to, at twice the walking pace.
    function timedWalk(from: THREE.Vector3, points: THREE.Vector3[], distances: number[]) {
      const length = distances[distances.length - 1];
      const bodyHeight = characterScale * CHARACTER_MODEL_HEIGHT;
      const run = length > bodyHeight * RUN_FROM_BODY_HEIGHTS;
      return { from, to: points[points.length - 1], start: performance.now(),
        duration: Math.max(480, length / (bodyHeight * (run ? 3.6 : 1.8)) * 1000), route: { points, distances, length }, run };
    }

    function straightWalk(destination: THREE.Vector3) {
      const from = character!.root.position.clone();
      return timedWalk(from, [from, destination], [0, Math.hypot(destination.x - from.x, destination.z - from.z)]);
    }

    function createClickWalk(destination: THREE.Vector3) {
      if (!character) return null;
      const from = character.root.position.clone();
      const bodyRadius = characterScale * 0.45;
      const path = findWalkingPath(pieceLandscape, displayedCoordinates.fromDisplayedWorld(from),
        displayedCoordinates.fromDisplayedWorld(destination), bodyRadius,
        (point) => stateRef.current.gifts.every((gift) =>
          Math.hypot(point.x - gift.x, point.z - gift.z) >= giftRadius(gift) * 1.6 + bodyRadius));
      if (!path) {
        placementNoticeCallbackRef.current("그 자리까지 걸어갈 수 있는 길이 없어요. 다른 자리를 골라 주세요.");
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = window.setTimeout(() => placementNoticeCallbackRef.current(null), 2200);
        return null;
      }
      const points = path.map((point) => displayedCoordinates.toDisplayedWorld(point, pieceLandscape.walkHeightAt(point.x, point.z) + 0.02));
      const distances = [0];
      for (let i = 1; i < points.length; i++) {
        const distance = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
        const onStairs = Math.abs(points[i].y - points[i - 1].y) > 0.03;
        distances.push(distances[i - 1] + distance * (onStairs ? 1.3 : 1));
      }
      placementNoticeCallbackRef.current(null);
      return timedWalk(from, points, distances);
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
      if (classroom || nextPhase === "complete") {
        walk = null;
        if (characterShot) finishCharacterShot();
        removeCharacter();
        setPlacementControls(false);
        render();
        return;
      }

      const current = character ?? (character = summonCharacter(pop));
      if (nextPhase === "placing" && nextProposal) {
        if (settingDown) return;
        walk = null; movementKeys.clear();
        syncItem("confirming");
        if (!item) return;
        item.drop = undefined; item.lift = undefined;
        current.root.updateWorldMatrix(true, true);
        const to = displayedCoordinates.toDisplayedWorld(nextProposal, pieceLandscape.surfaceAt(nextProposal.x, nextProposal.z));
        const scale = giftScale * (item.object.userData.sizeScale ?? 1);
        to.y -= scale * 0.02;
        const fit = carryFit(item.object);
        settingDown = { start: performance.now(), from: current.root.position.clone(), stand: farewellDestination(nextProposal) ?? current.root.position.clone(), to, scale, height: fit.height };
        current.setPose("carrying");
        render();
        return;
      }
      if (nextPhase === "returning") {
        if (homecoming) return;
        homeGreetingRef.current("none");
        walk = null; movementKeys.clear();
        if (characterShot) finishCharacterShot();
        tween = null;
        const home = island.props.getObjectByName("homecoming-house");
        if (!home) { homeCallbacksRef.current.onHomeBlocked(); return; }
        const radius = characterScale * 0.45;
        home.updateWorldMatrix(true, true);
        const localDoor = home.userData.doorway as THREE.Vector3;
        const threshold = home.localToWorld(localDoor.clone().add(new THREE.Vector3(0, 0, 0.4)));
        const inside = home.localToWorld(localDoor.clone().add(new THREE.Vector3(0, 0, -0.65)));
        // With decorations ignored, head directly to the doorstep, without a yard detour.
        const route = findWalkingPath({ ...pieceLandscape, canWalk: pieceLandscape.canWalkHome }, displayedCoordinates.fromDisplayedWorld(current.root.position), displayedCoordinates.fromDisplayedWorld(threshold), radius);
        if (!route) {
          // No walkable way home: pop straight onto the doorstep and carry on from there.
          current.root.position.copy(threshold);
          characterBaseY = threshold.y;
          placementNoticeCallbackRef.current("길이 막혀서 순간 이동 했어!");
        }
        const points = route ? route.slice(1).map((p) => displayedCoordinates.toDisplayedWorld(p, pieceLandscape.walkHeightAt(p.x, p.z) + 0.02)) : [threshold.clone()];
        points[points.length - 1].copy(threshold);
        let length = 0;
        points.reduce((a, b) => { length += Math.hypot(b.x - a.x, b.z - a.z); return b; }, current.root.position);
        const run = length > characterScale * CHARACTER_MODEL_HEIGHT * RUN_FROM_BODY_HEIGHTS;
        homecoming = { points, index: 0, from: current.root.position.clone(), start: performance.now(), facingFrom: current.root.rotation.y, stage: "facing", threshold, inside, run };
        current.setPose("walking");
        removeItem();
        render();
        return;
      }
      homecoming = null;
      current.setPose(nextPhase === "farewell" || nextPhase === "ready" ? "walking" : "carrying");
      const farewellTarget = nextPhase === "farewell" && nextProposal ? farewellDestination(nextProposal) : null;
      if ((nextPhase === "moving" && nextProposal) || farewellTarget) {
        const destination = farewellTarget ?? characterDestination(nextProposal!);
        const distance = current.root.position.distanceTo(destination);
        // The walk's follow camera takes over from any focus tween still running.
        if (!characterShot) { tween = null; controls.enabled = true; }
        if (nextPhase === "moving") {
          const nextWalk = createClickWalk(destination);
          if (!nextWalk) { walk = null; stateRef.current.onChooseAgain(); return; }
          walk = { ...nextWalk, clickData: nextProposal ?? undefined };
        } else {
          walk = { ...straightWalk(destination), farewell: true };
        }
        console.log("[island placement] walk started", JSON.stringify({
          from: current.root.position.clone(),
          to: destination,
          distance,
        }));
      } else {
        walk = null;
        current.root.position.y = characterBaseY;
      }
      // After the walk above, so a pick-up walk isn't cleared.
      syncItem(nextPhase);
      if (nextPhase === "farewell" && !walk) beginFarewellWave();
      render();
    }

    // The item bubble follows the scene, to the left of the item while it rests
    // on the ground; it holds the place button, so it stays inside the view.
    function updateBubble() {
      const bubble = reasonBubbleRef.current;
      if (!bubble) return;
      const onGround = !!item && !classroom && item.object.parent === scene && item.object.visible
        && !item.drop && !item.lift && stateRef.current.phase === "ready";
      // While confirming, the same bubble asks beside the character holding the item.
      const anchor = onGround ? item!.object : !classroom && stateRef.current.phase === "confirming" ? character?.root : undefined;
      bubble.style.display = anchor ? "" : "none";
      if (!anchor) return;
      const rect = projectedBoxRect(new THREE.Box3().setFromObject(anchor), camera, canvas.clientWidth, canvas.clientHeight);
      const halfHeight = bubble.offsetHeight / 2;
      bubble.style.left = `${THREE.MathUtils.clamp(rect.left - 10, bubble.offsetWidth + 8, canvas.clientWidth - 8)}px`;
      bubble.style.top = `${THREE.MathUtils.clamp((rect.top + rect.bottom) / 2, halfHeight + 8, canvas.clientHeight - halfHeight - 8)}px`;
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
          if (character && !classroom) startCharacterShot(undefined, undefined, true);
        }
        else keepAnimating = true;
      }

      if (tween) {
        const progress = Math.min((now - tween.start) / tween.duration, 1);
        const eased = finishingHome ? THREE.MathUtils.smootherstep(progress, 0, 1) : tween.easeInOut ? easeInOutCubic(progress) : 1 - (1 - progress) ** 3;
        let pan = eased;
        let pose;
        if (finishingHome) {
          // Pan in step with the zoom so the view contracts about the one screen point both
          // framings share, instead of drifting to centre first and then sliding left.
          const zoom = tween.zoom * Math.pow(tween.nextZoom / tween.zoom, eased);
          if (tween.zoom !== tween.nextZoom) pan = (tween.zoom / zoom - 1) / (tween.zoom / tween.nextZoom - 1);
          pose = { position: tween.from.clone().lerp(tween.to, pan), zoom };
        } else pose = tween.easeInOut
          ? { position: tween.from.clone().lerp(tween.to, eased), zoom: THREE.MathUtils.lerp(tween.zoom, tween.nextZoom, eased) }
          : tweenCameraPose(tween.from, tween.to, tween.zoom, tween.nextZoom, progress);
        camera.position.copy(pose.position);
        camera.zoom = pose.zoom;
        controls.target.copy(tween.fromTarget).lerp(tween.target, pan);
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
        character.setLift(settingDown ? 1 - Math.min((now - settingDown.start) / (calm ? 350 : PUT_DOWN_MS), 1) : liftProgress(now));
        character.setDoorReach(0);
        character.setRunning(!calm && !!(activeWalk?.run || (homecoming?.stage === "walking" && homecoming.run)));
        if (entrance) {
          const elapsed = now - entrance.start;
          root.scale.setScalar(characterScale * easeOutBack(Math.min(elapsed / POP_MS, 1)));
          entrance.burst.update(Math.min(elapsed / BURST_MS, 1));
          if (elapsed >= BURST_MS) endEntrance();
          keepAnimating = true;
        }

        if (movementKeys.size) keepAnimating = true;
        const keyboardMoving = buttonWalking ? buttonMoved : advanceHeldWalk(deltaSeconds);
        buttonMoved = false;

        if (keyboardMoving) {
          // Follow the grounded body so walking hops do not shake the camera.
          centreOn(new THREE.Vector3(root.position.x, characterBaseY + characterScale * CHARACTER_MODEL_HEIGHT / 2, root.position.z),
            calm ? 1 : 1 - Math.exp(-12 * deltaSeconds));
          keyboardStride += deltaSeconds * 12;
          const stride = Math.sin(keyboardStride);
          root.position.y = characterBaseY + (calm ? 0 : Math.abs(stride) * characterScale * 0.08);
          character.animate(seconds, calm ? 0 : stride);
        } else if (settingDown && item) {
          const motion = settingDown;
          const progress = Math.min((now - motion.start) / (calm ? 350 : PUT_DOWN_MS), 1);
          const reverse = 1 - progress;
          const retreat = easeInOutCubic(Math.min(progress / 0.45, 1));
          root.position.lerpVectors(motion.from, motion.stand, retreat);
          const ground = displayedCoordinates.fromDisplayedWorld(root.position);
          characterBaseY = pieceLandscape.walkHeightAt(ground.x, ground.z) + 0.02;
          root.position.y = characterBaseY;
          // Ease the view along the side step, so the walk home starts already centred.
          centreOn(new THREE.Vector3(root.position.x, characterBaseY + characterScale * CHARACTER_MODEL_HEIGHT / 2, root.position.z),
            calm ? 1 : 1 - Math.exp(-6 * deltaSeconds));
          root.rotation.y = Math.atan2(motion.to.x - motion.stand.x, motion.to.z - motion.stand.z);
          character.animate(seconds, 0);
          const object = item.object;
          if (reverse > LIFT_GRAB) {
            object.position.set(0, THREE.MathUtils.lerp(-motion.height / 2, GRIP_OFFSET.y, liftRise(reverse)), 0);
          } else {
            if (!motion.released) {
              root.updateWorldMatrix(true, true);
              scene.attach(object);
              motion.released = { from: object.position.clone(), scale: object.scale.x, rotation: object.quaternion.clone() };
            }
            const settled = easeInOutCubic((LIFT_GRAB - reverse) / LIFT_GRAB);
            object.position.lerpVectors(motion.released.from, motion.to, settled);
            object.scale.setScalar(THREE.MathUtils.lerp(motion.released.scale, motion.scale, settled));
            const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(camera.position.x - motion.to.x, camera.position.z - motion.to.z));
            object.quaternion.slerpQuaternions(motion.released.rotation, facing, settled);
          }
          if (progress === 1) {
            settingDown = null;
            character.setLift(null);
            character.setPose("walking");
            itemPlacedRef.current();
          }
          keepAnimating = true;
        } else if (homecoming) {
          const trip = homecoming;
          const door = island.props.getObjectByName("homecoming-door");
          const elapsed = now - trip.start;
          if (trip.stage === "facing") {
            const progress = Math.min(elapsed / (calm ? 350 : 1000), 1);
            root.position.copy(trip.from);
            const facing = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
            const turn = Math.atan2(Math.sin(facing - trip.facingFrom), Math.cos(facing - trip.facingFrom));
            root.rotation.y = trip.facingFrom + turn * easeInOutCubic(Math.min(progress / 0.4, 1));
            character.animate(seconds, 0);
            if (progress === 1) { trip.stage = "walking"; trip.start = now; }
          } else if (trip.stage === "walking") {
            const to = trip.points[trip.index];
            const duration = Math.max(70, trip.from.distanceTo(to) / (characterScale * CHARACTER_MODEL_HEIGHT * (trip.run ? 3.6 : 1.8)) * 1000);
            const progress = Math.min(elapsed / duration, 1);
            root.position.lerpVectors(trip.from, to, progress);
            const p = displayedCoordinates.fromDisplayedWorld(root.position);
            // The final porch segment climbs the small doorstep.
            root.position.y = trip.index === trip.points.length - 1 ? THREE.MathUtils.lerp(trip.from.y, to.y, progress) : pieceLandscape.walkHeightAt(p.x, p.z) + 0.02;
            characterBaseY = root.position.y;
            root.rotation.y = Math.atan2(to.x - trip.from.x, to.z - trip.from.z);
            const stride = calm ? 0 : Math.sin(now * (trip.run ? 0.018 : 0.012));
            root.position.y += Math.abs(stride) * characterScale * (trip.run ? 0.14 : 0.06);
            character.animate(seconds, stride);
            if (progress === 1) {
              root.position.copy(to); trip.from.copy(to); trip.start = now;
              if (++trip.index === trip.points.length) { trip.stage = "greeting"; homeGreetingRef.current("greeting"); }
            }
          } else if (trip.stage === "greeting") {
            const progress = Math.min(elapsed / (calm ? 700 : 1800), 1);
            root.position.copy(trip.threshold);
            root.rotation.y = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
            // A single greeting finishes with the arm down, before opening the door.
            character.animate(seconds, 0, calm ? undefined : progress);
            if (progress === 1) { trip.stage = "opening"; trip.start = now; }
          } else if (trip.stage === "opening") {
            const progress = Math.min(elapsed / (calm ? 120 : 500), 1);
            root.position.copy(trip.threshold);
            root.rotation.y = Math.atan2(trip.inside.x - root.position.x, trip.inside.z - root.position.z);
            character.setDoorReach(Math.min(progress / 0.3, (1 - progress) / 0.25, 1));
            character.animate(seconds, 0);
            if (door) door.rotation.y = -Math.PI * 0.55 * easeInOutCubic(progress);
            if (progress === 1) { trip.stage = "entering"; trip.start = now; }
          } else if (trip.stage === "entering") {
            const progress = Math.min(elapsed / (calm ? 200 : 850), 1);
            root.position.lerpVectors(trip.threshold, trip.inside, progress);
            character.animate(seconds, calm ? 0 : Math.sin(now * 0.012));
            if (progress === 1) { root.visible = false; trip.stage = "closing"; trip.start = now; }
          } else {
            const progress = Math.min(elapsed / (calm ? 120 : 500), 1);
            if (door) door.rotation.y = -Math.PI * 0.55 * (1 - easeInOutCubic(progress));
            if (progress === 1) {
              homecoming = null;
              removeCharacter();
              homeGreetingRef.current("closed");
              // Reveal the whole island once the door has closed.
              intro = null;
              userZoom = null;
              finishingHome = true;
              controls.enabled = false;
              const finalZoom = homeFit.homeZoom * FINAL_ZOOM_RATIO;
              controls.minZoom = Math.min(homeFit.minZoom, finalZoom);
              const probe = camera.clone();
              probe.position.copy(home);
              probe.lookAt(target);
              probe.zoom = finalZoom;
              probe.updateProjectionMatrix();
              const rect = projectedBoxRect(islandBox, probe, canvas.clientWidth, canvas.clientHeight);
              // Keep the island's edges inset from the lower-left corner.
              const offset = new THREE.Vector3()
                .addScaledVector(new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 0), (rect.left - canvas.clientWidth * 0.07) * (camera.right - camera.left) / (finalZoom * canvas.clientWidth))
                .addScaledVector(new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 1), (canvas.clientHeight * 0.95 - rect.bottom) * (camera.top - camera.bottom) / (finalZoom * canvas.clientHeight));
              tween = { from: camera.position.clone(), to: home.clone().add(offset), fromTarget: controls.target.clone(), target: target.clone().add(offset), start: now, duration: calm ? 150 : 2400, zoom: camera.zoom, nextZoom: finalZoom, home: false, easeInOut: true, onDone: () => { finishingHome = false; homeCallbacksRef.current.onHomeEntered(); } };
            }
          }
          if (homecoming) {
            camera.zoom = THREE.MathUtils.lerp(camera.zoom, characterZoom(), 1 - Math.exp(-deltaSeconds * 4));
            camera.updateProjectionMatrix();
            // Eased rather than snapped: the view may still be off-centre from the placement.
            centreOn(new THREE.Vector3(root.position.x, root.position.y + characterScale * CHARACTER_MODEL_HEIGHT / 2, root.position.z),
              calm ? 1 : 1 - Math.exp(-6 * deltaSeconds));
            keepAnimating = true;
          }
        } else if (activeWalk) {
          const progress = Math.min((now - activeWalk.start) / activeWalk.duration, 1);
          // One hop per step, at a steady cadence.
          const stride = Math.sin((now - activeWalk.start) / 1000 * (activeWalk.run ? 18 : 12));
          const route = activeWalk.route;
          const distance = route.length * progress;
          let segment = 1;
          while (segment < route.points.length - 1 && route.distances[segment] < distance) segment++;
          const facingFrom = route.points[segment - 1];
          const facingTo = route.points[segment];
          const segmentLength = route.distances[segment] - route.distances[segment - 1];
          const fraction = segmentLength > 0 ? (distance - route.distances[segment - 1]) / segmentLength : 1;
          root.position.lerpVectors(facingFrom, facingTo, THREE.MathUtils.clamp(fraction, 0, 1));
          const walkPoint = displayedCoordinates.fromDisplayedWorld(root.position);
          const groundY = pieceLandscape.walkHeightAt(walkPoint.x, walkPoint.z) + 0.02;
          root.position.y = groundY + (calm ? 0 : Math.abs(stride) * characterScale * (activeWalk.run ? 0.14 : 0.08));
          // The camera walks along, easing in at the start, so the character stays centred.
          // Its mid-body is the anchor; the hop is left out so the view doesn't bob.
          if (!tween) centreOn(new THREE.Vector3(root.position.x, groundY + characterScale * CHARACTER_MODEL_HEIGHT / 2, root.position.z), Math.min((now - activeWalk.start) / FOLLOW_TWEEN_MS, 1));
          root.rotation.set(0, Math.atan2(facingTo.x - facingFrom.x, facingTo.z - facingFrom.z), 0);
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
            else if (activeWalk.pickup) startLift();
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

      if (item) {
        const object = item.object;
        if (object.parent === scene && !settingDown) object.rotation.set(0, Math.atan2(camera.position.x - object.position.x, camera.position.z - object.position.z), 0);
        if (item.drop) {
          const { from, to, start } = item.drop;
          const progress = calm ? 1 : THREE.MathUtils.clamp((now - start) / DROP_MS, 0, 1);
          object.visible = calm || now >= start;
          object.position.lerpVectors(from, to, progress);
          object.position.y = THREE.MathUtils.lerp(from.y, to.y, easeOutBounce(progress));
          if (progress === 1) item.drop = undefined;
          else keepAnimating = true;
        }
        const progress = liftProgress(now);
        if (item.lift && progress !== null && character) {
          const lift = item.lift;
          const root = character.root;
          // Face the item while grabbing it, then turn back to the viewer while raising it.
          const toItem = Math.atan2(lift.from.x - root.position.x, lift.from.z - root.position.z);
          const toViewer = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
          const turn = THREE.MathUtils.clamp((progress - 0.5) / 0.5, 0, 1);
          root.rotation.y = toItem + Math.atan2(Math.sin(toViewer - toItem), Math.cos(toViewer - toItem)) * turn;
          if (progress >= LIFT_GRAB && !lift.grabbed) {
            character.grip.attach(object);
            lift.grabbed = { position: object.position.clone(), rotation: object.quaternion.clone(), scale: object.scale.x };
          }
          if (lift.grabbed) {
            // Into the hands, shrinking to fit between them; the hands then carry
            // it up, sliding from its middle to its base as it reaches the crown.
            const t = easeInOutCubic(Math.min((progress - LIFT_GRAB) / GRAB_SETTLE, 1));
            const held = new THREE.Vector3(0, THREE.MathUtils.lerp(-lift.carryHeight / 2, GRIP_OFFSET.y, liftRise(progress)), 0);
            object.position.lerpVectors(lift.grabbed.position, held, t);
            object.quaternion.slerpQuaternions(lift.grabbed.rotation, UPRIGHT, t);
            object.scale.setScalar(THREE.MathUtils.lerp(lift.grabbed.scale, lift.carryScale, t));
          }
          if (progress === 1) item.lift = undefined;
          else keepAnimating = true;
        }
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
      renderer.render(scene, camera);
      if (changing || tween || keepAnimating) render();
    }

    function moveCamera(preset: CameraPreset) {
      if (finishingHome) return;
      if (characterShot) { finishCharacterShot(); return; }
      intro = null;
      userZoom = null;
      if (preset === "out") zoomedOut = true;
      if (preset === "character") {
        zoomedOut = false;
        focusTarget(characterCentre(), FOCUS_TWEEN_MS, undefined, true);
        return;
      }
      controls.enabled = false;
      // Until the student zooms out, every view stays centred on the character at its close-up zoom.
      if (!zoomedOut && !overview && character && !classroom && preset !== "in") {
        const offset = preset === "top" ? new THREE.Vector3().setFromSphericalCoords(viewDistance, controls.minPolarAngle, 0)
          : preset === "left" || preset === "right" ? camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), preset === "left" ? -Math.PI / 6 : Math.PI / 6)
          : new THREE.Vector3().setFromSpherical(homeOffset);
        const nextTarget = centredTarget(characterCentre(), offset);
        tween = { from: camera.position.clone(), to: nextTarget.clone().add(offset), fromTarget: controls.target.clone(), target: nextTarget, start: performance.now(), duration: HOME_TWEEN_MS, zoom: camera.zoom, nextZoom: characterZoom(), home: false };
        render();
        return;
      }
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
      // Before placement starts, a tap on the island just walks the character there.
      if (current.phase === "ready" && character && !classroom && !intro) {
        const point = intersect(event)?.point;
        const resolved = point && resolvePlacement(displayedCoordinates.fromDisplayedWorld(point));
        if (!resolved) return;
        const destination = displayedCoordinates.toDisplayedWorld(resolved, heightAt(resolved.x, resolved.z) + 0.02);
        tween = null;
        controls.enabled = true;
        const nextWalk = createClickWalk(destination);
        if (!nextWalk) return;
        walk = nextWalk;
        render();
        return;
      }
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
        placementNoticeCallbackRef.current(null);
        current.onPropose(current.selected, resolved.x, resolved.z);
        marker.position.copy(displayedCoordinates.toDisplayedWorld(resolved, heightAt(resolved.x, resolved.z) + 0.05));
        marker.scale.setScalar(assetSizeScale(incomingAssetRef.current ?? {}));
        marker.visible = true;
        render();
      } else if (data) {
        placementNoticeCallbackRef.current("조각 안쪽의 빈 윗면을 눌러 주세요.");
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = window.setTimeout(() => placementNoticeCallbackRef.current(null), 2200);
      }
    };

    const onLeave = () => { hoverPointer = null; marker.visible = false; render(); };
    const onCancel = (event: PointerEvent) => { activePointers.delete(event.pointerId); pointerDown = null; onLeave(); };
    function advanceHeldWalk(deltaSeconds: number) {
      if (!movementKeys.size || !canMoveWithKeyboard() || !character) return false;
      const root = character.root;
      let moved = false;
      const horizontal = Number(movementKeys.has("ArrowRight")) - Number(movementKeys.has("ArrowLeft"));
      const vertical = Number(movementKeys.has("ArrowUp")) - Number(movementKeys.has("ArrowDown"));
      camera.updateMatrixWorld(true);
      keyboardRight.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      keyboardForward.crossVectors(new THREE.Vector3(0, 1, 0), keyboardRight).normalize();
      keyboardDirection.copy(keyboardRight).multiplyScalar(horizontal).addScaledVector(keyboardForward, vertical);
      if (keyboardDirection.lengthSq() > 0) {
        keyboardDirection.normalize();
        const bodyRadius = characterScale * 0.45;
        const distance = characterScale * CHARACTER_MODEL_HEIGHT * 1.8 * deltaSeconds;
        // Small steps prevent crossing a narrow obstacle between frames.
        const steps = Math.max(1, Math.ceil(distance / Math.max(bodyRadius * 0.5, 0.01)));
        for (let step = 0; step < steps; step++) {
          const positionData = displayedCoordinates.fromDisplayedWorld(root.position);
          const directionData = displayedCoordinates.fromDisplayedWorld(keyboardDirection);
          const stairDirection = pieceLandscape.walkDirectionAt(positionData.x, positionData.z, directionData, bodyRadius);
          keyboardDirection.copy(displayedCoordinates.toDisplayedWorld(stairDirection)).normalize();
          keyboardDestination.copy(root.position).addScaledVector(keyboardDirection, distance / steps);
          const data = displayedCoordinates.fromDisplayedWorld(keyboardDestination);
          if (!pieceLandscape.canWalk(data.x, data.z, bodyRadius)
            || stateRef.current.gifts.some((gift) => Math.hypot(data.x - gift.x, data.z - gift.z) < giftRadius(gift) * 1.6 + bodyRadius)) break;
          characterBaseY = pieceLandscape.walkHeightAt(data.x, data.z) + 0.02;
          keyboardDestination.y = characterBaseY;
          root.position.copy(keyboardDestination);
          moved = true;
        }
        root.rotation.set(0, Math.atan2(keyboardDirection.x, keyboardDirection.z), 0);
      }
      return moved;
    }

    const startWalking = (key: string) => {
      if (!arrowKeys.has(key) || movementKeys.has(key) || !visible || document.hidden) return;
      movementKeys.add(key);
      // Walking cuts the landing close-up short instead of being ignored until it ends.
      const phase = stateRef.current.phase;
      if (characterShot && (phase === "ready" || phase === "choosing")) finishCharacterShot();
      if (canMoveWithKeyboard()) {
        // Arrow input takes over a clicked destination. Clear the old proposal
        // so confirmation cannot place the item at a position we have left.
        const current = stateRef.current;
        if (current.phase === "moving" || current.phase === "confirming") current.onChooseAgain();
        if (character) {
          const data = displayedCoordinates.fromDisplayedWorld(character.root.position);
          characterBaseY = pieceLandscape.walkHeightAt(data.x, data.z) + 0.02;
        }
        if (current.selected) placementInteractionRef.current();
        tween = null;
        userZoom = null;
        controls.enabled = true;
        walk = null;
        // A short press may end before the next animation frame. Apply its
        // first step on pointer/key down, then let the frame loop keep walking.
        const now = performance.now();
        if (advanceHeldWalk(1 / 60) && character) {
          lastFrameAt = now;
          character.root.updateMatrixWorld(true);
          renderer.render(scene, camera);
        }
      }
      render();
    };

    const onKey = (event: KeyboardEvent) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (element?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
        || event.altKey || event.ctrlKey || event.metaKey || !visible || document.hidden) return;
      if (arrowKeys.has(event.key)) {
        event.preventDefault();
        startWalking(event.key);
        return;
      }
      if (event.target !== canvas) return;
      const map: Record<string, CameraPreset> = {
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

    const stopWalking = (key: string) => {
      const wasMoving = movementKeys.delete(key);
      if (wasMoving) render();
      const current = stateRef.current;
      if (!wasMoving || movementKeys.size || !character || !current.selected || current.phase !== "choosing") return;
      const resolved = resolvePlacement(displayedCoordinates.fromDisplayedWorld(character.root.position));
      if (resolved) {
        placementNoticeCallbackRef.current(null);
        // Releasing a direction confirms this spot without starting a click walk.
        current.onPropose(current.selected, resolved.x, resolved.z, true);
      } else {
        current.onChooseAgain();
        placementNoticeCallbackRef.current("조각 안쪽의 빈 윗면을 눌러 주세요.");
      }
    };
    const onKeyUp = (event: KeyboardEvent) => stopWalking(event.key);
    const clearMovementKeys = () => { movementKeys.clear(); };
    const onVisibilityChange = () => { clearMovementKeys(); render(); };

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      homeFit = fitIslandCamera(islandBox, width, height, mode);
      camera.left = homeFit.camera.left;
      camera.right = homeFit.camera.right;
      camera.top = homeFit.camera.top;
      camera.bottom = homeFit.camera.bottom;
      controls.minZoom = finishingHome || stateRef.current.phase === "complete" ? Math.min(homeFit.minZoom, homeFit.homeZoom * FINAL_ZOOM_RATIO) : homeFit.minZoom;
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
      if (zoom < (userZoom?.zoom ?? camera.zoom)) zoomedOut = true;
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
      if (finishingHome) return;
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
      if (touchPoints.size !== 2 || intro || characterShot || finishingHome) return;
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
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearMovementKeys);
    canvas.addEventListener("webglcontextlost", onContextLost);
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Poly Pizza models replace the procedural stand-ins once decoded. The
    // loading card waits briefly for them so the swap is rarely visible.
    const assetsReady = loadIslandPropLibrary().then((library) => {
      if (disposed || !library.size) return;
      island.props = replaceLandscapeProps(island.group, island.props, island.layout, island.pieceIndices, library);
      render();
    }).catch((error) => console.warn("[island assets] failed to load", error));

    runtimeRef.current = {
      camera: moveCamera,
      walk: (key, pressed, seconds) => {
        if (!pressed) {
          buttonWalking = false;
          buttonMoved = false;
          stopWalking(key);
          return;
        }
        buttonWalking = true;
        startWalking(key);
        if (seconds !== undefined && advanceHeldWalk(seconds)) {
          buttonMoved = true;
          // Held-button movement is advanced by its own timer. Paint each tick
          // immediately; the scene frame loop supplies gait and camera motion.
          character?.root.updateMatrixWorld(true);
          renderer.render(scene, camera);
        }
        render();
      },
      gifts: giftGroup,
      giftScale,
      toDisplayedWorld: displayedCoordinates.toDisplayedWorld.bind(displayedCoordinates),
      heightAt,
      surfaceAt: pieceLandscape.surfaceAt,
      render,
      setCharacterState,
      syncItem: () => syncItem(),
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
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearMovementKeys);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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

  const bubbleContent = mode === "island" && phase === "confirming" ? <>
    <p className="text-[14px] font-bold tracking-[-0.35px] break-keep">여기로 정할까?</p>
    <p className="mt-0.5 break-keep">정하면 수정 못 해!</p>
    <button onClick={onConfirm} className="mt-2 h-[30px] w-full rounded-full bg-[#5a52f0] px-2.5 text-[12px] font-semibold text-white">확정하기</button>
  </> : itemBubble;

  // A bubble mounted while the scene is idle still needs a frame to be placed.
  const hasItemBubble = !!bubbleContent;
  useEffect(() => { if (hasItemBubble) runtimeRef.current?.render(); }, [hasItemBubble, phase]);

  useEffect(() => {
    itemReadyRef.current = itemReady;
    runtimeRef.current?.syncItem();
  }, [itemReady]);

  // Only choices that need a tap live here; progress messages are in IslandExperience's top notice.
  const bubbleVisible = mode === "island" && phase === "farewell";

  return <div
    ref={hostRef}
    className="absolute inset-0 bg-[linear-gradient(180deg,#9fd3ea_0%,#c9e8f0_52%,#e4f3ec_100%)] [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:touch-none [&_canvas]:outline-offset-[-4px]"
    style={{ cursor: selected && (phase === "choosing" || phase === "confirming") ? "crosshair" : "grab" }}
  >
    {bubbleVisible && <div
      key={phase}
    className="island-guidance-card"
      role="status"
      aria-live="polite"
    >
      {phase === "farewell" && <>
        <div className="min-w-0 flex-1"><p className="text-[15px] font-bold text-[#5a52f0]">집으로 가는 길을 찾지 못했어</p><p className="text-[12px] text-[#7d849b]">다시 한 번 시도해 줘.</p></div>
        <button onClick={onRetryHome} className="h-[30px] shrink-0 rounded-full bg-[#5a52f0] px-2.5 text-[12px] font-semibold text-white">다시 집으로 가기</button>
      </>}
    </div>}

    {bubbleContent && <div
      ref={reasonBubbleRef}
      className="island-bubble absolute z-20 w-max max-w-[220px] -translate-x-full -translate-y-1/2 rounded-2xl border border-white/70 bg-white/55 px-3 py-2 text-[12px] leading-snug text-[#3c445e] shadow-[0_8px_24px_rgba(60,68,110,0.18)] backdrop-blur-md"
      data-tail="left"
      style={{ display: "none" }}
      role="status"
    >
      {bubbleContent}
      <span className="island-bubble-tail absolute h-3 w-3 rotate-45 border-white/70 bg-white/55" />
    </div>}

    {!ready && !error && <div className="absolute inset-0 z-40 grid place-items-center bg-[#dceee5] text-sm text-[#547766]" role="status">섬을 준비하고 있어요…</div>}
    {error && <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#e7f0e7] p-8 text-center">
      <p className="font-semibold">3D 섬을 불러오지 못했어요.</p>
      <p className="text-sm">브라우저의 그래픽 가속을 켜고 다시 열어 주세요.</p>
      <button className="rounded-full bg-[#5a52f0] px-5 py-2 text-sm text-white" onClick={() => window.location.reload()}>다시 불러오기</button>
    </div>}
  </div>;
}
