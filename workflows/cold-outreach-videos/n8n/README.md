# n8n setup

Install `@zvid/n8n-nodes-zvid` from **Settings → Community nodes** before configuring credentials. A workspace owner/admin may need to install it. Import `workflow.json` into an inactive workflow.

Create a **Zvid API** credential with a key from https://app.zvid.io/api-keys and base URL `https://api.zvid.io`. Select it on Validate project (free), Save draft to editor, Submit bulk render and Get batch status.

Connect Google Sheets OAuth on both Read leads sheet and Write URLs back. Pick the same spreadsheet and tab in both. Use these exact headers: `FirstName`, `Company`, `Website`, `LogoUrl`, `Role`, `Status`, `VideoUrl`. Keep the update matched on `row_number`. Do not sort or delete rows during a run.

For the provided sample, put Maya, Cedar Grove Demo, cedargrove.example and Operations lead in the corresponding columns; leave LogoUrl, Status and VideoUrl empty. Paste the values from `../config.json` into Config for this article's fictional sender. The import preserves its original defaults (`maxPerRun: 10`, `dryRun: false`). Rendering consumes credits. Set `maxPerRun: 1` and `dryRun: true` before your first full execution; clear musicUrl for the silent sample.

Execute manually and inspect Dry run summary: selected lead, per-video/total credit quote and editorLink. Preview creates an editor draft, leaves the sheet untouched and does not consume render credits. Set dryRun false only when ready to pay for the batch.

When finished, inspect Run summary and check `done` plus VideoUrl in the correct sheet row. Open the gated Watch video step, Binary, data, View. If download fails, use the saved VideoUrl; do not rerender. A timeout does not cancel jobs; inspect the saved bulk/job IDs in https://app.zvid.io before retrying. A failed sheet write can cause completed leads to render again on the next schedule; repair the tracking cells first.

The Tuesday 9am schedule is inactive on import. Check workflow timezone, Google OAuth renewal and successful writeback before activation. The workflow creates videos only; email, CRM and sequencer delivery are separate integrations.
