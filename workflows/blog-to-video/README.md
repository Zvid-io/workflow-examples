# Blog post to video summary

Read the newest RSS or Atom entry, summarize its available article text, generate one narrated take and render a captioned vertical video with Zvid. This independently runnable Node.js companion uses the same selection, script parsing, caption timing and scene builder as the synchronized n8n export.

It downloads a finished MP4. It does not publish to social accounts, fact-check sources, process an archive or guarantee that every new post is picked up.

![A blog summary rendered as branded text slides](https://cdn.zvid.io/blog/blog-to-video/62ef8281b768/blog-text-slide-summary.jpg)

[Watch the actual example](https://cdn.zvid.io/blog/blog-to-video/2ad6252af4b0/blog-text-slide-summary.mp4) · [YouTube walkthrough](https://youtu.be/xqjp_Af-Hf8)

## Requirements

- Node.js 20.19 or newer.
- A Zvid API key from https://app.zvid.io/api-keys and render credits for paid runs.
- OpenRouter and ElevenLabs API keys for live feed preparation, with access to the chosen model and voice.
- An RSS/Atom feed and permission to reuse its articles and media.

Install and check:

```bash
npm ci
npm run check
npm test
npm run offline
```

Use `npm.cmd` in PowerShell if your execution policy blocks the `npm` wrapper. These checks do not call external generation services or render a new video. `offline` copies the supplied prepared sample into `out/sample/prepared.json`.

## Configure your live feed

Copy `.env.example` to `.env` and set `ZVID_API_KEY`, `OPENROUTER_API_KEY` and `ELEVENLABS_API_KEY`. Keep `.env` private. Edit `config.json`, particularly `feedUrl`, `brandName`, `ctaText`, `voiceId`, model and colors. Use https://api.zvid.io as the Zvid origin.

Get a Zvid key at https://app.zvid.io/api-keys. In OpenRouter, open Settings → API Keys and create a key. In ElevenLabs, open Developers → API Keys and create a key with Text to Speech access. The voice must be available to your account.

`dryRun` ships as `false`. A normal live run renders after preparation if a sufficient `--max-credits` limit is provided. For the first preview:

```bash
npm run dry-run -- --allow-generation
```

This calls OpenRouter and ElevenLabs, uploads narration, validates the generated project and saves an editor draft. It does not submit a Zvid render. The output includes `editorLink` and `creditsQuoted`; `out/live/prepared.json` keeps the exact project. There is one speech request and no automatic paid-generation retry.

Review the draft and the source article before rendering that exact prepared input:

```bash
npm run render-prepared -- --max-credits 60
```

This validates again, refuses a quote above your ceiling, submits once, saves the returned job ID, waits and downloads `out/live/video.mp4`. It does not regenerate narration. The n8n template's new full executions do regenerate the script and voice; the prepared-render route is a deliberate difference.

## Sample and provenance

The included 36.4-second sample demonstrates the workflow's text-slide fallback using the narration retained from the public Google Health walkthrough. Its source project is `assets/sample-project.json`; input, configuration and metadata are in `data/sample-prepared.json`. No stock footage is used in this sample, and its audio already contains the retained soundtrack. The YouTube walkthrough and n8n screenshots show the earlier footage version of the same source topic.

The sample's word timings were transcribed from that retained audio and rounded to 100 ms so scene boundaries resolve to exact frames at 30 fps. Live runs obtain character alignment directly from ElevenLabs and group it into words. The sample is a prepared reproduction fixture, not a fresh full RSS/OpenRouter/ElevenLabs execution.

To validate the sample without generating new narration:

```bash
npm run sample -- --dry-run
```

This needs only `ZVID_API_KEY` and saves a draft. To render it after review:

```bash
npm start -- --render-prepared --out out/sample --max-credits 60
```

The prepared sample references a verified Zvid CDN narration asset. Media can change independently of code; its SHA-256 is recorded in `assets/sample-output.json`.

## Recover instead of submitting twice

State and job IDs are recorded in `out/live/state.json`. Resume the saved job after an interrupted wait or download:

```bash
npm run resume
```

For a custom output folder, use `npm start -- --resume --out out/your-run`. The script does not automatically retry a render submission. If state is `submitting` with no job ID, the request may have been accepted before the response was lost. Inspect your Zvid job list before another attempt. A `failed` job remains inspectable; an expired output requires separate deliberate rendering if you still need it.

The script refuses to reuse an output folder that records a render attempt. Choose a new `--out` for each new job after reviewing the previous state. A per-folder lock prevents overlapping use of the same folder. Use a single runner when scheduling; this is not a distributed queue.

## Defaults, costs and limits

- `dryRun: false` renders; `--dry-run` prepares and validates without rendering.
- `--allow-generation` is required for live script and speech preparation, including dry runs. Those providers can charge independently.
- `--max-credits` limits the Zvid render only. It does not limit writing or speech usage.
- Validation and editor drafts do not consume render credits. At 1080 × 1920, video credits equal duration rounded up; revalidate your project for its actual quote.
- The newest feed entry is the only candidate. Several posts between runs can leave older entries unprocessed.
- `out/feed-memory.json` stores only the last completed live GUID. Keep the file, avoid overlapping runners and do not treat it as an archive or a complete deduplication system.
- Article page retrieval is best-effort; the feed text is the fallback. The writer sees at most `maxPromptChars` characters.
- Stock search failures use text slides. Music failures omit a separate background track. Source words and footage still need editorial review.
- Check provider keys, model access, voice availability and quota before unattended runs. No key renewal, budget replenishment or social posting is implemented.

## n8n

See [n8n setup](n8n/README.md). Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring credentials; a workspace owner/admin may need to install it. Import `n8n/workflow.json`. The download retains `dryRun: false` and an inactive schedule.

Support: https://zvid.io/contact
