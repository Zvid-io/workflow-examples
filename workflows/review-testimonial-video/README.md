# Review to testimonial video

Turn the first eligible review in a JSON file into a vertical testimonial MP4. The companion loads the same review selection, cleaning, trimming and design code as its synchronized n8n export. It uses the official `@zvid/sdk`.

The supplied Alex Morgan / Everyday Tote review is fictional and labeled **Illustrative review** in the video. It has five stars, three scenes, a 14.93-second design, and no audio. Use approved customer wording and accurate attribution for your own output.

## Requirements

- Node.js 22 or newer.
- A Zvid API key from https://app.zvid.io/api-keys for validation or rendering.
- Available Zvid credits for rendering. Local checks and offline mode make no API calls; API validation does not consume render credits.

## Setup and local checks

Run these commands inside this workflow folder, or inside the extracted ZIP root:

```sh
npm ci
npm run check
npm test
npm run offline
```

`out/offline/project.json` contains the generated project; `out/offline/result.json` records the selected review and design. No video is rendered by offline mode.

Copy `.env.example` to `.env` and set `ZVID_API_KEY` privately. Never commit it. The API origin is `https://api.zvid.io`.

## Validate, then render

```sh
npm start -- --input data/reviews.json --out out/validation
```

This validates the design and saves `creditsQuoted` and warnings in `out/validation/result.json`. It never renders by default. The supplied 14.93-second 1080 × 1920 design was quoted at **15 credits** on 29 October 2026. Validate your current input and account before rendering.

After reviewing the quote, explicitly authorize rendering with a ceiling:

```sh
npm start -- --input data/reviews.json --render --max-credits 15 --out out/alex
```

The script validates again. If the quote exceeds the ceiling, no render is submitted. Successful completion saves `project.json`, `result.json`, and `video.mp4`. Inspect the full video, actual quote, rating, name and CTA before publishing.

Rendering has no automatic POST retry. The result journal is written before submission and again immediately after receipt of a job ID. If polling or downloading is interrupted:

```sh
npm start -- --resume --out out/alex
```

Resume checks the saved job without submitting another render. If the journal says `submission-pending` with no job ID, check recent renders at https://app.zvid.io before deciding whether to submit again. A dropped response can hide a successful submission. A failed job needs deliberate diagnosis and a new output directory for a replacement. Do not delete the journal to force a retry.

An explicit HTTP 429 rejection is saved as `rejected` with `retryAt`, honoring at least 30 seconds and any longer provider delay. No job was accepted. Wait until that time, then rerun the original input command to obtain a new validation quote before submission. `--resume` is only for accepted jobs. Unknown network/server outcomes remain blocked for inspection.

A `.run.lock` prevents concurrent commands in the same output directory. If the process is forcibly terminated, check that it has stopped before removing that one lock file and resuming. Do not run the same input in parallel in different output directories.

## Input and configuration

`data/reviews.json` is an array with the same columns as the n8n Google Sheet:

- `Reviewer`, `Rating` and `ReviewText` are required. This companion requires numeric ratings from 1 to 5.
- `Product` and `ImageUrl` are optional. Images must be public HTTPS URLs.
- `Status` must be empty for selection. A nonempty value skips the row.
- `VideoUrl` is provided for parity but is not written by this script.

The first pending row at or above `minRating` is selected. The supplied configuration uses `minRating: 5`. The n8n export ships with `minRating: 4`; change it to 5 to follow the blog.

`config.json` sets brand, CTA, store address and `maxQuoteChars`. The label is configured text; **Verified customer is not a verification service**. Use it only when you have verified the customer. The fictional fixture uses `Illustrative review`, `SAMPLE REVIEW`, and `An illustrative customer story.`

Long quotes use the canonical rule-based trimmer. It keeps original wording and may shorten it with an ellipsis. Review any shortened quote in context.

## Differences from n8n

- Reads local JSON, not Google Sheets or Judge.me.
- Does not update the input file, store a processed queue, or schedule itself. Record completed reviews in your own source of truth before choosing the next input.
- Always uses rule-based trimming and silent output. It does not call OpenRouter or fetch music.
- Validates by default; n8n ships with `dryRun: false`, which renders.
- Requires an explicit credit ceiling when rendering. n8n's current render path validates but does not pause for a human budget approval.
- Does not save an editor draft. The n8n `dryRun: true` branch does.
- Downloads a local MP4 after completion. Neither implementation publishes to social platforms.

The website shown inside the MP4 is visual text, not a clickable link. Add a real destination link in your post, ad or page.

## n8n setup

See [n8n/README.md](n8n/README.md). Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring Zvid credentials; an owner/admin may need to install it. Import `n8n/workflow.json`, keep the schedule inactive, set both Sheets nodes to your queue, set `dryRun: true`, and review the draft and estimate before rendering.

## Output and maintenance

[Watch the sample](assets/sample-output.mp4). The poster and exact source project are under `assets/`; `sample-output.json` records reproduction details. This sample was rendered locally with the Zvid engine; the 15-credit API validation is a quote, not a paid-render bill.

Zvid API outputs have plan-dependent expiry. Download while the URL is available and preserve any media needed for long-term publishing. `result.json` retains `outputExpiresAt` when returned. A changed review or brand setting does not update an existing MP4.

## Troubleshooting

| Symptom | Next action |
| --- | --- |
| `state: empty` | Check empty Status fields and the configured minimum rating. |
| `missing Reviewer or ReviewText` | Complete that eligible row before rendering. |
| `Validation failed` | Read field errors, fix the input, then validate again. |
| Credit ceiling exceeded | Inspect the quote and intentionally choose a sufficient ceiling. |
| Saved job times out | Resume the saved directory; do not submit a second job. |
| Video download fails | Resume while output is available; the completed job remains saved. |

Support: https://zvid.io/contact
