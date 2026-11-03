/* =====================================================================
   Chapter 6: Object Recognition & Case Studies (interactive demos)
   Uses $ and esc from app.js. No server, no storage.
   ===================================================================== */

/* ---------- Pure helpers (also testable in Node) ---------- */
const Rec = {
  // Minimum-distance decision function d_j(x) = x·m - ½ m·m
  dMin(x, m) { return x[0] * m[0] + x[1] * m[1] - 0.5 * (m[0] * m[0] + m[1] * m[1]); },
  euclid(x, m) { return Math.hypot(x[0] - m[0], x[1] - m[1]); },
  gauss(x, m, s) { return Math.exp(-((x - m) ** 2) / (2 * s * s)) / (Math.sqrt(2 * Math.PI) * s); },

  // 2-D valid convolution (as used in CNNs: no kernel flip)
  conv2d(I, K, stride) {
    const n = Math.floor((I.length - K.length) / stride) + 1;
    const out = [];
    for (let r = 0; r < n; r++) {
      const row = [];
      for (let c = 0; c < n; c++) {
        let s = 0;
        for (let i = 0; i < K.length; i++) for (let j = 0; j < K.length; j++) {
          s += I[r * stride + i][c * stride + j] * K[i][j];
        }
        row.push(s);
      }
      out.push(row);
    }
    return out;
  },
  outSize(N, F, S, P) { return (N - F + 2 * P) / S + 1; },

  iou(a, b) {  // boxes {x, y, w, h}
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const inter = ix * iy;
    const uni = a.w * a.h + b.w * b.h - inter;
    return { inter, uni, iou: uni > 0 ? inter / uni : 0 };
  },

  // Freeman 4-direction chain code helpers
  chainDiff(c) {
    const n = c.length;
    return c.map((v, i) => (((v - c[(i - 1 + n) % n]) % 4) + 4) % 4);
  },
  minRotation(arr) {
    let best = null, at = 0;
    for (let r = 0; r < arr.length; r++) {
      const s = arr.slice(r).concat(arr.slice(0, r)).join('');
      if (best === null || s < best) { best = s; at = r; }
    }
    return { shape: best || '', at };
  },

  // String matching: alpha = positional matches, beta = max(|a|,|b|) - alpha, R = alpha/beta
  strMatch(a, b) {
    let alpha = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] === b[i]) alpha++;
    const beta = Math.max(a.length, b.length) - alpha;
    return { alpha, beta, R: beta === 0 ? Infinity : alpha / beta };
  },

  // Recognizer for L(G) = { a b^n c : n >= 1 }
  automaton(str) {
    const T = { q0: { a: 'q1' }, q1: { b: 'q2' }, q2: { b: 'q2', c: 'qF' }, qF: {} };
    const trace = [];
    let q = 'q0';
    for (const ch of str) {
      const nq = (T[q] && T[q][ch]) || null;
      trace.push({ from: q, ch, to: nq || 'reject' });
      if (!nq) return { accepted: false, trace, stopped: true };
      q = nq;
    }
    return { accepted: q === 'qF', trace, stopped: false, end: q };
  }
};

/* ---------- Browser-only UI ---------- */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const inits = [initPatternTabs, initMinDist, initBayes, initPerceptron, initActivations,
      initMLP, initConv, initOutSize, initPooling, initYOLO, initFasterRCNN, initRoI,
      initGrammar, initShapeNumbers, initSimilarity, initStringMatch];
    inits.forEach(f => { try { f(); } catch (e) { console.error(f.name, e); } });
  });
}

/* Canvas helpers: crisp on HiDPI, coordinates in CSS pixels of the logical size */
function cv(id) {
  const c = $(id);
  const W = +c.getAttribute('width'), H = +c.getAttribute('height');
  const dpr = window.devicePixelRatio || 1;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, ctx, W, H };
}
function evPoint(c, e, W, H) {
  const r = c.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function bindRange(id, fmt, onChange) {
  const el = $(id), lab = $(id + '-v');
  const upd = () => { if (lab) lab.textContent = fmt ? fmt(+el.value) : el.value; };
  el.addEventListener('input', () => { upd(); onChange(); });
  upd();
  return el;
}
function marker(ctx, shape, x, y, r, fill, stroke) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (shape === 'square') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.1, y + r * 0.8); ctx.lineTo(x - r * 1.1, y + r * 0.8); ctx.closePath(); }
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function mat(M, o = {}) {
  return `<table class="mat">${M.map((r, i) => `<tr>${r.map((v, j) => {
    const cls = o.cls ? o.cls(i, j) : '';
    const st = o.style ? o.style(i, j) : '';
    return `<td class="${cls}" style="${st}">${v === null ? '' : (typeof v === 'number' && o.dec != null ? v.toFixed(o.dec) : v)}</td>`;
  }).join('')}</tr>`).join('')}</table>`;
}
function tabs(groupId, attr, onPick) {
  const g = $(groupId);
  g.addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (!b) return;
    g.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === b));
    onPick(b.dataset[attr]);
  });
}

/* ---------- 7. Pattern arrangement tabs + staircase string ---------- */
function initPatternTabs() {
  const panes = document.querySelectorAll('#patterns .tabpane');
  tabs('pat-tabs', 't', t => panes.forEach(p => { p.hidden = p.dataset.p !== t; }));

  const { ctx, W, H } = cv('pat-stair');
  ctx.clearRect(0, 0, W, H);
  ctx.font = '600 15px system-ui';
  let x = 20, y = 24;
  const step = 52;
  for (let i = 0; i < 5; i++) {
    // a: right
    ctx.strokeStyle = '#2456d6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + step, y); ctx.stroke();
    ctx.fillStyle = '#2456d6'; ctx.fillText('a', x + step / 2 - 4, y - 6);
    x += step;
    // b: down
    ctx.strokeStyle = '#c23b3b';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 22); ctx.stroke();
    ctx.fillStyle = '#c23b3b'; ctx.fillText('b', x + 6, y + 16);
    y += 22;
  }
  ctx.fillStyle = '#1e2430';
  ctx.font = '15px ui-monospace, monospace';
  ctx.fillText('string = a b a b a b a b a b …', W - 250, 30);
}

