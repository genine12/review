# TEAM.md — 에이전트 팀 작업 규약

팀원: `logic`(기능), `design`(디자인). 리더는 메인 세션.

## 1. 파일 소유권 (절대 규칙)

같은 파일을 두 명이 동시에 수정하는 것을 금지한다. 아래 소유자만 해당 파일을 편집한다.

| 파일 | 소유자 |
|---|---|
| `collect.html` (신규, 맛집 담기 페이지) | **logic** |
| `js/kakao-local.js` (신규) | **logic** |
| `js/collect.js` (신규) | **logic** |
| `api/kakao-search.js` (신규, 서버 프록시) | **logic** |
| `js/main.js`, `js/demo-data.js` | **logic** |
| `index.html` | **design** |
| `css/style.css` | **design** |
| `css/collect.css` (신규) | **design** |
| `DESIGN.md` | **design** |
| `TEAM.md`, `CLAUDE.md`, `PRD.md` | **리더(메인)** — 팀원은 읽기만 |

- 소유자가 아닌 파일은 **읽기만** 가능. 수정이 필요하면 리더에게 `SendMessage`로 요청한다.
- `assets/images/` 아래 새 이미지 추가는 각자 자유(파일명 중복 금지: logic은 `collect-*`, design은 `ui-*` 접두사).

## 2. HTML/CSS 계약 (클래스 이름)

`collect.html`의 마크업은 logic이 작성하고, 스타일은 design이 `css/collect.css`에 작성한다.
logic은 아래 클래스 이름을 **반드시 그대로** 사용하고, 임의로 바꾸지 않는다.
design은 아래 이름에만 스타일을 건다. 추가 클래스가 필요하면 SendMessage로 합의한다.

```
.collect-page                 페이지 루트
  .collect-search             검색 영역 래퍼
    .collect-search__form     form
    .collect-search__input    text input (키워드)
    .collect-search__submit   검색 버튼
    .collect-categories       카테고리 칩 컨테이너
      .collect-chip           칩 버튼 (활성: .is-active)
  .collect-status             로딩/에러/빈 상태 메시지 (.is-loading / .is-error / .is-empty)
  .collect-results            결과 카드 그리드
    .collect-card             카드 루트 (article)
      .collect-card__body     텍스트 영역
      .collect-card__name     상호명
      .collect-card__category 카테고리
      .collect-card__address  주소
      .collect-card__phone    전화번호
      .collect-card__distance 거리
      .collect-card__link     카카오맵 상세 링크
      .collect-card__save     담기 버튼 (담긴 상태: .is-saved)
  .collect-saved              담은 목록 섹션
    .collect-saved__count     담은 개수
    .collect-saved__list      담은 카드 리스트 (.collect-card 재사용)
  .collect-more               더보기 버튼
```

- 상태 표현은 `.is-*` 클래스와 `hidden` 속성만 사용한다(인라인 style 금지).
- logic은 JS에서 인라인 스타일을 넣지 않는다. design은 JS를 건드리지 않는다.

## 3. 디자인 토큰

- 컬러 팔레트는 `css/style.css`의 `:root` 토큰이 유일한 출처다. `collect.css`도 이 토큰을 재사용한다.
- **현재 히어로 섹션 디자인과 페이지 전체 컬러칩(`--color-point: #FFF67E` 포함 기존 팔레트)은 유지한다.** 에어비앤비 디자인 시스템은 레이아웃/간격/타이포 스케일/컴포넌트 형태에만 적용한다.

## 4. 반응형 브레이크포인트

모바일 375 / 태블릿 768 / 데스크탑 1440.

## 5. 커밋

팀원은 **커밋하지 않는다.** 작업 완료 후 리더에게 변경 파일 목록을 보고한다.

## 5-1. 카드 썸네일 폐기 (리더 결정)

카카오 로컬 API는 장소 이미지를 제공하지 않아 `.collect-card__thumb`는 이니셜 플레이스홀더에 불과했다.
**`.collect-card__thumb`를 계약에서 제거한다.** 카드는 텍스트만 노출한다.
- logic: 마크업/렌더에서 해당 요소를 삭제한다.
- design: `css/collect.css`에서 해당 규칙을 삭제하고 텍스트 전용 카드로 레이아웃을 다시 잡는다.

## 6. API 키 취급 (리더 결정, 절대 규칙)

- 카카오 REST API 키는 **브라우저에 절대 내려가지 않는다.** 서버(Vercel Serverless Function `api/kakao-search.js`)에서만 `process.env.KAKAO_REST_API_KEY`로 읽는다.
- `js/kakao-local.js`는 카카오를 직접 호출하지 않고 `/api/kakao-search`만 호출한다.
- 로컬 개발은 `vercel dev`로 실행한다(일반 정적 서버로는 `api/` 함수가 동작하지 않는다). `vercel dev`는 저장소 루트 **`.env`**를 자동으로 읽는다. 형식: `KAKAO_REST_API_KEY=키값`
- 배포 환경의 키는 Vercel 프로젝트 → Settings → Environment Variables에 등록한다.
- `.env`는 `.gitignore`에 등록되어 있다. **어떤 경우에도 커밋하지 않는다.**
- 키 값을 다른 파일(`collect.html`, `kakao-local.js`, `collect.js`, `api/kakao-search.js` 소스 외, 커밋 메시지, 로그)에 하드코딩하거나 복사하지 않는다.
- 저장소에 올라가는 템플릿은 `.env.example`(빈 값)뿐이다.
- 서버에 키가 없거나(`NO_KEY`) `/api/kakao-search`를 찾을 수 없으면(`NO_PROXY`, 정적 서버로 열었을 때) `.collect-status.is-error`로 안내를 띄우고, 카카오 API 호출은 시도하지 않는다.
- `js/env.js`(구 `.env` 브라우저 fetch 방식)와 `js/config.js` / `js/config.example.js`는 이 방식으로 대체되어 폐기한다.
