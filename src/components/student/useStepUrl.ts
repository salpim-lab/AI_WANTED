// 담당: 이유민
// 학생 흐름의 단계(홈 → 마음 → 대화 → 아이템 → 섬)를 주소와 브라우저 기록에 맞춘다.
//
//   /checkin  /checkin/mood  /checkin/talk  /checkin/item  /checkin/island   (하교는 /checkout/...)
//
// 왜: 단계가 상태값으로만 바뀌어서 브라우저는 단계가 바뀐 걸 몰랐다. 화면의 뒤로가기는 이전 단계로
// 가는데 브라우저 뒤로가기는 페이지를 벗어나 첫 화면으로 갔다. 이제 단계가 바뀔 때마다 기록을 쌓고,
// 화면의 뒤로가기 버튼도 브라우저 뒤로가기를 그대로 부른다 — 같은 기록을 쓰니 둘이 어긋날 수 없다.
//
// 페이지를 다시 불러오지 않고 주소만 바꾼다(history.pushState). 이 Next.js 버전은 pushState 를
// 라우터와 맞물려 처리한다(node_modules/next/dist/docs … "Native History API").
// 페이지 파일은 checkin/[[...step]]/page.tsx — 하위 주소로 새로고침해도 같은 페이지가 뜬다.
"use client";

import { useCallback, useEffect, useRef } from "react";

const SLUGS = ["", "mood", "talk", "item", "island"] as const;

/** 기록에 남기는 표시. Next 는 자기 정보(__NA 등)만 덧붙이고 이 값은 그대로 둔다 */
type StepState = { salpimStep?: number; salpimDepth?: number };

export function pathForStep(base: string, step: number): string {
  const slug = SLUGS[Math.min(Math.max(step, 1), SLUGS.length) - 1];
  return slug ? `${base}/${slug}` : base;
}

export function stepFromPath(base: string, pathname: string): number {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+|\/+$/g, "") : "";
  const i = SLUGS.indexOf(rest as (typeof SLUGS)[number]);
  return i <= 0 ? 1 : i + 1;
}

/** 주소를 바꿔도 뒤의 ?tune=1 같은 조건은 그대로 둔다 — 빠지면 개발용 편지 조절 패널이 안 떴다 */
const withQuery = (path: string) => path + window.location.search;

const readState = (): StepState => (typeof window === "undefined" ? {} : (window.history.state ?? {}));

export function useStepUrl({
  base,
  step,
  goTo,
  canShow,
}: {
  /** "/checkin" 또는 "/checkout" */
  base: string;
  step: number;
  goTo: (step: number) => void;
  /**
   * 이 단계를 지금 보여줄 수 있는가. 대화·아이템·섬은 앞 단계에서 만든 데이터가 있어야 한다.
   * 새로고침하거나 주소로 바로 들어오면 데이터가 없으니, 그런 단계는 홈으로 돌린다.
   */
  canShow: (step: number) => boolean;
}) {
  const canShowRef = useRef(canShow);
  const prevStepRef = useRef(step);
  const mountedRef = useRef(false);

  useEffect(() => {
    canShowRef.current = canShow;
  });

  // 처음 들어왔을 때: 주소의 단계를 보여줄 수 있으면 그 단계로, 아니면 홈 주소로 바꿔 둔다
  useEffect(() => {
    const target = stepFromPath(base, window.location.pathname);
    if (target > 1 && canShowRef.current(target)) {
      window.history.replaceState({ salpimStep: target, salpimDepth: 0 } satisfies StepState, "", withQuery(pathForStep(base, target)));
      goTo(target);
    } else {
      window.history.replaceState({ salpimStep: 1, salpimDepth: 0 } satisfies StepState, "", withQuery(base));
    }
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 단계가 앞으로 바뀌면 기록을 한 칸 쌓는다. 브라우저 뒤로가기로 바뀐 경우엔 주소가 이미 맞아서 쌓지 않는다.
  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = step;
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const want = pathForStep(base, step);
    if (window.location.pathname === want) return;
    const depth = (readState().salpimDepth ?? 0) + 1;
    // 끝난 대화로는 돌아가지 않는다: 대화 → 아이템은 기록을 쌓지 않고 바꿔치기한다.
    // 그래서 아이템 화면에서 뒤로 가면 마음 신호등으로 간다(화면의 뒤로가기도 끝난 대화로는 못 간다).
    if (prev === 3 && step === 4) {
      window.history.replaceState({ salpimStep: step, salpimDepth: depth - 1 } satisfies StepState, "", withQuery(want));
    } else {
      window.history.pushState({ salpimStep: step, salpimDepth: depth } satisfies StepState, "", withQuery(want));
    }
  }, [base, step]);

  // 브라우저 뒤로·앞으로: 주소의 단계로 맞춘다. 보여줄 수 없는 단계면 홈으로.
  useEffect(() => {
    const onPop = () => {
      const target = stepFromPath(base, window.location.pathname);
      if (canShowRef.current(target)) {
        prevStepRef.current = target;
        goTo(target);
      } else {
        window.history.replaceState({ salpimStep: 1, salpimDepth: 0 } satisfies StepState, "", withQuery(base));
        prevStepRef.current = 1;
        goTo(1);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [base, goTo]);

  /** 화면의 뒤로가기 버튼. 앞 기록이 이 흐름의 단계면 브라우저 뒤로가기와 똑같이 움직인다 */
  const back = useCallback(() => {
    if ((readState().salpimDepth ?? 0) > 0) {
      window.history.back();
      return;
    }
    // 이 흐름 안의 앞 기록이 없다(주소로 바로 들어온 경우). 페이지를 벗어나지 않게 직접 한 단계 앞으로.
    const prev = Math.max(1, step - 1);
    window.history.replaceState({ salpimStep: prev, salpimDepth: 0 } satisfies StepState, "", withQuery(pathForStep(base, prev)));
    goTo(prev);
  }, [base, goTo, step]);

  return { back };
}