/* ---------- 8.1 Minimum-distance classifier (iris) ---------- */
function initMinDist() {
  const { c, ctx, W, H } = cv('md-canvas');
  const pad = { l: 46, r: 12, t: 12, b: 38 };
  const X0 = 0, X1 = 7.5, Y0 = 0, Y1 = 2.8;
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const sx = v => pad.l + (v - X0) / (X1 - X0) * pw;
  const sy = v => H - pad.b - (v - Y0) / (Y1 - Y0) * ph;
  const ix = p => X0 + (p - pad.l) / pw * (X1 - X0);
  const iy = p => Y0 + (H - pad.b - p) / ph * (Y1 - Y0);

  const CLS = [
    { name: 'ω₁ Iris setosa', color: '#2f9e44', shape: 'circle', m: [1.46, 0.25], sd: [0.17, 0.1] },
    { name: 'ω₂ Iris virginica', color: '#7048e8', shape: 'triangle', m: [5.55, 2.03], sd: [0.55, 0.27] },
    { name: 'ω₃ Iris versicolor', color: '#e8590c', shape: 'square', m: [4.26, 1.33], sd: [0.47, 0.2] }
  ];
  const rnd = mulberry32(11);
  const gn = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  CLS.forEach(k => {
    k.pts = Array.from({ length: 30 }, () => [
      Math.max(0.9, +(k.m[0] + gn() * k.sd[0]).toFixed(1)),
      Math.max(0.1, +(k.m[1] + gn() * k.sd[1]).toFixed(1))
    ]);
    k.proto = [k.pts.reduce((s, p) => s + p[0], 0) / k.pts.length, k.pts.reduce((s, p) => s + p[1], 0) / k.pts.length];
  });

  $('md-legend').innerHTML = CLS.map(k => `<span><i class="sw" style="background:${k.color}"></i>${k.name}</span>`).join('') +
    '<span><b>✚</b> unknown x</span><span><b>◆</b> prototype mⱼ</span>';

  const x1 = $('md-x1'), x2 = $('md-x2'), reg = $('md-regions');
  const classify = x => {
    let best = 0, bv = -Infinity;
    CLS.forEach((k, i) => { const d = Rec.dMin(x, k.proto); if (d > bv) { bv = d; best = i; } });
    return best;
  };

  const draw = () => {
    const x = [+x1.value, +x2.value];
    ctx.clearRect(0, 0, W, H);
    if (reg.checked) {
      for (let px = pad.l; px < W - pad.r; px += 4) for (let py = pad.t; py < H - pad.b; py += 4) {
        ctx.fillStyle = rgba(CLS[classify([ix(px + 2), iy(py + 2)])].color, 0.12);
        ctx.fillRect(px, py, 4, 4);
      }
    }
    // axes
    ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 1; ctx.fillStyle = '#5b6475'; ctx.font = '12px system-ui';
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, H - pad.b); ctx.lineTo(W - pad.r, H - pad.b); ctx.stroke();
    for (let t = 0; t <= 7; t++) { ctx.fillText(t, sx(t) - 3, H - pad.b + 15); }
    for (let t = 0; t <= 2.5; t += 0.5) { ctx.fillText(t.toFixed(1), 12, sy(t) + 4); }
    ctx.fillText('Petal length x₁ (cm)', W / 2 - 50, H - 6);
    ctx.save(); ctx.translate(12, H / 2 + 50); ctx.rotate(-Math.PI / 2); ctx.fillText('Petal width x₂ (cm)', 0, 0); ctx.restore();

    CLS.forEach(k => k.pts.forEach(p => marker(ctx, k.shape, sx(p[0]), sy(p[1]), 3.5, null, k.color)));
    // distance lines
    const win = classify(x);
    CLS.forEach((k, i) => {
      ctx.setLineDash(i === win ? [] : [4, 4]);
      ctx.strokeStyle = i === win ? '#1e2430' : '#9aa3b5'; ctx.lineWidth = i === win ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(sx(x[0]), sy(x[1])); ctx.lineTo(sx(k.proto[0]), sy(k.proto[1])); ctx.stroke();
    });
    ctx.setLineDash([]);
    CLS.forEach((k, i) => {
      const px = sx(k.proto[0]), py = sy(k.proto[1]);
      ctx.beginPath(); ctx.moveTo(px, py - 8); ctx.lineTo(px + 8, py); ctx.lineTo(px, py + 8); ctx.lineTo(px - 8, py); ctx.closePath();
      ctx.fillStyle = k.color; ctx.fill(); ctx.strokeStyle = '#1e2430'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#1e2430'; ctx.font = '600 12px system-ui'; ctx.fillText('m' + (i + 1), px + 10, py - 8);
    });
    // unknown
    const ux = sx(x[0]), uy = sy(x[1]);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ux - 9, uy); ctx.lineTo(ux + 9, uy); ctx.moveTo(ux, uy - 9); ctx.lineTo(ux, uy + 9); ctx.stroke();

    const rows = CLS.map((k, i) => {
      const D = Rec.euclid(x, k.proto), d = Rec.dMin(x, k.proto);
      return `<tr${i === win ? ' style="background:#e9f8ef;font-weight:600"' : ''}>
        <td>${k.name}</td><td>(${k.proto[0].toFixed(2)}, ${k.proto[1].toFixed(2)})</td>
        <td>${D.toFixed(3)}</td><td>${d.toFixed(3)}</td></tr>`;
    }).join('');
    const order = CLS.map((k, i) => i).sort((a, b) => Rec.dMin(x, CLS[b].proto) - Rec.dMin(x, CLS[a].proto));
    const i1 = order[0], i2 = order[1];
    const dij = Rec.dMin(x, CLS[i1].proto) - Rec.dMin(x, CLS[i2].proto);
    $('md-out').innerHTML = `
      <p>Unknown x = (${x[0].toFixed(2)}, ${x[1].toFixed(2)})</p>
      <div class="scroll"><table class="tbl">
        <tr><th>Class</th><th>Prototype mⱼ</th><th>Distance Dⱼ</th><th>dⱼ(x) = xᵀmⱼ − ½mⱼᵀmⱼ</th></tr>${rows}
      </table></div>
      <p>Smallest distance = largest dⱼ(x), so x is assigned to <b style="color:${CLS[win].color}">${CLS[win].name}</b>.
      Between the top two classes, d${i1 + 1}${i2 + 1}(x) = ${dij.toFixed(3)} &gt; 0.</p>`;
  };

  bindRange('md-x1', v => v.toFixed(2), draw);
  bindRange('md-x2', v => v.toFixed(2), draw);
  reg.addEventListener('change', draw);
  c.addEventListener('click', e => {
    const p = evPoint(c, e, W, H);
    x1.value = Math.min(7.4, Math.max(0.2, ix(p.x))).toFixed(2);
    x2.value = Math.min(2.75, Math.max(0.05, iy(p.y))).toFixed(2);
    $('md-x1-v').textContent = (+x1.value).toFixed(2);
    $('md-x2-v').textContent = (+x2.value).toFixed(2);
    draw();
  });
  draw();
}

