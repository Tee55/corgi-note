import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function showDetails(page: Page) {
  const details = page.locator("dialog .optional-details");
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
}
test("create with photo, revisit, filter, edit, export and delete; draft survives reload", async ({
  page,
  request,
}) => {
  const title = `Park adventure ${Date.now()}`;
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Little notes, happy tails." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add a note", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Dog’s name").fill("Mochi");
  await showDetails(page);
  await dialog.getByLabel("Memory title").fill(title);
  await dialog.getByLabel("Today’s story").fill("A lovely walk. สวัสดีโมจิ 🐾");
  await dialog.getByRole("button", { name: "Keep draft & close" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Add a note", exact: true }).click();
  await showDetails(page);
  await expect(dialog.getByLabel("Memory title")).toHaveValue(title);
  await dialog.getByLabel("Attach photos").setInputFiles({
    name: "dog.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await dialog
    .getByLabel("Photo 1 description")
    .fill("Mochi playing in the garden");
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search memories").fill("no match at all");
  await expect(
    page.getByRole("heading", { name: "No memories found" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByRole("link", { name: "Photos", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Mochi playing in the garden" }),
  ).toBeVisible();
  await page.getByRole("img", { name: "Mochi playing in the garden" }).click();
  await expect(
    dialog.getByText("A lovely walk.", { exact: false }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Edit note", exact: true }).click();
  await showDetails(page);
  await dialog.getByLabel("Memory title").fill(`${title} edited`);
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  await page.getByRole("link", { name: /My journal/ }).click();
  await page.getByLabel("Journal options", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notes" }).click();
  expect((await download).suggestedFilename()).toMatch(/corgi-note.*json/);
  await page
    .getByRole("button", { name: `${title} edited`, exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete note", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Delete this note?" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Keep note", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `${title} edited`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `${title} edited`, exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete note", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete note", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: `${title} edited`, exact: true }),
  ).not.toBeVisible();
});
test("failed save retains text and photo; keyboard modal behavior and automated accessibility", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add a note", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Dog’s name").fill("Buddy");
  await showDetails(page);
  await dialog.getByLabel("Memory title").fill("Draft after network error");
  await dialog
    .getByLabel("Today’s story")
    .fill("Keep this text after a failed request.");
  await dialog.getByLabel("Attach photos").setInputFiles({
    name: "dog.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await dialog
    .getByLabel("Photo 1 description")
    .fill("Buddy waiting for a walk");
  await page.route("**/api/entries/*", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Connection interrupted. Your draft is safe; please try again.",
      }),
    }),
  );
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Your draft is safe");
  await expect(dialog.getByLabel("Today’s story")).toHaveValue(
    "Keep this text after a failed request.",
  );
  await expect(dialog.locator(".upload-item img")).toBeVisible();
  await expect(dialog.getByLabel("Photo 1 description")).toHaveValue(
    "Buddy waiting for a walk",
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add a note", exact: true }),
  ).toBeFocused();
});
test("a confirmed server save stays successful when browser preferences cannot be written", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("corgi-dog-"))
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  const title = `Storage recovery ${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Add a note", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Dog’s name").fill("Buddy");
  await showDetails(page);
  await dialog.getByLabel("Memory title").fill(title);
  await dialog
    .getByLabel("Today’s story")
    .fill("A confirmed save should still succeed.");
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  const data = await (await request.get("/api/entries")).json();
  const saved = data.entries.find((e: { title: string }) => e.title === title);
  await request.delete(`/api/entries/${saved.id}?revision=${saved.revision}`);
});
test("320px reflow, text spacing, forced colors, desktop and mobile screenshots", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your memories", exact: false }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".corgi-friend").evaluate(async (el) => {
    await Promise.all(
      el
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({
    path: testInfo.outputPath("desktop.png"),
    fullPage: true,
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(
    page.getByRole("button", { name: "Add a note", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.addStyleTag({
    content:
      "* {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p{margin-bottom:2em!important}",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("mobile-stress.png"),
    fullPage: true,
  });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  expect(
    await page
      .locator(".corgi-tail")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await expect(
    page.getByRole("button", { name: "Add a note", exact: true }),
  ).toBeVisible();
});

test("quick note needs no title or optional details; filters and remembered dog still work", async ({
  page,
  request,
}, testInfo) => {
  const body = `An excellent afternoon nap ${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Add a note", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Memory title")).not.toBeVisible();
  await dialog.getByLabel("Dog’s name").fill("Waffles");
  await dialog.getByLabel("Today’s story").fill(body);
  await expect(
    dialog.getByRole("button", { name: "Save note", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("editor.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(
    dialog.getByRole("button", { name: "Save note", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("editor-mobile.png") });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: body, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add a note", exact: true }).click();
  await expect(dialog.getByLabel("Dog’s name")).toHaveValue("Waffles");
  await dialog.getByRole("button", { name: "Keep draft & close" }).click();
  await page.getByText("Filters", { exact: true }).click();
  await page
    .locator(".filter-panel")
    .getByRole("combobox", { name: "Activity", exact: true })
    .selectOption("Walk");
  await expect(
    page.getByRole("heading", { name: "No memories found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(
    page.getByRole("button", { name: body, exact: true }),
  ).toBeVisible();
  const data = await (await request.get("/api/entries")).json();
  const entry = data.entries.find((e: { title: string }) => e.title === body);
  await page
    .locator(".filter-panel")
    .getByLabel("Day", { exact: true })
    .fill(entry.date);
  await expect(
    page.getByRole("button", { name: body, exact: true }),
  ).toBeVisible();
  await request.delete(`/api/entries/${entry.id}?revision=${entry.revision}`);
});
