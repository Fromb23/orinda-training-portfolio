import { defineConfig, devices } from "@playwright/test";

const chromiumChannel = process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined);
const projects = [
  { name: "mobile-chromium", use: { ...devices["Pixel 7"], browserName: "chromium" as const, ...(chromiumChannel ? { channel: chromiumChannel } : {}) } },
  ...(process.env.PLAYWRIGHT_WEBKIT === "1" ? [{ name: "mobile-webkit", use: { ...devices["iPhone 13"], browserName: "webkit" as const } }] : []),
];

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: { headless: true },
  projects,
});
