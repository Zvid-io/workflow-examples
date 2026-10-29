// === buildProject — identical to the frame-reviewed standalone builder ===
// Proposal recap video: 1920x1080, four scenes on warm paper.
//   1 cover    "Your proposal, <name>." + deal name + sender/client pair card
//   2 scope    up to three check-rowed cards, one per scope line
//   3 numbers  the formatted amount + timeline + validity cards
//   4 cta      "Questions? Grab 15 minutes." + booking pill + sign-off
// No stock footage: the whole design is type, SVG and CSS cards, so the only
// external asset is the (guarded) music bed and an optional sender logo.
function buildProject(config, deal, probe) {
  const cfg = config || {};
  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  // Every string that reaches the screen goes through `clip`, never a raw
  // slice: a value longer than the layout can carry drops whole words and gains
  // a real ellipsis, so a shortened legal entity name is never printed as if it
  // were the whole name. Each clip is recorded in `meta.truncated`, so an
  // operator sending 200 personalised proposals can audit the three that were
  // shortened instead of never finding out.
  const truncated = [];
  const clip = (v, max, field) => {
    const s = clean(v);
    if (!max || s.length <= max) return s;
    const cut = s.slice(0, max - 1);
    const sp = cut.lastIndexOf(' ');
    const head = (sp >= Math.floor(max * 0.6) ? cut.slice(0, sp) : cut)
      .replace(/[\s,;:.–—-]+$/, '');
    if (field) truncated.push({ field: field, chars: s.length, kept: head.length });
    return head + '…';
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round = (n) => Math.round(n * 100) / 100;

  // ---- palette ------------------------------------------------------------
  const hex6 = (v, fallback) => {
    const s = clean(v).replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s.toUpperCase();
    if (/^[0-9a-fA-F]{3}$/.test(s)) return '#' + s.split('').map((c) => c + c).join('').toUpperCase();
    return fallback;
  };
  const rgba = (hexColor, alpha) => {
    const h = hexColor.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  };
  // Relative luminance (WCAG) so a light brand accent still gets readable text
  // on the CTA pill instead of white-on-yellow.
  const luminance = (hexColor) => {
    const h = hexColor.replace('#', '');
    const ch = [0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const contrast = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const shade = (hexColor, f) => {
    const h = hexColor.replace('#', '');
    const parts = [0, 2, 4].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * f))));
    return '#' + parts.map((v) => ('0' + v.toString(16)).slice(-2)).join('').toUpperCase();
  };
  const tint = (hexColor, f) => {
    const h = hexColor.replace('#', '');
    const parts = [0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16);
      return Math.max(0, Math.min(255, Math.round(c + (255 - c) * f)));
    });
    return '#' + parts.map((v) => ('0' + v.toString(16)).slice(-2)).join('').toUpperCase();
  };

  let ink = hex6(cfg.brandColor, '#12161C');
  const accent = hex6(cfg.accentColor, '#1B4DE4');
  let muted = hex6(cfg.mutedColor, '#6E6A61');
  const positive = hex6(cfg.positiveColor, '#1C7A52');
  // The whole design is ink on LIGHT paper: white cards, dark type, and the
  // `accentText` and `muted` searches below that can only DARKEN. A dark
  // `paperColor` breaks all three at once, so the paper must clear 7:1 against
  // the ink and 4.5:1 against the design's reference secondary tone. A paper
  // that fails is lifted toward white a step at a time, keeping its hue; one
  // that still cannot get there is replaced by the shipped paper. Every branch
  // here only substitutes a colour — nothing throws, so a bad knob can never
  // fail a render that would otherwise succeed.
  const SECONDARY_REF = '#6E6A61';
  const paperCarries = (p) => contrast(ink, p) >= 7 && contrast(SECONDARY_REF, p) >= 4.5;
  let paper = hex6(cfg.paperColor, '#F4F1EA');
  let paperAdjusted = null;
  let inkAdjusted = null;
  let mutedAdjusted = null;
  if (!paperCarries(paper)) {
    const wanted = paper;
    for (let f = 1; f <= 9; f += 1) {
      paper = tint(wanted, f / 10);
      if (paperCarries(paper)) break;
    }
    if (!paperCarries(paper)) paper = '#F4F1EA';
    paperAdjusted = wanted + ' -> ' + paper;
  }
  // A brandColor too light to be ink hands the job back to the shipped ink.
  if (contrast(ink, paper) < 7) {
    inkAdjusted = ink + ' -> #12161C';
    ink = '#12161C';
  }
  // Secondary type is fitted to whatever paper won, the same way the accent is.
  if (contrast(muted, paper) < 4.5) {
    const wanted = muted;
    for (let f = 10; f >= 2; f -= 1) {
      muted = shade(wanted, f / 10);
      if (contrast(muted, paper) >= 4.5) break;
    }
    mutedAdjusted = wanted + ' -> ' + muted;
  }
  const onAccent = luminance(accent) > 0.45 ? ink : '#FFFFFF';
  // A pale brand accent (amber, mint, sky) is fine as a FILL but unreadable as
  // small text on paper. `accentText` darkens it until it clears 4.5:1, so the
  // kickers and rules stay legible whatever the brand colour is. The paper guard
  // above is what makes a darken-only search the right search.
  let accentText = accent;
  for (let f = 10; f >= 2; f -= 1) {
    accentText = shade(accent, f / 10);
    if (contrast(accentText, paper) >= 4.5) break;
  }
  const hairline = rgba(ink, 0.1);
  const cardShadow = '0 14px 34px ' + rgba(ink, 0.07);
  const cardBg = '#FFFFFF';

  const uiFont = clean(cfg.font) || 'Manrope';
  const displayFont = clean(cfg.displayFont) || 'Playfair Display';

  // ---- deal fields --------------------------------------------------------
  // The caps are the width the layout actually supports, measured from the
  // rendered frames, not round numbers: 120 characters is two lines of the
  // 32 px deal block, 80 is two lines of the 34 px pair-card name. Anything
  // longer is elided with a visible ellipsis rather than cut mid-word.
  const d = deal || {};
  const dealName = clip(d.dealName, 120, 'dealName');
  const company = clip(d.company, 80, 'company');
  const contactFirstName = clip(d.contactFirstName, 48, 'contactFirstName');
  if (!dealName) throw new Error('The deal has no dealName. Fill the DealName column (or post a dealName field to the webhook).');
  if (!company) throw new Error('The deal has no company. Fill the Company column (or post a company field to the webhook).');

  const scope = (Array.isArray(d.scope) ? d.scope : [])
    .map((s, i) => clip(s, 120, 'scopeLine' + (i + 1)))
    .filter(Boolean)
    .slice(0, 3);

  // ---- money: formatted, never computed (no FX, no rounding of your figure)
  const SYMBOLS = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹',
    CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', SGD: 'S$', HKD: 'HK$', BRL: 'R$', MXN: 'MX$',
    ZAR: 'R', NGN: '₦', KRW: '₩', RUB: '₽', TRY: '₺', ILS: '₪',
    PHP: '₱', THB: '฿', VND: '₫', UAH: '₴',
  };
  const currency = (clean(d.currency) || clean(cfg.defaultCurrency) || 'USD').toUpperCase().slice(0, 6);
  const formatAmount = (raw) => {
    const text = clean(raw);
    if (!text) return '';
    // Keep digits and separators only, then work out which separator is decimal.
    const kept = text.replace(/[^0-9.,]/g, '');
    if (!kept) return '';
    const m = kept.match(/[.,](\d{2})$/);
    const decimals = m ? m[1] : '';
    const whole = (m ? kept.slice(0, kept.length - 3) : kept).replace(/[.,]/g, '');
    if (!whole) return '';
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const body = decimals ? grouped + '.' + decimals : grouped;
    const sym = SYMBOLS[currency];
    return sym ? sym + body : currency + ' ' + body;
  };
  const amountText = formatAmount(d.amount);
  if (!amountText) throw new Error('The deal has no readable Amount (got "' + clean(d.amount) + '"). Use plain digits, e.g. 12400 or 148500.00.');

  // ---- timeline + validity (both optional; the cards adapt) ---------------
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const prettyDate = (raw) => {
    const text = clip(raw, 40, 'validUntil');
    if (!text) return '';
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!iso) return text; // written the way you want it on screen
    const mo = Number(iso[2]);
    if (mo < 1 || mo > 12) return text;
    return Number(iso[3]) + ' ' + MONTHS[mo - 1] + ' ' + iso[1];
  };
  const timelineRaw = clip(d.timelineWeeks, 30, 'timelineWeeks');
  const timelineText = timelineRaw
    ? (/^\d+$/.test(timelineRaw) ? timelineRaw + '-week delivery' : timelineRaw)
    : '';
  const validUntilText = prettyDate(d.validUntil);

  // ---- copy from Config, with {tokens} ------------------------------------
  const tidy = (s) => String(s).replace(/,\s*([.!?])/g, '$1').replace(/\s{2,}/g, ' ').replace(/\s+([.!?,])/g, '$1').trim();
  const fill = (tpl, fallback) => tidy(String(clean(tpl) || fallback)
    .replace(/\{firstName\}/g, contactFirstName)
    .replace(/\{company\}/g, company)
    .replace(/\{dealName\}/g, dealName)
    .replace(/\{senderCompany\}/g, clean(cfg.senderCompany)));

  const greeting = fill(cfg.greetingTemplate, 'Your proposal, {firstName}.');
  const scopeTitle = clip(cfg.scopeTitle, 40) || 'Scope of work';
  // Never print the same words twice: if the title already says "what's
  // included", the kicker above it says "scope of work" instead.
  const scopeKicker = scopeTitle.toUpperCase() === "WHAT'S INCLUDED" ? 'SCOPE OF WORK' : "WHAT'S INCLUDED";
  const amountLabel = (clip(cfg.amountLabel, 30) || 'Total investment').toUpperCase();
  const ctaHeadline = fill(cfg.ctaHeadline, 'Questions? Grab 15 minutes.');
  const ctaText = clip(cfg.ctaText, 32) || 'Book a call';
  const senderName = clip(cfg.senderName, 48) || 'Your name';
  const senderTitle = clip(cfg.senderTitle, 48);
  const senderCompany = clip(cfg.senderCompany, 48) || 'Your company';
  const senderLogoUrl = clean(cfg.senderLogoUrl).slice(0, 500); // never printed
  const usesLogo = /^https:\/\//i.test(senderLogoUrl);

  // meetingUrl is shown as its bare domain + path — never a raw https:// blob.
  const meetingRaw = clean(cfg.meetingUrl).slice(0, 160);
  const meetingLabel = clip(meetingRaw.replace(/^https?:\/\//i, '').replace(/\/+$/, ''), 54);

  const initial = (s) => {
    const ch = String(s || '').trim().charAt(0).toUpperCase();
    return /[A-Z0-9]/.test(ch) ? ch : (String(s || '').trim().charAt(0) || '•');
  };

  // ---- shared layout helpers ---------------------------------------------
  // Greedy word-wrap estimate. avgEm is calibrated per family: Manrope runs
  // ~0.55 em average, Playfair Display ~0.48 em.
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
  const pickSize = (text, sizes, boxPx, avgEm, maxLines) => {
    for (const s of sizes) {
      if (wrapLines(text, s, boxPx, avgEm) <= maxLines) return s;
    }
    return sizes[sizes.length - 1];
  };

  const MARGIN = 140;
  const COL = 1920 - MARGIN * 2; // 1640
  const svgOpen = "<svg width='1920' height='1080' viewBox='0 0 1920 1080' xmlns='http://www.w3.org/2000/svg'>";
  const paperBase = (id) => "<rect width='1920' height='1080' fill='" + paper + "'/>"
    + "<defs><linearGradient id='" + id + "' x1='0' y1='0' x2='0.85' y2='1'>"
    + "<stop offset='0' stop-color='#FFFFFF' stop-opacity='0.7'/>"
    + "<stop offset='1' stop-color='#FFFFFF' stop-opacity='0'/></linearGradient></defs>"
    + "<rect width='1920' height='1080' fill='url(#" + id + ")'/>";
  const accentRule = (x, y) => "<rect x='" + x + "' y='" + y + "' width='64' height='6' rx='3' fill='" + accentText + "'/>";
  const kickerHtml = (text) => "<div style='color:" + accentText + "; font-size:26px; font-weight:800; letter-spacing:6px;'>" + esc(text) + '</div>';
  // The footer carries both names on ONE 22 px line inside the 1640 px column.
  // Measured off the rendered frames at ~12.4 px per character that column holds
  // about 130, so the pair is composed against a 120-character budget: the
  // company (a legal entity) is kept whole and the deal name gives up the room.
  const FOOTER_BUDGET = 120;
  let footerDeal = dealName;
  let footerCompany = company;
  if (footerDeal.length + footerCompany.length + 3 > FOOTER_BUDGET) {
    footerDeal = clip(dealName, Math.max(30, FOOTER_BUDGET - footerCompany.length - 3));
  }
  if (footerDeal.length + footerCompany.length + 3 > FOOTER_BUDGET) {
    footerCompany = clip(company, Math.max(26, FOOTER_BUDGET - footerDeal.length - 3));
  }
  const footerClipped = footerDeal !== dealName || footerCompany !== company;
  // `withCompany: false` is used on the numbers scene when that scene already
  // names the client on screen — the same words are never printed twice.
  const footerHtml = (withCompany) => "<div style='color:" + muted + "; font-size:22px; font-weight:600; letter-spacing:2px;'>"
    + esc(footerDeal)
    + (withCompany === false ? '' : " <span style='color:" + rgba(ink, 0.45) + ";'>&nbsp;&#183;&nbsp;</span> " + esc(footerCompany))
    + '</div>';
  const uiStyle = (extra) => Object.assign({ fontFamily: uiFont, color: ink }, extra || {});
  const cardStyle = (extra) => Object.assign({
    fontFamily: uiFont,
    color: ink,
    backgroundColor: cardBg,
    borderRadius: '22px',
    border: '1px solid ' + hairline,
    boxShadow: cardShadow,
    display: 'flex',
    alignItems: 'center',
  }, extra || {});

  const transition = clean(cfg.sceneTransition) || 'fade';
  const tDur = Math.min(1.2, Math.max(0.2, Number(cfg.transitionSeconds) > 0 ? Number(cfg.transitionSeconds) : 0.55));
  // Nothing in scenes 2-4 starts animating until the incoming crossfade has
  // finished. Each scene's kicker and headline sit at the same coordinates as
  // the outgoing scene's, so overlapping their fades superimposed two different
  // strings into illegible letter-soup for the whole length of every cut. Held
  // back by exactly the transition length, the incoming copy fades up onto an
  // already-settled ground — no change to the transition, the geometry, the
  // scene durations or the credit cost.
  const inDelay = round(tDur);

  // ==== scene 1 — cover ====================================================
  const s1Base = 5.6;
  const s1 = round(s1Base + tDur);

  // The greeting sets as large as it can while leaving room for the deal block
  // above the pair card, so a 26-character first name never pushes into it.
  const greetSize = pickSize(greeting, [96, 84, 74, 64], COL - 580, 0.48, 2);
  const greetLines = wrapLines(greeting, greetSize, COL - 580, 0.48);
  const greetY = 336;
  const greetEnd = greetY + Math.round(greetLines * greetSize * 1.08);

  const dealSize = pickSize(dealName, [42, 36, 32], COL - 580, 0.55, 2);
  const dealLines = wrapLines(dealName, dealSize, COL - 580, 0.55);
  const dealY = greetEnd + 48;
  const dealEnd = dealY + 34 + Math.round(dealLines * dealSize * 1.25);

  const pairH = 184;
  const pairY = Math.max(792, dealEnd + 48);
  const chipX = MARGIN + 44;
  const chipSize = 72;
  const chipY = pairY + Math.round((pairH - chipSize) / 2);

  const monoChip = (letter, bg, fg) => "<span style='flex:0 0 auto; display:inline-block; width:" + chipSize + 'px; height:' + chipSize
    + "px; border-radius:20px; background:" + bg + '; color:' + fg + "; font-size:32px; font-weight:800; text-align:center; line-height:"
    + chipSize + "px;'>" + esc(letter) + '</span>';
  const pairSide = (label, name, chip, edge) => "<div style='flex:0 1 auto; display:flex; align-items:center; " + edge + "'>" + chip
    + "<div style='margin-left:26px;'>"
    + "<div style='color:" + muted + "; font-size:20px; font-weight:800; letter-spacing:4px;'>" + esc(label) + '</div>'
    + "<div style='margin-top:8px; color:" + ink + "; font-size:34px; font-weight:700;'>" + esc(name) + '</div>'
    + '</div></div>';

  const senderChip = usesLogo
    ? "<span style='flex:0 0 auto; display:inline-block; width:" + chipSize + 'px; height:' + chipSize + "px;'></span>"
    : monoChip(initial(senderCompany), accent, onAccent);
  const clientChip = monoChip(initial(company), rgba(ink, 0.07), ink);

  const s1Svg = svgOpen + paperBase('prCover')
    // a proposal page, sitting quietly to the right of the greeting
    + "<g><rect x='1288' y='214' width='452' height='566' rx='22' fill='#FFFFFF' opacity='0.85' stroke='" + rgba(ink, 0.09) + "' stroke-width='1.5'/>"
    + "<rect x='1332' y='268' width='168' height='12' rx='6' fill='" + accentText + "' opacity='0.9'/>"
    + "<rect x='1332' y='320' width='364' height='10' rx='5' fill='" + rgba(ink, 0.13) + "'/>"
    + "<rect x='1332' y='352' width='320' height='10' rx='5' fill='" + rgba(ink, 0.1) + "'/>"
    + "<rect x='1332' y='384' width='352' height='10' rx='5' fill='" + rgba(ink, 0.1) + "'/>"
    + "<rect x='1332' y='440' width='364' height='10' rx='5' fill='" + rgba(ink, 0.08) + "'/>"
    + "<rect x='1332' y='472' width='286' height='10' rx='5' fill='" + rgba(ink, 0.08) + "'/>"
    + "<rect x='1332' y='528' width='364' height='10' rx='5' fill='" + rgba(ink, 0.06) + "'/>"
    + "<rect x='1332' y='560' width='330' height='10' rx='5' fill='" + rgba(ink, 0.06) + "'/>"
    + "<rect x='1332' y='648' width='168' height='42' rx='21' fill='" + rgba(accent, 0.12) + "'/>"
    + '</g>'
    + accentRule(MARGIN, 250)
    + '</svg>';

  const s1Visuals = [
    { type: 'SVG', width: 1920, height: 1080, track: 0, enterBegin: 0, exitEnd: s1, svg: s1Svg },
    {
      type: 'TEXT', x: MARGIN, y: 298, width: COL - 580, anchor: 'top-left', track: 1,
      enterBegin: 0.2, enterEnd: 0.6, enterAnimation: 'fade', exitEnd: s1,
      style: uiStyle({ color: accentText }), html: kickerHtml('PROPOSAL RECAP'),
    },
    {
      type: 'TEXT', x: MARGIN, y: greetY, width: COL - 580, anchor: 'top-left', track: 2,
      enterBegin: 0.35, enterEnd: 0.9, enterAnimation: 'smoothup', exitEnd: s1,
      style: { fontFamily: displayFont, color: ink },
      html: "<div style='color:" + ink + '; font-size:' + greetSize + "px; line-height:1.08; font-weight:700; letter-spacing:-1px;'>" + esc(greeting) + '</div>',
    },
    {
      type: 'TEXT', x: MARGIN, y: dealY, width: COL - 580, anchor: 'top-left', track: 3,
      enterBegin: 0.75, enterEnd: 1.2, enterAnimation: 'fade', exitEnd: s1,
      style: uiStyle(),
      html: "<div style='color:" + muted + "; font-size:20px; font-weight:800; letter-spacing:5px;'>THE PROPOSAL</div>"
        + "<div style='margin-top:14px; color:" + ink + '; font-size:' + dealSize + "px; line-height:1.25; font-weight:600;'>" + esc(dealName) + '</div>',
    },
    {
      type: 'TEXT', x: MARGIN, y: pairY, width: COL, height: pairH, anchor: 'top-left', track: 4,
      enterBegin: 1.15, enterEnd: 1.65, enterAnimation: 'smoothup', exitEnd: s1,
      style: cardStyle(),
      html: "<div style='display:flex; align-items:center; justify-content:space-between; width:100%;'>"
        + pairSide('FROM', senderCompany, senderChip, 'margin-left:44px;')
        + "<span style='flex:0 0 auto; color:" + rgba(ink, 0.3) + "; font-size:34px; margin-left:32px; margin-right:32px;'>&#8594;</span>"
        + pairSide('PREPARED FOR', company, clientChip, 'margin-right:44px;')
        + '</div>',
    },
  ];
  if (usesLogo) {
    s1Visuals.push({
      // NOTE: no `resize` — on an IMAGE it recomputes width/height from the
      // CANVAS, which blows a 72 px logo up to full-frame. The renderer already
      // object-fit: cover's the source into width x height.
      type: 'IMAGE', src: senderLogoUrl, x: chipX, y: chipY, width: chipSize, height: chipSize,
      anchor: 'top-left', radius: { tl: 20, tr: 20, bl: 20, br: 20 }, track: 5,
      enterBegin: 1.3, enterEnd: 1.75, enterAnimation: 'fade', exitEnd: s1,
    });
  }

  // ==== scene 2 — scope ====================================================
  // Only rendered when the deal actually carries scope lines.
  const scopeBase = 3.4 + scope.length * 1.4;
  const s2 = round(scopeBase + tDur);
  const cardsTop = 466;
  const cardsBottom = 930;
  const rowTextBox = COL - 44 - 62 - 30 - 24 - 60 - 44; // card minus chip, index and margins
  let rowFont = 36;
  let rowGap = 26;
  let rowHeights = [];
  // Step the row type down until three cards genuinely fit between the title
  // and the footer rule — a 120-character scope line lands here, not off-canvas.
  for (const [f, g] of [[36, 26], [32, 22], [28, 18], [24, 14]]) {
    const heights = scope.map((s) => Math.max(120, Math.round(wrapLines(s, f, rowTextBox, 0.55) * f * 1.45) + 64));
    const total = heights.reduce((a, b) => a + b, 0) + g * Math.max(0, scope.length - 1);
    rowFont = f; rowGap = g; rowHeights = heights;
    if (total <= cardsBottom - cardsTop) break;
  }
  const rowsTotal = rowHeights.reduce((a, b) => a + b, 0) + rowGap * Math.max(0, scope.length - 1);
  const rowsStart = Math.round(cardsTop + Math.max(0, (cardsBottom - cardsTop - rowsTotal) / 2));

  const s2Svg = svgOpen + paperBase('prScope')
    + accentRule(MARGIN, 250)
    + "<rect x='" + MARGIN + "' y='958' width='" + COL + "' height='1.5' fill='" + rgba(ink, 0.12) + "'/>"
    + '</svg>';

  const s2Visuals = [
    { type: 'SVG', width: 1920, height: 1080, track: 0, enterBegin: 0, exitEnd: s2, svg: s2Svg },
    {
      type: 'TEXT', x: MARGIN, y: 298, width: COL, anchor: 'top-left', track: 1,
      enterBegin: round(inDelay + 0.15), enterEnd: round(inDelay + 0.55), enterAnimation: 'fade', exitEnd: s2,
      style: uiStyle({ color: accentText }), html: kickerHtml(scopeKicker),
    },
    {
      type: 'TEXT', x: MARGIN, y: 348, width: COL, anchor: 'top-left', track: 2,
      enterBegin: round(inDelay + 0.25), enterEnd: round(inDelay + 0.7), enterAnimation: 'smoothup', exitEnd: s2,
      style: { fontFamily: displayFont, color: ink },
      html: "<div style='color:" + ink + "; font-size:72px; line-height:1.05; font-weight:700; letter-spacing:-1px;'>" + esc(scopeTitle) + '</div>',
    },
  ];
  let rowY = rowsStart;
  scope.forEach((line, i) => {
    s2Visuals.push({
      type: 'TEXT', x: MARGIN, y: rowY, width: COL, height: rowHeights[i], anchor: 'top-left', track: 3 + i,
      enterBegin: round(inDelay + 0.5 + i * 0.45), enterEnd: round(inDelay + 0.95 + i * 0.45), enterAnimation: 'smoothleft', exitEnd: s2,
      style: cardStyle(),
      html: "<div style='display:flex; align-items:center; width:100%;'>"
        + "<span style='flex:0 0 auto; display:inline-block; width:62px; height:62px; border-radius:999px; background:" + rgba(positive, 0.12)
        + '; color:' + positive + "; font-size:30px; font-weight:800; text-align:center; line-height:62px; margin-left:44px; margin-right:30px;'>&#10003;</span>"
        + "<span style='flex:1 1 auto; color:" + ink + '; font-size:' + rowFont + "px; font-weight:600; line-height:1.45;'>" + esc(line) + '</span>'
        // 0.55 alpha, not 0.28: at 22 px on a white card the lighter value read
        // at ~1.9:1 and was effectively dead ink. This clears 4:1 and still sits
        // back from the row copy.
        + "<span style='flex:0 0 auto; color:" + rgba(ink, 0.55) + "; font-size:22px; font-weight:800; letter-spacing:3px; margin-left:24px; margin-right:44px;'>"
        + ('0' + (i + 1)) + '</span>'
        + '</div>',
    });
    rowY += rowHeights[i] + rowGap;
  });
  s2Visuals.push({
    type: 'TEXT', x: MARGIN, y: 986, width: COL, anchor: 'top-left', track: 12,
    enterBegin: round(inDelay + 0.9), enterEnd: round(inDelay + 1.3), enterAnimation: 'fade', exitEnd: s2,
    style: uiStyle({ color: muted }), html: footerHtml(true),
  });

  // ==== scene 3 — the numbers =============================================
  const s3Base = 6;
  const s3 = round(s3Base + tDur);
  const statCards = [];
  if (timelineText) statCards.push({ label: 'TIMELINE', value: timelineText });
  if (validUntilText) statCards.push({ label: 'VALID UNTIL', value: validUntilText });
  // A deal with neither a timeline nor an expiry would leave the lower half of
  // this scene empty. Rather than a hole, the client takes the card — the row
  // always carries at least one fact, and the scene keeps its composition.
  const asideAllowed = statCards.length > 0;
  if (!statCards.length) statCards.push({ label: 'PREPARED FOR', value: company });

  const amountSize = pickSize(amountText, [176, 148, 124, 104], COL, 0.6, 1);
  const amountY = 348;
  // The right-hand "prepared for" block only appears when the amount cannot
  // reach it, so a long figure is never crowded — and never when the fallback
  // card below already names the client.
  const amountWidth = Math.round(amountText.length * amountSize * 0.6);
  const showAside = asideAllowed && amountWidth < 980;

  const s3Svg = svgOpen + paperBase('prNumbers')
    + accentRule(MARGIN, 250)
    + "<rect x='" + MARGIN + "' y='596' width='" + COL + "' height='1.5' fill='" + rgba(ink, 0.12) + "'/>"
    + "<rect x='" + MARGIN + "' y='958' width='" + COL + "' height='1.5' fill='" + rgba(ink, 0.12) + "'/>"
    + '</svg>';

  const s3Visuals = [
    { type: 'SVG', width: 1920, height: 1080, track: 0, enterBegin: 0, exitEnd: s3, svg: s3Svg },
    {
      type: 'TEXT', x: MARGIN, y: 298, width: COL, anchor: 'top-left', track: 1,
      enterBegin: round(inDelay + 0.15), enterEnd: round(inDelay + 0.55), enterAnimation: 'fade', exitEnd: s3,
      style: uiStyle({ color: accentText }), html: kickerHtml(amountLabel),
    },
    {
      type: 'TEXT', x: MARGIN, y: amountY, width: COL, anchor: 'top-left', track: 2,
      enterBegin: round(inDelay + 0.3), enterEnd: round(inDelay + 0.85), enterAnimation: 'smoothup', exitEnd: s3,
      style: uiStyle(),
      html: "<div style='color:" + ink + '; font-size:' + amountSize + "px; line-height:1.06; font-weight:800; letter-spacing:-4px;'>" + esc(amountText) + '</div>',
    },
  ];
  if (showAside) {
    s3Visuals.push({
      type: 'TEXT', x: 1780, y: amountY + 14, width: 620, anchor: 'top-right', track: 6,
      enterBegin: round(inDelay + 0.6), enterEnd: round(inDelay + 1), enterAnimation: 'fade', exitEnd: s3,
      style: uiStyle({ textAlign: 'right' }),
      html: "<div style='text-align:right; color:" + muted + "; font-size:20px; font-weight:800; letter-spacing:4px;'>PREPARED FOR</div>"
        + "<div style='margin-top:12px; text-align:right; color:" + ink + "; font-size:34px; font-weight:700; line-height:1.25;'>" + esc(company) + '</div>',
    });
  }
  // Two cards straddle the column at 800 px each. A SINGLE card spans the whole
  // column instead of sitting in the left quarter: the rules above and below it
  // are 1640 px wide, so a 800 px island under them read as an unfinished slide
  // rather than as deliberate white space. Wide mode also switches the card to a
  // label-left / value-right bar so the width is actually used.
  const wideStat = statCards.length === 1;
  const statW = wideStat ? COL : 800;
  const statH = 226;
  const statY = 668;
  statCards.forEach((c, i) => {
    const x = i === 0 ? MARGIN : 1920 - MARGIN - statW;
    const valueSize = wideStat
      ? pickSize(c.value, [56, 48, 40, 34], statW - 88 - 420, 0.55, 2)
      : pickSize(c.value, [48, 40, 34], statW - 88, 0.55, 2);
    s3Visuals.push({
      type: 'TEXT', x, y: statY, width: statW, height: statH, anchor: 'top-left', track: 3 + i,
      enterBegin: round(inDelay + 0.95 + i * 0.35), enterEnd: round(inDelay + 1.4 + i * 0.35), enterAnimation: 'smoothup', exitEnd: s3,
      style: cardStyle(),
      html: wideStat
        ? "<div style='display:flex; align-items:center; justify-content:space-between; width:100%;'>"
          + "<div style='flex:0 0 auto; margin-left:44px; margin-right:40px; color:" + muted + "; font-size:21px; font-weight:800; letter-spacing:5px;'>" + esc(c.label) + '</div>'
          + "<div style='flex:0 1 auto; margin-right:44px; text-align:right; color:" + ink + '; font-size:' + valueSize + "px; line-height:1.2; font-weight:700;'>" + esc(c.value) + '</div>'
          + '</div>'
        : "<div style='margin-left:44px; margin-right:44px;'>"
          + "<div style='color:" + muted + "; font-size:21px; font-weight:800; letter-spacing:5px;'>" + esc(c.label) + '</div>'
          + "<div style='margin-top:16px; color:" + ink + '; font-size:' + valueSize + "px; line-height:1.2; font-weight:700;'>" + esc(c.value) + '</div>'
          + '</div>',
    });
  });
  // This scene already names the client whenever the aside or the PREPARED FOR
  // fallback card is on screen, so the footer drops the company and carries the
  // deal name alone — the same words are never printed twice on one screen.
  const s3NamesClient = showAside || !asideAllowed;
  s3Visuals.push({
    type: 'TEXT', x: MARGIN, y: 986, width: COL, anchor: 'top-left', track: 12,
    enterBegin: round(inDelay + 1.5), enterEnd: round(inDelay + 1.9), enterAnimation: 'fade', exitEnd: s3,
    style: uiStyle({ color: muted }), html: footerHtml(!s3NamesClient),
  });

  // ==== scene 4 — next step ===============================================
  const s4 = 5.6;
  // The sign-off sits on a fixed baseline, so the headline block is capped at
  // 142 px: one big line, or two smaller ones — never a stack that drifts into
  // the sign-off no matter how long ctaHeadline gets.
  const ctaHeadY = 352;
  const ctaBudget = 142;
  const CTA_BOX = 1560;
  let ctaSize = 46;
  for (const s of [84, 72, 62, 54, 46]) {
    if (wrapLines(ctaHeadline, s, CTA_BOX, 0.48) * s * 1.1 <= ctaBudget) { ctaSize = s; break; }
  }
  const ctaLines = wrapLines(ctaHeadline, ctaSize, CTA_BOX, 0.48);
  const ctaHeadEnd = ctaHeadY + Math.round(ctaLines * ctaSize * 1.1);
  const pillH = 100;
  const pillW = Math.min(1200, Math.max(360, Math.round(ctaText.length * 22) + 150));
  const pillY = ctaHeadEnd + 74;
  const domainY = pillY + pillH + 36;
  const signChipY = 812;
  const signTextY = 916;

  // No accent wash behind the closing scene: a wide radial gradient bands
  // visibly at 8-bit on a flat paper background. The paper stays identical to
  // the other three scenes and the pill carries the colour.
  // Scenes 1-3 all carry their accent rule at x=140, so it lands on itself
  // across those cuts and the crossfade never shows it twice. Scene 4's rule is
  // centred, so leaving it in the backdrop SVG (which cannot be delayed — it IS
  // the ground) put two dashes on screen at once for the length of the last cut.
  // It rides the delayed kicker instead, and fades up with it.
  const s4Svg = svgOpen + paperBase('prCta')
    + "<rect x='660' y='766' width='600' height='1.5' fill='" + rgba(ink, 0.12) + "'/>"
    + '</svg>';

  const signChip = usesLogo
    ? ''
    : "<div style='display:inline-block; width:76px; height:76px; border-radius:22px; background:" + accent + '; color:' + onAccent
      + "; font-size:34px; font-weight:800; text-align:center; line-height:76px;'>" + esc(initial(senderCompany)) + '</div>';

  const s4Visuals = [
    { type: 'SVG', width: 1920, height: 1080, track: 0, enterBegin: 0, exitEnd: s4, svg: s4Svg },
    {
      type: 'TEXT', x: 960, y: 250, width: CTA_BOX, anchor: 'top-center', track: 1,
      enterBegin: round(inDelay + 0.15), enterEnd: round(inDelay + 0.55), enterAnimation: 'fade', exitEnd: s4,
      style: uiStyle({ color: accentText, textAlign: 'center' }),
      html: "<div style='text-align:center;'>"
        + "<div style='display:inline-block; width:64px; height:6px; border-radius:3px; background:" + accentText + "; margin-bottom:42px;'></div>"
        + "<div style='text-align:center; color:" + accentText + "; font-size:26px; font-weight:800; letter-spacing:6px;'>NEXT STEP</div>"
        + '</div>',
    },
    {
      type: 'TEXT', x: 960, y: ctaHeadY, width: CTA_BOX, anchor: 'top-center', track: 2,
      enterBegin: round(inDelay + 0.3), enterEnd: round(inDelay + 0.85), enterAnimation: 'smoothup', exitEnd: s4,
      style: { fontFamily: displayFont, color: ink, textAlign: 'center' },
      html: "<div style='text-align:center; color:" + ink + '; font-size:' + ctaSize + "px; line-height:1.1; font-weight:700; letter-spacing:-1px;'>" + esc(ctaHeadline) + '</div>',
    },
    {
      type: 'TEXT', x: 960, y: pillY, width: pillW, height: pillH, anchor: 'top-center', track: 3,
      enterBegin: round(inDelay + 0.85), enterEnd: round(inDelay + 1.3), enterAnimation: 'circleopen', exitEnd: s4,
      style: {
        fontFamily: uiFont, color: onAccent, backgroundColor: accent, borderRadius: '999px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      },
      html: "<div style='text-align:center; color:" + onAccent + "; font-size:34px; font-weight:700; letter-spacing:0.5px;'>" + esc(ctaText) + ' &#8594;</div>',
    },
  ];
  if (meetingLabel) {
    s4Visuals.push({
      type: 'TEXT', x: 960, y: domainY, width: 1200, anchor: 'top-center', track: 4,
      enterBegin: round(inDelay + 1.15), enterEnd: round(inDelay + 1.5), enterAnimation: 'fade', exitEnd: s4,
      style: uiStyle({ color: muted, textAlign: 'center' }),
      html: "<div style='text-align:center; color:" + muted + "; font-size:26px; font-weight:600; letter-spacing:2px;'>" + esc(meetingLabel) + '</div>',
    });
  }
  if (usesLogo) {
    s4Visuals.push({
      type: 'IMAGE', src: senderLogoUrl, x: 960, y: signChipY + 38, width: 76, height: 76,
      anchor: 'center-center', radius: { tl: 22, tr: 22, bl: 22, br: 22 }, track: 5,
      enterBegin: round(inDelay + 1.45), enterEnd: round(inDelay + 1.85), enterAnimation: 'fade', exitEnd: s4,
    });
  } else {
    s4Visuals.push({
      type: 'TEXT', x: 960, y: signChipY, width: 300, height: 76, anchor: 'top-center', track: 5,
      enterBegin: round(inDelay + 1.45), enterEnd: round(inDelay + 1.85), enterAnimation: 'fade', exitEnd: s4,
      style: uiStyle({ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }),
      html: "<div style='text-align:center;'>" + signChip + '</div>',
    });
  }
  s4Visuals.push({
    type: 'TEXT', x: 960, y: signTextY, width: 1200, anchor: 'top-center', track: 6,
    enterBegin: round(inDelay + 1.6), enterEnd: round(inDelay + 2), enterAnimation: 'fade', exitEnd: s4,
    style: uiStyle({ textAlign: 'center' }),
    html: "<div style='text-align:center; color:" + ink + "; font-size:32px; font-weight:700;'>" + esc(senderName) + '</div>'
      + "<div style='margin-top:10px; text-align:center; color:" + muted + "; font-size:24px; font-weight:600; letter-spacing:1px;'>"
      + esc(senderTitle ? senderTitle + ' · ' + senderCompany : senderCompany) + '</div>',
  });

  // ==== assemble ===========================================================
  const scenes = [];
  scenes.push({ id: 'cover', duration: round(s1), backgroundColor: paper, transition, transitionDuration: tDur, visuals: s1Visuals });
  if (scope.length) {
    scenes.push({ id: 'scope', duration: round(s2), backgroundColor: paper, transition, transitionDuration: tDur, visuals: s2Visuals });
  }
  scenes.push({ id: 'numbers', duration: round(s3), backgroundColor: paper, transition, transitionDuration: tDur, visuals: s3Visuals });
  scenes.push({ id: 'cta', duration: round(s4), backgroundColor: paper, visuals: s4Visuals });
  // Each transition names the scene it blends into, the way the library does.
  for (let i = 0; i < scenes.length - 1; i += 1) scenes[i].transitionId = scenes[i + 1].id;

  // ---- music guard --------------------------------------------------------
  // `probe` is the full HEAD response for cfg.musicUrl. Unreachable or oversized
  // music must never fail the render — it is simply dropped.
  const musicUrl = clean(cfg.musicUrl);
  const limit = Number(cfg.maxMusicBytes) > 0 ? Number(cfg.maxMusicBytes) : 5242880;
  const headers = (probe && probe.headers) || {};
  const musicBytes = Number(headers['content-length'] || headers['Content-Length'] || 0);
  const musicOk = !!musicUrl && Number(probe && probe.statusCode) === 200 && (!musicBytes || musicBytes <= limit);
  const musicSkipped = musicOk ? null : (!musicUrl ? 'musicUrl empty' : (Number(probe && probe.statusCode) !== 200 ? 'HEAD ' + ((probe && probe.statusCode) || 'failed') : musicBytes + ' bytes > ' + limit));

  const totalSeconds = round(scenes.reduce((a, s) => a + s.duration, 0) - tDur * (scenes.length - 1));

  // The render API only allows letters, digits, spaces, _ and - in `name`.
  const safeName = ('proposal-' + dealName).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  const payload = {
    name: safeName || 'proposal-recap',
    // 1920x1080 spelled out rather than the 'full-hd' preset. Same canvas, but
    // the validator's layout lint only knows the canvas size when it is
    // explicit — with a preset it cannot tell that the paper SVG is a
    // full-bleed backdrop, and reports every element on top of it as an
    // overlap. Explicit dimensions validate clean: 0 errors, 0 warnings.
    resolution: 'custom',
    width: 1920,
    height: 1080,
    frameRate: 30,
    backgroundColor: paper,
    outputFormat: 'mp4',
    scenes,
  };
  // NOTE: no `track` on audios — the render API rejects audios[].track.
  if (musicOk) payload.audios = [{ src: musicUrl, volume: Number(cfg.musicVolume) > 0 ? Number(cfg.musicVolume) : 0.14 }];

  return {
    payload,
    meta: {
      source: d.source || 'sheet',
      rowNumber: d.rowNumber == null ? null : d.rowNumber,
      dealName,
      company,
      contactFirstName,
      amountText,
      currency,
      timelineText,
      validUntilText,
      scopeCount: scope.length,
      statLabels: statCards.map((c) => c.label),
      showAside,
      wideStat,
      // Anything the layout had to shorten, with the original and kept lengths,
      // so a bulk run is auditable. Empty on every deal that fits.
      truncated,
      footerClipped,
      paperAdjusted,
      inkAdjusted,
      mutedAdjusted,
      sceneCount: scenes.length,
      totalSeconds,
      greetSize,
      greetLines,
      dealSize,
      amountSize,
      rowFont,
      rowHeights,
      ctaSize,
      logoUsed: usesLogo,
      musicIncluded: musicOk,
      musicSkipped,
      musicUrl,
      musicBytes,
    },
  };
}


export { buildProject };
