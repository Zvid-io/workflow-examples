# Run the flash-sale n8n workflow

1. In **Settings → Community nodes**, install **`@zvid/n8n-nodes-zvid`**. A workspace owner/admin may need to install it.
2. Create a workflow and choose **Import from File** in its menu. Select `workflow.json`. Leave its schedule inactive.
3. Create a **Zvid API** credential with a key from https://app.zvid.io/api-keys and Base URL `https://api.zvid.io`. Select it on **Validate project (free)**, **Save draft to editor**, **Submit render** and **Get render status**.
4. Create a Google Sheet with headers `Product`, `OldPrice`, `NewPrice`, `ImageUrl`, `EndsAt`, `Status`, `VideoUrl`, `BannerUrl`. Copy the sample values from `../data/sale.json`; leave the final three values empty.
5. Connect a Google Sheets OAuth2 credential to **Read sale sheet** and **Mark sale done**. Choose the same spreadsheet and tab in both. Keep the update match on `row_number`.
6. Open **Config**. Keep `source: sheet`, clear optional email recipients, and set `dryRun: true` for the first check. The shipped value is `false`, which renders and spends credits. The supplied default music is empty.
7. Choose **Test manually** and **Execute workflow**. In **Dry run summary**, inspect both items, `creditsRequired`, `creditsForBothDeliverables`, and each `editorLink`. Open the links to review drafts. A failed draft save may leave an empty link; validation alone is not an editor preview.
8. When both designs look right, set `dryRun: false` and execute again. The workflow renders the video then the banner. The included sample was quoted at 14 + 1 = 15 credits; your current quote is authoritative.
9. Check **Run summary**, then open **▶ Watch video → Binary → data → View** and **▶ View banner → Binary → data → View**. Download the files. Confirm `done`, `VideoUrl` and `BannerUrl` were saved to the selected row.

Keep completed Status markers to prevent repeated selection. A partial failure leaves the row pending; inspect saved jobs before rerunning the full workflow to avoid recreating a successful asset. Preview download failure does not undo an already completed render.

For automatic execution, check **Every hour**, set the workflow timezone, and publish/activate only after a small run works. Each run takes one pending offer. Prevent overlapping executions against the same sheet because a row is marked done only after rendering finishes. `EndsAt` is display text, not an expiry filter.

The optional email branch sends the banner through SMTP when `emailTo` is set. Leave it empty unless delivery is intended. A successful render is not proof of email delivery; inspect the email node separately.

The included Shopify polling branch is a legacy alternative. It requests one page of 50 products using a retired API version, compares prices with saved workflow state and picks one qualifying drop. It needs a maintained API/authentication adaptation before unattended use. This example's documented working route uses Google Sheets; it does not promise complete live Shopify catalog monitoring.

Help: https://zvid.io/contact
