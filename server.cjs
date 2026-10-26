const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "site");
const port = Number(process.env.PORT || 8765);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
};
const server = http.createServer((req, res) => {
  let name;
  try {
    name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (name === "/favicon.ico") {
    res.writeHead(204).end();
    return;
  }
  if (name === "/") name = "/index.html";
  const file = path.resolve(root, "." + name);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Length": stat.size,
    });
    fs.createReadStream(file).pipe(res);
  });
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Incott driver: ${url} (Ctrl+C to stop)`);
  if (process.argv.includes("--open") && process.platform === "win32") {
    const locations = [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    const browser = locations
      .flatMap((base) => [
        path.join(base, "Google/Chrome/Application/chrome.exe"),
        path.join(base, "Microsoft/Edge/Application/msedge.exe"),
      ])
      .find((file) => fs.existsSync(file));
    if (browser)
      require("node:child_process")
        .spawn(browser, [url], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        })
        .unref();
    else console.log("Open this address in Chrome or Edge.");
  }
});
