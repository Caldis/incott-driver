(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    clone = (value) => structuredClone(value);
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const controller = new IncottController();
  window.incott = controller;
  let draft = null,
    tab = "keys",
    category = "mouse",
    selected = 0,
    query = "",
    modifiers = 0,
    testing = false;
  const dirty = new Set(),
    names = ["左键", "右键", "滚轮按下", "前侧键", "后侧键", "DPI 键"];
  const storage = {
    get(key, fallback) {
      try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        notice("本地存储不可用，请导出文件保留设置。", "error");
        return false;
      }
    },
  };
  let presets = storage.get("incott-studio-presets", []),
    macros = storage.get("incott-studio-macros", []);
  if (!Array.isArray(presets)) presets = [];
  if (!Array.isArray(macros)) macros = [];
  let macroIndex = -1,
    macroEdit = {
      name: "新宏",
      looptype: 3,
      cycle: 1,
      item: [],
      uid: Date.now(),
    },
    recording = false,
    recordTimer,
    lastEvent = 0;
  const pressed = new Set();
  const encoder = new IncottHardware();
  const mouseNames = {
    1: "左键",
    2: "右键",
    3: "中键",
    4: "前进",
    5: "后退",
    12: "DPI 循环",
    13: "DPI ＋",
    14: "DPI －",
    15: "禁用",
    17: "连发",
    18: "预设切换",
  };
  const mediaNames = [
    "播放器",
    "播放 / 暂停",
    "停止播放",
    "上一曲",
    "下一曲",
    "音量 ＋",
    "音量 －",
    "静音",
    "邮件",
    "计算器",
    "文件管理器",
    "浏览器",
    "收藏夹",
    "刷新",
    "网页前进",
    "网页后退",
    "搜索",
  ];
  const mouseBindings = Object.entries(mouseNames).map(([minor, label]) => ({
    label,
    info: { major: 1, minor: Number(minor) },
  }));
  const mediaBindings = mediaNames.map((label, index) => ({
    label,
    info: { major: 3, minor: index + 1 },
  }));
  const encode = (info) =>
    encoder.keyinfo_to_hw({ ...info, modifer: info.modifer || 0 }, selected);
  const baseBindings = [...mouseBindings, ...mediaBindings].filter(
    (x) => encode(x.info) >= 0,
  );
  const keyboardBindings = vkPOS
    .filter((x) => x && x[2])
    .map((x) => ({ label: x[1], code: x[0], info: { major: 2, minor: x[2] } }));
  function bindingName(code) {
    if (code === null || code === undefined) return "未读取";
    const base = baseBindings.find((binding) => encode(binding.info) === code);
    if (base) return base.label;
    if ((code & 0xffff) === 9) return `宏 ${((code >>> 16) & 255) + 1}`;
    if ((code & 255) === 128) {
      const key = keyboardBindings.find(
        (x) => x.info.minor === ((code >>> 8) & 255),
      );
      if (key) return key.label;
    }
    if ((code & 255) === 0 && code) {
      const key = keyboardBindings.find(
        (x) => x.info.minor === ((code >>> 16) & 255),
      );
      if (key)
        return [
          code & 0x100 ? "Ctrl" : "",
          code & 0x200 ? "Shift" : "",
          code & 0x400 ? "Alt" : "",
          code & 0x800 ? "Win" : "",
          key.label,
        ]
          .filter(Boolean)
          .join(" + ");
    }
    return "自定义 0x" + code.toString(16);
  }
  function notice(message, type = "") {
    $("notice").textContent = message;
    $("notice").className = "notice " + type;
  }
  function status() {
    const connected = !!controller.snapshot && !controller.fault,
      busy = controller.busy;
    $("connect").disabled = busy;
    $("connect").setAttribute("aria-busy", String(busy));
    $("apply").setAttribute("aria-busy", String(busy));
    $("connect").innerHTML = connected
      ? '已连接 <span class="connection-dot" aria-hidden="true"></span>'
      : "连接鼠标 <span>↗</span>";
    $("refresh").disabled = !connected || busy || dirty.size > 0;
    $("apply").disabled = !connected || busy || !dirty.size || recording;
    $("discard").disabled = !dirty.size || busy;
    $("export").disabled = !draft || busy;
    $("save-preset").disabled = !draft || busy;
    $("save-state").textContent = busy
      ? "正在与鼠标通信…"
      : dirty.size
        ? `${dirty.size} 项修改尚未写入`
        : connected
          ? "已与鼠标同步"
          : "尚未连接设备";
    $("save-indicator").className = dirty.size
      ? "dirty"
      : connected
        ? "saved"
        : "";
    $("editor-body")
      .querySelectorAll("[data-hardware]")
      .forEach((el) => (el.disabled = !connected || busy));
    $("presets")
      .querySelectorAll("button")
      .forEach((el) => (el.disabled = busy));
    $("import").disabled = busy;
  }
  function updateDevice() {
    const state = controller.snapshot;
    if (!state) {
      $("connection").textContent = "未连接";
      $("current-dpi").textContent = "—";
      $("current-rate").textContent = "—";
      $("battery").textContent = "—";
      return;
    }
    $("model").innerHTML = esc(state.model) + "<span>鼠标设置</span>";
    $("connection").textContent = state.wireless
      ? state.is8KReceiver
        ? "2.4G · 8K 接收器"
        : "2.4G 无线"
      : "USB 有线";
    $("current-dpi").textContent = (state.dpi[state.activeDpi] ?? "—") + " DPI";
    $("current-rate").textContent = state.rate + " Hz";
    $("battery").textContent =
      state.power < 0
        ? "—"
        : state.power + "%" + (state.charging === 2 ? " · 充电中" : "");
    $("mouse-photo").src = `images/mouse${state.model}.png`;
    $("mouse-photo").alt = `Incott ${state.model} 鼠标俯视图`;
  }
  function updateBindings() {
    document.querySelectorAll("[data-binding]").forEach((el) => {
      el.textContent = draft
        ? bindingName(draft.keyCodes[Number(el.dataset.binding)])
        : "未读取";
    });
    document.querySelectorAll("[data-button]").forEach((el) => {
      const active = Number(el.dataset.button) === selected;
      el.classList.toggle("selected", active);
      el.setAttribute("aria-pressed", String(active));
    });
    $("selected-summary").textContent =
      String(selected + 1).padStart(2, "0") + " · " + names[selected];
    scheduleCalloutLines();
  }
  function acceptSnapshot(snapshot) {
    draft = clone(snapshot);
    dirty.clear();
    updateDevice();
    updateBindings();
    render();
    status();
  }
  function mark(name, value) {
    if (!draft) return;
    if (name.startsWith("key:"))
      draft.keyCodes[Number(name.split(":")[1])] = value;
    else if (name.startsWith("dpi:"))
      draft.dpi[Number(name.split(":")[1])] = value;
    else if (name.startsWith("setting:"))
      draft.settings[name.split(":")[1]] = value;
    else draft[name] = value;
    const original = controller.snapshot;
    const previous = name.startsWith("key:")
      ? original.keyCodes[Number(name.split(":")[1])]
      : name.startsWith("dpi:")
        ? original.dpi[Number(name.split(":")[1])]
        : name.startsWith("setting:")
          ? original.settings[name.split(":")[1]]
          : original[name];
    if (
      value === previous &&
      !(name.startsWith("key:") && draft.macros[Number(name.split(":")[1])])
    )
      dirty.delete(name);
    else dirty.add(name);
    updateBindings();
    status();
  }
  function render() {
    document.querySelectorAll("[data-tab]").forEach((el) => {
      const active = el.dataset.tab === tab;
      el.classList.toggle("active", active);
      el.setAttribute("aria-selected", String(active));
      el.tabIndex = active ? 0 : -1;
    });
    $("editor-body").setAttribute("aria-labelledby", "tab-" + tab);
    if (tab === "keys") renderKeys();
    else if (tab === "dpi") renderDpi();
    else if (tab === "performance") renderPerformance();
    else renderMacros();
    status();
  }
  function palette() {
    if (category === "mouse")
      return mouseBindings.filter((x) => encode(x.info) >= 0);
    if (category === "media")
      return mediaBindings.filter((x) => encode(x.info) >= 0);
    if (category === "keyboard")
      return keyboardBindings.map((x) => ({
        ...x,
        info: { ...x.info, modifer: modifiers },
      }));
    return macros.map((macro, index) => ({ label: macro.name, macro, index }));
  }
  function renderKeys() {
    $("editor-body").innerHTML =
      `<div class="key-editor"><div class="category-nav" aria-label="功能分类">${Object.entries(
        {
          mouse: "鼠标功能",
          keyboard: "键盘按键",
          media: "多媒体",
          macro: "已保存的宏",
        },
      )
        .map(
          ([key, value]) =>
            `<button data-category="${key}" class="${category === key ? "active" : ""}">${value}</button>`,
        )
        .join(
          "",
        )}<button data-hardware id="swap-buttons">互换左右键</button></div><div><div class="palette-heading"><div><h2>为「${names[selected]}」选择功能</h2><span>选择后先保留为草稿，写入才生效。</span></div><input class="search" id="binding-search" aria-label="搜索功能" placeholder="搜索功能…" value="${esc(query)}"></div><div id="palette-options"></div></div></div>`;
    document.querySelectorAll("[data-category]").forEach(
      (el) =>
        (el.onclick = () => {
          category = el.dataset.category;
          query = "";
          renderKeys();
          status();
        }),
    );
    $("binding-search").oninput = (event) => {
      query = event.target.value;
      renderPalette();
      status();
    };
    renderPalette();
    $("swap-buttons").onclick = () => {
      if (!draft) return;
      const [left, right] = draft.keyCodes;
      const leftMacro = draft.macros[0],
        rightMacro = draft.macros[1];
      delete draft.macros[0];
      delete draft.macros[1];
      if (rightMacro) draft.macros[0] = rightMacro;
      if (leftMacro) draft.macros[1] = leftMacro;
      mark("key:0", rightMacro ? 9 : right);
      mark("key:1", leftMacro ? (1 << 16) | 9 : left);
      renderPalette();
      status();
      notice("左右键已互换，等待写入。");
    };
  }
  function renderPalette() {
    const items = palette().filter((x) =>
      x.label.toLowerCase().includes(query.toLowerCase()),
    );
    $("palette-options").innerHTML =
      (category === "keyboard"
        ? `<div class="modifier-bar">${[
            [1, "Ctrl"],
            [2, "Shift"],
            [4, "Alt"],
            [8, "Win"],
          ]
            .map(
              ([bit, label]) =>
                `<label><input type="checkbox" data-modifier="${bit}" ${modifiers & bit ? "checked" : ""}>${label}</label>`,
            )
            .join("")}</div>`
        : "") +
      `<div class="binding-grid ${category === "keyboard" ? "keyboard-grid" : ""}">${items.map((item, index) => `<button data-hardware class="binding ${draft && item.info && draft.keyCodes[selected] === encode(item.info) ? "current" : ""}" data-binding-choice="${index}">${esc(item.label)}</button>`).join("")}</div>` +
      (items.length
        ? ""
        : `<p class="empty-state">${category === "macro" ? "还没有宏。在「宏」中录制并保存后，会出现在这里。" : "没有找到匹配的功能。"}</p>`) +
      (category === "mouse"
        ? '<p class="macro-bind-note">前侧键与后侧键按鼠标实际位置区分；连发参数可在性能设置中调整。</p>'
        : "");
    document.querySelectorAll("[data-modifier]").forEach(
      (el) =>
        (el.onchange = () => {
          const bit = Number(el.dataset.modifier);
          modifiers = el.checked ? modifiers | bit : modifiers & ~bit;
          renderPalette();
          status();
        }),
    );
    document.querySelectorAll("[data-binding-choice]").forEach(
      (el) =>
        (el.onclick = () => {
          if (!draft) return;
          const item = items[Number(el.dataset.bindingChoice)];
          delete draft.macros[selected];
          if (item.macro) {
            draft.macros[selected] = clone(item.macro);
            mark("key:" + selected, (selected << 16) | 9);
            dirty.add("key:" + selected);
          } else mark("key:" + selected, encode(item.info));
          renderPalette();
          status();
          notice(`${names[selected]} → ${item.label}，等待写入。`);
        }),
    );
  }
  function renderDpi() {
    const count = draft?.dpiCount || 6;
    $("editor-body").innerHTML =
      `<div class="section-heading"><div><h2>DPI 档位</h2><p>直接输入灵敏度，选择鼠标当前使用的档位。</p></div><label class="small-label">启用档数 <select id="dpi-count" data-hardware aria-label="启用 DPI 档数">${[1, 2, 3, 4, 5, 6].map((n) => `<option ${n === count ? "selected" : ""}>${n}</option>`).join("")}</select></label></div><div class="dpi-grid">${Array.from({ length: 6 }, (_, index) => `<div class="dpi-step ${draft?.activeDpi === index ? "active" : ""}"><div class="dpi-step-top"><span>档位 0${index + 1}${index >= count ? " · 未启用" : ""}</span><button data-hardware data-active-dpi="${index}" ${index >= count ? "hidden" : ""}>${draft?.activeDpi === index ? "当前" : "设为当前"}</button></div><label for="dpi-${index}">X / Y 同步</label><input data-hardware id="dpi-${index}" aria-label="档位 ${index + 1} DPI" type="number" min="50" max="32000" step="50" placeholder="—" value="${draft?.dpi[index] ?? ""}" data-dpi="${index}"></div>`).join("")}</div><p class="input-hint">范围 50–32000，步进 50 DPI。修改某档时同时设置 X / Y；未修改的档位保持鼠标原值。</p>`;
    $("dpi-count").onchange = (event) => {
      mark("dpiCount", Number(event.target.value));
      if (draft.activeDpi >= draft.dpiCount) mark("activeDpi", 0);
      renderDpi();
      status();
    };
    document.querySelectorAll("[data-dpi]").forEach(
      (el) =>
        (el.onchange = () => {
          const value = Number(el.value);
          if (
            !Number.isInteger(value) ||
            value < 50 ||
            value > 32000 ||
            value % 50
          ) {
            el.setCustomValidity("请输入 50–32000 之间的 50 的整数倍。");
            el.reportValidity();
            return;
          }
          el.setCustomValidity("");
          mark("dpi:" + el.dataset.dpi, value);
        }),
    );
    document.querySelectorAll("[data-active-dpi]").forEach(
      (el) =>
        (el.onclick = () => {
          mark("activeDpi", Number(el.dataset.activeDpi));
          renderDpi();
          status();
        }),
    );
  }
  function selectSetting(key, label, description, options, value) {
    return `<div class="setting-row"><label for="setting-${key}">${label}<small>${description}</small></label><select data-hardware data-setting="${key}" id="setting-${key}"><option value="" ${value === null || value === undefined ? "selected" : ""} disabled>未读取</option>${options.map(([v, text]) => `<option value="${v}" ${value === v ? "selected" : ""}>${text}</option>`).join("")}</select></div>`;
  }
  function renderPerformance() {
    const state = draft || {},
      settings = state.settings || {};
    const rates =
      state.wireless && state.is8KReceiver
        ? [125, 250, 500, 1000, 2000, 4000, 8000]
        : [125, 250, 500, 1000];
    $("editor-body").innerHTML =
      `<div class="section-heading"><div><h2>性能与传感器</h2><p>显示从鼠标读取的设置，修改后统一写入。</p></div><span class="small-label">${state.sensor ? "PAW " + state.sensor.toString(16).toUpperCase() : ""}</span></div><div class="settings-grid">` +
      selectSetting(
        "rate",
        "回报率",
        "更高的回报率会增加电脑负载和耗电。",
        rates.map((x) => [x, x + " Hz"]),
        state.rate,
      ) +
      selectSetting(
        "debounce",
        "按键消抖",
        "减少抖动造成的重复点击。",
        Array.from({ length: 31 }, (_, x) => [x, x + " ms"]),
        state.debounce,
      ) +
      selectSetting(
        "setting:lod",
        "抬升高度 LOD",
        "抬起鼠标后停止追踪的高度。",
        [
          [0, "0.7 mm"],
          [1, "1 mm"],
          [2, "2 mm"],
        ],
        settings.lod,
      ) +
      selectSetting(
        "setting:sensorMode",
        "传感器模式",
        "2000 Hz 及以上使用竞技模式。",
        [
          [0, "节能"],
          [1, "标准"],
          [2, "竞技"],
        ],
        settings.sensorMode,
      ) +
      selectSetting(
        "setting:motion",
        "Motion Sync",
        "同步传感器采样与 USB 报告。",
        [
          [0, "关闭"],
          [1, "开启"],
        ],
        settings.motion,
      ) +
      selectSetting(
        "setting:ripple",
        "波纹修正",
        "平滑高 DPI 下的追踪噪声。",
        [
          [0, "关闭"],
          [1, "开启"],
        ],
        settings.ripple,
      ) +
      selectSetting(
        "setting:fixline",
        "直线修正",
        "修正手部运动，使轨迹更接近直线。",
        [
          [0, "关闭"],
          [1, "开启"],
        ],
        settings.fixline,
      ) +
      (state.wireless
        ? selectSetting(
            "sleep",
            "自动休眠",
            "无线连接时无操作后的休眠时间。",
            [
              10, 20, 30, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660,
              720, 780, 840, 900,
            ].map((x) => [x, x + " 秒"]),
            state.sleep,
          )
        : '<div class="setting-row"><label>自动休眠<small>无线连接时可设置。</small></label><span class="small-label">有线模式</span></div>') +
      selectSetting(
        "fireLoops",
        "连发次数",
        "0 表示按住持续点击，松开停止。",
        [
          [0, "按住持续"],
          [1, "1 次"],
          [2, "2 次"],
          [3, "3 次"],
        ],
        state.fireLoops,
      ) +
      selectSetting(
        "fireInterval",
        "连发间隔",
        "为鼠标按键绑定「连发」后生效。",
        Array.from({ length: 256 }, (_, x) => [x, x + " ms"]),
        state.fireInterval,
      ) +
      (state.is8KReceiver
        ? selectSetting(
            "receiverLED",
            "接收器指示灯",
            "8K 接收器的灯光显示内容。",
            [
              [0, "连接与回报率"],
              [1, "电池状态"],
              [2, "低电量提醒"],
            ],
            state.receiverLED,
          )
        : "") +
      '</div><div class="settings-bottom"><p class="input-hint">使用接收器时，请在浏览器中选择接收器。设备参数不支持时会保留为「未读取」。</p><button id="load-defaults" data-hardware class="secondary">载入默认设置</button></div>';
    $("load-defaults").onclick = () => {
      if (!draft) return;
      loadPreset({
        ...clone(draft),
        dpi: [400, 800, 1600, 2400, 3200, 6400],
        dpiCount: 6,
        activeDpi: 1,
        keyCodes: [0xf00001, 0xf10001, 0xf20001, 0xf40001, 0xf30001, 0x30007],
        rate: 500,
        debounce: 8,
        settings: { lod: 1, ripple: 0, fixline: 0, motion: 1, sensorMode: 1 },
        fireLoops: 3,
        fireInterval: 10,
        sleep: draft.wireless ? 60 : null,
        macros: {},
      });
    };
    document.querySelectorAll("[data-setting]").forEach(
      (el) =>
        (el.onchange = () => {
          const key = el.dataset.setting,
            value = Number(el.value);
          mark(key, value);
          if (key === "rate" && value >= 2000) {
            mark("setting:sensorMode", 2);
            notice("高回报率同时使用竞技模式，等待写入。");
          }
          if (
            key === "setting:sensorMode" &&
            draft.rate >= 2000 &&
            value !== 2
          ) {
            mark(key, 2);
            el.value = "2";
            notice("2000 Hz 及以上需要竞技模式。", "error");
          }
        }),
    );
  }
  function renderMacros() {
    $("editor-body").innerHTML =
      `<div class="macro-layout"><div class="macro-list"><button id="new-macro">＋ 新建宏</button>${macros.map((macro, index) => `<button class="${macroIndex === index ? "active" : ""}" data-macro="${index}">${esc(macro.name)}</button>`).join("")}</div><div><div class="macro-toolbar"><input id="macro-name" aria-label="宏名称" maxlength="32" value="${esc(macroEdit.name)}"><select id="macro-loop" aria-label="宏循环方式">${[
        [3, "指定次数"],
        [1, "按住时循环"],
        [2, "再次按下停止"],
      ]
        .map(
          ([value, label]) =>
            `<option value="${value}" ${macroEdit.looptype === value ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select><input id="macro-cycles" aria-label="宏循环次数" type="number" min="1" max="65535" value="${macroEdit.cycle}" style="width:85px"><button id="record-macro" class="${recording ? "recording" : ""}">${recording ? "■ 停止录制" : "● 录制按键"}</button></div><div class="macro-events" id="macro-events" aria-live="polite"></div><div class="macro-actions"><button id="save-macro">保存宏</button><button id="clear-macro">清空动作</button><button id="export-macro">导出宏</button><button id="import-macro">导入宏</button><input type="file" id="macro-file" accept=".json,application/json" hidden><button id="delete-macro" ${macroIndex < 0 ? "disabled" : ""}>删除宏</button></div><p class="input-hint">录制键盘的按下、松开和间隔；最多 71 个动作。Esc 停止录制，最长 30 秒。保存后，在按键定义中绑定到鼠标。</p></div></div>`;
    $("macro-name").oninput = (event) => (macroEdit.name = event.target.value);
    $("macro-loop").onchange = (event) =>
      (macroEdit.looptype = Number(event.target.value));
    $("macro-cycles").onchange = (event) =>
      (macroEdit.cycle = Math.max(
        1,
        Math.min(65535, Number(event.target.value) || 1),
      ));
    $("new-macro").onclick = () => {
      stopRecording();
      macroIndex = -1;
      macroEdit = {
        name: "新宏",
        looptype: 3,
        cycle: 1,
        item: [],
        uid: Date.now(),
      };
      renderMacros();
    };
    document.querySelectorAll("[data-macro]").forEach(
      (el) =>
        (el.onclick = () => {
          stopRecording();
          macroIndex = Number(el.dataset.macro);
          macroEdit = clone(macros[macroIndex]);
          renderMacros();
        }),
    );
    $("record-macro").onclick = () => {
      if (recording) stopRecording();
      else {
        macroEdit.item = [];
        recording = true;
        lastEvent = performance.now();
        pressed.clear();
        recordTimer = setTimeout(stopRecording, 30000);
        renderMacros();
        notice("正在录制键盘按键，Esc 停止。");
      }
      status();
    };
    $("save-macro").onclick = () => {
      stopRecording();
      if (!macroEdit.item.length) return notice("请先录制按键。", "error");
      macroEdit.name = macroEdit.name.trim() || "未命名宏";
      if (macroIndex < 0) {
        macros.push(clone(macroEdit));
        macroIndex = macros.length - 1;
      } else macros[macroIndex] = clone(macroEdit);
      storage.set("incott-studio-macros", macros);
      renderMacros();
      notice("宏已保存在本机。", "success");
    };
    $("export-macro").onclick = () => {
      stopRecording();
      downloadJson(
        { format: "incott-studio-macro", version: 1, macro: macroEdit },
        "incott-macro.json",
      );
    };
    $("import-macro").onclick = () => $("macro-file").click();
    $("macro-file").onchange = async (event) => {
      try {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 131072) throw new Error("宏文件超过 128 KB。");
        const data = JSON.parse(await file.text());
        if (data.format !== "incott-studio-macro" || data.version !== 1)
          throw new Error("不支持的宏文件。");
        validateMacro(data.macro);
        stopRecording();
        macroIndex = -1;
        macroEdit = clone(data.macro);
        renderMacros();
        notice("宏已导入，检查后点击保存。");
      } catch (error) {
        notice("导入失败：" + error.message, "error");
      }
    };
    $("clear-macro").onclick = () => {
      stopRecording();
      macroEdit.item = [];
      renderMacros();
    };
    $("delete-macro").onclick = () => {
      if (macroIndex < 0) return;
      stopRecording();
      macros.splice(macroIndex, 1);
      storage.set("incott-studio-macros", macros);
      macroIndex = -1;
      macroEdit = {
        name: "新宏",
        looptype: 3,
        cycle: 1,
        item: [],
        uid: Date.now(),
      };
      renderMacros();
    };
    renderMacroEvents();
  }
  function renderMacroEvents() {
    if (!$("macro-events")) return;
    $("macro-events").innerHTML = macroEdit.item.length
      ? macroEdit.item
          .map(
            (item) =>
              `<span class="macro-event">${esc(keyboardBindings.find((x) => x.code === item.key)?.label || item.key)} ${item.press ? "↓" : "↑"}<small>${item.delay} ms</small></span>`,
          )
          .join("")
      : '<span class="macro-empty">点击录制，然后输入一段按键。</span>';
  }
  function stopRecording() {
    if (!recording) return;
    recording = false;
    clearTimeout(recordTimer);
    for (const key of pressed)
      if (macroEdit.item.length < 71)
        macroEdit.item.push({ key, press: false, delay: 0 });
    pressed.clear();
    if (tab === "macros") renderMacros();
    status();
  }
  for (const type of ["keydown", "keyup"])
    window.addEventListener(
      type,
      (event) => {
        if (!recording) return;
        if (event.code === "Escape") {
          event.preventDefault();
          stopRecording();
          return;
        }
        if (
          !keyboardBindings.some((x) => x.code === event.code) ||
          event.repeat ||
          event.isComposing
        )
          return;
        event.preventDefault();
        const down = type === "keydown";
        if (down && pressed.has(event.code)) return;
        if (!down && !pressed.has(event.code)) return;
        if (down) pressed.add(event.code);
        else pressed.delete(event.code);
        const now = performance.now();
        macroEdit.item.push({
          key: event.code,
          press: down,
          delay: Math.min(65535, Math.round(now - lastEvent)),
        });
        lastEvent = now;
        renderMacroEvents();
        if (macroEdit.item.length >= 64) stopRecording();
      },
      true,
    );
  window.addEventListener("blur", stopRecording);
  function renderPresets() {
    $("presets").innerHTML = presets.length
      ? presets
          .map(
            (preset, index) =>
              `<div class="preset-item"><button data-preset="${index}">${esc(preset.name)}</button><button data-delete-preset="${index}" aria-label="删除预设 ${esc(preset.name)}">×</button></div>`,
          )
          .join("")
      : '<div class="empty-presets">把常用设置存成预设，<br>下次直接载入。</div>';
    document
      .querySelectorAll("[data-preset]")
      .forEach(
        (el) =>
          (el.onclick = () =>
            loadPreset(presets[Number(el.dataset.preset)].config)),
      );
    document.querySelectorAll("[data-delete-preset]").forEach(
      (el) =>
        (el.onclick = () => {
          presets.splice(Number(el.dataset.deletePreset), 1);
          storage.set("incott-studio-presets", presets);
          renderPresets();
        }),
    );
  }
  function downloadJson(value, name) {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function validateMacro(macro) {
    if (
      !macro ||
      typeof macro.name !== "string" ||
      macro.name.length > 32 ||
      !Number.isSafeInteger(macro.uid) ||
      ![1, 2, 3].includes(macro.looptype) ||
      !Number.isInteger(macro.cycle) ||
      macro.cycle < 1 ||
      macro.cycle > 65535 ||
      !Array.isArray(macro.item) ||
      macro.item.length > 71 ||
      macro.item.some(
        (item) =>
          !keyboardBindings.some((x) => x.code === item.key) ||
          typeof item.press !== "boolean" ||
          !Number.isInteger(item.delay) ||
          item.delay < 0 ||
          item.delay > 65535,
      )
    )
      throw new Error("宏数据无效。");
    const held = new Set();
    for (const item of macro.item) {
      if (item.press) {
        if (held.has(item.key)) throw new Error("宏包含重复按下。");
        held.add(item.key);
      } else {
        if (!held.has(item.key)) throw new Error("宏包含没有按下的松开动作。");
        held.delete(item.key);
      }
    }
    if (held.size) throw new Error("宏缺少松开动作。");
    return macro;
  }
  function validateConfig(config) {
    if (!config || config.format !== "incott-studio" || config.version !== 1)
      throw new Error("不是受支持的 Incott 配置文件。");
    if (!["G23", "G24"].includes(config.model))
      throw new Error("配置文件中的型号无效。");
    if (
      !Array.isArray(config.dpi) ||
      config.dpi.length !== 6 ||
      config.dpi.some(
        (x) => !Number.isInteger(x) || x < 50 || x > 32000 || x % 50,
      )
    )
      throw new Error("DPI 参数无效。");
    if (
      !Array.isArray(config.keyCodes) ||
      config.keyCodes.length !== 6 ||
      config.keyCodes.some(
        (x) => !Number.isInteger(x) || x < 0 || x > 0xffffffff,
      )
    )
      throw new Error("按键数据无效。");
    if (!config.keyCodes.includes(0xf00001))
      throw new Error("至少需要保留一个左键。");
    if (
      !Number.isInteger(config.dpiCount) ||
      config.dpiCount < 1 ||
      config.dpiCount > 6 ||
      !Number.isInteger(config.activeDpi) ||
      config.activeDpi < 0 ||
      config.activeDpi >= config.dpiCount
    )
      throw new Error("DPI 档位无效。");
    if (
      ![125, 250, 500, 1000, 2000, 4000, 8000].includes(config.rate) ||
      !Number.isInteger(config.debounce) ||
      config.debounce < 0 ||
      config.debounce > 30
    )
      throw new Error("性能参数无效。");
    if (
      config.sleep !== null &&
      config.sleep !== undefined &&
      (!Number.isInteger(config.sleep) ||
        config.sleep < 10 ||
        config.sleep > 900)
    )
      throw new Error("休眠时间无效。");
    if (
      config.receiverLED !== undefined &&
      config.receiverLED !== null &&
      ![0, 1, 2].includes(config.receiverLED)
    )
      throw new Error("接收器灯光参数无效。");
    if (
      config.fireLoops != null &&
      (!Number.isInteger(config.fireLoops) ||
        config.fireLoops < 0 ||
        config.fireLoops > 3)
    )
      throw new Error("连发次数无效。");
    if (
      config.fireInterval != null &&
      (!Number.isInteger(config.fireInterval) ||
        config.fireInterval < 0 ||
        config.fireInterval > 255)
    )
      throw new Error("连发间隔无效。");
    for (const [key, max] of Object.entries({
      lod: 2,
      ripple: 1,
      fixline: 1,
      motion: 1,
      sensorMode: 2,
    }))
      if (
        config.settings?.[key] != null &&
        (!Number.isInteger(config.settings[key]) ||
          config.settings[key] < 0 ||
          config.settings[key] > max)
      )
        throw new Error("传感器参数无效。");
    for (const [index, macro] of Object.entries(config.macros || {})) {
      if (!/^[0-5]$/.test(index)) throw new Error("宏槽位无效。");
      validateMacro(macro);
    }
    return config;
  }
  function loadPreset(config) {
    try {
      validateConfig(config);
      if (!controller.snapshot)
        return notice("请先连接鼠标，再载入预设。", "error");
      if (config.model !== controller.snapshot.model)
        throw new Error(
          `此预设适用于 ${config.model}，当前为 ${controller.snapshot.model}。`,
        );
      draft = clone(controller.snapshot);
      dirty.clear();
      config.keyCodes.forEach((value, index) => mark("key:" + index, value));
      config.dpi.forEach((value, index) => mark("dpi:" + index, value));
      for (const key of ["rate", "debounce", "dpiCount", "activeDpi"])
        mark(key, config[key]);
      for (const key of ["fireLoops", "fireInterval"])
        if (config[key] != null) mark(key, config[key]);
      if (draft.wireless && config.sleep != null) mark("sleep", config.sleep);
      if (draft.is8KReceiver && config.receiverLED != null)
        mark("receiverLED", config.receiverLED);
      for (const key of ["lod", "ripple", "fixline", "motion", "sensorMode"])
        if (config.settings?.[key] != null)
          mark("setting:" + key, config.settings[key]);
      draft.macros = clone(config.macros || {});
      Object.keys(draft.macros).forEach((index) => dirty.add("key:" + index));
      render();
      updateBindings();
      notice("已载入预设，等待写入鼠标。");
    } catch (error) {
      notice(error.message, "error");
    }
  }
  $("connect").onclick = async () => {
    try {
      stopRecording();
      const pending =
        draft && dirty.size ? { draft: clone(draft), names: [...dirty] } : null;
      notice("请选择鼠标，正在读取配置…");
      const snapshot = await controller.connect();
      acceptSnapshot(snapshot);
      if (pending && pending.draft.model === snapshot.model) {
        for (const name of pending.names) {
          if (name.startsWith("key:")) {
            const index = Number(name.split(":")[1]);
            if (pending.draft.macros[index])
              draft.macros[index] = pending.draft.macros[index];
            mark(name, pending.draft.keyCodes[index]);
          } else if (name.startsWith("dpi:"))
            mark(name, pending.draft.dpi[Number(name.split(":")[1])]);
          else if (name.startsWith("setting:"))
            mark(name, pending.draft.settings[name.split(":")[1]]);
          else mark(name, pending.draft[name]);
        }
        render();
        notice("已重新读取鼠标，断连前的修改已保留，等待写入。");
      } else notice("已读取鼠标当前配置。", "success");
    } catch (error) {
      notice(error.message, "error");
      status();
    }
  };
  $("refresh").onclick = async () => {
    try {
      acceptSnapshot(await controller.refresh());
      notice("配置已重新读取。", "success");
    } catch (error) {
      notice(error.message, "error");
      status();
    }
  };
  $("discard").onclick = () => {
    if (controller.snapshot) acceptSnapshot(controller.snapshot);
    notice("已撤销尚未写入的修改。");
  };
  $("apply").onclick = async () => {
    try {
      validateConfig(draft);
      for (const name of dirty)
        if (name.startsWith("key:")) {
          const index = Number(name.split(":")[1]);
          if ((draft.keyCodes[index] & 0xffff) === 9 && !draft.macros[index])
            throw new Error("这个宏的内容未保存在本机，请先录制或导入宏。");
        }
      if (!(draft.wireless && draft.is8KReceiver) && draft.rate > 1000)
        throw new Error("当前连接模式最高支持 1000 Hz。");
      notice("正在写入并回读校验…");
      const result = await controller.apply(draft, [...dirty]);
      for (const name of result.verified) dirty.delete(name);
      if (result.failure) {
        notice("部分写入未完成：" + result.failure, "error");
        updateDevice();
        status();
        return;
      }
      acceptSnapshot(result.snapshot);
      notice(
        result.macroSent
          ? "按键已回读确认；宏数据已发送，请实际按键测试。"
          : "已写入鼠标，回读校验通过。",
        "success",
      );
    } catch (error) {
      notice(error.message, "error");
      status();
    }
  };
  document.querySelectorAll("[data-button]").forEach(
    (el) =>
      (el.onclick = () => {
        if (controller.busy) return;
        selected = Number(el.dataset.button);
        updateBindings();
        if (tab === "keys") {
          renderKeys();
          status();
        }
      }),
  );
  document.querySelectorAll("[data-tab]").forEach(
    (el) =>
      (el.onclick = () => {
        if (recording) stopRecording();
        tab = el.dataset.tab;
        render();
      }),
  );
  $("save-preset").onclick = () => {
    $("preset-name").value = "";
    $("preset-dialog").showModal();
  };
  $("preset-dialog").addEventListener("close", () => {
    if ($("preset-dialog").returnValue !== "save" || !draft) return;
    const name = $("preset-name").value.trim();
    if (!name) return;
    presets.push({ name, config: clone(draft) });
    storage.set("incott-studio-presets", presets);
    renderPresets();
    notice("预设已保存在本机。", "success");
  });
  $("export").onclick = () => {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `incott-${draft.model.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("import").onclick = () => $("import-file").click();
  $("import-file").onchange = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) throw new Error("配置文件超过 1 MB。");
      const config = validateConfig(JSON.parse(await file.text()));
      loadPreset(config);
    } catch (error) {
      notice("导入失败：" + error.message, "error");
    } finally {
      event.target.value = "";
    }
  };
  $("test-toggle").onclick = () => {
    testing = !testing;
    $("test-toggle").setAttribute("aria-pressed", String(testing));
    $("test-toggle").textContent = testing ? "结束测试 ×" : "按键测试 ↗";
    $("test-result").textContent = testing
      ? "在鼠标图上方按键或滚动，查看事件"
      : "修改后统一写入鼠标";
  };
  document
    .querySelector(".mouse-canvas")
    .addEventListener("pointerdown", (event) => {
      if (testing) {
        const label =
          ["左键", "中键", "右键", "后退", "前进"][event.button] ||
          `按键 ${event.button}`;
        $("test-result").textContent = `检测到 ${label}`;
      }
    });
  document
    .querySelector(".mouse-canvas")
    .addEventListener("auxclick", (event) => {
      if (testing) event.preventDefault();
    });
  document
    .querySelector(".mouse-canvas")
    .addEventListener("contextmenu", (event) => {
      if (testing) event.preventDefault();
    });
  document.querySelector(".mouse-canvas").addEventListener(
    "wheel",
    (event) => {
      if (testing)
        $("test-result").textContent =
          event.deltaY > 0 ? "检测到 向下滚动" : "检测到 向上滚动";
    },
    { passive: true },
  );
  $("original-link").onclick = async (event) => {
    event.preventDefault();
    stopRecording();
    if (controller.busy) return notice("请等待当前通信完成。");
    if (controller.device?.handle?.opened)
      await controller.device.handle.close();
    location.href = "original.html";
  };
  controller.addEventListener("busy", status);
  controller.addEventListener("disconnect", () => {
    updateDevice();
    status();
    notice("鼠标已断开，未写入的修改仍保留。重新连接后可继续。", "error");
  });
  window.addEventListener("incott-input", () => {
    if (!controller.snapshot) return;
    controller.snapshot.power = ace.power;
    controller.snapshot.charging = ace.charging;
    controller.snapshot.activeDpi = ace.curDpi;
    updateDevice();
  });
  window.addEventListener("incott-profile-key", () =>
    notice("已按下预设切换键，请在右侧选择本地预设，再写入鼠标。"),
  );
  window.addEventListener("beforeunload", (event) => {
    if (dirty.size) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("pagehide", () => {
    stopRecording();
    controller.device?.handle?.close().catch(() => {});
  });
  let lineFrame = 0;
  function scheduleCalloutLines() {
    cancelAnimationFrame(lineFrame);
    lineFrame = requestAnimationFrame(() => {
      const canvas = document.querySelector(".mouse-canvas");
      const svg = document.querySelector(".callout-lines");
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
      const nodes = [];
      for (let index = 0; index < 6; index++) {
        const label = canvas
          .querySelector(`.callout[data-button="${index}"]`)
          .getBoundingClientRect();
        const target = canvas
          .querySelector(`.hotspot[data-button="${index}"]`)
          .getBoundingClientRect();
        const left = [0, 3, 4].includes(index);
        const x = (left ? label.right : label.left) - bounds.left;
        const y = label.top + label.height / 2 - bounds.top;
        const tx = target.left + target.width / 2 - bounds.left;
        const ty = target.top + target.height / 2 - bounds.top;
        const turn = x + (tx - x) * 0.6;
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        path.setAttribute("d", `M ${x} ${y} H ${turn} L ${tx} ${ty}`);
        path.setAttribute("stroke", index === selected ? "#8a9a64" : "#b6bda8");
        path.dataset.buttonLine = String(index);
        nodes.push(path);
        const dot = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        );
        dot.setAttribute("cx", tx);
        dot.setAttribute("cy", ty);
        dot.setAttribute("r", index === selected ? 3 : 2);
        dot.setAttribute("fill", index === selected ? "#8a9a64" : "#b6bda8");
        nodes.push(dot);
      }
      svg.replaceChildren(...nodes);
    });
  }
  const stageObserver = new ResizeObserver(scheduleCalloutLines);
  stageObserver.observe(document.querySelector(".mouse-canvas"));
  $("mouse-photo").addEventListener("load", scheduleCalloutLines);
  document.fonts.ready.then(scheduleCalloutLines);
  document.querySelector(".tabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...document.querySelectorAll("[data-tab]")];
    const current = buttons.findIndex((button) => button.dataset.tab === tab);
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
            buttons.length;
    event.preventDefault();
    buttons[index].click();
    buttons[index].focus();
  });
  window.IncottStudio = {
    getDraft: () => clone(draft),
    getDirty: () => [...dirty],
    validateConfig,
    bindingName,
  };
  if (!["127.0.0.1", "localhost", "[::1]"].includes(location.hostname))
    document.querySelector(".local-label").innerHTML = "<i></i> 设备直连";
  renderPresets();
  render();
  updateBindings();
  status();
  controller
    .connect(true)
    .then((snapshot) => {
      if (snapshot) {
        acceptSnapshot(snapshot);
        notice("已连接鼠标，当前配置已读取。", "success");
      }
    })
    .catch((error) => {
      notice(error.message, "error");
      status();
    });
})();
