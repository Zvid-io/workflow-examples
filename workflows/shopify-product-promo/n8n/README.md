# Import the product promo workflow

Install **`@zvid/n8n-nodes-zvid`** in **Settings → Community nodes** before creating Zvid credentials. A workspace owner/admin may need to install it. Import `workflow.json` from file and keep the schedule unpublished/inactive during setup.

1. Open Config and change shipped `dryRun: false` to `true` for the first check. The false setting renders and spends credits.
2. Create a Zvid API credential using a key from https://app.zvid.io/api-keys and base URL https://api.zvid.io. Select it on validation, editor-draft, submit and status nodes.
3. Connect a Google Sheets OAuth2 API credential to both Read products sheet and Mark row done. Use the same spreadsheet and tab. Create columns Title, Price, CompareAtPrice, ImageUrl1, ImageUrl2, Tagline, Status, VideoUrl. Use the sample in `../data/product.json`, excluding its local `row_number` field. Leave Status and VideoUrl empty.
4. Retain `row_number` matching in Mark row done. Do not sort/delete rows during execution. The first pending row must have Title and ImageUrl1; any nonempty Status is skipped.
5. Execute, inspect Dry run summary, its current quote and editorLink. Review all three scenes. A failed editor save can leave no link even when validation succeeds.
6. Change dryRun to false only after reviewing. The paid branch automatically submits after validation, without a credit ceiling. Retain the execution's job ID. On success inspect the original row's done status and VideoUrl. Open **▶ Watch video → Binary → data → View**, then download the accepted MP4.

The default mode is Google Sheets. Optional Shopify mode requires an installed app with read_products and a valid Header Auth credential, named X-Shopify-Access-Token. Set source to shopify, shopDomain to the subdomain and apiVersion to a supported release such as 2026-10; the canonical export retains its older 2024-07 value, which must be changed. See the parent README's current token setup and expiration guidance.

Shopify reads the newest product on a 30-minute default schedule; it is not an instant creation trigger. It seeds a marker on the first production-triggered run, considers only the latest created record, misses intermediate additions, and does not filter active or published state. Manual test runs do not persist n8n static data. Shopify mode does not update Sheets. Fixed-token credentials do not renew themselves, so token renewal is required for unattended operation.

The sample design is 14.3 seconds at 1080 × 1920. Historical validation quoted 15 credits; validate the current payload before rendering. The summary's creditsCharged field repeats the quote, not an audited transaction. Preview does not render. Music can be omitted when unreachable or oversized. No step uploads to Shopify or social channels.

Avoid overlapping runs, retry existing accepted jobs after a timeout, and download videos before their outputExpiresAt. This workflow has no cross-system duplicate protection. Publish/activate the schedule only after one full manual sheet run and after checking the appropriate production marker/token behavior for Shopify.

Help: https://zvid.io/contact
