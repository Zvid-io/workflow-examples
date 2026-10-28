# Shopify product video ad variants

Create square product-first, benefit-first and offer-first video ads from Shopify product photos, descriptions and prices. The Node.js companion runs the planner and template builder embedded in the synchronized n8n workflow, validates each selected concept through the official `@zvid/sdk`, and returns a delivery manifest with video URLs.

This produces reviewable assets. It does not publish advertisements, attach videos to Shopify products, collect performance metrics or send the n8n delivery webhook.

## Requirements

- Node.js 20.12 or newer.
- A Zvid API key from https://app.zvid.io/api-keys for validation and rendering. Rendering requires credits.
- For live product selection: a Shopify Admin API token with `read_products`, and your store's `myshopify.com` prefix.
- Product titles, priced variants and publicly reachable product images.

## Install and check without accounts

Run these commands inside this workflow folder:

On Windows PowerShell, use `npm.cmd` in place of `npm` for commands that forward options after `--`.

```sh
npm ci
npm run check
npm test
npm run offline
```

The offline fixture selects two products and builds four concepts without network calls or render credits. It uses fictional test records and public demonstration photos; the CLI refuses validate/render modes with the `.offline.json` fixture to keep these checks separate from the real sample. Tests cover round-robin allocation, visible angle changes, caps, invalid quotes, credit limits, partial failures, submission uncertainty and resume behavior.

## Configure your store

Copy `.env.example` to `.env` and fill in `ZVID_API_KEY`, `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_ACCESS_TOKEN`. Keep `.env` and `out/` private; they are ignored by Git. Runtime results can contain your store data, job identifiers and output URLs.

For a Shopify app and store in the same organization:

1. Create an app in the Dev Dashboard. Create a version with the `read_products` scope, then release it.
2. Install the app on your store and approve access.
3. Read its Client ID and Client secret from Settings and exchange them at `https://YOUR_STORE.myshopify.com/admin/oauth/access_token` with `grant_type=client_credentials` in a form-encoded POST.
4. Save the returned `access_token` as `SHOPIFY_ADMIN_ACCESS_TOKEN`. The Client ID and secret themselves cannot authorize the product query.

Use Shopify's [Dev Dashboard setup guide](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard) and [client-credentials guide](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant) for the full token request. These tokens expire in about 24 hours; check `expires_in`. The example does not renew them. Use secure renewal before scheduling. Other merchants' stores need an appropriate Shopify installation/authentication flow.

Edit `config.json` for your brand and selection. It overrides the n8n Config defaults with one product, one variant and one ad. Other fields, including `shopifyApiVersion: "2026-07"`, are read from the bundled JSON. Optional CLI controls are `--max-products`, `--variants-per-product`, `--max-total-ads`, `--config`, `--fixture` and `--out`.

## Plan, validate and render

```sh
# Default: read Shopify, build the plan locally and save it.
npm start

# Free: validate every selected concept and sum the current quotes.
npm run validate

# Paid: explicit approval and an estimate ceiling are required.
npm start -- --mode render --confirm-render --max-credits 30
```

`30` is an illustrative user-selected ceiling. Set your own value after reading the quote. This local check compares the sum of `creditsRequired` values with your limit; it is not a server-side spending cap. Missing, invalid or excessive quotes block submission. The SDK's automatic request retries are disabled so an uncertain paid POST is not repeated.

The Node.js default is `--mode plan`. The bundled n8n workflow separately ships `dryRun: true`, saves a first-concept editor preview and requires changing that field to `false` for paid rendering. Node.js validates every concept; n8n validates the first and multiplies its estimate by the planned number. Node.js saves files and does not create an editor draft.

Successful runs write:

- `out/live/result.json`: plan, validations, summed quote, durable submission record and last batch response.
- `out/live/render-payload.json`: template payload and item variables.
- `out/live/delivery-manifest.json`: completed video URLs, product/angle mapping and failures.

