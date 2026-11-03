/* =====================================================================
   Part A UI: image compression demos. Everything runs in the browser.
   ===================================================================== */

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vis = c => (c === ' ' ? '␣' : c === '\n' ? '⏎' : esc(c));
const fmt = (v, d = 2) => (Number.isFinite(v) ? (+v.toFixed(d)).toLocaleString('en-IN') : '∞');

document.addEventListener('DOMContentLoaded', () => {
  [initImageControls, initWhy, initDPCMRow, initDPCMImage, initQuantExample, initChroma, initLossy,
    initRLE, initBinRLE, initHuffman, initLZW, initDCTBasis, initDCTKeep, initDWT, initJPEG, initJPEGImage, initQuiz]
    .forEach(f => { try { f(); } catch (e) { console.error(f.name, e); } });
});

/* ---------- Shared helpers ---------- */
function cTabs(groupId, attr, onPick) {
  const g = $(groupId);
  g.addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (!b) return;
    g.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === b));
    onPick(b.dataset[attr]);
  });
}
function cRange(id, show, onChange) {
  const el = $(id), lab = $(id + '-v');
  const upd = () => { if (lab) lab.textContent = show ? show(+el.value) : el.value; };
  el.addEventListener('input', () => { upd(); onChange(); });
  upd();
}
function ctx2d(id) {
  const c = $(id);
  const W = +c.getAttribute('width'), H = +c.getAttribute('height');
  if (c.width !== W) { c.width = W; c.height = H; }
  return { c, ctx: c.getContext('2d'), W, H };
}
function putGray(id, g, W, H, map) {
  const { ctx } = ctx2d(id);
  const im = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const v = map ? map(g[i]) : g[i];
    im.data[4 * i] = im.data[4 * i + 1] = im.data[4 * i + 2] = v; im.data[4 * i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}
function putRGBA(id, data, W, H) {
  const { ctx } = ctx2d(id);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data), W, H), 0, 0);
}

/* ---------- Test images (generated in the browser, or the user's own file) ---------- */
const IMG = {
  W: 192, H: 192, rgba: null, gray: null, kind: 'scene', subs: [],
  set(rgba) {
    this.rgba = rgba;
    const n = this.W * this.H;
    this.gray = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) this.gray[i] = Math.round(0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2]);
    this.subs.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  },
  on(f) { this.subs.push(f); if (this.rgba) f(); }
};

function makeScene(kind, W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (kind === 'scene') {
    const sky = g.createLinearGradient(0, 0, 0, H * 0.6);
    sky.addColorStop(0, '#2f6fd6'); sky.addColorStop(1, '#bfe0ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(W * 0.78, H * 0.2, 18, 0, 7); g.fill();
    g.fillStyle = '#3e8e41'; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) g.lineTo(x, H * 0.62 + 10 * Math.sin(x / 17));
    g.lineTo(W, H); g.fill();
    g.fillStyle = '#c0392b'; g.fillRect(28, 92, 62, 50);
    g.fillStyle = '#7b241c'; g.beginPath(); g.moveTo(22, 94); g.lineTo(59, 64); g.lineTo(96, 94); g.fill();
    g.fillStyle = '#fff'; g.fillRect(40, 104, 16, 16);
    g.strokeStyle = '#333'; g.lineWidth = 1;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(40 + 4 * k + 0.5, 104); g.lineTo(40 + 4 * k + 0.5, 120); g.stroke(); }
    g.fillStyle = '#5a3a1a'; g.fillRect(66, 116, 14, 26);
    g.fillStyle = '#111'; g.font = 'bold 30px sans-serif'; g.fillText('DIP', 110, 178);
    g.fillStyle = '#fff'; g.fillRect(118, 92, 54, 34);
    g.fillStyle = '#d6336c'; g.font = '11px sans-serif'; g.fillText('8×8 DCT', 122, 113);
  } else if (kind === 'text') {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#000'; g.font = 'bold 22px sans-serif'; g.fillText('JPEG', 10, 30);
    g.font = '13px sans-serif'; g.fillText('Sharp edges ring', 10, 52); g.fillText('after quantization.', 10, 68);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if ((x + y) % 2) g.fillRect(12 + x * 8, 84 + y * 8, 8, 8);
    for (let k = 0; k < 10; k++) { g.fillRect(80 + k * 6, 84, 2, 48); }
    g.lineWidth = 2; g.strokeStyle = '#0a58ca';
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(10, 150 + k * 6); g.lineTo(180, 140 + k * 8); g.stroke(); }
    g.fillStyle = '#e03131'; g.beginPath(); g.arc(160, 100, 20, 0, 7); g.fill();
  } else {
    const rg = g.createRadialGradient(W * 0.35, H * 0.35, 5, W * 0.5, H * 0.5, W * 0.75);
    rg.addColorStop(0, '#fff3bf'); rg.addColorStop(0.5, '#f08c00'); rg.addColorStop(1, '#5f3dc4');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }
  return g.getImageData(0, 0, W, H).data;
}

function loadUserImage(file) {
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas');
    c.width = IMG.W; c.height = IMG.H;
    const g = c.getContext('2d');
    const s = Math.max(IMG.W / im.width, IMG.H / im.height);       // cover, centre-crop
    const w = im.width * s, h = im.height * s;
    g.drawImage(im, (IMG.W - w) / 2, (IMG.H - h) / 2, w, h);
    URL.revokeObjectURL(url);
    IMG.kind = 'user';
    syncImageSelects();
    IMG.set(g.getImageData(0, 0, IMG.W, IMG.H).data);
  };
  im.src = url;
}

function syncImageSelects() {
  document.querySelectorAll('.img-src').forEach(s => {
    if (IMG.kind === 'user' && !s.querySelector('option[value=user]')) s.insertAdjacentHTML('beforeend', '<option value="user">Your image</option>');
    s.value = IMG.kind;
  });
}

function initImageControls() {
  document.querySelectorAll('.img-ctrl').forEach(box => {
    box.innerHTML = `
      <label>Test image
        <select class="img-src">
          <option value="scene">Synthetic scene</option>
          <option value="text">Text &amp; sharp edges</option>
          <option value="smooth">Smooth gradient</option>
        </select>
      </label>
      <label class="upload">Use your own image <input type="file" accept="image/*" class="img-up"></label>
      <span class="note">Your image stays in your browser; nothing is uploaded.</span>`;
  });
  document.querySelectorAll('.img-src').forEach(s => s.addEventListener('change', () => {
    if (s.value === 'user') return;
    IMG.kind = s.value; syncImageSelects();
    IMG.set(makeScene(IMG.kind, IMG.W, IMG.H));
  }));
  document.querySelectorAll('.img-up').forEach(inp => inp.addEventListener('change', () => {
    if (inp.files && inp.files[0]) loadUserImage(inp.files[0]);
    inp.value = '';
  }));
  IMG.set(makeScene('scene', IMG.W, IMG.H));
}