/* ---------- 8.2 Bayes classifier (1-D Gaussian, two classes) ---------- */
function initBayes() {
  const { ctx, W, H } = cv('by-canvas');
  const pad = { l: 16, r: 16, t: 14, b: 44 };
  const sx = v => pad.l + v / 10 * (W - pad.l - pad.r);
  const C1 = '#2456d6', C2 = '#e8590c';
  const ids = ['by-m1', 'by-s1', 'by-m2', 'by-s2', 'by-p1', 'by-x'];

  const draw = () => {
    const [m1, s1, m2, s2, p1, x] = ids.map(i => +$(i).value);
    const p2 = 1 - p1;
    const d1 = t => Rec.gauss(t, m1, s1) * p1, d2 = t => Rec.gauss(t, m2, s2) * p2;
    let ymax = 0;
    for (let t = 0; t <= 10; t += 0.02) ymax = Math.max(ymax, d1(t), d2(t));
    ymax *= 1.1;
    const sy = v => H - pad.b - v / ymax * (H - pad.t - pad.b);

    ctx.clearRect(0, 0, W, H);
    // decision bar
    for (let px = pad.l; px < W - pad.r; px += 2) {
      const t = (px - pad.l) / (W - pad.l - pad.r) * 10;
      ctx.fillStyle = d1(t) >= d2(t) ? rgba(C1, 0.35) : rgba(C2, 0.35);
      ctx.fillRect(px, H - pad.b + 4, 2, 10);
    }
    ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, H - pad.b); ctx.lineTo(W - pad.r, H - pad.b); ctx.stroke();
    ctx.fillStyle = '#5b6475'; ctx.font = '12px system-ui';
    for (let t = 0; t <= 10; t += 2) ctx.fillText(t, sx(t) - 3, H - pad.b + 28);
    ctx.fillText('decides ω₁ / ω₂ →', pad.l, H - 4);

    [[d1, C1, 'd₁(x)'], [d2, C2, 'd₂(x)']].forEach(([f, col, lab]) => {
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let t = 0; t <= 10; t += 0.02) { const X = sx(t), Y = sy(f(t)); t === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
      ctx.stroke();
    });
    ctx.font = '600 13px system-ui';
    ctx.fillStyle = C1; ctx.fillText('d₁(x) = p(x|ω₁)P(ω₁)', W - 190, 22);
    ctx.fillStyle = C2; ctx.fillText('d₂(x) = p(x|ω₂)P(ω₂)', W - 190, 40);

    ctx.strokeStyle = '#1e2430'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx(x), pad.t); ctx.lineTo(sx(x), H - pad.b); ctx.stroke(); ctx.setLineDash([]);
    [[d1, C1], [d2, C2]].forEach(([f, col]) => { ctx.beginPath(); ctx.arc(sx(x), sy(f(x)), 5, 0, 7); ctx.fillStyle = col; ctx.fill(); });

    const a = d1(x), b = d2(x), post1 = a / (a + b || 1);
    // find boundary points (sign changes)
    const bounds = [];
    let prev = d1(0) - d2(0);
    for (let t = 0.01; t <= 10; t += 0.01) {
      const cur = d1(t) - d2(t);
      if ((cur > 0) !== (prev > 0)) bounds.push(t.toFixed(2));
      prev = cur;
    }
    const win = a >= b ? 1 : 2;
    $('by-out').innerHTML = `
      <p>d₁(${x.toFixed(1)}) = <b>${a.toFixed(4)}</b> · d₂(${x.toFixed(1)}) = <b>${b.toFixed(4)}</b>
      → posteriors P(ω₁|x) = <b>${post1.toFixed(3)}</b>, P(ω₂|x) = <b>${(1 - post1).toFixed(3)}</b>.</p>
      <p>Decision: x belongs to <b style="color:${win === 1 ? C1 : C2}">ω${win}</b>.
      Decision boundary in view at x ≈ ${bounds.length ? bounds.join(', ') : 'none (one class dominates everywhere)'}.</p>
      <p class="note">With equal priors and equal σ, the boundary sits exactly midway between the means. Raising P(ω₁) pushes the boundary towards ω₂, giving ω₁ more territory.</p>`;
  };
  bindRange('by-m1', v => v.toFixed(1), draw);
  bindRange('by-s1', v => v.toFixed(1), draw);
  bindRange('by-m2', v => v.toFixed(1), draw);
  bindRange('by-s2', v => v.toFixed(1), draw);
  bindRange('by-p1', v => `${v.toFixed(2)} (P(ω₂) = ${(1 - v).toFixed(2)})`, draw);
  bindRange('by-x', v => v.toFixed(1), draw);
  draw();
}

