async (page) => {
  const localOrigin = new URL(page.url()).origin;
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
      constructor(pid = 0x622c, reachable = true) {
        super();
        this.vendorId = 0x093a;
        this.productId = pid;
        this.reachable = reachable;
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
        if (cmd === 0x8f)
          out = [cmd, 1, 3, this.productId === 0x522c ? 2 : 0, 0xf1, 0, 0, 0];
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
        if (cmd === 0x83 && !this.reachable) out = new Array(8).fill(0);
        return new DataView(new Uint8Array([9, ...out]).buffer);
      }
      async sendReport() {
        state.writes++;
      }
    }
    const device = new FakeDevice();
    const receiver = new FakeDevice(0x522c, false);
    window.mockDevices = { device, receiver };
    localStorage.setItem("incott-last-pid", String(0x522c));
    Object.defineProperty(window, "HIDDevice", { value: FakeDevice });
    Object.defineProperty(navigator, "hid", {
      value: {
        getDevices: async () => [receiver, device],
        requestDevice: async () => [device],
        addEventListener() {},
      },
    });
  });
  await page.goto(localOrigin + "/studio.html");
  await page
    .getByRole("status")
    .filter({ hasText: "当前配置已读取" })
    .waitFor();
  check(
    "initial reads do not write",
    await page.evaluate(() => mockHardware.writes === 0),
  );
  check(
    "unresponsive remembered receiver falls back to USB",
    await page.evaluate(
      () =>
        incott.snapshot.model === "G24" &&
        !incott.snapshot.wireless &&
        mockDevices.device.opened &&
        !mockDevices.receiver.opened,
    ),
  );
  check(
    "product name is incott网页驱动",
    (await page.title()) === "incott网页驱动",
  );
  await page.evaluate(() => {
    navigator.hid.requestDevice = async () => [mockDevices.receiver];
  });
  await page.getByRole("button", { name: "切换设备", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "当前接收器未返回 DPI 配置" })
    .waitFor();
  check(
    "failed receiver stays disconnected without writing defaults",
    await page.evaluate(
      () =>
        incott.snapshot === null &&
        mockHardware.writes === 0 &&
        !mockDevices.receiver.opened &&
        document.getElementById("apply").disabled &&
        document.getElementById("current-dpi").textContent === "—",
    ),
  );
  await page.evaluate(() => {
    navigator.hid.requestDevice = async () => [mockDevices.device];
  });
  await page.getByRole("button", { name: "连接鼠标 ↗", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "已读取鼠标当前配置" })
    .waitFor();
  check(
    "device chooser can recover from receiver failure",
    await page.evaluate(
      () => incott.snapshot?.wireless === false && mockHardware.writes === 0,
    ),
  );
  const feedback = page.getByRole("link", {
    name: "问题反馈（GitHub Issues）",
    exact: true,
  });
  const repository = page.getByRole("link", {
    name: "GitHub 仓库",
    exact: true,
  });
  check(
    "GitHub entry opens the project repository",
    (await repository.getAttribute("href")) ===
      "https://github.com/Caldis/incott-driver" &&
      (await repository.getAttribute("target")) === "_blank",
  );
  check(
    "feedback links to GitHub issue chooser",
    (await feedback.getAttribute("href")) ===
      "https://github.com/Caldis/incott-driver/issues/new/choose" &&
      (await feedback.getAttribute("target")) === "_blank",
  );

  check(
    "stylesheet applied",
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".studio-layout")).display ===
        "grid",
    ),
  );
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const documentNode = await cdp.send("DOM.getDocument");
  const fonts = {};
  for (const selector of [
    ".feedback-label",
    ".github-label",
    ".app-name",
    ".wordmark",
    "#original-link",
  ]) {
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: documentNode.root.nodeId,
      selector,
    });
    fonts[selector] = (
      await cdp.send("CSS.getPlatformFontsForNode", { nodeId })
    ).fonts;
  }
  check(
    "feedback and header glyphs all use the bundled font",
    Object.values(fonts).every(
      (items) => items.length > 0 && items.every((font) => font.isCustomFont),
    ),
  );
  await cdp.detach();
  check(
    "font cache key and preload match",
    await page.evaluate(() => {
      const preload = document.querySelector('link[as="font"]').href;
      return (
        /\?sha256=[a-f0-9]{12}$/.test(preload) &&
        Array.from(document.styleSheets).some((sheet) =>
          Array.from(sheet.cssRules).some(
            (rule) =>
              rule instanceof CSSFontFaceRule &&
              rule.style.src.includes(
                new URL(preload).pathname.split("/").pop() +
                  new URL(preload).search,
              ),
          ),
        )
      );
    }),
  );
  check(
    "bundled variable font loaded",
    await page.evaluate(() =>
      document.fonts.check('550 14px "Incott UI"', "按键定义"),
    ),
  );
  check(
    "UI text is at least 13px",
    await page.evaluate(() =>
      [
        ".binding",
        ".tabs button",
        ".category-nav button",
        ".save-state",
        ".palette-heading span",
      ].every(
        (selector) =>
          parseFloat(
            getComputedStyle(document.querySelector(selector)).fontSize,
          ) >= 13,
      ),
    ),
  );
  check(
    "six leaders follow actual key targets",
    (await page.locator("[data-button-line]").count()) === 6,
  );
  const keysTab = page.getByRole("tab", { name: "按键定义", exact: true });
  await keysTab.focus();
  await page.keyboard.press("ArrowRight");
  check(
    "tabs support arrow-key navigation",
    (await page
      .getByRole("tab", { name: "DPI 灵敏度", exact: true })
      .getAttribute("aria-selected")) === "true",
  );
  await page.keyboard.press("Home");

  await page.getByRole("tab", { name: "DPI 灵敏度", exact: true }).click();
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
  await page.getByRole("tab", { name: "性能设置", exact: true }).click();
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
  await page.getByRole("tab", { name: "按键定义", exact: true }).click();
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
  await page.getByRole("tab", { name: "宏", exact: true }).click();
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
  await page.getByRole("tab", { name: "按键定义", exact: true }).click();
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    check(
      "no horizontal overflow at " + width,
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  check(
    "feedback entry stays visible on narrow screens",
    (await feedback.isVisible()) &&
      (await feedback
        .boundingBox()
        .then((box) => box.x >= 0 && box.x + box.width <= 320)),
  );
  check(
    "GitHub entry stays visible on narrow screens",
    (await repository.isVisible()) &&
      (await repository
        .boundingBox()
        .then((box) => box.x >= 0 && box.x + box.width <= 320)),
  );
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.activeElement?.blur();
  });
  await page.screenshot({
    path: "output/playwright/polish-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: "output/playwright/polish-desktop.png",
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
