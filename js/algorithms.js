/* =====================================================================
   Image compression algorithms (pure functions, no DOM).
   Used by app.js. Also loadable in Node for testing.
   ===================================================================== */

/* ---------- Metrics ---------- */
const Metrics = {
  mse(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return s / a.length;
  },
  psnr(a, b, peak = 255) {
    const m = Metrics.mse(a, b);
    return m === 0 ? Infinity : 10 * Math.log10(peak * peak / m);
  },
  // Shannon entropy (bits/symbol) of an array of values
  entropy(values) {
    const h = new Map();
    for (const v of values) h.set(v, (h.get(v) || 0) + 1);
    let H = 0;
    for (const c of h.values()) { const p = c / values.length; H -= p * Math.log2(p); }
    return H;
  }
};

/* ---------- 1. Run-Length Encoding (lossless) ---------- */
const RLE = {
  encode(s) {
    const runs = [];
    if (!s) return runs;
    let cur = s[0], n = 1;
    for (let i = 1; i < s.length; i++) {
      if (s[i] === cur) n++;
      else { runs.push({ ch: cur, n }); cur = s[i]; n = 1; }
    }
    runs.push({ ch: cur, n });
    return runs;
  },
  // style 'sc' = symbol then count (W4); 'cs' = count then symbol (4W)
  format(runs, style = 'sc') {
    return runs.map(r => (style === 'sc' ? r.ch + r.n : r.n + r.ch)).join('');
  },
  decode(enc, style = 'sc') {
    const re = style === 'sc' ? /(\D)(\d+)/g : /(\d+)(\D)/g;
    let out = '', m;
    while ((m = re.exec(enc)) !== null) {
      const ch = style === 'sc' ? m[1] : m[2];
      const n = parseInt(style === 'sc' ? m[2] : m[1], 10);
      out += ch.repeat(n);
    }
    return out;
  },
  // Binary image row -> [[value, runLength], ...]
  rowRuns(row) {
    const runs = [];
    let cur = row[0], n = 1;
    for (let i = 1; i < row.length; i++) {
      if (row[i] === cur) n++;
      else { runs.push([cur, n]); cur = row[i]; n = 1; }
    }
    runs.push([cur, n]);
    return runs;
  }
};

/* ---------- 2. Huffman coding (lossless, variable-length) ---------- */
const Huffman = {
  // items: [{ sym, f }] in a fixed order. Ties are broken by that order
  // (leaves first, then internal nodes in creation order):
  // first popped (smaller) = left child = bit 0, second popped = right = bit 1.
  build(items) {
    let uid = 0;
    let nodes = items.map(it => ({ sym: it.sym, f: it.f, id: uid++, left: null, right: null }));
    const total = items.reduce((s, it) => s + it.f, 0);
    const label = n => (n.left ? `(${n.f})` : `${n.sym === ' ' ? '␣' : n.sym}:${n.f}`);
    const steps = [];
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.f - b.f || a.id - b.id);
      const queue = nodes.map(label);
      const a = nodes.shift(), b = nodes.shift();
      const p = { sym: null, f: a.f + b.f, id: uid++, left: a, right: b };
      steps.push({ queue, a: label(a), b: label(b), p: p.f });
      nodes.push(p);
    }
    const root = nodes[0] || null;
    const codes = {};
    const walk = (n, prefix) => {
      if (!n.left) { codes[n.sym] = prefix || '0'; return; }
      walk(n.left, prefix + '0');
      walk(n.right, prefix + '1');
    };
    if (root) walk(root, '');

    const payload = items.reduce((s, it) => s + codes[it.sym].length * it.f, 0);
    const avg = payload / total;
    const entropy = -items.reduce((s, it) => { const p = it.f / total; return s + p * Math.log2(p); }, 0);

    // Header cost: symbol count, ASCII codes, codeword lengths
    const u = items.length;
    const Lmax = Math.max(...items.map(it => codes[it.sym].length));
    const header = {
      u,
      uniqueBits: Math.max(1, Math.ceil(Math.log2(u + 1))),      // bits to write the number u
      asciiBits: 8 * u,                                          // each symbol as 8-bit ASCII
      lenBitsEach: Math.max(1, Math.ceil(Math.log2(Lmax + 1))),  // bits per codeword length
      Lmax
    };
    header.lenBits = u * header.lenBitsEach;
    header.total = header.uniqueBits + header.asciiBits + header.lenBits;
    return { root, codes, steps, total, payload, avg, entropy, header };
  },

  // Decode a bit string by walking the tree
  decode(bits, root) {
    const out = [];
    if (!root) return { out, ok: true, rest: '' };
    if (!root.left) return { out: [...bits].map(() => root.sym), ok: true, rest: '' };
    let n = root, buf = '';
    for (const b of bits) {
      if (b !== '0' && b !== '1') continue;
      n = b === '0' ? n.left : n.right;
      buf += b;
      if (!n.left) { out.push({ sym: n.sym, code: buf }); n = root; buf = ''; }
    }
    return { out, ok: buf === '', rest: buf };
  },

  // Positions for drawing: leaves in order, parents centred over children
  layout(root) {
    const nodes = [], edges = [];
    let leaf = 0, maxD = 0;
    const go = (n, d) => {
      maxD = Math.max(maxD, d);
      if (!n.left) { const o = { n, x: leaf++, d }; nodes.push(o); return o; }
      const L = go(n.left, d + 1), R = go(n.right, d + 1);
      const o = { n, x: (L.x + R.x) / 2, d };
      nodes.push(o);
      edges.push({ from: o, to: L, bit: 0 }, { from: o, to: R, bit: 1 });
      return o;
    };
    if (root) go(root, 0);
    return { nodes, edges, leaves: leaf, depth: maxD };
  }
};

