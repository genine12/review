#!/usr/bin/env node
/**
 * scripts/dev-server.js — 의존성 없는 로컬 개발 서버.
 *
 * `vercel dev`(Vercel CLI 설치 + 로그인 필요)를 쓰지 않고도 api/*.js 서버 함수를
 * 포함해 collect.html을 로컬에서 확인할 수 있게 해준다.
 * 정적 파일은 그대로 서빙하고, `/api/xxx` 요청은 `api/xxx.js`가 내보내는
 * `(req, res) => {}` 핸들러(Vercel Serverless Function과 동일한 시그니처)에 바로 넘긴다.
 *
 * 저장소 루트의 .env(있으면)를 읽어 process.env에 넣어준다 — `vercel dev`와 같은 동작.
 * 이미 설정된 실제 환경변수는 덮어쓰지 않는다.
 *
 * 사용법: node scripts/dev-server.js [포트]  (기본 3000)
 *
 * 주의: api/*.js는 요청마다 require 캐시를 씁니다 — 해당 파일을 수정했다면
 * (핫 리로드 없음) 서버를 껐다 다시 켜야 반영됩니다. 실제 배포 환경과 100% 동일한
 * 동작을 확인하려면 `vercel dev`를 쓰세요.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.argv[2]) || 3000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

loadDotEnv();
startServer();

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    console.log(".env가 없어요 — api/*.js가 NO_KEY 에러를 돌려줄 거예요. .env.example을 .env로 복사해 키를 채워주세요.");
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r\n|\r|\n/);
  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (line === "" || line.charAt(0) === "#") return;
    const separator = line.indexOf("=");
    if (separator === -1) return;
    const key = line.slice(0, separator).trim();
    if (key === "" || process.env[key] !== undefined) return;
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2) {
      const first = value.charAt(0);
      const last = value.charAt(value.length - 1);
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    process.env[key] = value;
  });
}

function startServer() {
  http
    .createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        console.error(err);
        if (!res.headersSent) res.writeHead(500);
        res.end("Internal Server Error");
      });
    })
    .listen(PORT, () => {
      console.log(`로컬 개발 서버: http://localhost:${PORT}/collect.html`);
      console.log("정적 파일 + api/*.js 서버 함수 포함. Ctrl+C로 종료.");
    });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/api/")) {
    return handleApi(req, url, res);
  }
  return serveStatic(url, res);
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH") {
      resolve(undefined);
      return;
    }
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (raw === "") {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        resolve(undefined);
      }
    });
    req.on("error", () => resolve(undefined));
  });
}

async function handleApi(req, url, res) {
  const name = url.pathname.slice("/api/".length);
  // 경로 조작 방지: api/ 바로 아래 파일명만 허용한다.
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const handlerPath = path.join(ROOT, "api", name + ".js");
  if (!fs.existsSync(handlerPath)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const handler = require(handlerPath);
  const query = Object.fromEntries(url.searchParams.entries());
  const body = await readJsonBody(req);

  const vercelRes = {
    _statusCode: 200,
    status(code) {
      this._statusCode = code;
      return this;
    },
    json(body) {
      res.writeHead(this._statusCode, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    },
  };

  await handler({ query: query, body: body, method: req.method }, vercelRes);
}

function serveStatic(url, res) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/collect.html";

  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}
