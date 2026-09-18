"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { disposeExtrudedItem, STAR_SPEC } from "@/lib/items/extrudedItem";

import { createLabItem, parseLabItem, HOUSE_SPEC, type LabItemSpec } from "@/lib/items/assembledItem";

import { ASSEMBLY_EXAMPLE_IDS, ITEM_CATALOG, ITEM_CATALOG_SPECS } from "@/lib/items/itemCatalog";
import InferenceLab from "./InferenceLab";

const samples: LabItemSpec[] = [STAR_SPEC, HOUSE_SPEC, ...ITEM_CATALOG_SPECS];

export default function ItemLab() {
  const host = useRef<HTMLDivElement>(null);
  const [spec, setSpec] = useState<LabItemSpec>(ITEM_CATALOG_SPECS[0]);
  const [draft, setDraft] = useState(JSON.stringify(ITEM_CATALOG_SPECS[0], null, 2));
  const [error, setError] = useState("");
  const [small, setSmall] = useState(false);
  const resetCamera = useRef<(() => void) | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch {
      const message = document.createElement("p");
      message.textContent = "3D 화면을 시작하지 못했어요. 브라우저의 그래픽 가속 설정을 확인해 주세요.";
      message.setAttribute("role", "alert");
      element.appendChild(message);
      return () => message.remove();
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#EDF2EB");
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.9;
    controls.maxDistance = 12;
    const reset = () => {
      camera.position.set(1.25, 0.95, 2.5);
      controls.target.set(0, 0.48, 0);
      controls.update();
    };
    reset();
    resetCamera.current = reset;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x74866a, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(-3, 5, 4);
    scene.add(key);
    const model = createLabItem(spec);
    scene.add(model);
    const grid = new THREE.GridHelper(3, 12, 0xc2cdbb, 0xd9e0d5);
    grid.position.y = -0.015;
    scene.add(grid);
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => {
      resetCamera.current = null;
      resize.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      disposeExtrudedItem(model);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [spec]);

  return <main className="min-h-screen bg-[#f7f7f0] p-5 text-[#344332] md:p-10">
    <div className="mx-auto max-w-6xl">
      <p className="text-sm text-[#71816a]">살핌 · 아이템 테스트</p>
      <h1 className="mt-2 text-3xl font-bold">입체 조립 테스트: {spec.name}</h1>
      <p className="mt-3 text-sm">드래그해서 옆과 뒤를 보고, 휠이나 두 손가락으로 확대해 보세요.</p>
      <a href="/item-lab/village" className="mt-3 inline-block text-sm underline">실제 마을에서 집·별 크기 비교하기 →</a>
      {process.env.NODE_ENV !== "production" && <InferenceLab onSpec={next => { setSpec(next); setDraft(JSON.stringify(next, null, 2)); setError(""); }} />}
      <div className="mt-4 rounded-2xl border border-[#dce3d6] bg-white p-4">
        <p className="mb-3 text-sm font-semibold">카탈로그 · {ITEM_CATALOG.length}개</p>
        {[...new Set(ITEM_CATALOG.map(item => item.category))].map(category => <div key={category} className="mt-2 flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 text-xs text-[#71816a]">{category}</span>
          {ITEM_CATALOG.filter(item => item.category === category).map(item => <button key={item.id} aria-pressed={spec.name === item.spec.name} className={`rounded-xl border px-3 py-2 text-sm ${spec.name === item.spec.name ? "border-[#47694b] bg-[#edf5eb]" : ""}`} onClick={() => { setSpec(item.spec); setDraft(JSON.stringify(item.spec, null, 2)); setError(""); }}>{item.displayName}{ASSEMBLY_EXAMPLE_IDS.includes(item.id) && " · 조립 예시"}</button>)}
        </div>)}
      </div>
      <div className="mt-4 rounded-2xl bg-white p-4 text-sm">{(() => { const match = ITEM_CATALOG.find(item => item.spec.name === spec.name)?.match; return match ? <><p>이름으로 매칭: {match.names.join(", ")}</p><p className="mt-1">정확히 같을 때만: {match.concepts.join(", ") || "없음"}</p></> : <p>기존 샘플</p>; })()}<p className="mt-2 text-xs text-[#71816a]">카탈로그 설계서는 직접 검수·수정하는 기본 asset이에요. 실제 AI 생성 결과가 아니에요.</p></div>
      <div className="mt-6 grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <section>
          <div className="flex h-[480px] items-center justify-center overflow-hidden rounded-3xl border border-[#dce3d6] bg-[#EDF2EB]">
            <div ref={host} className={small ? "h-[120px] w-[120px]" : "h-full w-full"} aria-label={`회전하고 확대할 수 있는 3D ${spec.name}`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-xl border px-4 py-2 text-sm" onClick={() => resetCamera.current?.()}>시점 초기화</button>
            <button className="rounded-xl border px-4 py-2 text-sm" aria-pressed={small} onClick={() => setSmall(!small)}>{small ? "큰 화면으로 보기" : "작은 크기로 보기"}</button>
          </div>
          <p className="mt-3 text-xs text-[#71816a]">작은 보기는 형태 확인용이며 실제 섬 배율과는 달라요.</p>
        </section>
        <section>
          <label htmlFor="item-json" className="font-semibold">아이템 설계서 JSON</label>
          <p className="my-2 text-sm">{"parts" in spec ? "parts는 부품 목록이에요. mirror: x는 좌우 대칭 복제예요. size는 크기, position은 위치, color는 부품 색이에요." : "depth는 두께, bevel은 모서리 둥글기, color는 색이에요."}</p>
          <textarea id="item-json" spellCheck={false} value={draft} onChange={event => setDraft(event.target.value)} className="h-[380px] w-full rounded-2xl border border-[#dce3d6] bg-white p-4 font-mono text-xs" />
          <div className="mt-3 flex gap-2">
            <button className="rounded-xl bg-[#47694b] px-4 py-2 text-sm text-white" onClick={() => {
              try { const next = parseLabItem(JSON.parse(draft)); setError(""); setSpec(next); }
              catch (e) { setError(e instanceof Error ? e.message : "설계서를 확인해 주세요."); }
            }}>설계서 적용</button>
            <button className="rounded-xl border px-4 py-2 text-sm" onClick={() => { const sample = samples.find(sample => sample.name === spec.name) ?? ITEM_CATALOG_SPECS[0]; setDraft(JSON.stringify(sample, null, 2)); setSpec(sample); setError(""); }}>기본 설계서 복원</button>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        </section>
      </div>
    </div>
  </main>;
}
