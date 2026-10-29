# Chat to video with Zvid

Turn a written brief into an editable video draft, inspect its signed credit quote, then render the approved draft. The n8n export connects Telegram to an OpenRouter model and Zvid MCP. This Node.js alternative offers a terminal drafting command, a separate approval command and saved-job recovery. It does not send Telegram messages.

The included fictional FocusFlow example is a 12-second vertical launch teaser with three scenes and no audio. `assets/sample-project.json` contains the exact design. `data/project.json` is the same project for deterministic reproduction. The separate model-driven command can choose another design and is not expected to reproduce the same pixels.

## Requirements

- Node.js 22 or later, with npm.
- A Zvid account and API key from https://app.zvid.io/api-keys.
- An OpenRouter API key only for model-driven drafting. Creating the supplied project needs no model credential.
- Enough Zvid credits for an approved render. Creating drafts and checking quotes do not consume render credits; model requests have separate provider costs.

## Install and inspect

```bash
npm ci
npm run check
npm test
```

Copy `.env.example` to `.env`, enter your Zvid key and optionally an OpenRouter key. Keep both private. The API base URL is https://api.zvid.io. MCP connects to https://mcp.zvid.io/mcp with the Creator profile and the configured per-render ceiling. Set `MAX_RENDER_CREDITS=25`, or deliberately choose a lower ceiling that fits your use.

## Reproduce the supplied design

```bash
npm run sample
```

This saves `data/project.json` through the MCP `create_media` tool and prints the editor URL and quote. It creates a project on your account but submits no render. Open the editor link and check every scene. The sample is approximately 12 credits at the documented 1080 × 1920 rate; use the returned live quote, not this estimate.

## Compose from your own brief

Edit `data/brief.txt`, set `OPENROUTER_API_KEY`, then use a new output folder:

```bash
npm start -- draft --brief data/brief.txt --out out/my-brief
```

This calls the OpenRouter model and a restricted set of Zvid drafting tools. The model cannot call `render_media` because it is excluded from both its available tools and the executor allowlist. The command ends when it receives a saved draft and signed quote, or reports an error. Drafting may consume model tokens and account project/template capacity. It is limited to 20 model turns, but this is not a monetary provider budget.

## Approve, render and save

After reviewing the actual draft and price:

```bash
npm start -- render --approve --out out/my-brief --max-credits 25
```

For the deterministic `npm run sample` path, omit `--out out/my-brief` so the command uses `out`. The command checks the saved quote, approval flag and ceiling, saves a stable requested job ID before submission, submits once and waits up to ten minutes. The completed MP4 is saved as `video.mp4` in that folder. It sends no external messages.

The server also verifies the signed quote, current payload, draft version and price. The lower of the requested MCP ceiling and your dashboard ceiling applies. Quotes expire; use the returned deadline. To refresh an unsubmitted draft's quote:

```bash
npm start -- quote --out out/my-brief
```

Review the refreshed price and editor draft again before rendering. Changing the ceiling alone does not constitute approval.

## Recover without paying twice

```bash
npm start -- status --out out/my-brief
```

This uses the official `@zvid/sdk` to read the saved accepted or requested job ID and download a completed video. It never submits a render. Use it after a timeout, lost submission response or download error. If the requested ID is not found, inspect your Zvid dashboard before deciding whether a new render is appropriate. The script deliberately refuses another submission from an uncertain output folder.

`out/state.json` contains the quote token and project/job state. Tool observations can include private project data. Keep the entire output folder private and out of source control. Concurrent commands cannot use the same folder. After a process crash, confirm it has stopped before removing its stale `.run.lock`.

## n8n alternative

Use `n8n/workflow.json` and follow `n8n/README.md`. Install `@zvid/n8n-nodes-zvid` from **Settings → Community nodes** before configuring Zvid credentials; a workspace owner/admin may need to install it. The built-in MCP Client Tool handles conversational operations because the Zvid action node does not expose those tools. Native Zvid nodes handle the accepted render and saved-job playback.

The n8n agent's instruction to wait for approval is a model instruction, not an independent hard approval lock. Its server-side ceiling is per render, not per conversation. The Node.js alternative has a stricter split: the drafting process cannot access render tools and the render command requires `--approve`.

## Limits and maintenance

No automatic social publishing, rate limit scheduler, durable chat server or Telegram adapter is included in this Node.js example. Model-selected designs vary; review wording, layout, duration and rights to media. Download completed outputs before the account's output-expiry deadline. Keep private credentials out of prompts, exported workflows and screenshots. Rotate or replace revoked provider keys in `.env` or n8n credentials.

Tests use mock tool and job responses. They verify approval, quote limits, allowed tools, completion checks and recovery behavior without credentials or paid operations. The bundled sample is a real local render of the supplied saved project. A live model-to-MCP-to-Telegram delivery is a separate integration check.

For account help, use https://zvid.io/contact.
