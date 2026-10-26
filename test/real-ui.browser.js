async (page) => {
  const baseline = await page.evaluate(() => incott.snapshot.debounce);
  if (baseline !== 8)
    throw new Error("Expected the previously captured 8 ms baseline.");
  const target = page.getByRole("tab", { name: "性能设置", exact: true });
  await target.click();
  let wrote = false,
    restored = false;
  try {
    await page.locator("#setting-debounce").selectOption("9");
    await page.getByRole("button", { name: "写入鼠标 ↗", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "回读校验通过" })
      .waitFor();
    wrote = await page.evaluate(
      () =>
        incott.snapshot.debounce === 9 && IncottStudio.getDirty().length === 0,
    );
  } finally {
    await page.locator("#setting-debounce").selectOption("8");
    await page.getByRole("button", { name: "写入鼠标 ↗", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "回读校验通过" })
      .waitFor();
    restored = await page.evaluate(
      () =>
        incott.snapshot.debounce === 8 && IncottStudio.getDirty().length === 0,
    );
  }
  const report = {
    wrote,
    restored,
    console: "see browser console",
    date: new Date().toISOString(),
  };
  await page.evaluate((value) => (window.realUiReport = value), report);
  await page.getByRole("tab", { name: "按键定义", exact: true }).click();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.activeElement?.blur();
  });
  await page.screenshot({
    path: "evidence/studio-real-device.png",
    fullPage: true,
  });
  return report;
}
