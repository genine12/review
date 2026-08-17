(function () {
  const heroMarquee = document.getElementById("hero-marquee");
  const cardTrack = document.getElementById("card-track");
  const filterChips = document.getElementById("filter-chips");
  const searchInput = document.getElementById("demo-search");
  const emptyState = document.getElementById("empty-state");
  const arrowPrev = document.getElementById("arrow-prev");
  const arrowNext = document.getElementById("arrow-next");

  const modalOverlay = document.getElementById("modal-overlay");
  const modalPanel = document.getElementById("modal-panel");
  const modalClose = document.getElementById("modal-close");
  const modalImg = document.getElementById("modal-img");
  const modalTitle = document.getElementById("modal-title");
  const modalCategory = document.getElementById("modal-category");
  const modalMeta = document.getElementById("modal-meta");
  const modalDescription = document.getElementById("modal-description");
  const modalRating = document.getElementById("modal-rating");
  const modalReviews = document.getElementById("modal-reviews");
  const modalSimilarList = document.getElementById("modal-similar-list");

  let activeCategory = "전체";
  let searchTerm = "";

  /* ---------- 히어로: 엔딩크레딧처럼 올라가는 후기 ---------- */

  const MARQUEE_COLUMNS = 3;

  function reviewCardHTML(rv) {
    return `
      <article class="mq-card">
        <div class="mq-head">
          <span class="mq-avatar">${rv.name.charAt(0)}</span>
          <span class="mq-who">
            <span class="mq-name">${rv.name}</span>
            <span class="mq-handle">${rv.handle}</span>
          </span>
        </div>
        <p class="mq-text">${rv.text}</p>
        <p class="mq-place"><span class="mq-star">${"★".repeat(rv.rating)}</span> ${rv.place}</p>
      </article>
    `;
  }

  function renderHeroMarquee() {
    if (!heroMarquee || typeof HERO_REVIEWS === "undefined") return;

    const columns = Array.from({ length: MARQUEE_COLUMNS }, () => []);
    HERO_REVIEWS.forEach((rv, i) => columns[i % MARQUEE_COLUMNS].push(rv));

    heroMarquee.innerHTML = columns
      .map((items, i) => {
        const cards = items.map(reviewCardHTML).join("");
        // 끊김 없는 무한 루프를 위해 같은 묶음을 한 번 더 복제 (복제본은 스크린리더에서 제외)
        return `
          <div class="mq-col mq-col-${i + 1}">
            <div class="mq-inner">
              ${cards}
              <div class="mq-dup" aria-hidden="true">${cards}</div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderChips() {
    filterChips.innerHTML = "";
    CATEGORIES.forEach((category) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (category === activeCategory ? " active" : "");
      chip.type = "button";
      chip.textContent = category;
      chip.addEventListener("click", () => {
        activeCategory = category;
        renderChips();
        renderCards();
      });
      filterChips.appendChild(chip);
    });
  }

  function getFilteredRestaurants() {
    const term = searchTerm.trim().toLowerCase();
    return RESTAURANTS.filter((r) => {
      const matchesCategory = activeCategory === "전체" || r.category === activeCategory;
      const matchesSearch =
        term === "" ||
        r.name.toLowerCase().includes(term) ||
        r.area.toLowerCase().includes(term) ||
        r.tag.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }

  function renderCards() {
    const list = getFilteredRestaurants();
    cardTrack.innerHTML = "";

    if (list.length === 0) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    list.forEach((r) => {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <img class="card-bg" src="${r.img}" alt="${r.name}">
        <div class="card-overlay">
          <div class="card-top">
            <div class="card-badges">
              <span class="card-badge"><span class="card-badge-dot"></span>${r.category}</span>
              <span class="card-badge">★ ${getAverageRating(r).toFixed(1)} · 리뷰 ${r.reviews.length}개<span class="card-badge-dot"></span></span>
            </div>
            <span class="card-arrow" aria-hidden="true">↗</span>
          </div>
          <div class="card-bottom">
            <p class="card-area">${r.area} · ${r.tag}</p>
            <h3 class="card-name">${r.name}</h3>
            <p class="card-desc">${r.description}</p>
            <button class="card-cta" type="button">
              리뷰 보기
              <span class="card-cta-icon" aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      `;
      card.addEventListener("click", () => openModal(r));
      cardTrack.appendChild(card);
    });
  }

  let searchDebounce;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => {
      searchTerm = value;
      renderCards();
    }, 200);
  });

  // 카드 하나 + gap 만큼 스크롤 (카드 폭은 브레이크포인트마다 다름)
  function getScrollStep() {
    const card = cardTrack.querySelector(".card");
    if (!card) return 300;
    const gap = parseFloat(getComputedStyle(cardTrack).columnGap) || 0;
    return card.offsetWidth + gap;
  }

  arrowPrev.addEventListener("click", () => {
    cardTrack.scrollBy({ left: -getScrollStep(), behavior: "smooth" });
  });
  arrowNext.addEventListener("click", () => {
    cardTrack.scrollBy({ left: getScrollStep(), behavior: "smooth" });
  });

  function getAverageRating(restaurant) {
    const sum = restaurant.reviews.reduce((acc, rv) => acc + rv.rating, 0);
    return sum / restaurant.reviews.length;
  }

  function getSimilarRestaurants(restaurant) {
    const sameCategory = RESTAURANTS.filter(
      (r) => r.id !== restaurant.id && r.category === restaurant.category
    );
    const others = RESTAURANTS.filter(
      (r) => r.id !== restaurant.id && r.category !== restaurant.category
    );
    return [...sameCategory, ...others].slice(0, 3);
  }

  function openModal(restaurant) {
    modalImg.src = restaurant.img;
    modalImg.alt = restaurant.name;
    modalTitle.textContent = restaurant.name;
    modalCategory.textContent = restaurant.category;
    modalMeta.textContent = `${restaurant.area} · ${restaurant.tag}`;
    modalDescription.textContent = restaurant.description;
    modalRating.innerHTML = `<span class="review-rating">★</span> ${getAverageRating(restaurant).toFixed(1)} · 리뷰 ${restaurant.reviews.length}개`;
    modalReviews.innerHTML = restaurant.reviews
      .map(
        (rv) => `
        <li>
          <p class="review-author">${rv.author} · <span class="review-rating">${"★".repeat(rv.rating)}</span></p>
          <p class="review-text">${rv.text}</p>
        </li>
      `
      )
      .join("");

    modalSimilarList.innerHTML = getSimilarRestaurants(restaurant)
      .map(
        (r) => `
        <button class="similar-card" type="button" data-id="${r.id}">
          <img src="${r.img}" alt="${r.name}">
          <p class="similar-name">${r.name}</p>
          <p class="similar-meta">${r.area} · ${r.category}</p>
        </button>
      `
      )
      .join("");
    modalSimilarList.querySelectorAll(".similar-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = RESTAURANTS.find((r) => r.id === Number(btn.dataset.id));
        if (target) openModal(target);
      });
    });

    modalOverlay.hidden = false;
    modalPanel.scrollTop = 0;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modalOverlay.hidden = true;
    document.body.style.overflow = "";
  }

  modalClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalOverlay.hidden) closeModal();
  });

  renderHeroMarquee();
  renderChips();
  renderCards();
})();
