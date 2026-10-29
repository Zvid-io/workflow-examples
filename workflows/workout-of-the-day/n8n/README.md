# Standard and scaled workout-of-the-day videos

[Import the workflow](workflow.json).

For gyms and coaches sharing a daily training board. The workflow selects today's approved plan in the configured timezone and builds a standard video plus an optional scaled version from coach-written alternatives. Each has its own exercises, caption, render ID and result columns. Completed versions are skipped independently, so rerunning can finish a missing version without paying for the completed one again.

## Setup

Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring credentials. A workspace owner/admin may need to install it. Create a **Zvid API** credential with a key from https://app.zvid.io/api-keys and Base URL `https://api.zvid.io`, then select it on every Zvid node.

Connect every Google Sheets node to the **same spreadsheet and tab** using a Google Sheets credential with read/write access. Create all listed headers before running. The download step fetches completed media only; supported Zvid operations use the native Zvid node.

In **Set gym branding and workout limits**, set gymName, handle, colors, heroVideo, optional musicUrl, timezone, polling limits and maxCreditsPerVideo. Align the n8n workflow timezone with the configuration. Test manually before enabling the daily 6am schedule. Use source media within your account's limits; bundled hero footage is 1080×1920.

## Sheet columns

| Column | Purpose |
| --- | --- |
| WorkoutKey | Required unique, permanent identifier, such as wod-20261001. |
| Date | Required YYYY-MM-DD; keep one training plan per date. |
| Approval | Set to approved after the coach reviews both supplied versions. |
| WorkoutName, Ex1 | Required title and first standard exercise. |
| Focus, Ex2, Ex3, Ex4, Ex5, CoachNote | Optional standard-plan details. |
| ScaledEx1, ScaledEx2, ScaledEx3, ScaledEx4, ScaledEx5 | Optional coach-authored scaled plan; ScaledEx1 enables the second video. No substitutions or exercise advice are generated. |
| ScaledCoachNote | Optional note for the scaled video; otherwise uses CoachNote. |
| StandardStatus, StandardJobId, StandardCredits | Workflow-maintained standard render state, job ID and quote. |
| StandardVideoUrl, StandardCaption, StandardRenderedAt | Standard video, sharing caption and completion timestamp. |
| ScaledStatus, ScaledJobId, ScaledCredits | Workflow-maintained scaled render state, job ID and quote. |
| ScaledVideoUrl, ScaledCaption, ScaledRenderedAt | Scaled video, sharing caption and completion timestamp. |

Format exercises as **Exercise x Reps**, for example Squat x 5x5. The last spaced x or × separates the name and reps. Leave unused exercise cells blank. Supply the scaled exercises yourself; the workflow does not infer a suitable plan for any person.

If today is missing, the default returns a zero-work report. Optional fallbackToLatest=true picks the latest past date, never a future date, and keeps that original date on the video and in the report. Duplicate dates or keys stop for correction. Unapproved and completed versions are reported as skipped.

At most two videos are selected per run. With maxCreditsPerVideo=20, at most 40 newly quoted credits can be submitted. Each version is validated and rendered sequentially. Quotes are not reported as actual charged credits.

## Upgrade an existing sheet

Preserve Date, WorkoutName and all original exercises. Add WorkoutKey and Approval, optional ScaledEx1–ScaledEx5 and ScaledCoachNote, plus all twelve Standard/Scaled tracking columns listed above. Assign unique keys; let the coach mark reviewed plans approved. If an older workflow produced a video you want to retain, copy its URL to StandardVideoUrl to skip it. Do not change old dates to make sample content appear current.

## Rendering, preview and recovery

- **dryRun=false is the default and spends Zvid credits.** Validation quotes the design before each new render. Set maxCreditsPerVideo (default 20) to your ceiling; a missing, invalid or excessive quote stops before submission.
- **dryRun=true** returns the validated design JSON, caption and credit quote. It submits no render, writes no sheet cells and skips saved jobs. It does not create an editor draft; published package v0.1.8 lacks Project → Create.
- Before submitting, the matching item is marked **submitting**. After acceptance, its job ID is saved with **rendering**. The workflow then polls with a separate deadline per video. A saved job is resumed before new paid work, even if content approval later changes; that recovery only records the already accepted job.
- **completed** stores the video URL, caption and completion timestamp. **failed**, **timed_out** and **needs_review** retain the job ID. These states require inspection and are skipped on reruns. A submission that times out before returning an ID stays **submitting** because it may already have been accepted.
- To resume a confirmed in-progress job, keep its job ID and set its status to **rendering**. To intentionally rerender after inspecting Zvid, clear that item's status, job ID and video URL. Never clear every row as a retry strategy.
- Run one execution at a time. Google Sheets is not an atomic lock: overlapping executions can both read an eligible row. Do not edit an in-flight item's content or key. An accepted request followed by a failed sheet write needs manual reconciliation at https://app.zvid.io.
- Open **Watch video → Binary → data → View** to review a completed MP4; select the output item for a batch. Downloads use a 30-second timeout and at most three attempts. A failed preview download preserves the saved video URL.
- Social posting is not included. Review factual copy, media and captions before sharing.

## Verification

The exported workflow graph is exercised with service stubs covering normal rendering, saved-job recovery, preview-only runs, credit limits, failed outcomes and repeated runs. No paid rendering or social posting is required for those checks. Earlier render examples do not prove newly added orchestration; use the test report supplied with this revision for its actual validation evidence.

For help: https://zvid.io/contact

## Canvas organization (2026-10-02)
The main stages now follow one continuous left-to-right path. Standard/scaled writes stay beside their decision, resume paths run above the main nodes, and the completed-item batch return runs below the stages. Note 3 is the batch entry; its done output produces the summary. The Watch section sits beside the final result. This revision changes positions and section notes only; functional node settings, credentials, names, IDs and connections are preserved.
