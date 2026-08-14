(function () {
  const cardTrack = document.getElementById("card-track");
  const filterChips = document.getElementById("filter-chips");
  const searchInput = document.getElementById("demo-search");
  const emptyState = document.getElementById("empty-state");
  const arrowPrev = document.getElementById("arrow-prev");
  const arrowNext = document.getElementById("arrow-next");

  const modalOverlay = document.getElementById("modal-overlay");
  const modalClose = document.getElementById("modal-close");
  const modalImg = document.getElementById("modal-img");
  const modalTitle = document.getElementById("modal-title");
  const modalCategory = document.getElementById("modal-category");
  const modalMeta = document.getElementById("modal-meta");
  const modalReviews = document.getElementById("modal-reviews");

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

  function openModal(restaurant) {
    modalImg.src = restaurant.img;
    modalImg.alt = restaurant.name;
    modalTitle.textContent = restaurant.name;
    modalCategory.textContent = restaurant.category;
    modalMeta.textContent = `${restaurant.area} · ${restaurant.tag}`;
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
    modalOverlay.hidden = false;
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
