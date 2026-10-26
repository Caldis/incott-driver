async (page) => {
  return await page.evaluate(async () => {
    const report = {
      date: new Date().toISOString(),
      model: incott.snapshot?.model,
      tests: [],
      restored: false,
    };
    const check = (name, expected, actual) =>
      report.tests.push({
        name,
        expected,
        actual,
        pass: JSON.stringify(expected) === JSON.stringify(actual),
      });
    await incott.exclusive(async () => {
      const dev = incott.device,
        base = structuredClone(incott.snapshot);
      const delay = () => new Promise((resolve) => setTimeout(resolve, 65));
      let fire = await incott.readResponse(0x85, 2);
      try {
        for (const rate of [125, 250, 500, 1000, 2000, 4000, 8000]) {
          await dev.setUsbRate(rate);
          await delay();
          check("rate " + rate, rate, await dev.readUsbRate());
        }
        for (const [name, selector, setter, values] of [
          ["lod", 1, "setLOD", [0, 1, 2]],
          ["ripple", 2, "setRipple", [0, 1]],
          ["fixline", 3, "setFixline", [0, 1]],
          ["motion", 4, "setMotion", [0, 1]],
          ["sensorMode", 5, "setSensorMode", [0, 1, 2]],
        ]) {
          for (const value of values) {
            await dev[setter](value);
            await delay();
            check(
              name + " " + value,
              value,
              (await incott.readResponse(0x84, selector))?.[2],
            );
          }
        }
        for (const value of [0, 8, 30]) {
          await dev.setDebounce(value);
          await delay();
          check("debounce " + value, value, await dev.readDebounce());
        }
        for (const value of [50, 1600, 32000]) {
          const raw = value / 50 - 1;
          await dev.setDPI(5, raw, raw);
          await delay();
          check(
            "inactive DPI " + value,
            value,
            ((await dev.readDPI(5)) + 1) * 50,
          );
        }
        for (const value of [0, 1, 2, 3]) {
          await dev.setFireKeyParam(value, 10);
          await delay();
          check(
            "fire loops " + value,
            value,
            (await incott.readResponse(0x85, 2))?.[2],
          );
        }
        const enc = new IncottHardware();
        for (const minor of [1, 2, 3, 4, 5, 12, 13, 14, 15, 17, 18]) {
          const raw = enc.keyinfo_to_hw({ major: 1, minor }, 5);
          await dev.setKEY(5, raw);
          await delay();
          check("mouse binding " + minor, raw, await dev.readKEY(5));
        }
        for (const info of [
          { major: 2, minor: 4, modifer: 0 },
          { major: 2, minor: 4, modifer: 1 },
          { major: 3, minor: 2 },
          { major: 3, minor: 8 },
        ]) {
          const raw = enc.keyinfo_to_hw(info, 5);
          await dev.setKEY(5, raw);
          await delay();
          check(
            "key binding " + JSON.stringify(info),
            raw,
            await dev.readKEY(5),
          );
        }
        for (const active of [0, 2, 5]) {
          await dev.setDpiInfo(active, 6);
          await delay();
          check(
            "active DPI " + active,
            active,
            (await incott.readResponse(0x83))?.[2],
          );
        }
      } finally {
        // Restore every changed field regardless of the first test failure.
        const errors = [];
        const restore = async (name, fn) => {
          try {
            await fn();
            await delay();
          } catch (error) {
            errors.push(name + ": " + error.message);
          }
        };
        await restore("key5", () => dev.setKEY(5, base.keyCodes[5]));
        await restore("dpi5", () =>
          dev.setDPI(5, base.dpi[5] / 50 - 1, base.dpi[5] / 50 - 1),
        );
        await restore("dpiInfo", () =>
          dev.setDpiInfo(base.activeDpi, base.dpiCount),
        );
        await restore("rate", () => dev.setUsbRate(base.rate));
        await restore("debounce", () => dev.setDebounce(base.debounce));
        for (const [name, method] of Object.entries({
          lod: "setLOD",
          ripple: "setRipple",
          fixline: "setFixline",
          motion: "setMotion",
          sensorMode: "setSensorMode",
        }))
          await restore(name, () => dev[method](base.settings[name]));
        await restore("fire", () => dev.setFireKeyParam(fire[2], fire[3]));
        const after = await incott.read();
        for (const name of [
          "keyCodes",
          "dpi",
          "activeDpi",
          "dpiCount",
          "rate",
          "debounce",
          "settings",
        ])
          check("restore " + name, base[name], after[name]);
        report.restoreErrors = errors;
        report.restored =
          errors.length === 0 &&
          report.tests
            .filter((x) => x.name.startsWith("restore "))
            .every((x) => x.pass);
        report.after = after;
      }
    });
    report.passed = report.tests.filter((x) => x.pass).length;
    report.failed = report.tests.filter((x) => !x.pass);
    window.hardwareReport = report;
    return report;
  });
}
