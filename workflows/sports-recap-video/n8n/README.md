# n8n setup

Install **@zvid/n8n-nodes-zvid** from **Settings → Community nodes** before configuring Zvid credentials. A workspace owner/admin may need to install it. Import workflow.json and keep the schedule inactive.

Create a Zvid API credential using https://app.zvid.io/api-keys and Base URL https://api.zvid.io. Select it on validation, submission and wait nodes. Connect Google Sheets OAuth2.

Create **Match Editorial Queue** with headers:

```text
EventId,Enabled,Approval,ApprovedSnapshot,CurrentSnapshot,ReviewStatus,LastCheckedAt,PriorVideoUrl,ChangeSummary
```

Create **Sports Recaps** with headers:

```text
RenderKey,Status,JobId,CreditsQuoted,PlanJson,VideoUrl,CompletedAt
```

Choose the same spreadsheet in all seven Sheets nodes. Queue read/update nodes use the first tab; recovery read/reserve/rejection/acceptance/outcome nodes use the second. Set suitable TheSportsDB access, expected league ID (or an empty string), and one real numeric EventId with Enabled=yes. Do not use the fictional Node.js fixture ID for a live lookup.

**dryRun=false ships by default**, so exactly approved work can render and spend credits. Start with dryRun=true for read-only inspection. It writes no spreadsheet rows, starts no renders, resumes no paid jobs and creates no editor draft. Unapproved work stops before validation.

With approval cells blank, dryRun=false writes current review facts without rendering that unapproved event. Review CurrentSnapshot, set Approval=approved and copy the exact value into ApprovedSnapshot. Switch to dryRun=true for the approved design/quote, then false only after review to render. Changed facts invalidate approval.

The per-video ceiling is 35 credits. Preserve recovery rows and accepted IDs. Use one execution at a time: Sheets is not an atomic lock. Inspect failed and uncertain submissions before resetting anything.

On completion open **▶ Watch video → Binary → data → View**, download the MP4 and CSV review pack, and publish through your normal process. No social posting/retraction is automated. The Monday 08:00 schedule uses the workflow timezone; verify it and credential renewal before activation.

Support: https://zvid.io/contact
