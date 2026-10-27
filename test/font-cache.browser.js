// Before running, extract the old font into output/playwright/font-before-feedback.woff2.
// See WORKLOG.md for the original commit and the reproduced missing-glyph cause.
async (page) => {
  const origin = new URL(page.url()).origin;
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "hid", {
      value: { getDevices: async () => [], addEventListener() {} },
    }),
  );
  let oldFontRequests = 0;
  const fontRoute = (url) =>
    url.pathname.endsWith("/fonts/incott-ui-v1.woff2") && !url.search;
  await page.route(fontRoute, (route) => {
    oldFontRequests++;
    return route.fulfill({
      path: "output/playwright/font-before-feedback.woff2",
      contentType: "font/woff2",
    });
  });
  const cssRoute = "**/studio.css?*";
  await page.route(cssRoute, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /fonts\/incott-ui-v1\.woff2\?sha256=[a-f0-9]+/g,
      "fonts/incott-ui-v1.woff2",
    );
    return route.fulfill({ response, body });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const actualFonts = async () => {
    await page.evaluate(() => document.fonts.ready);
    const { root } = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: ".feedback-label",
    });
    return (await cdp.send("CSS.getPlatformFontsForNode", { nodeId })).fonts;
  };
  await page.goto(origin + "/studio.html");
  const before = await actualFonts();
  const oldRequestsBeforeFix = oldFontRequests;
  await page.unroute(cssRoute);
  await page.reload();
  const after = await actualFonts();
  const result = {
    oldFontRequests,
    before,
    after,
    oldMissingGlyphsReproduced: before.some(
      (font) => !font.isCustomFont && font.glyphCount === 4,
    ),
    currentGlyphsAllBundled:
      after.length > 0 && after.every((font) => font.isCustomFont),
    newURLBypassesOldCache:
      oldRequestsBeforeFix > 0 && oldFontRequests === oldRequestsBeforeFix,
  };
  await cdp.detach();
  await page.evaluate((value) => (window.fontCacheReport = value), result);
  return result;
}