/* ---------- 9.1 Perceptron ---------- */
function initPerceptron() {
  const { ctx, W, H } = cv('pc-canvas');
  const D = {
    AND: [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]],
    OR: [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]],
    XOR: [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]]
  };
  let set = 'AND', log = [];
  const w1 = $('pc-w1'), w2 = $('pc-w2'), T = $('pc-T');
  const sx = v => (v + 0.5) / 2 * W, sy = v => H - (v + 0.5) / 2 * H;
  const get = () => [+w1.value, +w2.value, +T.value];
  const out = (w, x) => (w[0] * x[0] + w[1] * x[1] > w[2] ? 1 : 0);
  const setVals = w => {
    const clamp = v => Math.max(-3, Math.min(3, Math.round(v * 100) / 100));
    w1.value = clamp(w[0]); w2.value = clamp(w[1]); T.value = clamp(w[2]);
    $('pc-w1-v').textContent = (+w1.value).toFixed(2);
    $('pc-w2-v').textContent = (+w2.value).toFixed(2);
    $('pc-T-v').textContent = (+T.value).toFixed(2);
  };

  const draw = () => {
    const w = get();
    ctx.clearRect(0, 0, W, H);
    for (let px = 0; px < W; px += 4) for (let py = 0; py < H; py += 4) {
      const x = [px / W * 2 - 0.5, (H - py) / H * 2 - 0.5];
      if (out(w, x)) { ctx.fillStyle = 'rgba(36,86,214,.13)'; ctx.fillRect(px, py, 4, 4); }
    }
    ctx.strokeStyle = '#c7d2ea'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx(0), 0); ctx.lineTo(sx(0), H); ctx.moveTo(0, sy(0)); ctx.lineTo(W, sy(0)); ctx.stroke();
    ctx.fillStyle = '#5b6475'; ctx.font = '12px system-ui';
    ctx.fillText('x₁', W - 18, sy(0) - 6); ctx.fillText('x₂', sx(0) + 6, 14);
    // boundary w1 x1 + w2 x2 = T
    ctx.strokeStyle = '#1e2430'; ctx.lineWidth = 2; ctx.beginPath();
    if (Math.abs(w[1]) > 1e-9) {
      const y = x => (w[2] - w[0] * x) / w[1];
      ctx.moveTo(sx(-0.5), sy(y(-0.5))); ctx.lineTo(sx(1.5), sy(y(1.5)));
    } else if (Math.abs(w[0]) > 1e-9) {
      const xv = w[2] / w[0]; ctx.moveTo(sx(xv), 0); ctx.lineTo(sx(xv), H);
    }
    ctx.stroke();
    D[set].forEach(p => {
      const o = out(w, p), X = sx(p[0]), Y = sy(p[1]);
      ctx.beginPath(); ctx.arc(X, Y, 10, 0, 7);
      ctx.fillStyle = p[2] ? '#2456d6' : '#fff'; ctx.fill();
      ctx.strokeStyle = '#2456d6'; ctx.lineWidth = 2.5; ctx.stroke();
      if (o !== p[2]) { ctx.beginPath(); ctx.arc(X, Y, 15, 0, 7); ctx.strokeStyle = '#c23b3b'; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.fillStyle = '#1e2430'; ctx.font = '12px system-ui';
      ctx.fillText(`(${p[0]},${p[1]})`, X + 14, Y + 22);
    });

    const errs = D[set].filter(p => out(w, p) !== p[2]).length;
    $('pc-out').innerHTML = `
      <table class="tbl"><tr><th>x₁</th><th>x₂</th><th>target</th><th>y = w₁x₁ + w₂x₂</th><th>output</th></tr>
      ${D[set].map(p => {
        const y = w[0] * p[0] + w[1] * p[1], o = out(w, p);
        return `<tr><td>${p[0]}</td><td>${p[1]}</td><td>${p[2]}</td><td>${y.toFixed(2)}</td><td class="${o === p[2] ? 'ok' : 'bad'}">${o}</td></tr>`;
      }).join('')}</table>
      <p>${errs === 0 ? '<span class="ok">✔ All four points classified correctly.</span>' : `<span class="bad">${errs} point(s) wrong.</span>`}</p>
      ${log.length ? `<p class="note">${log.slice(-6).join('<br>')}</p>` : ''}`;
  };

  const epoch = () => {
    let w = get(), errs = 0;
    const eta = 0.1;
    D[set].forEach(p => {
      const e = p[2] - out(w, p);
      if (e) {
        errs++;
        w = [w[0] + eta * e * p[0], w[1] + eta * e * p[1], w[2] - eta * e];
      }
    });
    setVals(w);
    return errs;
  };

  $('pc-epoch').addEventListener('click', () => {
    const e = epoch();
    log.push(`Epoch ${log.length + 1}: ${e} update(s) → w₁=${w1.value}, w₂=${w2.value}, T=${T.value}`);
    draw();
  });
  $('pc-train').addEventListener('click', () => {
    log = [];
    let n = 0, e;
    do { e = epoch(); n++; } while (e > 0 && n < 40);
    log.push(e === 0
      ? `Converged after ${n} epoch(s): w₁=${w1.value}, w₂=${w2.value}, T=${T.value}.`
      : `Not converged after ${n} epochs. ${set} is not linearly separable: no single straight line splits the points. A hidden layer (MLP) is needed.`);
    draw();
  });
  $('pc-reset').addEventListener('click', () => { log = []; setVals([0, 0, 0]); draw(); });
  tabs('pc-sets', 's', s => { set = s; log = []; setVals([0, 0, 0]); draw(); });
  bindRange('pc-w1', v => v.toFixed(2), draw);
  bindRange('pc-w2', v => v.toFixed(2), draw);
  bindRange('pc-T', v => v.toFixed(2), draw);
  draw();
}

