# Plan outdoor bookings around weather and generate a call-sheet video

For small production teams coordinating outdoor sessions. Read approved booking requests and confirmed reservations, then assign non-overlapping daytime slots around rain, wind and temperature limits. Higher priorities go first; each request keeps its preferred time, moves, or is deferred. Produce a call-sheet video, decision CSV and tentative calendar file. Proposals do not book a calendar or invite attendees.

## Prerequisites
Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring credentials. A workspace owner/admin may need to install it. Select a Zvid API credential on every native Zvid node, using https://app.zvid.io/api-keys and Base URL https://api.zvid.io. Connect Google Sheets OAuth2 and select the input and log tabs in all Sheets nodes. No supported Zvid operation uses HTTP Request. Watch downloads completed media only.

## Booking desk
Use one location and timezone per workflow. Set cityName, countryCode, admin1, timezone and planningDate (blank means today in that timezone). The resolved city's timezone must match. Requests must be within the forecast horizon supported by Open-Meteo.

Create **Outdoor Bookings** with headers:

`BookingId,Date,Title,Status,Approval,EarliestStart,LatestEnd,PreferredStart,DurationMinutes,Priority,Start,End`

- BookingId must be unique and stable. Date is YYYY-MM-DD. Title is 1–80 characters.
- Requested rows use Status=requested and Approval=approved. Approval is coordinator-authored, never generated automatically.
- EarliestStart, LatestEnd and optional PreferredStart use ISO timestamps with UTC offsets, for example 2026-10-09T09:00:00+01:00. Both window endpoints must stay within Date in the configured timezone. DurationMinutes is 30–240 in half-hour increments. Priority is 1–10; higher goes first.
- Confirmed reservations use Status=confirmed with Start and End timestamps. They block scheduling regardless of Approval. Include every conflicting reservation for the planning date. The workflow does not read an external calendar: this sheet is the booking desk.
- Maximum five approved requests per date. Times use half-hour candidate starts. The planner chooses the qualifying slot nearest the preferred start, then lowest rain/wind and earliest time. Earlier high-priority proposals block later ones. This deterministic greedy strategy is not a global optimum.
- Every occupied hour must have forecast coverage, daylight, acceptable temperature, rain and wind, and no excluded severe weather code. Missing numeric data fails; no matching slot returns defer with reasons. It is planning guidance, not an official warning.

## Outputs and confirmation
The call-sheet video distinguishes keep, reschedule and defer for each booking. The CSV contains exact UTC start/end times, forecast values and blocking reasons. The ICS download contains only proposed slots with STATUS:TENTATIVE, transparent availability, no attendees and no invitation sends. Import only after coordinator review. Mark confirmed reservations in the booking desk yourself; a completed render is not a confirmed booking.

Render keys use calendarLabel, planning date and forecastRevision. Changing requests or thresholds after a completed run requires deliberately increasing forecastRevision; keep the original log. Preview returns the calendar and CSV without rendering.

Source: [Open-Meteo forecast documentation](https://open-meteo.com/en/docs). Unix timestamps avoid ambiguous repeated local hours during daylight-saving changes.

## Costs and recovery
**dryRun=false is the default**; eligible new work spends Zvid credits after validation and maxCreditsPerVideo enforcement. Validation does not consume render credits. The configured ceiling is 35 credits. **dryRun=true** performs reads, planning and validation only; it writes no source or tracking cells, starts no render and resumes no paid job. Requests still need Status=requested and Approval=approved to reach planning. No editor project is created.

Use the separate **Weather Briefings** tab with headers:

`RenderKey,Status,JobId,CreditsQuoted,PlanJson,VideoUrl,CompletedAt`

Before a paid call, the workflow reserves a submitting record and a compact snapshot. It persists the accepted JobId; recovery polls it before source checks. Explicit 429 rejections are retried up to three attempts with a 30-second minimum and server Retry-After. Uncertain submissions are never retried automatically. Failed, timed-out and uncertain records need inspection; do not delete rows as a general retry strategy.

Open **Watch video → Binary → data → View** on completion. The download has a 30-second timeout and three attempts; its failure does not erase the saved video URL. CSV formula-like values are escaped. Optional music is checked before use and skipped if unavailable.

## Migration from the previous day 27 template
Retain the same local workflow, credentials and full recovery history. Add the new input tab; do not turn old results into approved source records. Keep schedules disabled until the new inputs are configured. Old accepted jobs still resume from their saved context. The old generic forecast and outlook have been replaced by the booking call sheet.

## Weather-provider access

The public Open-Meteo endpoints used here support permitted non-commercial evaluation. Before using this in a commercial booking service, obtain suitable access and configure the customer forecast endpoint and API key. Keep weather-source attribution when sharing results. Check [Open-Meteo terms](https://open-meteo.com/en/terms) and [customer endpoint instructions](https://open-meteo.com/en/pricing).

Support: https://zvid.io/contact
