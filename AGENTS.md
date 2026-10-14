# Workflow example repository instructions

All new Node.js workflow examples belong in this repository under `workflows/<workflow-slug>/`. Follow CONTRIBUTING.md and the root README layout. Never create a new repository for each workflow.

- Keep the root README about the overall repository: purpose, general setup, layout, workflow catalog, checks, and contributions. Individual workflows may appear in the catalog; their tutorials, preview images, videos, and specific run instructions belong only in their own folders.

- Preserve each example's independent package.json and package-lock.json. Keep tests under `tests/`, the synchronized export at `n8n/workflow.json`, and screenshots/rendered examples under `assets/`.
- Include a real example output, poster, source project and sanitized reproduction metadata. Do not substitute mock bytes or generated diagrams for actual media or canvas screenshots.
- Never commit credentials, `.env`, dependencies, scratch outputs, private media URLs, or customer inputs. `.env.example` must contain only empty or illustrative configuration.
- Use the official `@zvid/sdk` for Node.js and the exact scoped package `@zvid/n8n-nodes-zvid` for n8n. Supported Zvid n8n actions must use its published nodes. Keep setup and rendering costs visible.
- Do not name stock vendors in customer-facing prose; call it Zvid's stock library.
- Maintain `links.json` and update launch drafts/tracking when the canonical example URL changes. Unpublished URLs are null, never guessed.
- Run structural checks and the affected example's checks/tests. CI must never perform paid renders.
- Commit prefixes: `📦 NEW:`, `👌 IMPROVE:`, `🐛 FIX:`, `♻️ REFACTOR:`, `📖 DOC:`, `🤖 TEST:`, `‼️ BREAKING:`.

Use the canonical Zvid URLs: https://zvid.io, https://app.zvid.io, https://app.zvid.io/api-keys, https://editor.zvid.io, https://api.zvid.io, https://docs.zvid.io, and https://zvid.io/contact.
