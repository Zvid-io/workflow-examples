# n8n no-show rebooking workflow

Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before creating Zvid credentials. A workspace owner/admin may need to install it. Import `workflow.json` and keep it inactive during setup.

Create a **Zvid API** credential with a key from https://app.zvid.io/api-keys and base URL `https://api.zvid.io`. Select it on **Validate project (free)**, **Save draft to editor**, **Submit render** and **Get render status**.

The synchronized export ships with `source: "sheet"`, `dryRun: false` and `sendEmail: false`. Its normal run renders and spends credits. Set `dryRun: true` before the first setup check. Validation and the editor draft path do not consume render credits.

For Google Sheets, connect **Read no-shows sheet** and **Mark row sent** to the same account, document and tab. Create this header row:

```text
FirstName,Email,EventName,OriginalTime,RebookUrl,Status,VideoUrl
```

`FirstName` and `EventName` are required. Leave `Status` and `VideoUrl` empty for one pending record. Supply an ISO time and an HTTPS booking URL. The first nonempty row with an empty `Status` is selected. Blank rows are skipped; malformed pending rows stop the run.

To reproduce the included example, set the corresponding design fields in **Config** to `../config.json`, while retaining the n8n-only settings. Use Maya / Content planning demo / `2026-10-15T14:00:00Z` / `https://cedarline.example/book` as the row. The domain is fictional. Set `musicUrl` to an empty string. Use `dryRun: true`, then open `editorLink` from **Dry run summary**. A missing link means the draft save needs inspection; a quote alone is not a successful preview.

After reviewing, set `dryRun: false` and execute once. **Submit render** returns a job ID. The workflow waits until completion, optionally emails, marks the row `sent`, and returns **Run summary**. Open **▶ Watch video → Binary → data → View**, or download the binary. A failed watch download does not require another render.

The optional email runs before sheet write-back and has no human approval gate when enabled. Keep `sendEmail: false` for manual review. To enable it deliberately, set `emailFrom`, replace the fictional copy/booking URL, and configure SMTP host, port, transport and authentication on **Send re-book email (SMTP)**. Test with an address you control. `emailSent` and `emailError` report transport results; a `sent` sheet status does not prove delivery.

For webhook mode, set `source: "webhook"` and POST `inviteeFirstName`, `eventName`, optionally `inviteeEmail`, `originalTime`, `rebookUrl`. The workflow does not determine attendance. Its schedule does nothing in webhook mode; manual execution uses `samplePayload`. A repeated POST can create another paid render. The HTTP caller must allow enough time for the job to finish. Configure the Webhook node's authentication before exposing it to your source system.

In sheet mode the schedule checks every 15 minutes and takes one pending row. Do not sort, delete rows, or overlap executions while processing because write-back uses the captured row number. Inspect a saved job ID before retrying uncertain submissions. The download step intentionally uses HTTP Request to fetch the completed MP4; supported Zvid API operations use native Zvid nodes.

Help: https://zvid.io/contact.