/* ---------- 1. Compression ratio calculator ---------- */
function initWhy() {
  const ids = ['cr-w', 'cr-h', 'cr-b', 'cr-c', 'cr-kb'];
  const run = () => {
    const [w, h, b, c, kb] = ids.map(i => +$(i).value);
    const n1 = w * h * b, n2 = c * kb * 8;
    if (!(n1 > 0 && n2 > 0)) { $('cr-out').innerHTML = '<p class="bad">Enter positive values.</p>'; return; }
    const CR = n1 / n2, R = 1 - 1 / CR;
    $('cr-out').innerHTML = `
      <table class="tbl">
        <tr><td>Original size n₁</td><td>${w} × ${h} × ${b} bits = <b>${fmt(n1, 0)} bits</b> = ${fmt(n1 / 8, 0)} bytes = <b>${fmt(n1 / 8 / kb, 2)} KB</b></td></tr>
        <tr><td>Compressed size n₂</td><td>${fmt(c, 3)} KB × ${kb} × 8 = <b>${fmt(n2, 0)} bits</b></td></tr>
        <tr><td>Compression ratio CR = n₁ / n₂</td><td><b class="big">${fmt(CR, 3)} : 1</b></td></tr>
        <tr><td>Percent reduction = (n₁ − n₂) / n₁ × 100</td><td><b>${fmt(100 * R, 3)} %</b></td></tr>
        <tr><td>Relative redundancy R = 1 − 1/CR</td><td>${fmt(R, 4)}</td></tr>
        <tr><td>Compressed payload = (1/CR) × 100</td><td>${fmt(100 / CR, 2)} % of the original</td></tr>
      </table>
      ${CR < 1 ? '<p class="bad">CR &lt; 1: the "compressed" file is larger than the original (data expansion).</p>' : ''}`;
  };
  ids.forEach(i => $(i).addEventListener('input', run));
  run();
}

/* ---------- 2.2 DPCM ---------- */
function initDPCMRow() {
  const inp = $('dp-row');
  const run = () => {
    const v = inp.value.split(/[ ,;]+/).filter(Boolean).map(Number);
    if (!v.length || v.some(x => !Number.isFinite(x))) { $('dp-out').innerHTML = '<p class="bad">Enter numbers separated by commas.</p>'; return; }
    const r = DPCM.row(v);
    const dec = []; r.forEach((o, i) => dec.push(i ? dec[i - 1] + o.e : o.e));
    const ok = dec.every((x, i) => x === v[i]);
    $('dp-out').innerHTML = `
      <div class="scroll"><table class="tbl wide">
        <tr><th>Pixel x</th>${v.map(x => `<td>${x}</td>`).join('')}</tr>
        <tr><th>Prediction x̂</th>${r.map(o => `<td>${o.pred ?? '—'}</td>`).join('')}</tr>
        <tr><th>Sent: e = x − x̂</th>${r.map((o, i) => `<td${i ? '' : ' class="note"'}><b>${o.e}</b></td>`).join('')}</tr>
        <tr><th>Decoder: x̂ + e</th>${dec.map(x => `<td>${x}</td>`).join('')}</tr>
      </table></div>
      <p>Range of values: original ${Math.min(...v)} to ${Math.max(...v)}; errors (after the first) ${Math.min(...r.slice(1).map(o => o.e))} to ${Math.max(...r.slice(1).map(o => o.e))}.
      Small errors need far fewer bits. ${ok ? '<span class="ok">✔ Decoder output equals the input (lossless).</span>' : ''}</p>`;
  };
  inp.addEventListener('input', run);
  run();
}

function initDPCMImage() {
  IMG.on(() => {
    const { W, H, gray } = IMG;
    const e = DPCM.image(gray, W, H);
    putGray('dp-img', gray, W, H);
    putGray('dp-err', e, W, H, v => 128 + 2 * v);
    const H0 = Metrics.entropy(gray), H1 = Metrics.entropy(e);
    const small = e.filter(v => Math.abs(v) <= 4).length / e.length * 100;
    $('dp-img-out').innerHTML = `
      <p>Entropy of the pixels: <b>${H0.toFixed(2)} bits/pixel</b> → entropy of the prediction errors: <b>${H1.toFixed(2)} bits/pixel</b>.
      ${small.toFixed(0)}% of the errors lie between −4 and +4.
      An entropy coder needs roughly ${H1.toFixed(2)} instead of ${H0.toFixed(2)} bits per pixel, a possible lossless ratio of about <b>${(8 / Math.max(H1, 0.01)).toFixed(2)} : 1</b> against 8-bit storage.</p>`;
  });
}

