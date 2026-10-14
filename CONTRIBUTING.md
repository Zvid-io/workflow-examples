# Adding a workflow example

Add every new example to `workflows/<workflow-slug>/`. Use a stable lowercase slug with hyphens. Keep each example runnable on its own; do not add a separate Git repository or nested `.git` directory.

## Required contents

| Path | Required content |
| --- | --- |
| `README.md` | Business outcome, prerequisites, setup, commands, costs, limitations, troubleshooting, and relevant public links. |
| `src/` | Runnable Node.js implementation. |
| `package.json` and `package-lock.json` | Dependencies, supported Node.js version, and `start`, `check`, and `test` commands. |
| `.env.example` | Configuration names with blank or clearly illustrative values. |
| `data/` | Small, safe inputs with no customer data. |
| `tests/` | Meaningful success, validation, cost-control, and failure behavior checks, as applicable. |
| `n8n/workflow.json` | Synchronized publishable n8n export, using the scoped Zvid community nodes for supported actions. |
| `n8n/README.md` | Installation, credentials, setup and workflow-specific operational limits. |
| `assets/workflow.png` | Screenshot of the actual n8n canvas. |
| `assets/sample-output.mp4` | A real rendered example from the documented input. |
| `assets/sample-output.jpg` | A representative frame from that output. |
| `assets/sample-project.json` | Project used to render the sample. |
| `assets/sample-output.json` | Render date, input, dimensions, duration, quoted credits, reproduction command and file hashes. Omit private URLs and job identifiers. |
| `links.json` | `website`, `n8n`, `code`, and `youtube` URL keys; use `null` for genuinely unpublished destinations. |

For an image-only or other non-video workflow, adapt the output filenames and extend the structure checker deliberately. Do not commit dummy videos to satisfy a check.

## README requirements

Explain what the workflow produces, what it does not automate, and which accounts or credentials are required. Separate local checks from API validation and paid rendering. State the shipped default and document any preview option.

Use `https://api.zvid.io` as the default API origin and direct users to `https://app.zvid.io/api-keys` for keys. Before Zvid credential setup in n8n, instruct users to install `@zvid/n8n-nodes-zvid` from **Settings → Community nodes**; a workspace owner/admin may need to install it.

Show an output preview linked to the real sample file. Explain how to reproduce it and state that costs can vary. Document queue updates, retries, duplicate risks, timeouts, and limitations that apply to the implementation. Include concrete troubleshooting steps and support at https://zvid.io/contact.

## Validation before publishing

1. Synchronize `n8n/workflow.json` with the canonical integration workflow; retain the source digest in the output metadata.
2. Run `npm ci`, `npm run check`, and `npm test` inside the example. Tests must not need live credentials or spend credits.
3. Validate the real project and produce one representative output when authorized. Inspect the media and record the actual validation quote; do not describe it as an audited billing total.
4. Add the screenshot, media, poster, project, and sanitized output metadata. Never include `.env`, private editor links, signed download URLs, account data, or secrets.
5. Run `npm run check:structure` from the repository root and update the workflow table in its README.
6. Verify public links after publication. Use the example's folder URL for code links in launch drafts and tracking records.

Only promote a sample's actual tested behavior. Do not invent throughput, time savings, engagement, revenue, or unimplemented production guarantees.
