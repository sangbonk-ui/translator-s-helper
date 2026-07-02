# HANDOFF — 번역 준수 검수 웹앱 (작업 이어가기용)

> 이 파일을 읽으면 바로 실행하고, 현재 구현 상태를 이해할 수 있도록 정리했습니다.
> 마지막 갱신: 2026-06-22.

## 개요
- 프로젝트: 식약처 가축검역 설문서 번역 준수 검수 웹앱
- 역할: 원문/번역문 `.docx` 업로드 → `verification` 폴더 용어집 기준으로 용어 준수 검사 → 미준수 항목 좌우 대응 표시
- 평가 기준: 용어집 항목(term/note) 기반 검사, 기본적으로 `.docx`만 지원

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

## 현재 구현 상태
- 원문 `.docx` + 번역문 `.docx` 업로드 가능
- `verification` 폴더에서 `용어집` 또는 `준수기준`이 포함된 `.docx`/`.xlsx` 파일 자동 로드
- 용어집에 있는 원문 용어와 기대 번역어를 기준으로 자동 검사
- 미준수 항목은 결과 화면에 원문/번역문 좌우 대응 표로 표시
- 미준수 번역문 셀은 `contentEditable`로 수정 가능
- 수정 후 `수정본 다운로드` 버튼으로 `.docx` 출력 가능
- 잘못된 파일 형식 또는 누락된 입력 시 오류 안내 처리

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
- `expectedVariants()`: 대상 번역어를 `, / ·`로 분리, 괄호 주석 제거, 1자 제외
- `targetHasExpected()`: 기대어 중 하나라도 등장하면 충족
- `parseUniformityRule()`: note에 `여러 용어`/`통일`이 포함되면 열거형 변형 리스트를 추출하여 혼용 시 fail 처리

### 결과 렌더
- `markupMany()`가 용어를 `<mark>`로 하이라이트
- `pairRow()`는 원문/번역문 쌍을 테이블로 생성
- 수정본 다운로드는 `editable-view`의 원본/수정본을 비교하여 치환 목록 생성

### 수정본 내보내기 한계
- `applyReplacements()`는 `word/document.xml`의 `<w:t>` 텍스트만 치환
- 머리글/바닥글/텍스트박스/다른 part는 반영되지 않을 수 있음
- 빈 셀에 새로 입력한 내용은 치환 목록으로 생성되지 않으면 반영되지 않을 수 있음

## 현재 확인된 주의 사항
- `public/index.html`은 오른쪽 번역문 슬롯에만 `검수 시작` 버튼을 둠
- 실제 UI는 결과 영역에 좌우 대응 표로 표현되므로, 완전한 화면 좌우 배치는 아니지만 기능적으로 검수 결과를 표시함
- `verification` 용어집 데이터 품질에 따라 검수 정확도가 달라짐
- `api/check-bilingual` 라우트는 현재 사용되지 않음

## 다음에 바로 이어서 할 작업
1. 서버 실행: `npm start`
2. `http://localhost:3000` 열기
3. `verification` 폴더에 용어집 파일(`용어집`, `준수기준` 포함)을 넣고 새로고침
4. `fixtures/source.docx` / `fixtures/target.docx`로 정상 동작 확인
5. 필요한 경우 `golden_set.md` 기준에 맞춰 UI/검수 조건 수정
6. 이후 작업: 분리 문서 유사도 정렬, 사용 안 하는 코드 정리, `export` 안정성 점검

## 참고
- 현재 작업 상태는 `golden_set.md`와 `loop-log.md`에 정리되어 있음
- 서버가 실행 중이면 브라우저에서 바로 확인 가능
- `package.json`은 단순 `npm start` 실행 스크립트만 포함
