import { readFileSync } from 'node:fs';
const candidates = readFileSync(new URL('./candidates.graphql', import.meta.url), 'utf8');
const confirmation = readFileSync(new URL('./confirmation.graphql', import.meta.url), 'utf8');
const deliveryConfirmation = confirmation.replace('id customerHasNoOrderSinceAbandonment', 'id customer { defaultEmailAddress { emailAddress } } customerHasNoOrderSinceAbandonment');

export function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Expected HTTPS without embedded credentials');
  return url.href;
}

export function createShopify(config, token, fetchImpl = fetch) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(config.shopDomain) || config.shopDomain === 'your-store') throw new Error('Set SHOPIFY_SHOP_DOMAIN to the canonical store subdomain');
  if (!/^\d{4}-(01|04|07|10)$/.test(config.shopifyApiVersion)) throw new Error('Invalid Shopify API version');
  if (!token) throw new Error('Set SHOPIFY_ACCESS_TOKEN to the returned Admin API access token');
  async function request(query, variables) {
    const response = await fetchImpl(`https://${config.shopDomain}.myshopify.com/admin/api/${config.shopifyApiVersion}/graphql.json`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: {'Content-Type':'application/json', 'X-Shopify-Access-Token':token},
      body: JSON.stringify({query, variables}),
    });
    if (!response.ok) throw new Error(`Shopify HTTP ${response.status}; check canonical domain, token expiry, scopes and rate limits`);
    const body = await response.json();
    if (body.errors?.length || !body.data) throw new Error('Shopify GraphQL request failed; check abandoned-checkout and protected-customer-data access');
    return body.data;
  }
  return {
    list: () => request(candidates, {first: config.scanLimit, query: config.checkoutQuery}),
    confirm: async id => (await request(confirmation, {id})).abandonmentByAbandonedCheckoutId,
    confirmDelivery: async id => (await request(deliveryConfirmation, {id})).abandonmentByAbandonedCheckoutId,
  };
}

export function eligible(abandonment, skipAlreadyEmailed = true) {
  return Boolean(abandonment && abandonment.customerHasNoOrderSinceAbandonment === true &&
    abandonment.customerHasNoDraftOrderSinceAbandonment === true && abandonment.inventoryAvailable === true &&
    abandonment.isMostSignificantAbandonment === true && !abandonment.abandonedCheckoutPayload?.completedAt &&
    (!skipAlreadyEmailed || !abandonment.emailSentAt));
}

export function selectCheckout(data, ledger, shopDomain) {
  const connection = data.abandonedCheckouts;
  for (const checkout of connection?.nodes || []) {
    const email = checkout.customer?.defaultEmailAddress?.emailAddress?.trim() || '';
    if (!checkout.id || checkout.completedAt || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) ||
      !checkout.lineItems?.nodes?.length || ledger[`${shopDomain}:${checkout.id}`]) continue;
    let checkoutUrl;
    try { checkoutUrl = httpsUrl(checkout.abandonedCheckoutUrl); } catch { continue; }
    return {
      checkoutId: checkout.id, checkoutName: checkout.name,
      firstName: String(checkout.customer?.firstName || '').slice(0,24), email, checkoutUrl,
      totalPrice: checkout.totalPriceSet?.shopMoney?.amount || '',
      currencyCode: checkout.totalPriceSet?.shopMoney?.currencyCode || '',
      cartRef: `checkout-${checkout.id.split('/').at(-1)}`,
      items: checkout.lineItems.nodes.slice(0,3).map(line => ({
        title: line.title || line.product?.title || '', variantTitle: line.variantTitle || '',
        quantity: Math.max(1, Number(line.quantity || 1)),
        price: line.discountedTotalPriceSet?.shopMoney?.amount || line.variant?.price || '',
        imageUrl: line.image?.url || '',
      })),
    };
  }
  return null;
}
