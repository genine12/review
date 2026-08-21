/**
 * api/gemini-analyze.js — Vercel Serverless Function.
 *
 * 구글 리뷰 텍스트를 Gemini에 보내 감정 분류/키워드/한줄 요약을 받아오는 프록시.
 * Gemini API 키는 여기(서버 환경변수 `GEMINI_API_KEY`)에만 존재하고
 * 브라우저로는 절대 내려가지 않는다. 클라이언트(js/gemini-analyze.js)는 이 엔드포인트만 호출한다.
 *
 * 다른 두 프록시(api/kakao-search.js, api/google-reviews.js)는 GET + 쿼리스트링이지만,
 * 이 프록시는 리뷰 배열(구조화된 payload)을 보내야 해서 POST + JSON body를 쓴다.
 *
 * 환경변수 설정:
 * - 배포: Vercel 프로젝트 → Settings → Environment Variables → GEMINI_API_KEY
 * - 로컬(`vercel dev` 또는 scripts/dev-server.js): 저장소 루트 `.env`(gitignore됨)에
 *   GEMINI_API_KEY=... 를 넣어두면 자동으로 읽힌다.
 */
const MODEL = "gemini-3.6-flash";
const GENERATE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
// 리뷰가 몇 개 없어도 억지로 채우지 않도록 개수는 프롬프트로만 유도하고, 상한만 스키마로 강제한다.
const MAX_KEYWORDS = 15;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    sentiments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          sentiment: { type: "STRING", enum: ["positive", "neutral", "negative"] },
        },
        required: ["index", "sentiment"],
      },
    },
    keywords: {
      type: "ARRAY",
      maxItems: MAX_KEYWORDS,
      items: {
        type: "OBJECT",
        properties: {
          word: { type: "STRING" },
          score: { type: "INTEGER" },
          context: { type: "STRING", enum: ["positive", "negative"] },
        },
        required: ["word", "score", "context"],
      },
    },
    summary: { type: "STRING" },
  },
  required: ["sentiments", "keywords", "summary"],
};

function buildPrompt(reviews) {
  const reviewLines = reviews
    .map((r, i) => `[${i}] 평점 ${r.rating ?? "?"}점: ${r.text || "(내용 없음)"}`)
    .join("\n");

  return `당신은 음식점 리뷰 분석가입니다. 아래는 한 음식점의 구글 리뷰입니다(번호는 입력 순서와 동일).

${reviewLines}

다음 세 가지를 분석하세요:
1. 각 리뷰의 감정을 positive/neutral/negative 중 하나로 분류하세요. sentiments 배열의 각 항목은 원래 리뷰의 번호(index)와 짝지어야 합니다.
2. 리뷰에 실제로 등장하는 내용에 근거해서 음식 이름/맛/분위기/서비스 위주의 핵심 단어를 8~15개 뽑으세요(리뷰가 적어 근거가 부족하면 8개보다 적어도 됩니다 — 없는 내용을 지어내지 마세요). 각 단어마다 1~10점의 중요도(score)와, 그 단어가 주로 긍정적 맥락(positive)인지 부정적 맥락(negative)인지를 정하세요.
3. 이 가게에 대한 리뷰 전체를 한국어 한 문장으로 요약하세요.

반드시 지정된 JSON 스키마 형식으로만 응답하세요.`;
}

module.exports = async (req, res) => {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    res.status(500).json({ error: "NO_KEY" });
    return;
  }

  // 키 설정 여부만 가볍게 확인할 때 쓴다(쿼터를 쓰지 않는다).
  if (req.query && req.query.ping) {
    res.status(200).json({ ok: true });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = null;
    }
  }

  const reviews = body && Array.isArray(body.reviews) ? body.reviews : [];
  if (reviews.length === 0) {
    res.status(400).json({ error: "BAD_REQUEST" });
    return;
  }

  let geminiRes;
  try {
    geminiRes = await fetch(GENERATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(reviews) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch (e) {
    res.status(502).json({ error: "NETWORK" });
    return;
  }

  let data;
  try {
    data = await geminiRes.json();
  } catch (e) {
    data = null;
  }

  if (!geminiRes.ok) {
    res.status(geminiRes.status).json(data || { error: "SERVER" });
    return;
  }

  const rawText =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    res.status(500).json({ error: "PARSE_ERROR" });
    return;
  }

  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  const bySentiment = Array.isArray(parsed.sentiments) ? parsed.sentiments : [];
  reviews.forEach((_, i) => {
    const found = bySentiment.find((s) => s.index === i);
    const sentiment = found && sentimentCounts[found.sentiment] !== undefined ? found.sentiment : "neutral";
    sentimentCounts[sentiment] += 1;
  });

  const keywords = (Array.isArray(parsed.keywords) ? parsed.keywords : [])
    .filter((k) => k && k.word)
    .slice(0, MAX_KEYWORDS)
    .map((k) => ({
      word: String(k.word),
      score: Number.isFinite(k.score) ? Math.max(1, Math.min(10, Math.round(k.score))) : 5,
      context: k.context === "negative" ? "negative" : "positive",
    }));

  res.status(200).json({
    sentimentCounts: sentimentCounts,
    keywords: keywords,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
  });
};