/* ---------- 2.3 Quantization example ---------- */
function initQuantExample() {
  const draw = () => {
    const v = +$('qx-v').value, s = +$('qx-s').value;
    const q = Math.round(v / s), rec = q * s;
    const lo = Math.max(0, Math.ceil((q - 0.5) * s)), hi = Math.min(255, Math.ceil((q + 0.5) * s) - 1);
    const { ctx, W, H } = ctx2d('qx-canvas');
    const X = x => 16 + x / 255 * (W - 32);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(36,86,214,.15)'; ctx.fillRect(X(lo), 30, Math.max(2, X(hi) - X(lo)), 30);
    ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 1;
    for (let k = 0; k * s <= 255; k++) { const x = X(Math.min(255, (k + 0.5) * s)); ctx.beginPath(); ctx.moveTo(x, 26); ctx.lineTo(x, 64); ctx.stroke(); }
    ctx.strokeStyle = '#1e2430'; ctx.beginPath(); ctx.moveTo(X(0), 45); ctx.lineTo(X(255), 45); ctx.stroke();
    ctx.fillStyle = '#e8590c'; ctx.beginPath(); ctx.arc(X(v), 45, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#2456d6'; ctx.beginPath(); ctx.moveTo(X(rec), 36); ctx.lineTo(X(rec) + 6, 45); ctx.lineTo(X(rec), 54); ctx.lineTo(X(rec) - 6, 45); ctx.fill();
    ctx.font = '12px system-ui'; ctx.fillStyle = '#5b6475';
    ctx.fillText('0', X(0) - 3, 82); ctx.fillText('255', X(255) - 10, 82);
    ctx.fillStyle = '#e8590c'; ctx.fillText(`value ${v}`, X(v) - 22, 20);
    ctx.fillStyle = '#2456d6'; ctx.fillText(`reconstructed ${rec}`, Math.min(X(rec) - 40, W - 120), 100);
    $('qx-out').innerHTML = `
      <p class="bits">${v} / ${s} = ${(v / s).toFixed(3)} → round → <b>q = ${q}</b> (stored) · decoder: ${q} × ${s} = <b>${rec}</b> · error = ${v - rec}</p>
      <p><b>Many-to-one:</b> every value from <b>${lo}</b> to <b>${hi}</b> (the shaded band, ${hi - lo + 1} values) is stored as q = ${q} and comes back as ${rec}. The decoder cannot tell them apart, so quantization is irreversible.
      Small steps are used for low frequencies, where errors are visible; large steps for high frequencies, where the eye is less sensitive and many coefficients become exactly 0.</p>`;
  };
  cRange('qx-v', null, draw);
  cRange('qx-s', null, draw);
  draw();
}

/* ---------- 2.4 Chroma subsampling ---------- */
function initChroma() {
  const run = () => {
    if (!IMG.rgba) return;
    const { W, H, rgba } = IMG, n = W * H;
    const mode = $('ch-mode').value, onLuma = $('ch-luma').checked;
    const f = { 444: [1, 1], 422: [2, 1], 420: [2, 2], 410: [4, 4] }[mode];
    const { Y, Cb, Cr } = Color.toYCC(rgba, n);
    let Y2 = Y, Cb2 = Cb, Cr2 = Cr;
    if (onLuma) Y2 = Color.subsample(Y, W, H, f[0], f[1]);
    else { Cb2 = Color.subsample(Cb, W, H, f[0], f[1]); Cr2 = Color.subsample(Cr, W, H, f[0], f[1]); }
    const out = Color.toRGBA(Y2, Cb2, Cr2, n);
    putRGBA('ch-orig', rgba, W, H);
    putRGBA('ch-rec', out, W, H);
    putGray('ch-y', Y2, W, H, v => Math.round(v));
    putGray('ch-cb', Cb2, W, H, v => Math.round(v));
    putGray('ch-cr', Cr2, W, H, v => Math.round(v));
    const a = [], b = [];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { a.push(rgba[4 * i + c]); b.push(out[4 * i + c]); }
    const p = Metrics.psnr(a, b);
    const chromaFrac = 1 / (f[0] * f[1]);
    const samples = onLuma ? (chromaFrac + 2) : (1 + 2 * chromaFrac);
    $('ch-cap').textContent = onLuma ? 'Reconstructed (luma reduced)' : 'Reconstructed (chroma reduced)';
    $('ch-out').innerHTML = `
      <p>Samples per pixel: <b>${samples.toFixed(3)}</b> instead of 3 → <b>${(100 * (1 - samples / 3)).toFixed(1)}%</b> less raw data. PSNR = <b>${Number.isFinite(p) ? p.toFixed(2) + ' dB' : '∞ (identical)'}</b>.</p>
      <p class="note">${onLuma
        ? 'Reducing <b>luma</b> by the same factor visibly blurs edges and text: the eye is very sensitive to brightness detail. Untick the box to compare.'
        : 'With <b>chroma</b> reduced, the picture still looks sharp, because edges and texture live in Y. This is why JPEG and video subsample chroma (4:2:0) by default. Tick the box to try the same on Y.'}</p>`;
  };
  $('ch-mode').addEventListener('change', run);
  $('ch-luma').addEventListener('change', run);
  IMG.on(run);
}

/* ---------- 4. Lossy row demo ---------- */
function initLossy() {
  const s = $('lossy-s'), o = $('lossy-out');
  const px = [52, 55, 61, 66, 70, 61, 64, 73, 200, 205, 198, 210];
  const run = () => {
    const step = +s.value;
    $('lossy-s-val').textContent = step;
    const rec = px.map(v => Math.round(v / step) * step);
    const err = px.map((v, i) => Math.abs(v - rec[i]));
    const mae = (err.reduce((a, b) => a + b, 0) / px.length).toFixed(2);
    o.innerHTML = `
      <table class="tbl wide">
        <tr><th>Original</th>${px.map(v => `<td>${v}</td>`).join('')}</tr>
        <tr><th>Step ${step}</th>${rec.map(v => `<td>${v}</td>`).join('')}</tr>
        <tr><th>Error</th>${err.map(v => `<td>${v}</td>`).join('')}</tr>
      </table>
      <p>Mean absolute error <b>${mae}</b> · distinct values: ${new Set(px).size} → <b>${new Set(rec).size}</b> ·
      entropy ${Metrics.entropy(px).toFixed(2)} → <b>${Metrics.entropy(rec).toFixed(2)}</b> bits/value.</p>`;
  };
  s.addEventListener('input', run);
  run();
}

/* ---------- 5. RLE ---------- */
function initRLE() {
  const input = $('rle-input'), out = $('rle-out'), style = $('rle-style');
  const run = () => {
    const s = input.value;
    const runs = RLE.encode(s);
    const enc = RLE.format(runs, style.value);
    const dec = RLE.decode(enc, style.value);
    const ok = dec === s;
    const pct = s.length ? enc.length / s.length * 100 : 0;
    out.innerHTML = `
      <div class="runs">${runs.map(r => `<span class="run"><b>${r.n}</b> × ${vis(r.ch)}</span>`).join('')}</div>
      <p><b>Encoded:</b> <span class="bits big">${esc(enc)}</span></p>
      <p>${s.length} characters → ${enc.length} characters (${pct.toFixed(1)}% of the original).
      ${pct > 100 ? '<span class="bad">Data expansion: with few repeats, RLE makes the data bigger.</span>' : ''}</p>
      <p class="${ok ? 'ok' : 'bad'}">${ok ? '✔ Decoding gives back the exact original (lossless).' : '✘ Mismatch: the input probably contains digits.'}</p>`;
  };
  input.addEventListener('input', run);
  style.addEventListener('change', run);
  document.querySelectorAll('.rle-pre').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.s; run(); }));
  run();
}

function initBinRLE() {
  const Wd = 40, Hd = 8;
  let grid = [];
  const preset = () => {
    grid = Array.from({ length: Hd }, () => Array(Wd).fill(0));
    for (let x = 10; x < 30; x++) { grid[2][x] = 1; grid[6][x] = 1; }
    for (let y = 3; y <= 5; y++) { grid[y][10] = 1; grid[y][29] = 1; }
  };
  const box = $('bin-grid');
  const render = () => {
    box.innerHTML = grid.map((r, y) => r.map((v, x) => `<span class="bc${v ? ' on' : ''}" data-x="${x}" data-y="${y}"></span>`).join('')).join('');
    const rows = grid.map(r => RLE.rowRuns(r));
    $('bin-runs').textContent = rows.map(r => r.map(([v, n]) => `${v},${n}`).join('  ')).join('\n');
    const pairs = rows.reduce((s, r) => s + r.length, 0);
    const runBits = Math.ceil(Math.log2(Wd + 1));
    const rleBits = pairs * (1 + runBits), raw = Wd * Hd;
    $('bin-stats').innerHTML = `
      <h4>Size</h4>
      <p>Raw bitmap: ${Wd} × ${Hd} = <b>${raw} bits</b>.</p>
      <p>RLE: ${pairs} pairs × (1 bit value + ${runBits} bits run) = <b>${rleBits} bits</b>.</p>
      <p>CR = ${raw} / ${rleBits} = <b>${(raw / rleBits).toFixed(2)}</b>
      ${rleBits > raw ? '<span class="bad"> (expansion: noise has no long runs)</span>' : ''}</p>
      <p class="note">Since values alternate, real coders store only the run lengths (agreeing that each row starts with white).</p>`;
  };
  box.addEventListener('click', e => {
    const c = e.target.closest('.bc');
    if (!c) return;
    const x = +c.dataset.x, y = +c.dataset.y;
    grid[y][x] ^= 1; render();
  });
  $('bin-preset').addEventListener('click', () => { preset(); render(); });
  $('bin-clear').addEventListener('click', () => { grid = Array.from({ length: Hd }, () => Array(Wd).fill(0)); render(); });
  $('bin-noise').addEventListener('click', () => { grid = Array.from({ length: Hd }, () => Array.from({ length: Wd }, () => (Math.random() < 0.5 ? 1 : 0))); render(); });
  preset(); render();
}

