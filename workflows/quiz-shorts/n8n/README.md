# n8n quiz episode setup

1. Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes**. A workspace owner/admin may need to install it. Do this before credentials.
2. Import `workflow.json` and keep its schedule inactive.
3. Create a **Zvid API** credential with your key from https://app.zvid.io/api-keys and base URL `https://api.zvid.io`. Select it on **Validate the video and request its credit quote**, **Submit this approved video to Zvid** and **Wait for this accepted Zvid render**.
4. Import `../data/questions.csv` into a Google Sheet tab named **Questions**. Create another tab called **Quiz Episodes** using `../data/quiz-episodes.csv`. Do not put source questions in the recovery tab.
5. Connect Google Sheets OAuth credentials to every Google Sheets node. n8n Cloud supports **Sign in with Google**; self-hosted n8n needs a Google OAuth app. Follow https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ if you host n8n yourself. Your Google account must have edit access to the spreadsheet.
6. Point **Read the approved question bank** to **Questions**. Point all recovery reads/writes to the same spreadsheet and **Quiz Episodes**. Keep these exact log headers: `RenderKey,Status,JobId,CreditsQuoted,PlanJson,VideoUrl,CompletedAt`.
7. In **Set quiz episode and rotation rules**, first change `dryRun` from its shipped `false` to `true`, keep `musicUrl` empty, and choose your timezone. Execute manually. The source plan, nine-scene project and quote should appear at **Return the source plan design quote and handoff**. No log rows or editor drafts are created in this mode.
8. Review all source facts and the quote. Set `dryRun: false` and a suitable `maxCreditsPerVideo` before the paid run. One new render is submitted per execution.
9. After completion, open **▶ Watch video → Binary → data → View**. Download the CSV from **Download the source-specific review pack → Binary → data**. Check both before sharing.

This workflow requires one unused approved question at each difficulty. It does not generate questions, fact-check source URLs or publish to social channels. Run one execution at a time. Sheets history prevents ordinary sequential duplicates but is not an atomic concurrency lock. Keep all history during upgrades.

The shipped schedule is daily at 09:00. Set the workflow's scheduling timezone and the configuration `timezone` consistently before enabling it. Configure credential renewal before unattended operation: custom Google OAuth apps left in external Testing may require reauthorization after seven days. Do not rely on that testing setup for a long-running schedule.

Saved `rendering` jobs resume before selecting new content. Completed keys are skipped. Inspect `submitting`, `needs_review`, `failed` and `timed_out` rows in Zvid before any manual reset. A 429 capacity rejection accepts no job and uses a bounded retry; an uncertain request is not automatically resubmitted. A failed Watch download leaves `VideoUrl` in the log.

Support: https://zvid.io/contact
