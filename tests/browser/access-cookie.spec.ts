import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "@playwright/test";
import { CSRF_COOKIES, SESSION_COOKIES, sessionCookieOptions } from "../../src/lib/session-cookies";
import { AttachmentView } from "../../src/components/AttachmentView";

let server: Server;
let port: number;
let css = "";
let completedMutations = 0;

function cookie(name: string, value: string, httpOnly: boolean) {
  const options = sessionCookieOptions(new Date(Date.now() + 60_000), httpOnly);
  const sameSite = options.sameSite[0].toUpperCase() + options.sameSite.slice(1);
  return `${name}=${value}; Path=${options.path}; Expires=${options.expires.toUTCString()}; SameSite=${sameSite}${options.httpOnly ? "; HttpOnly" : ""}`;
}

test.beforeAll(async () => {
  css = await readFile(new URL("../../src/app/globals.css", import.meta.url), "utf8");
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (url.pathname === "/external") {
      response.setHeader("Content-Type", "text/html");
      response.end(`<a id="supervisor" href="http://localhost:${port}/access/supervisor?token=${"s".repeat(43)}">Open supervisor link</a><a id="management" href="http://localhost:${port}/access/management?token=${"m".repeat(43)}">Open management link</a>`);
      return;
    }
    if (url.pathname === "/viewer") {
      const attachments = [
        { id: "one", originalName: "Classroom observation photograph.jpg", mimeType: "image/jpeg", sizeBytes: 1250000, position: 0, uploadedAt: new Date().toISOString() },
        { id: "two", originalName: "Reflective practice notes.pdf", mimeType: "application/pdf", sizeBytes: 980000, position: 1, uploadedAt: new Date().toISOString() },
      ];
      const markup = renderToStaticMarkup(createElement(AttachmentView, { attachments }));
      response.setHeader("Content-Type", "text/html"); response.end(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>${markup}`); return;
    }
    if (url.pathname === "/visual") {
      const attachments = [{ id: "one", originalName: "Classroom observation photograph.jpg", mimeType: "image/jpeg", sizeBytes: 1250000, position: 0, uploadedAt: "2026-11-16T09:30:00.000Z" }];
      const markup = renderToStaticMarkup(createElement(AttachmentView, { attachments }));
      response.setHeader("Content-Type", "text/html");
      response.end(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><main><section class="hero"><div class="container hero-grid"><div><h1>Ogira Mark Orinda<span class="hero-role">Mathematics and Physics Educator</span></h1><p class="hero-summary">A reflective educator committed to clear explanations and learner growth.</p></div><div class="portrait-wrap"></div></div></section><section class="detail-page"><div class="container"><header class="assignment-intro"><p class="eyebrow">Published assignment</p><h1>Classroom management reflection</h1><p class="publication-date"><span>Published</span><time>16 Nov 2026, 12:30</time><span>Africa/Nairobi</span></p><p class="detail-description">A practical reflection on classroom routines.</p></header>${markup}</div></section></main>`);
      return;
    }
    if (url.pathname === "/manage-flow") {
      response.setHeader("Content-Type", "text/html");
      response.end("<meta name=\"viewport\" content=\"width=device-width\"><p>Management flow</p>");
      return;
    }
    if (url.pathname === "/api/manage/csrf" && request.method === "POST") {
      const sameOrigin = request.headers.origin === `http://localhost:${port}` && request.headers["sec-fetch-site"] !== "cross-site";
      const authenticated = (request.headers.cookie ?? "").includes("orinda_management_session=management-session");
      response.setHeader("Content-Type", "application/json");
      if (!sameOrigin) { response.writeHead(403); response.end(JSON.stringify({ error: "Cross-origin request denied." })); return; }
      if (!authenticated) { response.writeHead(401); response.end(JSON.stringify({ error: "Authorisation required." })); return; }
      response.setHeader("Set-Cookie", cookie(CSRF_COOKIES.MANAGEMENT, "session-bound-csrf", false));
      response.end(JSON.stringify({ ok: true })); return;
    }
    if (url.pathname === "/api/manage/mutation" && request.method === "POST") {
      const cookies = request.headers.cookie ?? "";
      response.setHeader("Content-Type", "application/json");
      if (!cookies.includes("orinda_management_session=management-session")) { response.writeHead(401); response.end(JSON.stringify({ error: "Authorisation required." })); return; }
      if (!cookies.includes("orinda_management_csrf=session-bound-csrf") || request.headers["x-csrf-token"] !== "session-bound-csrf") { response.writeHead(403); response.end(JSON.stringify({ error: "Invalid CSRF token.", code: "CSRF_INVALID" })); return; }
      completedMutations++;
      response.end(JSON.stringify({ ok: true })); return;
    }
    const match = url.pathname.match(/^\/access\/(management|supervisor)$/);
    if (match) {
      const role = match[1] === "management" ? "MANAGEMENT" : "SUPERVISOR";
      if ((url.searchParams.get("token") ?? "").length < 40) { response.writeHead(303, { Location: `/?access=invalid&role=${match[1]}` }); response.end(); return; }
      response.setHeader("Set-Cookie", [cookie(SESSION_COOKIES[role], `${match[1]}-session`, true), cookie(CSRF_COOKIES[role], `${match[1]}-csrf`, false)]);
      response.writeHead(303, { Location: role === "MANAGEMENT" ? "/manage" : "/portfolio" }); response.end(); return;
    }
    const cookies = request.headers.cookie ?? "";
    response.setHeader("Content-Type", "text/plain"); response.end(`${url.pathname}\n${cookies}`);
  });
  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
  port = (server.address() as AddressInfo).port;
});