Open a successful `videoUrl` in a browser and download the MP4. Save it before its output expiry. The manifest's zeroed performance fields are placeholders, not measured ad results. Preserve each tracking key next to the post/ad ID if you build a separate publishing/reporting integration.

## Real demonstration sample

The included sample uses an Alpine Crest Heavyweight Tee in ivory, $34, a product-first concept and the current square editorial design. `data/sample.json` is a public-safe reconstruction of the demonstrated product, with a neutral description and illustrative website. It does not represent a live customer record. `sample-config.json` supplies the demonstration branding.

```sh
# Local plan from the real sample input; no credentials.
npm run sample

# Free quote; ZVID_API_KEY required, no Shopify token needed.
npm run sample -- --mode validate

# Paid reproduction after reviewing the quote.
npm run sample -- --mode render --confirm-render --max-credits 30
```

[Watch the sample MP4](https://cdn.zvid.io/blog/shopify-product-ad-variants/ef00e17b6f37/sample-output.mp4) · [View its poster](https://cdn.zvid.io/blog/shopify-product-ad-variants/cf29c2b28bb5/sample-output.jpg) · [Source project](https://cdn.zvid.io/blog/shopify-product-ad-variants/703d8ae6dd15/sample-project.json) · [Reproduction metadata](assets/sample-output.json)

The source and metadata identify the actual generation and quote. A re-render can differ as the renderer, fonts or remote assets change; the sample is not a promise of byte-identical output.

## Recovery and duplicate control

```sh
npm start -- --resume
npm start -- --resume --out out/sample
```

Resume polls the previously saved batch and regenerates the manifest without re-reading Shopify, validating or submitting another batch. Poll timeout does not cancel server-side renders. Partial failures preserve successful results and return a nonzero exit status; inspect failures rather than rendering the entire batch again.

Before submission, `result.json` is saved with `state: "submitting"`. If the request outcome is unknown and there is no saved `bulkId`, resume refuses to guess. Inspect https://app.zvid.io and recover the existing work before attempting a new campaign. If the batch ID exists but saving the response failed, dashboard recovery is required.

A `.run.lock` prevents concurrent use of one output directory. After a hard crash, confirm no process is still running before removing a stale lock. Do not delete `result.json`. For a new intentional run, choose a new `--out` directory after reviewing the prior result. Distinct directories do not deduplicate store products automatically.

## Selection and practical limits

- `maxTotalAds` is a global cap. Two products with two angles require a cap of four. Round-robin allocation gives each product one concept before a second round.
- The Shopify query reads one page sorted by recent updates. It does not rank bestsellers, paginate the entire store or remember previous campaigns.
- The square design has fixed positions. Changing its resolution setting alone does not create a finished vertical layout.
- The workflow uses existing photos and text. Offer-first only claims savings when compare-at price is above the current price. Review descriptions and prices before use.
- Validation and editor preview do not spend render credits. The approximately 18.9-second square design is typically quoted at 19 credits; use your actual quote. Batch limits and output availability depend on the connected account. See [credits and limits](https://docs.zvid.io/docs/credits-and-plans/) and [bulk rendering](https://docs.zvid.io/docs/automation/bulk-rendering/).
- The Node.js manifest is a local handoff. The n8n optional delivery branch is documented in [n8n/README.md](n8n/README.md).

## Links

- [Official n8n template](https://n8n.io/workflows/18201-create-shopify-product-video-ads-from-your-catalog-with-zvid-bulk-rendering/)
- [Zvid workflow page](https://zvid.io/n8n/workflows/create-dynamic-shopify-product-ad-variants-zvid)
- [YouTube walkthrough](https://youtu.be/UrOqwvNICXE)
- [Canonical code folder](https://github.com/Zvid-io/workflow-examples/tree/main/workflows/shopify-product-ad-variants)
- Customer help: https://zvid.io/contact
