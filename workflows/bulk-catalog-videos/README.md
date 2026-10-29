# Bulk product catalog videos

Create one vertical product video per catalog row with a shared three-scene design. The n8n workflow reads Google Sheets and writes each finished URL back to the matching `Product`. This Node.js alternative reads a local JSON catalog and writes `updated-catalog.json`; it does not connect to Google Sheets, schedule itself or publish to a store.

The sample is a fictional Aurora Ceramic Pour-Over Set at $68, compared with $84. Its product facts are illustrative. The same supplied photo fills both image positions. The sample is silent.

[Watch the sample](assets/sample-output.mp4) · [Poster](assets/sample-output.jpg) · [Source project](assets/sample-project.json)

## Set up

Use Node.js 20.12 or later. From this directory:

```sh
npm ci
npm run check
npm test
npm run offline
```

These commands do not call Zvid or spend credits. `out/run/batch.json` contains the prepared template and product variables. Copy `.env.example` to `.env` and fill `ZVID_API_KEY` with a key from https://app.zvid.io/api-keys. Keep the file private. The SDK uses https://api.zvid.io.

`data/catalog.json` supplies the sample. Use a JSON array with `Product`, `Price`, `Feature1`, `Feature2`, `Feature3`, `ImageUrl1` and an empty `VideoUrl`. Optional fields are `CompareAtPrice`, `ImageUrl2`, `CtaText` and `row_number`. Product names must be unique. Completed rows with a nonempty `VideoUrl` are skipped. Rows with invalid required values are reported, and valid rows can continue.

Edit `config.json` for branding and the per-run cap. This companion starts with `maxProducts: 1`; the synchronized n8n template retains its `maxProducts: 5` and `dryRun: false` defaults.

## Validate, then render

```sh
npm run dry-run
npm start -- --max-credits 12
```

Validation checks each selected product, saves `product-1.json` and quotes the total in `out/run/result.json`. It does not render, charge render credits or create an editor draft. The second command submits one bulk render only if the complete quote is at most 12 credits. Adjust the ceiling deliberately after reviewing your actual quote. The sample design was quoted at 12 credits on 29 October 2026; quotes can change with the project.

The Node.js CLI requires `--max-credits` for a new paid batch. The n8n template instead renders immediately with `dryRun: false`. Do not assume the CLI gate exists in n8n.

The script polls completed jobs, maps the returned job IDs to products, and saves `videos` plus `updated-catalog.json`. Open a completed `VideoUrl` in your browser, review the entire video, then use the browser's video download control to save the MP4. This script does not download MP4 files automatically.

To process your own input:

```sh
npm start -- --catalog data/my-catalog.json --dry-run --out out/my-catalog
npm start -- --catalog data/my-catalog.json --max-credits 60 --out out/my-catalog
```

For a later batch, use the saved `updated-catalog.json` as input and a new output directory. Otherwise the original blank `VideoUrl` values will select the same products again.

## Recovery and limits

```sh
npm start -- --resume --out out/my-catalog
```

Resume polls the saved batch, without submitting again. A timeout does not cancel server jobs. The script saves `submission-pending` before sending a paid request, disables SDK automatic retries, and stores the receipt as soon as it arrives. If the connection fails before a receipt is saved, inspect your Zvid dashboard and match the batch manually before starting a new run. Do not delete the state file just to bypass this guard.

An explicit HTTP 429 is recorded as `rejected`, with `retryAt`; no batch was accepted. Wait until that time, then repeat the original render command, which validates again before submitting. Do not use `--resume` for a rejected request with no batch ID. A receipt that omits a selected product produces a partial result requiring dashboard inspection, never a success for the whole catalog.

The script blocks simultaneous use of an output directory with `.run.lock`. After a crashed process, confirm no process still uses that directory before removing its stale lock. Partial failures remain in `errors`; failed products retain empty `VideoUrl` fields. Review and fix only those rows.

The example does not observe later price changes or replace published videos. Use accurate product facts and media you may publish. Prices use a decimal point; this sample's display logic is not a locale-aware money parser. A price changed in the catalog cannot update an already-rendered MP4. Product website text in a video is not clickable; add the destination link in the surrounding page, ad or post.

API output links have plan-dependent expiry. Download completed files while available. A nonempty `VideoUrl` is treated as completed even if its link has expired; it is not checked for freshness.

## n8n

Read [n8n/README.md](n8n/README.md) and import [n8n/workflow.json](n8n/workflow.json). [General walkthrough on YouTube](https://youtu.be/i22Yzjlq9Tg) is introductory background, not a recording of this exact catalog workflow.

Support: https://zvid.io/contact
