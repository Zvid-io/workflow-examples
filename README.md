# Zvid workflow examples

An open collection of runnable video automation workflows built with [Zvid](https://zvid.io). Use it to explore use cases, run a Node.js implementation, or adapt an accompanying n8n template to your own process.

Each workflow is self-contained. Its folder contains the implementation, setup guide, example inputs, tests, and real rendered output. New workflows are added to this shared repository as the collection grows.

## What each workflow includes

- A README explaining the outcome, prerequisites, setup, costs, and limitations.
- Runnable Node.js code with its own dependencies and lockfile.
- Safe sample inputs, blank environment configuration, and behavior tests.
- A synchronized n8n workflow with setup instructions and a canvas screenshot.
- A real output example, preview image, source project, and reproduction metadata.
- Links to the workflow page, official template, code, and video tutorial when available.

## Getting started

```bash
git clone https://github.com/Zvid-io/workflow-examples.git
cd workflow-examples
```

Choose a workflow from the catalog below and open its README. Each guide provides the required Node.js version, credentials, input format, and commands for that example.

To install an example, replace `WORKFLOW_SLUG` with its folder name:

```bash
cd workflows/WORKFLOW_SLUG
npm ci
npm run check
npm test
```

For API access, copy that workflow's `.env.example` to `.env` and configure the values described in its README. Create a Zvid key at [https://app.zvid.io/api-keys](https://app.zvid.io/api-keys).

Local checks and tests do not spend render credits. Preview options, live API calls, rendering costs, and scheduling behavior are documented separately for each workflow. Follow its guide before starting a real render.

## Workflow catalog

| Workflow | Use case |
| --- | --- |
| [Blog post video summaries](workflows/blog-to-video/) | Turn an RSS article into a narrated vertical summary for review and sharing. |
| [Weekly niche-news roundups](workflows/weekly-news-roundup/) | Curate RSS headlines into a narrated countdown video. |
| [Shopify product promos](workflows/shopify-product-promo/) | Turn a product record and photos into a vertical promo for manual review and delivery. |
| [Daily motivational quote videos](workflows/daily-quote-reels/) | Create branded vertical videos from a queue of quotes. |
| [Shopify catalog videos](workflows/shopify-catalog-videos/) | Render eligible product videos in a batch, review them, and optionally attach them to Shopify products. |
| [Shopify product video ads](workflows/shopify-product-ad-variants/) | Turn product photos and descriptions into creative variants, then review the rendered batch. |
| [Shopify abandoned checkout videos](workflows/shopify-abandoned-checkout-videos/) | Create personalized recovery videos with explicit, reviewed email delivery. |
| [Abandoned-cart personalized videos](workflows/abandoned-cart-video/) | Turn one cart into a personal recovery video, then review and hand off its link. |
| [Personalized cold-outreach videos](workflows/cold-outreach-videos/) | Create lead-specific videos from a small queue and save the results for review. |
| [Trial signup welcome videos](workflows/welcome-video-on-signup/) | Turn a signup record into a personal onboarding video. |
| [Bulk catalog videos](workflows/bulk-catalog-videos/) | Turn catalog rows into one video per product and preserve completed links. |
| [Flash-sale videos and banners](workflows/flash-sale-alert/) | Create a matching sale video and banner from an approved price drop. |
| [Five-star review videos](workflows/review-testimonial-video/) | Turn an approved review into a testimonial video with rating and quote checks. |
| [Proposal recap videos](workflows/proposal-recap-video/) | Turn a confirmed proposal-stage deal into a personal recap and next-step video. |
| [No-show rebooking videos](workflows/no-show-reengagement/) | Create a personal session recap and rebooking invitation from a recorded no-show. |
| [Customer month-in-review videos](workflows/month-in-review-stats/) | Turn one customer's prepared monthly metrics into a vertical recap. |

Open a workflow's folder for its tutorial, screenshots, sample output, and complete setup instructions.

## Repository layout

```text
workflows/
  <workflow-slug>/
    README.md
    src/
    package.json
    package-lock.json
    .env.example
    config.json                 # when that workflow needs it
    data/
    tests/
    n8n/
      workflow.json
      README.md
    assets/
      workflow.png
      sample-output.mp4
      sample-output.jpg
      sample-project.json
      sample-output.json
    links.json
```

Each example installs independently. There are no shared runtime dependencies or root npm workspaces to understand before trying one workflow. `links.json` records the website, official n8n template, code and YouTube URLs; unavailable publication URLs are `null` rather than invented links.

## Repository checks

After installing each example's dependencies, run these commands from the repository root:

```bash
npm run check:structure
npm run check
npm test
```

These verify the required folder structure, example assets, and workflow behavior across the collection. GitHub Actions runs the same checks automatically on pushes and pull requests.

## Add a workflow

Follow [CONTRIBUTING.md](CONTRIBUTING.md) to add a folder under `workflows/`, validate its implementation, include a real sample output, and add an entry to the catalog. Keep workflow-specific tutorials, screenshots, demonstrations, and operating details in that workflow's folder.

Sample media demonstrates the named input and configuration. It is not a guarantee that arbitrary inputs fit the design or have the same duration, cost, or rendering time.

## Links and support

- [Zvid workflow library](https://zvid.io/n8n/workflows)
- [Zvid documentation](https://docs.zvid.io)
- [Zvid dashboard](https://app.zvid.io)
- Support: [https://zvid.io/contact](https://zvid.io/contact)

The source code is provided under [MIT](LICENSE). Included footage, music, and rendered demonstrations may contain third-party media and are not relicensed by the code license. Review the applicable media rights for your intended use.
