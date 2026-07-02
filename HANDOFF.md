# HANDOFF — 번역 준수 검수 웹앱 (작업 이어가기용)

> 이 파일을 읽으면 바로 실행하고, 현재 구현 상태를 이해할 수 있도록 정리했습니다.
> 마지막 갱신: 2026-07-02.

## 🚀 배포 상태 (2026-07-02 신규)
- **라이브 URL**: https://translator-s-helper.vercel.app
- **GitHub**: https://github.com/sangbonk-ui/translator-s-helper (branch `main`)
- **Vercel 프로젝트**: `alonetwo/translator-s-helper`
- 로컬 실행은 여전히 `npm start` → `http://localhost:3000`
- 재배포(코드 변경 후): `npx vercel --prod --yes` (작업 폴더에서)
- 상세 배포 구조/한계 → 문서 하단 "배포 아키텍처" 참고

## 개요
- 프로젝트: 식약처 가축검역 설문서 번역 준수 검수 웹앱
- 역할: 원문/번역문 `.docx` 업로드 → `verification` 폴더 용어집 기준으로 용어 준수 검사 → 미준수 항목 좌우 대응 표시
- 평가 기준: 용어집 항목(term/note) 기반 검사, `.docx`/`.xlsx` 용어집 로드 지원

## 바로 실행
1. 작업 폴더로 이동: `c:\Users\ahrim\OneDrive\바탕 화면\AI 에이전트2 3일차`
2. 서버 시작: `npm start`
3. 브라우저 열기: `http://localhost:3000`

> 현재 서버가 이미 실행 중이면 해당 URL로 접속해 확인하세요.

## 주요 파일
- `server.js`: 백엔드, 파일 수신, 용어집 로딩, 검수 로직, 수정본 내보내기
- `public/index.html`: 프론트엔드 UI
- `public/app.js`: 클라이언트 로직, 검수 요청, 결과 렌더, 인라인 수정, 수정본 다운로드
- `public/style.css`: UI 스타일
- `verification/`: 용어집 파일(.docx/.xlsx) 저장 위치
- `fixtures/`: 테스트용 샘플 문서
- `golden_set.md`: 현재 구현 상태 기준 및 검수 요소 정리
- `loop-log.md`: 루프별 검증/결과 기록

## 문체(평서체/경어체) 검토 — 신규 추가 (2026-06-29)
- 용어집 검수와 **독립된 축**. 기존 `checkGlossary` 무수정, 결과는 응답의 별도 키 `out.style`로 분리.
- **한글 문장만 대상** (번역문). 원문 영어는 `tgtUnits`에 없고, 혹 섞여 들어와도 비한글 종결이면 제외.
- 분류 규칙(`server.js > classifyStyle`) → 'plain'|'honorific'|'review'|'exclude':
  - 경어체: 문장이 `-니다`로 끝남 (합니다/습니다/입니다/아닙니다)
  - 평서체: `아니다`(부정 예외) 또는 `-니다`가 아닌 `-다`로 끝남 (이다/간다/한다/있다)
  - 검토대상(review): 한글 종결어미 중 `-요/-죠/-까/-시오` (해요체/의문/명령 등) → 번역가 검토
  - **제외(exclude, 화면·집계 제외)**: ① 비한글 종결(영어 원문/숫자/기호) ② 명사형 종결 `-(으)ㅁ`(받침 ㅁ)·`-기` ③ 명사 종결 등 종결어미 아님
