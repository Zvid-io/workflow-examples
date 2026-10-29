# Import and run the n8n workflow

1. Install **`@zvid/n8n-nodes-zvid`** in **Settings → Community nodes** before configuring credentials. A workspace owner/admin may need to install it.
2. Import `workflow.json` using the workflow menu's **Import from File**. Keep the workflow inactive.
3. Published package 0.1.8 does not expose **Project → Create**. Delete **Save draft to editor** from your imported copy before executing; keep `dryRun: false`. The retained export preserves the latest canonical source. Validate using **Check validation → Execute step**, which runs only the required preceding nodes and stops before the rendering branch. Do not execute the full workflow for this initial estimate check.
4. Create a **Zvid API** credential using your key from https://app.zvid.io/api-keys and base URL `https://api.zvid.io`. Select it on **Validate project (free)**, **Submit render** and **Get render status**.
5. Give **Transcribe (Scribe)** a Header Auth credential named `xi-api-key` with an ElevenLabs key allowed to use Speech to Text. Give **Pick highlights** an OpenRouter credential.
6. Replace **Sample video** with the public source URL and title in `../data/input.json`. Set **Config** `clipCount` to 1 for the first run. The export otherwise ships with two clips, 28-second targets, `fit` layout and `dryRun: false`.
7. Execute **Check validation** and inspect `creditsRequired` for every clip. Transcription and highlight selection still incur their provider costs. Zvid validation does not consume render credits.
8. Review the selected word range, title and captions. For a visual preview, copy the `payload` from **Build project JSON**, open https://editor.zvid.io, click **Import**, paste it and click **Import project**. Preserve any existing editor work first; import replaces it. Preview the timeline. Saving a draft depends on your project's allowance.
9. With the approved selection and enough credits, execute the workflow manually. Rendering spends Zvid credits for each clip. Preserve job IDs and inspect failures before repeating a submission.
10. Open **▶ Watch video → Binary → data → View**. Download the completed MP4, check the whole clip with sound and publish it manually.

To reuse a reviewed candidate in n8n's manual editor, pin **Transcribe (Scribe)** and **Pick highlights** after inspecting them. Pins are only for manual runs; production webhook executions use fresh data. Do not assume a live webhook reuses your manual selection.

For webhook use, publish/activate the workflow, copy **Video webhook**'s production URL and POST JSON containing `videoUrl`, `title` and optional `layout`. Protect the webhook with suitable authentication before exposing it. The response waits for finished clips; slow renders may outlast an external caller's timeout. Inspect the original n8n execution rather than blindly reposting and creating duplicate charges.

The workflow does not upload to social services. It uses only the transcribed opening, not the entire video. Public source content must remain unchanged through transcription and rendering. See the parent README for costs, limits and recovery. Help: https://zvid.io/contact.
