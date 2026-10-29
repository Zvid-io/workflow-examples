# n8n catalog workflow

Install `@zvid/n8n-nodes-zvid` through **Settings → Community nodes** before configuring Zvid credentials. A workspace owner/admin may need to install it. Create a new workflow and choose **Import from File** for `workflow.json`. Keep scheduling inactive during setup.

1. Create a Zvid API key at https://app.zvid.io/api-keys. Create a **Zvid API** credential with that key and base URL `https://api.zvid.io`. Choose it on **Validate project (free)**, **Save draft to editor**, **Submit bulk render** and **Get batch status**.
2. Import `../data/catalog.csv` into a Google Sheet. The headers are `Product`, `Price`, `CompareAtPrice`, `Feature1`, `Feature2`, `Feature3`, `ImageUrl1`, `ImageUrl2`, `CtaText`, `VideoUrl`.
3. Connect a Google Sheets OAuth2 credential to **Get catalog rows** and **Write links to sheet**. Select the same spreadsheet/tab in both. For managed n8n Cloud OAuth, click **Sign in with Google**. Self-hosted users configure a Google OAuth client, enable the Sheets and Drive APIs, add n8n's exact callback URL and then connect their account. See [n8n's Google setup](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/).
4. In **Write links to sheet**, confirm **Column to match on** is `Product`; map `Product` to `{{ $json.Product }}` and `VideoUrl` to `{{ $json.VideoUrl }}`. Every product name must be unique.
5. Change **Config** to `dryRun: true`, `maxProducts: 1`. Execute once. Read **Dry run summary** and open its `editorLink` to inspect the first product and quote. Validation and draft creation do not consume render credits.
6. Set `dryRun: false` to render and spend credits. Wait for completion, inspect **Run summary**, verify the URL in the sheet, and open **▶ Watch video** to play/download it.

The exported default is `dryRun: false`, `maxProducts: 5`: an unmodified run renders and spends credits. The shipped download is silent; add your own public audio URL to `musicUrl` if desired. The historical default video quote was 12 credits; obtain the current quote for your data. n8n validates the first product and multiplies its quote by batch size; it does not validate every row's remote image in advance.

Blank `VideoUrl` means pending; nonempty means skipped. An entirely completed catalog exits successfully at **No pending products**. Missing fields and duplicate names are reported. Failed rows remain pending. Do not rerun after a timeout before checking saved batch/job IDs in the dashboard: the jobs continue server-side. If the sheet write failed, recover the finished URLs from **Collect video links** before another run.

The schedule is Monday at 08:00 in the workflow/instance timezone. Enable it only after preview, rendering, row write-back and OAuth renewal work. Google OAuth refresh is managed by n8n while consent remains valid; testing-mode, revoked access and administrator policies can require reconnecting.

This workflow does not upload to a store or social channel and does not replace videos after a price change. Keep a copy of downloaded MP4s. Support: https://zvid.io/contact
