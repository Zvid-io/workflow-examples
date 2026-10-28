# Import the blog-to-video workflow

1. Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring Zvid credentials. A workspace owner/admin may need to install it.
2. Import `workflow.json` with **Import from File** and keep it inactive.
3. Create a **Zvid API** credential using a key from https://app.zvid.io/api-keys and base URL `https://api.zvid.io`. Select it on the Zvid search, validation, draft, submit and status nodes. Use it on **Upload voiceover** too.
4. Create an OpenRouter credential and select it on **Write script**. In **Generate voiceover**, select a Header Auth credential with Name `xi-api-key` and Value set to your ElevenLabs API key with Text to Speech access.
5. Set `feedUrl`, `brandName` and branding in **Config**. Inspect **Read blog feed → Pick newest post → Prepare prompt** before a full execution.
6. Change `dryRun` from its shipped **false** to **true** for a preview. Open `editorLink` from **Dry run summary** and read `creditsRequired`. OpenRouter and ElevenLabs can still charge during this run.
7. Set `dryRun: false` to render. A new full execution regenerates the script and narration, so check the new result. Save **Submit render**'s `jobId` and inspect a timed-out job before retrying.
8. After completion, open **▶ Watch video → Binary → data → View** and download the MP4. Publishing is manual.

Multipart audio upload uses HTTP Request because the published Zvid node does not expose it. Supported Zvid operations use native Zvid nodes.

Only the newest post is selected; this is not an every-post queue. Manual tests can repeat the same post. The last completed GUID persists through successful production executions, and an unchanged GUID does not trigger an updated video for an edited article. Set the workflow timezone and daily trigger time before activating. Keep the schedule inactive until credentials, usage budgets and review procedures work.

The canvas screenshot and [YouTube walkthrough](https://youtu.be/xqjp_Af-Hf8) show the same workflow with the earlier stock-footage example. The Node.js sample is the current text-slide version using retained narration.

Support: https://zvid.io/contact
