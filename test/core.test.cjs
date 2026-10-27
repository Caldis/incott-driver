const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.join(__dirname, "..", "site");
test("UI font is a bundled, intact WOFF2 asset", () => {
  const font = fs.readFileSync(path.join(root, "fonts/incott-ui-v1.woff2"));
  const source = JSON.parse(
    fs.readFileSync(path.join(root, "fonts/source.json"), "utf8"),
  );
  assert.equal(font.toString("ascii", 0, 4), "wOF2");
  assert.equal(
    crypto.createHash("sha256").update(font).digest("hex"),
    source.sha256,
  );
  assert.ok(font.length < 200_000);
  const assetURL = `fonts/incott-ui-v1.woff2?sha256=${source.sha256.slice(0, 12)}`;
  assert.equal(source.asset_url, assetURL);
  for (const name of ["studio.html", "index.html", "studio.css"])
    assert.ok(
      fs.readFileSync(path.join(root, name), "utf8").includes(assetURL),
      `${name}: font cache key must match its bytes`,
    );
  for (const name of ["studio.html", "studio.js", "core/adapter.js"]) {
    const text = fs.readFileSync(path.join(root, name), "utf8");
    for (const character of text.match(
      /[\u00a0-\u00ff\u2000-\u27ff\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/gu,
    ) || [])
      assert.ok(
        source.characters.includes(character),
        `${name}: missing ${character}; run tools/update-ui-font.py`,
      );
  }
});

test("UI uses the requested product name", () => {
  for (const name of ["studio.html", "index.html"]) {
    const html = fs.readFileSync(path.join(root, name), "utf8");
    assert.ok(html.includes("<title>incott网页驱动</title>"));
    assert.ok(!html.includes("工作台") && !html.includes("控制台"));
  }
});
function context() {
  const sandbox = {
    console,
    EventTarget,
    Event,
    CustomEvent,
    structuredClone,
    setTimeout,
    clearTimeout,
    HIDDevice: class {},
    navigator: { hid: { addEventListener() {} } },
    window: { isSecureContext: true, dispatchEvent() {} },
  };
  vm.createContext(sandbox);
  for (const name of [
    "js/define-v100.js",
    "core/incott-original.js",
    "core/adapter.js",
  ])
    vm.runInContext(fs.readFileSync(path.join(root, name), "utf8"), sandbox);
  return { run: (source) => vm.runInContext(source, sandbox), sandbox };
}
test("all 97 archived deployed files match their downloaded SHA-256", () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "download-manifest.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.length, 97);
  for (const entry of manifest) {
    const file = path.join(
      root,
      entry.path === "index.html" ? "original.html" : entry.path,
    );
    assert.equal(
      crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      entry.sha256,
      entry.path,
    );
  }
});
test("original hardware class is extracted verbatim", () => {
  const source = fs.readFileSync(path.join(root, "js/chunk-v1003.js"), "utf8");
  const original = source.slice(
    source.indexOf("class RetObj"),
    source.indexOf(
      "async function _nfmekzxlqota",
      source.indexOf("class RetObj"),
    ),
  );
  assert.equal(
    fs
      .readFileSync(path.join(root, "core/incott-original.js"), "utf8")
      .split("\n")
      .slice(1)
      .join("\n")
      .trim(),
    original.trim(),
  );
});
test("cancelled device cannot send later parameter writes", async () => {
  const { run } = context();
  assert.equal(
    await run(
      `(async()=>{const device=new IncottHardware();let writes=0;device.handle={sendFeatureReport:async()=>{writes++;}};device.cancelled=true;const result=await device.setUsbRate(500);return result===false&&writes===0;})()`,
    ),
    true,
  );
});
test("unknown model is rejected and its handle is closed before other reads", async () => {
  const { run } = context();
  assert.equal(
    await run(`(async()=>{
      let count=0;
      const device={vendorId:0x093a,productId:0x622c,opened:false,
        open:async()=>{device.opened=true;},close:async()=>{device.opened=false;},
        sendFeatureReport:async()=>{count++;},
        receiveFeatureReport:async()=>new DataView(new Uint8Array([9,0x8f,1,9,0,0xf1,0,0,0]).buffer)};
      navigator.hid.getDevices=async()=>[device];
      const controller=new IncottController();
      try{await controller.connect(true);return false;}
      catch{return !device.opened&&controller.device===null&&count===1&&controller.snapshot===null;}
    })()`),
    true,
  );
});
test("six physical buttons retain original matrix and encodings", () => {
  const { run } = context();
  assert.equal(
    run("JSON.stringify(dvar.key.map(x=>x.matrix))"),
    "[0,1,2,4,3,5]",
  );
  assert.equal(
    run("new IncottHardware().keyinfo_to_hw({major:1,minor:4},3)"),
    0xf40001,
  );
  assert.equal(
    run("new IncottHardware().keyinfo_to_hw({major:1,minor:5},4)"),
    0xf30001,
  );
  assert.equal(
    run("new IncottHardware().keyinfo_to_hw({major:2,minor:4,modifer:1},0)"),
    0x40100,
  );
});
test("DPI packets preserve 16-bit values and axis selector", async () => {
  const { run } = context();
  const packets = await run(
    `(async()=>{const device=new IncottHardware();const packets=[];device.sendData=async data=>{packets.push(Array.from(data));return true;};await device.setDPI(5,639,639);await device.setDPI(5,127,129);return JSON.stringify(packets);})()`,
  );
  assert.deepEqual(JSON.parse(packets), [
    [2, 5, 127, 2, 0, 0, 0, 0],
    [2, 5, 127, 0, 0, 0, 0, 1],
    [2, 5, 129, 0, 0, 0, 0, 2],
  ]);
});
test("sensor mode adapter fixes undefined lod without altering vendor class", async () => {
  const { run } = context();
  assert.equal(
    await run(
      `(async()=>{const device=new IncottHardware();device.sendData=async data=>JSON.stringify(Array.from(data));return await device.setSensorMode(2);})()`,
    ),
    "[4,5,2,0,0,0,0,0]",
  );
  assert.equal(await run("new IncottHardware().setSensorMode(3)"), false);
});
test("macro encoder receives display names and emits correct key HID code", () => {
  const { run } = context();
  assert.equal(
    run(
      `new IncottHardware().macro_to_hw({looptype:3,cycle:1,uid:1,item:[{key:'F13',press:true,delay:0},{key:'F13',press:false,delay:20}]},5)[5]`,
    ),
    0x68,
  );
});
test("malformed command or selector echoes are rejected", async () => {
  const { run } = context();
  assert.equal(
    await run(
      `(async()=>{const c=new IncottController();c.device={readDevice:async()=>[0xff,1,1]};return await c.readResponse(0x84,1);})()`,
    ),
    null,
  );
  assert.equal(
    await run(
      `(async()=>{const c=new IncottController();c.device={readDevice:async()=>[0x84,2,1]};return await c.readResponse(0x84,1);})()`,
    ),
    null,
  );
});

