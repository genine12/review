/**
 * auth.js — Supabase 이메일/비밀번호 로그인. 인증 로직(window.Auth) + 헤더 위젯/모달 UI.
 *
 * index.html / collect.html 양쪽 헤더에서 그대로 재사용한다(페이지마다 같은 마크업이 있다고 가정).
 * `js/supabase-client.js`(window.supabaseClient) 다음에 로드되어야 한다.
 *
 * window.Auth는 이 페이지의 다른 기능(예: collect.js의 담기 버튼, 나중에 추가할
 * "로그인한 사람만 맛집 저장" 기능)이 "지금 로그인한 사람이 누구인지"를 가져다 쓰기 위한 진입점이다.
 */
(function () {
  const ERROR_MESSAGE = {
    INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않아요.",
    USER_EXISTS: "이미 가입된 이메일이에요.",
    WEAK_PASSWORD: "비밀번호는 6자 이상이어야 해요.",
    INVALID_EMAIL: "올바른 이메일 형식이 아니에요.",
    RATE_LIMIT: "요청이 너무 많아요. 잠시 후 다시 시도해주세요.",
    NEED_EMAIL_CONFIRM: "가입 확인 이메일을 보냈어요. 메일함을 확인한 뒤 로그인해주세요.",
    EMAIL_NOT_CONFIRMED: "이메일 인증이 완료되지 않은 계정이에요. 메일함을 확인해주세요.",
    NETWORK: "서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요.",
    SERVER: "문제가 발생했어요. 잠시 후 다시 시도해주세요.",
  };

  // 실제 Supabase 프로젝트로 회원가입/로그인을 호출해 확인한 error.code 값들.
  function mapAuthError(error) {
    const code = error && error.code;
    switch (code) {
      case "invalid_credentials":
        return ERROR_MESSAGE.INVALID_CREDENTIALS;
      case "email_not_confirmed":
        return ERROR_MESSAGE.EMAIL_NOT_CONFIRMED;
      case "user_already_exists":
        return ERROR_MESSAGE.USER_EXISTS;
      case "weak_password":
        return ERROR_MESSAGE.WEAK_PASSWORD;
      case "email_address_invalid":
        return ERROR_MESSAGE.INVALID_EMAIL;
      case "over_email_send_rate_limit":
      case "over_request_rate_limit":
        return ERROR_MESSAGE.RATE_LIMIT;
      default:
        return (error && error.message) ? ERROR_MESSAGE.SERVER : ERROR_MESSAGE.NETWORK;
    }
  }

  /* ---------- 재사용 가능한 인증 모듈 ---------- */

  // 세션 초기화(getSession) 전에는 null. 페이지 로드 직후 아주 짧은 순간을 제외하면
  // onAuthStateChange가 INITIAL_SESSION 이벤트로 바로 채워준다.
  let currentUser = null;
  const listeners = [];

  function setCurrentUser(user) {
    currentUser = user || null;
    listeners.forEach((cb) => cb(currentUser));
  }

  function getUser() {
    return currentUser;
  }

  function onChange(callback) {
    listeners.push(callback);
    return function unsubscribe() {
      const i = listeners.indexOf(callback);
      if (i > -1) listeners.splice(i, 1);
    };
  }

  async function signUp(email, password) {
    const { data, error } = await window.supabaseClient.auth.signUp({ email, password });
    if (error) throw new Error(mapAuthError(error));
    // 이메일 확인이 꺼져 있으면 session이 바로 온다 — 그러면 즉시 로그인 상태가 된다.
    // 켜져 있으면 session이 null이라 확인 메일 안내로 대체한다.
    if (!data.session) throw new Error(ERROR_MESSAGE.NEED_EMAIL_CONFIRM);
    return data.user;
  }

  async function signIn(email, password) {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw new Error(mapAuthError(error));
    return data.user;
  }

  async function signOut() {
    await window.supabaseClient.auth.signOut();
  }

  /* ---------- 헤더 위젯 / 로그인 모달 UI ---------- */

  const loginButton = document.getElementById("auth-login-button");
  const statusGroup = document.getElementById("auth-status-group");
  const statusText = document.getElementById("auth-status");
  const logoutButton = document.getElementById("auth-logout-button");
  const overlay = document.getElementById("auth-overlay");
  const closeButton = document.getElementById("auth-close");
  const form = document.getElementById("auth-form");
  const emailInput = document.getElementById("auth-email");
  const passwordInput = document.getElementById("auth-password");
  const errorBox = document.getElementById("auth-error");
  const signInButton = document.getElementById("auth-signin-button");
  const signUpButton = document.getElementById("auth-signup-button");

  // 이 페이지에 헤더 위젯 마크업이 없으면(있을 리 없지만 방어적으로) UI 초기화를 건너뛴다.
  const hasWidget = loginButton && statusGroup && statusText && logoutButton && overlay;

  function showError(message) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    if (!errorBox) return;
    errorBox.textContent = "";
    errorBox.hidden = true;
  }

  function setFormBusy(busy) {
    [signInButton, signUpButton].forEach((btn) => {
      if (btn) btn.disabled = busy;
    });
  }

  function openLoginModal() {
    if (!overlay) return;
    clearError();
    if (form) form.reset();
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    if (emailInput) emailInput.focus();
  }

  function closeLoginModal() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.style.overflow = "";
  }

  function renderHeader(user) {
    if (!hasWidget) return;
    if (user) {
      loginButton.hidden = true;
      statusGroup.hidden = false;
      statusText.textContent = `${user.email}님`;
    } else {
      loginButton.hidden = false;
      statusGroup.hidden = true;
      statusText.textContent = "";
    }
  }

  if (hasWidget) {
    loginButton.addEventListener("click", openLoginModal);
    logoutButton.addEventListener("click", () => {
      signOut();
    });
    closeButton.addEventListener("click", closeLoginModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeLoginModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) closeLoginModal();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError();
      setFormBusy(true);
      try {
        await signIn(emailInput.value.trim(), passwordInput.value);
        closeLoginModal();
      } catch (error) {
        showError(error.message);
      } finally {
        setFormBusy(false);
      }
    });

    signUpButton.addEventListener("click", async () => {
      clearError();
      setFormBusy(true);
      try {
        await signUp(emailInput.value.trim(), passwordInput.value);
        closeLoginModal();
      } catch (error) {
        showError(error.message);
      } finally {
        setFormBusy(false);
      }
    });

    onChange(renderHeader);
  }

  window.supabaseClient.auth.onAuthStateChange((_event, session) => {
    setCurrentUser(session ? session.user : null);
  });

  window.Auth = {
    getUser: getUser,
    onChange: onChange,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    openLoginModal: openLoginModal,
  };
})();
