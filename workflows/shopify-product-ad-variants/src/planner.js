#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';


const here = dirname(fileURLToPath(import.meta.url));
export const defaultWorkflowPath = resolve(here, '../n8n/workflow.json');
export const defaultFixturePath = resolve(here, '../data/products.offline.json');

export async function loadWorkflow(workflowPath = defaultWorkflowPath) {
  const workflow = JSON.parse(await readFile(workflowPath, 'utf8'));
  const byName = new Map(workflow.nodes.map((node) => [node.name, node]));
  for (const name of ['Config', 'Create ad concepts', 'Build ad template']) {
    if (!byName.has(name)) throw new Error(`Workflow is missing the ${name} node.`);
  }
  return { workflow, byName };
}

export function readWorkflowConfig(byName) {
  return JSON.parse(byName.get('Config').parameters.jsonOutput);
}

function first(json) {
  return { first: () => ({ json }) };
}

async function executeTrustedWorkflowCode(code, context) {
  const run = new Function(
    '$input',
    '$',
    `"use strict"; return (async () => { ${code}\n })();`,
  );
  return run(context.$input, context.$);
}

export async function createPlan({ byName, config, shopifyResponse }) {
  const result = await executeTrustedWorkflowCode(
    byName.get('Create ad concepts').parameters.jsCode,
    {
      $input: first(shopifyResponse),
      $: (name) => first(name === 'Config' ? config : undefined),
    },
  );
  const plan = result?.[0]?.json;
  if (!plan) throw new Error('Create ad concepts returned no plan.');
  return plan;
}

export async function createRenderPayload({ byName, config, plan }) {
  const result = await executeTrustedWorkflowCode(
    byName.get('Build ad template').parameters.jsCode,
    {
      $input: first(plan),
      $: (name) => {
        if (name === 'Config') return first(config);
        if (name === 'Create ad concepts') return first(plan);
        return first(undefined);
      },
    },
  );
  const build = result?.[0]?.json;
  if (!build) throw new Error('Build ad template returned no payload.');
  return build;
}

export async function loadFixture(fixturePath = defaultFixturePath) {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

export function normalizeStoreDomain(value) {
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/^(?:https:\/\/)?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.myshopify\.com)?\/?$/);
  if (!match || match[1].length > 63) {
    throw new Error('Use only the Shopify store prefix or its exact HTTPS myshopify.com hostname, without paths, credentials, ports or query strings.');
  }
  return match[1];
}

export async function fetchShopifyCatalog(config, accessToken) {
  const shopDomain = normalizeStoreDomain(config.shopDomain);
  if (!shopDomain) throw new Error('Set SHOPIFY_STORE_DOMAIN or --shop-domain.');
  if (!accessToken) throw new Error('Set SHOPIFY_ADMIN_ACCESS_TOKEN.');
  const query = `query AdCandidates($first: Int!, $query: String!) {
    shop { name currencyCode primaryDomain { url } }
    products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id title handle description vendor productType tags status
        featuredImage {
          url(transform: { maxWidth: 1600, maxHeight: 1600, preferredContentType: WEBP })
          altText
        }
        images(first: 3) {
          nodes {
            url(transform: { maxWidth: 1600, maxHeight: 1600, preferredContentType: WEBP })
            altText
          }
        }
        variants(first: 1) { nodes { title price compareAtPrice } }
      }
    }
  }`;
  const response = await fetch(
    `https://${shopDomain}.myshopify.com/admin/api/${config.shopifyApiVersion}/graphql.json`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query,
        variables: {
          first: Math.min(250, Math.max(1, Number(config.scanLimit || 50))),
          query: String(config.shopifyProductQuery || 'status:active'),
        },
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  return { statusCode: response.status, body };
}
