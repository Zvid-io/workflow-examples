# Run the weekly menu campaign in n8n

1. Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring Zvid credentials. A workspace owner/admin may need to install it.
2. Create an empty workflow, open its menu, choose **Import from File**, and import `workflow.json`. Keep it inactive during setup.
3. Create a key at https://app.zvid.io/api-keys. Create a **Zvid API** credential with that key and Base URL `https://api.zvid.io`. Select it on **Validate campaign design and quote credits**, **Submit the new campaign video to Zvid**, and **Wait for the saved campaign render to complete**.
4. Create one Google spreadsheet with `Menu` and `Menu Campaigns` tabs. Connect a Google Sheets credential with edit access to this document. On n8n Cloud use **Sign in with Google**; self-hosted setups use a Google OAuth web client, Google Sheets and Drive APIs, and the exact redirect URL from n8n. Read https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ for that setup.
5. Select the document and Menu tab in **Read nominated menu dishes**. Select the same document and Menu Campaigns in the history, reservation, accepted-job and outcome nodes. Use exact headers below.
6. In **Set weekly menu campaign rules**, change `dryRun` from its shipped `false` to `true`, set your timezone, reservation URL, branding and source media, and choose `maxDishes: 3` for a small first campaign. The bundled media is illustrative. Use photos of actual dishes for real offers.
7. Run **Test weekly menu planning**. Inspect **Balance available dishes across menu categories**, **Validate campaign design and quote credits**, and **Return campaign plan design and credit quote**. Preview returns JSON and a quote; it creates no editor draft, log entry or MP4.
8. After review, set `dryRun: false`. Run once. The workflow saves `submitting`, submits one paid render and stores its job ID before waiting. The quote must be within `maxCreditsPerVideo`, 30 by default.
9. Open **Watch video → Binary → data → View** and use the download control. Download the file from **Download the weekly posting plan CSV → Binary → data**. Review menu accuracy and caption dates before any manual scheduling.

Menu headers:

```text
DishKey,Dish,Category,Price,PhotoUrl,ThisWeek,InStock,Approval,Description,Priority,AvailableFrom,AvailableUntil
```

Campaign log headers:

```text
CampaignKey,Status,JobId,CreditsQuoted,VideoUrl,Caption,PlanJson,CompletedAt
```

The first eight menu columns are required. Nomination and availability flags are true; Approval is `approved`. Unique keys, a price and real HTTPS dish photos are required. Optional dates must cover the whole campaign week. Blank dates have no restriction. The first sheet read should return your three sample rows; an empty Menu Campaigns tab initially contains only its header row.

Default selection requires 3 dishes and 2 categories, with at most 5. Previous-week completed history rotates equal-priority dishes. Completed campaign keys are skipped; accepted jobs can resume from saved PlanJson. A key in `submitting`, `failed`, `timed_out` or `needs_review` must be inspected in Zvid before deliberate repair. Keep job IDs and original plans. Avoid overlapping executions because Sheets is not an atomic lock.

Set the workflow timezone as well as the configuration timezone before enabling the Monday 09:00 schedule. n8n uses its own schedule timezone. Google External apps in Testing may need reconnection after seven days; arrange durable authorization before unattended scheduling. This workflow never posts to social platforms, updates inventory or confirms reservations. Past caption dates are marked `past_date_do_not_publish`; other drafts say `review_before_scheduling`.

All Zvid API operations use native published Zvid nodes. The HTTP Request node downloads completed media only. Support: https://zvid.io/contact.
