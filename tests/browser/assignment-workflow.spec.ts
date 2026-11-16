import { expect, test } from "@playwright/test";

const managementUrl = process.env.E2E_MANAGEMENT_URL;
const supervisorUrl = process.env.E2E_SUPERVISOR_URL;
const enabled = Boolean(managementUrl && supervisorUrl);
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF") });

test.skip(!enabled, "Set E2E_MANAGEMENT_URL and E2E_SUPERVISOR_URL to run the database-backed assignment workflow.");

test("new, draft, retry/reorder, and direct republish workflows", async ({ browser }) => {
  const manager = await browser.newContext();
  const supervisor = await browser.newContext();
  const page = await manager.newPage();
  const review = await supervisor.newPage();

  await page.goto(managementUrl!);
  await page.getByRole("link", { name: "New assignment" }).click();
  await page.getByLabel("Title").fill("Direct publish assignment");
  await page.getByLabel("Description (optional)").fill("Exact first description");
  await page.getByLabel("Choose files").setInputFiles(pdf("direct.pdf"));
  await expect(page.getByText("1 uploaded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Assignment published successfully.", { exact: false })).toBeVisible();

  await review.goto(supervisorUrl!);
  await expect(review.getByText("Direct publish assignment")).toBeVisible();
  await review.getByText("Direct publish assignment").click();
  await expect(review.getByText("Exact first description")).toBeVisible();
  await expect(review.getByRole("heading", { name: "direct.pdf" })).toBeVisible();

  await page.goto(new URL("/manage", managementUrl!).toString());
  await page.getByRole("link", { name: "New assignment" }).click();
  await page.getByLabel("Description (optional)").fill("Resume this incomplete work");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved successfully.")).toBeVisible();
  await page.getByText("Untitled assignment").click();
  await expect(page.getByLabel("Description (optional)")).toHaveValue("Resume this incomplete work");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete assignment" }).click();
  await expect(page).toHaveURL(/\/manage$/);

  await page.getByRole("link", { name: "New assignment" }).click();
  await page.getByLabel("Title").fill("Ordered retry assignment");
  let failedOnce = false;
  await page.route("**/api/manage/assignments/*/attachments", async (route) => {
    if (!failedOnce && route.request().method() === "POST") { failedOnce = true; await route.abort("failed"); }
    else await route.continue();
  });
  await page.getByLabel("Choose files").setInputFiles([pdf("first.pdf"), pdf("second.pdf"), pdf("remove.pdf")]);
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("3 uploaded")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("article").filter({ hasText: "remove.pdf" }).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("2 uploaded")).toBeVisible();
  await page.getByRole("button", { name: "Move second.pdf earlier" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Assignment published successfully.", { exact: false })).toBeVisible();

  await page.getByText("Direct publish assignment").click();
  await page.getByLabel("Title").fill("Direct publish assignment updated");
  await page.getByLabel("Description (optional)").fill("Exact replacement description");
  await review.goto(new URL("/portfolio", supervisorUrl!).toString());
  await expect(review.getByText("Direct publish assignment")).toBeVisible();
  await expect(review.getByText("Direct publish assignment updated")).toHaveCount(0);
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(page.getByText("Assignment published successfully.", { exact: false })).toBeVisible();
  await review.reload();
  await expect(review.getByText("Direct publish assignment updated")).toBeVisible();
  await review.getByText("Direct publish assignment updated").click();
  await expect(review.getByText("Exact replacement description")).toBeVisible();

  // A supervisor-only session stays outside management and gets portfolio-scoped
  // recovery after an assignment is removed.
  await review.goto(new URL("/manage", supervisorUrl!).toString());
  await expect(review).not.toHaveURL(/\/manage$/);
  await review.goto(new URL("/portfolio", supervisorUrl!).toString());
  const directHref = await review.getByRole("link", { name: /Direct publish assignment updated/ }).getAttribute("href");
  await review.goto(new URL(directHref!, supervisorUrl!).toString());
  await page.goto(new URL(directHref!.replace("/portfolio/", "/manage/"), managementUrl!).toString());
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete assignment" }).click();
  await expect(page).toHaveURL(/\/manage$/);
  await review.reload();
  await expect(review.getByRole("link", { name: "Back to portfolio" })).toHaveAttribute("href", "/portfolio");

  // Even with both valid role sessions in the browser, route context wins.
  await review.goto(managementUrl!);
  await review.goto(new URL("/portfolio", supervisorUrl!).toString());
  const orderedHref = await review.getByRole("link", { name: /Ordered retry assignment/ }).getAttribute("href");
  await review.goto(new URL(orderedHref!, supervisorUrl!).toString());
  await page.goto(new URL(orderedHref!.replace("/portfolio/", "/manage/"), managementUrl!).toString());
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete assignment" }).click();
  await review.reload();
  await expect(review.getByRole("link", { name: "Back to portfolio" })).toHaveAttribute("href", "/portfolio");

  await page.goto(new URL("/manage/assignments/missing-assignment", managementUrl!).toString());
  await expect(page.getByRole("link", { name: "Back to assignments" })).toHaveAttribute("href", "/manage");

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(new URL("/unrelated-missing-page", managementUrl!).toString());
  await expect(visitor.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  await visitorContext.close();

  await manager.close();
  await supervisor.close();
});
