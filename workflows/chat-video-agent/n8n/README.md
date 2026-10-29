# n8n chat video agent

Install **`@zvid/n8n-nodes-zvid`** from **Settings → Community nodes** before configuring Zvid credentials. A workspace owner/admin may need to install it. Import `workflow.json` into an inactive workflow.

1. Create a Zvid API key at https://app.zvid.io/api-keys.
2. Attach a **Zvid API** credential with that key and base URL `https://api.zvid.io` to **Read saved render for preview** and **Wait for the newly accepted chat video**.
3. On **Zvid MCP tools**, create a **Header Auth** credential with Name `x-api-key` and Value equal to the Zvid key. Preserve the Creator endpoint and `maxRenderCredits` query expression. MCP is used for conversational drafting and signed-quote rendering, operations not exposed by the action node.
4. Create an OpenRouter API key at https://openrouter.ai/settings/keys and attach an **OpenRouter API** credential to **Chat model (OpenRouter)**. Model usage is billed separately.
5. Keep `allowSameMessageApproval: false`, `maxRenderCredits: 25` and `manualPreviewJobId: ""`. The shipped model is `openai/gpt-4.1`. The manual **Test brief** asks for a fictional FocusFlow teaser without approval. Execute **Test manually** and inspect **Chat reply** for a draft and quote. A draft is not a rendered video.
6. For Telegram, create a bot with `/newbot` in the verified `@BotFather` chat. Attach the resulting **Telegram API** credential to **On Telegram message**, **Send reply** and **Send video**. n8n needs a public HTTPS webhook address. Activate the workflow when ready to receive messages.
7. Send a message to the bot. Its private-bot reply includes your chat ID. Add that ID to `Config.allowedChatIds`, save and send the brief again. Empty `allowedChatIds` refuses all Telegram chats before the model is called.
8. Review the draft in the editor and its quoted credits. Reply with approval in a later message. The native node waits for the exact accepted job for up to ten minutes. Only a confirmed completed MP4 from the permitted video path reaches **Send video** or **▶ Watch video**.
9. In a manual execution, open **▶ Watch video → Binary → data → View**. If it is skipped, inspect **Chat reply → watchReason**. Save the finished MP4 before its output-expiry date.

There is no `dryRun` switch. Draft/quote and approved render are distinct conversation turns. Approval is instructed in the model prompt; it is not an independent hard lock. The server enforces a signed quote and per-render ceiling, not a daily or conversation budget.

Use `manualPreviewJobId` only to replay an existing completed job without model calls or a new render. Clear it for a new brief. Replaying a video does not create a new video for the current text. On timeouts, request the saved job's status rather than sending the original creation request again. Do not enable automatic whole-agent retries.

The workflow sends text and completed video in the allowed Telegram chat. It does not upload to YouTube or other social networks. Telegram supports one active webhook per bot; a different workflow claiming the same token can stop delivery here.

The bundled canvas screenshot is from the 8 October 2026 verification session. The current JSON is the source of truth for node names and defaults.
