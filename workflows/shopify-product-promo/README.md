# Shopify product promo

Turn one approved product into a 14.3-second vertical promo with a photo, supplied price, optional savings badge and store call to action. Start with the fictional local input, then optionally read the newest Shopify product. This companion does not write Google Sheets, save editor drafts, attach Shopify media, post to social networks or renew Shopify tokens.

[Watch the sample](https://cdn.zvid.io/blog/shopify-product-promo/ab4081fb3ecb/sample-output.mp4)

![Demo Lip Color Kit promo](https://cdn.zvid.io/blog/shopify-product-promo/f8e33c1f2dc0/sample-output.jpg)

The included input is a fictional Demo Lip Color Kit priced at $29 with a $39 compare-at price. The output metadata distinguishes the new silent local render from the original tutorial's API render. No new paid API render was submitted when this companion was prepared. The historical API run received a 15-credit quote; always validate your own project for current pricing.

## Prerequisites

- Node.js 20.12 or newer, npm and access to the public image URL.
- A Zvid account and API key from https://app.zvid.io/api-keys for validation/rendering. The client uses https://api.zvid.io.
- For Shopify: a store you may access, an installed app with `read_products`, and a current Admin API access token. Only read access is used.

## Install and check locally

Open a terminal in this folder after extracting the example ZIP:

```sh
npm ci
npm run check
npm test
npm run offline
```

These checks require no credentials and spend no credits. Offline mode writes `out/sample/project.json` and `out/sample/result.json`. It does not fetch images or validate with the server. The implementation executes only the checked-in, reviewed mapper and builder from `n8n/workflow.json` so both routes use the same design.

Copy `.env.example` to `.env`. Fill `ZVID_API_KEY` privately and keep that file out of version control. Review `config.json`: replace the illustrative NORTHBOUND branding and storefront before commercial use. `musicUrl` is empty for a silent sample; supply a public audio file you may use if wanted. Any failed or oversized soundtrack check omits music.

## Validate, then render one product

```sh
npm run dry-run
npm run sample -- --max-credits 20
```

`dry-run` validates the project and records a quote without submitting a render. `config.json` ships with `dryRun: false`, but every paid submission also requires an explicit positive `--max-credits` ceiling. A quote above the ceiling stops before submission. Validation itself uses no render credits; it does not reserve credits or guarantee a later render's price. n8n hosting and other services have their own charges.

Open `out/sample/result.json` for the state, quote, accepted job ID and, after success, `videoUrl`. Play the whole video, compare its photo, price and link text with the input, and download it before `outputExpiresAt`. Upload an approved result to Shopify/social channels manually. A button or link drawn in the MP4 is not clickable.

For your own product, copy `data/product.json`, edit its fields and leave Status empty:

```sh
npm start -- --input data/my-product.json --dry-run --out out/my-product
npm start -- --input data/my-product.json --max-credits 20 --out out/my-product
```

The local input can be one row or an array. Required fields are `Title` and `ImageUrl1`; `Price`, `CompareAtPrice`, `ImageUrl2`, and `Tagline` are optional. A nonempty `Status` skips a row. The mapper chooses the first pending row and stops if that row is incomplete. Local input is not changed after success, so treat the saved result as your completion record and do not resubmit it casually. Prices and offers must be accurate; the workflow does not check inventory or currency conversion.

## Optional Shopify poll

Set `SHOPIFY_SHOP_DOMAIN` to the store subdomain, for example `my-store`, and put its access token in `SHOPIFY_ACCESS_TOKEN`. Keep both private. `config.json` uses API version `2026-10`.

For an app and store in your own Shopify organization, create an app in the Dev Dashboard, release a version with `read_products`, install it on the store, and exchange its client credentials for a token. Shopify's [Dev Dashboard instructions](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard) and [client-credentials grant instructions](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant) describe the current flow. That grant is restricted to your own organization and its tokens expire after about 24 hours; check `expires_in`. Other merchants require their appropriate Shopify authorization flow. This example uses a fixed token and does not refresh it.

```sh
npm start -- --shopify --dry-run --out out/shopify
npm start -- --shopify --max-credits 20 --out out/shopify
```

The first non-preview run seeds `out/shopify/shopify-marker.json` and renders nothing. A later invocation with the same folder renders only if the newest created product ID changes. Dry runs do not persist the initial seed. This is a one-shot poll, not a daemon; schedule it only after you have handled token renewal and safe single-run execution.

The request uses Shopify's legacy REST Product endpoint, asks for five products ordered by creation time, and considers only the first. It does not filter active/published records or process all unseen products. Multiple additions between polls can be missed. Existing product edits do not trigger rendering. New public Shopify apps must use GraphQL. A comprehensive production queue needs a different integration design; see the [REST Product documentation](https://shopify.dev/docs/api/admin-rest/latest/resources/product).

After a completed Shopify run, archive its `result.json` to a unique local name while retaining `shopify-marker.json` in the same output directory. Review and download the result before doing so. The next poll can then use that directory and its marker. Do not replace the directory with a fresh one unless you intend to reset the starting marker. Each CLI process creates an exclusive lock in its output directory, but other directories, n8n and other machines do not share that lock or marker. Let one system own the production queue.

## Recover without duplicate submissions

The runner records `submission-pending` before the request and persists the job ID before waiting. It does not blindly retry a render request. If a wait is interrupted:

```sh
npm start -- --resume --out out/sample
```

Use the original output folder. Resume only waits for its saved job; it never submits another one. The default wait limit is 20 minutes, polling every 10 seconds. A timeout does not cancel rendering. If the result is `submission-pending` with no job ID, inspect https://app.zvid.io before making another attempt: the server may have accepted it even if the response was lost. An existing paid attempt blocks new submission into the same output folder. Download failure is not a reason to render again.

If a process was force-killed and left `.run.lock`, first establish that no process is using that output folder, inspect the saved result, and then remove only that stale lock. Do not clear an active lock. Failed validation and dry runs can be corrected and repeated without a paid submission.

## n8n alternative and sample provenance

See [n8n/README.md](n8n/README.md) for importing the synchronized workflow. It differs from this CLI: n8n can read/write Google Sheets, save an editor draft and run on its own schedule; the CLI adds a mandatory explicit paid-credit ceiling and durable local receipts. The n8n version has no automatic credit ceiling.

`assets/sample-project.json` is the exact project for the included local silent sample. `assets/sample-output.json` records hashes, input, dimensions, duration and the historical quote evidence. Reproduction through the API uses the sample commands above and spends credits when rendering. `npm run offline` rebuilds the source without rendering. Layout can vary with renderer/font versions. The historical documentary screenshot is from a successful n8n execution of the same product design, with optional music.

Public code: https://github.com/Zvid-io/workflow-examples/tree/main/workflows/shopify-product-promo

General walkthrough: https://www.youtube.com/watch?v=i22Yzjlq9Tg

## Troubleshooting

| Symptom | Next action |
| --- | --- |
| Empty result | Clear Status only for a deliberately pending local input, or check whether Shopify has a newer product. |
| Missing Title/ImageUrl1 | Fix the first pending row before later rows can be selected. |
| Validation fails | Inspect errors; check the image URL, text and configuration before rendering. |
| Shopify 401/403 | Renew the token if expired; verify app installation and `read_products`. |
| Shopify 404 | Check the subdomain and API version. |
| No sound | The sample is silent; configured music may also fail the reachability/size check. |
| Cost ceiling exceeded | Review the quote and design. Increase the ceiling only deliberately. |
| Wait timeout | Inspect the accepted job and resume its existing output folder. |

For help, visit https://zvid.io/contact.
