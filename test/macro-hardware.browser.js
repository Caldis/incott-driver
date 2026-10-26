async (page) => {
  return await page.evaluate(async () => {
    const dev = incott.device;
    const previous = await incott.exclusive(() => dev.readKEY(5));
    if (previous !== 0x30007)
      throw new Error("DPI key has a custom binding; skip this test.");
    const report = {
      started: new Date().toISOString(),
      sent: false,
      down: 0,
      up: 0,
      restored: false,
      previous,
    };
    window.macroHardwareTest = report;
    let timer,
      finished = false;
    const finish = async (reason) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      report.reason = reason;
      try {
        await incott.exclusive(async () => {
          await dev.setKEY(5, previous);
          await new Promise((r) => setTimeout(r, 80));
          report.restored = (await dev.readKEY(5)) === previous;
          await incott.read();
        });
      } catch (error) {
        report.error = error.message;
      }
      document.getElementById("notice").textContent = report.restored
        ? "宏测试结束，DPI 键已恢复。"
        : "DPI 键恢复失败，请联系我继续处理。";
    };
    const down = (event) => {
      if (event.code === "F13") {
        event.preventDefault();
        report.down++;
      }
    };
    const up = (event) => {
      if (event.code === "F13") {
        event.preventDefault();
        report.up++;
        finish("F13 received");
      }
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    try {
      await incott.exclusive(async () => {
        const bytes = dev.macro_to_hw(
          {
            looptype: 3,
            cycle: 1,
            uid: Date.now(),
            item: [
              { key: "F13", press: true, delay: 50 },
              { key: "F13", press: false, delay: 50 },
            ],
          },
          5,
        );
        report.sent = await dev.setMacro(5, bytes);
        if (!report.sent) throw new Error("Macro report send failed.");
        if (!(await dev.setKEY(5, (5 << 16) | 9)))
          throw new Error("Macro key binding failed.");
        await new Promise((r) => setTimeout(r, 80));
        report.bindingReadback = await dev.readKEY(5);
      });
      timer = setTimeout(() => finish("timeout"), 120000);
      document.getElementById("notice").textContent =
        "宏测试：保持这个 Chrome 窗口在前台，按一下鼠标中间的 DPI 键。完成后自动恢复。";
      return report;
    } catch (error) {
      await finish("setup failed");
      throw error;
    }
  });
}
