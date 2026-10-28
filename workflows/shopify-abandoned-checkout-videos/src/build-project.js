// === buildProject - identical to the frame-reviewed standalone builder ===
// Abandoned checkout -> a personal 1080x1920 cart-recovery reel.
// Three scenes: the personal hook (their first item), the cart line-up
// (1-3 item cards, layout adapts to the count) and the total + CTA card.
export function buildProject(config, data) {
  const cfg = config || {};
  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round = (n) => Math.round(n * 100) / 100;

  // ---- brand knobs --------------------------------------------------------
  const brandName = clean(cfg.brandName) || 'Your store';
  const storeUrl = clean(cfg.storeUrl) || 'yourstore.example';
  const bg = clean(cfg.brandBackground) || '#12100E';
  const accent = clean(cfg.brandAccent) || '#E2714B';
  const accentSoft = clean(cfg.accentSoft) || '#F0B08C';
  const cream = clean(cfg.creamColor) || '#F6F1E9';
  const muted = clean(cfg.mutedColor) || '#9C948A';
  const headingFont = clean(cfg.headingFont) || 'Sora';
  const accentFont = clean(cfg.accentFont) || 'Fraunces';
  const uiFont = clean(cfg.uiFont) || 'DM Sans';
  const currency = clean(cfg.currencySymbol) || '$';

  const hookLine = clean(cfg.hookLine) || 'you left something behind.';
  const hookNote = clean(cfg.hookNote) || 'Your cart is still saved - for now.';
  const cartKicker = clean(cfg.cartKicker) || 'STILL IN YOUR CART';
  const cartNote = clean(cfg.cartNote) || 'We saved your cart. Nothing stays reserved forever.';
  const totalLabel = clean(cfg.totalLabel) || 'YOUR CART TOTAL';
  const ctaText = clean(cfg.ctaText) || 'Complete your order';
  const ctaSubline = clean(cfg.ctaSubline) || 'Pick up exactly where you left off.';

  // ---- cart data ----------------------------------------------------------
  const firstNameRaw = clean(data.firstName);
  // Only ever a first name goes near the video; the email address never does
  // (it would end up in the public CDN filename).
  const firstName = firstNameRaw ? firstNameRaw.slice(0, 24) : '';
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems
    .map((it) => ({
      title: clean(it && it.title),
      imageUrl: clean(it && it.imageUrl),
      priceRaw: clean(it && it.price),
    }))
    .filter((it) => it.title)
    .slice(0, 3);
  if (!items.length) throw new Error('This cart has no line items with a title - nothing to render.');

  // Only public http(s) images make it into the design; anything else falls
  // back to a designed numbered tile instead of a broken picture box.
  for (const it of items) {
    if (!/^https?:\/\//i.test(it.imageUrl)) it.imageUrl = '';
  }
  const heroImage = (items.find((it) => it.imageUrl) || {}).imageUrl || '';

  // ---- money --------------------------------------------------------------
  // Prices arrive as free text ("$49", "1,049.00", "49,00"). Parse what we can;
  // when even one item is unparseable the total line is replaced rather than
  // shown wrong.
  const parseMoney = (s) => {
    const t = String(s || '').replace(/[^\d.,-]/g, '').trim();
    if (!t) return null;
    let n;
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) n = Number(t.replace(/,/g, ''));
    else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) n = Number(t.replace(/\./g, '').replace(',', '.'));
    else n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const groupNum = (n, withCents) => {
    const fixed = withCents || Math.abs(n % 1) > 0.0001 ? n.toFixed(2) : String(Math.round(n));
    const [intPart, dec] = fixed.split('.');
    return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ? '.' + dec : '');
  };
  const hasSymbol = (s) => /[^\d\s.,-]/.test(String(s || ''));
  // Cents are shown on the total only when the store itself quotes cents -
  // "$128.00 + $42.00 = $170" reads wrong, "= $170.00" reads right.
  const showsCents = items.some((it) => /[.,]\d{2}(\D|$)/.test(it.priceRaw));
  const displayPrice = (raw) => {
    if (!raw || !/\d/.test(raw)) return '';
    if (hasSymbol(raw)) return raw;
    const n = parseMoney(raw);
    return n === null ? raw : currency + groupNum(n, showsCents);
  };

  const parsedPrices = items.map((it) => parseMoney(it.priceRaw));
  const suppliedTotal = parseMoney(data.totalPrice);
  const allPriced = items.length > 0 && parsedPrices.every((p) => p !== null);
  const totalNumber = suppliedTotal !== null ? suppliedTotal : allPriced ? parsedPrices.reduce((a, b) => a + b, 0) : null;
  const totalDisplay = totalNumber === null ? '' : currency + groupNum(totalNumber, showsCents);

  // ---- type metrics -------------------------------------------------------
  // Greedy word-wrap estimate. AVG_EM was measured on the production
  // renderer (Sora 700 at 33 px sets 18.6 px per character = 0.565 em) and
  // rounded up, so the estimate errs towards shrinking type, never towards
  // overflow.
  const AVG_EM = 0.575;
  const wrapLines = (text, fontPx, boxPx, avgEm) => {
    const perLine = Math.max(6, Math.floor(boxPx / (fontPx * avgEm)));
    let lines = 1;
    let used = 0;
    for (const w of String(text).split(' ')) {
      const need = used === 0 ? w.length : used + 1 + w.length;
      if (need <= perLine) { used = need; continue; }
      lines += 1;
      used = Math.min(w.length, perLine);
    }
    return lines;
  };
  // Shrinks a product title until it wraps into at most `maxLines`, then
  // ellipsises what is still too long. Nothing ever spills out of a card.
  const fitTitle = (text, sizes, boxPx, maxLines) => {
    for (const size of sizes) {
      if (wrapLines(text, size, boxPx, AVG_EM) <= maxLines) return { text, size };
    }
    const smallest = sizes[sizes.length - 1];
    const perLine = Math.max(6, Math.floor(boxPx / (smallest * AVG_EM)));
    const budget = Math.max(12, perLine * maxLines - 1);
    let cut = String(text).slice(0, budget);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > budget * 0.6) cut = cut.slice(0, lastSpace);
    return { text: cut.replace(/[\s,.;:-]+$/, '') + '…', size: smallest };
  };

  // ---- shared markup ------------------------------------------------------
  // A thumbnail tile: the product photo when we have one, a numbered accent
  // tile when we do not, so a missing image still looks designed.
  const thumbTile = (item, index, size, radius) =>
    item.imageUrl
      ? "<div style='width:" + size + 'px; height:' + size + 'px; flex:none; border-radius:' + radius +
        "px; overflow:hidden; background:rgba(246,241,233,0.10);'><img src='" + esc(item.imageUrl) +
        "' width='" + size + "' height='" + size + "' alt='' style='width:" + size + 'px; height:' + size +
        "px; object-fit:cover; display:block;'/></div>"
      : "<div style='width:" + size + 'px; height:' + size + 'px; flex:none; border-radius:' + radius +
        'px; background:rgba(226,113,75,0.16); color:' + accent + '; font-size:' + Math.round(size * 0.3) +
        'px; font-weight:800; line-height:' + size + "px; text-align:center;'>" + (index + 1) + '</div>';

  const svgOpen = "<svg width='1080' height='1920' viewBox='0 0 1080 1920' xmlns='http://www.w3.org/2000/svg'>";

  // ==== scene 1 - the personal hook ========================================
  const s1Seconds = 4.6;
  const transitionSeconds = 0.5;

  const nameSize = firstName.length <= 10 ? 92 : firstName.length <= 16 ? 76 : 62;
  const nameY = 1168;
  const hookSize = hookLine.length <= 30 ? 76 : hookLine.length <= 46 ? 66 : 56;
  const hookY = nameY + Math.round(nameSize * 1.14) + 6;
  const hookLines = wrapLines(hookLine, hookSize, 900, AVG_EM);
  const noteY = hookY + Math.round(hookLines * hookSize * 1.08) + 44;

  const s1 = {
    id: 'hook',
    duration: s1Seconds,
    backgroundColor: bg,
    transition: 'smoothup',
    transitionId: 'cart',
    transitionDuration: transitionSeconds,
    visuals: [],
  };

  // The customer's own product photo, blurred and dimmed, is the backdrop:
  // no stock footage to go stale, and the palette always matches the product.
  if (heroImage) {
    s1.visuals.push({
      type: 'IMAGE', src: heroImage, width: 1080, height: 1920, position: 'center-center', resize: 'cover',
      zoom: { depth: 1.14 }, filter: { blur: '5', brightness: -26, saturate: -14 },
      track: 0, enterBegin: 0, exitEnd: s1Seconds,
    });
  }
  s1.visuals.push({
    type: 'SVG', width: 1080, height: 1920, track: 1, enterBegin: 0, exitEnd: s1Seconds,
    svg: svgOpen +
      "<defs><linearGradient id='acvHookShade' x1='0' y1='0' x2='0' y2='1'>" +
      "<stop offset='0' stop-color='" + bg + "' stop-opacity='0.78'/>" +
      "<stop offset='0.32' stop-color='" + bg + "' stop-opacity='0.5'/>" +
      "<stop offset='0.58' stop-color='" + bg + "' stop-opacity='0.72'/>" +
      "<stop offset='1' stop-color='" + bg + "' stop-opacity='0.96'/></linearGradient>" +
      "<radialGradient id='acvHookGlow' cx='0.5' cy='0.36' r='0.6'>" +
      "<stop offset='0' stop-color='" + accent + "' stop-opacity='0.28'/>" +
      "<stop offset='1' stop-color='" + accent + "' stop-opacity='0'/></radialGradient></defs>" +
      "<rect width='1080' height='1920' fill='url(#acvHookShade)'/>" +
      "<rect width='1080' height='1920' fill='url(#acvHookGlow)'/>" +
      "<rect x='48' y='48' width='984' height='1824' rx='40' fill='none' stroke='rgba(246,241,233,0.18)' stroke-width='1.5'/>" +
      // With no product photo the frame would read flat, so the card gets a
      // pair of halo rings instead of the blurred backdrop.
      (heroImage
        ? ''
        : "<circle cx='540' cy='680' r='404' fill='none' stroke='" + accent + "' stroke-opacity='0.32' stroke-width='2'/>" +
          "<circle cx='540' cy='680' r='446' fill='none' stroke='" + accent + "' stroke-opacity='0.14' stroke-width='1'/>") +
      // corner ticks framing the product card (card box 230,300 -> 850,1060)
      "<path d='M206 348 L206 276 L278 276' fill='none' stroke='" + accent + "' stroke-width='4' stroke-opacity='0.85'/>" +
      "<path d='M874 348 L874 276 L802 276' fill='none' stroke='" + accent + "' stroke-width='4' stroke-opacity='0.85'/>" +
      "<path d='M206 1012 L206 1084 L278 1084' fill='none' stroke='" + accent + "' stroke-width='4' stroke-opacity='0.85'/>" +
      "<path d='M874 1012 L874 1084 L802 1084' fill='none' stroke='" + accent + "' stroke-width='4' stroke-opacity='0.85'/>" +
      "<path d='M90 1120 L200 1120' stroke='rgba(246,241,233,0.28)' stroke-width='1.5'/>" +
      '</svg>',
  });
  s1.visuals.push({
    type: 'TEXT', x: 540, y: 128, anchor: 'top-center', track: 2,
    enterBegin: 0.2, enterEnd: 0.7, enterAnimation: 'fade', exitEnd: s1Seconds,
    style: { fontFamily: uiFont, color: cream },
    html: "<div style='display:inline-block; border:1.5px solid rgba(246,241,233,0.5); border-radius:999px; padding:15px 36px; color:" +
      cream + "; font-size:25px; font-weight:700; letter-spacing:6px;'>" + esc(brandName.toUpperCase()) + '</div>',
  });
  if (heroImage) {
    s1.visuals.push({
      type: 'IMAGE', src: heroImage, x: 540, y: 680, width: 620, height: 760, anchor: 'center-center',
      radius: { tl: 40, tr: 40, bl: 40, br: 40 }, zoom: { depth: 1.07 },
      track: 3, enterBegin: 0.1, enterEnd: 0.75, enterAnimation: 'smoothup', exitEnd: s1Seconds,
    });
  } else {
    const placeholder = fitTitle(items[0].title, [58, 50, 44], 520, 3);
    // Same box the hero photo would occupy (620x760 centred on 540,680), but
    // declared top-left with no `height`: every TEXT element in this design
    // sizes itself from its own html so the layout lint never mistakes a card
    // for a collision with the full-frame backdrop.
    s1.visuals.push({
      type: 'TEXT', x: 230, y: 300, width: 620, anchor: 'top-left', track: 3,
      enterBegin: 0.1, enterEnd: 0.75, enterAnimation: 'smoothup', exitEnd: s1Seconds,
      style: { fontFamily: headingFont, color: cream },
      html: "<div style='width:620px; height:760px; border-radius:40px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:rgba(246,241,233,0.07); box-shadow:inset 0 0 0 1.5px rgba(246,241,233,0.16);'>" +
        "<div style='width:520px; color:" + cream + '; font-size:' + placeholder.size +
        "px; line-height:1.12; font-weight:700; text-align:center;'>" + esc(placeholder.text) + '</div></div>',
    });
  }
  if (firstName) {
    s1.visuals.push({
      type: 'TEXT', x: 90, y: nameY, width: 900, anchor: 'top-left', track: 4,
      enterBegin: 0.55, enterEnd: 1.05, enterAnimation: 'smoothup', exitEnd: s1Seconds,
      style: { fontFamily: accentFont, color: accentSoft },
      html: "<div style='color:" + accentSoft + '; font-size:' + nameSize +
        "px; line-height:1.06; font-style:italic; font-weight:500;'>" + esc(firstName) + ',</div>',
    });
  }
  s1.visuals.push({
    type: 'TEXT', x: 90, y: firstName ? hookY : nameY, width: 900, anchor: 'top-left', track: 5,
    enterBegin: 0.8, enterEnd: 1.3, enterAnimation: 'smoothup', exitEnd: s1Seconds,
    style: { fontFamily: headingFont, color: cream },
    html: "<div style='color:" + cream + '; font-size:' + hookSize +
      "px; line-height:1.08; font-weight:800; letter-spacing:-1px;'>" + esc(hookLine) + '</div>',
  });
  s1.visuals.push({
    type: 'TEXT', x: 90, y: firstName ? noteY : noteY - Math.round(nameSize * 1.14) - 6, width: 860,
    anchor: 'top-left', track: 6,
    enterBegin: 1.35, enterEnd: 1.8, enterAnimation: 'fade', exitEnd: s1Seconds,
    style: { fontFamily: uiFont, color: muted },
    html: "<div style='color:" + muted + "; font-size:30px; line-height:1.4; font-weight:500;'>" + esc(hookNote) + '</div>',
  });

  // ==== scene 2 - the cart line-up ========================================
  const n = items.length;
  const s2Seconds = n === 1 ? 5.0 : n === 2 ? 5.8 : 6.4;
  const s2 = {
    id: 'cart',
    duration: s2Seconds,
    backgroundColor: bg,
    transition: 'fade',
    transitionId: 'cta',
    transitionDuration: transitionSeconds,
    visuals: [],
  };
  if (heroImage) {
    s2.visuals.push({
      type: 'IMAGE', src: heroImage, width: 1080, height: 1920, position: 'center-center', resize: 'cover',
      zoom: { depth: 1.1 }, filter: { blur: '7', brightness: -46, saturate: -26 },
      track: 0, enterBegin: 0, exitEnd: s2Seconds,
    });
  }
  s2.visuals.push({
    type: 'SVG', width: 1080, height: 1920, track: 1, enterBegin: 0, exitEnd: s2Seconds,
    svg: svgOpen +
      "<defs><linearGradient id='acvCartShade' x1='0' y1='0' x2='0' y2='1'>" +
      "<stop offset='0' stop-color='" + bg + "' stop-opacity='0.9'/>" +
      "<stop offset='0.5' stop-color='" + bg + "' stop-opacity='0.82'/>" +
      "<stop offset='1' stop-color='" + bg + "' stop-opacity='0.95'/></linearGradient></defs>" +
      "<rect width='1080' height='1920' fill='url(#acvCartShade)'/>" +
      "<rect x='48' y='48' width='984' height='1824' rx='40' fill='none' stroke='rgba(246,241,233,0.16)' stroke-width='1.5'/>" +
      "<rect x='90' y='330' width='900' height='2' fill='rgba(246,241,233,0.16)'/>" +
      "<rect x='90' y='326' width='104' height='6' rx='3' fill='" + accent + "'/>" +
      '</svg>',
  });
  s2.visuals.push({
    type: 'TEXT', x: 90, y: 150, anchor: 'top-left', track: 2,
    enterBegin: 0.3, enterEnd: 0.7, enterAnimation: 'fade', exitEnd: s2Seconds,
    style: { fontFamily: uiFont, color: accentSoft },
    html: "<div style='color:" + accentSoft + "; font-size:25px; font-weight:700; letter-spacing:6px;'>" +
      esc(cartKicker.toUpperCase()) + '</div>',
  });
  s2.visuals.push({
    type: 'TEXT', x: 90, y: 198, width: 900, anchor: 'top-left', track: 3,
    enterBegin: 0.4, enterEnd: 0.85, enterAnimation: 'smoothup', exitEnd: s2Seconds,
    style: { fontFamily: headingFont, color: cream },
    html: "<div style='color:" + cream + "; font-size:66px; line-height:1.04; font-weight:800; letter-spacing:-1px;'>" +
      n + (n === 1 ? ' item' : ' items') + " waiting</div>",
  });

  const cardShell = (w, h, radius) =>
    'width:' + w + 'px; height:' + h + 'px; border-radius:' + radius +
    'px; overflow:hidden; background:rgba(246,241,233,0.075); box-shadow:inset 0 0 0 1.5px rgba(246,241,233,0.15);';

  // The card block always starts just under the rule and lands near y=1460,
  // so 1, 2 and 3 items each fill the frame instead of floating in it.
  let rowsBottom;
  if (n === 1) {
    const item = items[0];
    const title = fitTitle(item.title, [46, 42, 38], 828, 2);
    const price = displayPrice(item.priceRaw);
    const cardY = 420;
    const media = item.imageUrl
      ? "<div style='width:836px; height:780px; margin:32px 0 0 32px; border-radius:24px; overflow:hidden; background:rgba(246,241,233,0.10);'><img src='" +
        esc(item.imageUrl) + "' width='836' height='780' alt='' style='width:836px; height:780px; object-fit:cover; display:block;'/></div>"
      : "<div style='width:836px; height:780px; margin:32px 0 0 32px; border-radius:24px; background:rgba(226,113,75,0.14); box-shadow:inset 0 0 0 1.5px rgba(226,113,75,0.35);'></div>";
    s2.visuals.push({
      type: 'TEXT', x: 90, y: cardY, width: 900, anchor: 'top-left', track: 4,
      enterBegin: 0.75, enterEnd: 1.3, enterAnimation: 'smoothup', exitEnd: s2Seconds,
      style: { fontFamily: headingFont, color: cream },
      html: "<div style='" + cardShell(900, 1090, 34) + "'>" + media +
        "<div style='margin:30px 0 0 34px; width:828px;'>" +
        "<div style='color:" + cream + '; font-size:' + title.size + "px; line-height:1.14; font-weight:700;'>" + esc(title.text) + '</div>' +
        (price ? "<div style='margin-top:16px; color:" + accent + "; font-size:44px; font-weight:800;'>" + esc(price) + '</div>' : '') +
        '</div></div>',
    });
    rowsBottom = cardY + 1090;
  } else {
    const two = n === 2;
    const cardH = two ? 500 : 330;
    const gap = two ? 64 : 40;
    const thumb = two ? 380 : 250;
    const textW = 808 - thumb;
    const titleSizes = two ? [38, 34, 30] : [36, 33, 30];
    const maxLines = 3;
    const priceSize = two ? 38 : 34;
    const startY = two ? 460 : 430;
    items.forEach((item, i) => {
      const title = fitTitle(item.title, titleSizes, textW, maxLines);
      const price = displayPrice(item.priceRaw);
      const y = startY + i * (cardH + gap);
      s2.visuals.push({
        type: 'TEXT', x: 90, y: y, width: 900, anchor: 'top-left', track: 4 + i,
        enterBegin: round(0.7 + i * 0.28), enterEnd: round(1.2 + i * 0.28), enterAnimation: 'smoothleft', exitEnd: s2Seconds,
        style: { fontFamily: headingFont, color: cream },
        html: "<div style='" + cardShell(900, cardH, 28) + " display:flex; align-items:center;'>" +
          "<div style='width:5px; height:" + thumb + "px; flex:none; border-radius:0 4px 4px 0; background:" + accent + ";'></div>" +
          "<div style='width:25px; flex:none;'></div>" +
          thumbTile(item, i, thumb, 20) +
          "<div style='width:28px; flex:none;'></div>" +
          "<div style='width:" + textW + "px; flex:none;'>" +
          "<div style='color:" + cream + '; font-size:' + title.size + "px; line-height:1.16; font-weight:700;'>" + esc(title.text) + '</div>' +
          (price ? "<div style='margin-top:12px; color:" + accent + '; font-size:' + priceSize + "px; font-weight:800;'>" + esc(price) + '</div>' : '') +
          '</div></div>',
      });
    });
    rowsBottom = startY + n * cardH + (n - 1) * gap;
  }
  const cartNoteY = Math.min(1700, Math.max(1580, rowsBottom + 130));
  s2.visuals.push({
    type: 'TEXT', x: 540, y: cartNoteY, width: 880, anchor: 'top-center', track: 9,
    enterBegin: round(0.9 + n * 0.28), enterEnd: round(1.35 + n * 0.28), enterAnimation: 'fade', exitEnd: s2Seconds,
    style: { fontFamily: uiFont, color: muted },
    html: "<div style='text-align:center; color:" + muted + "; font-size:29px; line-height:1.42; font-weight:500;'>" +
      esc(cartNote) + '</div>',
  });

  // ==== scene 3 - total + CTA =============================================
  const s3Seconds = 5.2;
  const totalSize = totalDisplay.length <= 7 ? 152 : totalDisplay.length <= 9 ? 132 : 112;
  const s3 = {
    id: 'cta',
    duration: s3Seconds,
    backgroundColor: bg,
    visuals: [
      {
        type: 'SVG', width: 1080, height: 1920, track: 0, enterBegin: 0, exitEnd: s3Seconds,
        svg: svgOpen +
          "<defs><radialGradient id='acvCtaGlow' cx='0.5' cy='0.42' r='0.85'>" +
          "<stop offset='0' stop-color='" + accent + "' stop-opacity='0.3'/>" +
          "<stop offset='0.55' stop-color='" + accent + "' stop-opacity='0.06'/>" +
          "<stop offset='1' stop-color='" + accent + "' stop-opacity='0'/></radialGradient></defs>" +
          "<rect width='1080' height='1920' fill='" + bg + "'/>" +
          "<rect width='1080' height='1920' fill='url(#acvCtaGlow)'/>" +
          "<rect x='48' y='48' width='984' height='1824' rx='40' fill='none' stroke='rgba(246,241,233,0.2)' stroke-width='1.5'/>" +
          "<circle cx='540' cy='700' r='300' fill='none' stroke='" + accent + "' stroke-opacity='0.3' stroke-width='2'/>" +
          "<circle cx='540' cy='700' r='332' fill='none' stroke='" + accent + "' stroke-opacity='0.12' stroke-width='1'/>" +
          "<path d='M120 1616 L120 1800 L304 1800' fill='none' stroke='" + accent + "' stroke-width='6' stroke-opacity='0.8'/>" +
          "<path d='M960 304 L960 120 L776 120' fill='none' stroke='" + accent + "' stroke-width='6' stroke-opacity='0.8'/>" +
          '</svg>',
      },
      {
        type: 'TEXT', x: 540, y: 128, anchor: 'top-center', track: 1,
        enterBegin: 0.15, enterEnd: 0.6, enterAnimation: 'fade', exitEnd: s3Seconds,
        style: { fontFamily: uiFont, color: cream },
        html: "<div style='display:inline-block; border:1.5px solid rgba(246,241,233,0.5); border-radius:999px; padding:15px 36px; color:" +
          cream + "; font-size:25px; font-weight:700; letter-spacing:6px;'>" + esc(brandName.toUpperCase()) + '</div>',
      },
    ],
  };
  // The total is optically centred inside the ring: the number grows upward
  // from a fixed baseline so the "3 items · saved for …" line never moves.
  const itemsLineY = 800;
  if (totalDisplay) {
    const totalY = itemsLineY - 34 - Math.round(totalSize * 1.02);
    s3.visuals.push({
      type: 'TEXT', x: 540, y: totalY - 60, anchor: 'top-center', track: 2,
      enterBegin: 0.4, enterEnd: 0.85, enterAnimation: 'fade', exitEnd: s3Seconds,
      style: { fontFamily: uiFont, color: muted },
      html: "<div style='text-align:center; color:" + muted + "; font-size:25px; font-weight:700; letter-spacing:6px;'>" +
        esc(totalLabel.toUpperCase()) + '</div>',
    });
    s3.visuals.push({
      type: 'TEXT', x: 540, y: totalY, width: 940, anchor: 'top-center', track: 3,
      enterBegin: 0.55, enterEnd: 1.0, enterAnimation: 'smoothup', exitEnd: s3Seconds,
      style: { fontFamily: headingFont, color: cream },
      html: "<div style='text-align:center; color:" + cream + '; font-size:' + totalSize +
        "px; line-height:1.02; font-weight:800; letter-spacing:-3px;'>" + esc(totalDisplay) + '</div>',
    });
  } else {
    s3.visuals.push({
      type: 'TEXT', x: 540, y: 590, width: 900, anchor: 'top-center', track: 3,
      enterBegin: 0.5, enterEnd: 0.95, enterAnimation: 'smoothup', exitEnd: s3Seconds,
      style: { fontFamily: headingFont, color: cream },
      html: "<div style='text-align:center; color:" + cream +
        "; font-size:82px; line-height:1.14; font-weight:800; letter-spacing:-2px;'>Your cart<br/>is waiting.</div>",
    });
  }
  s3.visuals.push({
    type: 'TEXT', x: 540, y: itemsLineY, width: 900, anchor: 'top-center', track: 4,
    enterBegin: 0.9, enterEnd: 1.3, enterAnimation: 'fade', exitEnd: s3Seconds,
    style: { fontFamily: uiFont, color: accentSoft },
    html: "<div style='text-align:center; color:" + accentSoft + "; font-size:30px; font-weight:600; letter-spacing:1px;'>" +
      n + (n === 1 ? ' item' : ' items') + ' · saved for ' + esc(firstName || 'you') + '</div>',
  });
  s3.visuals.push({
    type: 'TEXT', x: 540, y: 1010, anchor: 'top-center', track: 5,
    enterBegin: 1.15, enterEnd: 1.65, enterAnimation: 'circleopen', exitEnd: s3Seconds,
    // The pill paints ink-on-accent (the html below wins), but `style.color` is
    // what the contrast lint reads and it can only see the scene background -
    // so declare the accent, which is the ratio the pill really achieves.
    style: { fontFamily: headingFont, color: accent },
    html: "<div style='display:inline-block; background:" + accent + '; color:' + bg +
      "; border-radius:999px; padding:30px 66px; font-size:42px; font-weight:800;'>" + esc(ctaText) + ' →</div>',
  });
  s3.visuals.push({
    type: 'TEXT', x: 540, y: 1186, width: 840, anchor: 'top-center', track: 6,
    enterBegin: 1.5, enterEnd: 1.9, enterAnimation: 'fade', exitEnd: s3Seconds,
    style: { fontFamily: uiFont, color: muted },
    html: "<div style='text-align:center; color:" + muted + "; font-size:29px; line-height:1.42; font-weight:500;'>" +
      esc(ctaSubline) + '</div>',
  });
  s3.visuals.push({
    type: 'TEXT', x: 540, y: 1318, width: 900, anchor: 'top-center', track: 7,
    enterBegin: 1.7, enterEnd: 2.15, enterAnimation: 'smoothup', exitEnd: s3Seconds,
    style: { fontFamily: headingFont, color: cream },
    html: "<div style='width:900px; height:140px; display:flex; align-items:center; justify-content:center;'>" +
      items.map((item, i) => "<div style='width:" + (i ? 24 : 0) + "px; flex:none;'></div>" + thumbTile(item, i, 124, 20)).join('') +
      '</div>',
  });
  s3.visuals.push({
    type: 'TEXT', x: 540, y: 1520, anchor: 'top-center', track: 8,
    enterBegin: 1.95, enterEnd: 2.3, enterAnimation: 'fade', exitEnd: s3Seconds,
    style: { fontFamily: uiFont, color: muted },
    html: "<div style='text-align:center; color:" + muted + "; font-size:26px; font-weight:600; letter-spacing:4px;'>" +
      esc(storeUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toUpperCase()) + '</div>',
  });

  // ---- payload ------------------------------------------------------------
  const totalSeconds = round(s1Seconds + s2Seconds + s3Seconds - 2 * transitionSeconds);

  // The finished video sits on a public CDN, so the filename carries a first
  // name and a hash of the cart contents - never the email address.
  let hash = 0;
  const hashSeed = items.map((it) => it.title).join('|') + '|' + (data.cartRef || '') + '|' + (totalDisplay || '');
  for (let i = 0; i < hashSeed.length; i += 1) hash = (hash * 31 + hashSeed.charCodeAt(i)) % 2821109907456;
  const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const safeName = ('cart-' + (slug(firstName) || 'customer') + '-' + hash.toString(36)).slice(0, 60);

  const payload = {
    name: safeName,
    resolution: clean(cfg.resolution) || 'instagram-reel',
    frameRate: Number(cfg.frameRate || 30),
    backgroundColor: bg,
    outputFormat: 'mp4',
    scenes: [s1, s2, s3],
  };
  // NOTE: no `track` on audios - the render API rejects audios[].track.
  if (data.music && data.music.src) {
    payload.audios = [{ src: data.music.src, volume: Number(cfg.musicVolume ?? 0.16) }];
  }

  return {
    payload,
    meta: {
      firstName: firstName || null,
      itemCount: n,
      itemTitles: items.map((it) => it.title),
      itemsWithImages: items.filter((it) => it.imageUrl).length,
      heroImage: heroImage || null,
      totalDisplay: totalDisplay || null,
      totalNumber: totalNumber,
      layout: n === 1 ? 'single-hero-card' : n === 2 ? 'two-tall-rows' : 'three-rows',
      s1Seconds, s2Seconds, s3Seconds, transitionSeconds, totalSeconds,
      musicUsed: Boolean(data.music && data.music.src),
      musicNote: data.musicNote || null,
      checkoutUrl: data.checkoutUrl || null,
      projectName: safeName,
    },
  };
}
