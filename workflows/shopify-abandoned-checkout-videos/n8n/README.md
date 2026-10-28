# n8n: Shopify abandoned checkout recovery

This export is synchronized byte for byte with `zvid-integrations/n8n/workflows/zvid-shopify-abandoned-checkout-recovery.json`. Import it into an inactive workflow. Install **`@zvid/n8n-nodes-zvid`** from **Settings > Community nodes** first; an owner/admin may need to install it.

Create a Zvid API credential using https://app.zvid.io/api-keys and Base URL `https://api.zvid.io`. Assign it to **Validate project (free)**, **Save draft to editor**, **Submit render** and **Get render status**.

Shopify needs `read_orders`, `read_customers`, `read_products`, the installing user's **Manage abandoned checkouts** permission and access to the requested customer fields. Set `Config.shopDomain` to the canonical Shopify subdomain. Create Header Auth with name `X-Shopify-Access-Token` and the returned Admin API token; use it on **Find open abandoned checkouts**, **Confirm no purchase and inventory**, and **Confirm before follow-up**. Shopify HTTP nodes are necessary because the built-in Shopify node does not expose all required abandonment fields. Supported Zvid actions use the native Zvid community node.

For an own-organization app, follow [Shopify's token guide](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant). A Client ID or secret is not an access token. This flow's token expires after 24 hours, and the workflow does not renew it. Address renewal before scheduling or long waits.

The actual defaults are `manualFixture:true`, `dryRun:false`, `sendEmail:false`. For the first check, set `dryRun:true`, keep `sendEmail:false`, and retain `testFixtureRecoveredBeforeFollowUp:true`. This validates the example and creates an editor draft without render credits. A later run with `dryRun:false` spends credits. The fake fixture contact is not a test inbox: never enable its SMTP branch without replacing it with a private address you control.

The fixture is Alex's Clay Pocket Oversized Tee, size M, quantity 1, total $35. It uses two-second waits and simulates conversion before follow-up. Live mode selects one checkout from the first page, waits 60 minutes, checks eligibility, renders, and optionally sends the initial email. A second wait is 720 minutes by default. SMTP credentials belong on **Send initial recovery email** and **Send follow-up recovery email**; set `emailFrom` to a verified sender.

The template has no per-recipient approval or consent check. `sendEmail:true` sends to the selected checkout's customer email. Its follow-up branch does not require proof that the initial email succeeded. It remembers up to 500 live checkout IDs even when sending is disabled or fails. n8n static data only persists after successful triggered executions and is not reliable as a distributed lock; manual tests do not establish duplicate protection. Inspect results and existing campaigns before activation.

Watch completed output in **▶ Watch video > Binary > data > View**, or open `videoUrl`. The watch node is downstream of follow-up; with live follow-up enabled, the final summary can wait 12 hours. To review promptly with no emails, set `followUpEnabled:false`, or read the completed URL from **Prepare private recovery delivery**. A full rerun may render again; first inspect the saved job in Zvid after any timeout.

- [Official n8n listing](https://n8n.io/workflows/18345-recover-abandoned-shopify-checkouts-with-personalized-zvid-product-video-emails/)
- [Zvid workflow page](https://zvid.io/n8n/workflows/shopify-abandoned-checkout-recovery)
- [Recorded walkthrough](https://youtu.be/HnY4vv_QTS8)

The historical recording can differ from the current node layout and defaults. Follow the maintained JSON and this guide. No new live render or email is needed for the repository's offline tests. For help: https://zvid.io/contact.
