import { readFileSync } from 'node:fs';

const query = readFileSync(new URL('./catalog.graphql', import.meta.url), 'utf8');
const STAGE = `mutation StageVideo($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { message } }
}`;
const ATTACH = `mutation AttachVideo($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
  productUpdate(product: $product, media: $media) { product { id } userErrors { message } }
}`;
const TAG = `mutation TagVideo($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { node { id } userErrors { message } }
}`;

export function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Expected an HTTPS URL without embedded credentials');
  return url.href;
}

export function createShopify(config, token, fetchImpl = fetch) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(config.shopDomain) || config.shopDomain === 'your-store') throw new Error('Set SHOPIFY_SHOP_DOMAIN to your store subdomain');
  if (!/^\d{4}-(01|04|07|10)$/.test(config.shopifyApiVersion)) throw new Error('Invalid Shopify API version');
  if (!token) throw new Error('Set SHOPIFY_ACCESS_TOKEN');
  const endpoint = `https://${config.shopDomain}.myshopify.com/admin/api/${config.shopifyApiVersion}/graphql.json`;
  async function graphql(query, variables) {
    const response = await fetchImpl(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`Shopify HTTP ${response.status}; check token, scopes and rate limits`);
    const body = await response.json();
    if (body.errors?.length) throw new Error(`Shopify GraphQL: ${body.errors.map(e => e.message).join('; ')}`);
    if (!body.data) throw new Error('Shopify response has no data');
    return body;
  }
  function mutation(body, key) {
    const result = body.data?.[key];
    if (!result || result.userErrors?.length) throw new Error(`Shopify ${key}: ${result?.userErrors?.map(e => e.message).join('; ') || 'missing response'}`);
    return result;
  }
  return {
    getCatalog: () => graphql(query, { first: config.scanLimit, query: config.shopifyProductQuery }),
    async publish(item, record = () => {}) {
      // Download before allocating an upload target. Small catalog clips are buffered, capped at 100 MiB.
      const download = await fetchImpl(httpsUrl(item.videoUrl), { signal: AbortSignal.timeout(120_000) });
      if (!download.ok) throw new Error(`Video download HTTP ${download.status}`);
      const chunks = [];
      let length = 0;
      for await (const chunk of download.body) {
        length += chunk.length;
        if (length > 100 * 1024 * 1024) throw new Error('Video exceeds this example’s 100 MiB upload limit');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error('Downloaded video is not an MP4');
      const filename = `zvid-${item.productId.split('/').at(-1)}.mp4`;
      const staged = mutation(await graphql(STAGE, { input: [{
        filename, mimeType: 'video/mp4', resource: 'VIDEO', httpMethod: 'POST', fileSize: String(bytes.length),
      }] }), 'stagedUploadsCreate').stagedTargets?.[0];
      if (!staged?.resourceUrl || !staged.parameters?.length) throw new Error('Incomplete Shopify staged upload target');
      const form = new FormData();
      for (const p of staged.parameters) form.append(p.name, p.value);
      form.append('file', new Blob([bytes], { type: 'video/mp4' }), filename);
      const uploaded = await fetchImpl(httpsUrl(staged.url), {
        method: 'POST', body: form, signal: AbortSignal.timeout(120_000),
      });
      if (!uploaded.ok) throw new Error(`Shopify staged upload HTTP ${uploaded.status}`);
      // Persist before the non-idempotent association. An ambiguous response must be inspected manually.
      record({ publication: 'association-pending' });
      const attached = mutation(await graphql(ATTACH, { product: { id: item.productId }, media: [{
        originalSource: httpsUrl(staged.resourceUrl), mediaContentType: 'VIDEO', alt: `${item.title} product video`.slice(0, 512),
      }] }), 'productUpdate');
      if (attached.product?.id !== item.productId) throw new Error('Shopify returned an unexpected product ID');
      record({ publication: 'processing', tagged: false });
      const tagged = mutation(await graphql(TAG, { id: item.productId, tags: [config.processedTag] }), 'tagsAdd');
      if (tagged.node?.id !== item.productId) throw new Error('Shopify did not confirm the processed tag');
      record({ publication: 'processing', tagged: true });
    },
  };
}
