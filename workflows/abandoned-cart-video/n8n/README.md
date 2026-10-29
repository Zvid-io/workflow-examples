# Run the cart workflow in n8n

1. Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring credentials. A workspace owner/admin may need to install it.
2. Import `workflow.json` and keep it inactive during setup.
3. Create a **Zvid API** credential with a key from https://app.zvid.io/api-keys and Base URL `https://api.zvid.io`. Select it on **Validate project (free)**, **Save draft to editor**, **Submit render** and **Get render status**.
4. Create a Google Sheet using `data/cart-example.csv` in the parent folder. Connect **Read carts sheet** and **Mark cart recovered** to the same document/tab with a Google Sheets OAuth2 credential.
5. In **Config**, retain `source: "sheet"` and `sendEmail: false`. The shipped `dryRun: false` renders and spends credits. Set `dryRun: true` for your first test.
6. Execute **Test manually**. Read **Dry run summary** and review its estimate and `editorLink`. No sheet update or email occurs in this mode. If draft saving fails, resolve **Save draft to editor** before rendering.
7. Set `dryRun: false` to render. **Run summary** returns the job ID and video URL; **Mark cart recovered** writes `done` and `VideoUrl`. Open **▶ Watch video**, then Binary → View to play the result. Download or save its URL.

The first eligible row is processed, not an entire batch. Blank and completed rows are skipped. Do not sort/delete rows during execution. Avoid overlapping runs because the template does not atomically claim rows. Keep completed status values; clearing one can cause a new paid render.

Optional SMTP delivery requires a credential on **Send recovery email**, `emailFrom`, a valid `Email` cell and `sendEmail: true`. Review privately before enabling this automatic branch. A mail error can leave the row marked done; inspect `emailSent` and retry delivery using the existing video. The checkout link belongs in the email, not inside a clickable MP4.

The retained legacy Shopify REST branch has `apiVersion: "2024-07"`; this companion documents only the Sheets route. Use https://zvid.io/blog/tutorials/shopify-abandoned-checkout-videos for the separate maintained Shopify workflow.

The native Zvid nodes handle all supported Zvid API operations. HTTP Request nodes remain for third-party reads, optional music availability checks and downloading the completed MP4. Do not replace the supported native Zvid operations with generic HTTP nodes.

Google External OAuth apps in Testing expire after seven days; reconnect or complete the appropriate app setup before relying on scheduled runs. Configure the workflow timezone before enabling **Every hour**. A `done` row indicates video processing, not a confirmed recovered sale.

Validation does not consume render credits; the illustrated 13.8-second output was quoted at 14 credits. Always check the current quote. Preserve accepted job IDs, retry status/download steps without submitting another render, and save outputs before plan retention expires. Help: https://zvid.io/contact.