test("transient read mismatch is retried and recorded without writes", async () => {
  const { run } = context();
  assert.equal(
    await run(`(async()=>{
    const c=new IncottController();let attempts=0;
    c.device={curpid:0x622c,readDevice:async()=>++attempts===1?[0,0,0]:[0x83,6,2]};
    const result=await c.readResponse(0x83);
    return attempts===2&&result[1]===6&&c.diagnostics.length===2&&!c.diagnostics[0].valid&&c.diagnostics[1].valid;
  })()`),
    true,
  );
});

test("zero or malformed DPI responses never create a default snapshot", async () => {
  const { run } = context();
  assert.equal(
    await run(`(async()=>{
    for (const response of [[0,0,0],[0x83,0,0],[0x83,7,0],[0x83,6,6]]) {
      const c=new IncottController();let later=0;
      c.device={isopend:()=>true,iswireless:true,readInfo:async()=>true,
        readDevice:async()=>response,readUsbRate:async()=>{later++;}};
      try {await c.refresh();return false;} catch(error) {
        if(!error.message.includes('DPI')||c.snapshot!==null||later!==0)return false;
      }
    }
    return true;
  })()`),
    true,
  );
});

// Exercise the real vendor packet reader with both authorized transports.
// These are the response shapes measured in evidence/connection-readonly.json.
const connectionFixture = `
  let writes=0,chooser=0;
  function endpoint(pid,reachable=true) {
    return {vendorId:0x093a,productId:pid,opened:false,opens:0,closes:0,command:0,
      async open(){this.opened=true;this.opens++;},
      async close(){this.opened=false;this.closes++;},
      async sendFeatureReport(id,data){this.command=data[0];if(data[0]<0x80)writes++;},
      async receiveFeatureReport(){
        const cmd=this.command;
        const data=cmd===0x8f?[cmd,1,3,pid===0x522c?2:0,0xf1,0,0,0]
          :cmd===0x89?[cmd,80,2,1,2,0,0,0]
          :cmd===0x83?(reachable?[cmd,6,2,0,0,0,0,0]:[0,0,0,0,0,0,0,0])
          :[cmd,0,0,0,0,0,0,0];
        return new DataView(new Uint8Array([9,...data]).buffer);
      }};
  }
  const wired=endpoint(0x622c),receiver=endpoint(0x522c,false);
  navigator.hid.getDevices=async()=>[receiver,wired];
  navigator.hid.requestDevice=async()=>{chooser++;return [wired];};
  // Limit each probe to the actual packet reader; full snapshot guards are tested above.
  IncottController.prototype.read=async function(){
    const data=await this.readResponse(0x83);
    if(!data)throw new Error('DPI read failed');
    this.snapshot={model:'G24',pid:this.device.curpid};return this.snapshot;
  };
`;

