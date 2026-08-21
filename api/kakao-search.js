/**
 * api/kakao-search.js — Vercel Serverless Function.
 *
 * 카카오 로컬 API(키워드 검색)를 서버에서 대신 호출하는 프록시.
 * 카카오 REST API 키는 여기(서버 환경변수 `KAKAO_REST_API_KEY`)에만 존재하고
 * 브라우저로는 절대 내려가지 않는다. 클라이언트(js/kakao-local.js)는 이 엔드포인트만 호출한다.
 *
 * 환경변수 설정:
 * - 배포: Vercel 프로젝트 → Settings → Environment Variables → KAKAO_REST_API_KEY
 * - 로컬(`vercel dev`): 저장소 루트 `.env`(gitignore됨)에 KAKAO_REST_API_KEY=... 를 넣어두면 자동으로 읽힌다.
 */
module.exports = async (req, res) => {
  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
  if (!KAKAO_KEY) {
    res.status(500).json({ error: "NO_KEY" });
    return;
  }

  // 키 설정 여부만 가볍게 확인할 때 쓴다(카카오 쿼터를 쓰지 않는다).
  if (req.query.ping) {
    res.status(200).json({ ok: true });
    return;
  }

  const query = String(req.query.query || "").trim();
  if (query === "") {
    res.status(200).json({ documents: [], meta: { is_end: true, total_count: 0 } });
    return;
  }

  const params = new URLSearchParams({
    query: query,
    page: String(req.query.page || "1"),
    size: String(req.query.size || "15"),
  });
  if (req.query.category_group_code) {
    params.set("category_group_code", String(req.query.category_group_code));
  }

  let kakaoRes;
  try {
    kakaoRes = await fetch(
      "https://dapi.kakao.com/v2/local/search/keyword.json?" + params.toString(),
      { headers: { Authorization: "KakaoAK " + KAKAO_KEY } }
    );
  } catch (e) {
    res.status(502).json({ error: "NETWORK" });
    return;
  }

  let data;
  try {
    data = await kakaoRes.json();
  } catch (e) {
    data = null;
  }

  if (!kakaoRes.ok) {
    res.status(kakaoRes.status).json(data || { error: "SERVER" });
    return;
  }

  res.status(200).json(data);
};