test.afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("a fresh mobile browser accepts a role session through a cross-site top-level link", async ({ page, context }) => {
  await page.goto(`http://127.0.0.1:${port}/external`);
  await page.locator("#supervisor").click();
  await expect(page).toHaveURL(`http://localhost:${port}/portfolio`);
  await expect(page.locator("body")).toContainText("orinda_supervisor_session=supervisor-session");
  const cookies = await context.cookies();
  expect(cookies.find((item) => item.name === SESSION_COOKIES.SUPERVISOR)?.sameSite).toBe("Lax");
});

test("management and supervisor sessions coexist after independent full links", async ({ page, context }) => {
  await page.goto(`http://localhost:${port}/access/management?token=${"m".repeat(43)}`);
  await page.goto(`http://localhost:${port}/access/supervisor?token=${"s".repeat(43)}`);
  const names = (await context.cookies()).map((item) => item.name);
  expect(names).toContain(SESSION_COOKIES.MANAGEMENT);
  expect(names).toContain(SESSION_COOKIES.SUPERVISOR);
  await page.goto(`http://localhost:${port}/manage`);
  await expect(page.locator("body")).toContainText("orinda_management_session=management-session");
});

test("the same full supervisor link establishes independent fresh-device sessions", async ({ browser }) => {
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext(); const page = await context.newPage();
    await page.goto(`http://localhost:${port}/access/supervisor?token=${"s".repeat(43)}`);
    expect((await context.cookies()).some((item) => item.name === SESSION_COOKIES.SUPERVISOR)).toBe(true);
    await context.close();
  }
});

test("the real review markup and CSS keep controls usable at a mobile viewport", async ({ page }) => {
  await page.goto(`http://localhost:${port}/viewer`);
  await expect(page.getByText("File 1 of 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show previous file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show next file" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator(".attachment-selector ol").evaluate((element) => getComputedStyle(element).display)).toBe("flex");
  expect(await page.locator(".review-workspace").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(1);
});

test("a browser with a valid management session recovers a missing or stale CSRF cookie before one mutation retry", async ({ page }) => {
  await page.goto(`http://localhost:${port}/access/management?token=${"m".repeat(43)}`);
  await page.goto(`http://localhost:${port}/manage-flow`);
  for (const value of ["", "stale-token"]) {
    await page.evaluate((token) => { document.cookie = `orinda_management_csrf=${token}; path=/; ${token ? "" : "Max-Age=0"}`; }, value);
    const before = completedMutations;
    const result = await page.evaluate(async () => {
      const csrf = () => decodeURIComponent(document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("orinda_management_csrf="))?.slice("orinda_management_csrf=".length) ?? "");
      const mutate = () => fetch("/api/manage/mutation", { method: "POST", headers: { "X-CSRF-Token": csrf() } });
      let response = await mutate();
      const body = await response.json();
      if (response.status === 403 && body.code === "CSRF_INVALID") {
        const recovery = await fetch("/api/manage/csrf", { method: "POST" });
        if (!recovery.ok) return { status: recovery.status };
        response = await mutate();
      }
      return { status: response.status };
    });
    expect(result.status).toBe(200);
    expect(completedMutations).toBe(before + 1);
  }
});

test("computed hero and assignment styles remain readable from narrow mobile through desktop and 200% reflow", async ({ page }) => {
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://localhost:${port}/visual`);
    const layout = await page.locator(".hero-role").evaluate((element) => {
      const style = getComputedStyle(element);
      const role = element.getBoundingClientRect();
      const summary = document.querySelector(".hero-summary")!.getBoundingClientRect();
      return { letterSpacing: style.letterSpacing, lineHeight: parseFloat(style.lineHeight), fontSize: parseFloat(style.fontSize), roleBottom: role.bottom, summaryTop: summary.top, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
    });
    expect(layout.letterSpacing).toBe("normal");
    expect(layout.lineHeight).toBeGreaterThan(layout.fontSize);
    expect(layout.summaryTop).toBeGreaterThanOrEqual(layout.roleBottom);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    await expect(page.getByText("Mathematics and Physics Educator", { exact: true })).toBeVisible();
    await expect(page.locator(".assignment-facts")).toHaveCount(0);
    await expect(page.locator(".publication-date")).toBeVisible();
    await expect(page.locator(".file-metadata")).toContainText("Uploaded");
    await page.screenshot({ path: `test-results/visual-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 200, height: 700 });
  await page.goto(`http://localhost:${port}/visual`);
  await expect(page.getByText("Mathematics and Physics Educator", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/visual-200-percent-reflow.png", fullPage: true });
});
