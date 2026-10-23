# Receipt scanner speed and accuracy

Reviewed against main `1fd064d2` (including PR #228); security fix #229 is also included in the branch base. This change does not modify schemas, migrations, credentials or production data. It is intended for PR review, not deployment.

## Bottlenecks and changes

- Camera capture previously encoded a JPEG and immediately decoded it again before crop analysis. The scanner now passes canvas pixels directly into preparation. This removes one lossy compression round trip without lowering the existing 2600-pixel input or 2200-pixel scan limits.
- Perspective correction ran on the UI thread and interpolated three color channels for every output pixel. The new module worker interpolates luminance once, preserving bilinear sampling and the existing contrast formula. The original pixels remain available for corner adjustment; workers terminate after use. Browsers blocking module workers use the same algorithm locally.
- Preview generation used synchronous base64 encoding. It now uses asynchronous JPEG blobs and releases object URLs when the draft is replaced or closed. Final JPEG quality remains 0.92.
- Gemini previously allowed two requests per model, fixed retry sleeps, and no receipt-specific aggregate deadline. The OCR path now makes one attempt per existing model, without those sleeps, within a **15-second aggregate deadline** (10 seconds for the primary request, at most the remaining 5 seconds for fallback). Schema-compatibility retries share this deadline. Other workflows keep their existing retry policy. A deadline limits failure latency; it is not evidence that successful inference became faster.
- The configured primary model and existing fallback, full attachment and media resolution remain unchanged. The enforced JSON schema is no longer duplicated in the successful request's text prompt; it is restored if a provider rejects schema enforcement.
- PR #228's suspicious-year check is retained. The same response now includes the literal printed date, checked locally against the normalized date. Disagreement, missing evidence, impossible dates, and out-of-window years require review. This is **same-response consistency, not independent OCR verification**: matching wrong OCR output can still pass. No current-year substitution is allowed. The form now clears an uncertain date instead of preserving today's default and refuses to save without a date. The PDF header does not invent a date either.
- Leading zeros and invoice-number separators are explicitly preserved. Total arithmetic remains checked, German decimal strings are supported, and malformed alphanumeric amounts are rejected.

## Measured locally on Windows, 23 October 2026

`bun scripts/benchmark-receipt-scan.ts` compares the frozen raster implementation with the new implementation, alternating execution order, discarding two warm-ups, then taking five measured samples per implementation:

- 1200 × 1800 input/output: median **176.04 ms before, 115.91 ms after (1.52×)**.
- 1733 × 2600 input, 1466 × 2200 output: median **185.93 ms before, 137.34 ms after (1.35×)**.
- Maximum pixel difference was **0** for both fixtures. Unit tests also cover perspective skew and one-pixel text strokes with a maximum tolerated luminance difference of 1/255. These are sampling tests, not proof of OCR accuracy on real camera receipts.

`node scripts/receipt-browser-smoke.mjs` in installed Edge, using a synthetic 1733 × 2600 invoice:

- Preparation **437.4 ms**, worker crop plus JPEG encoding **314.9 ms** in the observed run.
- Automatic edges detected; one worker reply confirmed; 41 UI timer ticks during crop; original 18,023,200 bytes retained for manual adjustment.
- Worker and blocked-worker compatibility paths produced byte-identical 1405 × 2200 JPEGs (50,960 bytes). No page errors.

Browser timings include worker startup and JPEG preparation, differ from the isolated raster benchmark, and vary with device load. Physical phone-camera startup and autofocus were not tested.

## Validation and open evidence

The deterministic tests exercise 2022/2026 disagreement, suspicious years, missing/invalid dates, German written dates, leading-zero invoice numbers, German decimal totals, contradictory totals, retained attachments, schema rejection, model fallback and the 15-second deadline. They simulate provider responses; they do not measure Gemini's actual recognition accuracy.

No local Gemini test credential was available, so **live Gemini before/after latency and real-invoice recognition accuracy remain unverified**. The 15-second deadline may time out complex PDFs that previously finished later; verify completion rate as well as field accuracy before merging. An explicit live evaluation is provided, uses only synthetic PDFs with competing order/invoice/payment dates, compares the PR #228 baseline against this code, and never calls application auth, Storage, company quota or the database:

```
# Supply GEMINI_API_KEY securely in the environment, then opt in:
RECEIPT_OCR_LIVE=1 bun run test src/lib/receipt-ocr.live.test.ts
```

The live evaluator requires exact date, invoice number and all three totals from the improved path. It logs paired timings and field results, not the API key. A representative real-image corpus and a physical phone check are still needed before claiming production OCR speed/accuracy gains. Do not infer live success from the passing mocked tests.

For the browser check, install Playwright locally or set `PLAYWRIGHT_MODULE_PATH` to an existing installation; use `PLAYWRIGHT_CHANNEL=msedge` for installed Edge. All smoke inputs are synthetic and local.
