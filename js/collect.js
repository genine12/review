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
  const detailOverlay = document.getElementById("collect-detail-overlay");
  const detailClose = document.getElementById("collect-detail-close");
  const detailBody = document.getElementById("collect-detail-body");

  const STORAGE_KEY = "mideok.collect.saved.v1";
  // 한 번 조회한 가게의 구글 리뷰를 캐시한다: { [placeId]: normalizedGoogleData }
  // v2 — 리뷰를 한국어(languageCode=ko)로 받도록 바꾸면서, 영어로 캐시돼 있던 v1은 버린다.
  const REVIEW_STORAGE_KEY = "mideok.collect.reviews.v2";
  // 한 번 분석한 가게의 AI 분석 결과를 캐시한다: { [placeId]: {sentimentCounts, keywords, summary} }
  // v2 — 키워드를 한국어로 뽑도록 바꾸면서, 영어 키워드가 남은 v1은 버린다.
  const ANALYSIS_STORAGE_KEY = "mideok.collect.analysis.v2";

  // 리뷰 오버레이 스크롤이 멈춘 뒤 스크롤바를 다시 감추기까지의 시간(ms).
  const SCROLLBAR_HIDE_DELAY_MS = 700;

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
    REVIEW_LOADING: "리뷰를 불러오는 중 ...",
    REVIEW_EMPTY: "아직 등록된 리뷰가 없어요.",
    REVIEW_NO_COORDS: "좌표 정보가 없어 리뷰를 찾을 수 없어요.",
    ANALYSIS_LOADING: "AI가 리뷰를 분석하는 중...",
  };

  let activeFilter = CATEGORY_FILTERS[0];
  let currentQuery = "";
  let currentPage = 1;
  let savedPlaces = loadSaved();
  let reviewCache = loadReviewCache();
  let analysisCache = loadAnalysisCache();
  // 사용자가 검색을 시작했는지. 설정 확인(ping)이 늦게 끝나도 검색 결과를 덮어쓰지 않기 위해 본다.
  let hasSearched = false;
  // 가장 최신 요청만 화면에 반영한다(늦게 도착한 이전 응답이 결과를 덮는 것을 막는다).
  let requestToken = 0;
  // 오버레이가 지금 어떤 가게를 보여주고 있는지 추적한다. 열기/닫기마다 증가시켜서
  // 늦게 도착한 이전 요청(리뷰/분석)이 다른 가게의 화면을 덮지 않게 막는다.
  let detailToken = 0;
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
   * 서버(api/kakao-search) 설정 확인은 네트워크 요청이라 페이지가 뜬 직후엔 결과를 알 수 없다.
   * 결과 Promise를 한 번만 만들어 재사용하므로, 확인이 끝나기 전에 검색을 눌러도
   * 실패하지 않고 확인 완료를 기다린 뒤 이어서 진행된다.
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

  // 구글 리뷰 캐시. 만료 없음 — 한 번 조회하면 같은 세션/브라우저에서는 다시 요청하지 않는다.
  function loadReviewCache() {
    try {
      const raw = window.localStorage.getItem(REVIEW_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function persistReviewCache() {
    try {
      window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviewCache));
    } catch (e) {
      // 저장에 실패해도 화면 동작은 그대로 유지한다.
    }
  }

  // AI 분석 캐시. 리뷰 캐시와 같은 방어적 패턴 — 만료 없음.
  function loadAnalysisCache() {
    try {
      const raw = window.localStorage.getItem(ANALYSIS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function persistAnalysisCache() {
    try {
      window.localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(analysisCache));
    } catch (e) {
      // 저장에 실패해도 화면 동작은 그대로 유지한다.
    }
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

  /* ---------- 리뷰/AI 분석 오버레이 ---------- */

  function buildReviewSummaryText(data) {
    const ratingText = typeof data.rating === "number" ? data.rating.toFixed(1) : "정보 없음";
    return `⭐ ${ratingText} · 리뷰 ${data.reviewCount}개`;
  }

  function renderDetailLoading(name) {
    detailBody.innerHTML = `
      <h3 id="collect-detail-name">${escapeHTML(name)}</h3>
      <p class="collect-review-status is-loading">${escapeHTML(STATUS_TEXT.REVIEW_LOADING)}</p>
    `;
  }

  function renderDetailError(name, message) {
    detailBody.innerHTML = `
      <h3 id="collect-detail-name">${escapeHTML(name)}</h3>
      <p class="collect-review-status is-error">${escapeHTML(message)}</p>
    `;
  }

  // 리뷰 목록 + (있으면) AI 분석 컨테이너를 함께 그린다. 분석은 리뷰가 1개 이상일 때만 보인다.
  function renderDetailReviews(place, data) {
    const reviewsHtml = data.reviews.length
      ? `<ul class="collect-review-list">${data.reviews
          .map(
            (review) => `
        <li class="collect-review-item">
          <p class="collect-review-meta">
            <span class="collect-review-author">${escapeHTML(review.author)}</span>
            <span class="collect-review-stars">${"★".repeat(Math.max(0, Math.round(review.rating || 0)))}</span>
            <span class="collect-review-time">${escapeHTML(review.relativeTime)}</span>
          </p>
          <p class="collect-review-text">${escapeHTML(review.text)}</p>
        </li>
      `
          )
          .join("")}</ul>`
      : `<p class="collect-review-status is-empty">${escapeHTML(STATUS_TEXT.REVIEW_EMPTY)}</p>`;

    detailBody.innerHTML = `
      <h3 id="collect-detail-name">${escapeHTML(place.name)}</h3>
      <p class="collect-review-summary">${escapeHTML(buildReviewSummaryText(data))}</p>
      ${reviewsHtml}
      <div class="collect-analysis"${data.reviews.length ? "" : " hidden"}></div>
      <a class="collect-review-link" href="${escapeHTML(data.googleMapsUrl)}" target="_blank" rel="noopener"${data.googleMapsUrl ? "" : " hidden"}>구글맵에서 전체 리뷰 보기 →</a>
    `;
  }

  function openDetailOverlay(place) {
    const token = ++detailToken;

    renderDetailLoading(place.name);
    detailOverlay.hidden = false;
    // 이전에 열었던 가게에서 내려둔 스크롤 위치가 남지 않도록 맨 위에서 시작한다.
    detailBody.scrollTop = 0;
    detailBody.classList.remove("is-scrolling");
    document.body.style.overflow = "hidden";

    const cached = reviewCache[place.id];
    if (cached) {
      renderDetailReviews(place, cached);
      maybeRunAnalysis(token, place, cached);
      return;
    }

    fetchAndRenderReviews(token, place);
  }

  function closeDetailOverlay() {
    // 열려 있던 요청/분석이 더 이상 화면에 반영되지 않도록 토큰을 무효화한다.
    detailToken++;
    detailOverlay.hidden = true;
    document.body.style.overflow = "";
  }

  async function fetchAndRenderReviews(token, place) {
    if (!window.GoogleReviews) {
      renderDetailError(place.name, STATUS_TEXT.NO_LOADER);
      return;
    }

    if (place.lat == null || place.lng == null) {
      renderDetailError(place.name, STATUS_TEXT.REVIEW_NO_COORDS);
      return;
    }

    try {
      const data = await window.GoogleReviews.fetchReviews({ name: place.name, lat: place.lat, lng: place.lng });
      reviewCache[place.id] = data;
      persistReviewCache();

      // 응답이 오는 사이 다른 가게를 열었거나 오버레이를 닫았으면 반영하지 않는다.
      if (token !== detailToken || detailOverlay.hidden) return;
      renderDetailReviews(place, data);
      maybeRunAnalysis(token, place, data);
    } catch (error) {
      if (token !== detailToken || detailOverlay.hidden) return;
      renderDetailError(place.name, error.message);
    }
  }

  // 리뷰가 화면에 뜨면(캐시 히트든 신규 fetch든) 이어서 자동으로 분석을 시작한다.
  async function maybeRunAnalysis(token, place, reviewData) {
    if (!reviewData.reviews.length) return; // 컨테이너가 이미 hidden으로 렌더돼 있다.

    const analysisBox = detailBody.querySelector(".collect-analysis");
    if (!analysisBox) return;

    const cachedAnalysis = analysisCache[place.id];
    if (cachedAnalysis) {
      renderAnalysis(analysisBox, cachedAnalysis);
      return;
    }

    if (!window.GeminiAnalyze) {
      analysisBox.innerHTML = `<p class="collect-analysis-status is-error">${escapeHTML(STATUS_TEXT.NO_LOADER)}</p>`;
      return;
    }

    analysisBox.innerHTML = `<p class="collect-analysis-status is-loading">${escapeHTML(STATUS_TEXT.ANALYSIS_LOADING)}</p>`;

    try {
      const analysis = await window.GeminiAnalyze.analyzeReviews(reviewData.reviews);
      analysisCache[place.id] = analysis;
      persistAnalysisCache();

      if (token !== detailToken || detailOverlay.hidden) return;
      // 그 사이 detailBody가 다시 그려졌을 수 있어 컨테이너를 다시 찾는다.
      const box = detailBody.querySelector(".collect-analysis");
      if (box) renderAnalysis(box, analysis);
    } catch (error) {
      if (token !== detailToken || detailOverlay.hidden) return;
      const box = detailBody.querySelector(".collect-analysis");
      if (box) box.innerHTML = `<p class="collect-analysis-status is-error">${escapeHTML(error.message)}</p>`;
    }
  }

  function renderAnalysis(analysisBox, analysis) {
    const counts = analysis.sentimentCounts;
    const total = counts.positive + counts.neutral + counts.negative || 1;
    const pct = (n) => (n / total) * 100;

    analysisBox.innerHTML = `
      <p class="eyebrow">AI 리뷰 분석</p>
      <div class="collect-sentiment-bar" role="img" aria-label="긍정 ${counts.positive}개, 보통 ${counts.neutral}개, 부정 ${counts.negative}개">
        <span class="collect-sentiment-bar__segment is-positive"></span>
        <span class="collect-sentiment-bar__segment is-neutral"></span>
        <span class="collect-sentiment-bar__segment is-negative"></span>
      </div>
      <p class="collect-sentiment-legend">
        <span class="is-positive">긍정 ${counts.positive}</span>
        <span class="is-neutral">보통 ${counts.neutral}</span>
        <span class="is-negative">부정 ${counts.negative}</span>
      </p>
      <canvas class="collect-wordcloud"${analysis.keywords.length ? "" : " hidden"}></canvas>
      <p class="collect-analysis-summary">${escapeHTML(analysis.summary)}</p>
    `;

    // 연속값(%)이라 CSS 클래스로 표현할 수 없는 유일한 예외 — TEAM.md에 명시된 예외.
    const segments = analysisBox.querySelectorAll(".collect-sentiment-bar__segment");
    segments[0].style.width = pct(counts.positive) + "%";
    segments[1].style.width = pct(counts.neutral) + "%";
    segments[2].style.width = pct(counts.negative) + "%";

    const canvas = analysisBox.querySelector(".collect-wordcloud");
    if (canvas && !canvas.hidden) renderWordCloud(canvas, analysis.keywords);
  }

  function renderWordCloud(canvas, keywords) {
    if (!window.WordCloud || !keywords.length) {
      canvas.hidden = true;
      return;
    }

    canvas.hidden = false;
    canvas.width = canvas.clientWidth || 320;
    canvas.height = 160;

    const rootStyles = getComputedStyle(document.documentElement);
    const positiveColor = rootStyles.getPropertyValue("--color-positive").trim() || "#2F9E44";
    const negativeColor = rootStyles.getPropertyValue("--color-danger").trim() || "#B4413A";
    const contextByWord = new Map(keywords.map((k) => [k.word, k.context]));

    window.WordCloud(canvas, {
      list: keywords.map((k) => [k.word, Math.max(1, k.score)]),
      weightFactor: (size) => 8 + size * 3.2,
      color: (word) => (contextByWord.get(word) === "negative" ? negativeColor : positiveColor),
      fontFamily: getComputedStyle(document.body).fontFamily,
      backgroundColor: "transparent",
      rotateRatio: 0,
      gridSize: 8,
    });
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
      // 서버 설정 확인이 아직이면 여기서 기다린다. 설정에 문제가 있으면
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

  // 카드는 계속 다시 그려지므로 클릭은 이벤트 위임으로 받는다.
  // 담기 버튼 → 로그인 필요(비로그인 시 로그인 창), 카카오맵 링크 → 기본 동작(새 탭), 그 외 카드 클릭 → 리뷰/분석 오버레이 열기.
  function handleCardClick(e) {
    const saveButton = e.target.closest(".collect-card__save");
    if (saveButton) {
      // 담기는 로그인한 회원만 가능하다 — 비로그인이면 저장 대신 로그인 창을 띄운다.
      if (!window.Auth || !window.Auth.getUser()) {
        if (window.Auth) window.Auth.openLoginModal();
        return;
      }
      const card = saveButton.closest(".collect-card");
      if (card) toggleSave(card.dataset.id);
      return;
    }

    if (e.target.closest(".collect-card__link")) return;

    const card = e.target.closest(".collect-card");
    if (!card) return;
    const place = findPlaceById(card.dataset.id);
    if (!place) return;
    openDetailOverlay(place);
  }

  resultsBox.addEventListener("click", handleCardClick);
  savedList.addEventListener("click", handleCardClick);

  // index.html의 기존 데모 모달과 같은 상호작용 관례(닫기 버튼/배경 클릭/Escape).
  detailClose.addEventListener("click", closeDetailOverlay);
  detailOverlay.addEventListener("click", (e) => {
    if (e.target === detailOverlay) closeDetailOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !detailOverlay.hidden) closeDetailOverlay();
  });

  // 스크롤바는 스크롤하는 동안에만 보인다 — 멈추고 잠시 뒤 다시 투명해진다.
  // (실제 색은 css/collect.css의 .collect-detail-body.is-scrolling 규칙에 있다.)
  let scrollbarHideTimer = null;
  detailBody.addEventListener("scroll", () => {
    detailBody.classList.add("is-scrolling");
    window.clearTimeout(scrollbarHideTimer);
    scrollbarHideTimer = window.setTimeout(() => {
      detailBody.classList.remove("is-scrolling");
    }, SCROLLBAR_HIDE_DELAY_MS);
  });

  /* ---------- 초기 렌더 ---------- */

  // 칩·담은 목록·localStorage는 서버 설정 확인과 무관하게 먼저 그린다.
  // 그 확인이 실패해도 이 기능들은 그대로 동작해야 한다.
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
