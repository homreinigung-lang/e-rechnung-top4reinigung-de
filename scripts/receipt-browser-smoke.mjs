// Local browser test only. No backend, credentials, uploads or database calls.
// PLAYWRIGHT_MODULE_PATH may point at an existing Playwright installation.
import { createServer } from "vite";
import { pathToFileURL } from "node:url";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const server = await createServer({
  configFile: false,
  server: { host: "127.0.0.1", port: 5178, strictPort: true },
  plugins: [
    {
      name: "receipt-smoke",
      configureServer(server) {
        server.middlewares.use("/receipt-smoke", (_req, res) => {
          res.setHeader("Content-Type", "text/html");
          res.end(
            '<!doctype html><html><body><script type="module">import * as scan from "/src/lib/receipt-image-scan.ts";window.scan=scan;</script></body></html>',
          );
        });
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5178/receipt-smoke");
  await page.waitForFunction(() => Boolean(window.scan));
  const results = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1733;
    canvas.height = 2600;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#444";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.fillRect(100, 100, 1533, 2400);
    ctx.fillStyle = "black";
    ctx.font = "36px sans-serif";
    for (const [i, text] of [
      "Rechnung 00026-OI/06",
      "Rechnungsdatum: 21.10.2026",
      "Netto: 1.000,00 EUR",
      "USt: 190,00 EUR",
      "Gesamt: 1.190,00 EUR",
    ].entries())
      ctx.fillText(text, 180, 280 + i * 130);
    const start = performance.now();
    const draft = await window.scan.prepareReceiptCanvas(canvas, "synthetic-invoice.jpg");
    const prepareMs = performance.now() - start;
    const NativeWorker = window.Worker;
    let workers = 0,
      workerReplies = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        workers++;
        this.addEventListener("message", () => workerReplies++);
      }
    };
    let ticks = 0;
    const interval = setInterval(() => ticks++, 5);
    const cropStart = performance.now();
    const file = await window.scan.finishReceiptScan(draft, draft.corners);
    const cropMs = performance.now() - cropStart;
    clearInterval(interval);
    window.Worker = NativeWorker;
    const bitmap = await createImageBitmap(file);
    const dimensions = [bitmap.width, bitmap.height];
    bitmap.close();
    // The original pixels must survive transfer for manual adjustment.
    const originalBytes = draft.source.data.byteLength;
    window.Worker = class {
      constructor() {
        throw new Error("Worker blocked by browser policy");
      }
    };
    const fallback = await window.scan.finishReceiptScan(draft, draft.corners);
    window.Worker = NativeWorker;
    const fallbackPixels = await createImageBitmap(fallback);
    const fallbackDimensions = [fallbackPixels.width, fallbackPixels.height];
    fallbackPixels.close();
    URL.revokeObjectURL(draft.preview);
    const workerBytes = new Uint8Array(await file.arrayBuffer());
    const localBytes = new Uint8Array(await fallback.arrayBuffer());
    const identicalFiles =
      workerBytes.length === localBytes.length &&
      workerBytes.every((value, i) => value === localBytes[i]);
    return {
      detected: draft.detected,
      prepareMs,
      cropMs,
      workers,
      workerReplies,
      identicalFiles,
      responsiveTicks: ticks,
      originalBytes,
      mimeType: file.type,
      dimensions,
      fallbackDimensions,
      outputBytes: file.size,
      fallbackBytes: fallback.size,
    };
  });
  console.log(JSON.stringify({ ...results, errors }, null, 2));
  if (
    !results.detected ||
    results.workers !== 1 ||
    results.workerReplies !== 1 ||
    !results.identicalFiles ||
    !results.responsiveTicks ||
    !results.originalBytes ||
    results.mimeType !== "image/jpeg" ||
    results.outputBytes !== results.fallbackBytes ||
    JSON.stringify(results.dimensions) !== JSON.stringify(results.fallbackDimensions) ||
    errors.length
  ) {
    throw new Error("Receipt browser smoke test failed");
  }
} finally {
  await browser?.close();
  await server.close();
}
