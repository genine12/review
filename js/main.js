(function () {
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
      const card = document.createElement("button");
      card.className = "card";
      card.type = "button";
      card.innerHTML = `
        <div class="card-img"><img src="${r.img}" alt="${r.name}"></div>
        <div class="card-body">
          <p class="card-category">${r.category}</p>
          <h3 class="card-name">${r.name}</h3>
          <p class="card-meta">${r.area} · ${r.tag}</p>
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

  arrowPrev.addEventListener("click", () => {
    cardTrack.scrollBy({ left: -300, behavior: "smooth" });
  });
  arrowNext.addEventListener("click", () => {
    cardTrack.scrollBy({ left: 300, behavior: "smooth" });
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

  renderChips();
  renderCards();
})();
