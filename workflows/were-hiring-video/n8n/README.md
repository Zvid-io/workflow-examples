# n8n hiring campaign workflow

Import [workflow.json](workflow.json). It contains the current recruiter-requested spotlight/roundup workflow, with native Zvid operations. It starts inactive and ships with `dryRun: false`; change that field to `true` before the first setup test.

1. Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring Zvid credentials. A workspace owner/admin may need to install it.
2. Import the JSON with **Import from File**. Create a **Zvid API** credential using a key from https://app.zvid.io/api-keys and Base URL `https://api.zvid.io`. Select it on validation, submission and job-wait nodes.
3. Create a Google Sheet with a jobs catalog and a separate **Hiring Campaigns** tab. Connect the same Google Sheets credential/document on all five sheet nodes. The catalog is read-only; the four history/reservation/update nodes use Hiring Campaigns.
4. In the catalog use `JobKey,Role,Approval,ApplyUrl,Team,Location,SalaryRange,Perk1,Perk2,Perk3,OpensOn,ClosesOn,Priority` as headers. Copy the supplied [jobs CSV](../data/jobs.csv) to try the fictional role.
5. In Hiring Campaigns use `CampaignKey,Status,JobId,CreditsQuoted,VideoUrl,Caption,PlanJson,CompletedAt` as headers. Keep this log separate from job records.
6. Open **Set recruitment campaign defaults**, use the values from the companion's `config.json`, then set `dryRun: true`. Use **Test the configured recruiter brief** as the manual start. Keep the workflow unpublished during setup.
7. Inspect **Return campaign plan design and credit quote**. Check the selected role, tracked application link, quote and caption. A dry run returns data only; it does not create an editor draft, write campaign-log cells or resume a saved paid job.
8. When ready, set `dryRun: false` and run once. Validation enforces `maxCreditsPerVideo` before submission. The workflow reserves the campaign key, records the accepted job ID, waits, then updates the log.
9. Open **Watch video → Binary → data → View** to play or download the MP4. Open **Download the recruiter handoff CSV → Binary → data** for the handoff. Review links and video before sharing manually.

For recruiter requests, open **Receive a recruiter campaign brief**, create an **HTTP Basic Auth** credential with a username/password for authorized recruiters, then use its Test URL while executing the workflow. Keep `dryRun: true` for that test. Only publish the workflow and share its Production URL after checking the manual and protected-form paths. The form acknowledges receipt; the operator finds the output in the execution and campaign log.

Use Google managed OAuth with **Sign in with Google** on n8n Cloud. Self-hosted n8n needs a Google OAuth app with Google Sheets and Drive APIs enabled, the n8n redirect URL, a Web application OAuth client, and the client ID/secret saved in the credential. Authorize the Google account that can edit the sheet. See [n8n's credential instructions](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/).

Run one execution at a time. Google Sheets is not an atomic lock. Completed campaign keys are skipped; rendering keys resume the original saved plan. Inspect `submitting`, `failed`, `timed_out` or `needs_review` before resetting any log row. Never delete a record merely to retry a potentially accepted render.

The workflow has no scheduled trigger, social-publishing branch or applicant evaluation. The current designer ignores inherited `kicker`, `ctaHeadline`, `ctaText`, `resolution` and `frameRate` overrides; change its code only when intentionally revising the design. The sample is a fictional 17-second spotlight quoted at 17 credits. A two-role roundup lasts 20 seconds and can fit the default 20-credit ceiling; larger selections need a higher quote budget.

Support: https://zvid.io/contact