/* ---------- 9.2 Activation functions ---------- */
function initActivations() {
  const F = [
    { n: 'Perceptron (step)', f: z => (z > 0 ? 1 : 0), eq: 'Φ(z) = 1 if z > 0, else 0', r: '{0, 1}', u: 'The original perceptron. Hard yes/no decision. Not differentiable, so it cannot be trained with gradient descent.' },
    { n: 'Sigmoid', f: z => 1 / (1 + Math.exp(-z)), eq: '1 / (1 + e⁻ᶻ)', r: '(0, 1)', u: 'Output reads like a probability; used for binary outputs. Gradients vanish for large |z|.' },
    { n: 'Tanh', f: z => Math.tanh(z), eq: 'tanh(z)', r: '(−1, 1)', u: 'Like sigmoid but zero-centred, which often trains faster in hidden layers.' },
    { n: 'ReLU', f: z => Math.max(0, z), eq: 'max(0, z)', r: '[0, ∞)', u: 'Default in CNN hidden layers: very cheap and avoids vanishing gradients for z > 0. Neurons can "die" if z stays negative.' },
    { n: 'Leaky ReLU', f: z => (z < 0 ? 0.1 * z : z), eq: '0.1z if z < 0, z if z > 0', r: '(−∞, ∞)', u: 'Small slope for negatives keeps every neuron learning (fixes dead ReLUs).' },
    { n: 'ELU', f: z => (z < 0 ? Math.exp(z) - 1 : z), eq: 'eᶻ − 1 if z < 0, z if z > 0', r: '(−1, ∞)', u: 'Smooth for negatives, pushes mean activation towards zero.' },
    { n: 'Softmax', f: z => Math.exp(z) / (Math.exp(z) + 2), eq: 'e^{zⱼ} / Σᵢ e^{zᵢ}', r: '(0, 1), all outputs sum to 1', u: 'Output layer for multi-class problems (dog / cat / lion / bird). Plot shows one output while the other two scores stay at 0.' },
    { n: 'Softplus', f: z => Math.log(1 + Math.exp(z)), eq: 'log(1 + eᶻ)', r: '(0, ∞)', u: 'A smooth version of ReLU.' }
  ];
  const box = $('af-tabs');
  box.innerHTML = F.map((f, i) => `<button class="tab ${i === 3 ? 'on' : ''}" data-i="${i}">${f.n}</button>`).join('');
  const draw = i => {
    const { ctx, W, H } = cv('af-canvas');
    const f = F[i];
    let lo = 0, hi = 0;
    for (let z = -6; z <= 6; z += 0.05) { const v = f.f(z); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const padY = (hi - lo) * 0.1 || 0.1; lo -= padY; hi += padY;
    const sx = z => 30 + (z + 6) / 12 * (W - 40), sy = v => H - 24 - (v - lo) / (hi - lo) * (H - 40);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#c7d2ea'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx(-6), sy(0)); ctx.lineTo(sx(6), sy(0)); ctx.moveTo(sx(0), sy(lo)); ctx.lineTo(sx(0), sy(hi)); ctx.stroke();
    ctx.fillStyle = '#5b6475'; ctx.font = '12px system-ui';
    [-6, -3, 0, 3, 6].forEach(t => ctx.fillText(t, sx(t) - 4, H - 6));
    ctx.fillText(hi.toFixed(2), 2, sy(hi) + 10); ctx.fillText(lo.toFixed(2), 2, sy(lo));
    ctx.strokeStyle = '#2456d6'; ctx.lineWidth = 3; ctx.beginPath();
    for (let z = -6; z <= 6.001; z += 0.02) {
      const X = sx(z), Y = sy(f.f(z));
      z === -6 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
    }
    ctx.stroke();
    $('af-out').innerHTML = `<h4>${f.n}</h4><p><code>${f.eq}</code></p><p><b>Output range:</b> ${f.r}</p><p>${f.u}</p>`;
  };
  tabs('af-tabs', 'i', i => draw(+i));
  draw(3);
}

/* ---------- 9.3 MLP drawing ---------- */
function initMLP() {
  const { ctx, W, H } = cv('mlp-canvas');
  const layers = [
    { n: 6, lab: 'Input xᵢ', sub: '' }, { n: 7, lab: 'Layer A', sub: 'N_A = 48' },
    { n: 5, lab: 'Layer B', sub: 'N_B = 26' }, { n: 4, lab: 'Layer Q (output)', sub: 'N_Q = 4' }
  ];
  const xs = [50, 185, 320, 445];
  const pos = layers.map((L, li) => Array.from({ length: L.n }, (_, k) => [xs[li], 26 + (k + 0.5) * (160 / L.n)]));
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(36,86,214,.18)'; ctx.lineWidth = 1;
  for (let l = 0; l < 3; l++) pos[l].forEach(a => pos[l + 1].forEach(b => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }));
  pos.forEach((P, l) => P.forEach(([x, y], k) => {
    ctx.beginPath(); ctx.arc(x, y, l === 0 ? 5 : 9, 0, 7);
    ctx.fillStyle = l === 0 ? '#1e2430' : '#fff'; ctx.fill(); ctx.strokeStyle = '#2456d6'; ctx.lineWidth = 2; ctx.stroke();
    if (l === 3) { ctx.fillStyle = '#1e2430'; ctx.font = '12px system-ui'; ctx.fillText('Shape ' + (k + 1), x + 14, y + 4); }
  }));
  ctx.fillStyle = '#1e2430'; ctx.font = '600 12px system-ui';
  layers.forEach((L, l) => { ctx.fillText(L.lab, xs[l] - 30, 208); ctx.fillStyle = '#5b6475'; ctx.fillText(L.sub, xs[l] - 22, 224); ctx.fillStyle = '#1e2430'; });
  ctx.fillStyle = '#5b6475'; ctx.font = '12px system-ui';
  ctx.fillText('weights w_ba', 260, 16); ctx.fillText('weights w_qb', 410, 16);
}

/* ---------- 9.4 Convolution stepper ---------- */
function initConv() {
  const I = [[9, 4, 1, 5, 3], [1, 1, 1, 1, 3], [1, 2, 1, 4, 5], [1, 5, 3, 5, 2], [0, 4, 3, 1, 2]];
  const K = [[0, 2, 1], [4, 1, 0], [1, 0, 1]];
  let stride = 1, p = 0;
  const render = () => {
    const O = Rec.conv2d(I, K, stride), n = O.length, total = n * n;
    if (p > total - 1) p = total - 1;
    const r = Math.floor(p / n), c = p % n, r0 = r * stride, c0 = c * stride;
    const inWin = (i, j) => i >= r0 && i < r0 + 3 && j >= c0 && j < c0 + 3;
    const shown = O.map((row, i) => row.map((v, j) => (i * n + j <= p ? v : null)));
    $('cv-mats').innerHTML = `
      <div><h5>Input 5×5</h5>${mat(I, { cls: (i, j) => (inWin(i, j) ? 'hl' : '') })}</div>
      <div><h5>Filter 3×3</h5>${mat(K)}</div>
      <div><h5>Output ${n}×${n} (stride ${stride})</h5>${mat(shown, { cls: (i, j) => (i === r && j === c ? 'cur' : (shown[i][j] === null ? 'empty' : '')) })}</div>`;
    const terms = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) terms.push(`${I[r0 + i][c0 + j]}×${K[i][j]}`);
    $('cv-calc').textContent = `Output[${r}][${c}] = ${terms.join(' + ')} = ${O[r][c]}`;
    $('cv-prev').disabled = p === 0;
    $('cv-next').disabled = p === total - 1;
  };
  $('cv-stride').addEventListener('change', e => { stride = +e.target.value; p = 0; render(); });
  $('cv-prev').addEventListener('click', () => { p--; render(); });
  $('cv-next').addEventListener('click', () => { p++; render(); });
  $('cv-all').addEventListener('click', () => { p = 99; render(); });
  render();
}

function initOutSize() {
  const ids = ['os-n', 'os-f', 'os-s', 'os-p'];
  const run = () => {
    const [N, F, S, P] = ids.map(i => +$(i).value);
    if (!(S > 0) || F > N + 2 * P) { $('os-out').innerHTML = '<span class="bad">Filter is larger than the (padded) input, or stride is 0.</span>'; return; }
    const v = Rec.outSize(N, F, S, P);
    const ok = Number.isInteger(v);
    $('os-out').innerHTML = `(${N} − ${F} + 2×${P}) / ${S} + 1 = <b>${+v.toFixed(3)}</b> → output is <b>${Math.floor(v)} × ${Math.floor(v)}</b>` +
      (ok ? '' : ' <span class="bad">(not a whole number: the filter does not fit evenly, so the last partial step is dropped)</span>');
  };
  ids.forEach(i => $(i).addEventListener('input', run));
  run();
}

function initPooling() {
  const M = [[1, 3, 2, 1], [4, 6, 5, 2], [3, 1, 1, 0], [1, 2, 2, 4]];
  const col = ['#dbe7ff', '#ffe3c2', '#d6f5e0', '#f1ddff'];
  const q = (i, j) => (i < 2 ? 0 : 2) + (j < 2 ? 0 : 1);
  const render = mode => {
    const O = [[0, 0], [0, 0]].map((row, a) => row.map((_, b) => {
      const v = [M[2 * a][2 * b], M[2 * a][2 * b + 1], M[2 * a + 1][2 * b], M[2 * a + 1][2 * b + 1]];
      return mode === 'max' ? Math.max(...v) : v.reduce((s, x) => s + x, 0) / 4;
    }));
    $('pl-mats').innerHTML = `
      <div><h5>Input 4×4</h5>${mat(M, { style: (i, j) => `background:${col[q(i, j)]}` })}</div>
      <div><h5>${mode === 'max' ? 'Max' : 'Average'} pool, 2×2, stride 2 → 2×2</h5>${mat(O, { dec: mode === 'max' ? 0 : 2, style: (i, j) => `background:${col[i * 2 + j]}` })}</div>`;
  };
  tabs('pl-tabs', 'm', render);
  render('max');
}

