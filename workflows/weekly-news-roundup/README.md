# Weekly niche-news roundup video

Turn public RSS headlines into a narrated five-story countdown with source labels, stock footage, word-timed captions and a consistent vertical design. This example separates preparation from rendering, so you can review a saved edition before spending Zvid render credits.

[Watch the sample](https://cdn.zvid.io/blog/weekly-news-roundup-video/1f0f9cdec62c/sample-output.mp4) · [Watch the n8n tutorial](https://www.youtube.com/watch?v=8p54PdNd1ok)

![Historical AI and tech roundup](https://cdn.zvid.io/blog/weekly-news-roundup-video/4284bf631993/sample-output.jpg)

**Historical, unverified demonstration. Check every claim against its linked source before publishing.**

## Requirements

- Node.js 20.12 or newer.
- A Zvid API key from https://app.zvid.io/api-keys. Requests use `https://api.zvid.io`.
- For a **new** edition: OpenRouter and ElevenLabs API keys, an accessible ElevenLabs voice, and public RSS feeds you trust.
- No credentials are needed for the offline build, syntax checks or tests.

The supplied `config.json` keeps the canonical workflow's **`dryRun: false`** default. A render command therefore submits paid work unless you pass `--validate` or set `dryRun` to `true`. Preparation calls OpenRouter and ElevenLabs and can cost money regardless of that setting. There is no editor draft or publishing destination in the Node.js implementation.

## Install and inspect the historical edition

Run these commands in this folder:

```bash
npm ci
npm run check
npm test
npm run offline
```

`npm ci` installs pinned dependencies without running any media-generation command. `offline` reads `data/edition.json` and writes `out/live/project.json` and `summary.json`. It makes no network calls and does not render.

The fixture is a historical September 2026 AI and tech edition of **The Weekly Signal**, not a current news bulletin. Its original prepared narration and five selected clips were retained. The original hosted output had expired, so the included MP4 was rendered locally from the included project on October 28, 2026. Supplied word timestamps were rounded to 0.1-second boundaries to reproduce scene transitions with the current renderer; transcript text and narration audio are unchanged. One media duration was corrected from a reported 30 seconds to the measured 29.92 seconds. The canonical n8n export and live builder remain unchanged. The offline build reproduces the supplied project exactly as a JSON value.

## Validate, then render the supplied edition

Copy `.env.example` to `.env` and set `ZVID_API_KEY`. Never commit this file.

```bash
npm run sample -- --validate
npm run sample -- --max-credits 60
```

Validation makes a free Zvid authoring request and saves the quote. Rendering validates again and requires a positive explicit ceiling. If the quote exceeds the ceiling, no render is submitted. The historical project quoted 52 credits; inspect the current quote because prices and resolved media can change. Validation does not reserve credits. The included sample was rendered locally without an API render charge; its quote is not an audited billing total.

## Prepare a new edition

Set `OPENROUTER_API_KEY` and `ELEVENLABS_API_KEY` in `.env`. Edit `config.json`: choose `niche`, `feedUrls`, `lookbackDays`, `brandName`, `ctaText`, `voiceId` and your colors. Keep one output folder per edition.

```bash
npm run prepare-news -- --out out/edition-001
npm run validate -- --out out/edition-001
npm start -- --out out/edition-001 --max-credits 60
```

Preparation reads RSS, retains at most 40 dated or undated candidates, asks OpenRouter for a rundown, selects footage and optional music from Zvid's stock library, creates one narration with timestamps, uploads it, then writes the edition and project. There are no automatic retries of the model or voice calls. The Zvid SDK also has automatic retries disabled.

Before rendering, review `rundown.json`, source links, `summary.json` and `project.json`. A successful preparation writes `edition.json`; save it with your editorial record. The output directory also contains private service responses and must stay out of version control.

The model summarizes feed excerpts, not full reporting. An invalid source index leaves attribution empty. Read the original sources, verify names and dates, and check pronunciation. Stock footage illustrates a subject and is not proof of an event. Missing clips use a branded graphic fallback; unavailable music is omitted. The writing target of 60 seconds does not guarantee duration or impose a spending cap.

## Resume and retrieve a render

An accepted render job is persisted to `result.json` before polling. Completion saves `videoUrl`. Open that URL to play and download the result before its hosted link expires.

```bash
npm start -- --out out/edition-001 --resume
```

Resume only checks the saved job; it does not submit another. Polling is bounded by `pollSeconds` and `timeoutMinutes`. A local timeout does not cancel an accepted job. If acceptance was uncertain and `result.json` contains `submission-pending` without a job ID, inspect https://app.zvid.io before starting another edition. There is no cross-process or service-wide idempotency guarantee. The output-folder lock prevents two local invocations using the same directory; after a crash, inspect the state and confirm no process is running before removing a stale `.run.lock`.

Preparation writes an attempt marker and refuses another attempt in the same folder, including after a failure. Inspect the saved responses before starting in a new folder; repeating preparation can incur another script or voice charge. It does not automatically recover partially completed paid preparation.

## Operational limits and troubleshooting

- Empty or old feeds: inspect the addresses, date fields and `lookbackDays`. Undated entries remain eligible. Feed order affects which entries reach the pool cap.
- Authentication errors: update the appropriate key and check permissions and quota. API keys do not automatically refresh.
- Voice errors: select a voice your ElevenLabs account can access and keep the timestamps endpoint. Only one speech request is made.
- Validation errors: read `result.json` and fix the saved project before rendering. Do not increase a spending ceiling to bypass validation.
- Render failure or timeout: use the saved job or dashboard before retrying. A failed status or missing HTTPS output is never reported as success.
- Repeated stories: deduplication is within a run; add your own persistent story ledger for future editions.

This example does not schedule itself, fact-check stories, upload to social platforms or send newsletters. Use your own scheduler and editorial handoff only after testing the saved-state behavior. OpenRouter, ElevenLabs, n8n hosting and any publishing tools have separate costs.

## n8n version

Use [n8n/workflow.json](n8n/workflow.json) and [its setup guide](n8n/README.md). It is synchronized byte-for-byte with the canonical published workflow export. The tutorial follows an October edition with a 57-credit quote; its headlines and output differ from this historical sample.

See [Zvid validation](https://docs.zvid.io/docs/validate-and-estimate/), [render lifecycle](https://docs.zvid.io/docs/operations/render-lifecycle/) and [render credits](https://docs.zvid.io/docs/credits-and-plans/). For help, visit https://zvid.io/contact.
