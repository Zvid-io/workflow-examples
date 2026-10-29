# n8n setup

1. From **Settings → Community nodes**, install **`@zvid/n8n-nodes-zvid`**. A workspace owner/admin may need to install it.
2. Import `workflow.json` using **Import from File**. Keep it unpublished/inactive during setup.
3. Create a key at https://app.zvid.io/api-keys. Create a **Zvid API** credential with that full key and Base URL `https://api.zvid.io`; select it on every Zvid node.
4. Open **Config**. The export ships with `dryRun: false`: execution renders and spends credits. Change it to `true` before your setup check. Keep `sendEmail: false`.
5. Leave `metricsUrl` empty to use the fictional bundled July sample. Execute the manual trigger. **Dry run summary** contains the quote and, when draft creation succeeds, an `editorLink` for preview.
6. To reproduce the retained September output, copy the branding, timings and silent media settings from `../config.json`. Use a reporting endpoint returning `../data/metrics.json`. Alternatively, replace the `DEMO` object in **Normalize metrics** with that file's JSON and leave `metricsUrl` empty. Keep the rest of the code unchanged.
7. After reviewing the preview, set `dryRun: false` and run once. Preserve the accepted job ID. Open **Run summary** then **▶ Watch video → Binary → data → View** and download the completed MP4.

The workflow handles one customer per run. Array responses use the first entry, not every customer. Reporting authentication belongs in an n8n credential on **Fetch metrics**. Send explicit `monthLabel` and prepared comparisons; the workflow does not calculate metrics or deltas.

For optional email, configure SMTP on **Email the video**, set `emailFrom`, `emailTo`, `emailSubject`, and enable `sendEmail` only for an intended run. There is no approval pause before sending. The recipient is independent of the metrics record; match it carefully. Email is best-effort and a green workflow alone does not prove delivery. Do not rerun a paid render merely to send an existing video.

The monthly trigger runs on the 1st at 09:00 in the workflow's configured timezone. Check reporting readiness, credentials, recipients and duplicate prevention before activation. No built-in customer/month deduplication ledger is supplied.

Validation and draft creation do not spend render credits. The retained 16.35-second sample received a 17-credit quote. Check the current quote after any timing or resolution change. The Node.js companion uses explicit `--render` and a credit ceiling; n8n retains `dryRun: false` by default.

For support: https://zvid.io/contact.
