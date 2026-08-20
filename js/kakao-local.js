/**
 * kakao-local.js — 카카오 로컬 API(키워드 검색) 통신 전담.
 *
 * 이 파일은 DOM을 건드리지 않는다. 렌더링/이벤트/저장은 `collect.js`가 담당한다.
 * 번들러 없이 전역 변수로 주고받으므로 `env.js` 다음, `collect.js` 앞에 로드되어야 한다.
 * API 키는 `.env`(= window.Env)에서만 읽고, 이 파일에 하드코딩하지 않는다.
 * `.env` 로딩이 비동기이므로 키가 필요한 함수는 모두 Promise를 반환한다.
 */
(function () {
  const ENDPOINT = "https://dapi.kakao.com/v2/local/search/keyword.json";

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
    ENV_UNREADABLE:
      ".env 파일을 읽지 못했어요. .env.example을 .env로 복사해 키를 입력한 뒤, file:// 로 직접 열지 말고 로컬 서버(http://localhost:8000)로 접속해주세요.",
    NO_KEY: ".env의 KAKAO_REST_API_KEY에 카카오 REST API 키를 입력해주세요.",
    AUTH: "API 키가 유효하지 않거나 플랫폼 등록이 필요합니다. 카카오 developers에서 REST API 키와 웹 플랫폼 등록을 확인해주세요.",
    RATE_LIMIT: "요청이 너무 많아요. 잠시 후 다시 시도해주세요.",
    NETWORK:
      "카카오 서버에 연결하지 못했어요. 인터넷 연결을 확인하고, 파일을 직접 여는 대신 http://localhost:8000 으로 접속했는지 확인해주세요.",
    SERVER: "카카오 서버에서 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.",
  };

  // `.env`에서 키를 얻는다. 못 읽었는지 / 읽었는데 비었는지를 구분해 에러로 던진다.
  async function ensureApiKey() {
    if (!window.Env) throw createError("ENV_UNREADABLE");

    const env = await window.Env.load();
    if (!env.ok) throw createError("ENV_UNREADABLE");

    const key = (env.values.KAKAO_REST_API_KEY || "").trim();
    if (key === "") throw createError("NO_KEY");

    return key;
  }

  /**
   * 키를 쓸 수 있는 상태인지 미리 확인한다(던지지 않고 결과로 돌려준다).
   * collect.js가 페이지 로드 직후 안내 문구를 고르는 데 쓴다.
   * @returns {Promise<{ok: boolean, code: string|null, message: string}>}
   */
  async function checkApiKey() {
    try {
      await ensureApiKey();
      return { ok: true, code: null, message: "" };
    } catch (error) {
      return { ok: false, code: error.code || "SERVER", message: error.message };
    }
  }

  function createError(code) {
    const error = new Error(ERROR_MESSAGE[code] || ERROR_MESSAGE.SERVER);
    error.code = code;
    return error;
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

    // 키를 못 얻으면 여기서 던지므로 카카오로 요청이 나가지 않는다.
    const key = await ensureApiKey();

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
      response = await fetch(ENDPOINT + "?" + params.toString(), {
        headers: { Authorization: "KakaoAK " + key },
      });
    } catch (e) {
      // fetch 자체가 실패한 경우 = 네트워크 단절이거나, file://로 열어 CORS에 막힌 경우
      throw createError("NETWORK");
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw createError("AUTH");
      if (response.status === 429) throw createError("RATE_LIMIT");
      throw createError("SERVER");
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
