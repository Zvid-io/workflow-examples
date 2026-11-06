# Set up the property listing workflow

Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring credentials. A workspace owner/admin may need to install it. Import `workflow.json` into an empty workflow and leave the schedule inactive during setup.

1. Create a key at https://app.zvid.io/api-keys. Create a **Zvid API** credential using the complete key and Base URL `https://api.zvid.io`.
2. Select it on **Validate project (free)**, **Submit render**, **Get render status**, and **Save draft to editor**. The last step uses HTTP Request with **Predefined Credential Type → Zvid API**. Published `@zvid/n8n-nodes-zvid` 0.1.8 does not expose Project Create, so this one step calls `POST /api/projects` with `{name,payload}`. All supported Zvid operations use native nodes.
3. Import `../data/listings.csv` into a Google Sheet. Keep the exact `Status` and `VideoUrl` headers and leave those cells empty. Connect **Read listings sheet** and **Mark listing done** to that same spreadsheet and tab using a Google Sheets OAuth2 credential.
4. On n8n Cloud, choose **Sign in with Google** in the Google credential and authorize the account that can edit the sheet. Self-hosted n8n requires a Google Cloud project, enabled Sheets and Drive APIs, an OAuth consent screen, a Web application OAuth client with the exact n8n redirect URL, and its Client ID/Client Secret in n8n. Then sign in. See [n8n's complete Google setup](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/). External apps left in Testing require reauthorization after seven days.
5. In **Config**, set `dryRun: true` for the first run and `source: "sheet"`. Copy the sample branding settings from `../config.json` if reproducing the exact output. The maintained default is `dryRun: false`, which spends render credits. Music is off by default; supply an authorized direct audio URL only if you want a soundtrack.
6. Execute the workflow. **Dry run summary** contains the quote, listing facts, resolved payload and optional `editorLink`. A null link means draft creation failed: inspect that node. An account project limit can block saving without invalidating the quote. A quote is not an MP4 or proof of a saved draft.
7. When the input, design and current quote are acceptable, set `dryRun: false` and execute once. Preserve the accepted `jobId` from **Submit render**. After completion, open **▶ Watch video → Binary → data → View**, or open and download the `videoUrl` in **Run summary**.
8. Confirm the original sheet row has `Status=done` and `VideoUrl`. Do not sort or delete rows while an execution is in progress: write-back uses the captured `row_number`.

The sample uses two photos and was historically quoted at 13 credits for 12.5 seconds. Four photos produce 19.1 seconds; five produce 22.4 seconds. Current validation supplies the account-specific quote. `creditsCharged` in the n8n summary is the validation quote under a legacy field name, not an independent billing audit.

If a job times out, inspect it in https://app.zvid.io before starting another execution. A render can finish even when the n8n execution stopped. Failed write-back also leaves the row pending and can cause a duplicate next time; recover the completed result before running again.

## Optional Airtable source

Create fields with the same names. In Airtable's Developer Hub, create a personal access token with `data.records:read` and access to the required base. Set `source: "airtable"`, `airtableBaseId`, `airtableTable`, and an optional `airtableView`. Put the token in a **Bearer Auth** credential on **Fetch Airtable listings**. [Airtable's token guide](https://support.airtable.com/docs/creating-personal-access-tokens) explains scopes and regeneration. Update n8n if the token is regenerated, revoked or limited by an organization policy.

Airtable mode reads up to 50 records and does not paginate or write back. After success it remembers up to 200 record IDs in n8n workflow static data. Static data persists for successful published trigger/webhook executions, not manual tests. A previously seen listing can become eligible again when it falls out of that bounded memory. Keep the source view focused on the intended queue and add durable history before relying on it for larger unattended workloads.

## Schedule and delivery

After testing, choose the intended workflow timezone, review **Every day at 9am**, then save and publish/activate the workflow. One listing is selected per execution. Avoid overlapping runs; Sheets rows are not atomically locked. n8n's Google OAuth credential handles token refresh while the authorization remains valid, but revocation or a Testing-mode expiry still requires reconnection.

The supplied workflow ends with a reviewable video and, in Sheet mode, its source-row link. It does not post to social platforms or send to an agent. Review the property facts, media, agent identity and final file before handing it off. An MP4 does not update itself when the listing changes.

Support: https://zvid.io/contact.