/* ---------- 3. LZW (lossless, dictionary-based) ---------- */
const LZW = {
  // mode 'ascii': dictionary starts with all 256 single bytes (0-255), new codes from 256
  // mode 'compact': dictionary starts with only the symbols that occur (easier to read by hand)
  initDict(text, mode) {
    const dict = new Map();
    let alphabet;
    if (mode === 'ascii') {
      for (let i = 0; i < 256; i++) dict.set(String.fromCharCode(i), i);
      alphabet = null;
    } else {
      alphabet = [...new Set(text)].sort();
      alphabet.forEach((c, i) => dict.set(c, i));
    }
    return { dict, alphabet };
  },
  supportsAscii(text) { return [...text].every(c => c.charCodeAt(0) < 256); },

  encode(text, mode = 'ascii') {
    const { dict, alphabet } = LZW.initDict(text, mode);
    const first = dict.size;
    const codes = [], steps = [];
    let P = '';
    for (const C of text) {
      const PC = P + C;
      if (dict.has(PC)) {
        steps.push({ P, C, PC, found: true });
        P = PC;
      } else {
        const out = dict.get(P), code = dict.size;
        dict.set(PC, code);
        codes.push(out);
        steps.push({ P, C, PC, found: false, out: { code: out, text: P }, add: { code, text: PC } });
        P = C;
      }
    }
    if (P !== '') {
      codes.push(dict.get(P));
      steps.push({ P, C: 'end', PC: P, found: false, out: { code: dict.get(P), text: P }, add: null });
    }
    return { codes, steps, dictSize: dict.size, first, alphabet, added: dict.size - first };
  },

  decode(codes, mode, alphabet) {
    const table = new Map();
    if (mode === 'ascii') for (let i = 0; i < 256; i++) table.set(i, String.fromCharCode(i));
    else alphabet.forEach((c, i) => table.set(i, c));
    if (!codes.length) return { text: '', steps: [] };
    let prev = table.get(codes[0]), out = prev;
    const steps = [{ code: codes[0], entry: prev, add: null, special: false }];
    for (let i = 1; i < codes.length; i++) {
      const k = codes[i];
      let entry, special = false;
      if (table.has(k)) entry = table.get(k);
      else { entry = prev + prev[0]; special = true; }   // code not yet known: the "cScSc" case
      const code = table.size;
      table.set(code, prev + entry[0]);
      steps.push({ code: k, entry, add: { code, text: prev + entry[0] }, special });
      out += entry;
      prev = entry;
    }
    return { text: out, steps };
  }
};