/* ---------- 10. YOLO grid + IoU ---------- */
function initYOLO() {
  const GT = { x: 110, y: 130, w: 170, h: 200 };
  const draw = () => {
    const { ctx, W, H } = cv('yo-canvas');
    const S = +$('yo-s').value, dx = +$('yo-dx').value, dy = +$('yo-dy').value, sc = +$('yo-sc').value;
    const cx = GT.x + GT.w / 2, cy = GT.y + GT.h / 2;
    const P = { w: GT.w * sc, h: GT.h * sc };
    P.x = cx + dx - P.w / 2; P.y = cy + dy - P.h / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#eef3ea'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#d9e4f5'; ctx.fillRect(0, 0, W, 120);
    // simple "object" (a stylised animal silhouette)
    ctx.fillStyle = '#6b5a45';
    ctx.beginPath(); ctx.ellipse(cx, cy + 30, 60, 70, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy - 55, 38, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 34, cy - 70); ctx.lineTo(cx - 28, cy - 110); ctx.lineTo(cx - 10, cy - 84); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 34, cy - 70); ctx.lineTo(cx + 28, cy - 110); ctx.lineTo(cx + 10, cy - 84); ctx.fill();
    const cell = W / S, ci = Math.floor(cx / cell), cj = Math.floor(cy / cell);
    ctx.fillStyle = 'rgba(255,208,67,.55)'; ctx.fillRect(ci * cell, cj * cell, cell, cell);
    ctx.strokeStyle = 'rgba(30,36,48,.35)'; ctx.lineWidth = 1;
    for (let k = 1; k < S; k++) { ctx.beginPath(); ctx.moveTo(k * cell, 0); ctx.lineTo(k * cell, H); ctx.moveTo(0, k * cell); ctx.lineTo(W, k * cell); ctx.stroke(); }
    const R = Rec.iou(GT, P);
    // intersection
    const ix0 = Math.max(GT.x, P.x), iy0 = Math.max(GT.y, P.y), ix1 = Math.min(GT.x + GT.w, P.x + P.w), iy1 = Math.min(GT.y + GT.h, P.y + P.h);
    if (ix1 > ix0 && iy1 > iy0) { ctx.fillStyle = 'rgba(36,86,214,.22)'; ctx.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0); }
    ctx.lineWidth = 3; ctx.strokeStyle = '#2f9e44'; ctx.strokeRect(GT.x, GT.y, GT.w, GT.h);
    ctx.setLineDash([8, 5]); ctx.strokeStyle = '#2456d6'; ctx.strokeRect(P.x, P.y, P.w, P.h); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.fillStyle = '#c23b3b'; ctx.fill();
    ctx.font = '600 13px system-ui';
    ctx.fillStyle = '#2f9e44'; ctx.fillText('ground truth', GT.x + 4, GT.y - 6);
    ctx.fillStyle = '#2456d6'; ctx.fillText('prediction', P.x + 4, P.y + P.h + 16);

    const v = R.iou;
    $('yo-out').innerHTML = `
      <p>Object centre (red dot) falls in grid cell <b>(row ${cj + 1}, column ${ci + 1})</b>, so that cell is responsible for this object.</p>
      <p>IoU = intersection / union = ${Math.round(R.inter)} / ${Math.round(R.uni)} = <b class="big">${v.toFixed(3)}</b><br>
      ${v >= 0.5 ? '<span class="ok">IoU ≥ 0.5: usually counted as a correct detection.</span>' : '<span class="bad">IoU &lt; 0.5: usually counted as a miss.</span>'}</p>
      <p class="note">In the original YOLO, each cell predicts B = 2 boxes (x, y, w, h, confidence) plus C = 20 class probabilities, so the output tensor is S × S × (B·5 + C) = <b>${S} × ${S} × 30</b>${S === 7 ? ' (the 7×7×30 output of the original network)' : ''}.</p>`;
  };
  bindRange('yo-s', null, draw);
  bindRange('yo-dx', v => v + ' px', draw);
  bindRange('yo-dy', v => v + ' px', draw);
  bindRange('yo-sc', v => v.toFixed(2) + '×', draw);
  draw();
}

/* ---------- 10. Faster R-CNN stages ---------- */
function initFasterRCNN() {
  const S = [
    ['Input image', 'The whole image enters the network once.'],
    ['Conv layers (backbone)', 'A deep CNN such as VGG or ResNet extracts feature maps from the image. These features are shared by both later stages, which saves time.'],
    ['Region Proposal Network', 'A small network slides over the feature map. At each sliding-window position it predicts several candidate boxes (anchors of different sizes and shapes) and scores how likely each contains an object. The RPN and the detector are trained together.'],
    ['Region proposals', 'The best-scoring candidate boxes are kept as region proposals. Because they come from inside the network, no slow external proposal method is needed.'],
    ['RoI pooling', 'Each proposal, whatever its size, is cut from the shared feature map and pooled to a fixed size (try the demo below). This idea, plus not caching features on disk, came from Fast R-CNN.'],
    ['Classifier + box regressor', 'Fully connected layers give the class of each region and refine its box. Truncated SVD compresses these layers to cut detection time with little loss of accuracy.']
  ];
  const box = $('fr-stages');
  box.innerHTML = S.map((s, i) => `${i ? '<span class="arrow">→</span>' : ''}<button class="box stage ${i === 0 ? 'on' : ''}" data-i="${i}">${s[0]}</button>`).join('');
  const show = i => {
    box.querySelectorAll('.stage').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
    $('fr-desc').innerHTML = `<b>Stage ${i + 1}: ${S[i][0]}.</b> ${S[i][1]}`;
  };
  box.addEventListener('click', e => { const b = e.target.closest('.stage'); if (b) show(+b.dataset.i); });
  show(0);
}

