# Event promo and countdown reminder videos

Create an announcement, a seven-day reminder and a final-call video from event records. This Node.js companion reuses the checked-in n8n selection and design code, then validates and renders through the official `@zvid/sdk`.

[View the announcement sample](assets/sample-output.mp4)

![Cedarline Demo Design Night announcement](assets/sample-output.jpg)

The fictional Cedarline event is on 14 November 2026 at 18:30. The supplied configuration rehearses 21 October 2026 and produces the 13.6-second announcement at 1080×1920 without audio. The matching source project is in `assets/sample-project.json`. This sample was quoted at 14 Zvid credits; validate your own inputs before rendering.

## Requirements and setup

- Node.js 22.9 or newer.
- A Zvid API key from https://app.zvid.io/api-keys for validation and rendering.
- Credits for any renders you choose to submit.

Run inside this folder:

```bash
npm ci
npm run check
npm test
npm run offline
```

The offline command writes a selection report and project JSON files to `out/`. It makes no API calls. Copy `.env.example` to `.env` with your file manager and fill `ZVID_API_KEY`; keep `ZVID_API_URL=https://api.zvid.io`. Never commit the key.

```bash
npm run sample
npm start -- --max-credits 14
```

`sample` validates and saves `out/validation.json`, without a render or completion-history write. The normal command renders: `dryRun` is `false` in `config.json`. A positive `--max-credits` is mandatory for a new paid submission and limits the sum of the selected projects' quotes. All selected projects are validated before any render is submitted, then each video finishes and downloads before the next submission.

## Input and milestone behavior

`data/events.json` holds the same column names as the n8n sheet: `EventName`, `DateISO`, `Venue`, `City`, `TicketUrl`, `ImageUrl`, `Status`, `PromoUrl`, `Video7d`, and `Video1d`.

- `EventName` and a real `DateISO` are required. Use `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`, such as `2026-11-14T18:30`.
- Clear output fields for a new event. An empty `Status` makes an announcement eligible; reminders use their own empty URL columns.
- A one-day reminder takes priority, then the seven-day reminder, then the announcement. Only one video per event is selected in a run.
- `todayOverride` is a rehearsal date. For the supplied event, use `2026-10-21`, `2026-11-07`, or `2026-11-13` to select the three different videos. Clear it to use today's date.
- `maxRendersPerRun` defaults to 1 in this companion. The n8n export defaults to 3.
- `timezoneOffsetHours` affects which day counts as today. It does not convert the printed event time and does not follow daylight-saving changes automatically.

The script rejects impossible dates and duplicate name/date rows before API work. These are extra safeguards in this companion. Keep `musicUrl` empty: the companion produces silent output. Add your own music only after implementing and testing the necessary media validation.

## Results, history and recovery

Completed MP4s and `state.json` live under `out/`. State records completed URLs by event name, date and video kind; later runs in the same folder use that history to avoid repeating completed work. The script does not modify your input JSON or write to Google Sheets. Keep the state directory when scheduling repeated runs.

```bash
npm start -- --resume
```

Resume polls accepted job IDs and retries downloads. It does not submit another render. Submission intent is saved before the paid request, and the SDK is configured without automatic retries. An ambiguous submission blocks that event/video until you inspect the Zvid dashboard. Failed jobs and timeouts retain their IDs. Do not delete history as a general retry method.

An explicit HTTP 429 rejection records a retry time. Wait for the reported delay, then rerun the normal command; it validates again before submission. Unknown network failures do not use that retry path. Downloads are checked for an MP4 header and complete declared length, then written atomically so an interrupted download can be retried with `--resume`.

Only one process can use an output folder at a time. If a process is interrupted and leaves `.run.lock`, confirm it has stopped before deleting that lock. A new `--out` folder has no previous completion history and may create duplicates. Changing an event's name or date creates a different identity. Overlapping runs in different folders are not coordinated.

The script checks milestones on the date it runs. It does not catch up a reminder whose exact day has passed. For larger calendars, increase the run cap carefully and check the total quote. There is no built-in scheduler, Google credential, Eventbrite fetch, ticket sale, email or social posting in this companion.

## n8n alternative

Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring credentials. A workspace owner/admin may need to install it. Import `n8n/workflow.json`, keep the workflow inactive and follow [the n8n setup](n8n/README.md).

The n8n export connects Google Sheets or the first 50 live Eventbrite events, can create editor drafts, and writes completed links back to the sheet. The published Zvid node 0.1.8 does not expose project creation, so only **Save draft to editor** uses HTTP Request at `POST /api/projects` with the same Zvid API credential. All supported Zvid rendering and validation operations use the Zvid community node.

## Use the videos

Watch the complete file, check the venue, time and countdown, and upload it manually to your chosen channel. Put a working ticket link in the post, email or profile: the link printed in an MP4 is not clickable. Existing MP4s and already published posts do not update when source facts change.

Support: https://zvid.io/contact