/* ---------- 4. DPCM (predictive coding, lossless) ---------- */
const DPCM = {
  // Predict each value from the previous one; the first value is sent as it is.
  row(values) {
    return values.map((v, i) => ({ v, pred: i ? values[i - 1] : null, e: i ? v - values[i - 1] : v }));
  },
  // Image version: predict from the left neighbour (first column: from the pixel above)
  image(gray, W, H) {
    const err = new Int16Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const pred = x > 0 ? gray[i - 1] : (y > 0 ? gray[i - W] : 128);
      err[i] = gray[i] - pred;
    }
    return err;
  }
};

/* ---------- 5. Colour: RGB <-> YCbCr (JPEG / BT.601 full range) and subsampling ---------- */
const Color = {
  toYCC(rgba, n) {
    const Y = new Float64Array(n), Cb = new Float64Array(n), Cr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const R = rgba[4 * i], G = rgba[4 * i + 1], B = rgba[4 * i + 2];
      Y[i] = 0.299 * R + 0.587 * G + 0.114 * B;
      Cb[i] = 128 - 0.168736 * R - 0.331264 * G + 0.5 * B;
      Cr[i] = 128 + 0.5 * R - 0.418688 * G - 0.081312 * B;
    }
    return { Y, Cb, Cr };
  },
  toRGBA(Y, Cb, Cr, n) {
    const out = new Uint8ClampedArray(4 * n);
    for (let i = 0; i < n; i++) {
      const y = Y[i], cb = Cb[i] - 128, cr = Cr[i] - 128;
      out[4 * i] = y + 1.402 * cr;
      out[4 * i + 1] = y - 0.344136 * cb - 0.714136 * cr;
      out[4 * i + 2] = y + 1.772 * cb;
      out[4 * i + 3] = 255;
    }
    return out;
  },
  // Average each fx × fy block, then repeat the average back over the block (nearest upsampling)
  subsample(plane, W, H, fx, fy) {
    const out = new Float64Array(W * H);
    for (let by = 0; by < H; by += fy) for (let bx = 0; bx < W; bx += fx) {
      let s = 0, c = 0;
      for (let y = by; y < Math.min(by + fy, H); y++) for (let x = bx; x < Math.min(bx + fx, W); x++) { s += plane[y * W + x]; c++; }
      const m = s / c;
      for (let y = by; y < Math.min(by + fy, H); y++) for (let x = bx; x < Math.min(bx + fx, W); x++) out[y * W + x] = m;
    }
    return out;
  }
};

/* ---------- 6. Haar DWT (2-D, multi-level, Mallat layout) ---------- */
const DWT = {
  // Average/difference Haar: a = (x0 + x1)/2, d = (x0 - x1)/2
  forward(gray, W, H, levels) {
    const c = Float64Array.from(gray);
    let w = W, h = H;
    const tmp = new Float64Array(Math.max(W, H));
    for (let L = 0; L < levels; L++) {
      for (let y = 0; y < h; y++) {               // rows
        for (let x = 0; x < w / 2; x++) {
          const a = c[y * W + 2 * x], b = c[y * W + 2 * x + 1];
          tmp[x] = (a + b) / 2; tmp[w / 2 + x] = (a - b) / 2;
        }
        for (let x = 0; x < w; x++) c[y * W + x] = tmp[x];
      }
      for (let x = 0; x < w; x++) {               // columns
        for (let y = 0; y < h / 2; y++) {
          const a = c[2 * y * W + x], b = c[(2 * y + 1) * W + x];
          tmp[y] = (a + b) / 2; tmp[h / 2 + y] = (a - b) / 2;
        }
        for (let y = 0; y < h; y++) c[y * W + x] = tmp[y];
      }
      w /= 2; h /= 2;
    }
    return c;
  },
  // Energy (sum of squares) in each sub-band
  energies(c, W, H, levels) {
    const sum = (x0, y0, w, h) => {
      let s = 0;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) s += c[y * W + x] ** 2;
      return s;
    };
    const bands = [];
    let w = W, h = H;
    for (let L = 1; L <= levels; L++) {
      w /= 2; h /= 2;
      bands.push({ name: `HL${L}`, e: sum(w, 0, w, h) });
      bands.push({ name: `LH${L}`, e: sum(0, h, w, h) });
      bands.push({ name: `HH${L}`, e: sum(w, h, w, h) });
    }
    bands.push({ name: `LL${levels}`, e: sum(0, 0, w, h) });
    const tot = bands.reduce((s, b) => s + b.e, 0) || 1;
    bands.forEach(b => { b.pct = 100 * b.e / tot; });
    return bands;
  }
};

