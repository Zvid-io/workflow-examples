# n8n workflow

`workflow.json` is an unchanged copy of `zvid-integrations/n8n/workflows/zvid-shopify-dynamic-product-ad-factory.json`, retained with the Node.js companion so both use the same planner and template builder.

1. In n8n, install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring Zvid credentials. A workspace owner/admin may need to install it.
2. Import `workflow.json` and keep the schedule inactive.
3. Create a Zvid API credential using a key from https://app.zvid.io/api-keys. Keep base URL `https://api.zvid.io`. Assign it to **Validate project (free)**, **Save draft to editor**, **Submit bulk render** and **Get batch status**.
4. Follow the [Shopify token setup](../README.md#configure-your-store). Use a Header Auth credential named `X-Shopify-Access-Token` on **Get Shopify catalog**. This workflow needs `read_products`.
5. Set `shopDomain` to the store prefix only, and adjust brand fields. Start with `maxProducts: 1`, `variantsPerProduct: 1` and `maxTotalAds: 1`.
6. Keep the shipped `dryRun: true`. Execute manually, review the quote, warnings and `editorLink` in **Dry run summary**. The editor draft is not a rendered MP4.
7. Change `dryRun` to `false` only when ready to spend render credits. Watch the finished media in **▶ Watch video** and retain the bulk ID and manifest.
8. Leave `deliveryWebhookUrl` empty for review. An optional HTTPS endpoint can receive the manifest through **Send to asset store or scheduler**; configure authentication there. This handoff does not itself create an ad campaign.

The default selection is three eligible products, up to three angles per product, capped at five ads globally. Products are sorted by recent updates. Selection is one Shopify page, not sales ranking or a whole-store scan. The square design is approximately 18.9 seconds and silent when music is empty.

The n8n free validation covers the first concept and estimates the batch by multiplication. The Node.js companion validates each concept separately. Polling timeout does not cancel rendering. Before another run, check the accepted `bulkId` at https://app.zvid.io to avoid a duplicate paid batch.

Shopify client-credentials tokens expire in about 24 hours and this workflow does not renew them. Handle renewal, timezone and repeated-product behavior before activating the Monday 9am schedule. Repeated executions can create the same concepts again. Use a campaign history or selection tag if your automation should process each product only once.

The Shopify GraphQL query and optional external delivery use standard HTTP Request nodes. Supported Zvid operations use the published Zvid community node. The final HTTP download reads completed video media for playback.

See [the full workflow page](https://zvid.io/n8n/workflows/create-dynamic-shopify-product-ad-variants-zvid) and [recorded walkthrough](https://youtu.be/UrOqwvNICXE). The recording shows an earlier revision; follow the synchronized JSON for current node types and settings.
