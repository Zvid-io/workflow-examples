// Maintained normalizer from the canonical n8n workflow.
export function normalizeDeal(body, config) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) throw new Error('Supply a nonempty deal object');
  const $ = name => ({ first: () => ({ json: name === 'Config' ? config : { body } }) });
  return (() => {
// Normalises one deal posted to the webhook into the same flat shape the
// sheet path emits. HubSpot, Pipedrive, Zapier or your own app can all post
// here — see the blue note for the exact contract and the HubSpot field map.
//
// When the workflow is executed by hand the webhook node has not run, so the
// sample in Config.samplePayload is used instead: 'Execute workflow' always
// produces a real video, which is what makes the template testable.
const cfg = $('Config').first().json;

let body = null;
let via = 'sample';
try {
  const hook = $('Deal webhook').first().json;
  if (hook && typeof hook === 'object') {
    body = hook.body && typeof hook.body === 'object' ? hook.body : hook;
    via = 'webhook';
  }
} catch (e) {
  // Not a webhook run (manual execution or schedule) — fall through to the sample.
}
if (!body || typeof body !== 'object' || !Object.keys(body).length) {
  body = cfg.samplePayload || {};
  via = 'sample';
}

// Some CRMs wrap the fields one level down (HubSpot workflow webhooks use
// "properties", Pipedrive uses "current"). Accept either.
const deal =
  (body.properties && typeof body.properties === 'object' && body.properties) ||
  (body.current && typeof body.current === 'object' && body.current) ||
  body;

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const firstOf = (...vals) => {
  for (const v of vals) {
    const s = clean(v, 400);
    if (s) return s;
  }
  return '';
};

// These caps are sanity bounds on a hostile POST body, NOT display clamps —
// they sit far above anything the layout prints. The one place a value is
// shortened for the screen is *Build project JSON*, which elides on a word
// boundary with a visible ellipsis and reports it in meta.truncated. Cutting
// here as well would hand that node an already-mangled name to render.
const dealName = clean(firstOf(deal.dealName, deal.dealname, deal.title, deal.name), 300);
const company = clean(firstOf(deal.company, deal.companyName, deal.org_name, deal.account), 300);
const contactFirstName = clean(
  firstOf(deal.contactFirstName, deal.firstName, deal.firstname, deal.contact_first_name),
  120
);

// scope may arrive as an array, as scope1..3 / ScopeLine1..3, or as one string
// with newlines or semicolons in it.
let scope = [];
if (Array.isArray(deal.scope)) {
  scope = deal.scope;
} else if (typeof deal.scope === 'string' && deal.scope.trim()) {
  scope = deal.scope.split(/\r?\n|;/);
} else {
  scope = [
    firstOf(deal.scopeLine1, deal.ScopeLine1, deal.scope1),
    firstOf(deal.scopeLine2, deal.ScopeLine2, deal.scope2),
    firstOf(deal.scopeLine3, deal.ScopeLine3, deal.scope3),
  ];
}
scope = scope.map((s) => clean(s, 240)).filter(Boolean).slice(0, 3);

const amount = clean(firstOf(deal.amount, deal.value, deal.dealValue), 40);
if (!dealName || !company || !amount) {
  throw new Error(
    'The deal payload needs at least dealName, company and amount. Expected POST body: ' +
      '{ "dealName": "Website redesign", "company": "Halcyon Interiors", "contactFirstName": "Sofia", ' +
      '"amount": "12400", "currency": "USD", "scope": ["...", "...", "..."], ' +
      '"timelineWeeks": "6", "validUntil": "2026-08-15" }'
  );
}

return [{
  json: {
    found: true,
    dealName,
    company,
    contactFirstName,
    amount,
    currency: clean(firstOf(deal.currency, deal.deal_currency_code, cfg.defaultCurrency), 6),
    scope,
    timelineWeeks: clean(firstOf(deal.timelineWeeks, deal.timeline, deal.TimelineWeeks), 60),
    validUntil: clean(firstOf(deal.validUntil, deal.valid_until, deal.expiresOn), 60),
    rowNumber: null,
    source: 'webhook',
    receivedVia: via,
  },
}];
})()[0].json;
}
