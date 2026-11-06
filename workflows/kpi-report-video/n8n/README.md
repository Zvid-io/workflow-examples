# Run the KPI briefing in n8n

Import [workflow.json](workflow.json) into an empty n8n workflow and keep the schedule inactive while setting it up. This synchronized export reads a reporting snapshot, calculates exceptions, renders a video and optionally sends its link to Slack. The [actual canvas](../assets/workflow.png) shows the complete workflow.

## Install and connect

1. Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring credentials. A workspace owner or administrator may need to install it.
2. Get an API key at https://app.zvid.io/api-keys. Create a **Zvid API** credential with that key and base URL `https://api.zvid.io`. Select it on **Validate the video and request its credit quote**, **Submit this approved video to Zvid** and **Wait for this accepted Zvid render**.
3. Create a Google spreadsheet with tab **KPI Reports** and these exact column headers:

```text
RenderKey	Status	JobId	CreditsQuoted	PlanJson	VideoUrl	CompletedAt	DeliveryStatus
```

4. Create a **Google Sheets OAuth2 API** credential on **Read KPI Reports recovery log**. On n8n Cloud, sign in with the Google account that can edit the sheet and grant access. For self-hosted n8n, create a Google Cloud project, enable Sheets and Drive APIs, configure the consent screen, and create a Web application OAuth client. Add n8n's displayed redirect URI to that client, then paste its Client ID and Client secret into n8n and sign in. Keep the default Sheets and Drive scopes. See [n8n Google OAuth setup](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/).
5. Select the same credential, spreadsheet and tab on every Google Sheets read/write node. Execute the log-read node once to confirm access. An empty result is normal for a new sheet.

External Google OAuth apps in Testing can lose authorization after seven days. Reconnect as needed and configure the appropriate app publishing status before scheduling. n8n handles refresh when the grant remains valid.

## First check

In **Set reporting period and exception thresholds**, set `metricsSource: "sample"`, `dryRun: true`, `narrate: false`, `sendSlack: false` and `maxCreditsPerVideo: 25`. Execute manually from **Test the kpi report video workflow**.

**Return the source plan design quote and handoff** contains the source, selected metrics, design and quote. It should show three illustrative metrics and two exceptions. With narration off, this path does not consume render credits, write a paid-job reservation, create an editor draft or send a message. The sample dates cover seven completed days ending yesterday. SAMPLE DATA appears in the title, source and review pack; sample Slack delivery is blocked.

The export's original defaults are `metricsSource: "live"`, `dryRun: false`, `narrate: false`, `sendSlack: false` and `maxCreditsPerVideo: 65`. Do not run it unchanged before configuring the intended source and costs.

## Render and save

After reviewing the plan, set `dryRun: false` and execute again. The credit ceiling must pass before submission. Rendering spends credits; the checked-in silent 20.4-second Full HD sample was quoted at 21 credits. Inspect the actual quote for your project.

On completion, open **Prepare the completed result and review pack** for the URL, then **▶ Watch video → Binary → data → View** to play the MP4. Use its binary download control to save it. **Download the source-specific review pack → Binary → data** contains the CSV for all metrics. Save the output before its plan-dependent retention ends.

## Connect a real reporting source

Set `metricsSource: "live"` and `metricsUrl` to an HTTPS endpoint returning HTTP 200 JSON. Add endpoint credentials directly to **Fetch the reporting source snapshot** if needed, not to the URL. Do not put secrets into shared workflow exports.

The JSON needs `company`, `periodStart`, `periodEnd`, `generatedAt` and `metrics`. Use [the sample fixture](../data/sample-metrics.json) as a structural reference, then supply current timestamps and real values and omit its `sampleData` marker. Each metric needs unique `id`, `label`, finite `value` and `previous`, and boolean `lowerIsBetter`. Optional fields are `unit`, `target`, `owner`, `action`, `alertPercent` and `history`. History must contain at least two numerical points and end at `value`.

The period must be complete in the configured timezone. `generatedAt` must be fresh (default at most 36 hours old) and not in the future. Live source errors never fall back to sample data. Percentage change is `(value - previous) / abs(previous) * 100`; zero previous produces N/A. Target misses and adverse changes of at least 10% need attention by default. The video displays up to five prioritized metrics; the CSV includes every metric. `onlyExceptions: true` skips rendering when nothing requires attention.

## Optional Slack delivery

Create a Slack app for your workspace, enable **Incoming Webhooks**, choose **Add New Webhook to Workspace**, select the channel and authorize it. Copy the webhook URL into `slackWebhookUrl`. Keep it private. See [Slack's official instructions](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/).

After checking a live video manually, set `sendSlack: true`. The branch sends the caption and video URL immediately after completion. It has no manual approval pause, does not upload the MP4 and does not attach the CSV. Sample data cannot trigger it. Check the webhook response (`ok` on success) and saved `DeliveryStatus`. Replace a revoked webhook URL; this workflow has no refresh flow for it. A completed report does not resend on rerun.

## Optional narration

Leave `narrate: false` for the documented silent example. To enable narration, configure Header Auth with header name `xi-api-key` and your ElevenLabs API key on **Generate voiceover**, then select the Zvid API credential on **Upload voiceover**. Upload uses HTTP because the published Zvid node does not expose uploads. Speech generation can charge before the Zvid quote, including during a dry run. No OpenRouter account is required.

## Scheduling and recovery

The schedule is Monday at 09:00. Check n8n's workflow timezone and the reporting `timezone`; arrange for a fresh completed snapshot before the trigger. Activate only after a successful live report and any intended delivery.

Run one execution at a time. The Sheets recovery log is not an atomic lock. A reservation is saved before a paid submission, an accepted job ID is saved immediately, and later executions can resume outstanding jobs with their original reporting context. Completed keys are skipped. Keep failed, timed-out or uncertain rows for inspection at https://app.zvid.io; do not clear the log as a retry strategy.

Explicit capacity rejections are retried for up to three submission attempts, waiting at least 30 seconds and respecting a longer Retry-After. An uncertain request is not automatically retried. If acceptance occurred before its ID was saved, reconcile the dashboard before another attempt. A download failure leaves the saved URL available. For an intentional correction of a completed report, inspect its job/delivery and increment `reportRevision`.

Support: https://zvid.io/contact
