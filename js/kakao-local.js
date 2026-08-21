/**
 * kakao-local.js — 카카오 로컬 API(키워드 검색) 통신 전담.
 *
 * 이 파일은 DOM을 건드리지 않는다. 렌더링/이벤트/저장은 `collect.js`가 담당한다.
 * 카카오 REST API 키는 브라우저에 없다 — `api/kakao-search.js`(서버) 안에만 있다.
 * 이 파일은 그 서버 엔드포인트만 호출한다(카카오를 직접 호출하지 않는다).
 * 번들러 없이 전역 변수로 주고받으므로 `collect.js`보다 먼저 로드되어야 한다.
 */
(function () {
  const PROXY_ENDPOINT = "/api/kakao-search";

  // 카테고리 그룹 코드 (FD6: 음식점, CE7: 카페)
  const CATEGORY_GROUP_CODE = {
    FOOD: "FD6",
    CAFE: "CE7",
  };

  // 카카오 키워드 검색은 page * size 가 45를 넘으면 에러를 돌려준다.
  const MAX_RESULT_COUNT = 45;
  const DEFAULT_SIZE = 15;

  // 사용자에게 보여줄 문구는 여기서 확정한다(설정 문제 / 키 문제 / 네트워크 문제를 구분).
  const ERROR_MESSAGE = {
    NO_PROXY:
      "/api/kakao-search 를 찾을 수 없어요. `vercel dev`로 로컬에서 켜거나, Vercel에 배포된 주소로 접속해주세요(정적 서버로는 이 API가 동작하지 않습니다).",
    NO_KEY:
      "서버에 카카오 API 키가 설정되지 않았어요. Vercel 프로젝트 Settings → Environment Variables에 KAKAO_REST_API_KEY를 추가해주세요. 로컬(`vercel dev`)에서는 저장소 루트 .env에 같은 키를 넣어두면 자동으로 읽힙니다.",
    AUTH: "API 키가 유효하지 않거나 플랫폼 등록이 필요합니다. 카카오 developers에서 REST API 키를 확인해주세요.",
    RATE_LIMIT: "요청이 너무 많아요. 잠시 후 다시 시도해주세요.",
    NETWORK: "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.",
    SERVER: "카카오 서버에서 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.",
  };

  function createError(code) {
    const error = new Error(ERROR_MESSAGE[code] || ERROR_MESSAGE.SERVER);
    error.code = code;
    return error;
  }

  // 프록시 응답이 실패(!ok)일 때 상태 코드 + 바디로 에러를 구분한다.
  function errorFromResponse(status, body) {
    if (status === 404) return createError("NO_PROXY");
    if (status === 500 && body && body.error === "NO_KEY") return createError("NO_KEY");
    if (status === 401 || status === 403) return createError("AUTH");
    if (status === 429) return createError("RATE_LIMIT");
    if (status === 502) return createError("NETWORK");
    return createError("SERVER");
  }

  /**
   * 검색 가능한 상태인지 미리 확인한다(카카오 쿼터를 쓰지 않는 가벼운 ping).
   * collect.js가 페이지 로드 직후 안내 문구를 고르는 데 쓴다.
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
      let body = null;
      try {
        body = await response.json();
      } catch (e) {
        // 본문이 JSON이 아니면(예: 정적 서버가 404 HTML을 돌려줄 때) 무시한다.
      }
      const error = errorFromResponse(response.status, body);
      return { ok: false, code: error.code, message: error.message };
    }

    return { ok: true, code: null, message: "" };
  }

  // 응답 문서 하나를 화면에서 쓰기 좋은 형태로 정규화한다.
  function normalizePlace(doc) {
    // category_name은 "음식점 > 한식 > 국밥" 형태라 마지막 조각만 쓴다.
    const categoryParts = (doc.category_name || "").split(">");
    const distance = Number(doc.distance);

    return {
      id: doc.id || "",
      name: doc.place_name || "",
      category: (categoryParts[categoryParts.length - 1] || "").trim(),
      // 도로명 주소 우선, 없으면 지번 주소
      address: doc.road_address_name || doc.address_name || "",
      phone: doc.phone || "",
      // 좌표 없이 검색하면 거리는 빈 값으로 온다 — 이때는 null로 두고 화면에서 숨긴다.
      distance: Number.isFinite(distance) && doc.distance !== "" ? distance : null,
      placeUrl: doc.place_url || "",
      // 카카오는 x=경도, y=위도를 문자열로 준다. 구글 리뷰 검색(반경 매칭)에 쓴다.
      lat: Number(doc.y) || null,
      lng: Number(doc.x) || null,
    };
  }

  /**
   * 키워드로 장소를 검색한다.
   * @param {{query: string, page?: number, size?: number, categoryGroupCode?: string}} options
   * @returns {Promise<{places: Array, isEnd: boolean, totalCount: number}>}
   */
  async function searchKeyword(options) {
    const opts = options || {};
    const query = (opts.query || "").trim();
    const page = opts.page || 1;
    const size = opts.size || DEFAULT_SIZE;

    // 검색어가 없으면 네트워크 호출 없이 빈 결과로 끝낸다.
    if (query === "") {
      return { places: [], isEnd: true, totalCount: 0 };
    }

    // 45개 상한을 넘어서면 카카오가 에러를 주므로 그 전에 마지막 페이지로 처리한다.
    if ((page - 1) * size >= MAX_RESULT_COUNT) {
      return { places: [], isEnd: true, totalCount: 0 };
    }

    const params = new URLSearchParams({
      query: query,
      page: String(page),
      size: String(size),
    });
    if (opts.categoryGroupCode) {
      params.set("category_group_code", opts.categoryGroupCode);
    }

    let response;
    try {
      response = await fetch(PROXY_ENDPOINT + "?" + params.toString());
    } catch (e) {
      throw createError("NETWORK");
    }

    if (!response.ok) {
      let body = null;
      try {
        body = await response.json();
      } catch (e) {
        // 본문이 JSON이 아니어도(예: 정적 서버의 404 HTML) 상태 코드만으로 처리한다.
      }
      throw errorFromResponse(response.status, body);
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw createError("SERVER");
    }

    const documents = Array.isArray(data.documents) ? data.documents : [];
    const meta = data.meta || {};
    // 45개 상한에 걸리면 meta.is_end가 false여도 더 못 가져오므로 함께 따진다.
    const reachedLimit = page * size >= MAX_RESULT_COUNT;

    return {
      places: documents.map(normalizePlace),
      isEnd: meta.is_end !== false || reachedLimit,
      totalCount: meta.total_count || 0,
    };
  }

  window.KakaoLocal = {
    searchKeyword: searchKeyword,
    checkApiKey: checkApiKey,
    CATEGORY_GROUP_CODE: CATEGORY_GROUP_CODE,
    DEFAULT_SIZE: DEFAULT_SIZE,
    ERROR_MESSAGE: ERROR_MESSAGE,
  };
})();