/* ---------- 7. JPEG building blocks ---------- */
const JPEG = {
  // Standard JPEG luminance quantization table (quality 50)
  Q50: [
    [16, 11, 10, 16, 24, 40, 51, 61],
    [12, 12, 14, 19, 26, 58, 60, 55],
    [14, 13, 16, 24, 40, 57, 69, 56],
    [14, 17, 22, 29, 51, 87, 80, 62],
    [18, 22, 37, 56, 68, 109, 103, 77],
    [24, 35, 55, 64, 81, 104, 113, 92],
    [49, 64, 78, 87, 103, 121, 120, 101],
    [72, 92, 95, 98, 112, 100, 103, 99]
  ],

  blank() { return Array.from({ length: 8 }, () => Array(8).fill(0)); },

  // A sample 8x8 block: a smooth gradient with a bright corner (an edge)
  makeBlock() {
    const b = [];
    for (let y = 0; y < 8; y++) {
      const row = [];
      for (let x = 0; x < 8; x++) {
        let v = 90 + 12 * x + 4 * y;
        if (x >= 5 && y >= 3) v += 40;
        row.push(Math.min(255, Math.max(0, v)));
      }
      b.push(row);
    }
    return b;
  },

  levelShift(b, k = 8) { const s = 2 ** (k - 1); return b.map(r => r.map(v => v - s)); },
  cu(u) { return u === 0 ? 1 / Math.SQRT2 : 1; },

  // Forward 2-D DCT-II (8x8), textbook formula
  dct(f) {
    const F = JPEG.blank();
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
        s += f[x][y] * Math.cos((2 * x + 1) * u * Math.PI / 16) * Math.cos((2 * y + 1) * v * Math.PI / 16);
      }
      F[u][v] = 0.25 * JPEG.cu(u) * JPEG.cu(v) * s;
    }
    return F;
  },

  idct(F) {
    const f = JPEG.blank();
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      let s = 0;
      for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
        s += JPEG.cu(u) * JPEG.cu(v) * F[u][v] * Math.cos((2 * x + 1) * u * Math.PI / 16) * Math.cos((2 * y + 1) * v * Math.PI / 16);
      }
      f[x][y] = 0.25 * s;
    }
    return f;
  },

  // Scale the quantization table by quality (1..100), IJG convention
  quantTable(quality) {
    const s = quality < 50 ? 5000 / quality : 200 - 2 * quality;
    return JPEG.Q50.map(r => r.map(v => Math.min(255, Math.max(1, Math.floor((v * s + 50) / 100)))));
  },
  quantize(F, Q) { return F.map((r, i) => r.map((v, j) => Math.round(v / Q[i][j]))); },
  dequantize(q, Q) { return q.map((r, i) => r.map((v, j) => v * Q[i][j])); },
  reconstruct(deq) {
    const f = JPEG.idct(deq);
    return f.map(r => r.map(v => Math.min(255, Math.max(0, Math.round(v + 128)))));
  },

  zigzagOrder() {
    const order = [];
    for (let s = 0; s <= 14; s++) {
      const list = [];
      for (let i = 0; i < 8; i++) { const j = s - i; if (j >= 0 && j < 8) list.push([i, j]); }
      if (s % 2 === 0) list.reverse();
      order.push(...list);
    }
    return order;
  },
  zigzagSeq(M) { return JPEG.zigzagOrder().map(([r, c]) => M[r][c]); },

  // Number of bits needed for a value's magnitude (JPEG "size"/category)
  category(v) { v = Math.abs(v); let n = 0; while (v) { n++; v >>= 1; } return n; },

  // AC symbols: (zero-run, value) pairs, ZRL for 16 zeros, EOB at the end
  tokenize(seq) {
    const out = [`DC=${seq[0]}`];
    let run = 0;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === 0) { run++; continue; }
      while (run > 15) { out.push('ZRL'); run -= 16; }
      out.push(`(${run},${seq[i]})`);
      run = 0;
    }
    if (run > 0) out.push('EOB');
    return out;
  },

  /* ----- Fast separable DCT on flat 64-element blocks (for whole images) ----- */
  _C: (() => {
    const C = new Float64Array(64);   // C[u*8+x] = c(u) cos((2x+1)uπ/16), orthonormal
    for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) {
      C[u * 8 + x] = (u === 0 ? Math.sqrt(1 / 8) : 0.5) * Math.cos((2 * x + 1) * u * Math.PI / 16);
    }
    return C;
  })(),
  dctFlat(f) {
    const C = JPEG._C, t = new Float64Array(64), F = new Float64Array(64);
    for (let x = 0; x < 8; x++) for (let v = 0; v < 8; v++) {
      let s = 0; for (let y = 0; y < 8; y++) s += C[v * 8 + y] * f[x * 8 + y]; t[x * 8 + v] = s;
    }
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
      let s = 0; for (let x = 0; x < 8; x++) s += C[u * 8 + x] * t[x * 8 + v]; F[u * 8 + v] = s;
    }
    return F;
  },
  idctFlat(F) {
    const C = JPEG._C, t = new Float64Array(64), f = new Float64Array(64);
    for (let u = 0; u < 8; u++) for (let y = 0; y < 8; y++) {
      let s = 0; for (let v = 0; v < 8; v++) s += C[v * 8 + y] * F[u * 8 + v]; t[u * 8 + y] = s;
    }
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      let s = 0; for (let u = 0; u < 8; u++) s += C[u * 8 + x] * t[u * 8 + y]; f[x * 8 + y] = s;
    }
    return f;
  },
  _zz: null,
  zzFlat() { if (!JPEG._zz) JPEG._zz = JPEG.zigzagOrder().map(([r, c]) => r * 8 + c); return JPEG._zz; },

  /* Process a whole grayscale image block by block.
     opts.quality -> real JPEG-style quantization;  opts.keep -> keep only the first K zigzag coefficients. */
  processImage(gray, W, H, opts) {
    const rec = new Uint8ClampedArray(W * H);
    const Q = opts.quality ? JPEG.quantTable(opts.quality).flat() : null;
    const zz = JPEG.zzFlat();
    let nz = 0, bits = 0, prevDC = 0, energyKept = 0, energyAll = 0;
    const f = new Float64Array(64);
    for (let by = 0; by < H; by += 8) for (let bx = 0; bx < W; bx += 8) {
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) f[x * 8 + y] = gray[(by + x) * W + bx + y] - 128;
      const F = JPEG.dctFlat(f);
      const G = new Float64Array(64);
      if (Q) {
        const q = new Int32Array(64);
        for (let i = 0; i < 64; i++) { q[i] = Math.round(F[i] / Q[i]); G[i] = q[i] * Q[i]; if (q[i]) nz++; }
        // Approximate entropy-coded size with typical Huffman code lengths:
        // DC: ~3 bits + size of the difference from the previous block's DC (DPCM)
        const dcd = q[0] - prevDC; prevDC = q[0];
        bits += 3 + JPEG.category(dcd);
        let run = 0;
        for (let k = 1; k < 64; k++) {
          const v = q[zz[k]];
          if (!v) { run++; continue; }
          while (run > 15) { bits += 11; run -= 16; }
          bits += 4 + JPEG.category(v);  // ~4-bit (run,size) Huffman code + amplitude bits
          run = 0;
        }
        if (run) bits += 4;  // EOB
      } else {
        for (let k = 0; k < 64; k++) {
          const i = zz[k], e = F[i] * F[i];
          energyAll += e;
          if (k < opts.keep) { G[i] = F[i]; energyKept += e; if (F[i]) nz++; }
        }
      }
      const g = JPEG.idctFlat(G);
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) rec[(by + x) * W + bx + y] = Math.round(g[x * 8 + y] + 128);
    }
    return { rec, nz, total: W * H, bits: Math.round(bits), energyPct: energyAll ? 100 * energyKept / energyAll : 100 };
  }
};

if (typeof module !== 'undefined') module.exports = { Metrics, RLE, Huffman, LZW, DPCM, Color, DWT, JPEG };
