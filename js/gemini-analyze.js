/**
 * gemini-analyze.js — 리뷰 AI 분석(Gemini) 통신 전담.
 *
 * 이 파일은 DOM을 건드리지 않는다. 렌더링/이벤트/캐시는 `collect.js`가 담당한다.
 * Gemini API 키는 브라우저에 없다 — `api/gemini-analyze.js`(서버) 안에만 있다.
 * 이 파일은 그 서버 엔드포인트만 호출한다(Gemini를 직접 호출하지 않는다).
 * 번들러 없이 전역 변수로 주고받으므로 `collect.js`보다 먼저 로드되어야 한다.
 */
(function () {
  const PROXY_ENDPOINT = "/api/gemini-analyze";

  const ERROR_MESSAGE = {
    NO_PROXY:
      "/api/gemini-analyze 를 찾을 수 없어요. `vercel dev` 또는 scripts/dev-server.js로 로컬에서 켜거나, Vercel에 배포된 주소로 접속해주세요.",
    NO_KEY:
      "서버에 Gemini API 키가 설정되지 않았어요. Vercel 프로젝트 Settings → Environment Variables에 GEMINI_API_KEY를 추가해주세요. 로컬에서는 저장소 루트 .env에 같은 키를 넣어두면 자동으로 읽힙니다.",
    BAD_REQUEST: "분석할 리뷰가 없어요.",
    AUTH: "Gemini API 키가 유효하지 않아요. 키를 확인해주세요.",
    RATE_LIMIT: "요청이 너무 많아요. 잠시 후 다시 시도해주세요.",
    NETWORK: "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.",
    SERVER: "AI 분석 서버에서 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.",
    PARSE_ERROR: "AI 응답을 해석하지 못했어요. 잠시 후 다시 시도해주세요.",
  };

  function createError(code) {
    const error = new Error(ERROR_MESSAGE[code] || ERROR_MESSAGE.SERVER);
    error.code = code;
    return error;
  }

  function errorFromResponse(status, body) {
    if (status === 404) return createError("NO_PROXY");
    if (status === 500 && body && body.error === "NO_KEY") return createError("NO_KEY");
    if (status === 500 && body && body.error === "PARSE_ERROR") return createError("PARSE_ERROR");
    if (status === 400) return createError("BAD_REQUEST");
    if (status === 401 || status === 403) return createError("AUTH");
    if (status === 429) return createError("RATE_LIMIT");
    if (status === 502) return createError("NETWORK");
    return createError("SERVER");
  }

  async function parseJsonSafe(response) {
    try {
      return await response.json();
    } catch (e) {
      return null;
    }
  }

  /**
   * 분석 가능한 상태인지 미리 확인한다(쿼터를 쓰지 않는 가벼운 ping).
   * @returns {Promise<{ok: boolean, code: string|null, message: string}>}
   */
  async function checkApiKey() {
    let response;
    try {
      response = await fetch(PROXY_ENDPOINT + "?ping=1");
    } catch (e) {
      return { ok: false, code: "NETWORK", message: ERROR_MESSAGE.NETWORK };
    }

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      const error = errorFromResponse(response.status, body);
      return { ok: false, code: error.code, message: error.message };
    }

    return { ok: true, code: null, message: "" };
  }

  /**
   * 리뷰 목록을 Gemini로 분석한다.
   * @param {Array<{rating: number|null, text: string}>} reviews
   * @returns {Promise<{sentimentCounts: {positive:number,neutral:number,negative:number}, keywords: Array, summary: string}>}
   */
  async function analyzeReviews(reviews) {
    const list = Array.isArray(reviews) ? reviews : [];
    if (list.length === 0) {
      throw createError("BAD_REQUEST");
    }

    let response;
    try {
      response = await fetch(PROXY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviews: list.map((r) => ({ rating: r.rating, text: r.text })),
        }),
      });
    } catch (e) {
      throw createError("NETWORK");
    }

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw errorFromResponse(response.status, body);
    }

    const data = await parseJsonSafe(response);
    if (!data) throw createError("SERVER");

    const counts = data.sentimentCounts || {};
    return {
      sentimentCounts: {
        positive: Number(counts.positive) || 0,
        neutral: Number(counts.neutral) || 0,
        negative: Number(counts.negative) || 0,
      },
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      summary: data.summary || "",
    };
  }

  window.GeminiAnalyze = {
    analyzeReviews: analyzeReviews,
    checkApiKey: checkApiKey,
    ERROR_MESSAGE: ERROR_MESSAGE,
  };
})();
