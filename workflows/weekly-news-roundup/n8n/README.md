# n8n setup

1. Before configuring Zvid credentials, install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes**. A workspace owner/admin may need to install it.
2. Import `workflow.json`, save it and keep it unpublished while configuring it.
3. Create a key at https://app.zvid.io/api-keys and select a **Zvid API** credential on all Zvid nodes. Keep the API origin `https://api.zvid.io`. On **Upload voiceover**, select the same predefined Zvid credential.
4. Create an OpenRouter credential for **Curate top five**. Create an HTTP Header Auth credential for **Generate voiceover** with name `xi-api-key` and your ElevenLabs key as its value.
5. In **Config**, choose public `feedUrls`, `niche`, brand settings and a `voiceId` your ElevenLabs account can access. Test Config and feed collection first.

The download defaults to **`dryRun: false`**, so a complete run renders and spends Zvid credits. Set it to `true` for initial full-path testing. Script generation and narration happen before that branch and can still incur OpenRouter and ElevenLabs charges. Validation itself is free.

Inspect **Parse rundown** and original sources, then **Dry run summary** for the quote and saved editor link. Render an exact reviewed draft in the editor. A full n8n rerun with `dryRun: false` generates the script and speech again and may choose different stories.

The workflow uses native Zvid nodes for all supported operations. **Upload voiceover** uses HTTP Request because the published node does not expose multipart uploads. Never place keys in Config or exported JSON.

When rendering completes, open **▶ Watch video → Binary → data → View** to play and download the MP4. Keep the accepted job ID. A timeout after twenty minutes does not cancel a job; inspect it at https://app.zvid.io before submitting again. Polling defaults to ten seconds. The workflow does not impose a configurable quote ceiling.

Set the weekly time in **Every Friday at 4pm** and the intended **Settings → Timezone** before publishing. There is no cross-edition story ledger, editorial approval pause or social publishing branch. API keys do not refresh automatically. The pool caps at 40 candidates and retains undated entries; review your feeds and service quotas regularly.

![The actual workflow canvas](https://cdn.zvid.io/blog/weekly-news-roundup-video/0cb8091aec23/workflow.png)

[Watch the dedicated walkthrough](https://www.youtube.com/watch?v=8p54PdNd1ok). It follows an October edition with a 57-credit quote, distinct from the retained September sample in this folder. For help, visit https://zvid.io/contact.
