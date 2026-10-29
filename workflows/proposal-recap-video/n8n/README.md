# n8n proposal recap workflow

Import `workflow.json`. It is synchronized with the canonical Zvid integration export and includes no credentials. Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before credential setup; a workspace owner/admin may need to install it.

Create a **Zvid API** credential using https://app.zvid.io/api-keys and the base URL `https://api.zvid.io`. Select it on **Validate project (free)**, **Save draft to editor**, **Submit render** and **Get render status**. Keep the workflow unpublished while configuring it.

## Google Sheets route

Connect a Google Sheets credential on **Read deals sheet** and **Mark deal sent**, with read/write access to the same spreadsheet and tab. Add these exact headers:

```text
DealName,Company,ContactFirstName,Amount,Currency,ScopeLine1,ScopeLine2,ScopeLine3,TimelineWeeks,ValidUntil,Status,VideoUrl
```

Put each header in its own column. The sample values are in `../data/deal.json`. Map `scope[0..2]` to the three ScopeLine columns. Leave Status and VideoUrl empty. In Config use `source: "sheet"`, copy sender settings from `../config.json`, and set `musicUrl` to an empty string to reproduce the silent sample. The imported defaults otherwise use a different fictional deal and sender.

The workflow picks only the first row with an empty Status on each run. `DealName`, `Company` and `Amount` are required. Do not sort or delete rows while a render is running: write-back uses the captured row number. Do not overlap runs against the same queue.

Set **Config → dryRun** to `true`, then **Execute workflow**. Validation and the editor draft do not consume render credits or update the sheet. Open `editorLink` from **Dry run summary** and inspect the draft and quote. Change dryRun to `false` only when ready for a paid render; this is the export's shipped default.

After completion, **Run summary** contains `videoUrl` and `jobId`. Open **▶ Watch video → Binary → data → View**. Download the MP4 or open the link. The matching sheet row gets `Status=sent` and `VideoUrl`; this means prepared, not emailed. Inspect the saved job before rerunning a timed-out or uncertain submission.

## Deal-stage webhook route

Set `source: "webhook"`. Disable **Every 15 minutes** in this route: a scheduled/manual webhook-mode run can use Config.samplePayload. Select **Deal webhook**, choose **Listen for test event**, then POST the fields from `../data/deal.json` as JSON to its Test URL with `Content-Type: application/json`.

Before production use, add Header Auth to the webhook and send the same secret header from your CRM automation. Trigger that automation only for the intended stage transition, and deduplicate repeated events there. The template normalizes common properties/current wrappers but does not subscribe to your CRM or enforce a deal stage itself. Keep the Google Sheets node document/tab selectors configured if n8n preflight requires them even when the sheet path is unused.

When ready, publish the workflow and use the displayed Production URL. The response waits for rendering and can time out at the caller or hosting layer; retain execution/job IDs and retrieve completed output instead of posting the deal again. An empty body can fall back to the configured sample, so validate your CRM mapping before enabling it.

## Scheduling and delivery

The sheet schedule is every 15 minutes. Check the n8n workflow timezone and ensure no overlapping runs. A dry run leaves the first row pending, so disable it before unattended paid operation. Google OAuth is managed by n8n, but revoked or expired grants require reconnection; test-app authorization may not suit ongoing unattended use.

No email, CRM update or Slack delivery is included. Send the reviewed video and a separate clickable booking link through your existing sales process. Keep your full proposal alongside it. The sample quote is 25 credits for 24.8 seconds; validate your own data before rendering.

Support: https://zvid.io/contact
