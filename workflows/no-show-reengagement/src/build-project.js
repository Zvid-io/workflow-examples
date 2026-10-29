// === buildProject — identical to the frame-reviewed standalone builder ===
// Turns one no-show (a webhook body or a sheet row) into a warm, zero-pressure
// 1080x1920 re-book video: "we missed you" hook, a recap of what the session
// covered with the presenter's face, then a friendly "grab another slot" card.
// Every string that came from outside is length-capped and HTML-escaped before
// it reaches the renderer.
export function buildProject(config, data, music) {
  const cfg = config || {};
  const d = data || {};

  // ---- tiny helpers --------------------------------------------------------
  const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  const round = (n) => Math.round(n * 100) / 100;

  const hex = (v, fallback) => {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(String(v == null ? '' : v).trim());
    return m ? '#' + m[1].toUpperCase() : fallback;
  };
  const rgb = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgba = (h, a) => {
    const c = rgb(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  };
  // Blend two hexes; t = how much of `b` to mix in.
  const mix = (a, b, t) => {
    const x = rgb(a);
    const y = rgb(b);
    const p = (i) => Math.max(0, Math.min(255, Math.round(x[i] + (y[i] - x[i]) * t)));
    return '#' + [p(0), p(1), p(2)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  // Greedy word-wrap estimate. `avgEm` is the average glyph advance as a
  // fraction of the font size — measured against real renders of this layout
  // (~0.50em for Fraunces, ~0.53em for Manrope).
  const wrapLines = (text, fontPx, boxPx, avgEm) => {
    const perLine = Math.max(6, Math.floor(boxPx / (fontPx * avgEm)));
    const words = String(text).split(' ').filter(Boolean);
    if (!words.length) return 1;
    let lines = 1;
    let used = 0;
    for (const w of words) {
      const need = used === 0 ? w.length : used + 1 + w.length;
      if (need <= perLine) { used = need; continue; }
      lines += 1;
      used = Math.min(w.length, perLine);
    }
    return lines;
  };

  // Wrapping only helps where there is a space. A single unbreakable token —
  // a 26-character first name, a hyphen-free compound word — can still be
  // wider than its box and would run into the frame border. Step the size
  // down (never below `minPx`) until the longest word fits.
  const fitLongestWord = (text, fontPx, boxPx, avgEm, minPx) => {
    const longest = String(text).split(' ').reduce((m, w) => Math.max(m, w.length), 0);
    let size = fontPx;
    while (size > minPx && longest * size * avgEm > boxPx) size -= 2;
    return size;
  };

  // ---- palette + type ------------------------------------------------------
  const paper = hex(cfg.paperColor, '#FBF3EC');
  const ink = hex(cfg.inkColor, '#241C15');
  const muted = hex(cfg.mutedColor, '#786557');
  const accent = hex(cfg.brandAccent, '#B0472A');
  const surface = mix(paper, '#FFFFFF', 0.7);      // card fill on the paper scenes
  const accentSoft = mix(accent, paper, 0.45);      // accent that still reads on ink
  const inkGlow = mix(ink, accent, 0.22);           // warm centre of the CTA backdrop
  const paperDim = mix(paper, ink, 0.32);           // secondary text on ink
  const headFont = clean(cfg.headingFont, 40) || 'Fraunces';
  const bodyFont = clean(cfg.bodyFont, 40) || 'Manrope';

  // ---- the no-show ---------------------------------------------------------
  const firstName = clean(d.firstName, 32) || 'there';
  const eventName = clean(d.eventName, 78) || 'the session';
  const rebookUrl = clean(d.rebookUrl, 200) || clean(cfg.rebookUrl, 200);
  const brand = clean(cfg.brandName, 40) || 'Us';
  const presenter = clean(cfg.presenterName, 42) || brand;
  const presenterRole = clean(cfg.presenterRole, 52);

  // `originalTime` is formatted, never computed. An ISO timestamp (what
  // Calendly posts) becomes "Thu, Aug 13 . 6:00 PM UTC" in the configured zone;
  // anything else — including a hand-typed sheet cell — is passed through as is.
  const formatWhen = (raw, tz) => {
    const s = clean(raw, 80);
    if (!s) return '';
    if (!/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return s;
    const when = new Date(s.replace(' ', 'T'));
    if (isNaN(when.getTime())) return s;
    const zone = clean(tz, 60) || 'UTC';
    try {
      const day = when.toLocaleDateString('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' });
      const time = when.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      return day + ' · ' + time;
    } catch (e) {
      // An unknown IANA zone must never fail the render — fall back to UTC.
      const day = when.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
      const time = when.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
      return day + ' · ' + time + ' UTC';
    }
  };
  const originalTime = formatWhen(d.originalTime, cfg.timeZone);

  // Config copy may carry {firstName} / {eventName} / {originalTime} /
  // {presenter} / {brand} tokens. Substitute the raw values first, escape the
  // whole string afterwards, so a name containing "&" can never break markup.
  const fill = (s) =>
    String(s == null ? '' : s)
      .replace(/\{firstName\}/g, firstName)
      .replace(/\{eventName\}/g, eventName)
      .replace(/\{originalTime\}/g, originalTime || 'the other day')
      .replace(/\{presenter\}/g, presenter)
      .replace(/\{brand\}/g, brand);
  const tok = (s, max) => clean(fill(s), max);

  // Anything that has to fit on ONE line gets cut on a whole word, never
  // mid-word, and never silently overflows its box.
  const ellipsize = (s, max) => {
    const t = String(s);
    if (t.length <= max) return t;
    const cut = t.slice(0, max - 1);
    const sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:]+$/, '') + '…';
  };

  // The booking link is shown as a bare domain (plus the path when it is short
  // enough to read at a glance), never as a raw URL and never cut mid-word.
  const bareUrl = rebookUrl
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  const rebookLabel = bareUrl.length <= 34 ? bareUrl : bareUrl.split('/')[0].slice(0, 34);

  // ---- copy ----------------------------------------------------------------
  const kicker = ellipsize(tok(cfg.kickerText || 'A note from {presenter}', 46), 40).toUpperCase();
  const hookLine = tok(cfg.hookLine || 'We missed you, {firstName}.', 58);
  const hookSub = ellipsize(
    tok(cfg.hookSub || '{eventName} ran on {originalTime}. No stress — here is the short version, and a new slot whenever you like.', 220),
    168
  );
  const sessionLabel = tok(cfg.sessionLabel || 'The session you booked', 34).toUpperCase();
  const highlightsTitle = tok(cfg.highlightsTitle || "Here's what we covered", 46);
  const highlights = (Array.isArray(cfg.highlights) ? cfg.highlights : [])
    .map((h) => tok(h, 96))
    .filter(Boolean)
    .slice(0, 3);
  if (!highlights.length) highlights.push('A walk-through of the whole thing, start to finish.');
  const footnote = ellipsize(tok(cfg.highlightsFootnote || 'Same session, new time — there is nothing to catch up on.', 140), 100);
  const ctaHeadline = tok(cfg.ctaHeadline || 'Ready when you are, {firstName}.', 58);
  const ctaSub = ellipsize(tok(cfg.ctaSub || 'Pick a time that actually works for you — it takes about 30 seconds.', 160), 116);
  const ctaText = tok(cfg.ctaText || 'Grab another slot', 30);
  const signOff = ellipsize(tok(cfg.signOff || '{presenter} · {brand}', 60), 52);
  const brandMark = ellipsize(brand, 30);

  // ================= scene 1 — "we missed you" ==============================
  const S1_TR = 0.6;
  const hookLen = hookLine.length;
  const headSize = fitLongestWord(hookLine, hookLen <= 22 ? 96 : hookLen <= 32 ? 84 : hookLen <= 46 ? 70 : 58, 900, 0.52, 34);
  const headLineH = Math.round(headSize * 1.08);
  const headLines = wrapLines(hookLine, headSize, 900, 0.52);
  const subSize = hookSub.length <= 150 ? 34 : 31;
  const subLineH = Math.round(subSize * 1.42);
  const subLines = wrapLines(hookSub, subSize, 840, 0.53);

  const evSize = fitLongestWord(eventName, eventName.length <= 34 ? 46 : eventName.length <= 56 ? 40 : 35, 776, 0.53, 22);
  const evLineH = Math.round(evSize * 1.24);
  const evLines = wrapLines(eventName, evSize, 776, 0.53);
  const cardH = 88 + 139 + evLines * evLineH;
  const cardY = 1330;

  // Centre the kicker + headline + subline block in the space above the card.
  const midH = 32 + 30 + headLines * headLineH + 46 + subLines * subLineH;
  const kickerY = Math.round(250 + Math.max(0, (cardY - 90 - 250 - midH) / 2));
  const headY = kickerY + 62;
  const subY = headY + headLines * headLineH + 46;

  const s1Content = round(Math.min(Math.max(4.2, 3.4 + subLines * 0.35 + headLines * 0.2), 5.4));
  const s1 = round(s1Content + S1_TR);

  const s1Svg =
    "<svg width='1080' height='1920' viewBox='0 0 1080 1920' xmlns='http://www.w3.org/2000/svg'>" +
    "<defs><radialGradient id='nsrHalo' cx='0.5' cy='0.42' r='0.62'>" +
    "<stop offset='0' stop-color='" + accent + "' stop-opacity='0.13'/>" +
    "<stop offset='1' stop-color='" + accent + "' stop-opacity='0'/></radialGradient></defs>" +
    "<rect width='1080' height='1920' fill='" + paper + "'/>" +
    "<circle cx='1064' cy='120' r='250' fill='" + rgba(accent, 0.055) + "'/>" +
    "<circle cx='24' cy='1836' r='300' fill='" + rgba(accent, 0.05) + "'/>" +
    "<rect width='1080' height='1920' fill='url(#nsrHalo)'/>" +
    "<rect x='48' y='48' width='984' height='1824' rx='48' fill='none' stroke='" + rgba(ink, 0.1) + "' stroke-width='1.5'/>" +
    "<rect x='506' y='" + (kickerY - 36) + "' width='68' height='5' rx='2.5' fill='" + accent + "'/>" +
    '</svg>';

  const monogram = (s) => esc((String(s).replace(/[^A-Za-z0-9]/g, '')[0] || 'Z').toUpperCase());

  const s1Visuals = [
    { type: 'SVG', width: 1080, height: 1920, track: 0, enterBegin: 0, exitEnd: s1, svg: s1Svg },
    {
      // Brand, kicker and headline carry NO enter animation on purpose: frame 0
      // is the poster an email client shows before anyone presses play, so it
      // has to read as a finished title card, not an empty page.
      // It also leaves 0.15 s BEFORE the scene transition starts: scene 2's
      // header sits at the same height, and a wipe with two headers on screen
      // reads as a glitch.
      // NOTE: TEXT elements never declare `height` anywhere in this builder. Every
      // card's box is set on its inner div instead. The layout linter can only
      // recognise the full-frame SVG as a backdrop when it knows the canvas size,
      // and it does NOT when `resolution` is a named preset — so a TEXT with a
      // resolvable height would be reported as "overlapping" the backdrop on
      // every single element. Height-less TEXT keeps that lint clean and renders
      // identically, because the inner div carries the real box.
      type: 'TEXT', x: 104, y: 124, width: 872, anchor: 'top-left', track: 1,
      enterBegin: 0, exitBegin: round(s1 - 1.0), exitEnd: round(s1 - S1_TR - 0.02), exitAnimation: 'fade',
      style: { fontFamily: bodyFont, color: ink },
      html:
        "<div style='display:flex; align-items:center; gap:20px;'>" +
        "<div style='width:72px; height:72px; border-radius:22px; background:" + accent + '; color:' + paper +
        "; font-size:36px; font-weight:800; display:flex; align-items:center; justify-content:center;'>" + monogram(brand) + '</div>' +
        "<div style='color:" + ink + "; font-size:34px; font-weight:800; letter-spacing:1px;'>" + esc(brandMark) + '</div></div>',
    },
    {
      type: 'TEXT', x: 540, y: kickerY, width: 900, anchor: 'top-center', track: 2,
      enterBegin: 0, exitEnd: s1,
      style: { fontFamily: bodyFont, color: accent },
      html: "<div style='text-align:center; color:" + accent + "; font-size:25px; font-weight:800; letter-spacing:7px;'>" + esc(kicker) + '</div>',
    },
    {
      type: 'TEXT', x: 540, y: headY, width: 900, anchor: 'top-center', track: 3,
      enterBegin: 0, exitEnd: s1,
      style: { fontFamily: headFont, color: ink },
      html:
        "<div style='text-align:center; color:" + ink + '; font-size:' + headSize + 'px; line-height:' + headLineH +
        "px; font-weight:700; letter-spacing:-1.5px;'>" + esc(hookLine) + '</div>',
    },
    {
      type: 'TEXT', x: 540, y: subY, width: 840, anchor: 'top-center', track: 4,
      enterBegin: 0.45, enterEnd: 1.0, enterAnimation: 'fade', exitEnd: s1,
      style: { fontFamily: bodyFont, color: muted },
      html: "<div style='text-align:center; color:" + muted + '; font-size:' + subSize + 'px; line-height:' + subLineH +
        "px; font-weight:500;'>" + esc(hookSub) + '</div>',
    },
    {
      type: 'TEXT', x: 540, y: cardY, width: 872, anchor: 'top-center', track: 5,
      enterBegin: 1.05, enterEnd: 1.65, enterAnimation: 'smoothup', exitEnd: s1,
      style: { fontFamily: bodyFont, color: ink },
      html:
        "<div style='box-sizing:border-box; width:872px; height:" + cardH + 'px; padding:44px 48px; background:' + surface +
        '; border:1.5px solid ' + rgba(accent, 0.32) + "; border-radius:40px;'>" +
        "<div style='color:" + accent + "; font-size:22px; font-weight:800; letter-spacing:5px;'>" + esc(sessionLabel) + '</div>' +
        "<div style='margin-top:18px; color:" + ink + '; font-size:' + evSize + 'px; line-height:' + evLineH +
        "px; font-weight:800; letter-spacing:-0.5px;'>" + esc(eventName) + '</div>' +
        "<div style='margin-top:28px; height:1px; background:" + rgba(ink, 0.14) + "'></div>" +
        "<div style='margin-top:27px; color:" + muted + "; font-size:30px; font-weight:600;'>" +
        (originalTime ? esc(originalTime) : 'Your original slot') + '</div></div>',
    },
  ];

  // ================= scene 2 — what we covered ==============================
  const S2_TR = 0.6;
  const titleLen = highlightsTitle.length;
  const titleSize = fitLongestWord(highlightsTitle, titleLen <= 26 ? 74 : titleLen <= 44 ? 62 : 52, 880, 0.52, 32);
  const titleLineH = Math.round(titleSize * 1.1);
  const titleLines = wrapLines(highlightsTitle, titleSize, 880, 0.52);

  const hlMaxLen = highlights.reduce((m, h) => Math.max(m, h.length), 0);
  const hlSize = fitLongestWord(highlights.join(' '), hlMaxLen <= 44 ? 34 : hlMaxLen <= 70 ? 30 : hlMaxLen <= 96 ? 27 : 24, 688, 0.53, 18);
  const hlLineH = Math.round(hlSize * 1.44);
  const hlLines = highlights.map((h) => wrapLines(h, hlSize, 688, 0.53));
  const hlCardH = Math.max(196, 96 + Math.max.apply(null, hlLines) * hlLineH);

  const kicker2Y = 176;
  const title2Y = 238;
  const cardsY = title2Y + titleLines * titleLineH + 118;
  const hlGap = 44;
  const stackH = highlights.length * hlCardH + (highlights.length - 1) * hlGap;

  const presLabelY = cardsY + stackH + 104;
  const avatarSize = 156;
  const avatarY = presLabelY + 56;
  const presNameY = avatarY + avatarSize + 32;
  const presRoleY = presNameY + 56;
  const footY = presRoleY + (presenterRole ? 46 : 0) + 62;

  const totalHlChars = highlights.reduce((m, h) => m + h.length, 0);
  const s2Content = round(Math.min(Math.max(4.8, 3.0 + highlights.length * 0.8 + totalHlChars * 0.004), 7.2));
  const s2 = round(s2Content + S2_TR);

  const s2Svg =
    "<svg width='1080' height='1920' viewBox='0 0 1080 1920' xmlns='http://www.w3.org/2000/svg'>" +
    "<defs><radialGradient id='nsrPaper2' cx='0.22' cy='0.12' r='1.05'>" +
    "<stop offset='0' stop-color='" + mix(paper, accent, 0.09) + "'/>" +
    "<stop offset='1' stop-color='" + paper + "'/></radialGradient></defs>" +
    "<rect width='1080' height='1920' fill='url(#nsrPaper2)'/>" +
    "<circle cx='1040' cy='1880' r='260' fill='" + rgba(accent, 0.05) + "'/>" +
    "<rect x='48' y='48' width='984' height='1824' rx='48' fill='none' stroke='" + rgba(ink, 0.1) + "' stroke-width='1.5'/>" +
    "<rect x='506' y='" + (kicker2Y - 34) + "' width='68' height='5' rx='2.5' fill='" + accent + "'/>" +
    '</svg>';

  const s2Visuals = [
    { type: 'SVG', width: 1080, height: 1920, track: 0, enterBegin: 0, exitEnd: s2, svg: s2Svg },
    {
      type: 'TEXT', x: 540, y: kicker2Y, width: 880, anchor: 'top-center', track: 1,
      enterBegin: 0.1, enterEnd: 0.5, enterAnimation: 'fade', exitEnd: s2,
      style: { fontFamily: bodyFont, color: accent },
      html: "<div style='text-align:center; color:" + accent + "; font-size:25px; font-weight:800; letter-spacing:7px;'>" +
        esc(ellipsize(eventName, 38).toUpperCase()) + '</div>',
    },
    {
      type: 'TEXT', x: 540, y: title2Y, width: 880, anchor: 'top-center', track: 2,
      enterBegin: 0.25, enterEnd: 0.75, enterAnimation: 'smoothup', exitEnd: s2,
      style: { fontFamily: headFont, color: ink },
      html: "<div style='text-align:center; color:" + ink + '; font-size:' + titleSize + 'px; line-height:' + titleLineH +
        "px; font-weight:700; letter-spacing:-1px;'>" + esc(highlightsTitle) + '</div>',
    },
  ];

  highlights.forEach((h, i) => {
    s2Visuals.push({
      type: 'TEXT', x: 540, y: cardsY + i * (hlCardH + hlGap), width: 872, anchor: 'top-center', track: 3 + i,
      enterBegin: round(0.65 + i * 0.26), enterEnd: round(1.15 + i * 0.26), enterAnimation: 'smoothleft', exitEnd: s2,
      style: { fontFamily: bodyFont, color: ink },
      html:
        "<div style='box-sizing:border-box; width:872px; height:" + hlCardH +
        'px; padding:0 44px; background:' + surface + '; border:1.5px solid ' + rgba(accent, 0.28) +
        "; border-radius:34px; display:flex; align-items:center; gap:28px;'>" +
        "<div style='flex:0 0 auto; width:68px; height:68px; border-radius:999px; background:" + rgba(accent, 0.14) +
        '; border:2px solid ' + accent + '; color:' + accent +
        "; font-size:30px; font-weight:800; display:flex; align-items:center; justify-content:center;'>" + (i + 1) + '</div>' +
        "<div style='flex:1 1 auto; color:" + ink + '; font-size:' + hlSize + 'px; line-height:' + hlLineH +
        "px; font-weight:600;'>" + esc(h) + '</div></div>',
    });
  });

  s2Visuals.push({
    type: 'TEXT', x: 540, y: presLabelY, width: 800, anchor: 'top-center', track: 7,
    enterBegin: 1.5, enterEnd: 1.9, enterAnimation: 'fade', exitEnd: s2,
    style: { fontFamily: bodyFont, color: muted },
    html: "<div style='text-align:center; color:" + muted + "; font-size:22px; font-weight:800; letter-spacing:6px;'>HOSTED BY</div>",
  });

  const presenterImage = clean(cfg.presenterImageUrl, 400);
  const hasPhoto = /^https:\/\//i.test(presenterImage);
  if (hasPhoto) {
    // The halo sits on its own element (not in the scene SVG) so it appears
    // with the photo instead of hanging there empty for the first 1.6 s.
    s2Visuals.push({
      type: 'TEXT', x: 540, y: avatarY - 11, width: avatarSize + 22, anchor: 'top-center', track: 8,
      enterBegin: 1.6, enterEnd: 2.05, enterAnimation: 'circleopen', exitEnd: s2,
      style: { fontFamily: bodyFont, color: accent },
      html:
        "<div style='box-sizing:border-box; width:" + (avatarSize + 22) + 'px; height:' + (avatarSize + 22) +
        'px; border-radius:999px; background:' + surface + '; border:2px solid ' + rgba(accent, 0.34) + ";'></div>",
    });
    // NOTE: no `resize` here. The renderer's `resize` recomputes width/height
    // against the whole CANVAS, which blows a 156 px avatar up to full-frame.
    // Without it, width/height are honoured and `radius` masks a clean circle —
    // so the presenter photo must be square (documented in the setup notes).
    s2Visuals.push({
      type: 'IMAGE', src: presenterImage,
      x: 540 - avatarSize / 2, y: avatarY, width: avatarSize, height: avatarSize,
      radius: { tl: avatarSize / 2, tr: avatarSize / 2, bl: avatarSize / 2, br: avatarSize / 2 },
      anchor: 'top-left', track: 9, enterBegin: 1.6, enterEnd: 2.05, enterAnimation: 'circleopen', exitEnd: s2,
    });
  } else {
    s2Visuals.push({
      type: 'TEXT', x: 540, y: avatarY, width: avatarSize, anchor: 'top-center', track: 9,
      enterBegin: 1.6, enterEnd: 2.05, enterAnimation: 'circleopen', exitEnd: s2,
      style: { fontFamily: bodyFont, color: accent },
      html:
        "<div style='box-sizing:border-box; width:" + avatarSize + 'px; height:' + avatarSize +
        'px; border-radius:999px; background:' + rgba(accent, 0.14) + '; border:2.5px solid ' + accent + '; color:' + accent +
        "; font-size:62px; font-weight:800; display:flex; align-items:center; justify-content:center;'>" + monogram(presenter) + '</div>',
    });
  }

  s2Visuals.push({
    type: 'TEXT', x: 540, y: presNameY, width: 860, anchor: 'top-center', track: 10,
    enterBegin: 1.8, enterEnd: 2.2, enterAnimation: 'smoothup', exitEnd: s2,
    style: { fontFamily: bodyFont, color: ink },
    html: "<div style='text-align:center; color:" + ink + "; font-size:42px; line-height:50px; font-weight:800; letter-spacing:-0.5px;'>" +
      esc(presenter) + '</div>',
  });

  if (presenterRole) {
    s2Visuals.push({
      type: 'TEXT', x: 540, y: presRoleY, width: 860, anchor: 'top-center', track: 11,
      enterBegin: 1.95, enterEnd: 2.35, enterAnimation: 'fade', exitEnd: s2,
      style: { fontFamily: bodyFont, color: muted },
      html: "<div style='text-align:center; color:" + muted + "; font-size:28px; line-height:38px; font-weight:600;'>" + esc(presenterRole) + '</div>',
    });
  }

  s2Visuals.push({
    type: 'TEXT', x: 540, y: footY, width: 820, anchor: 'top-center', track: 12,
    enterBegin: 2.2, enterEnd: 2.6, enterAnimation: 'fade', exitEnd: s2,
    style: { fontFamily: bodyFont, color: muted },
    html: "<div style='text-align:center; color:" + muted + "; font-size:26px; line-height:38px; font-weight:500;'>" + esc(footnote) + '</div>',
  });

  // ================= scene 3 — grab another slot ============================
  const ctaLen = ctaHeadline.length;
  const ctaSize = fitLongestWord(ctaHeadline, ctaLen <= 24 ? 88 : ctaLen <= 34 ? 76 : ctaLen <= 46 ? 64 : 54, 900, 0.52, 34);
  const ctaLineH = Math.round(ctaSize * 1.08);
  const ctaLines = wrapLines(ctaHeadline, ctaSize, 900, 0.52);
  const ctaSubLines = wrapLines(ctaSub, 32, 820, 0.53);

  const ctaHeadY = 830;
  const ctaSubY = ctaHeadY + ctaLines * ctaLineH + 44;
  const pillY = ctaSubY + ctaSubLines * 46 + 92;
  const domainY = pillY + 142;
  const s3 = 4.4;

  const s3Svg =
    "<svg width='1080' height='1920' viewBox='0 0 1080 1920' xmlns='http://www.w3.org/2000/svg'>" +
    "<defs><radialGradient id='nsrCta' cx='0.5' cy='0.3' r='0.95'>" +
    "<stop offset='0' stop-color='" + inkGlow + "'/><stop offset='1' stop-color='" + ink + "'/></radialGradient></defs>" +
    "<rect width='1080' height='1920' fill='url(#nsrCta)'/>" +
    "<rect x='48' y='48' width='984' height='1824' rx='48' fill='none' stroke='" + rgba(paper, 0.16) + "' stroke-width='1.5'/>" +
    "<circle cx='540' cy='520' r='170' fill='none' stroke='" + rgba(accentSoft, 0.22) + "' stroke-width='1.5'/>" +
    "<circle cx='540' cy='520' r='148' fill='none' stroke='" + rgba(accentSoft, 0.75) + "' stroke-width='2.5'/>" +
    "<rect x='470' y='474' width='140' height='120' rx='20' fill='none' stroke='" + accentSoft + "' stroke-width='6'/>" +
    "<path d='M502 456 V486 M578 456 V486' stroke='" + accentSoft + "' stroke-width='9' stroke-linecap='round'/>" +
    "<path d='M470 516 H610' stroke='" + accentSoft + "' stroke-width='5'/>" +
    "<path d='M504 550 L528 574 L578 528' fill='none' stroke='" + accentSoft + "' stroke-width='10' stroke-linecap='round' stroke-linejoin='round'/>" +
    "<path d='M420 1560 H660' stroke='" + rgba(paper, 0.22) + "' stroke-width='1.5'/>" +
    '</svg>';

  const s3Visuals = [
    { type: 'SVG', width: 1080, height: 1920, track: 0, enterBegin: 0, exitEnd: s3, svg: s3Svg },
    {
      type: 'TEXT', x: 540, y: ctaHeadY, width: 900, anchor: 'top-center', track: 1,
      enterBegin: 0.3, enterEnd: 0.85, enterAnimation: 'smoothup', exitEnd: s3,
      style: { fontFamily: headFont, color: paper },
      html: "<div style='text-align:center; color:" + paper + '; font-size:' + ctaSize + 'px; line-height:' + ctaLineH +
        "px; font-weight:700; letter-spacing:-1.5px;'>" + esc(ctaHeadline) + '</div>',
    },
    {
      type: 'TEXT', x: 540, y: ctaSubY, width: 820, anchor: 'top-center', track: 2,
      enterBegin: 0.7, enterEnd: 1.15, enterAnimation: 'fade', exitEnd: s3,
      style: { fontFamily: bodyFont, color: paperDim },
      html: "<div style='text-align:center; color:" + paperDim + "; font-size:32px; line-height:46px; font-weight:500;'>" + esc(ctaSub) + '</div>',
    },
    {
      type: 'TEXT', x: 540, y: pillY, width: 900, anchor: 'top-center', track: 3,
      enterBegin: 1.05, enterEnd: 1.5, enterAnimation: 'circleopen', exitEnd: s3,
      style: { fontFamily: bodyFont, color: paper },
      html:
        "<div style='text-align:center;'><div style='display:inline-block; background:" + accent + '; color:' + paper +
        "; border-radius:999px; padding:28px 68px; font-size:40px; font-weight:800; letter-spacing:-0.5px;'>" + esc(ctaText) + '</div></div>',
    },
  ];

  if (rebookLabel) {
    s3Visuals.push({
      type: 'TEXT', x: 540, y: domainY, width: 900, anchor: 'top-center', track: 4,
      enterBegin: 1.4, enterEnd: 1.8, enterAnimation: 'fade', exitEnd: s3,
      style: { fontFamily: bodyFont, color: paperDim },
      html: "<div style='text-align:center; color:" + paperDim + "; font-size:28px; font-weight:700; letter-spacing:4px;'>" +
        esc(rebookLabel.toUpperCase()) + '</div>',
    });
  }

  s3Visuals.push({
    type: 'TEXT', x: 540, y: 1620, width: 900, anchor: 'top-center', track: 5,
    enterBegin: 1.7, enterEnd: 2.1, enterAnimation: 'fade', exitEnd: s3,
    style: { fontFamily: bodyFont, color: paperDim },
    html: "<div style='text-align:center; color:" + paperDim + "; font-size:27px; font-weight:600; letter-spacing:2px;'>&mdash; " +
      esc(signOff) + '</div>',
  });

  // ---- assemble ------------------------------------------------------------
  const scenes = [
    { id: 'missed', duration: s1, backgroundColor: paper, transition: 'smoothup', transitionId: 'recap', transitionDuration: S1_TR, visuals: s1Visuals },
    { id: 'recap', duration: s2, backgroundColor: paper, transition: 'fade', transitionId: 'rebook', transitionDuration: S2_TR, visuals: s2Visuals },
    { id: 'rebook', duration: s3, backgroundColor: ink, visuals: s3Visuals },
  ];

  // The render API only allows letters, digits, spaces, _ and - in `name`.
  const safeName = ('no-show-' + firstName + '-' + eventName)
    .toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  const payload = {
    name: safeName || 'no-show-reengagement',
    resolution: 'instagram-reel',
    frameRate: Number(cfg.frameRate ?? 30),
    backgroundColor: paper,
    outputFormat: 'mp4',
    scenes,
  };
  // NOTE: no `track` on audios — the render API rejects audios[].track.
  if (music && music.src) {
    payload.audios = [{ src: music.src, volume: Number(cfg.musicVolume ?? 0.14) }];
  }

  const totalSeconds = round(s1 + s2 + s3 - S1_TR - S2_TR);
  const lowestPixel = Math.max(cardY + cardH, footY + 40, 1660);

  return {
    payload,
    meta: {
      firstName,
      eventName,
      originalTime,
      rebookUrl,
      rebookLabel,
      presenter,
      brand,
      highlightCount: highlights.length,
      avatarMode: hasPhoto ? 'photo' : 'monogram',
      hasMusic: Boolean(music && music.src),
      sceneSeconds: [s1, s2, s3],
      totalSeconds,
      headSize,
      headLines,
      subLines,
      titleSize,
      titleLines,
      hlSize,
      hlCardH,
      evSize,
      evLines,
      cardY,
      cardH,
      cardsY,
      presLabelY,
      footY,
      ctaSize,
      ctaLines,
      lowestPixel,
      visualCount: s1Visuals.length + s2Visuals.length + s3Visuals.length,
    },
  };
}

