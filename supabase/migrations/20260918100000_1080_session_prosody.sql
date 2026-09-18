-- 살핌 DB 스키마: 1080_session_prosody
-- 담당: 이유민 (checkin_sessions)
--
-- 발화 파생 수치를 저장할 자리. 기획안 §8.1 이 요구하는 값이다.
--   "전사 텍스트 → 저장 / 파생 수치(prosody) → 저장 / 원본 음성 → 즉시 파기"
--
-- 이 수치가 없으면 교사 화면의 "검증 가능한 근거"가 나오지 않는다.
-- analysis_runs.result 에 해석을 남기더라도, 그 해석의 근거가 되는 측정값은
-- 원본 쪽에 남아야 "원본은 불변, 해석은 버전"(§8.3)이 성립한다.
--
-- 순수 추가이고 nullable 이므로 기존 읽기(강윤지님 아이템 파이프라인 포함)에 영향이 없다.

alter table public.checkin_sessions add column prosody jsonb;

comment on column public.checkin_sessions.prosody is
  '발화 파생 수치. 음성 자체는 저장하지 않는다(기획안 8.1). '
  '개인 기준선 대비 비교가 전제이므로 절대값과 본인 평균 대비 값을 함께 둔다.';

-- 형식 계약. 지금 쓰는 키만 검사하고, 나중에 키가 늘어도 깨지지 않게 최소한만 건다.
--   {
--     "utterances": [
--       { "index": 0,
--         "duration_sec": 12.4,          -- 발화 길이
--         "response_delay_sec": 3.1,     -- 질문 후 첫 발화까지
--         "silence_count": 2,            -- 무음 구간 횟수
--         "silence_total_sec": 3.1,
--         "syllables_per_sec": 2.1,      -- 발화 속도
--         "loudness_rel": -0.30 }        -- 본인 평균 대비 (-1 ~ 1)
--     ],
--     "baseline_days": 14                -- 이 비교에 쓰인 기준선 일수. 부족하면 해석하지 않는다
--   }
alter table public.checkin_sessions add constraint checkin_prosody_valid
  check (
    prosody is null
    or (
      jsonb_typeof(prosody) = 'object'
      and jsonb_typeof(prosody -> 'utterances') = 'array'
      and jsonb_array_length(prosody -> 'utterances') <= 50
      and pg_column_size(prosody) <= 100000
    )
  );

-- 기준선이 쌓이기 전에는 해석하지 않는다(기획안: "첫 2주는 지표를 띄우지 않는다").
-- 그 판단을 하려면 prosody 가 있는 과거 세션을 학생별로 빠르게 세야 한다.
create index checkin_sessions_prosody_idx
  on public.checkin_sessions(enrollment_id, session_date desc)
  where prosody is not null;
