# n8n setup

1. Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring credentials. A workspace owner/admin may need to install it.
2. Create an empty workflow and use its menu's **Import from File** action to import `workflow.json`. Keep the daily schedule inactive during setup.
3. Create a Zvid API key at https://app.zvid.io/api-keys. Create a **Zvid API** credential in n8n with the key and Base URL `https://api.zvid.io`. Select it on **Validate project (free)**, **Submit render**, **Get render status** and **Save draft to editor**.
4. Create a key at https://openrouter.ai/settings/keys. Set a spending limit. In **Write kit copy**, create an **OpenRouter API** credential with that key. The default model is `openai/gpt-4.1-mini`; verify that your account can use it.
5. In **Config**, set `feedUrl`, branding and display domain. A homepage is not an RSS feed. For the supplied example use the `feedUrl`, `brandName`, `domainOverride`, `kickerText` and `musicUrl` from `../config.json`.
6. Change `dryRun` to `true`, then choose **Execute workflow** from **Test manually**. Review **Pick newest post**, **Prepare kit prompt**, **Parse kit copy** and **Dry run summary**. Quotes are per output plus `kitCreditsTotal`. Open `editorLink` values when draft saving succeeds. Model calls can charge during this preview.
7. To render, set `dryRun` to `false` and execute. This is a new run and can generate new copy. **Render one asset at a time** submits serially. **Run summary** retains each output URL and job ID. Open **▶ Watch video → Binary → data → View**, selecting each item. Download both MP4s and the PNG.
8. Review all three pieces and publish them manually. Before enabling the 9am schedule, set the workflow timezone, verify key expiry and spending limits, and prevent overlapping runs.

## Editor draft compatibility exception

Published `@zvid/n8n-nodes-zvid` 0.1.8 has no Project Create operation. **Save draft to editor** therefore uses HTTP Request with `POST /api/projects`, body `{name, payload}` and the same predefined **Zvid API** credential. This credential supplies `X-Api-Key`; no key belongs in the node body. All supported validation, submission and status actions use native Zvid nodes. The exception is also explained on the canvas. The official listing and historical recording can show the earlier draft node.

## Defaults and recovery

The import has `dryRun: false`: an unmodified execution renders and spends credits. The maintained download has no default background music. Set `musicUrl` only if you want an authorized public audio track. The sample quote is 29 credits for a 20-second square video, an 8-second teaser and one image. Validation and drafts do not consume render credits; OpenRouter costs are separate. **Write kit copy** can automatically retry a failed request up to three attempts.

The newest completed GUID is remembered only on production executions. Manual tests can create the same kit repeatedly. This is not an archive processor. A partial failed kit does not advance the marker, so a new execution can duplicate its successful pieces. Save IDs and inspect the prior execution and Zvid dashboard before retrying.

Only explicit 429 submission rejections retry automatically, with at least 30 seconds between attempts and a bounded deadline. Accepted jobs are not resubmitted automatically. Polling timeout does not prove a job failed. The Watch step can fail while media is complete; use the retained URL rather than rerendering.

The sample uses a fictional article and prepared copy. Fresh OpenRouter responses can differ. In its recorded preview, draft saving was unavailable because the account's saved-project allowance was full; validation and the 29-credit estimate succeeded.

Support: https://zvid.io/contact
