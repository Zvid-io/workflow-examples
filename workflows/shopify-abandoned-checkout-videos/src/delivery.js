import { eligible, httpsUrl } from './shopify.js';
export const validEmail = value => typeof value === 'string' && value.length<=254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function emailContent(state, phase='initial') {
  const cart=state.cart;
  const name=String(cart.firstName||'there').replace(/[\r\n]/g,' ').slice(0,24);
  const checkoutUrl=httpsUrl(cart.checkoutUrl), videoUrl=httpsUrl(state.videoUrl);
  const subject=`${name}, ${phase==='follow-up'?'one last look at your saved cart':'your cart is still saved'}`;
  const items=(cart.items||[]).slice(0,3).map(item=>item.title);
  return {
    subject,
    text:`${name}, your checkout is still open.\n${items.join('\n')}\nContinue checkout: ${checkoutUrl}\nWatch your cart video: ${videoUrl}`,
    html:`<!doctype html><html lang="en"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;max-width:560px;padding:28px"><h1>${esc(name)}, your cart is still saved.</h1><p>Here is a quick look at the items you left:</p><ul>${items.map(title=>`<li>${esc(title)}</li>`).join('')}</ul><p><a href="${esc(checkoutUrl)}">Complete your order</a></p><p><a href="${esc(videoUrl)}">Watch your personalized cart video</a></p></body></html>`,
  };
}

export async function deliver({state, phase, confirmedRecipient, from, shopify, mailer, save=()=>{}, now=Date.now}) {
  if (!['initial','follow-up'].includes(phase)) throw new Error('--deliver must be initial or follow-up');
  if (state.fixture) throw new Error('Fixture email delivery is blocked');
  if (state.state!=='rendered' || !state.videoUrl) throw new Error('Review a completed render before delivery');
  if (!validEmail(state.cart.email) || !validEmail(confirmedRecipient) || confirmedRecipient.toLowerCase()!==state.cart.email.toLowerCase()) throw new Error('CONFIRM_RECIPIENT must match the saved checkout email exactly');
  if (!validEmail(from)) throw new Error('SMTP_FROM must be one verified email address');
  state.deliveries ||= {};
  if (state.deliveries[phase]) throw new Error('This delivery already has an attempt record. Inspect SMTP provider logs before any manual recovery; automatic retry is blocked');
  if (phase==='follow-up') {
    if (state.config.followUpEnabled !== true) throw new Error('Follow-up is disabled in this saved run');
    if (state.deliveries.initial?.status!=='sent') throw new Error('A confirmed initial SMTP send is required before follow-up');
    if (now()<state.deliveries.initial.sentAt+state.config.followUpWaitMinutes*60_000) throw new Error('The configured follow-up delay has not elapsed');
  }
  const fresh=await shopify.confirmDelivery(state.cart.checkoutId);
  if (!eligible(fresh,state.config.skipIfShopifyAlreadyEmailed)) throw new Error('Checkout is no longer eligible; no email sent');
  const currentEmail=fresh.customer?.defaultEmailAddress?.emailAddress;
  if (!validEmail(currentEmail) || currentEmail.toLowerCase()!==state.cart.email.toLowerCase()) throw new Error('Shopify recipient changed or is unavailable; review the checkout again');
  state.cart.checkoutUrl=httpsUrl(fresh.abandonedCheckoutPayload?.abandonedCheckoutUrl);
  const content=emailContent(state,phase);
  state.deliveries[phase]={status:'attempting',attemptedAt:now()}; save(state);
  try {
    const receipt=await mailer.sendMail({from,to:state.cart.email,...content,disableFileAccess:true,disableUrlAccess:true});
    if (!receipt.accepted?.some(address=>String(address).toLowerCase()===state.cart.email.toLowerCase()) || receipt.rejected?.length) throw new Error('Recipient was not confirmed accepted');
    state.deliveries[phase]={status:'sent',sentAt:now(),messageId:receipt.messageId||null}; save(state);
    return state;
  } catch {
    state.deliveries[phase]={...state.deliveries[phase],status:'uncertain'}; save(state);
    throw new Error('SMTP outcome is unconfirmed. Check provider logs; this example will not retry automatically');
  }
}
