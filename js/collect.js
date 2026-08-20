/**
 * collect.js — 맛집 담기 페이지의 DOM 렌더링 / 이벤트 / localStorage 담당.
 *
 * API 통신은 `kakao-local.js`(window.KakaoLocal)에 맡기고 여기서는 fetch를 직접 하지 않는다.
 * 상태 표현은 `.is-*` 클래스와 `hidden` 속성만 사용한다(인라인 스타일 금지).
 */
(function () {
  const searchForm = document.getElementById("collect-form");
  const searchInput = document.getElementById("collect-input");
  const categoriesBox = document.getElementById("collect-categories");
  const statusBox = document.getElementById("collect-status");
  const resultsBox = document.getElementById("collect-results");
  const savedCount = document.getElementById("collect-saved-count");
  const savedList = document.getElementById("collect-saved-list");
  const moreButton = document.getElementById("collect-more");

  const STORAGE_KEY = "mideok.collect.saved.v1";

  // 검색어에 덧붙는 보조 키워드 + 카테고리 그룹 코드
  const CATEGORY_FILTERS = [
    { label: "전체", keyword: "", code: "FOOD" },
    { label: "한식", keyword: "한식", code: "FOOD" },
    { label: "일식", keyword: "일식", code: "FOOD" },
    { label: "중식", keyword: "중식", code: "FOOD" },
    { label: "양식", keyword: "양식", code: "FOOD" },
    { label: "카페", keyword: "카페", code: "CAFE" },
  ];

  const STATUS_TEXT = {
    CONFIG_LOADING: "설정을 불러오는 중이에요...",
    LOADING: "맛집을 찾는 중이에요...",
    EMPTY_RESULT: "검색 결과가 없어요. 다른 키워드로 찾아보세요.",
    NEED_KEYWORD: "지역이나 음식 이름으로 검색해보세요. 예) 성수 파스타",
    NO_LOADER: "설정을 읽는 스크립트를 불러오지 못했어요. 페이지를 새로고침해주세요.",
  };

  let activeFilter = CATEGORY_FILTERS[0];
  let currentQuery = "";
  let currentPage = 1;
  let savedPlaces = loadSaved();
  // 사용자가 검색을 시작했는지. `.env` 로딩이 늦게 끝나도 검색 결과를 덮어쓰지 않기 위해 본다.
  let hasSearched = false;
  // 가장 최신 요청만 화면에 반영한다(늦게 도착한 이전 응답이 결과를 덮는 것을 막는다).
  let requestToken = 0;
  // 현재 결과에 그려둔 장소 원본. 담기 버튼을 누를 때 화면 문자열이 아니라 이 값을 저장한다.
  const renderedPlaces = new Map();

  /* ---------- 공통 유틸 ---------- */

  // 외부 API에서 온 문자열이라 마크업에 넣기 전에 escape 한다.
  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDistance(meters) {
    if (meters == null) return "";
    if (meters < 1000) return meters + "m";
    return (meters / 1000).toFixed(1) + "km";
  }

  /* ---------- 상태 메시지 (.collect-status) ---------- */

  function showStatus(type, message) {
    statusBox.classList.remove("is-loading", "is-error", "is-empty");
    statusBox.classList.add(type);
    statusBox.textContent = message;
    statusBox.hidden = false;
  }

  function hideStatus() {
    statusBox.classList.remove("is-loading", "is-error", "is-empty");
    statusBox.textContent = "";
    statusBox.hidden = true;
  }

  /**
   * `.env` 로딩은 비동기라서 페이지가 뜬 직후엔 키를 알 수 없다.
   * 결과 Promise를 한 번만 만들어 재사용하므로, 로딩이 끝나기 전에 검색을 눌러도
   * 실패하지 않고 로딩 완료를 기다린 뒤 이어서 진행된다.
   * @returns {Promise<{ok: boolean, code: string|null, message: string}>}
   */
  let envState = null;

  function ensureEnvReady() {
    if (!envState) {
      envState = window.KakaoLocal
        ? window.KakaoLocal.checkApiKey()
        : Promise.resolve({ ok: false, code: "NO_LOADER", message: STATUS_TEXT.NO_LOADER });
    }
    return envState;
  }

  /* ---------- localStorage ---------- */

  function loadSaved() {
    // 시크릿 모드 등에서 localStorage 접근이 막혀도 페이지가 죽지 않게 감싼다.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function persistSaved() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPlaces));
    } catch (e) {
      // 저장에 실패해도 화면 동작은 그대로 유지한다.
    }
  }

  function isSaved(id) {
    return savedPlaces.some((place) => place.id === id);
  }

  /* ---------- 카드 렌더링 ---------- */

  function createCard(place) {
    renderedPlaces.set(place.id, place);

    const card = document.createElement("article");
    card.className = "collect-card";
    card.dataset.id = place.id;

    const distanceText = formatDistance(place.distance);
    const saved = isSaved(place.id);

    card.innerHTML = `
      <div class="collect-card__body">
        <h3 class="collect-card__name">${escapeHTML(place.name)}</h3>
        <p class="collect-card__category"${place.category ? "" : " hidden"}>${escapeHTML(place.category)}</p>
        <p class="collect-card__address"${place.address ? "" : " hidden"}>${escapeHTML(place.address)}</p>
        <p class="collect-card__phone"${place.phone ? "" : " hidden"}>${escapeHTML(place.phone)}</p>
        <p class="collect-card__distance"${distanceText ? "" : " hidden"}>${escapeHTML(distanceText)}</p>
        <a class="collect-card__link" href="${escapeHTML(place.placeUrl)}" target="_blank" rel="noopener"${place.placeUrl ? "" : " hidden"}>카카오맵에서 보기</a>
        <button class="collect-card__save${saved ? " is-saved" : ""}" type="button">${saved ? "담김" : "담기"}</button>
      </div>
    `;

    return card;
  }

  // 결과 카드와 담은 목록 카드가 같은 장소를 가리킬 수 있어 담기 상태를 한 번에 맞춘다.
  function syncSaveButtons() {
    const cards = document.querySelectorAll(".collect-card");
    cards.forEach((card) => {
      const button = card.querySelector(".collect-card__save");
      if (!button) return;
      const saved = isSaved(card.dataset.id);
      button.classList.toggle("is-saved", saved);
      button.textContent = saved ? "담김" : "담기";
    });
  }

  function renderSaved() {
    savedCount.textContent = String(savedPlaces.length);
    savedList.innerHTML = "";
    savedPlaces.forEach((place) => savedList.appendChild(createCard(place)));
  }

  function appendResults(places) {
    places.forEach((place) => resultsBox.appendChild(createCard(place)));
  }

  /* ---------- 담기 / 빼기 ---------- */

  function toggleSave(id) {
    if (isSaved(id)) {
      savedPlaces = savedPlaces.filter((place) => place.id !== id);
    } else {
      const found = findPlaceById(id);
      if (!found) return;
      savedPlaces = savedPlaces.concat([found]);
    }
    persistSaved();
    renderSaved();
    syncSaveButtons();
  }

  // 담은 목록에서 뺄 때는 결과 카드가 없을 수도 있어 양쪽을 모두 본다.
  function findPlaceById(id) {
    return renderedPlaces.get(id) || savedPlaces.find((place) => place.id === id) || null;
  }

  /* ---------- 카테고리 칩 ---------- */

  function renderChips() {
    categoriesBox.innerHTML = "";
    CATEGORY_FILTERS.forEach((filter) => {
      const chip = document.createElement("button");
      chip.className = "collect-chip" + (filter.label === activeFilter.label ? " is-active" : "");
      chip.type = "button";
      chip.textContent = filter.label;
      chip.addEventListener("click", () => {
        activeFilter = filter;
        renderChips();
        runSearch();
      });
      categoriesBox.appendChild(chip);
    });
  }

  /* ---------- 검색 ---------- */

  // 입력한 키워드에 칩의 보조 키워드를 덧붙여 최종 검색어를 만든다.
  function buildQuery() {
    const keyword = searchInput.value.trim();
    return [keyword, activeFilter.keyword].filter(Boolean).join(" ");
  }

  async function runSearch() {
    const query = buildQuery();

    resultsBox.innerHTML = "";
    renderedPlaces.clear();
    moreButton.hidden = true;
    currentPage = 1;
    currentQuery = query;
    hasSearched = true;

    // 검색어도 칩 키워드도 없으면 호출하지 않고 안내만 띄운다.
    if (query === "") {
      // 설정에 문제가 있다면 그쪽을 먼저 알려주는 게 사용자에게 도움이 된다.
      const state = await ensureEnvReady();
      if (state.ok) showStatus("is-empty", STATUS_TEXT.NEED_KEYWORD);
      else showStatus("is-error", state.message);
      return;
    }
    fetchPage(1);
  }

  function loadMore() {
    fetchPage(currentPage + 1);
  }

  async function fetchPage(page) {
    const token = ++requestToken;

    hasSearched = true;
    moreButton.hidden = true;
    showStatus("is-loading", STATUS_TEXT.LOADING);

    try {
      // `.env` 로딩이 아직이면 여기서 기다린다. 설정에 문제가 있으면
      // 카카오로 요청을 보내지 않고 사유별 안내만 띄운다.
      const state = await ensureEnvReady();
      if (token !== requestToken) return;
      if (!state.ok) {
        showStatus("is-error", state.message);
        return;
      }

      const result = await window.KakaoLocal.searchKeyword({
        query: currentQuery,
        page: page,
        categoryGroupCode: window.KakaoLocal.CATEGORY_GROUP_CODE[activeFilter.code],
      });

      // 그사이 새 검색이 시작됐다면 이 응답은 버린다.
      if (token !== requestToken) return;

      currentPage = page;
      appendResults(result.places);

      if (resultsBox.children.length === 0) {
        showStatus("is-empty", STATUS_TEXT.EMPTY_RESULT);
        return;
      }

      hideStatus();
      moreButton.hidden = result.isEnd;
    } catch (error) {
      if (token !== requestToken) return;
      // 설정 문제 / 키 문제 / 네트워크 문제 구분은 kakao-local.js가 문구로 정해서 넘겨준다.
      showStatus("is-error", error.message);
      // 더보기 중 실패했다면 이미 받아둔 결과는 남겨두고 버튼만 감춘다.
      moreButton.hidden = true;
    } finally {
      if (token === requestToken) syncSaveButtons();
    }
  }

  /* ---------- 이벤트 연결 ---------- */

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch();
  });

  moreButton.addEventListener("click", loadMore);

  // 카드는 계속 다시 그려지므로 담기 버튼은 이벤트 위임으로 받는다.
  function handleSaveClick(e) {
    const button = e.target.closest(".collect-card__save");
    if (!button) return;
    const card = button.closest(".collect-card");
    if (!card) return;
    toggleSave(card.dataset.id);
  }

  resultsBox.addEventListener("click", handleSaveClick);
  savedList.addEventListener("click", handleSaveClick);

  /* ---------- 초기 렌더 ---------- */

  // 칩·담은 목록·localStorage는 `.env`와 무관하게 먼저 그린다.
  // `.env` 로딩이 실패해도 이 기능들은 그대로 동작해야 한다.
  renderChips();
  renderSaved();

  (async function initEnv() {
    showStatus("is-loading", STATUS_TEXT.CONFIG_LOADING);
    const state = await ensureEnvReady();

    // 로딩이 끝나기 전에 사용자가 이미 검색을 시작했다면 그 결과를 덮지 않는다.
    if (hasSearched) return;

    if (state.ok) showStatus("is-empty", STATUS_TEXT.NEED_KEYWORD);
    else showStatus("is-error", state.message);
  })();
})();
