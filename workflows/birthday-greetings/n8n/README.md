# n8n setup

1. In n8n, install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes**. A workspace owner/admin may need to install it. Then import `workflow.json` from the workflow menu's **Import from File** action. Keep the schedule inactive during setup.
2. Create a **Zvid API** credential using a key from https://app.zvid.io/api-keys and Base URL `https://api.zvid.io`. Choose it on **Validate the video and request its credit quote**, **Submit this approved video to Zvid** and **Wait for this accepted Zvid render**.
3. Connect Google Sheets. Choose your curated source tab on **Read consented celebration dates**. Its required headers are `CelebrationKey,Name,Type,Date,Approval,GreetingConsent`; optional headers are `DoNotContact,Email,EmailApproval,ShowAge,Message,LastSentYear`.
4. Create a separate **Celebration Runs** tab with `RenderKey,Status,JobId,CreditsQuoted,PlanJson,VideoUrl,CompletedAt,DeliveryStatus`. Select it on every recovery-log read/write node, with the same document and Google credential.
5. In **Set celebration consent and delivery rules**, set `dryRun: true`, keep `sendEmail: false`, configure `timezone` and branding, and leave `replayRenderKey` empty. Use one approved, consented fictional contact due on the test date. `manualDemo: true` is an alternative fictional demo that never sends email; disable it for real queue processing.
6. Execute manually. Open **Return the source plan design quote and handoff** and inspect the selected data, payload and credit quote. This preview creates no editor draft, render, log row or email. Set `dryRun: false` only when ready to spend credits. The shipped default is false; the default credit ceiling is 15.
7. After rendering, open **▶ Watch video → Binary → data → View**. Download the MP4 and the source-specific review CSV. Preserve the completed log and accepted IDs. Resume unfinished jobs before new work; inspect uncertain submissions in Zvid rather than deleting log history.

Birthday age requires explicit `ShowAge`; anniversaries count completed years. Each occasion needs its own permanent key. Run one execution at a time because Google Sheets is not an atomic lock. The default trigger checks hourly 08:00–18:00; match the workflow timezone to `timezone` and inspect deferred work.

Optional email needs `sendEmail: true`, SMTP credentials, a sender you control in `emailFrom`, a valid `Email` and `EmailApproval: approved`. Recovered jobs require manual email review. Test with delivery disabled. For help, visit https://zvid.io/contact.
