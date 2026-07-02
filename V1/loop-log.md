# loop-log.md — 루프 기록 + 실패 노트

## 루프 #0 (baseline) — 2026-06-16

[① 평가] 골든셋(golden-set.md) 7항목 채점. 픽스처 fixtures/source.docx·target.docx로 검증.

| # | 기준 | 결과 | 근거 |
| --- | --- | --- | --- |
| 1 | docx 업로드 + 좌우 표시 | ✔(로직) | `/api/check` 파싱 OK, 프론트 좌우 패널 구성 |
| 2 | 하단 용어 매핑 테이블 입력/편집 | ✔ | 행 추가/삭제 구현 |
| 3 | 검수 버튼 + 실행 | ✔ | 버튼 → API 200, 결과 JSON 반환 |
| 4 | 미준수 단락 양쪽 형광펜 + 좌우 대응 | ✔(로직) | render() fail 단락만 .para.fail(노랑) 표시 — **시각 확인은 E2E 필요** |
| 5 | 미준수 번역문 인라인 편집 | ✔(로직) | textarea 렌더 — **E2E 필요** |
| 6 | 미준수 0건 시 미표시 + 통과 안내 | ✔(로직) | failRows.length===0 분기 — **E2E 필요** |
| 7 | 잘못된 형식/빈 입력 에러 + 안 멈춤 | ✔ | PDF→안내, 파일 누락→안내 (curl 검증) |

- **기준선 점수: 7 / 7** (로직 기준). 단 4·5·6의 시각 렌더는 사람 E2E 확인 대기.

검증 로그:
- 정상: Border Force→국경검사소 누락 1건 fail, surveillance→예찰 pass, ENS 2변형 통일 경고. summary fail=1.
- 오류: PDF 업로드 → "지원하지 않는 형식" / 파일 누락 → "모두 업로드하세요".

[② 제안] 다음 루프 후보 (아직 미적용 — 사람 E2E 승인 후 진행):
- 후보 A: 형광펜을 단락 전체가 아니라 **매칭된 용어 자체**에만 칠하기 (spec §9 "해당 항목" 더 충실).
- 후보 B: 단락 정렬이 틀어질 때 대비, 인덱스 정렬 외 텍스트 유사도 정렬 옵션.
- 후보 C(덜어내기, 3회차): 사용 안 하는 코드 경로 제거.

[④ 합치기] baseline은 변경 없음. loop.md §2에 따라 E2E는 사람 몫 → 사용자 확인 대기.

## 루프 #1 — 2026-06-16 (요구사항 변경 반영)

[배경] 코치(사람) 지시로 요구 2건 변경:
1. 용어집 = verification 폴더 .docx에서 자동 로드(파일 추가 시 확장). 수동 입력 폐기.
2. 원문/번역문 별도 docx, 단락 1:1 정렬 가정 폐기 → **에이전트가 매칭 표현을 직접 탐색**.

[② 제안] (단일 방향) 매칭 엔진을 단락정렬형 → **용어 중심 탐색형**으로 교체.
- 각 용어를 원문/번역문 전체에서 검색.
- term(깔끔한 용어쌍): 원문 등장 && 번역문에 기대 번역어 미등장 → fail / 일부 → warn / 충족 → pass.
- note(설명형 기준: ENS/NCTS/RoRo 등): 자동판정 불가 → manual(수동검토), 등장 위치 표시.
- 형광펜을 단락 전체 → **매칭 용어 자체(`<mark>`)** 로 축소(spec §9 "해당 항목" 충실).

[③ 검증] verification 용어집 + fixtures로 자동 테스트:
- 용어집 파싱: Border Force=term, ENS/NCTS/RoRo=note ✓
- Border Force→국경검사소 존재 → pass ✓
- ENS/NCTS 한글번역(verbatim 없음) → manual ✓
- RoRo 번역문 그대로 → manual + 번역문 등장 표시(미번역 포착) ✓
- summary: checked 4, pass 1, manual 3. 의도와 일치.

[④ 합치기] 반영. 단, **E2E(브라우저 시각/편집)는 사람 확인 대기**.

> ⚠ 골든셋 영향: criterion #2가 "용어 매핑 테이블 입력·편집"이었으나 요구 변경으로
> "폴더 자동 로드 + 표시 + 새로고침"으로 바뀜. 골든셋 수정은 사람만 → 코치 확인 요청.

## 루프 #2 — 2026-06-16 (Gemini 하이브리드)

[② 제안] (단일 방향) note 유형 기준을 수동검토 → **Gemini API 자동판정**.
- term(규칙) 그대로, note만 LLM. 키 없으면 manual 폴백, LLM 오류 시 manual 폴백.
- 키는 .env(GEMINI_API_KEY), 브라우저 비노출. model=gemini-2.5-flash, temperature=0, JSON 강제.

[③ 검증] fixtures + verification 용어집:
- 연결: generate() → "네" 정상 응답.
- Border Force: 규칙 pass(LLM 미사용) ✓
- ENS/NCTS/RoRo: Gemini 판정 3건, 오류 0.
- ENS/NCTS → fail(위반 1), RoRo → pass.