- `summary.excluded`로 제외 건수 표시(요약줄에 회색 안내).
- `checkStyle()`이 번역문 문장 분리 후 집계(평서체/경어체/검토대상/주문체/혼용여부) 반환.
- UI 순서(2026-06-29 확정): ① 용어집 미준수 결과(`#resultArea`) → ② 번역 준수 기준 용어집 편집(`.bottom`) → ③ **문체 검토(`#styleSection`) 맨 아래**. (index.html DOM 순서로 제어, JS/CSS 무관)
- `#styleSection`: 요약 칩(평서/경어/검토대상/전체) + 제외 건수 회색 안내 + 혼용 경고 + 주의 문장 표(검토대상 + 혼용 시 비주류 문체).
- 관련 파일: `server.js`(classifyStyle/splitSentences/checkStyle), `public/app.js`(renderStyle), `public/index.html`(#styleSection), `public/style.css`(.style-*).
- 안정 스냅샷: 문체 추가 직전 = `V2-glossary-stable/` (V1은 더 오래된 백업).

## 현재 구현 상태
- 원문 `.docx` + 번역문 `.docx` 업로드 가능
- `verification` 폴더에서 `용어집` 또는 `준수기준`이 포함된 `.docx`/`.xlsx` 파일 자동 로드
- 용어집에 있는 원문 용어와 기대 번역어를 기준으로 자동 검사
- 미준수 항목은 결과 화면에 원문/번역문 좌우 대응 표로 표시
- 미준수 번역문 셀은 `contentEditable`로 수정 가능
- 수정 후 `수정본 다운로드` 버튼으로 `.docx` 출력 가능
- 검수 항목에 `이전`/`다음`/`준수` 버튼 추가
- 개별 항목에 `제외` 버튼 추가, 클릭 시 해당 행을 화면에서 제거
- row별 버튼 클릭 시 기본적으로 현재 위치 유지하도록 조정됨
- 용어집 variant 파싱이 개선되어 `/` 및 `／` 구분자 처리가 강화됨

## 현재 동작 흐름
1. 브라우저에서 원문/번역문 파일 선택
2. `검수 시작` 클릭
3. `/api/check`로 파일 전송
4. 서버는 `verification` 폴더 용어집을 로드
5. 문서 텍스트 추출 및 병기/평문 분기 처리
6. `checkGlossary()`로 용어 검수 수행
7. 결과를 클라이언트에서 렌더
8. 필요 시 번역문 인라인 수정, `/api/export`로 수정본 생성

## 중요 구현 디테일
### 용어집 로드
- `loadGlossary()`는 `verification` 폴더에서 파일명에 `용어집` 또는 `준수기준`이 포함된 `.docx`/`.xlsx`만 선별
- 동일 원문 용어가 여러 행인 경우 번역어를 `/`로 병합
- `.xlsx` 파서는 `xl/sharedStrings.xml`과 `xl/worksheets/sheet*.xml`을 직접 파싱

### 문서 추출/정렬
- `extractBilingualPairs()`는 병기 `.docx`에서 EN/KO 셀을 페어로 추출
- `isBilingual()`은 병기 파일 여부 판단(EN/KO 페어 3개 이상)
- 병기 파일이면 EN/KO 페어를 그대로 사용, 아니면 단락별 평행 1:1 정렬

### 용어 검수
- `contains()`: ASCII 용어는 단어 경계, 한글은 공백 무시 substring
- `expectedVariants()`: 대상 번역어를 `, / · ／ ・`로 분리, 괄호 주석 제거, 1자 제외
- `targetHasExpected()`: 기대어 중 하나라도 등장하면 충족
- `parseUniformityRule()`: note에 `여러 용어`/`통일`이 포함되면 열거형 변형 리스트를 추출하여 혼용 시 fail 처리

### 결과 렌더
- `markupMany()`가 용어를 `<mark>`로 하이라이트
- `pairRow()`는 원문/번역문 쌍을 테이블로 생성
- `buildReviewList()`로 미준수 행을 순회 가능
- row별 `이전`/`다음`/`준수`/`제외` 버튼 추가
- `제외` 버튼 클릭 시 해당 검수 항목을 즉시 화면에서 제거

### 수정본 내보내기 한계
- `applyReplacements()`는 `word/document.xml`의 `<w:t>` 텍스트만 치환
- 머리글/바닥글/텍스트박스/다른 part는 반영되지 않을 수 있음
- 빈 셀에 새로 입력한 내용은 치환 목록으로 생성되지 않으면 반영되지 않을 수 있음

## 현재 확인된 주의 사항
- UI에서 `원문/번역 전체 좌우 뷰`는 제거되어, 용어집 기준 미준수 항목 중심 화면으로 구성됨
- `verification` 용어집 데이터 품질에 따라 검수 정확도가 달라짐
- `api/check-bilingual` 라우트는 현재 사용되지 않음
- 용어집 인라인 편집 = 구현됨. 저장은 브라우저 localStorage(`savedGlossary` 키). 검수 시 `glossaryData`를 `/api/check` FormData로 전송해 서버가 우선 사용. **기기·브라우저별 저장** — 공유 안 됨. xlsx export로 백업 가능.
- row별 클릭 시 위치 유지가 목표이나, 일부 케이스에서 자동 스크롤이 남아 있을 수 있음

## 재개 지점 (2026-06-29 종료 시점)
- **완료**: 문체(평서체/경어체) 검토 기능 추가 + 한글 문장만 대상으로 제외 규칙 적용 + UI 순서 정리(용어집 먼저, 문체 맨 아래). 사용자 화면 확인 완료.
- 코드 상태: `server.js`(classifyStyle/splitSentences/checkStyle, `out.style`), `public/app.js`(renderStyle), `public/index.html`(#styleSection이 .bottom 뒤), `public/style.css`(.style-*). 분류 단위 테스트 20/20, E2E 통과.
- 스냅샷: `V2-glossary-stable/` = 문체 추가 직전 안정본. V1 = 더 오래된 백업.

## 다음에 바로 이어서 할 작업
1. 서버 실행: `npm start`
2. `http://localhost:3000` 열기
3. `verification` 폴더에 용어집 파일(`용어집`, `준수기준` 포함)을 넣고 새로고침
4. `fixtures/source.docx` / `fixtures/target.docx`로 정상 동작 확인
5. 필요한 경우 `golden_set.md` 기준에 맞춰 UI/검수 조건 수정
6. 다음 우선 작업 후보:
   - 문체 검토: 검토대상 종결어미 화이트리스트(`요/죠/까/시오`) 확장 여부 결정 — 반말체(`-네/-지/-자/-어`) 포함할지
   - 문체 검토: 실제 번역문(병기/한역본)로 오분류 샘플 점검, 명사형 제외(-ㅁ/-기) 오탐 확인
   - row별 검수 버튼의 위치 유지 동작 완전히 고정
   - 용어집 편집 및 저장 기능 강화
   - 미준수 항목 highlight/`발급` variant 검증 버그 수정
   - 결과 상태 표시 정리

## 배포 아키텍처 (2026-07-02)
Express 앱을 Vercel 서버리스 함수로 실행.
- `vercel.json`: 모든 요청(`/(.*)`)을 `server.js`로 라우팅(@vercel/node). `includeFiles`로 `verification/**`, `public/**`, `gemini.js`를 함수 번들에 포함(런타임 fs 읽기 때문).
- `server.js` 하단: `if (!process.env.VERCEL) app.listen(...)` — Vercel에선 listen 생략하고 `module.exports = app`. 로컬은 그대로 listen.
- `public/app.js` 저장 핸들러: `/api/save-glossary` 서버 호출 제거 → localStorage만 저장(서버리스 디스크는 읽기 전용).
- **환경변수(Vercel Production에 등록됨)**: `GEMINI_API_KEY`, `GEMINI_MODEL`. 로컬 값은 `.env`(gitignore됨)에 있음. Vercel엔 `npx vercel env add ... production`으로 등록.

### 배포 관련 한계 / 미완
- **서버리스 디스크 읽기 전용**: `/api/save-glossary`([server.js:924])는 fs.writeFileSync 하므로 Vercel에서 여전히 실패. 프론트가 더 이상 호출 안 해서 무해하나, 라우트 자체는 죽은 코드로 남아있음. 서버 영구 저장이 필요하면 Vercel Blob/KV로 교체 필요.
- **GitHub 자동배포 미연결**: `vercel link` 시 repo 연결 실패(Vercel GitHub 앱 권한/미설치). 지금은 `npx vercel --prod` 수동 재배포만 가능. 자동배포 원하면 Vercel 대시보드 → 프로젝트 → Settings → Git에서 repo 연결.
- 인증: 로컬에 Vercel CLI 로그인 세션 저장됨. `.env.local`(OIDC 토큰)이 link 과정에서 생성됨 — gitignore 등록됨.
- 커밋에 `V1/`, `V2-glossary-stable/` 구버전 폴더 포함됨(용량 큼, Vercel 빌드는 루트 `server.js`만 사용해 무해). 정리하려면 별도 커밋으로 gitignore 추가.

## 재개 지점 (2026-07-02 종료 시점)
- **완료**: Vercel 프로덕션 배포. 라이브 https://translator-s-helper.vercel.app (홈 200, `/api/glossary` 실데이터 반환 확인). 용어집 편집을 localStorage 기반으로 전환해 서버리스에서 작동하게 수정. GitHub `main`에 푸시 완료.
- **검증됨**: 홈페이지 로드, glossary API가 번들된 `번역준수기준(용어집).xlsx` 파싱 반환. 문법 체크 + VERCEL export 가드 테스트 통과.
- **아직 안 함(선택)**: 실제 .docx 업로드 E2E를 라이브에서 눈으로 확인 / GitHub 자동배포 연결 / save-glossary 죽은 라우트 정리 / 서버측 용어집 영구 저장(Blob/KV).

### 다음에 바로 이어서 할 후보 (배포 관련)
1. 라이브에서 원문/번역 .docx 업로드 → 검수 → 편집 → 재검수 E2E 눈 확인
2. GitHub 자동배포 연결(대시보드에서 repo 연결) → push 시 자동 배포
3. 용어집 서버 영구·공유 저장 원하면 Vercel Blob 도입(현재는 브라우저별 localStorage만)
4. `V1/`, `V2-glossary-stable/` repo에서 제외(gitignore) — 용량 정리

## 참고
- 현재 작업 상태는 `golden_set.md`와 `loop-log.md`에 정리되어 있음
- 서버가 실행 중이면 브라우저에서 바로 확인 가능
- `package.json`은 단순 `npm start` 실행 스크립트만 포함