/* ---------- 6. Huffman ---------- */
function huffTreeSVG(root, codes, highlight) {
  const L = Huffman.layout(root);
  const gx = 62, gy = 70, pad = 34;
  const Wsvg = Math.max(1, L.leaves) * gx + pad, Hsvg = 26 + L.depth * gy + 44;
  const X = o => pad / 2 + o.x * gx + gx / 2, Y = o => 26 + o.d * gy;
  let s = `<svg class="htree" viewBox="0 0 ${Wsvg} ${Hsvg}" width="${Wsvg}" height="${Hsvg}" role="img" aria-label="Huffman tree">`;
  L.edges.forEach(e => {
    s += `<line x1="${X(e.from)}" y1="${Y(e.from) + 14}" x2="${X(e.to)}" y2="${Y(e.to) - 14}" class="hedge"/>`;
    const mx = (X(e.from) + X(e.to)) / 2 + (e.bit ? 8 : -8), my = (Y(e.from) + Y(e.to)) / 2;
    s += `<text x="${mx}" y="${my}" class="hbit">${e.bit}</text>`;
  });
  L.nodes.forEach(o => {
    const leaf = !o.n.left;
    const hl = highlight && highlight.has(o.n);
    s += `<rect x="${X(o) - 22}" y="${Y(o) - 14}" width="44" height="${leaf ? 34 : 28}" rx="6" class="${leaf ? 'hleaf' : 'hnode'}${hl ? ' hhl' : ''}"/>`;
    s += `<text x="${X(o)}" y="${Y(o) + 3}" class="hfreq">${o.n.f}</text>`;
    if (leaf) {
      s += `<text x="${X(o)}" y="${Y(o) + 16}" class="hsym">${o.n.sym === ' ' ? '␣' : esc(o.n.sym)}</text>`;
      s += `<text x="${X(o)}" y="${Y(o) + 34}" class="hcode">${codes[o.n.sym]}</text>`;
    }
  });
  return s + '</svg>';
}

function initHuffman() {
  let mode = 'freq', items = [], H = null, step = 0, err = '';
  const parseItems = () => {
    err = '';
    if (mode === 'freq') {
      const out = [];
      for (const tok of $('hf-freq').value.split(/[\s,]+/).filter(Boolean)) {
        const m = tok.match(/^(.+):(\d+(?:\.\d+)?)$/);
        if (!m) { err = `Could not read "${esc(tok)}". Use symbol:frequency, e.g. a:45`; return []; }
        if (out.some(o => o.sym === m[1])) { err = `Symbol "${esc(m[1])}" appears twice.`; return []; }
        if (+m[2] > 0) out.push({ sym: m[1], f: +m[2] });
      }
      return out;
    }
    const counts = new Map();
    for (const ch of $('hf-text').value) counts.set(ch, (counts.get(ch) || 0) + 1);
    return [...counts].map(([sym, f]) => ({ sym, f }));
  };

  // Rebuild the partial forest after k merges, to draw intermediate states
  const forestAfter = k => {
    let uid = 0;
    let nodes = items.map(it => ({ sym: it.sym, f: it.f, id: uid++, left: null, right: null }));
    for (let i = 0; i < k && nodes.length > 1; i++) {
      nodes.sort((a, b) => a.f - b.f || a.id - b.id);
      const a = nodes.shift(), b = nodes.shift();
      nodes.push({ sym: null, f: a.f + b.f, id: uid++, left: a, right: b });
    }
    nodes.sort((a, b) => a.f - b.f || a.id - b.id);
    return nodes;
  };

  const renderStep = () => {
    const nSteps = H.steps.length;
    $('hf-prev').disabled = step === 0;
    $('hf-next').disabled = step >= nSteps;
    $('hf-stepinfo').textContent = `Merge ${step} of ${nSteps}`;
    if (step < nSteps) {
      const s = H.steps[step];
      $('hf-heap').innerHTML = `Heap (smallest first): ${s.queue.map(esc).join('  ')}<br>Next: pop <b>${esc(s.a)}</b> (left, 0) and <b>${esc(s.b)}</b> (right, 1) → new node <b>(${s.p})</b>`;
    } else {
      $('hf-heap').innerHTML = `Done: one node left, the root (${H.total}). Read each code from the root down.`;
    }
    const forest = forestAfter(step);
    const codesAll = H.codes;
    $('hf-tree').innerHTML = step >= nSteps
      ? huffTreeSVG(H.root, codesAll)
      : `<div class="forest">${forest.map(n => huffTreeSVG(n, partialCodes(n))).join('')}</div>`;
  };
  const partialCodes = root => {
    const c = {};
    const walk = (n, p) => { if (!n.left) { c[n.sym] = p; return; } walk(n.left, p + '0'); walk(n.right, p + '1'); };
    walk(root, '');
    return c;
  };

  const run = () => {
    items = parseItems();
    if (err || items.length < 1) {
      $('hf-out').innerHTML = `<p class="bad">${err || 'Enter at least one symbol.'}</p>`;
      $('hf-tree').innerHTML = ''; $('hf-heap').textContent = ''; H = null; return;
    }
    H = Huffman.build(items);
    step = Math.min(step, H.steps.length);
    renderStep();
    const hd = H.header, u = items.length;
    const fixed = Math.max(1, Math.ceil(Math.log2(u)));
    const totalBits = hd.total + H.payload;
    const intF = items.every(it => Number.isInteger(it.f));
    $('hf-out').innerHTML = `
      <h4>Code table and compressed message size</h4>
      <div class="scroll"><table class="tbl">
        <tr><th>Character</th>${items.map(it => `<td>${vis(it.sym)}</td>`).join('')}<th>Σ</th></tr>
        <tr><th>Codeword</th>${items.map(it => `<td><code>${H.codes[it.sym]}</code></td>`).join('')}<td></td></tr>
        <tr><th>Codeword bits</th>${items.map(it => `<td>${H.codes[it.sym].length}</td>`).join('')}<td></td></tr>
        <tr><th>Frequency</th>${items.map(it => `<td>${it.f}</td>`).join('')}<td>${fmt(H.total)}</td></tr>
        <tr><th>Bits × frequency</th>${items.map(it => `<td>${fmt(H.codes[it.sym].length * it.f)}</td>`).join('')}<td><b>${fmt(H.payload)}</b></td></tr>
      </table></div>
      <p><b>Compressed message size</b> = Σ (frequency × codeword length) = <b>${fmt(H.payload)} bits</b>
      (vs ${fmt(H.total * 8)} bits in 8-bit ASCII and ${fmt(H.total * fixed)} bits with a fixed ${fixed}-bit code).</p>
      ${intF ? `
      <h4>Total bits to transmit (including the header)</h4>
      <table class="tbl">
        <tr><td>1. Number of unique characters (${u}) in binary</td><td>⌈log₂(${u} + 1)⌉ = <b>${hd.uniqueBits}</b> bits</td></tr>
        <tr><td>2. ASCII code of each character</td><td>${u} × 8 = <b>${hd.asciiBits}</b> bits</td></tr>
        <tr><td>3. Length of each codeword (max length ${hd.Lmax})</td><td>u × ⌈log₂(L<sub>max</sub> + 1)⌉ = ${u} × ${hd.lenBitsEach} = <b>${hd.lenBits}</b> bits</td></tr>
        <tr><td>4. Compressed message</td><td><b>${fmt(H.payload)}</b> bits</td></tr>
        <tr><th>Bits to be transmitted</th><th>${hd.uniqueBits} + ${hd.asciiBits} + ${hd.lenBits} + ${fmt(H.payload)} = ${fmt(totalBits)} bits</th></tr>
      </table>
      <p>Compression ratio (message only) = (${fmt(H.total)} × 8) / ${fmt(H.payload)} = <b>${(H.total * 8 / H.payload).toFixed(2)}</b> ·
      compressed payload = (1/CR) × 100 = <b>${(100 * H.payload / (H.total * 8)).toFixed(2)}%</b> ·
      including the header, CR = ${fmt(H.total * 8)} / ${fmt(totalBits)} = <b>${(H.total * 8 / totalBits).toFixed(2)}</b>.</p>
      ${totalBits >= H.total * 8 ? '<p class="bad">For this short message the header costs more than Huffman saves, so the total is larger than plain ASCII. Huffman pays off on long messages.</p>' : ''}` : ''}
      <h4>How close to the limit?</h4>
      <p>Average code length L<sub>avg</sub> = Σ pᵢ lᵢ = <b>${H.avg.toFixed(3)}</b> bits/symbol · entropy H = −Σ pᵢ log₂ pᵢ = <b>${H.entropy.toFixed(3)}</b> bits/symbol ·
      efficiency H / L<sub>avg</sub> = <b>${(100 * H.entropy / H.avg).toFixed(1)}%</b>.
      Huffman always satisfies H ≤ L<sub>avg</sub> &lt; H + 1.</p>`;
    decode();
  };
  const decode = () => {
    if (!H) return;
    const bits = $('hf-bits').value;
    if (/[^01\s]/.test(bits)) { $('hf-dec').innerHTML = '<p class="bad">Use only 0 and 1.</p>'; return; }
    const D = Huffman.decode(bits, H.root);
    $('hf-dec').innerHTML = `<p class="bits">${D.out.map(o => `<span class="dchunk">${o.code}<small>${vis(o.sym)}</small></span>`).join('')}${D.rest ? `<span class="dchunk bad">${D.rest}<small>?</small></span>` : ''}</p>
      <p>Decoded: <b>${D.out.map(o => vis(o.sym)).join('') || '(nothing)'}</b> ${D.ok ? '' : '<span class="bad"> · leftover bits do not reach a leaf</span>'}</p>`;
  };

  cTabs('hf-mode', 'm', m => {
    mode = m; step = 0;
    $('hf-in-freq').hidden = m !== 'freq'; $('hf-in-text').hidden = m !== 'text';
    $('hf-bits').value = m === 'freq' ? '110100110' : '';
    run();
  });
  $('hf-freq').addEventListener('input', () => { step = 0; run(); });
  $('hf-text').addEventListener('input', () => { step = 0; run(); });
  $('hf-prev').addEventListener('click', () => { step--; renderStep(); });
  $('hf-next').addEventListener('click', () => { step++; renderStep(); });
  $('hf-all').addEventListener('click', () => { if (H) { step = H.steps.length; renderStep(); } });
  $('hf-bits').addEventListener('input', decode);
  run();
}