test("automatic connection prefers wired over the first granted receiver", async () => {
  const { run } = context();
  assert.equal(
    await run(`(async()=>{${connectionFixture}
    const c=new IncottController();const result=await c.connect(true);
    return result.pid===0x622c&&wired.opens===1&&receiver.opens===0&&writes===0&&chooser===0;
  })()`),
    true,
  );
});

test("failed remembered receiver is closed before trying wired", async () => {
  const { run } = context();
  assert.equal(
    await run(`(async()=>{${connectionFixture}
    let saved;window.localStorage={getItem:()=>String(0x522c),setItem:(key,value)=>saved=value};
    const c=new IncottController();const result=await c.connect(true);
    return result.pid===0x622c&&receiver.opens===1&&!receiver.opened&&receiver.closes===1
      &&wired.opened&&saved===String(0x622c)&&writes===0;
  })()`),
    true,
  );
});

test("manual connection always opens the chooser and cancellation preserves connection", async () => {
  const { run } = context();
  assert.equal(
    await run(`(async()=>{${connectionFixture}
    const c=new IncottController();await c.connect(true);const before=c.snapshot;
    navigator.hid.requestDevice=async()=>{chooser++;return [];};
    try{await c.connect();return false;}catch{}
    if(chooser!==1||c.snapshot!==before||!wired.opened||c.busy)return false;
    navigator.hid.requestDevice=async()=>{chooser++;return [wired];};
    const result=await c.connect();
    return chooser===2&&result.pid===0x622c&&writes===0;
  })()`),
    true,
  );
});
test("second operation is rejected while HID is busy", async () => {
  const { run } = context();
  assert.equal(
    await run(
      `(async()=>{const c=new IncottController();let finish;const first=c.exclusive(()=>new Promise(resolve=>finish=resolve));let rejected=false;try{await c.exclusive(async()=>true);}catch{rejected=true;}finish();await first;return rejected&&!c.busy;})()`,
    ),
    true,
  );
});
test("no-op refresh does not write settings", async () => {
  const { run } = context();
  assert.equal(
    await run(
      `(async()=>{const c=new IncottController();let writes=0;c.device={isopend:()=>true,devname:'G24',sensor:0x3950,iswireless:false,is8KReceiver:false,power:80,charging:2,readInfo:async()=>true,readDevice:async(cmd,sel)=>cmd===0x83?[0x83,6,2]:[cmd,sel,1,10],readUsbRate:async()=>500,readDebounce:async()=>8,readSleep:async()=>null,readDPI:async()=>31,readKEY:async()=>0xf00001,setDPI:async()=>{writes++;},setKEY:async()=>{writes++;}};const result=await c.refresh();return result.dpiCount===6&&result.activeDpi===2&&result.dpi[0]===1600&&writes===0;})()`,
    ),
    true,
  );
});
test("write failure stops later operations; partial success remains explicit", async () => {
  const { run } = context();
  const result = await run(
    `(async()=>{const c=new IncottController();let later=0;c.snapshot={};c.read=async()=>{c.snapshot={};};c.device={isopend:()=>true,setDebounce:async()=>false,readDebounce:async()=>8,setUsbRate:async()=>{later++;}};const result=await c.apply({debounce:8,rate:500},['debounce','rate']);return JSON.stringify({verified:result.verified,failed:!!result.failure,later});})()`,
  );
  assert.deepEqual(JSON.parse(result), {
    verified: [],
    failed: true,
    later: 0,
  });
});
