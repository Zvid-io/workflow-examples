# n8n setup

Install `@zvid/n8n-nodes-zvid` from **Settings → Community nodes** before configuring Zvid credentials. A workspace owner/admin may need to install it. Import `workflow.json` through the workflow menu's **Import from file** action and keep the schedule inactive.

Create a **Zvid API** credential with a complete key from https://app.zvid.io/api-keys and Base URL `https://api.zvid.io`. Select it on every supported Zvid node. The imported template ships with `dryRun: false`, so full execution renders and spends credits.

**Version 0.1.8 adjustment:** this published package does not expose Project/Create. Delete **Save draft to editor** from the imported canvas before testing and leave `dryRun: false`. Use **Execute step** on **Check validation** to obtain a quote without continuing to Submit render. For a visual preview, copy only the `payload` object from Build project JSON, then use **Import → Paste JSON → Import project** in https://editor.zvid.io. The complete `dryRun: true` draft branch requires a package with Project/Create support. The supplied canvas screenshot records an earlier development installation, not proof that 0.1.8 supports that action.

Create a Google Sheet with headers `Quote`, `Author`, `Role`, `Company`, `Rating`, `Featured`, `Status`, `VideoUrl`. Import `../data/testimonials.csv` or copy the two supplied fictional rows. Connect a Google Sheets OAuth2 credential to both **Read testimonials sheet** and **Mark rows compiled**, selecting the same document and tab. Set the writeback node to match `row_number`; keep its existing Status/VideoUrl expressions.

In Config, use the sample branding from `../config.json`: Cedarline Demo, Stories from our demo, Fictional customer stories, Fictional demonstration, Explore the demo, cedarline.example/stories. Set `maxQuotes: 2`, `monthLabelOverride: "October 2026"`, `musicUrl: ""`, and keep both ratings empty.

Inspect the two selected rows, execute Check validation, and review the 20-credit sample quote. When ready to spend the current quote, use Test manually and **Execute workflow**. On completion, the selected rows receive `Status = compiled` and the same `VideoUrl`. Open **▶ Watch video → Binary → data → View** and download the MP4. If watching fails after rendering, use the saved URL instead of rendering again.

The month label is not a date filter. Selection uses Featured plus blank Status in source order. There is no ledger beyond Sheet writeback; avoid overlapping runs and never sort/delete rows while execution is in progress. Review the schedule (day 1, 09:00) and workflow timezone before activation. Airtable is an optional read-only branch and never writes compiled status back. Social posting is not included.

[Official listing](https://n8n.io/workflows/20097-compile-monthly-testimonial-videos-from-google-sheets-or-airtable-with-zvid/) · [Full companion guide](../README.md)
