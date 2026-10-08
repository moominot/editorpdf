// Anàlisi i reescriptura de fluxos de contingut de pàgina PDF (funcions pures, sense DOM)

const WS = ' \t\r\n\f\0';
const DELIM = '()<>[]{}/%';

function tokenize(s) {
  const toks = []; let i = 0; const n = s.length;
  const skipString = (j) => { let depth = 1; j++; while (j < n && depth > 0) { const c = s[j]; if (c === '\\') j++; else if (c === '(') depth++; else if (c === ')') depth--; j++; } return j; };
  while (i < n) {
    const c = s[i];
    if (WS.includes(c)) { i++; continue; }
    if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
    const start = i;
    if (c === '(') { i = skipString(i); toks.push({ t: 'str', s: start, e: i }); continue; }
    if (c === '<' && s[i + 1] === '<') { i += 2; toks.push({ t: 'op', v: '<<', s: start, e: i }); continue; }
    if (c === '>' && s[i + 1] === '>') { i += 2; toks.push({ t: 'op', v: '>>', s: start, e: i }); continue; }
    if (c === '<') { i = s.indexOf('>', i) + 1 || n; toks.push({ t: 'str', s: start, e: i }); continue; }
    if (c === '[') {
      let depth = 1; i++;
      while (i < n && depth > 0) { const d = s[i]; if (d === '(') { i = skipString(i); continue; } if (d === '[') depth++; else if (d === ']') depth--; i++; }
      toks.push({ t: 'arr', s: start, e: i }); continue;
    }
    if (c === '/') { i++; while (i < n && !WS.includes(s[i]) && !DELIM.includes(s[i])) i++; toks.push({ t: 'name', v: s.slice(start, i), s: start, e: i }); continue; }
    if (')]>}{'.includes(c)) { i++; toks.push({ t: 'op', v: c, s: start, e: i }); continue; }
    while (i < n && !WS.includes(s[i]) && !DELIM.includes(s[i])) i++;
    const w = s.slice(start, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) toks.push({ t: 'num', v: parseFloat(w), s: start, e: i });
    else {
      toks.push({ t: 'op', v: w, s: start, e: i });
      if (w === 'BI') { // imatge en línia: salta fins a EI
        const idPos = s.indexOf('ID', i); let ei = idPos < 0 ? n : idPos + 2;
        const m = /[\s]EI(?=[\s]|$)/g; m.lastIndex = ei; const r = m.exec(s);
        i = r ? r.index + r[0].length : n;
      }
    }
  }
  return toks;
}

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];

// Retorna la llista d'operacions de text amb la seva posició i si són "continuació" d'una anterior
export function analyzeContent(s) {
  const toks = tokenize(s);
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
  let tm = [1, 0, 0, 1, 0, 0], tlm = tm, tl = 0, tr = 0, fresh = true;
  const shows = []; let opnds = [];
  for (const tk of toks) {
    if (tk.t !== 'op') { opnds.push(tk); continue; }
    const op = tk.v; const nv = (i) => opnds[i]?.v ?? 0;
    switch (op) {
      case 'q': stack.push({ ctm, tr }); break;
      case 'Q': { const g = stack.pop(); if (g) { ctm = g.ctm; } break; }
      case 'cm': ctm = mul([nv(0), nv(1), nv(2), nv(3), nv(4), nv(5)], ctm); break;
      case 'BT': tm = tlm = [1, 0, 0, 1, 0, 0]; fresh = true; break;
      case 'Tr': tr = nv(0); break;
      case 'TL': tl = nv(0); break;
      case 'Td': tlm = tm = mul([1, 0, 0, 1, nv(0), nv(1)], tlm); fresh = true; break;
      case 'TD': tl = -nv(1); tlm = tm = mul([1, 0, 0, 1, nv(0), nv(1)], tlm); fresh = true; break;
      case 'Tm': tlm = tm = [nv(0), nv(1), nv(2), nv(3), nv(4), nv(5)]; fresh = true; break;
      case 'T*': tlm = tm = mul([1, 0, 0, 1, 0, -tl], tlm); fresh = true; break;
      case 'Tj': case 'TJ': case "'": case '"': {
        if (op === "'" || op === '"') { tlm = tm = mul([1, 0, 0, 1, 0, -tl], tlm); fresh = true; }
        const full = mul(tm, ctm);
        shows.push({ op, x: full[4], y: full[5], fresh, tr, start: opnds.length ? opnds[0].s : tk.s, end: tk.e, opnds: opnds.slice() });
        fresh = false; break;
      }
      default: break;
    }
    opnds = [];
  }
  return { toks, shows };
}

export function stripFromContent(s, boxes) {
  const { shows } = analyzeContent(s);
  const inBox = (sh) => boxes.some((b) => sh.x >= b.x0 && sh.x <= b.x1 && sh.y >= b.y0 && sh.y <= b.y1);
  const edits = [];
  shows.forEach((sh, i) => {
    if (!sh.fresh || !inBox(sh)) return;
    const next = shows[i + 1];
    const keepAdvance = next && !next.fresh;
    let rep = '';
    if (keepAdvance) rep = `3 Tr ${s.slice(sh.start, sh.end)} ${sh.tr} Tr`;
    else if (sh.op === "'") rep = 'T*';
    else if (sh.op === '"') rep = `${s.slice(sh.opnds[0].s, sh.opnds[0].e)} Tw ${s.slice(sh.opnds[1].s, sh.opnds[1].e)} Tc T*`;
    edits.push({ start: sh.start, end: sh.end, rep });
  });
  if (!edits.length) return { text: s, count: 0 };
  let out = '', pos = 0;
  for (const ed of edits) { out += s.slice(pos, ed.start) + ed.rep; pos = ed.end; }
  out += s.slice(pos);
  return { text: out, count: edits.length };
}