function initRoI() {
  const rnd = mulberry32(5);
  const col = ['#dbe7ff', '#ffe3c2', '#d6f5e0', '#f1ddff'];
  const render = () => {
    const [h, w] = $('roi-size').value.split('x').map(Number);
    const M = Array.from({ length: h }, () => Array.from({ length: w }, () => Math.floor(rnd() * 9) + 1));
    const q = (i, j) => (i < h / 2 ? 0 : 2) + (j < w / 2 ? 0 : 1);
    const O = [[-1, -1], [-1, -1]];
    M.forEach((r, i) => r.forEach((v, j) => { const k = q(i, j); const a = k >> 1, b = k & 1; O[a][b] = Math.max(O[a][b], v); }));
    $('roi-mats').innerHTML = `
      <div><h5>Proposal region ${h}×${w}</h5>${mat(M, { style: (i, j) => `background:${col[q(i, j)]}` })}</div>
      <div><h5>RoI pooled → always 2×2</h5>${mat(O, { style: (i, j) => `background:${col[i * 2 + j]}` })}</div>`;
  };
  $('roi-size').addEventListener('change', render);
  render();
}

/* ---------- 11.1 Grammar derivation and recognizer ---------- */
function initGrammar() {
  const RULES = [['S', 'aA'], ['A', 'bA'], ['A', 'bB'], ['B', 'c']];
  const MAX_BA = 10;
  let form = 'S', chain = ['S'], nBA = 0;
  const btns = [...document.querySelectorAll('#gr-btns [data-r]')];

  const draw = () => {
    const { ctx, W, H } = cv('gr-canvas');
    ctx.clearRect(0, 0, W, H);
    let x = 60; const y = 75;
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    const dot = (px) => { ctx.beginPath(); ctx.arc(px, y, 5, 0, 7); ctx.fillStyle = '#1e2430'; ctx.fill(); };
    ctx.font = '600 13px system-ui';
    for (const ch of form) {
      if (ch === 'a') {
        ctx.strokeStyle = '#2456d6';
        ctx.beginPath(); ctx.moveTo(x - 38, y - 38); ctx.lineTo(x, y); ctx.lineTo(x - 38, y + 38); ctx.stroke();
        dot(x); ctx.fillStyle = '#2456d6'; ctx.fillText('a', x - 30, y + 4);
      } else if (ch === 'b') {
        ctx.strokeStyle = '#2f9e44';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40, y); ctx.stroke();
        x += 40; dot(x); ctx.fillStyle = '#2f9e44'; ctx.fillText('b', x - 24, y - 10);
      } else if (ch === 'c') {
        ctx.strokeStyle = '#e8590c';
        ctx.beginPath(); ctx.moveTo(x + 38, y - 38); ctx.lineTo(x, y); ctx.lineTo(x + 38, y + 38); ctx.stroke();
        dot(x); ctx.fillStyle = '#e8590c'; ctx.fillText('c', x + 24, y + 4);
      } else {
        ctx.strokeStyle = '#9aa3b5'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 8, y - 16, 32, 32); ctx.setLineDash([]); ctx.lineWidth = 3;
        ctx.fillStyle = '#5b6475'; ctx.font = '600 16px system-ui'; ctx.fillText(ch, x + 18, y + 6); ctx.font = '600 13px system-ui';
      }
    }
  };

  const render = () => {
    $('gr-deriv').textContent = chain.join('  ⇒  ');
    btns.forEach((b, i) => {
      const [lhs] = RULES[i];
      b.disabled = !form.includes(lhs) || (i === 1 && nBA >= MAX_BA);
    });
    const done = !/[A-Z]/.test(form);
    const n = (form.match(/b/g) || []).length;
    $('gr-msg').innerHTML = done
      ? `<span class="ok">✔ Derivation complete. No non-terminals remain. String = <code>${form}</code> = a b<sup>${n}</sup> c ∈ L(G).</span>`
      : (nBA >= MAX_BA && form.includes('A')
        ? '<span class="bad">Semantic rule reached: A → bA cannot be applied more than 10 times. Finish with A → bB.</span>'
        : `Current sentential form: <code>${form}</code>. Pick a production whose left side appears in it.`);
    draw();
  };

  btns.forEach((b, i) => b.addEventListener('click', () => {
    const [lhs, rhs] = RULES[i];
    if (!form.includes(lhs)) return;
    form = form.replace(lhs, rhs); chain.push(form);
    if (i === 1) nBA++;
    render();
  }));
  $('gr-reset').addEventListener('click', () => { form = 'S'; chain = ['S']; nBA = 0; render(); });
  render();

  const recIn = $('gr-str');
  const rec = () => {
    const s = recIn.value.trim();
    const R = Rec.automaton(s);
    const nb = (s.match(/b/g) || []).length;
    const semOK = nb <= MAX_BA + 1;
    $('gr-rec').innerHTML = `
      <p class="bits">${R.trace.map(t => `${t.from} —${esc(t.ch)}→ ${t.to}`).join('   ') || '(empty string)'}</p>
      <p>Syntax: ${R.accepted ? '<span class="ok">accepted (string is in L(G))</span>' : `<span class="bad">rejected${R.stopped ? ' (no transition for a symbol)' : ` (ended in ${R.end}, not q<sub>F</sub>)`}</span>`}
      ${R.accepted ? `· Semantics: ${semOK ? `<span class="ok">OK (${nb} b's, at most 11 allowed)</span>` : `<span class="bad">violated: ${nb} b's, but A → bA may be used at most 10 times (max 11 b's)</span>`}` : ''}</p>`;
  };
  recIn.addEventListener('input', rec);
  rec();
}

