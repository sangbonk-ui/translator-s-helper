// Gemini API 호출 (REST, 의존성 없음 — Node 내장 fetch 사용)
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const KEY = process.env.GEMINI_API_KEY || '';

function hasKey() {
  return KEY.trim().length > 0;
}

async function generate(prompt, { json = true } = {}) {
  if (!hasKey()) throw new Error('GEMINI_API_KEY 미설정');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return text;
}

// note 유형 기준 1건을 판정. 위반 표현 목록 반환.
// criterion: 기준 텍스트, term: 원문 용어, srcParas/tgtParas: 발췌 단락 배열
async function judgeNoteRule({ term, criterion, srcParas, tgtParas }) {
  const prompt = `너는 한영 번역 검수자다. 아래 "번역 준수 기준"을 번역문이 지켰는지 판정하라.

[원문 용어] ${term}
[준수 기준] ${criterion}

[원문 발췌]
${srcParas.map((p, i) => `(S${i + 1}) ${p}`).join('\n') || '(없음)'}

[번역문 발췌]
${tgtParas.map((p, i) => `(T${i + 1}) ${p}`).join('\n') || '(없음)'}

기준을 위반한 "번역문" 표현만 골라라. 위반이 없으면 빈 배열.
반드시 아래 JSON 스키마로만 답하라:
{"violations":[{"target_excerpt":"위반된 번역문 구절(짧게)","problem":"무엇이 기준 위반인지","suggestion":"수정 제안"}]}`;

  const raw = await generate(prompt, { json: true });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // JSON 강제 실패 시 빈 결과로 처리(앱 안 멈춤)
    return { violations: [], parseError: raw.slice(0, 200) };
  }
  return { violations: Array.isArray(parsed.violations) ? parsed.violations : [] };
}

module.exports = { hasKey, generate, judgeNoteRule, MODEL };