/* ---------- 7. LZW ---------- */
function initLZW() {
  const input = $('lzw-input'), out = $('lzw-out'), modeSel = $('lzw-mode');
  const run = () => {
    const text = input.value;
    if (!text) { out.innerHTML = '<p>Type some text above.</p>'; return; }
    let mode = modeSel.value, note = '';
    if (mode === 'ascii' && !LZW.supportsAscii(text)) { mode = 'compact'; note = '<p class="bad">The text has characters outside 8-bit ASCII, so the compact dictionary is used.</p>'; }
    const E = LZW.encode(text, mode);
    const D = LZW.decode(E.codes, mode, E.alphabet);
    const ok = D.text === text;
    const minBits = Math.max(1, Math.ceil(Math.log2(E.dictSize)));
    const fixedBits = mode === 'ascii' ? 12 : minBits;
    const inBits = text.length * 8, outBits = E.codes.length * fixedBits;
    out.innerHTML = `${note}
      <p>${mode === 'ascii' ? 'Initial dictionary: codes 0–255 are the single ASCII characters (A = 65, B = 66, …). New entries start at 256.'
        : `Initial dictionary: ${E.alphabet.map((c, i) => `<code>${i}=${vis(c)}</code>`).join(' ')}`}</p>
      <h4>Encoder</h4>
      <div class="scroll"><table class="tbl">
        <tr><th>Step</th><th>P (current match)</th><th>C (next char)</th><th>P + C in dictionary?</th><th>Output code</th><th>New entry</th></tr>
        ${E.steps.map((s, i) => `<tr>
          <td>${i + 1}</td><td>${s.P ? esc(s.P) : '—'}</td><td>${s.C === 'end' ? 'end of input' : vis(s.C)}</td>
          <td>${s.C === 'end' ? '—' : (s.found ? `<span class="ok">yes</span> → P = ${esc(s.PC)}` : '<span class="bad">no</span>')}</td>
          <td>${s.out ? `<b>${s.out.code}</b> (${esc(s.out.text)})` : '—'}</td>
          <td>${s.add ? `${s.add.code} = ${esc(s.add.text)}` : '—'}</td></tr>`).join('')}
      </table></div>
      <p><b>Output:</b> <code>${E.codes.join(' ')}</code> · ${text.length} characters → ${E.codes.length} codes · ${E.added} dictionary entries added.</p>
      <p>Size: ${text.length} × 8 = ${inBits} bits → ${E.codes.length} × ${fixedBits} bits${mode === 'ascii' ? ' (12-bit codes, as in GIF/TIFF)' : ''} = ${outBits} bits ·
      CR = <b>${(inBits / outBits).toFixed(2)}</b>${inBits < outBits ? ' <span class="bad">(short inputs can expand; LZW pays off on long, repetitive data)</span>' : ''}</p>
      <h4>Decoder (rebuilds the same dictionary)</h4>
      <div class="scroll"><table class="tbl">
        <tr><th>Code in</th><th>Output string</th><th>New entry (previous + first char of current)</th></tr>
        ${D.steps.map(s => `<tr${s.special ? ' class="hlrow"' : ''}><td>${s.code}</td><td>${esc(s.entry)}</td>
          <td>${s.add ? `${s.add.code} = ${esc(s.add.text)}` : '—'}${s.special ? '<br><small>Code not in the table yet: it must be previous + previous[0]</small>' : ''}</td></tr>`).join('')}
      </table></div>
      <p class="${ok ? 'ok' : 'bad'}">${ok ? '✔ Decoded text equals the original (lossless).' : '✘ Mismatch.'}</p>`;
  };
  input.addEventListener('input', run);
  modeSel.addEventListener('change', run);
  document.querySelectorAll('.lzw-pre').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.s; run(); }));
  run();
}

