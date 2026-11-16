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

function cookie(name: string, value: string, httpOnly: boolean) {
  const options = sessionCookieOptions(new Date(Date.now() + 60_000), httpOnly);
  const sameSite = options.sameSite[0].toUpperCase() + options.sameSite.slice(1);
  return `${name}=${value}; Path=${options.path}; Expires=${options.expires.toUTCString()}; SameSite=${sameSite}${options.httpOnly ? "; HttpOnly" : ""}`;
}

test.beforeAll(async () => {
  const css = await readFile(new URL("../../src/app/globals.css", import.meta.url), "utf8");
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
