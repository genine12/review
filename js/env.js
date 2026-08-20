/**
 * env.js — 저장소 루트의 `.env`를 런타임에 읽어 파싱하는 로더.
 *
 * 빌드 단계가 없는 정적 사이트라 `process.env`가 존재하지 않는다.
 * 그래서 브라우저에서 fetch로 `.env`를 직접 읽는다(그만큼 키가 노출되므로 로컬 데모 전용).
 * 번들러 없이 전역으로 주고받으므로 `kakao-local.js`보다 먼저 로드되어야 한다.
 *
 * 키 값 자체는 이 파일에 두지 않는다. `.env`에만 존재한다.
 */
(function () {
  const ENV_PATH = ".env";

  // 호출부가 사용자에게 다른 안내를 보여줄 수 있도록 실패 사유를 구분해서 돌려준다.
  const STATUS = {
    OK: "OK",                   // 읽기 + 파싱 성공
    NOT_FOUND: "NOT_FOUND",     // 응답은 왔지만 .env가 없음(404 등)
    UNREADABLE: "UNREADABLE",   // fetch 자체 실패(file://로 열었거나 네트워크 문제)
  };

  /**
   * `.env` 텍스트를 { KEY: VALUE } 로 파싱한다.
   * - `#`로 시작하는 주석 줄과 빈 줄은 무시
   * - 키/값 앞뒤 공백은 trim
   * - 값을 감싼 따옴표(" 또는 ')는 제거
   * - 값에 `=`가 들어갈 수 있으므로 첫 번째 `=`에서만 자른다
   * - 윈도우 환경을 고려해 CRLF/CR/LF 줄바꿈을 모두 처리
   */
  function parse(text) {
    const values = {};
    const lines = String(text == null ? "" : text).split(/\r\n|\r|\n/);

    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (line === "" || line.charAt(0) === "#") return;

      const separator = line.indexOf("=");
      if (separator === -1) return; // `KEY=VALUE` 형태가 아니면 건너뛴다

      const key = line.slice(0, separator).trim();
      if (key === "") return;

      values[key] = unquote(line.slice(separator + 1).trim());
    });

    return values;
  }

  // 값 전체를 감싸는 따옴표만 벗긴다(값 안쪽 따옴표는 그대로 둔다).
  function unquote(value) {
    if (value.length < 2) return value;
    const first = value.charAt(0);
    const last = value.charAt(value.length - 1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
    return value;
  }

  function makeResult(status, values) {
    return { ok: status === STATUS.OK, status: status, values: values };
  }

  async function fetchEnv() {
    let response;
    try {
      response = await fetch(ENV_PATH, { cache: "no-store" });
    } catch (e) {
      // file://로 열었거나 서버에 닿지 못한 경우 — 던지지 않고 사유만 돌려준다.
      return makeResult(STATUS.UNREADABLE, {});
    }

    if (!response.ok) return makeResult(STATUS.NOT_FOUND, {});

    // .env가 없을 때 서버가 index.html을 대신 돌려주는 설정이면 파싱해도 의미가 없다.
    const headers = response.headers;
    const contentType = headers && headers.get ? headers.get("content-type") || "" : "";
    if (contentType.indexOf("text/html") > -1) return makeResult(STATUS.NOT_FOUND, {});

    let text;
    try {
      text = await response.text();
    } catch (e) {
      return makeResult(STATUS.UNREADABLE, {});
    }

    return makeResult(STATUS.OK, parse(text));
  }

  // 한 번 읽은 결과는 재사용한다(여러 곳에서 load()를 불러도 요청은 한 번).
  let cached = null;

  function load() {
    if (!cached) cached = fetchEnv();
    return cached;
  }

  // 캐시를 비운다(테스트나 `.env` 수정 후 다시 읽을 때 사용).
  function reset() {
    cached = null;
  }

  window.Env = {
    load: load,
    parse: parse,
    reset: reset,
    STATUS: STATUS,
    PATH: ENV_PATH,
  };
})();
