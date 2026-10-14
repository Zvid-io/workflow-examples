# Zvid workflow examples

Runnable Node.js examples for Zvid video workflows. Each workflow has its own setup guide, locked dependencies, safe input data, tests, synchronized n8n template, and a real example of the output.

## Workflows

| Workflow | Outcome | Tutorial | Output |
| --- | --- | --- | --- |
| [Daily motivational quote videos](workflows/daily-quote-reels/) | Turn a quote queue into branded vertical videos with music and an author card. | [Watch](https://youtu.be/Ra6mPdmDDYs) | [MP4](workflows/daily-quote-reels/assets/sample-output.mp4) |

[![Example quote video](workflows/daily-quote-reels/assets/sample-output.jpg)](workflows/daily-quote-reels/assets/sample-output.mp4)

## Run an example

```bash
git clone https://github.com/Zvid-io/workflow-examples.git
cd workflow-examples/workflows/daily-quote-reels
npm ci
```

Copy `.env.example` to `.env` and add a key from [https://app.zvid.io/api-keys](https://app.zvid.io/api-keys). Then follow the workflow's README. For the daily quote example:

```bash
npm run check
npm test
npm run dry-run
```

The checks and tests are local and use no render credits. The dry run calls Zvid to validate the project and attempts to save an editor draft without submitting a render. A real render spends credits; check the workflow's instructions and current validation quote before running it.

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

For maintainers, run `npm run check:structure`, `npm run check`, and `npm test` from this repository root after installing each example's dependencies. GitHub Actions runs the same checks automatically on pushes and pull requests.

## Add a workflow

Follow [CONTRIBUTING.md](CONTRIBUTING.md). New examples belong in this repository. Existing standalone example repositories keep their published URLs; this collection starts with the tested daily quote example and grows one workflow at a time.

Sample media demonstrates the named input and configuration. It is not a guarantee that arbitrary inputs fit the design or have the same duration, cost, or rendering time.

## Links and support

- [Zvid workflow library](https://zvid.io/n8n/workflows)
- [Zvid documentation](https://docs.zvid.io)
- [Zvid dashboard](https://app.zvid.io)
- Support: [https://zvid.io/contact](https://zvid.io/contact)

The source code is provided under [MIT](LICENSE). Included footage, music, and rendered demonstrations may contain third-party media and are not relicensed by the code license. Review the applicable media rights for your intended use.
