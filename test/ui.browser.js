async (page) => {
  const failures = [],
    checks = [];
  const check = (name, pass) => {
    checks.push({ name, pass });
    if (!pass) failures.push(name);
  };
  await page
    .context()
    .route("**/*", (route) =>
      new URL(route.request().url()).hostname === "127.0.0.1"
        ? route.continue()
        : route.abort(),
    );
  await page.addInitScript(() => {
    const state = {
      rate: 1,
      dpi: [7, 15, 31, 47, 63, 127],
      active: 2,
      count: 6,
      keys: [0xf00001, 0xf10001, 0xf20001, 0xf30001, 0xf40001, 0x30007],
      settings: [0, 1, 0, 0, 1, 1],
      debounce: 8,
      fire: [3, 10],
      cmd: new Uint8Array(8),
      writes: 0,
    };
    window.mockHardware = state;
    class FakeDevice extends EventTarget {
      constructor() {
        super();
        this.vendorId = 0x093a;
        this.productId = 0x622c;
        this.opened = false;
      }
      async open() {
        this.opened = true;
      }
      async close() {
        this.opened = false;
      }
      async sendFeatureReport(id, data) {
        state.cmd = Array.from(data);
        const [cmd, a, b, c, d, e] = data;
        if (cmd < 0x80) {
          state.writes++;
          if (cmd === 1) state.rate = a;
          if (cmd === 2) state.dpi[a] = b | (c << 8);
          if (cmd === 3) {
            state.count = a;
            state.active = b;
          }
          if (cmd === 4) state.settings[a] = b;
          if (cmd === 5 && a === 1) state.debounce = b;
          if (cmd === 5 && a === 2) state.fire = [b, c];
          if (cmd === 6) state.keys[a] = b | (c << 8) | (d << 16) | (e << 24);
        }
      }
      async receiveFeatureReport() {
        const [cmd, a] = state.cmd;
        let out = [cmd, 0, 0, 0, 0, 0, 0, 0];
        if (cmd === 0x8f) out = [cmd, 1, 3, 0, 0xf1, 0, 0, 0];
        if (cmd === 0x89) out = [cmd, 80, 0, state.rate, state.active, 0, 0, 0];
        if (cmd === 0x81) out[1] = state.rate;
        if (cmd === 0x82)
          out = [cmd, a, state.dpi[a] & 255, state.dpi[a] >> 8, 0, 0, 0, 0];
        if (cmd === 0x83) out = [cmd, state.count, state.active, 0, 0, 0, 0, 0];
        if (cmd === 0x84) out = [cmd, a, state.settings[a], 0, 0, 0, 0, 0];
        if (cmd === 0x85)
          out = [
            cmd,
            a,
            a === 1 ? state.debounce : state.fire[0],
            a === 2 ? state.fire[1] : 0,
            0,
            0,
            0,
            0,
          ];
        if (cmd === 0x86) {
          const raw = state.keys[a] || 0;
          out = [
            cmd,
            a,
            raw & 255,
            (raw >>> 8) & 255,
            (raw >>> 16) & 255,
            (raw >>> 24) & 255,
            0,
            0,
          ];
        }
        return new DataView(new Uint8Array([9, ...out]).buffer);
      }
      async sendReport() {
        state.writes++;
      }
    }
    const device = new FakeDevice();
    Object.defineProperty(window, "HIDDevice", { value: FakeDevice });
    Object.defineProperty(navigator, "hid", {
      value: {
        getDevices: async () => [device],
        requestDevice: async () => [device],
        addEventListener() {},
      },
    });
  });
  await page.goto("http://127.0.0.1:8765/studio.html");
  await page
    .getByRole("status")
    .filter({ hasText: "当前配置已读取" })
    .waitFor();
  check(
    "initial reads do not write",
    await page.evaluate(() => mockHardware.writes === 0),
  );
  check(
    "stylesheet applied",
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".studio-layout")).display ===
        "grid",
    ),
  );
  await page.getByRole("button", { name: "DPI 灵敏度", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "档位 6 DPI", exact: true })
    .fill("6500");
  await page
    .getByRole("spinbutton", { name: "档位 6 DPI", exact: true })
    .press("Tab");
  check(
    "editing only creates draft",
    await page.evaluate(
      () =>
        mockHardware.writes === 0 && IncottStudio.getDirty().includes("dpi:5"),
    ),
  );
  const before = await page.locator(".mouse-canvas").boundingBox();
  await page.getByRole("button", { name: "写入鼠标 ↗", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "回读校验通过" }).waitFor();
  check(
    "DPI write reaches transport and clears draft",
    await page.evaluate(
      () => mockHardware.dpi[5] === 129 && IncottStudio.getDirty().length === 0,
    ),
  );
  const after = await page.locator(".mouse-canvas").boundingBox();
  check(
    "write preserves mouse canvas geometry",
    JSON.stringify(before) === JSON.stringify(after),
  );
  await page.getByRole("button", { name: "性能设置", exact: true }).click();
  check(
    "wired UI caps rate at 1000 Hz",
    await page
      .locator("#setting-rate option")
      .allTextContents()
      .then(
        (options) =>
          !options.some(
            (x) =>
              x.includes("2000") || x.includes("4000") || x.includes("8000"),
          ),
      ),
  );
  await page.locator("#setting-debounce").selectOption("9");
  await page.getByRole("button", { name: "撤销修改", exact: true }).click();
  check(
    "discard restores original read value",
    (await page.locator("#setting-debounce").inputValue()) === "8",
  );
  await page.getByRole("button", { name: "按键定义", exact: true }).click();
  await page.getByRole("button", { name: "互换左右键", exact: true }).click();
  check(
    "swap updates only pending bindings",
    await page.evaluate(
      () =>
        IncottStudio.getDraft().keyCodes[0] === 0xf10001 &&
        mockHardware.keys[0] === 0xf00001,
    ),
  );
  await page.getByRole("button", { name: "撤销修改", exact: true }).click();
  await page.getByRole("button", { name: "键盘按键", exact: true }).click();
  await page
    .getByRole("textbox", { name: "搜索功能", exact: true })
    .fill("F13");
  check(
    "key search filters palette",
    (await page.locator("[data-binding-choice]").count()) === 1,
  );
  await page.getByRole("button", { name: "宏", exact: true }).click();
  await page.getByRole("button", { name: "● 录制按键", exact: true }).click();
  await page.keyboard.press("KeyA");
  await page.keyboard.press("Escape");
  check(
    "macro captures down and up",
    (await page.locator(".macro-event").count()) === 2,
  );
  await page.getByRole("button", { name: "保存宏", exact: true }).click();
  check(
    "macro saved locally",
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("incott-studio-macros")).length === 1,
    ),
  );
  await page
    .getByRole("button", { name: "＋ 保存当前设置", exact: true })
    .click();
  await page.locator("#preset-name").fill("测试预设");
  await page.getByRole("button", { name: "保存预设", exact: true }).click();
  check(
    "preset saved locally",
    (await page
      .getByRole("button", { name: "测试预设", exact: true })
      .count()) === 1,
  );
  await page.getByRole("button", { name: "按键定义", exact: true }).click();
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    check(
      "no horizontal overflow at " + width,
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.screenshot({ path: "evidence/studio-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: "evidence/studio-ui-test.png",
    fullPage: true,
  });
  check(
    "invalid import is rejected",
    await page.evaluate(() => {
      try {
        IncottStudio.validateConfig({
          format: "incott-studio",
          version: 1,
          dpi: [],
        });
        return false;
      } catch {
        return true;
      }
    }),
  );
  await page.evaluate(() => {
    window.uiReport = null;
  });
  const result = {
    checks,
    failures,
    passed: checks.filter((x) => x.pass).length,
  };
  await page.evaluate((value) => {
    window.uiReport = value;
  }, result);
  return result;
}
