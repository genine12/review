/**
 * api/google-reviews.js — Vercel Serverless Function.
 *
 * 좌표 근처에서 이름으로 가게를 찾아 구글 별점/리뷰를 가져오는 프록시.
 * 구글 API 키는 여기(서버 환경변수 `GOOGLE_PLACES_API_KEY`)에만 존재하고
 * 브라우저로는 절대 내려가지 않는다. 클라이언트(js/google-reviews.js)는 이 엔드포인트만 호출한다.
 *
 * 반드시 구글 Places API의 최신(New) 버전만 사용한다(레거시 Places API 금지).
 * - Text Search (New): 이름으로 후보를 몇 개 찾는다. `locationRestriction`은 Text Search (New)에서
 *   circle을 지원하지 않아(실제 호출해보면 400 INVALID_ARGUMENT) `locationBias`로 근처를 우선시키기만
 *   하고, 진짜 150m 하드 필터링은 아래에서 좌표로 직접 계산한다.
 * - Place Details (New): 화면에 필요한 5개 정보(이름/별점/리뷰개수/리뷰내용/지도링크)만 요청한다.
 *
 * 환경변수 설정:
 * - 배포: Vercel 프로젝트 → Settings → Environment Variables → GOOGLE_PLACES_API_KEY
 * - 로컬(`vercel dev`): 저장소 루트 `.env`(gitignore됨)에 GOOGLE_PLACES_API_KEY=... 를 넣어두면 자동으로 읽힌다.
 */
const TEXT_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const PLACE_DETAILS_ENDPOINT = "https://places.googleapis.com/v1/places/";
// locationBias는 결과를 걸러주지 않으므로 반경 안인지 직접 계산하려면 좌표도 받아야 한다.
const SEARCH_FIELD_MASK = "places.id,places.location";
// 화면에 실제로 쓰는 5개 정보로 필드를 제한한다(과금·노출 최소화).
const DETAILS_FIELD_MASK = "displayName,rating,userRatingCount,reviews,googleMapsUri";
// "도보 2분" = 150m
const RADIUS_METERS = 150;
// bias만으로는 진짜 가까운 후보가 뒤로 밀릴 수 있어 여러 개를 받아 직접 거리순으로 고른다.
const SEARCH_CANDIDATE_COUNT = 10;

// 두 좌표 사이의 직선 거리(m). 반경 150m 하드 필터링에 쓴다.
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = async (req, res) => {
  const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!GOOGLE_KEY) {
    res.status(500).json({ error: "NO_KEY" });
    return;
  }

  // 키 설정 여부만 가볍게 확인할 때 쓴다(구글 쿼터를 쓰지 않는다).
  if (req.query.ping) {
    res.status(200).json({ ok: true });
    return;
  }

  const name = String(req.query.name || "").trim();
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (name === "" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "BAD_REQUEST" });
    return;
  }

  let searchRes;
  try {
    searchRes = await fetch(TEXT_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: name,
        maxResultCount: SEARCH_CANDIDATE_COUNT,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: RADIUS_METERS,
          },
        },
      }),
    });
  } catch (e) {
    res.status(502).json({ error: "NETWORK" });
    return;
  }

  let searchData;
  try {
    searchData = await searchRes.json();
  } catch (e) {
    searchData = null;
  }

  if (!searchRes.ok) {
    res.status(searchRes.status).json(searchData || { error: "SERVER" });
    return;
  }

  const places = (searchData && Array.isArray(searchData.places)) ? searchData.places : [];

  // locationBias는 결과를 걸러주지 않으므로, 반경 150m 안인지는 직접 계산해서 하드 필터링한다.
  const withinRadius = places
    .filter((p) => p.id && p.location && Number.isFinite(p.location.latitude) && Number.isFinite(p.location.longitude))
    .map((p) => ({
      id: p.id,
      distance: haversineMeters(lat, lng, p.location.latitude, p.location.longitude),
    }))
    .filter((p) => p.distance <= RADIUS_METERS)
    .sort((a, b) => a.distance - b.distance);

  if (withinRadius.length === 0) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }

  const placeId = withinRadius[0].id;

  let detailsRes;
  try {
    detailsRes = await fetch(PLACE_DETAILS_ENDPOINT + placeId, {
      headers: {
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
    });
  } catch (e) {
    res.status(502).json({ error: "NETWORK" });
    return;
  }

  let details;
  try {
    details = await detailsRes.json();
  } catch (e) {
    details = null;
  }

  if (!detailsRes.ok) {
    res.status(detailsRes.status).json(details || { error: "SERVER" });
    return;
  }

  const reviews = Array.isArray(details.reviews) ? details.reviews : [];

  res.status(200).json({
    name: (details.displayName && details.displayName.text) || name,
    rating: typeof details.rating === "number" ? details.rating : null,
    reviewCount: typeof details.userRatingCount === "number" ? details.userRatingCount : 0,
    googleMapsUrl: details.googleMapsUri || "",
    reviews: reviews.map((r) => ({
      author: (r.authorAttribution && r.authorAttribution.displayName) || "익명",
      rating: typeof r.rating === "number" ? r.rating : null,
      relativeTime: r.relativePublishTimeDescription || "",
      text: (r.text && r.text.text) || "",
    })),
  });
};