/* ---------- 8.1 DCT basis images ---------- */
function initDCTBasis() {
  const basis = (u, v, x, y) => Math.cos((2 * x + 1) * u * Math.PI / 16) * Math.cos((2 * y + 1) * v * Math.PI / 16);
  const drawBasis = (ctx, u, v, ox, oy, cell) => {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      const g = Math.round(127.5 + 127.5 * basis(u, v, x, y));
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(ox + y * cell, oy + x * cell, cell, cell);
    }
  };
  const { c, ctx, W } = ctx2d('dct-basis');
  const tile = W / 8, cell = (tile - 4) / 8;
  let sel = [0, 1];
  const draw = () => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, W);
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
      drawBasis(ctx, u, v, v * tile + 2, u * tile + 2, cell);
      if (u === sel[0] && v === sel[1]) { ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 3; ctx.strokeRect(v * tile + 1, u * tile + 1, tile - 2, tile - 2); }
    }
    const one = ctx2d('dct-one');
    drawBasis(one.ctx, sel[0], sel[1], 0, 0, one.W / 8);
    const [u, v] = sel;
    $('dct-one-cap').innerHTML = `<b>Basis (u = ${u}, v = ${v})</b>: ${u === 0 && v === 0 ? 'the DC term, a flat block. Its coefficient is the block average (times 8).'
      : `${v} half-cycle${v === 1 ? '' : 's'} across, ${u} half-cycle${u === 1 ? '' : 's'} down. ${u + v >= 8 ? 'High frequency: the quantizer usually sets this coefficient to 0.' : u + v <= 2 ? 'Low frequency: carries most of the energy of smooth blocks.' : ''}`}`;
  };
  c.addEventListener('click', e => {
    const r = c.getBoundingClientRect();
    const v = Math.min(7, Math.floor((e.clientX - r.left) / r.width * 8));
    const u = Math.min(7, Math.floor((e.clientY - r.top) / r.height * 8));
    sel = [u, v]; draw();
  });
  draw();
}

/* ---------- 8.1 Keep K coefficients ---------- */
function initDCTKeep() {
  const run = () => {
    if (!IMG.gray) return;
    const { W, H, gray } = IMG, K = +$('dk-k').value;
    const r = JPEG.processImage(gray, W, H, { keep: K });
    putGray('dk-orig', gray, W, H);
    putGray('dk-rec', r.rec, W, H);
    const p = Metrics.psnr(gray, r.rec);
    $('dk-out').innerHTML = `<p>Keeping <b>${K} of 64</b> coefficients (${(100 * K / 64).toFixed(1)}%) keeps <b>${r.energyPct.toFixed(2)}%</b> of the AC + DC energy · PSNR = <b>${Number.isFinite(p) ? p.toFixed(2) + ' dB' : '∞'}</b>.
      ${K === 64 ? 'All coefficients kept: the DCT is perfectly invertible.' : K <= 3 ? 'With so few coefficients each block becomes a smooth patch, and 8×8 block edges appear.' : ''}</p>
      <p class="note">PSNR = 10 log₁₀(255² / MSE). Above about 35 dB differences are hard to see; below 25 dB they are obvious.</p>`;
  };
  cRange('dk-k', null, run);
  IMG.on(run);
}

/* ---------- 8.2 DWT ---------- */
function initDWT() {
  const run = () => {
    if (!IMG.gray) return;
    const { W, H, gray } = IMG, lev = +$('dw-lev').value;
    const c = DWT.forward(gray, W, H, lev);
    putGray('dw-orig', gray, W, H);
    const llW = W >> lev, llH = H >> lev;
    const vis8 = new Float64Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, v = c[i];
      vis8[i] = (x < llW && y < llH) ? v : 128 + 4 * v;
    }
    putGray('dw-c', vis8, W, H, v => Math.max(0, Math.min(255, Math.round(v))));
    const { ctx } = ctx2d('dw-c');
    ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 1;
    let w = W, h = H;
    ctx.font = 'bold 10px system-ui';
    const lab = (t, x, y) => { const tw = ctx.measureText(t).width; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(x, y, tw + 4, 12); ctx.fillStyle = '#c2410c'; ctx.fillText(t, x + 2, y + 10); };
    for (let L = 1; L <= lev; L++) {
      w /= 2; h /= 2;
      ctx.beginPath(); ctx.moveTo(w + 0.5, 0); ctx.lineTo(w + 0.5, 2 * h); ctx.moveTo(0, h + 0.5); ctx.lineTo(2 * w, h + 0.5); ctx.stroke();
      lab(`HL${L}`, w + 2, 1); lab(`LH${L}`, 2, h + 2); lab(`HH${L}`, w + 2, h + 2);
    }
    lab(`LL${lev}`, 2, 1);
    const E = DWT.energies(c, W, H, lev);
    const kept = E.find(b => b.name === `LL${lev}`);
    $('dw-out').innerHTML = `
      <div class="scroll"><table class="tbl"><tr><th>Sub-band</th>${E.map(b => `<td>${b.name}</td>`).join('')}</tr>
      <tr><th>Size</th>${E.map(b => { const L = +b.name.slice(2); return `<td>${W >> L}×${H >> L}</td>`; }).join('')}</tr>
      <tr><th>Energy %</th>${E.map(b => `<td>${b.pct.toFixed(2)}</td>`).join('')}</tr></table></div>
      <p>The LL${lev} band holds <b>${(100 / 4 ** lev).toFixed(2)}%</b> of the coefficients but <b>${kept.pct.toFixed(2)}%</b> of the energy. The detail bands are mostly near zero, so they quantize to zero cheaply.</p>`;
  };
  $('dw-lev').addEventListener('change', run);
  IMG.on(run);
}

/* ---------- 9.1 JPEG block stepper ---------- */
function matHTML(M, o = {}) {
  const dec = o.dec ?? 0;
  let maxAbs = 1;
  if (o.heat) M.forEach(r => r.forEach(v => { maxAbs = Math.max(maxAbs, Math.abs(v)); }));
  return `<table class="mat">${M.map(r => `<tr>${r.map(v => {
    const bg = o.heat ? `background: rgba(37,99,235,${(Math.abs(v) / maxAbs * 0.6).toFixed(2)})` : '';
    return `<td style="${bg}">${Number(v).toFixed(dec)}</td>`;
  }).join('')}</tr>`).join('')}</table>`;
}

