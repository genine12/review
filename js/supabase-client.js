/**
 * supabase-client.js — Supabase 클라이언트 초기화 전담.
 *
 * `js/auth.js`보다 먼저 로드되어야 한다(window.supabaseClient를 그 안에서 쓴다).
 * 이 파일은 index.html / collect.html 양쪽 <head>에서 로드하는 supabase-js(CDN, window.supabase)에 의존한다.
 *
 * 이 키는 비밀값이 아니다 — Supabase publishable(anon) 키는 브라우저 노출을 전제로 설계됐고,
 * 실제 접근 제어는 Supabase 프로젝트의 Row Level Security(RLS) 정책이 담당한다.
 * (카카오/구글/제미나이 키와는 성격이 달라 서버 프록시를 두지 않는다 — TEAM.md §6 참고.)
 */
(function () {
  const SUPABASE_URL = "https://spwiologlquuxtqmdual.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ffQY6Pl_JMGCeq6MTDGO2g_dIHlQdl-";

  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
})();