[④ 합치기] 반영(폴백 안전장치 포함).

[발견 — 데이터 품질 이슈]
- 용어집 docx가 **2열(원문/번역어)** 뿐. spec 원안의 **비고열("통일할 것","우리말로 번역할 것")이 없음.**
- 그래서 note 셀이 "문제 서술"만 있고 "요구 동작"이 빠짐:
  - ENS/NCTS: "여러 용어로 번역되어 있음" → Gemini가 단일 사용도 위반 예시로 오판(false positive 경향).
  - RoRo: "RoRo로 번역되어 있음"만 있고 "우리말로 번역" 지시 없음 → Gemini pass.
- **결론: 코드 아님, 용어집 데이터 문제.** note 셀에 요구 동작을 명시해야 판정 정확.
- 다음 루프 후보: (A) 용어집 비고열 추가 후 프롬프트에 반영 (B) 통일검사는 "번역문 내 실제 변형들"을 모아 비교하도록 프롬프트 개선.

## 루프 #3 — 2026-06-17 (통일검사 규칙화 — 후보 B)

[배경] loop #2 발견: note 통일검사를 LLM에 맡겨 false positive 경향(ENS/NCTS 단일 사용도 위반 오판). xlsx/docx 용어집 모두 2열뿐 — 비고열 없음 확인(코드 아닌 데이터 한계).

[② 제안] (단일 방향) "여러 용어로 번역되어 있음" + 열거형(1)..2)..) note를 **규칙 기반 통일검사**로 전환. LLM 미사용.
- `parseUniformityRule()`: note에 "여러 용어/통일" + 변형 2개 이상 열거 → 변형 목록 반환.
- 번역문에 **실제 등장하는 서로 다른 변형** 수집 → 2종 이상 혼용일 때만 fail, 0/1종이면 pass(통일됨).
- RoRo 같은 비열거형 note는 기존 LLM/manual 경로 유지.

[③ 검증] fixtures + verification 용어집 (LLM 키 없이 결정적):
- 정상(fixtures/target.docx): ENS pass(변형 1종), NCTS pass(1종), RoRo manual, Border Force pass. ruleJudged=2, LLM 미사용. → **loop #2 false positive(ENS/NCTS fail) 수정 확인.**
- fail 회귀(fixtures/target_bad.docx, ENS 2변형 혼용): ENS fail(변형 ["안전 및 보안 수입신고","반입신고"] 포착), NCTS pass(1종), RoRo manual. summary fail=1.
- 양/음성 경로 모두 결정적 통과. (회귀 픽스처는 make-fixtures.js에 추가)

[④ 합치기] 반영. note 통일 유형은 이제 LLM 폴백 전에 규칙으로 선판정 → false positive 제거 + LLM 호출/토큰 절감. E2E(브라우저 시각/편집)는 사람 확인 대기.