function initJPEG() {
  const q = $('jpeg-q'), qv = $('jpeg-q-val'), body = $('jpeg-body');
  const title = $('jpeg-title'), dots = $('jpeg-dots');
  const prev = $('jpeg-prev'), next = $('jpeg-next');
  const block = JPEG.makeBlock();
  let idx = 0;

  const compute = () => {
    const quality = +q.value;
    qv.textContent = quality;
    const Q = JPEG.quantTable(quality);
    const shifted = JPEG.levelShift(block);
    const F = JPEG.dct(shifted);
    const quant = JPEG.quantize(F, Q);
    const seq = JPEG.zigzagSeq(quant);
    const tokens = JPEG.tokenize(seq);
    const deq = JPEG.dequantize(quant, Q);
    const rec = JPEG.reconstruct(deq);
    let maxErr = 0, sumErr = 0;
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      const e = Math.abs(block[x][y] - rec[x][y]); maxErr = Math.max(maxErr, e); sumErr += e;
    }
    let energy = 0, low = 0;
    F.forEach((r, i) => r.forEach((v, j) => { energy += v * v; if (i + j <= 2) low += v * v; }));
    return { quality, Q, shifted, F, quant, seq, tokens, rec, deq, maxErr, meanErr: sumErr / 64, nz: seq.filter(v => v !== 0).length, lowPct: 100 * low / energy };
  };

  const stepList = D => [
    { t: '1. Input: one 8×8 block', d: 'The image is split into 8×8 blocks, processed left to right, top to bottom. These are the 8-bit gray levels (0–255) of one block.', h: matHTML(block) },
    { t: '2. Level shift', d: 'Subtract 2<sup>k−1</sup> = 128 (k = 8 bits), moving the range from [0, 255] to [−128, 127] so values are centred on zero.', h: matHTML(D.shifted) },
    { t: '3. 2-D DCT: spatial → frequency', d: `F(0,0) is the DC term; moving right or down means higher frequencies. Energy compaction: the 6 lowest-frequency coefficients (top-left corner) hold <b>${D.lowPct.toFixed(1)}%</b> of the energy.`, h: matHTML(D.F, { dec: 1, heat: true }) },
    { t: '4. Quantization (lossy)', d: `Divide each coefficient by the matching Q-table entry and round (quality ${D.quality}). Q is small at the top-left (low frequencies, where errors are visible) and large at the bottom-right.`,
      h: `<div class="pair"><div><h5>Quantization table Q</h5>${matHTML(D.Q)}</div><div><h5>Quantized round(F / Q)</h5>${matHTML(D.quant, { heat: true })}</div></div><p>Nonzero coefficients: <b>${D.nz}</b> of 64.</p>` },
    { t: '5. Zigzag scan', d: 'Read the block along anti-diagonals: low frequencies first, so the zeros bunch together at the end.',
      h: `<div class="seq">${D.seq.map((v, i) => `<span class="cell ${v === 0 ? 'z' : ''}"><small>${i}</small>${v}</span>`).join('')}</div>` },
    { t: '6. Run-length + Huffman coding (lossless)', d: 'DC is coded as the <b>difference</b> from the previous block\'s DC (DPCM), since neighbouring averages are similar. Each nonzero AC value becomes a (zero-run, value) pair; trailing zeros become one EOB symbol (ZRL = a run of 16 zeros). These symbols are then Huffman coded.',
      h: `<p class="bits">${D.tokens.map(esc).join('  ')}</p><p>${D.tokens.length} symbols instead of 64 values.</p>` },
    { t: '7. Decoder: dequantize → IDCT → +128', d: 'Multiply by Q to <i>estimate</i> the DCT coefficients (rounded-off detail cannot come back), apply the IDCT, and add 128. The result is close to, not equal to, the original.',
      h: `<div class="pair"><div><h5>Original</h5>${matHTML(block)}</div><div><h5>Reconstructed</h5>${matHTML(D.rec)}</div></div>
          <p>Max pixel error <b>${D.maxErr}</b> · mean absolute error <b>${D.meanErr.toFixed(2)}</b>. Lower the quality to see the error grow.</p>` }
  ];

  const render = () => {
    const S = stepList(compute());
    idx = Math.min(idx, S.length - 1);
    title.textContent = S[idx].t;
    body.innerHTML = `<p>${S[idx].d}</p>${S[idx].h}`;
    dots.innerHTML = S.map((_, i) => `<button class="dot ${i === idx ? 'on' : ''}" data-i="${i}" aria-label="Step ${i + 1}"></button>`).join('');
    prev.disabled = idx === 0;
    next.disabled = idx === S.length - 1;
  };
  q.addEventListener('input', render);
  prev.addEventListener('click', () => { idx--; render(); });
  next.addEventListener('click', () => { idx++; render(); });
  dots.addEventListener('click', e => { const b = e.target.closest('.dot'); if (b) { idx = +b.dataset.i; render(); } });
  render();
}

/* ---------- 9.2 Whole-image JPEG ---------- */
function initJPEGImage() {
  const run = () => {
    if (!IMG.gray) return;
    const { W, H, gray } = IMG, qual = +$('ji-q').value;
    const r = JPEG.processImage(gray, W, H, { quality: qual });
    putGray('ji-orig', gray, W, H);
    putGray('ji-rec', r.rec, W, H);
    const err = new Int16Array(W * H).map((_, i) => r.rec[i] - gray[i]);
    putGray('ji-err', err, W, H, v => 128 + 4 * v);
    const p = Metrics.psnr(gray, r.rec), raw = W * H * 8;
    $('ji-out').innerHTML = `
      <table class="tbl">
        <tr><td>Nonzero quantized coefficients</td><td><b>${r.nz}</b> of ${r.total} (${(100 * r.nz / r.total).toFixed(1)}%) · ${(100 - 100 * r.nz / r.total).toFixed(1)}% are zero</td></tr>
        <tr><td>Estimated size after entropy coding*</td><td>≈ <b>${fmt(r.bits, 0)} bits</b> = ${(r.bits / (W * H)).toFixed(3)} bits/pixel (raw: 8 bits/pixel)</td></tr>
        <tr><td>Estimated compression ratio</td><td><b>≈ ${(raw / r.bits).toFixed(1)} : 1</b></td></tr>
        <tr><td>Quality of the decoded image</td><td>PSNR = <b>${Number.isFinite(p) ? p.toFixed(2) + ' dB' : '∞'}</b> · MSE = ${Metrics.mse(gray, r.rec).toFixed(2)}</td></tr>
      </table>
      <p class="note">*Estimate using typical code lengths: DC difference ≈ 3 + size bits, each AC (run, value) symbol ≈ 4 + size bits, EOB ≈ 4 bits. Real JPEG files also include headers and tables.
      Try the "Text &amp; sharp edges" image at low quality to see ringing, and the smooth gradient to see 8×8 blocking.</p>`;
  };
  cRange('ji-q', null, run);
  IMG.on(run);
}

