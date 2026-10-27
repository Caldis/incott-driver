/* The HID report format, VID/PID, key/macro encoders and timings come from the
 * archived driver. This adapter serializes access and separates reads/drafts.
 * No vendor DOM, timers or profile writer is loaded by studio.html. */
const dvar = {
  key: [
    { matrix: 0 },
    { matrix: 1 },
    { matrix: 2 },
    { matrix: 4 },
    { matrix: 3 },
    { matrix: 5 },
  ],
  dpi: [400, 800, 1600, 2400, 3200, 6400],
  defDPIInx: 1,
};
const lpUntilKeyRelease = 1,
  lpUntilAnyKey = 2,
  lpCycle = 3;
const bufferToHexString = (buffer, start, length) =>
  Array.from(
    new Uint8Array(buffer.buffer || buffer).slice(start, start + length),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join(" ");
async function _nfmekzxlqota(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function _5o2woknpwy1q(event) {
  if (
    event.reportId !== 9 ||
    !ace ||
    event.device !== ace.handle ||
    event.data.byteLength < 5
  )
    return;
  const data = event.data;
  if (data.getUint8(4) === 1) {
    window.dispatchEvent(new CustomEvent("incott-profile-key"));
    return;
  }
  ace.charging = data.getUint8(0);
  ace.power = Math.floor(data.getUint8(1) / 10) * 10;
  ace.curDpi = data.getUint8(2);
  ace.online = true;
  window.dispatchEvent(new CustomEvent("incott-input"));
}
function _7pibxxbd9zc9(value) {
  window.dispatchEvent(new CustomEvent("incott-progress", { detail: value }));
}
function _jpjzckmpdn3e(value) {
  _7pibxxbd9zc9(value);
}
function _nci91wo0vpg0() {
  return 0;
}

class IncottHardware extends CBAccess {
  async sendData(data) {
    if (this.cancelled) return false;
    return super.sendData(data);
  }
  // Vendor method references an undefined `lod` instead of its argument.
  async setSensorMode(mode) {
    if (!Number.isInteger(mode) || mode < 0 || mode > 2) return false;
    return this.sendData(new Uint8Array([4, 5, mode, 0, 0, 0, 0, 0]));
  }
}

class IncottController extends EventTarget {
  constructor() {
    super();
    this.device = null;
    this.snapshot = null;
    this.busy = false;
    this.fault = false;
    this.macroCache = {};
    this.diagnostics = [];
    if (navigator.hid)
      navigator.hid.addEventListener("disconnect", (event) => {
        if (event.device === this.device?.handle) {
          this.device.online = false;
          this.snapshot = null;
          this.dispatchEvent(new Event("disconnect"));
        }
      });
  }
  async exclusive(operation) {
    if (this.busy) throw new Error("设备正在通信，请稍候。");
    if (this.fault) throw new Error("上一次通信超时，请重新插拔鼠标后连接。");
    this.busy = true;
    this.dispatchEvent(new Event("busy"));
    let timer;
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            this.fault = true;
            if (this.device) {
              this.device.cancelled = true;
              this.device.handle?.close().catch(() => {});
            }
            reject(new Error("设备通信超时，请重新插拔鼠标后连接。"));
          }, 25000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      this.busy = false;
      this.dispatchEvent(new Event("busy"));
    }
  }
  async connect(automatic = false) {
    if (!navigator.hid || !window.isSecureContext)
      throw new Error("请用 Chrome 或 Edge，在本机地址打开驱动。");
    if (this.fault) throw new Error("请重新插拔鼠标并刷新页面，再连接。");
    if (this.busy) throw new Error("设备正在通信，请稍候。");
    const known = (await navigator.hid.getDevices()).filter(
      (device) =>
        device.vendorId === 0x093a &&
        [0x622c, 0x522c].includes(device.productId),
    );
    if (automatic && !known.length) return null;
    let candidates = known;
    if (automatic) {
      let preferred = this.device?.curpid;
      try {
        preferred ||= Number(window.localStorage?.getItem("incott-last-pid"));
      } catch {}
      candidates = [...known].sort(
        (a, b) =>
          (b.productId === preferred ? 2 : b.productId === 0x622c ? 1 : 0) -
          (a.productId === preferred ? 2 : a.productId === 0x622c ? 1 : 0),
      );
    } else {
      // A human may take longer than the HID-operation deadline to choose.
      // Hold the UI busy, but start the hardware timer only after selection.
      this.busy = true;
      this.dispatchEvent(new Event("busy"));
      try {
        candidates = await navigator.hid.requestDevice({
          filters: [
            {
              vendorId: 0x093a,
              productId: 0x622c,
              usagePage: 0xff05,
              usage: 1,
            },
            {
              vendorId: 0x093a,
              productId: 0x522c,
              usagePage: 0xff05,
              usage: 1,
            },
          ],
        });
      } finally {
        this.busy = false;
        this.dispatchEvent(new Event("busy"));
      }
      if (!candidates.length)
        throw new Error("未连接鼠标。请选择 Incott 鼠标或接收器。");
    }
    return this.exclusive(async () => {
      let failure;
      for (const found of candidates) {
        try {
          if (this.device?.isopend() && this.device.handle !== found)
            await this.device.handle.close();
          this.snapshot = null;
          ace = new IncottHardware();
          this.device = ace;
          if (!found.opened) await found.open();
          ace.handle = found;
          ace.opened = true;
          ace.curpid = found.productId;
          ace.iswireless = found.productId === 0x522c;
          found.oninputreport = _5o2woknpwy1q;
          if (!(await ace.readPSD()) || !["G23", "G24"].includes(ace.devname)) {
            throw new Error("设备型号未在当前支持范围内，请查看兼容性列表。");
          }
          ace.online = true;
          await ace.readInfo();
          ace.curOnBoard = await ace.readProfileIndex();
          const state = await this.read();
          try {
            window.localStorage?.setItem(
              "incott-last-pid",
              String(found.productId),
            );
          } catch {}
          return state;
        } catch (error) {
          failure = error;
          await found.close().catch(() => {});
          this.device = null;
          this.snapshot = null;
          if (this.fault) throw error;
        }
      }
      this.dispatchEvent(new Event("disconnect"));
      throw failure || new Error("没有可读取的设备。");
    });
  }
  async readResponse(command, selector) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!this.device || this.device.cancelled) return null;
      const logStart = this.device.logText?.length || 0;
      const data = await this.device.readDevice(command, selector);
      const valid =
        !!data &&
        data[0] === command &&
        (selector === undefined || data[1] === selector);
      this.diagnostics.push({
        command,
        selector,
        attempt: attempt + 1,
        pid: this.device.curpid,
        response: data ? Array.from(data) : null,
        valid,
        detail: valid ? "" : this.device.logText?.slice(logStart),
      });
      if (this.diagnostics.length > 24) this.diagnostics.shift();
      if (valid) return Array.from(data);
      if (attempt < 2) await _nfmekzxlqota(50);
    }
    return null;
  }
  async read() {
    const dev = this.device;
    if (!dev?.isopend()) throw new Error("请先连接鼠标。");
    if (!(await dev.readInfo())) throw new Error("无法读取设备状态。");
    const dpiInfo = await this.readResponse(0x83);
    if (!dpiInfo) {
      throw new Error(
        dev.iswireless
          ? "当前接收器未返回 DPI 配置，请重新选择 USB 有线鼠标。"
          : "DPI 档位读取失败，请重新选择设备后重试。",
      );
    }
    if (
      dpiInfo.length < 3 ||
      dpiInfo[1] < 1 ||
      dpiInfo[1] > 6 ||
      dpiInfo[2] >= dpiInfo[1]
    )
      throw new Error(
        "设备返回的 DPI 档位数据不符合原驱动格式，未更改鼠标设置。",
      );
    const snapshot = {
      format: "incott-studio",
      version: 1,
      model: dev.devname,
      sensor: dev.sensor,
      wireless: dev.iswireless,
      is8KReceiver: dev.is8KReceiver,
      power: dev.power,
      charging: dev.charging,
      activeDpi: dpiInfo[2],
      dpiCount: dpiInfo[1],
      dpi: [],
      keyCodes: [],
      rate: await dev.readUsbRate(),
      debounce: await dev.readDebounce(),
      sleep: await dev.readSleep(),
      settings: {},
      macros: {},
    };
    for (let index = 0; index < 6; index++) {
      const raw = await dev.readDPI(index);
      snapshot.dpi.push(raw === null ? null : (raw + 1) * 50);
      snapshot.keyCodes.push(await dev.readKEY(dvar.key[index].matrix));
    }
    for (const [name, selector] of Object.entries({
      lod: 1,
      ripple: 2,
      fixline: 3,
      motion: 4,
      sensorMode: 5,
    })) {
      const data = await this.readResponse(0x84, selector);
      const max = ["lod", "sensorMode"].includes(name) ? 2 : 1;
      snapshot.settings[name] = data && data[2] <= max ? data[2] : null;
    }
    const fire = await this.readResponse(0x85, 2);
    snapshot.fireLoops = fire && fire[2] <= 3 ? fire[2] : null;
    snapshot.fireInterval = fire ? fire[3] : null;
    if (snapshot.is8KReceiver)
      snapshot.receiverLED = await dev.readReceiverLED();
    for (const [index, macro] of Object.entries(this.macroCache))
      if (snapshot.keyCodes[index] === ((Number(index) << 16) | 9))
        snapshot.macros[index] = structuredClone(macro);
    if (
      snapshot.rate === null ||
      snapshot.debounce === null ||
      snapshot.dpi.some((x) => x === null) ||
      snapshot.keyCodes.some((x) => x === null)
    )
      throw new Error("部分配置读取失败，请重试，未使用默认值覆盖。");
    this.snapshot = snapshot;
    dev.logText = "";
    this.dispatchEvent(new Event("read"));
    return structuredClone(snapshot);
  }
  async refresh() {
    return this.exclusive(() => this.read());
  }
  async apply(draft, dirty) {
    return this.exclusive(async () => {
      if (!this.snapshot || !this.device?.isopend())
        throw new Error("请先连接鼠标。");
      const dev = this.device;
      const verified = [];
      let failure = null,
        macroSent = false;
      for (const name of dirty) {
        try {
          let ok = false,
            readback = null,
            expected;
          if (name.startsWith("key:")) {
            const index = Number(name.split(":")[1]);
            expected = draft.keyCodes[index];
            if (draft.macros[index]) {
              const macro = structuredClone(draft.macros[index]);
              macro.item = macro.item.map((item) => ({
                ...item,
                key: vkPOS.find((key) => key[0] === item.key)?.[1] || item.key,
              }));
              const bytes = dev.macro_to_hw(macro, index);
              if (!bytes || !(await dev.setMacro(index, bytes)))
                throw new Error("宏数据发送失败。");
              // G24 feature report 9 is eight bytes; 0x87 returned FF rather
              // than macro data on the tested firmware. Do not fake readback.
              this.macroCache[index] = structuredClone(draft.macros[index]);
              macroSent = true;
            }
            ok = await dev.setKEY(dvar.key[index].matrix, expected);
            await _nfmekzxlqota(60);
            readback = await dev.readKEY(dvar.key[index].matrix);
          } else if (name.startsWith("dpi:")) {
            const index = Number(name.split(":")[1]);
            expected = draft.dpi[index];
            ok = await dev.setDPI(index, expected / 50 - 1, expected / 50 - 1);
            await _nfmekzxlqota(60);
            const raw = await dev.readDPI(index);
            readback = raw === null ? null : (raw + 1) * 50;
          } else if (name === "activeDpi" || name === "dpiCount") {
            expected = name === "activeDpi" ? draft.activeDpi : draft.dpiCount;
            ok = await dev.setDpiInfo(draft.activeDpi, draft.dpiCount);
            await _nfmekzxlqota(60);
            const data = await this.readResponse(0x83);
            readback = data?.[name === "activeDpi" ? 2 : 1];
          } else if (name === "fireLoops" || name === "fireInterval") {
            expected = draft[name];
            ok = await dev.setFireKeyParam(draft.fireLoops, draft.fireInterval);
            await _nfmekzxlqota(60);
            const data = await this.readResponse(0x85, 2);
            readback = data?.[name === "fireLoops" ? 2 : 3];
          } else if (
            ["rate", "debounce", "sleep", "receiverLED"].includes(name)
          ) {
            const methods = {
              rate: ["setUsbRate", "readUsbRate"],
              debounce: ["setDebounce", "readDebounce"],
              sleep: ["setSleep", "readSleep"],
              receiverLED: ["setReceiverLED", "readReceiverLED"],
            }[name];
            expected = draft[name];
            ok = await dev[methods[0]](expected);
            await _nfmekzxlqota(60);
            readback = await dev[methods[1]]();
          } else if (name.startsWith("setting:")) {
            const key = name.split(":")[1];
            expected = draft.settings[key];
            const [method, selector] = {
              lod: ["setLOD", 1],
              ripple: ["setRipple", 2],
              fixline: ["setFixline", 3],
              motion: ["setMotion", 4],
              sensorMode: ["setSensorMode", 5],
            }[key];
            ok = await dev[method](expected);
            await _nfmekzxlqota(60);
            readback = (await this.readResponse(0x84, selector))?.[2];
          }
          if (!ok || readback !== expected)
            throw new Error("设备回读与目标值不一致。");
          verified.push(name);
        } catch (error) {
          failure = `${name}：${error.message}`;
          break;
        }
      }
      await this.read();
      return {
        verified,
        failure,
        macroSent,
        snapshot: structuredClone(this.snapshot),
      };
    });
  }
}
window.IncottController = IncottController;
