# n8n welcome video setup

1. Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring Zvid credentials. A workspace owner or administrator may need to install it.
2. Import `workflow.json` and keep the workflow inactive during setup.
3. Create a **Zvid API** credential using a key from https://app.zvid.io/api-keys and Base URL `https://api.zvid.io`. Select it on **Validate project (free)**, **Save draft to editor**, **Submit render** and **Get render status**.
4. To match the included output, paste `../data/signup.json` into **Sample signup** and `../config.json` into **Config**. Set `dryRun` to `true` before the first run. The distributed default is `false`, which renders and spends credits.
5. Execute **Test manually**. Inspect **Check validation** and **Dry-run response**, then open its `editorLink`. Validation and draft preview do not consume render credits. `videoUrl: null` is expected on this route.
6. Once reviewed, set `dryRun` back to `false` and execute once. Read the accepted ID in **Submit render**. Wait for **Render response**, then use **▶ Watch video → Binary → data → View** to play the finished MP4 and download it. The HTTP Request node only downloads the completed media; supported Zvid operations use the official Zvid node.
7. For your application, open **On new signup**, use **Listen for test event**, and POST the signup JSON to the displayed Test URL. Publish/activate only after testing; then use the displayed Production URL. The request waits for the render. A caller timeout does not cancel an accepted job or make automatic retries safe.

`firstName` is required. The template has no authentication on the incoming webhook by default and no signup deduplication. Before exposing it, choose a supported authentication method in the webhook node, configure the caller with matching credentials, and maintain a signup-to-job mapping in your application. Do not call it from browser code containing secrets. Leave the sample's `.example` email addresses in demonstrations only.

Email is optional and disabled with `sendEmail: false`. To use it, create an SMTP credential with your provider's host, port, user and password, configure **Send welcome email (SMTP)**, set a verified `emailFrom` and supply your own test recipient. Use an application-specific password when required by your provider. Change **Email Format** to **Text** and put this expression in the **Text** field's expression mode, replacing the illustrative application URL with your real URL:

```javascript
{{ ['Hi ' + $('Signup data').first().json.firstName + ',', '',
  'Your personal welcome video is ready.',
  $json.videoUrl || 'No finished video is available yet.', '',
  'Open your workspace: https://app.your-product.example'].join('\n') }}
```

This avoids interpreting signup names as HTML and omits the private editor-draft link. After reviewing the message, set `sendEmail: true` with `dryRun: false` and test to your own inbox. Email delivery was not executed for the sample.

The draft save is best-effort in n8n. If its link is missing but rendering completed, retain the MP4 and job ID; do not rerun the entire paid workflow just to obtain a draft. Download outputs before their expiry. Repeated webhook calls and manual runs can create duplicate paid renders. See https://docs.zvid.io/docs/operations/render-lifecycle/ and https://zvid.io/contact.
