import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
});
const p = await browser.newPage({ viewport: { width: 1672, height: 941 } });
const errors = [],
  checked = [];
p.on("pageerror", (e) => errors.push(e.message));
const output = "outputs/home-blue-demo";
fs.mkdirSync(output, { recursive: true });
try {
  await p.goto(
    "http://127.0.0.1:4177/demo/home-blue/?v=chapter-art-1#certificates",
    { waitUntil: "networkidle" },
  );
  await p.locator('.cert-radio[value="hcia-datacom"]').check();
  await p
    .locator('#cert-current [data-chapter-gallery="hcia-datacom"]')
    .click();
  await expect(p.locator("#chapter-visual-gallery")).toBeVisible();
  const catalog = await p.evaluate(() => AceChapterVisuals.catalog());
  assert.equal(catalog.certificates.length, 4);
  assert.equal(
    catalog.certificates.reduce((n, c) => n + c.chapters.length, 0),
    44,
  );
  assert(!catalog.certificates.some((c) => c.id === "veterinary-practitioner"));
  assert.equal(
    await p.evaluate(() => AceCertificates.active().id),
    "sichuan-upgrading-computer",
  );
  await p.emulateMedia({ reducedMotion: "no-preference" });
  for (const certificate of catalog.certificates) {
    await p.locator(`[data-cv-certificate="${certificate.id}"]`).click();
    await expect(p.locator(".cv-card")).toHaveCount(
      certificate.chapters.length,
    );
    for (const chapter of certificate.chapters) {
      const card = p.locator(`[data-cv-chapter="${chapter.id}"]`);
      await card.click();
      await expect(p.locator("#cv-preview .chapter-visual")).toHaveAttribute(
        "data-visual-kind",
        chapter.kind,
      );
      await expect(card.locator(".chapter-visual")).toHaveAttribute(
        "data-visual-kind",
        chapter.kind,
      );
      const xmlValid = await p.evaluate((kind) => {
        const parsed = new DOMParser().parseFromString(
          "<root>" + AceChapterVisuals.renderKind(kind) + "</root>",
          "application/xml",
        );
        return (
          !parsed.querySelector("parsererror") &&
          !parsed.querySelector("script,image,foreignObject")
        );
      }, chapter.kind);
      assert(xmlValid, chapter.kind);
      await card.hover();
      assert(
        await card.evaluate((el) =>
          el
            .getAnimations({ subtree: true })
            .some((a) => a.playState === "running"),
        ),
        "missing animation: " + chapter.kind,
      );
      await p.locator(".cv-stage").hover();
      assert(
        await p
          .locator(".cv-stage")
          .evaluate((el) =>
            el
              .getAnimations({ subtree: true })
              .some((a) => a.playState === "running"),
          ),
        "missing large animation: " + chapter.kind,
      );
      const sizes = await p.evaluate(() => ({
        small: document.querySelector(".cv-card-art").clientWidth,
        large: document.querySelector(".cv-stage").clientWidth,
      }));
      assert(
        sizes.small < sizes.large && sizes.small <= 72 && sizes.large <= 240,
      );
      checked.push({
        certificate: certificate.id,
        chapter: chapter.title,
        kind: chapter.kind,
        small: true,
        large: true,
        animation: true,
      });
    }
    await p.evaluate(() => {
      document.querySelector("#demo-dialog").scrollTop = 0;
    });
    await p.mouse.move(0, 0);
    await p.screenshot({
      path: `${output}/chapter-visuals-${certificate.id}.png`,
      animations: "disabled",
    });
  }
  await p.locator('[data-cv-certificate="hcia-datacom"]').click();
  await p.locator("#cv-search").fill("OSPF");
  await expect(p.locator(".cv-card")).toHaveCount(1);
  await p.locator("#cv-search").fill("不存在的章节");
  await expect(p.locator(".cv-empty")).toBeVisible();
  await p.locator("#cv-search").fill("");
  await expect(p.locator(".cv-card")).toHaveCount(22);
  const duplicateIds = await p.evaluate(() => {
    const ids = [
      ...document.querySelectorAll("#chapter-visual-gallery [id]"),
    ].map((e) => e.id);
    return ids.length !== new Set(ids).size;
  });
  assert.equal(duplicateIds, false);
  for (const theme of ["light", "dark"]) {
    await p.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    for (const width of [320, 375, 768, 1280, 1672]) {
      await p.setViewportSize({ width, height: 941 });
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 2,
        ),
      );
      const over = await p.evaluate(() =>
        [
          ...document.querySelectorAll(
            "#chapter-visual-gallery,.cv-card,#cv-preview",
          ),
        ]
          .filter((el) => el.scrollWidth > el.clientWidth + 2)
          .map((el) => el.className || el.id),
      );
      assert.deepEqual(over, [], `overflow ${theme}/${width}`);
    }
  }
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.locator("[data-cv-replay]").click();
  assert(
    await p
      .locator(".cv-stage")
      .evaluate((el) => el.getAnimations({ subtree: true }).length === 0),
  );
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await expect(p.locator("body")).toHaveAttribute(
    "data-reduced-motion",
    "false",
  );
  await p.evaluate(() => (document.body.dataset.reducedMotion = "true"));
  await p.locator(".cv-card").first().hover();
  assert(
    await p
      .locator(".cv-card")
      .first()
      .evaluate((el) => el.getAnimations({ subtree: true }).length === 0),
  );
  await p.evaluate(() => (document.body.dataset.reducedMotion = "false"));
  await p.setViewportSize({ width: 1672, height: 941 });
  await p.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await p.locator(".close-dialog").click();
  const studyRequests = [];
  p.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/demo-tutor/"))
      studyRequests.push(r.url());
  });
  for (const certificateId of [
    "network-engineer",
    "sichuan-upgrading-computer",
  ]) {
    const certificate = catalog.certificates.find(
      (c) => c.id === certificateId,
    );
    await p.evaluate((id) => AceChapterVisuals.open(id), certificateId);
    await p.locator("[data-cv-study]").click();
    await expect(p.locator("#ai-chapter-toggle")).toBeVisible();
    await expect(p.locator("#demo-dialog")).not.toBeVisible();
    for (const chapter of certificate.chapters) {
      await p.locator("#ai-chapter-toggle").click();
      const choice = p.locator("[data-ai-chapter]").filter({
        has: p.getByText(chapter.title, { exact: true }),
      });
      await expect(choice.locator(".chapter-visual")).toHaveAttribute(
        "data-visual-kind",
        chapter.kind,
      );
      await choice.hover();
      assert(
        await choice.evaluate((el) =>
          el
            .getAnimations({ subtree: true })
            .some((a) => a.playState === "running"),
        ),
      );
      await choice.click();
      await expect(p.locator("#ai-chapter-toggle")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(p.locator("#ai-chapter-current-name")).toHaveText(
        chapter.title,
      );
      await expect(
        p.locator("#ai-chapter-current-art .chapter-visual"),
      ).toHaveAttribute("data-visual-kind", chapter.kind);
      await expect(p.locator("#ai-header-art .chapter-visual")).toHaveAttribute(
        "data-visual-kind",
        chapter.kind,
      );
      for (const width of [375, 1672]) {
        await p.setViewportSize({ width, height: 941 });
        assert(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 2,
          ),
        );
      }
    }
  }
  await p.locator("#ai-chapter-toggle").focus();
  await p.keyboard.press("ArrowDown");
  await expect(p.locator("#ai-chapter-options")).toBeVisible();
  await expect(
    p.locator('[data-ai-chapter][aria-pressed="true"]'),
  ).toBeFocused();
  await p.keyboard.press("Home");
  await expect(p.locator('[data-ai-chapter="all"]')).toBeFocused();
  await p.keyboard.press("End");
  await expect(p.locator("[data-ai-chapter]").last()).toBeFocused();
  await p.keyboard.press("Escape");
  await expect(p.locator("#ai-chapter-toggle")).toBeFocused();
  await expect(p.locator("#ai-chapter-options")).toBeHidden();
  await p.locator("#ai-chapter-toggle").click();
  await p.locator('[data-ai-chapter="办公自动化"]').click();
  await p.mouse.move(0, 0);
  for (const theme of ["light", "dark"]) {
    await p.evaluate(() => actions.settings());
    await p.locator(`[data-pref="theme"][value="${theme}"]`).check();
    await p.locator("#settings-save").click();
    await p.evaluate(() => actions.ai());
    await expect(p.locator("#ai-chapter-toggle")).toBeVisible();
    await expect(p.locator("html")).toHaveAttribute("data-theme", theme);
    for (const width of [320, 375, 768, 1024, 1280, 1672]) {
      await p.setViewportSize({ width, height: 941 });
      await p.locator("#ai-chapter-toggle").click();
      const bounds = await p.evaluate(() => {
        const elements = [
          ...document.querySelectorAll(
            "#ai-chapter-options,.ai-chapter-choice,#ai-header-art,#ai-chapter-current-art",
          ),
        ];
        return elements
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.left < -2 ||
              r.right > innerWidth + 2 ||
              el.scrollWidth > el.clientWidth + 2
            );
          })
          .map((el) => el.className || el.id);
      });
      assert.deepEqual(bounds, [], `picker overflow ${theme}/${width}`);
      await p.emulateMedia({ reducedMotion: "reduce" });
      await expect(p.locator("html")).toHaveAttribute("data-theme", theme);
      // Read the static bounds; test the icon tiles, not just their SVG container.
      const tiles = await p
        .locator("#ai-chapter-options")
        .evaluate((options) => {
          const holders = [
            ...document.querySelectorAll(
              "#ai-header-art,#ai-chapter-current-art",
            ),
            options.querySelector(
              '[data-ai-chapter="办公自动化"] .ai-chapter-choice-art',
            ),
          ];
          return holders.flatMap((holder) =>
            [...holder.querySelectorAll(".office-tile")].map((tile) => {
              const r = tile.getBoundingClientRect(),
                h = holder.getBoundingClientRect();
              return (
                r.left >= h.left - 4 &&
                r.right <= h.right + 4 &&
                r.top >= h.top - 4 &&
                r.bottom <= h.bottom + 4
              );
            }),
          );
        });
      assert.equal(tiles.length, 9);
      assert(tiles.every(Boolean), `Office tiles overflow ${theme}/${width}`);
      assert.equal(
        await p
          .locator(".ai-chapter-picker")
          .evaluate((el) => el.getAnimations({ subtree: true }).length),
        0,
      );
      if (width === 1672 || width === 375)
        await p.screenshot({
          path: `${output}/ai-chapter-picker-${theme}-${width}.png`,
          animations: "disabled",
        });
      await p.keyboard.press("Escape");
      await p.emulateMedia({ reducedMotion: "no-preference" });
    }
  }
  await p.evaluate(() => (document.documentElement.dataset.theme = "light"));
  assert.deepEqual(
    studyRequests,
    [],
    "Selecting chapters must not start a tutor or spend quota",
  );
  for (const height of [600, 700]) {
    await p.setViewportSize({ width: 1280, height });
    await p.locator("#ai-chapter-toggle").click();
    const edges = await p.locator("#ai-chapter-options").evaluate((el) => {
      const box = el.getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        header: document.querySelector(".topbar").getBoundingClientRect()
          .bottom,
      };
    });
    assert(
      edges.top >= edges.header && edges.bottom <= height - 2,
      `short window menu overflow: ${JSON.stringify(edges)}`,
    );
    await p.keyboard.press("End");
    await expect(p.locator("[data-ai-chapter]").last()).toBeInViewport();
    await p.keyboard.press("Escape");
  }
  await p.setViewportSize({ width: 1672, height: 941 });
  await p.screenshot({
    path: `${output}/ai-chapter-visuals.png`,
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  const report = {
    certificates: 4,
    chapters: checked,
    excluded: ["veterinary-practitioner"],
    sizes: true,
    search: true,
    uniqueSvgIds: true,
    reducedMotion: true,
    widths: [320, 375, 768, 1024, 1280, 1672],
    themes: ["light", "dark"],
    aiChapters: 17,
    chapterPicker: true,
    keyboard: true,
    galleryStudyEntry: true,
    officeTilesContainment: true,
    noTutorRequests: true,
    shortWindows: [600, 700],
    errors,
  };
  fs.writeFileSync(
    `${output}/chapter-visuals-e2e.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify({ ...report, chapters: checked.length }));
} finally {
  await browser.close();
}
