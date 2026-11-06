# Import the testimonial n8n workflow

1. Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before creating Zvid credentials. An owner/admin may need to install it.
2. Import `workflow.json`. Keep the schedule inactive.
3. Create a Zvid API credential with the key from https://app.zvid.io/api-keys and Base URL `https://api.zvid.io`. Attach it to validation, draft creation, render submission and status nodes.
4. Create a Google Sheet with `Reviewer, Rating, ReviewText, Product, ImageUrl, Status, VideoUrl` as separate headers. Copy the sample values from `../data/reviews.json`; leave Status and VideoUrl blank.
5. Connect a Google Sheets OAuth2 credential on **Read reviews sheet** and **Mark row done**. Select the same document and tab in both.
6. Open **Config**, set `source: "sheet"`, `minRating: 5`, `useLlm: false`, `dryRun: true`, and the sample branding from `../config.json`. The maintained export has silent output by default; add only licensed public audio if desired.
7. Execute manually. Open **Dry run summary**, inspect `creditsRequired`, then open `editorLink`. A missing editor link means draft saving failed; validation alone is not a preview.
8. When satisfied, set `dryRun: false` and execute once. Rendering spends credits. **Run summary** contains the completed URL; the sheet receives `Status: done` and `VideoUrl`.
9. Open **▶ Watch video → Binary → data → View**. Download the MP4 and review all scenes. The Watch step is gated to completed media and never submits another render.

The export ships with `dryRun: false` and `minRating: 4`. Change them before your first test. One review is processed per execution. No social publication is included. The displayed customer-verification label is manual text, not a verification check. Use the fixture's Illustrative review label for the fictional example.

The optional Judge.me branch and OpenRouter trimming path are separate from this Google Sheets walkthrough. Review current service authentication and costs before enabling them. The default requires neither token. Judge.me deduplication uses n8n static data, which is not persisted for manual tests and is not a durable full-history queue.

If rendering succeeds but the sheet write or Watch step fails, inspect the saved job and completed URL before rerunning. Reconcile the sheet manually when needed to prevent a duplicate render. Keep the workflow inactive until Google credentials, timezone, review permissions and duplicate handling are ready.

Support: https://zvid.io/contact
