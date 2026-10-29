# Blog post to a multi-format content kit

Turn the newest RSS or Atom post into a square LinkedIn video, a landscape X teaser and an Open Graph share image. The script uses OpenRouter for copy and Zvid for the three media outputs. It does not publish to social accounts or update a CMS.

![Cedarline Demo weekly content review video](https://cdn.zvid.io/blog/blog-content-kit/b111a02fbf52/blog-kit-poster.jpg)

[Watch the 20-second sample](https://cdn.zvid.io/blog/blog-content-kit/d2793a6af14f/blog-kit-linkedin.mp4) · [Watch the 8-second teaser](https://cdn.zvid.io/blog/blog-content-kit/7cd6573dc976/blog-kit-teaser.mp4) · [Open the share image](https://cdn.zvid.io/blog/blog-content-kit/d6e66408c218/blog-kit-og.png)

## Install and check

Use Node.js 20.19 or newer. From this workflow folder, run:

```bash
npm ci
npm run check
npm test
npm run offline
```

In PowerShell, use `npm.cmd` if the shell blocks the `npm` wrapper. These checks need no service credentials and spend no render or model credits. The offline command saves the supplied three-piece sample to `out/sample/prepared.json`.

## Preview the supplied kit

Copy `.env.example` to `.env`. Set `ZVID_API_KEY` to a key created at https://app.zvid.io/api-keys. Keep the file private. The sample does not need OpenRouter because it includes prepared copy and the exact three source projects.

```bash
npm run sample
```

This validates the three pieces and tries to save editor drafts. `out/sample/state.json` records `kitCreditsQuoted` and per-piece `editorLink` values. Validation and saved drafts do not consume render credits. Saving drafts requires room in your account's saved-project allowance; a missing editor link does not erase the credit quote.

After reviewing the projects and total quote, render that saved input:

```bash
npm start -- --render-prepared --out out/sample --max-credits 29
```

The script validates all pieces before submitting any, refuses a kit above the ceiling and renders serially. The sample's historical quote was 20 + 8 + 1 = 29 credits. Your current quote takes precedence. Outputs are `linkedin-video.mp4`, `x-teaser-video.mp4` and `og-image.png` inside `out/sample`.

## Use your own feed

Create an API key at https://openrouter.ai/settings/keys, give it a spending limit, and add it as `OPENROUTER_API_KEY` in `.env`. Check the key's expiry, remaining budget and model access before scheduling. This script does not renew keys.

Edit `config.json`: replace `feedUrl`, `brandName`, `domainOverride`, colors and labels. The supplied configuration uses a fictional Cedarline Demo feed, silent videos, 20 and 8 seconds, and all three outputs enabled. `dryRun` ships as `false`.

```bash
npm run dry-run -- --allow-generation
```

This makes one OpenRouter request, saves `out/live/prepared.json`, validates the projects and attempts editor drafts. OpenRouter can charge even when `dryRun` is true. The script does not automatically retry a model request.

Review the source article, generated copy and any editor drafts, then render the saved kit without another model call:

```bash
npm run render-prepared -- --max-credits 29
```

For a new live article after a completed run, choose a new output folder:

```bash
npm start -- --dry-run --allow-generation --out out/next-post
npm start -- --render-prepared --out out/next-post --max-credits 29
```

At least one of `makeLinkedInVideo`, `makeXTeaser` and `makeOgImage` must remain true. Live model wording can vary. To reproduce the supplied sample exactly, use `npm run sample` instead of generating new copy.

## Recover an interrupted kit

```bash
npm start -- --resume --out out/sample --max-credits 29
```

`state.json` saves every accepted job ID. Resume waits for those jobs, retries their downloads and submits only pieces that have no prior submission. It can therefore spend credits on unfinished pieces, within the whole-kit ceiling. It never regenerates copy.

If a piece is `submitting` without a job ID, the response may have been lost after acceptance. The script stops. Inspect https://app.zvid.io before another paid attempt. It does not automatically retry submission errors, including explicit 429 responses. A failed accepted job is not automatically submitted again. Keep `prepared.json` unchanged; its checksum is checked on recovery.

The output folder has a lock to prevent overlapping use. A crash can leave `.run.lock`; confirm no process is using the folder before removing that lock. Use one runner when scheduling. Separate folders do not provide a distributed queue or account-wide lock.

## Sample and operational limits

The sample uses the fictional article **A calmer weekly content review**, Cedarline Demo branding and `cedarline.example` as a display label. It includes the retained reviewed copy from the October 2026 n8n demonstration, two silent videos and a PNG. The current builder reproduces all three source projects exactly. Rendering them again still creates new paid jobs.

- Only the newest feed entry is considered. Several posts between checks can leave older posts unprocessed.
- `out/feed-memory.json` records the last completely rendered live GUID. Keep it between runs. It is not a full post history.
- The page request is best effort; feed text is the fallback. The model sees at most `maxPromptChars` characters.
- Text length checks help layout but do not fact-check claims. Review all copy before distribution.
- Music is optional and disabled in the sample. Use a public HTTPS audio URL you may publish; an unreachable or oversized track is omitted.
- The printed domain and CTA in a video are pixels. Put the article URL in the social post or CMS separately.
- Download completed media before its account-dependent output availability expires.
- `--max-credits` limits Zvid rendering, not OpenRouter usage. No social publishing, automatic token renewal or key-budget replenishment is implemented.

## n8n alternative

See [n8n setup](n8n/README.md) and the [official n8n listing](https://n8n.io/workflows/20181-create-linkedin-videos-x-teasers-and-og-images-from-blog-rss-with-openai-and-zvid/). The synchronized `n8n/workflow.json` preserves `dryRun: false` and an inactive schedule. The Node.js script adds prepared-input recovery and a whole-kit credit ceiling. n8n manual full runs regenerate copy and may render the same post again; it also retries explicit capacity rejections within a deadline.

Support: https://zvid.io/contact
