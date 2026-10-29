# Captioned Shorts from a direct video URL

Turn the spoken opening of a recording into captioned 1080 × 1920 clips. ElevenLabs Scribe supplies word timings, OpenRouter suggests highlight ranges, and Zvid renders each clip with a title, captions and the source audio. Review the selected words and footage before publishing.

[Watch the included archival news example](assets/sample-output.mp4)

![Captioned example](assets/sample-output.jpg)

The included example is a 22.87-second archival news demonstration. Its range was manually reviewed to retain a complete opening and two complete items. The supplied prepared project reproduces that selection; a new model call can choose different words. The historical validation quote was 23 render credits. This is illustrative material, not current news.

## Requirements

- Node.js 20.19 or newer.
- A Zvid API key from https://app.zvid.io/api-keys for validation and rendering.
- For new input, an ElevenLabs API key with Speech to Text permission and an OpenRouter API key with model credit.
- A public, stable HTTPS video file containing clear speech that you have permission to use. YouTube watch pages are not accepted by this workflow.

## Install and check without spending credits

Run these commands inside this folder. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm`.

```text
npm ci
npm run check
npm test
npm run offline
```

Offline mode copies the frozen sample into `out/sample/prepared.json` and creates its state file without network requests. It does not transcribe, select highlights or render. It uses the same payload as `assets/sample-project.json`.

Copy `.env.example` to `.env`, then fill `ZVID_API_KEY` privately. Keep credentials out of `config.json`, inputs and source control. Use `https://api.zvid.io` as the API base.

## Validate and render the supplied sample

```text
npm run sample
npm run render-prepared -- --out out/sample --max-credits 23
```

The first command validates the frozen project and reports the current quote without rendering or calling ElevenLabs/OpenRouter. The second validates again, checks the total against the cap, then submits and downloads `out/sample/clip-1.mp4`. If the current quote exceeds 23, no render is submitted. Review the estimate before choosing a different cap.

## Prepare a new source

Edit `data/input.json` to give a direct HTTPS file URL, optional title, and `layout: "fit"` or `"fill"`. `fit` keeps the entire frame over a blurred copy. `fill` crops the center and does not follow faces. Keep the source URL stable until every render completes.

In `config.json`, choose the handle, colors and clip limits. This companion starts with one clip and a 4 MiB transcription sample; the synchronized n8n workflow ships with two clips and 24 MiB. The target is 28 seconds, with 18/40-second min/max settings. The exact duration follows word boundaries and short lead/tail padding.

Add `ELEVENLABS_API_KEY` and `OPENROUTER_API_KEY` to `.env`. Create the ElevenLabs key in Developers → API Keys with Speech to Text enabled. In OpenRouter, create an API key in Settings → Keys, set a spending limit and confirm your chosen model is available. The script does not refresh or rotate provider keys.

```text
npm run prepare-video -- --allow-ai
```

This explicitly authorizes one transcription request and one highlight request, both billed separately by their providers. It downloads a bounded opening sample, prepares projects, validates them and writes `out/live/prepared.json`. It does not render, even though the canonical n8n export has `dryRun: false`. Review the saved `projects[].meta` ranges/titles and the caption words in each payload. Treat model suggestions as candidates.

Preparation saves `preparation-status.json` before any paid request and keeps each completed transcript/model response immediately. It refuses another preparation attempt in that same folder, including after a crash. Inspect those private files first. Use a new `--out` only when you deliberately want a new paid preparation; a completed prepared project can be validated/rendered without repeating the upstream calls.

```text
npm run render-prepared -- --max-credits 60
```

That is an illustrative cap, not a price promise. The script validates every clip and checks the complete batch quote before the first submission. Clips render one at a time and save as `out/live/clip-1.mp4`, `clip-2.mp4`, and so on. It does not upload them to YouTube or any social account.

## Recovery

Every submission records `submitting` before the request and saves the accepted `jobId` before polling. A network failure can leave an ambiguous `submitting` state: inspect the Zvid dashboard before starting another run. Accepted jobs are never automatically submitted again.

```text
npm run resume -- --out out/live
```

Resume polls and downloads only saved jobs; it does not call transcription, the model or new render submissions. A timeout can leave a job running. Preserve the output directory, wait and resume. If some later clips have no job, inspect completed results before running `render-prepared` again with a full batch cap. Use a new output directory for a genuinely new source.

The `.run.lock` prevents simultaneous processes in one output folder. After a crashed process, confirm it is no longer running before removing that lock. Save downloaded MP4s in durable storage; provider output URLs can expire.

## Limits and n8n differences

- Only the downloaded opening is transcribed. It does not search the entire long video. A larger sample may increase transcription costs.
- The Node.js reader stops if the server ignores Range and exceeds `maxTranscribeMB`; the canonical n8n request is only a Range request and cannot promise that every server obeys it.
- A truncated MP4 needs its index near the start. Use a fast-start/web-optimized export, or a small whole file.
- The sample mode bypasses upstream paid calls and uses an approved prepared project. Live preparation can select different ranges.
- No face tracking, automatic social posting, duplicate detection or continuous scheduler is included.
- The CLI validates without saving editor drafts. The synchronized n8n workflow contains an optional Project → Create branch that published package 0.1.8 does not expose; follow [the n8n setup notes](n8n/README.md) before import execution.
- The template's model title can misrepresent the source. Check captions, context and attribution before posting.

The canonical workflow source is synchronized at the revision recorded in `assets/sample-output.json`. [Official n8n listing](https://n8n.io/workflows/20180-create-captioned-vertical-video-highlights-with-zvid-elevenlabs-and-openrouter/). Customer help: https://zvid.io/contact.
