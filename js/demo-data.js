const RESTAURANTS = [
  {
    id: 1,
    name: "온기식당",
    category: "한식",
    area: "서울 종로",
    tag: "정갈한 한상",
    img: "assets/images/restaurants/01.jpg",
    reviews: [
      { author: "j_eats", rating: 5, text: "밑반찬 하나하나 정성이 느껴져요. 재방문 의사 100%." },
      { author: "seoul_walker", rating: 4, text: "혼밥하기도 좋고 조용해서 좋았어요." },
    ],
  },
  {
    id: 2,
    name: "브릭버거",
    category: "양식",
    area: "서울 이태원",
    tag: "육즙 가득 수제버거",
    img: "assets/images/restaurants/02.jpg",
    reviews: [
      { author: "burger_hoon", rating: 5, text: "패티 육즙이 미쳤습니다. 웨이팅 감수할 맛." },
      { author: "minji.k", rating: 4, text: "번이 촉촉해서 끝까지 물리지 않고 먹었어요." },
    ],
  },
  {
    id: 3,
    name: "조용한 서재",
    category: "카페",
    area: "서울 성수",
    tag: "책 냄새 나는 카페",
    img: "assets/images/restaurants/03.jpg",
    reviews: [
      { author: "bookworm_yj", rating: 5, text: "혼자 책 읽기 딱 좋은 조도와 좌석." },
      { author: "coffee_daily", rating: 5, text: "핸드드립 원두가 매주 바뀌어서 재밌어요." },
    ],
  },
  {
    id: 4,
    name: "스시 나루",
    category: "일식",
    area: "서울 청담",
    tag: "제철 오마카세",
    img: "assets/images/restaurants/04.jpg",
    reviews: [
      { author: "sushi_lover", rating: 5, text: "제철 재료 설명을 들으며 먹으니 더 맛있었어요." },
      { author: "hyun_", rating: 4, text: "가격대는 있지만 그만한 값을 합니다." },
    ],
  },
  {
    id: 5,
    name: "달콤제과",
    category: "베이커리",
    area: "서울 연남",
    tag: "매일 굽는 크루아상",
    img: "assets/images/restaurants/05.jpg",
    reviews: [
      { author: "bread_addict", rating: 5, text: "오픈런 안 하면 오후엔 품절이에요. 그만큼 맛있음." },
      { author: "yeonnam_local", rating: 5, text: "결 살아있는 크루아상은 여기가 최고." },
    ],
  },
  {
    id: 6,
    name: "스트리트버거",
    category: "양식",
    area: "서울 홍대",
    tag: "바삭한 감자튀김과 함께",
    img: "assets/images/restaurants/06.jpg",
    reviews: [
      { author: "hongdae_night", rating: 4, text: "친구들이랑 가볍게 먹기 좋아요." },
      { author: "fries_fan", rating: 5, text: "감튀가 눅눅하지 않고 끝까지 바삭해요." },
    ],
  },
  {
    id: 7,
    name: "나폴리 피자집",
    category: "양식",
    area: "서울 이태원",
    tag: "화덕에 구운 도우",
    img: "assets/images/restaurants/07.jpg",
    reviews: [
      { author: "pizza_traveler", rating: 5, text: "도우 끝부분이 폭신하면서 살짝 탄 향이 좋아요." },
      { author: "j_eats", rating: 4, text: "치즈 비율이 딱 좋습니다." },
    ],
  },
  {
    id: 8,
    name: "브런치룸",
    category: "카페",
    area: "서울 한남",
    tag: "여유로운 주말 브런치",
    img: "assets/images/restaurants/08.jpg",
    reviews: [
      { author: "weekend_brunch", rating: 5, text: "에그베네딕트 소스가 일품이에요." },
      { author: "hannam_resident", rating: 4, text: "테이블 간격이 넓어서 편하게 대화하기 좋아요." },
    ],
  },
  {
    id: 9,
    name: "산책식당",
    category: "한식",
    area: "서울 마포",
    tag: "집밥 같은 한 끼",
    img: "assets/images/restaurants/09.jpg",
    reviews: [
      { author: "mapo_dweller", rating: 5, text: "타지에서 그리웠던 집밥 맛이에요." },
      { author: "seoul_walker", rating: 5, text: "국물 요리가 특히 훌륭합니다." },
    ],
  },
];

const CATEGORIES = ["전체", "한식", "카페", "일식", "양식", "베이커리"];