/* ---------- 11.2 Shape numbers ---------- */
function initShapeNumbers() {
  const inp = $('sn-chain');
  const DIR = { 0: [1, 0], 1: [0, 1], 2: [-1, 0], 3: [0, -1] };
  const run = () => {
    const raw = inp.value.replace(/\s/g, '');
    if (!/^[0-3]*$/.test(raw)) { $('sn-out').innerHTML = '<span class="bad">Use only digits 0, 1, 2, 3.</span>'; return; }
    if (!raw) { $('sn-out').innerHTML = 'Type a chain code.'; return; }
    const c = [...raw].map(Number);
    const d = Rec.chainDiff(c);
    const sn = Rec.minRotation(d);
    // path
    const pts = [[0, 0]];
    c.forEach(k => { const [x, y] = pts[pts.length - 1]; pts.push([x + DIR[k][0], y + DIR[k][1]]); });
    const end = pts[pts.length - 1];
    const closed = end[0] === 0 && end[1] === 0;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const { ctx, W, H } = cv('sn-canvas');
    const s = Math.min((W - 60) / Math.max(1, maxX - minX), (H - 60) / Math.max(1, maxY - minY), 60);
    const ox = (W - (maxX - minX) * s) / 2 - minX * s, oy = (H + (maxY - minY) * s) / 2 + minY * s;
    const P = p => [ox + p[0] * s, oy - p[1] * s];
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#c7d2ea';
    for (let gx = minX; gx <= maxX; gx++) for (let gy = minY; gy <= maxY; gy++) { const [X, Y] = P([gx, gy]); ctx.fillRect(X - 1.5, Y - 1.5, 3, 3); }
    ctx.strokeStyle = '#2456d6'; ctx.lineWidth = 3; ctx.beginPath();
    pts.forEach((p, i) => { const [X, Y] = P(p); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
    ctx.fillStyle = '#c23b3b'; ctx.font = '600 13px system-ui';
    c.forEach((k, i) => {
      const [X0, Y0] = P(pts[i]), [X1, Y1] = P(pts[i + 1]);
      ctx.fillText(k, (X0 + X1) / 2 + (k % 2 ? 6 : -4), (Y0 + Y1) / 2 + (k % 2 ? 4 : -6));
    });
    const [sx0, sy0] = P(pts[0]); ctx.beginPath(); ctx.arc(sx0, sy0, 6, 0, 7); ctx.fillStyle = '#1e2430'; ctx.fill();

    const rows = (lab, arr, hl) => `<tr><th>${lab}</th>${arr.map((v, i) => `<td${hl && hl(i) ? ' style="background:#ffe8a3"' : ''}>${v}</td>`).join('')}</tr>`;
    $('sn-out').innerHTML = `
      <div class="scroll"><table class="tbl">
        ${rows('Chain code', c)}
        ${rows('Difference', d, i => i === sn.at)}
        ${rows('Shape no.', [...sn.shape])}
      </table></div>
      <p class="note">Difference[0] = (${c[0]} − ${c[c.length - 1]}) mod 4 = ${d[0]} (compared with the last element). The highlighted digit is where the smallest rotation starts.</p>
      <p>Shape number = <b class="big">${sn.shape}</b> · Order n = <b>${c.length}</b></p>
      ${closed ? '<p class="ok">✔ Closed boundary (returns to the start dot).</p>' : '<p class="bad">Warning: this chain does not return to its start, so it is not a closed boundary.</p>'}`;
  };
  inp.addEventListener('input', run);
  document.querySelectorAll('.sn-pre').forEach(b => b.addEventListener('click', () => { inp.value = b.dataset.c; run(); }));
  run();
}

/* ---------- 11.2 Similarity matrix / tree  ---------- */
function initSimilarity() {
  const L = ['a', 'b', 'c', 'd', 'e', 'f'];
  const K = { ab: 6, ac: 6, ad: 6, ae: 6, af: 6, bc: 8, bd: 8, be: 10, bf: 8, cd: 8, ce: 8, cf: 12, de: 8, df: 8, ef: 8 };
  const k = (x, y) => (x === y ? Infinity : K[[x, y].sort().join('')]);
  const A = $('sm-a'), B = $('sm-b');
  A.innerHTML = B.innerHTML = L.map(l => `<option value="${l}">shape ${l}</option>`).join('');
  A.value = 'f'; B.value = 'c';
  const render = (note) => {
    const x = A.value, y = B.value, kv = k(x, y);
    $('sm-out').innerHTML = (note || '') + (x === y
      ? `Same shape: k = ∞, D = 0.`
      : `k(${x}, ${y}) = <b>${kv}</b> · D(${x}, ${y}) = 1/${kv} = <b>${(1 / kv).toFixed(4)}</b>`);
    $('sm-matrix').innerHTML = `<table class="tbl"><tr><th></th>${L.map(l => `<th>${l}</th>`).join('')}</tr>
      ${L.map((r, i) => `<tr><th>${r}</th>${L.map((cc, j) => {
        const sel = (r === x && cc === y) || (r === y && cc === x);
        const v = j < i ? '' : (j === i ? '∞' : k(r, cc));
        return `<td${sel && j >= i ? ' style="background:#ffd043;font-weight:700"' : ''}>${v}</td>`;
      }).join('')}</tr>`).join('')}</table>`;
  };
  const TREE = [[4, ['abcdef']], [6, ['abcdef']], [8, ['a', 'bcdef']], [10, ['a', 'd', 'cf', 'be']], [12, ['a', 'd', 'cf', 'b', 'e']], [14, ['a', 'd', 'c', 'f', 'b', 'e']]];
  $('sm-tree').innerHTML = `<table class="tbl"><tr><th>Degree</th><th>Groups that still match</th></tr>
    ${TREE.map(([d, g]) => `<tr><td>${d}</td><td style="text-align:left">${g.map(s => `<code>${s}</code>`).join(' ')}</td></tr>`).join('')}</table>`;
  A.addEventListener('change', () => render());
  B.addEventListener('change', () => render());
  $('sm-best').addEventListener('click', () => {
    let best = null;
    L.filter(l => l !== 'f').forEach(l => { if (!best || k('f', l) > k('f', best)) best = l; });
    A.value = 'f'; B.value = best;
    render(`Best match for f is <b>${best}</b> (highest k). `);
  });
  render();
}

/* ---------- 11.3 String matching ---------- */
function initStringMatch() {
  const run = () => {
    const a = $('st-a').value, b0 = $('st-b').value, cyc = $('st-cyc').checked;
    let best = { b: b0, shift: 0, ...Rec.strMatch(a, b0) };
    if (cyc && b0.length) {
      for (let s = 1; s < b0.length; s++) {
        const b = b0.slice(s) + b0.slice(0, s), r = Rec.strMatch(a, b);
        if (r.alpha > best.alpha) best = { b, shift: s, ...r };
      }
    }
    const b = best.b, n = Math.max(a.length, b.length);
    const cell = (s, i) => {
      const ok = i < a.length && i < b.length && a[i] === b[i];
      return `<span class="c ${ok ? 'm' : 'x'}">${i < s.length ? esc(s[i]) : '·'}</span>`;
    };
    const row = s => Array.from({ length: n }, (_, i) => cell(s, i)).join('');
    $('st-out').innerHTML = `
      <div class="cells"><div>a: ${row(a)}</div><div>b: ${row(b)}${cyc ? ` <span class="note">(b shifted by ${best.shift})</span>` : ''}</div></div>
      <p>α (matches) = <b>${best.alpha}</b> · β = max(${a.length}, ${b.length}) − ${best.alpha} = <b>${best.beta}</b> ·
      R = α/β = <b class="big">${best.R === Infinity ? '∞ (identical)' : best.R.toFixed(3)}</b></p>`;
  };
  ['st-a', 'st-b'].forEach(i => $(i).addEventListener('input', run));
  $('st-cyc').addEventListener('change', run);
  run();
}

if (typeof module !== 'undefined') module.exports = Rec;