[발견 — loadGlossary 범위 버그 (loop #4 후보)]
- `loadGlossary()`가 verification 폴더의 **모든 .docx**(번역 대상/한역본/병기 문서 포함) 파싱 → glossary 444 entries로 오염.
- 용어집은 `번역준수기준(용어집).docx` 1개만 써야 함. 번역 대상 문서의 표(설문 문항)가 쓰레기 note 항목("1","2","4.2" 등)으로 유입.
- fixtures 테스트는 통과(쓰레기 항목은 원문 미등장 → na)지만, 실제 문서 검수 시 오탐 위험.
- 다음 루프 후보: (A) 용어집 파일명/패턴 화이트리스트(예: "용어집"/"준수기준" 포함 파일만). (B) xlsx도 용어집 소스로 지원(현재 .docx만, xlsx에 98개 정식 용어 존재).

## 루프 #4 — 2026-06-17 (xlsx 용어집 로드 + 화이트리스트 + 단어경계 매칭)

[배경] loop #3 발견: (A) loadGlossary가 verification 폴더 모든 .docx 파싱 → 444개 오염. (B) 정식 용어집 xlsx(98개) 미지원.

[② 제안] (단일 방향이되 한 묶음) 용어집 로딩 정비:
1. **xlsx 파서** `parseGlossaryXlsx()` — jszip(mammoth 의존성, 기설치)으로 OOXML 직접 파싱. sharedStrings + 첫 워크시트, A열=원문/B열=번역.
2. **화이트리스트** `isGlossaryFile()` — 파일명에 "용어집"/"준수기준" 포함된 .docx/.xlsx만 용어집으로. 번역 대상 문서 표 오염 차단.
3. (xlsx 풀 용어집 로드로 드러난 부작용 수정) **단어경계 매칭** — ASCII 용어는 `(^|[^A-Za-z0-9])term($|[^A-Za-z0-9])`로. 한글은 substring 유지.

[③ 검증] (LLM 키 없이 결정적)
- glossary: files = [용어집.docx, 용어집.xlsx] 2개만. entries 444→96(term 93, note 3). 오염(쓰레기 note 67개) 제거. BSE/MRL/heifer 등 xlsx 전용 용어 로드 확인.
- 단어경계 전: CA→"cargo", RA→"transit" substring 오탐 2건 fail. 수정 후: 오탐 0, checked 6→4.
- 정상 fixtures: ENS/NCTS pass(rule), RoRo manual, Border Force pass. fail=0.
- fail fixtures(target_bad, ENS 2변형): fail=1. 통일검사 규칙 유지 확인.

[④ 합치기] 반영. 용어집은 이제 xlsx/docx 모두 지원, 정식 용어집 파일만 로드, 약어 오매칭 제거. E2E는 사람 확인 대기.

[남은 후보 (loop #5)]
- (A) 여전히 substring 기반 한글 매칭 — 부분 포함 오탐 가능성(예 "소"가 다른 단어에). 형태소/경계 보강 검토.
- (B) note RoRo형("우리말로 번역") 비고열 부재 → LLM 폴백 의존. 데이터(비고열) 보강은 사람 몫.
- (C) 같은 source 다중 target(동의어 행) 병합 처리 — 현재 first-seen만 유지.

## 루프 #5 — 2026-06-17 (병기 단일파일 좌우 정렬 검수)

[배경] 사람 테스트: 4건 영한병기 파일(원문 EN + 번역 KO가 한 문서 표 셀에 교차). 현행 앱은 분리 2파일 가정 → 병기 좌우 대응·행단위 수정 불가. 코치 결정(방향 A): **병기 단일파일 정렬 추출**.

[데이터 구조 분석] 병기 셀 내부: `<p>` 순서로 EN단락 → 바로 다음 KO단락이 그 번역. (KO에 약어 SENASA/RTCA 섞여 BOTH로 보여도 한글 있으면 번역측.)

[② 제안] (단일 방향) 병기 입력 + 좌우 정렬 뷰 신설:
- `extractBilingualPairs()`: 표 셀 내 한글유무로 EN/KO 분류, EN-run→KO-run 페어. 번호/URL 단독행 제외.
- `checkBilingual()`: 정렬을 알기에 **세그먼트 로컬 term 검사**(원문에 용어 → 같은 행 번역에 기대어 미존재시만 검토후보). 미번역(원문만) 별도 표시.
- 라우트 `POST /api/check-bilingual` (single file 'doc').
- 프론트: 좌우 정렬 표(원문|번역|검토), **행단위 인라인 편집**, 필터(검토후보/미번역/전체), 수정본 .txt 내보내기.

[정밀도 보정 — 병기 실데이터로 드러남]
- `expectedVariants()`: 기대값 "작업장, 설립"→동의어 분리, "소(형용사)"→괄호주석 제거, 1자 용어 제외(검사불가는 skip, 하드 fail 아님).
- `contains()` 한글 분기: **공백 무시 substring**("관할기관"↔"관할 기관").

[③ 검증] (LLM 키 없이 결정적)
- 회귀: 기존 2파일 검수 fail=0 유지(공백무시 영향 없음).
- 병기 4파일 전부 무오류 파싱·검사:
  - file01(코스타리카) pairs 1389 / 검토후보 80(정밀도 보정 전 125→86→공백무시 80) / 미번역 438.
  - Decree pairs 51, 카자흐 289, 루마니아 307 — 검토후보 0.
- app.js/server.js 문법 OK, 페이지에 병기 UI 요소 서빙 확인.

[④ 합치기] 반영. 병기 좌우 정렬 + 행 인라인 편집 + 내보내기 제공. E2E(브라우저 시각/편집 체감)는 사람 확인 대기.

[남은 한계 (loop #6 후보) — term 정밀도는 자문 수준]
- 한국어 동사 활용: "발급하다"(기대) vs "발급된다/발급"(실제) → 미스. 어간 매칭/형태소 필요.
- 다의어: "establishment"=작업장/설립(기대) vs "수립"(문맥상 정답) → 오탐. 규칙 한계, LLM/수동 검토 영역.
- src에 URL 포함 세그먼트 → 영문 용어 오매칭 잔존. URL 제거 전처리 검토.
- untranslated 과다(EN 라벨/표제 다수) → "문장형(공백 포함 N단어 이상)만 미번역 집계" 등 노이즈 축소.
- 동의어 기대값을 2파일 경로(checkGlossary)에도 적용(현재 병기 경로만).

## 루프 #6 (옵션 1) — 2026-06-17 (다의어 = 복수 의미 용어집 병합)

[배경] 사람 질문: report=신고(동사)/보고서(명사)처럼 한 원문이 여러 의미. 1:1 매핑이라 다른 의미로 번역시 오탐. 옵션 1만 우선 구현(나머지 2·3·4는 추후 비교 테스트).

[② 제안] (옵션 1) 동일 원문 용어의 여러 행/파일을 **병합**해 모든 의미 허용:
- loadGlossary: first-seen 버리던 dedup → 같은 source의 target들을 '/'로 병합(중복제거), 병합 후 classify 재실행. file 출처도 누적.
- checkGlossary(2파일 경로) term 분기도 `expectedVariants`로 전환(이전엔 병기 경로만). 변형 중 하나라도 등장→인정. 변형 없음(주석형/1자)→manual.

[③ 검증] (LLM 키 없이 결정적)
- 테스트 용어집 생성: make-test-glossary.js → verification/번역준수기준(용어집)_다의어테스트.docx (report→보고서, issue→사안 추가행).
- 병합: report→"신고/보고서"[term], issue→"발급하다/사안", 출처 2파일 표기. entries 96 유지(추가 아닌 병합).
- E2E: 원문 "annual report" + 번역 "연례 보고서" → 이전 fail → 이제 **pass**.
- 회귀: 정상 fixtures fail=0, 병기 file01 fail 80→75(다의어+주석형 manual 처리로 오탐 감소).

[④ 합치기] 반영. 다의어는 용어집 셀에 의미 나열(`신고/보고서`) 또는 행 추가로 처리 — 둘 다 병합됨. 데이터 보강은 사람 몫.

[테스트 산출물 (되돌리려면 삭제)]
- verification/번역준수기준(용어집)_다의어테스트.docx — 다의어 테스트행. 지우면 report→신고 원복.
- make-test-glossary.js, poly-fixtures.js(fixtures/poly_*.docx) — 재현용.

[옵션 2·3·4 (다음 테스트 대기)]
- 옵션 2: Gemini 문맥 의미판정(term fail 건만 LLM 확인).
- 옵션 3: 다의어는 하드fail 금지 → manual 다운그레이드.
- 옵션 4: KO 동의어/의미 사전(사전 플래그) 기반.

## 루프 #6 (옵션 2) — 2026-06-17 (Gemini 문맥 의미판정)

[② 제안] (옵션 2) 병기 경로 term 규칙 fail 건만 Gemini가 문맥상 적절성 판정 → 다의어 오탐 제거.
- gemini.judgeTermSense({term,expected,src,tgt}) → {ok,reason,suggestion}. ok=true면 issue 제거, false면 근거와 함께 유지, null(파싱실패)이면 규칙 결과 유지.
- checkBilingual async화, opts.useLLMTerm. 호출 상한 LLM_TERM_CAP=60(비용/지연). 정렬된 src/tgt 쌍이 문맥 제공 → sense-check 최적.
- UI 토글 #llmTerm(기본 off → 비용 없음). 라우트가 req.body.llmTerm 읽음.
- 키 로드: `npm start`(--env-file-if-exists=.env). `node server.js` 직접 실행은 .env 미로드.

[③ 검증] (실제 Gemini 호출)
- 테스트 병기파일 fixtures/biling_test.docx (make-biling-test.js): #0 establishment→문맥상 "수립"(용어집 작업장/설립 아님), #1 Border Force→"관할기관"(오역).
- 옵션1(off): 둘 다 fail.
- 옵션2(on): #0 → ok(LLM 다의어 인정), #1 → fail 유지 + 근거("'관할기관'은 포괄적, '국경' 정보 누락"). llm calls 2, cleared 1.
- 의도대로 다의어는 통과, 오역은 포착.

[④ 합치기] 반영(옵션 1과 공존: 규칙→병합 통과 안 되면 LLM 확인). 2파일 경로는 미적용(정렬 없어 문맥 약함, note 경로만 LLM). 비용: 대형파일 fail 다수면 60건까지 호출.

[테스트 산출물] fixtures/biling_test.docx, make-biling-test.js.

## 루프 #7 — 2026-06-17 (용어집 단일기준 / 미준수 중심 / LLM 의미판정 제거)

[배경] 코치 결정: **용어집이 유일 기준.** 다의어 여부(report=신고하다 vs 보고서)는 번역가가 **용어집 수정**으로 결정. 에이전트는 LLM으로 의미 추측 금지 → 용어집 기준 **미준수**만 표시.

[② 제안] (단일 방향) 옵션2(Gemini term 문맥판정) 철회 + 미준수 중심 전환:
- checkBilingual 순수 규칙으로 복귀(LLM term 경로/토글/캡 제거, async 해제). gemini.judgeTermSense 삭제.
- 판정: 원문에 용어 등장 && 용어집 기대 번역어(병합된 모든 의미 중 어느 것도) 미등장 → 미준수. 다의어는 용어집에 의미 추가(`신고하다/보고서`)로 번역가가 허용(옵션1 병합 유지).
- UI: 라벨 "검토"→"미준수", 필터 "기준 미준수만" 기본, 상태 메시지/안내문 미준수 중심. 미준수 행에 "번역 수정 또는 용어집에서 의미 추가 후 새로고침" 힌트.

[③ 검증] (npm start, 키 로드)
- biling_test: establishment→수립, Border Force→관할기관 둘 다 **미준수**(LLM 미개입, summary.llm 없음). llmTerm=1 보내도 무시(fail 2 유지).
- **용어집 수정 루프 시연**: 용어집에 establishment→수립 추가 → 병합 "작업장, 설립/수립" → 재검수 #0 통과, #1(Border Force) 미준수 유지. 미준수 2→1.
- 회귀: 2파일 정상 fixtures fail=0(note RoRo는 키 로드돼 LLM pass — 기존 note 경로, term과 무관).
- 테스트 용어집 비움(헤더만) → 실제 용어집 원복(report→신고, entries 96).

[④ 합치기] 반영. 워크플로 확정: **용어집 편집 → 새로고침 → 미준수 확인**. 에이전트는 기준 대조만, 의미 결정은 번역가.

[남은 후보 (loop #8)]
- 2파일 경로도 미준수 라벨 통일(현재 미준수/부분적용/수동검토 혼재).
- note RoRo형 LLM 판정도 "용어집 기준"이라 유지하나, 결정성 원하면 규칙화/제거 검토.
- KO 동사활용·미번역 과다 노이즈(loop #5 잔여).
- 용어집 인앱 편집(현재 docx/xlsx 직접 수정 + 새로고침).

## 루프 #8 — 2026-06-17 (좌우 2슬롯 통합 / 병기는 양쪽 업로드)

[배경] 코치 요구: 원문/번역문 좌우 2슬롯 구조 유지. 영한병기 파일도 별도 입력 말고 **동일 병기 파일을 원문·번역문 양쪽에 각각 업로드** → 원문슬롯=EN 열, 번역문슬롯=KO 열로 추출해 좌우 정렬.

[② 제안] (단일 방향) 입력 일원화 + 자동 분기:
- 전용 "병기 파일" 입력/버튼 제거. 모든 검수는 원문/번역문 슬롯 + "검수 시작"으로.
- /api/check: 두 업로드 각각 extractBilingualPairs → isBilingual(both>=3) 판정.
  - 병기 감지: srcUnits=원문슬롯 pairs[i].src, tgtUnits=번역문슬롯 pairs[i].tgt, 인덱스 정렬 → checkBilingual → out.mode='bilingual'.
  - 아니면 기존 단락 term+note 검사 → out.mode='paragraph'.
- 프론트: 검수 버튼이 mode 분기 — bilingual→좌우 정렬표(.top 숨김), paragraph→기존 2패널(.align 숨김).

[③ 검증] (npm start)
- A) 병기 동일파일 양쪽(biling_test 3쌍): mode bilingual, 미준수 2(establishment→수립, Border Force 오역)+준수 1(official veterinarian→정부수의사). EN 좌/KO 우 정렬.
- B) 실제 file01 양쪽: mode bilingual, 1389쌍.
- C) 일반 2파일(source/target 평문, 표 없음 → pairs 0 → not bilingual): mode paragraph, 정상.
- isBilingual 임계값 both>=3: 평문 docx(표 없음)는 pairs 0 → paragraph로 안전 분류.

[④ 합치기] 반영. 단일 입력 구조: 원문/번역문 올리고 검수 → 병기면 자동 좌우 정렬, 일반이면 2패널. /api/check-bilingual 라우트는 미사용으로 잔존(무해).

[남은 후보 (loop #9)]
- 미사용 /api/check-bilingual 라우트 정리.
- paragraph 모드도 미준수 라벨/좌우 정렬 일관성(현재 term-global 2패널).
- 두 슬롯에 서로 다른 병기(예: 다른 세그먼트 수) 올릴 때 정렬 안전장치.

## 루프 #9 — 2026-06-17 (모든 입력 좌우 정렬 통일 + 문서전체 기준 배너)

[배경] 코치 요구: 원문/번역문 분리·영한병기 **모두** 좌우 대응 문장 나란히 배치 → 수정 용이성.

[② 제안] (단일 방향) /api/check 출력을 항상 좌우 정렬표로:
- srcUnits/tgtUnits(병기면 EN/KO 열, 분리면 단락) 인덱스 1:1 정렬 → checkBilingual(term 세그먼트 미준수).
- note/통일검사(ENS 등 doc-global)는 checkGlossary로 별도 산출 → out.notes 배너.
- mode='aligned' 단일화. 프론트: 항상 renderAlign + renderNotes, 2패널(.top) 숨김.

[③ 검증] (npm start)
- 분리 2파일(평문): mode aligned, 5세그먼트 좌우 대응, 전부 정상.
- 병기 동일파일 양쪽: mode aligned, 미준수 2, 3세그먼트.
- source+target_bad(ENS 2변형): term 0, note 배너 ENS fail(통일위반 2종 혼용) 포착.

[④ 합치기] 반영. 모든 입력 → 좌우 정렬 인라인 편집표 + 문서전체 기준 배너. 분리 문서는 단락 인덱스 1:1 평행 가정.

[남은 후보 (loop #10)]
- 분리 문서 비평행(단락 수 불일치) 시 정렬 틀어짐 → 유사도 정렬 옵션.
- 미사용 /api/check-bilingual, render()(2패널), .top 마크업 정리.
- 미번역 노이즈(EN 라벨) 축소.

## 루프 #10 — 2026-06-17 (상태별 구역 분리 / 구역별 편집)

[배경] 코치 요구: 필터(라디오, 한 번에 하나) → 상태 항목별로 화면에 분리 표시 + 항목별 수정.

[② 제안] (단일 방향) 라디오 필터 → **상태별 아코디언 구역**:
- 미준수/미번역/정상 3구역 동시 표시, 각 접이식(헤더 클릭 토글), 각자 좌우 정렬표 + 행 인라인 편집.
- 미준수 기본 펼침, 미번역·정상 접힘. 헤더에 건수.
- alignSegments 공유 객체 → 어느 구역서 편집해도 상태 보존. 내보내기는 전역 유지.

[③ 검증] 병기 동일파일: 상태별 fail 2/untranslated 0/ok 1. HTML에 #alignGroups, alignFilter 라디오 제거 확인. app.js 문법 OK.

[④ 합치기] 반영. renderAlign이 ALIGN_GROUPS 순회해 구역 생성(buildGroupTable/buildRow). currentFilter·라디오 리스너·alignBody 제거.

[메모] 편집으로 미준수 고쳐도 재검수 전엔 구역 이동 안 함(상태는 서버 재판정 시 갱신).

## 루프 #11 — 2026-06-17 (전부 펼침 + 필터 선택버튼)

[배경] 버그: 미준수 0건이면 정상/미번역 구역이 접혀 있어 문장·수정대상이 화면에 안 보임(#10 기본접힘 부작용). 코치 요구: 모두 표시 + 필터를 선택버튼 클릭으로.

[② 제안] (단일 방향)
- 구역 기본 **전부 펼침**(open 제거) → 모든 문장/편집셀 표시.
- 상단 **필터 버튼** [전체]/[기준 미준수]/[미번역]/[정상] + 건수. 클릭 → 해당 구역만 표시(전체=모두). 기본 전체.
- 헤더 클릭 개별 접기/펼치기는 유지(보조).

[③ 검증] 분리 2파일(전부 정상): 정상 구역 5세그먼트 표시(이전엔 접혀 미표시). HTML 필터버튼 4개·전체 active 확인. app.js 문법 OK.

[④ 합치기] 반영. applyGroupFilter(구역 표시 토글), updateFilterCounts(버튼 건수). groupFilter 기본 'all'.

## 루프 #12 — 2026-06-17 (핵심 복원: 단일 좌우표 전문장 + 형광 + 편집, 필터 2차 강등)

[배경] 코치 강한 피드백: 상태별 그룹 분할(#10·#11)이 출발점(원문/번역문 좌우 나란히 전 문장 표시 + 수정사항 형광 + 인라인 편집)을 묻어버림. 필터는 2차 요구였는데 1차처럼 됨. 문장 미표시 + 형광 미표시 회귀.

[② 제안] (단일 방향) 그룹 아코디언 제거 → **단일 좌우 표**:
- 문서 순서대로 전 세그먼트 한 표에 표시(숨김 없음). 원문 좌 / 번역문 우(인라인 편집).
- 미준수: 원문 해당 용어 <mark> 형광 + 번역셀 .needs-fix 형광 배경 + "기대 번역어 X 미사용" 안내.
- 필터 버튼은 행 숨김/보임만(2차), 기본 전체.

[③ 검증] 분리 2파일: 5문장 전부 순서대로 표시. 병기: 미준수 2건 형광대상(establishment, Border Force) 표시, 정상 1건. app.js 문법 OK.

[④ 합치기] 반영. renderAlign 단일표(buildRow에 형광/needs-fix/expect-hint), applyRowFilter(행 토글). 그룹 함수 제거.

[메모] 톤/문체 기준은 규칙 엔진 범위 밖(LLM 영역, 용어 결정은 용어집 원칙이라 미적용). 현재 자동검사는 용어집 용어 준수 + 통일(note). 톤/문체 자동판정 필요시 별도 결정.

## 루프 #13 — 2026-06-17 (원점 복귀: 원문/번역문 두 박스 + 용어집 형광, 미번역·필터·그룹·표 전부 제거)

[배경] 코치: 가장 기본은 원문/번역문 좌우 박스(.top). 결과가 별도 표에 떠서 그 박스엔 안 나옴. "미번역"은 용어집과 무관한데 떠서 혼란. 용어집(엑셀) 기준 형광이 안 보임.

[② 제안] (단일 방향) 별도 정렬표/상태그룹/필터버튼/미번역 상태 **전부 제거**, 원래 두 박스로 직행:
- /api/check → mode='review': source[](원문 전 문장), target[](번역 전 문장), violations[](용어집 미준수 term, doc-global), notes[](통일 등).
- violations = 원문에 용어 등장 && 번역문에 기대 번역어(병합 의미 중 어느 것도) 미등장.
- 프론트 render(): 원문 박스=전 문장+미준수 용어 <mark> 형광 / 번역문 박스=전 문장 인라인 편집+상단 미준수 목록(형광) / 통일 등은 noteBanner.
- "미번역" 개념 폐기(용어집 기준 아님).

[③ 검증] (npm start)
- 병기 동일파일 양쪽: mode review, 원문 3·번역 3 전 문장, 미준수 2(Border Force→국경검사소, establishment→작업장,설립).
- 분리 2파일: 원문 5·번역 5 전부 표시, 미준수 0 → "✔ 미준수 없음".
- HTML에서 미번역·filter-btn·alignGroups 제거 확인. 빈 단락 필터.

[④ 합치기] 반영. 화면 = 원문/번역문 두 박스(가장 기본) + 용어집 형광 + 인라인 편집 + 통일 배너. 자동검사 기준=용어집 용어 준수 + 통일(note). 톤/문체는 규칙 밖(별도 결정 대기).

[정리 대상] 미사용: checkBilingual, isBilingual, extractBilingualPairs는 여전히 mode 판별/추출에 사용. /api/check-bilingual 라우트 미사용 잔존.

## 루프 #14 — 2026-06-17 (미준수 용어별 그룹 + 해당 문장만 + 숫자 제거)

[배경] 코치가 원하는 형식 명시(예시 제공): 미준수 용어별 그룹("[미준수] cattle → 기대: 소(소떼)" 헤더 + 해당 문장). 불만: 앞 숫자([432]) 우선, 불필요한 내용 과다. 선택: 해당 문장만 추출.

[② 제안] (단일 방향) #13 전문장-두박스 → **미준수 용어별 그룹** 복원·정리:
- /api/check → checkGlossary 결과(results: term/note별 srcHits/tgtHits/status) 반환(병기/분리 srcUnits 정렬은 유지).
- render(): term 미준수만 그룹화. 그룹 헤더 [미준수/부분적용/수동검토] term→기대. 원문/번역문 각 박스에 **해당 용어 든 문장만 추출**(sentenceWith, 문단→문장), **인덱스 숫자 제거**. 그룹당 5문장 상한 + "외 N문장".
- fail: 번역문 "기대어 미사용" 안내. warn: tgtHits 문장 인라인 편집. manual(1자/주석형): "수동검토" 안내(문장 덤프 안 함).
- note(통일 등)는 상단 배너.

[③ 검증] 실제 병기 file01 양쪽: fail 8/warn 3/manual 2, 그룹별 srcHits/tgtHits 정상. 문법 OK.

[④ 합치기] 반영. 숫자 제거·문장만·상한으로 과다표시 해소. 미번역/필터/표 잔재 제거됨.

## 루프 #15 — 2026-06-17 (용어별 정렬쌍: 부분적용·미준수 원문↔번역 함께 표시)

[배경] 코치: 부분적용 대상 원문/번역문도 표시. 기존엔 번역문이 "기대어 든 문장"만 → 기대어가 번역문에 드물면(register→등재) 번역문 거의 안 보임.

[② 제안] (단일 방향) 인덱스 정렬쌍 활용:
- 백엔드: alignedPairs(srcUnits[i]↔tgtUnits[i]). 각 term 결과에 r.pairs = 원문에 용어 든 쌍(최대 8) + p.ok(해당 번역에 기대어 존재) + r.matchCount.
- 프론트: term 그룹마다 원문 출현 문장 + **대응 번역문**을 같은 순서로 좌우 표시. p.ok=false(기대어 미사용) 쌍은 번역문 형광(needs-fix). "외 N곳".

[③ 검증] 병기 file01: warn Competent Authority 8/18쌍(ok 혼재), establishment 8/43, fail alteration·cover 각 1쌍 원문+실제 번역 표시. 문법 OK.

[④ 합치기] 반영. 부분적용·미준수 모두 원문↔번역 대응으로 보여 수정 용이. 정렬: 병기=EN/KO 열, 분리=단락 평행.

## 루프 #16 — 2026-06-17 (2열 매칭 표 / 상한 제거 / 미준수 쌍 전부 + 형광 + 편집)

[배경] 코치 반복 요구가 안 지켜짐. 명확화: ① 원문↔번역문 행 단위 매칭(좌우 비교) ② 갯수 제한 없이 해당 문장 모두 ③ 원문에 용어 있고 번역문에 기대 번역어 없으면 좌우 모두 표시+형광 ④ 블록 내 수정+형광 유지.

[② 제안] (단일 방향) 두 박스 → **용어별 2열 매칭 표**:
- 백엔드: r.pairs 상한 제거(전부), p.ok(기대어 존재).
- 프론트: resultArea에 용어별 그룹. 미준수 쌍(p.ok=false)만, **전부**, <table.pair-table>(원문|번역문) 행으로. 원문 셀=해당 문장+용어 <mark>, 번역문 셀=대응 번역 contenteditable+기대어 형광, 양 셀 needs-fix 배경. 입력/blur마다 재형광(유지).
- 수동검토(1자/주석형)·통일(note)은 상단 배너로.

[③ 검증] 병기 file01: 미준수쌍 전부 표시 — establishment 42/43, Competent Authority 11/18, report 10/10, 총 81문장. 상한 없음 확인. 문법 OK.

[④ 합치기] 반영. sourceBox/targetBox 두 박스 제거 → resultArea 2열 표. 정렬: 병기=EN/KO 열, 분리=단락 평행.

[현재 화면 구조 (최종)]
- 상단 컨트롤(원문/번역문 .docx + 검수 시작) → noteBanner(통일·수동검토) → resultArea(용어별 2열 매칭 표) → 하단 용어집 표.
- 병기: 같은 .docx를 원문·번역문 양쪽 슬롯에 업로드.

## 루프 #17 — 2026-06-18 (번역문 슬롯 병기파일 정렬 수정)

[배경] 코치 테스트: 원문 슬롯=EN 평문 .docx, 번역문 슬롯=영한병기 .docx. establishment 등에서 좌(원문)↔우(번역문)가 엉뚱하게 매칭. 원인: /api/check가 srcUnits=원문EN단락(docxToParagraphs), tgtUnits=병기KO(tgtPairs.tgt) → 두 길이/순서 달라 인덱스 정렬(alignedPairs[i]) 어긋남.

[② 제안] (단일 방향) 병기 파일은 내부에 EN→KO 페어가 이미 정렬됨 → 그 페어를 정렬 기준으로 사용:
- 번역문 슬롯이 병기면: srcUnits=tgtPairs.map(p=>p.src)(병기 EN), tgtUnits=tgtPairs.map(p=>p.tgt)(병기 KO). 원문 슬롯의 별도 EN 파일은 무시(병기문 자체 EN이 곧 원문 → 완벽 정렬).
- 원문 슬롯만 병기면 srcPairs 페어 사용. 둘 다 평문이면 기존 단락 인덱스 1:1.

[③ 검증] 코치 육안: establishment 좌우 문장 매칭 정상. (서버 syntax OK, HTTP 200)

[④ 합치기] 반영(server.js /api/check 정렬 분기). 병기문이 양쪽 어디에 올라와도 내부 EN/KO 페어로 정렬.

## 루프 #18 — 2026-06-18 (수정본 .docx 다운로드)

[배경] 코치 요구: 웹앱 번역문 셀에서 '사업장'→'작업장' 수정해도 화면만 바뀌고 실제 워드 파일 미반영. 수정 결과를 수정본 파일로 하드 다운로드.

[결정] 저장 방식 = **수정본 다운로드(원본 보존)**. 원본 덮어쓰기는 19MB 원천파일 되돌리기불가라 코치가 다운로드 선택. (업로드는 multer memoryStorage라 서버가 디스크 원본 안 건드림.)

[기술 확인] 병기 docx의 한글 용어가 단일 <w:t> run 안에 존재(`<w:t>사업장에</w:t>`) — run 경계 안 걸침 → 텍스트 노드 치환으로 서식 보존 가능 확인.

[② 제안] (단일 방향) 편집 추적 + 토큰 치환 + .docx 재포장:
- 프론트(app.js): editable-view에 dataset.orig=원본 저장. [수정본 다운로드] 버튼(검수 후 노출). 클릭 시 textContent≠orig 셀을 {before,after}로 수집 → /api/export에 번역문파일+edits 전송 → blob 다운로드(파일명 ..._수정본.docx).
- 백엔드(server.js /api/export, upload.single('target')): diffToken(before,after)로 바뀐 토큰 추출(최소 diff를 공백 경계까지 확장 → '사'→'작' 부분음절 과치환 방지, 단어단위 '사업장에'→'작업장에'). 동일 토큰 병합 remaining=발생수. applyReplacements가 <w:t> 텍스트 노드만, remaining 횟수만큼 치환(전역 무차별 아님). JSZip로 document.xml 교체 후 재포장.
- 빈 셀 신규 입력(삽입)은 위치 특정 불가 → diffToken null로 건너뜀(치환만 지원).

[③ 검증] (실제 Decree 영한병기 docx, node)
- diffToken: "관할 사업장에 대해"→"관할 작업장에 대해" ⇒ find"사업장에"/replace"작업장에". "사업장"→"작업장" ⇒ 정확. 빈→"작업장" ⇒ null(skip).
- applyReplacements(find"사업장에"): 사업장 73→72, 작업장 5→6, applied=1. 딱 1곳, 서식 run 보존, 범위 정확.
- server/app syntax OK, HTTP 200. **브라우저 E2E(실제 다운로드 파일 열기)는 코치 확인 대기.**

[④ 합치기] 반영. 워크플로: 검수 → 셀 수정 → [수정본 다운로드] → ..._수정본.docx.

[한계/후보 (loop #19)]
- document.xml만 치환. 머리글/바닥글/textbox 내 번역은 미반영(병기 본문은 document.xml이라 통상 충분).
- 같은 토큰이 본문에 합법적으로 더 있으면 remaining 범위 내 앞쪽부터 치환 — 순서 의존(드묾).
- 빈 셀 신규 번역 입력은 미반영(치환만). 필요시 세그먼트 단위 삽입 설계.
- 원본 덮어쓰기 옵션(+.bak)은 미구현(코치가 다운로드 선택).

## 실패 로그
(#10·#11 그룹분할이 좌우표시·형광 가림 / #12 단일표도 사용자 기대(두 박스)와 어긋남 → #13에서 원문/번역문 두 박스 원점 복귀. 미번역 상태는 용어집 무관 혼란 유발로 폐기.)
