# Weather-based outdoor booking video

Turn an approved outdoor booking brief into a vertical call-sheet video, a decision CSV and a tentative calendar file. This is the current revision of `daily-weather-video`: it schedules requests around weather and existing reservations. It does not make calendar bookings, send invitations, post social videos or replace official weather warnings.

The included illustrative Lisbon fixture produces three decisions: keep Team portraits at 09:00, move Product shoot to 11:00 around a confirmed interview, and defer Outdoor reel because its only hour has 80% rain probability. The 23-second sample uses fictional bookings and fixture weather, not a forecast for use in the real world.

[Watch the sample](assets/sample-output.mp4) · [Poster](assets/sample-output.jpg) · [n8n workflow](n8n/workflow.json)

## Setup

Use Node.js 20.12 or newer. In this folder run:

```sh
npm ci
npm run check
npm test
npm run sample
```

`sample` is offline and creates `out/sample/project.json`, `plan.json`, `decisions.csv`, `tentative-outdoor-bookings.ics` and `result.json`. It uses the fixture's fixed clock so its old date remains reproducible. It does not call weather or Zvid services or produce an MP4.

Copy `.env.example` to `.env` and set `ZVID_API_KEY` to the complete key from https://app.zvid.io/api-keys. The SDK uses https://api.zvid.io. Never commit `.env`.

```sh
npm run preview
npm start -- --render --max-credits 35
```

Preview validates and quotes the fixture through the Zvid API without render credits. Rendering explicitly submits it and spends credits. The checked sample was quoted at 23 credits; your current quote can differ. The smaller of `--max-credits` and `config.json`'s `maxCreditsPerVideo` is enforced before submission. Review the sample project before rendering. `dryRun:false` in the synchronized n8n export is preserved; this Node.js CLI requires `--render` separately.

## Use current weather and bookings

1. Copy `data/sample.json` to `data/bookings.json`. Keep the `bookings` array and replace all fictional rows with your approved requests and confirmed reservations. The fixture `forecast`, `place` and `generatedAt` are ignored with `--live`.
2. Set `cityName`, `countryCode`, `admin1`, `timezone` and `planningDate` in `config.json`. Use a current/future date within the provider's forecast horizon. A blank date means today in that timezone. Every requested window must stay on its `Date` in that timezone and include explicit UTC offsets. Include confirmed reservations that could conflict.
3. Check rain, wind and temperature thresholds. Up to five approved requests are supported. Durations are 30 to 240 minutes in 30-minute increments. Priority is 1 to 10; higher priorities are planned first. Candidate starts are half-hour boundaries. A date in the past, missing hourly values or mismatched place timezone fails.
4. Run validation first, then render only after reviewing the CSV, ICS, project and quote:

```sh
npm start -- --live --input data/bookings.json --out out/live --dry-run
npm start -- --live --input data/bookings.json --out out/live --render --max-credits 35
```

Each new `--live` run fetches current Open-Meteo data, so review its newly written artifacts and quote. The public endpoints used here are for permitted non-commercial evaluation. For commercial use, obtain suitable Open-Meteo access and adapt the forecast endpoint/authentication to your account before scheduling; this companion does not configure a commercial subscription. See [Open-Meteo terms](https://open-meteo.com/en/terms) and [customer endpoint details](https://open-meteo.com/en/pricing). Retain source attribution when sharing weather-derived results.

## Recovery and output

The runner writes `submission-pending` before submission and saves the accepted job ID immediately afterward. SDK submission retries are disabled, including for explicit rate-limit responses; the n8n workflow has its own bounded retry branch. Reusing a folder with a pending, submitted or completed attempt is rejected unless `--resume` is used. To poll an accepted job without fetching weather or submitting another render:

```sh
npm start -- --resume --out out/live
```

If `result.json` has no job ID after a submission error, inspect the Zvid dashboard before another paid attempt. Do not delete the file as a general retry strategy. A local `.run.lock` blocks two processes in the same output folder. Different folders are not a shared duplicate lock; choose one stable folder per run and do not run overlapping jobs. A stale lock after a crash needs human inspection before removal.

The completed `result.json` contains `videoUrl` and any returned expiry. Open that URL and save the MP4 to durable storage. The runner does not download the MP4 automatically. CSV and calendar files are local. Calendar entries are `STATUS:TENTATIVE`, `TRANSP:TRANSPARENT`, with no attendees. Review and confirm proposals manually. This local-file route does not read Google Sheets, update its recovery log, upload to calendars or send messages. No music is used; a nonempty `musicUrl` is rejected.

## n8n setup

Install **`@zvid/n8n-nodes-zvid`** through **Settings → Community nodes** before credentials; a workspace owner/admin may need to install it. Import `n8n/workflow.json`, keep the schedule inactive and set `dryRun:true` in **Set the location date and booking thresholds** for setup. The export ships with `dryRun:false`.

Create a Zvid API credential using the full key and Base URL `https://api.zvid.io`, then select it on every Zvid node. Connect Google Sheets OAuth2, select an input tab named **Outdoor Bookings** and a separate **Weather Briefings** recovery tab. Follow [n8n/README.md](n8n/README.md) for exact headers, field rules and recovery behavior. The source uses native Zvid validation, submission and waiting nodes. HTTP nodes fetch weather/music or completed media.

## Limits

The priority-first greedy planner is deterministic, not a global optimum. Forecasts change, and the workflow checks configured thresholds rather than all production risks. Missing or severe conditions can defer all requests. Keep one execution at a time. In n8n, changing a completed plan deliberately requires a new `forecastRevision`; preserve the earlier log. Neither route automatically refreshes or retracts a shared video.

Tests cover scheduling/conflicts, weather/data failures, authorization-by-input, tentative ICS output, validation-only behavior, credit ceilings, uncertain submissions and resume. Tests use mock API responses and spend no credits. The recorded sample's exact reproduction and validation evidence are in `assets/sample-output.json`.

Support: https://zvid.io/contact
