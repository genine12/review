/**
 * google-reviews.js — 구글 리뷰(별점/후기) 통신 전담.
 *
 * 이 파일은 DOM을 건드리지 않는다. 렌더링/이벤트/캐시는 `collect.js`가 담당한다.
 * 구글 API 키는 브라우저에 없다 — `api/google-reviews.js`(서버) 안에만 있다.
 * 이 파일은 그 서버 엔드포인트만 호출한다(구글을 직접 호출하지 않는다).
 * 번들러 없이 전역 변수로 주고받으므로 `collect.js`보다 먼저 로드되어야 한다.
 */
(function () {
  const PROXY_ENDPOINT = "/api/google-reviews";

  const ERROR_MESSAGE = {
    NO_PROXY:
      "/api/google-reviews 를 찾을 수 없어요. `vercel dev`로 로컬에서 켜거나, Vercel에 배포된 주소로 접속해주세요(정적 서버로는 이 API가 동작하지 않습니다).",
    NO_KEY:
      "서버에 구글 API 키가 설정되지 않았어요. Vercel 프로젝트 Settings → Environment Variables에 GOOGLE_PLACES_API_KEY를 추가해주세요. 로컬(`vercel dev`)에서는 저장소 루트 .env에 같은 키를 넣어두면 자동으로 읽힙니다.",
    NOT_FOUND: "구글맵에서 이 가게를 찾지 못했어요.",
    AUTH: "구글 API 키가 유효하지 않거나 Places API(New) 활성화가 필요합니다. Google Cloud Console에서 확인해주세요.",
    BAD_REQUEST: "가게 이름 또는 좌표 정보가 올바르지 않아요.",
    RATE_LIMIT: "요청이 너무 많아요. 잠시 후 다시 시도해주세요.",
    NETWORK: "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.",
    SERVER: "구글 서버에서 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.",
  };

  function createError(code) {
    const error = new Error(ERROR_MESSAGE[code] || ERROR_MESSAGE.SERVER);
    error.code = code;
    return error;
  }

  // 프록시 응답이 실패(!ok)일 때 상태 코드 + 바디로 에러를 구분한다.
  function errorFromResponse(status, body) {
    if (status === 404) return createError("NOT_FOUND");
    if (status === 500 && body && body.error === "NO_KEY") return createError("NO_KEY");
    if (status === 401 || status === 403) return createError("AUTH");
    if (status === 429) return createError("RATE_LIMIT");
    if (status === 502) return createError("NETWORK");
    if (status === 400) {
      // 서버(api/google-reviews.js)가 자체적으로 걸러낸 400은 { error: "BAD_REQUEST" } (문자열).
      // 그 외 400은 구글이 돌려준 에러(주로 API 키/설정 문제)라 { error: {...} } (객체) 형태로 온다.
      if (body && body.error === "BAD_REQUEST") return createError("BAD_REQUEST");
      return createError("AUTH");
    }
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
   * 검색 가능한 상태인지 미리 확인한다(구글 쿼터를 쓰지 않는 가벼운 ping).
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
      const error = status404ToNoProxy(response.status, body);
      return { ok: false, code: error.code, message: error.message };
    }

    return { ok: true, code: null, message: "" };
  }

  // ping 응답에서만 404를 "프록시 없음"으로 해석한다(검색 응답의 404는 NOT_FOUND라 별도 처리).
  function status404ToNoProxy(status, body) {
    if (status === 404) return createError("NO_PROXY");
    return errorFromResponse(status, body);
  }

  /**
   * 좌표 근처에서 이름으로 가게를 찾아 별점/리뷰를 가져온다.
   * @param {{name: string, lat: number, lng: number}} options
   * @returns {Promise<{name: string, rating: number|null, reviewCount: number, googleMapsUrl: string, reviews: Array}>}
   */
  async function fetchReviews(options) {
    const opts = options || {};
    const name = (opts.name || "").trim();
    const lat = Number(opts.lat);
    const lng = Number(opts.lng);

    if (name === "" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw createError("NOT_FOUND");
    }

    const params = new URLSearchParams({
      name: name,
      lat: String(lat),
      lng: String(lng),
    });

    let response;
    try {
      response = await fetch(PROXY_ENDPOINT + "?" + params.toString());
    } catch (e) {
      throw createError("NETWORK");
    }

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw errorFromResponse(response.status, body);
    }

    const data = await parseJsonSafe(response);
    if (!data) throw createError("SERVER");

    return {
      name: data.name || name,
      rating: typeof data.rating === "number" ? data.rating : null,
      reviewCount: typeof data.reviewCount === "number" ? data.reviewCount : 0,
      googleMapsUrl: data.googleMapsUrl || "",
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
    };
  }

  window.GoogleReviews = {
    fetchReviews: fetchReviews,
    checkApiKey: checkApiKey,
    ERROR_MESSAGE: ERROR_MESSAGE,
  };
})();
