# Shopify abandoned checkout videos

Turn one eligible Shopify abandoned checkout into a personalized vertical video with Zvid. The design shows the shopper's first name, up to three products and the cart total. An optional, separately confirmed SMTP action sends a checkout link and a link to the finished MP4. It does not attach media to Shopify products, create discounts, buy ads or measure recovered revenue.

The CLI uses the same video builder as the synchronized n8n workflow. Its local wait deadlines and reviewed delivery commands deliberately differ from n8n's automatic wait and email branches.

## Example output

The supplied fictional checkout is Alex's Clay Pocket Oversized Tee, variant M, quantity 1 and total $35. The design is 1080 x 1920, 13.8 seconds, 30 fps, with no audio by default. See `assets/sample-output.json` for the sample's provenance, credit quote, hashes and reproduction details. The API returns a new quote for each validation.

[![Watch the sample video](https://cdn.zvid.io/blog/shopify-abandoned-checkout-videos/886cc47abf1e/sample-output.jpg)](https://cdn.zvid.io/blog/shopify-abandoned-checkout-videos/0d7b70c44144/sample-output.mp4)

## Requirements

- Node.js 20.12 or newer and npm.
- A Zvid key from https://app.zvid.io/api-keys for API validation, editor drafts and rendering. Offline checks need no credentials.
- Live Shopify: an installed app with `read_orders`, `read_customers` and `read_products`; an installing user with **Manage abandoned checkouts**; access to required protected customer fields.
- Optional email: a verified sender, SMTP account, and a recipient/message you have reviewed and are authorized to contact.

## Install and check locally

On Windows PowerShell, use `npm.cmd` in place of `npm` for commands that forward options after `--`.

```sh
npm ci
npm run check
npm test
npm run offline
```

These commands do not call Shopify, render video or send email. `out/sample/project.json` is a local project; `out/sample/result.json` records an offline run. All `out/` files are private and ignored by Git. Do not publish live checkout inputs, recovery links, email HTML, state files or access tokens.

Copy `.env.example` to `.env` and set `ZVID_API_KEY`. Keep `.env` private. For an editor preview:

```sh
npm run dry-run
```

This calls validation and creates an editor draft without consuming render credits. Open `editorLink` in `out/preview/result.json`. Repeat a preview with `npm start -- --resume --dry-run --out out/preview`. A new output folder is required for a genuinely new run.

## Render the fictional sample

```sh
npm run sample -- --max-credits 20
```

`dryRun` defaults to `false`, but the CLI requires an explicit positive `--max-credits` before submission. Twenty credits is a ceiling, not a promised charge. A higher quote stops before rendering. Polling waits up to `timeoutMinutes` and saves the accepted `jobId` before it starts. Watch and download `videoUrl` from `out/sample-render/result.json`.

```sh
npm start -- --resume --out out/sample-render
```

Resume polls the saved job. It never resubmits an accepted render. An uncertain submission without a job ID stays blocked: inspect the Zvid dashboard before manually recovering it. Do not choose a new output directory merely to bypass that state. Fixture runs can never send email, even if SMTP is configured.

## Shopify setup

1. In Shopify's Dev Dashboard, create an app, configure the three scopes above, release its version and install it on the target store. Approve changed scopes after updating an existing app.
2. Copy the canonical `*.myshopify.com` domain from Shopify Admin **Settings > Domains**. Set `SHOPIFY_SHOP_DOMAIN` to just the subdomain, without the suffix or a URL path. The Admin URL's store handle may differ.
3. Obtain an Admin API access token using the flow appropriate to your app. For an app and store in the same Shopify organization, exchange the app's Client ID and Client secret through the [client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant). They are credentials used to request a token, not the token itself.
4. Put the returned `access_token` in `SHOPIFY_ACCESS_TOKEN`. This example uses API version `2026-07`. Check the returned scopes and `expires_in`.

Client-credentials tokens expire after 24 hours. This CLI does not refresh them. Renew the token before an expired read, a saved wait resumes, or an optional follow-up; a scheduler does not solve expiry. Other Shopify authentication flows have different lifetimes. See [app setup](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard) and [protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data).

## Select, preview and render one live checkout

Review `config.json` before using real customer data. The first page contains at most `scanLimit` candidates, default 20 and maximum 50; it does not paginate all checkouts. The script chooses one unhandled, open checkout with an email, recovery URL and product line. It saves a deadline 60 minutes ahead, then exits.

```sh
npm start -- --dry-run
```

After `checkAt` in `out/live/result.json`:

```sh
npm start -- --resume --dry-run
```

The fresh Shopify check stops if there is a completed order, draft order, unavailable inventory, newer significant abandonment, or a Shopify recovery email when that guard is enabled. If eligible, open the saved editor link and review the quote. To render the same saved checkout after approval:

```sh
npm start -- --resume --max-credits 20
```

The script rechecks eligibility before submitting, then writes the video URL and two private HTML previews (`initial-email.html` and `follow-up-email.html`). Rendering alone sends nothing. The video excludes email, phone and recovery URL, but still contains a first name and product details on a shareable media URL. Decide whether that is appropriate for the store before using real input.

## Optional reviewed SMTP delivery

Use SMTP credentials from your email provider. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and one verified `SMTP_FROM` address. Port 465 uses immediate TLS; 587 requires STARTTLS. This example retains TLS certificate validation. See [Nodemailer SMTP](https://nodemailer.com/smtp).

Review the exact saved checkout, recipient, video and local HTML. Privately set `CONFIRM_RECIPIENT` to that checkout email in `.env` or your environment; do not paste customer addresses into shared terminal logs. Then explicitly send the existing live result:

```sh
npm start -- --resume --deliver initial
```

Before SMTP, the CLI reads current Shopify eligibility and verifies that the current checkout customer email still matches your confirmation. It saves an `attempting` record before sending and records `sent` only after the SMTP server accepts that recipient. Server acceptance does not guarantee inbox delivery.

There is no background follow-up service. After the configured 720-minute delay from the initial send, review the message again and explicitly run:

```sh
npm start -- --resume --deliver follow-up
```

It requires a confirmed initial send, checks the elapsed delay and rechecks Shopify. Conversion or changed eligibility stops the message. Neither command renders again. The code does not implement consent collection, unsubscribe management, bounce handling, quiet hours or cross-tool campaign deduplication; integrate those controls before production outreach.

An interrupted or failed SMTP call is recorded as `uncertain`. The CLI blocks another attempt for that phase. Inspect your SMTP provider's message logs and the private state file before manual reconciliation. It deliberately does not retry an ambiguous send or equate an error with proof that nothing was delivered.

## Duplicate handling and operations

- Keep the same `--ledger out/checkout-ledger.json` for every run against a store. A process lock serializes local invocations using that ledger. A newly selected checkout is reserved immediately; it stays reserved after previews, failures and completion. Use `--resume` to continue it.
- New checkout runs need new `--out` folders while retaining the same ledger. Deleting the ledger or using a different copy allows repeat selection. This local file is not a multi-machine database or atomic distributed lock.
- Waits persist as timestamps rather than keeping Node running. A scheduler may invoke the appropriate saved run after the deadline. No automatic scan loop or follow-up scheduler is included.
- A crashed process can leave the ledger `.lock` file. Confirm no process is using that ledger before removing the stale lock. Review state before releasing any selected-checkout entry.
- Rendering failures and ambiguous acceptance require inspection. Timeouts do not cancel an accepted Zvid job. Keep output folders to resume it.
- Prices and images are captured at selection time. Eligibility is rechecked, but the video is not rebuilt from an updated cart and previously rendered files are not replaced automatically. Review stale prices before delivery.
- The CLI derives its displayed currency symbol from Shopify's returned currency code and rejects live input with no usable code. The n8n template instead uses its configured `currencySymbol`; set that manually for the store.
- One to three products appear. The first query reads at most five lines and the design uses three. The full cart total can therefore include products not shown. Product quantities and variant labels are not displayed in the current video design.

## n8n alternative

The synchronized file is `n8n/workflow.json`. Install **`@zvid/n8n-nodes-zvid`** from **Settings > Community nodes** before configuring Zvid credentials; a workspace owner/admin may need to install it. The [n8n setup guide](n8n/README.md) explains credentials, true shipped defaults, email limitations and the recorded walkthrough.

## Troubleshooting

- **Shopify 401:** check the returned token, its expiry and the canonical domain. Client ID/secret are not Admin API tokens.
- **Missing customer data:** check scopes, staff permission and protected-data access. An empty candidate page is a normal no-op, not proof that the entire store has no abandoned checkouts.
- **No render submitted:** inspect the quote and credit ceiling. Validation and editor drafts do not consume render credits; rendering does.
- **Waiting:** resume after the saved `checkAt`, using a current Shopify token.
- **Delivery blocked:** inspect fixture status, recipient confirmation, fresh eligibility, wait time and the saved delivery attempt. Do not clear a record to blindly resend.

For help, visit https://zvid.io/contact.