/* ---------- MCQs (answers saved only in localStorage, no score) ---------- */
const QUIZ = [
  {
    q: 'Using symbol-then-count RLE, "WWWWAAADEXXXXXX" becomes…',
    o: ['W4A3D1E1X6', 'W4A3DEX6', '4W3A1D1E6X', 'W4A3D2X6'],
    a: 0,
    why: 'Runs are WWWW, AAA, D, E, XXXXXX. Single characters still need a count of 1 so the decoder can parse the stream.'
  },
  {
    q: 'After the 2-D DCT of a typical 8×8 block, where is most of the energy?',
    o: ['Bottom-right corner (high frequencies)', 'Spread evenly across all 64 coefficients', 'Top-left corner (low frequencies)', 'In the centre of the block'],
    a: 2,
    why: 'Natural image blocks are smooth, so their energy sits in the DC term and nearby low frequencies. This is energy compaction.'
  },
  {
    q: 'An 8-bit 512×512 grayscale image is compressed to 200 KB (1 KB = 1024 bytes). The compression ratio is…',
    o: ['1.28 : 1', '2.56 : 1', '0.78 : 1', '10.24 : 1'],
    a: 0,
    why: 'n₁ = 512 × 512 × 8 bits = 256 KB. CR = 256 / 200 = 1.28, and the percent reduction is (256 − 200) / 256 = 21.875%.'
  },
  {
    q: 'DPCM removes interpixel redundancy by transmitting…',
    o: ['the pixel values themselves', 'the difference between each pixel and its prediction', 'only the DCT coefficients', 'the image histogram'],
    a: 1,
    why: 'Neighbouring pixels are similar, so prediction errors cluster near 0 and have much lower entropy.'
  },
  {
    q: 'Chroma subsampling (e.g. 4:2:0) is possible mainly because…',
    o: ['colour is stored in more bits than brightness', 'the human eye is less sensitive to colour detail than to brightness detail', 'Cb and Cr are always zero', 'it is a lossless operation'],
    a: 1,
    why: 'It exploits psychovisual redundancy. It is lossy: the decoder can only interpolate the missing colour samples.'
  },
  {
    q: 'Why does the decoder model have no true inverse quantizer?',
    o: ['Quantization is many-to-one, so the original value cannot be recovered', 'The quantizer is placed after the symbol coder', 'Quantization only reorders the data', 'The decoder does not know the step size'],
    a: 0,
    why: 'With step 16, every value from 136 to 151 becomes 9. A JPEG dequantizer multiplies back (9 × 16 = 144), which is only an estimate.'
  },
  {
    q: 'Huffman example with frequencies a 45, e 65, l 13, n 45, o 18, s 22, t 53. The compressed message size is…',
    o: ['2088 bits', '776 bits', '696 bits', '261 bits'],
    a: 2,
    why: 'Σ frequency × code length = 135 + 130 + 52 + 135 + 72 + 66 + 106 = 696 bits. Adding the header (3 + 56 + 21 bits) gives 776 bits to transmit.'
  },
  {
    q: 'LZW with a 256-entry ASCII starting dictionary encodes "ABABABA" as…',
    o: ['65 66 65 256 65', '65 66 256 258', '65 66 256 257 65', '256 257 258'],
    a: 1,
    why: 'A (65), B (66), AB (256), then ABA is already entry 258, so it is sent as one code. Entries added: AB = 256, BA = 257, ABA = 258.'
  },
  {
    part: 'Chapter 6 · Object recognition & case studies',
    q: 'The minimum-distance classifier assigns x to the class whose…',
    o: ['training set is largest', 'prototype (mean) vector is nearest in Euclidean distance', 'variance is smallest', 'prior probability is largest'],
    a: 1,
    why: 'Each class is represented by its prototype mⱼ; the smallest distance D wins, which is the same as the largest dⱼ(x) = xᵀmⱼ − ½mⱼᵀmⱼ.'
  },
  {
    q: 'The Bayes (optimal statistical) classifier is "optimal" because it…',
    o: ['is always the fastest', 'needs no training data', 'gives the minimum average probability of classification error', 'always uses straight-line boundaries'],
    a: 2,
    why: 'Choosing the class with the largest posterior P(ωᵢ|x) minimises the probability of error.'
  },
  {
    q: 'A single-layer perceptron cannot learn which function?',
    o: ['AND', 'OR', 'XOR', 'NOT'],
    a: 2,
    why: 'XOR is not linearly separable; no single straight line splits its classes. An MLP with a hidden layer is needed.'
  },
  {
    q: 'Input 64×64, filter 4×4, stride 2, no padding. What is the output size?',
    o: ['30×30', '31×31', '32×32', '61×61'],
    a: 1,
    why: '(N − F)/S + 1 = (64 − 4)/2 + 1 = 31.'
  },
  {
    q: 'In YOLO, which grid cell is responsible for detecting an object?',
    o: ['The top-left cell', 'Every cell the object touches', 'The cell containing the object\'s centre', 'The cell with the brightest pixels'],
    a: 2,
    why: 'The image is split into an S×S grid, and the cell holding the object centre predicts its box. Confidence is tied to IoU with the ground truth.'
  },
  {
    q: 'In Faster R-CNN, region proposals are generated by…',
    o: ['Selective search outside the network', 'A Region Proposal Network (RPN) inside the network', 'Random sampling', 'The final softmax layer'],
    a: 1,
    why: 'The RPN scans the shared feature map and proposes regions; it is trained jointly with the detector.'
  },
  {
    q: 'Chain code 0 0 3 2 2 1 (4-directional). What is its shape number?',
    o: ['303303', '033033', '003221', '330330'],
    a: 1,
    why: 'First difference (current − previous, mod 4, circular) = 3 0 3 3 0 3. The smallest cyclic rotation is 0 3 3 0 3 3.'
  }

];

function initQuiz() {
  const box = $('quiz-box');
  const KEY = 'dip-mcq-v2';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { saved = {}; }

  const draw = () => {
    box.innerHTML = QUIZ.map((x, qi) => {
      const sel = saved[qi];
      const answered = sel !== undefined;
      const head = qi === 0 ? '<h3 class="qpart">Image compression</h3>' : (x.part ? `<h3 class="qpart">${esc(x.part)}</h3>` : '');
      return `${head}
        <div class="q">
          <p><b>Q${qi + 1}.</b> ${esc(x.q)}</p>
          ${x.o.map((opt, oi) => {
            let cls = 'opt';
            if (answered) {
              if (oi === x.a) cls += ' right';
              else if (oi === sel) cls += ' wrong';
            }
            return `<button class="${cls}" data-q="${qi}" data-o="${oi}">${esc(opt)}</button>`;
          }).join('')}
          ${answered ? `<p class="why">${sel === x.a ? '✔ Correct. ' : '✘ Not quite. '}${esc(x.why)}</p>` : ''}
        </div>`;
    }).join('') + `<p><button id="reset-quiz" class="ghost">Reset answers</button></p>`;
  };

  box.addEventListener('click', e => {
    if (e.target.id === 'reset-quiz') {
      saved = {};
      try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
      draw();
      return;
    }
    const b = e.target.closest('.opt');
    if (!b) return;
    saved[b.dataset.q] = +b.dataset.o;
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (err) { /* storage blocked: still works */ }
    draw();
  });

  draw();
}
