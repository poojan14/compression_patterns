/* =====================================================================
   Pure compression algorithms (no DOM code). Used by app.js.
   ===================================================================== */

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
  toString(runs) {
    return runs.map(r => r.n + r.ch).join('');
  },
  decode(enc) {
    let out = '';
    const re = /(\d+)(\D)/g;
    let m;
    while ((m = re.exec(enc)) !== null) {
      out += m[2].repeat(parseInt(m[1], 10));
    }
    return out;
  }
};

/* ---------- 2. Huffman coding (lossless, variable-length) ---------- */
const Huffman = {
  build(items) {
    let uid = 0;
    let nodes = items.map(it => ({ sym: it.sym, f: it.f, id: uid++, left: null, right: null }));
    const total = items.reduce((s, it) => s + it.f, 0);
    const steps = [];
    const name = n => n.left ? `node(${n.f})` : `'${n.sym === ' ' ? '␣' : n.sym}'(${n.f})`;

    if (nodes.length === 1) {
      steps.push('Only one distinct symbol, so it gets the code "0".');
    }
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.f - b.f || a.id - b.id);
      const a = nodes.shift();
      const b = nodes.shift();
      const p = { sym: null, f: a.f + b.f, id: uid++, left: a, right: b };
      steps.push(`Merge ${name(a)} + ${name(b)} → node(${p.f})`);
      nodes.push(p);
    }
    const root = nodes[0] || null;

    const codes = {};
    const walk = (n, prefix) => {
      if (!n.left && !n.right) { codes[n.sym] = prefix || '0'; return; }
      walk(n.left, prefix + '0');
      walk(n.right, prefix + '1');
    };
    if (root) walk(root, '');

    const avg = items.reduce((s, it) => s + codes[it.sym].length * it.f, 0) / total;
    const entropy = -items.reduce((s, it) => {
      const p = it.f / total;
      return s + p * Math.log2(p);
    }, 0);
    return { root, codes, steps, avg, entropy };
  }
};

/* ---------- 3. LZW (lossless, dictionary-based) ---------- */
const LZW = {
  encode(text) {
    const alphabet = [...new Set(text)].sort();
    const dict = new Map(alphabet.map((c, i) => [c, i]));
    const codes = [];
    const steps = [];
    let w = '';
    for (const c of text) {
      const wc = w + c;
      if (dict.has(wc)) {
        steps.push({ read: c, cand: wc, out: null, entry: null });
        w = wc;
      } else {
        const outCode = dict.get(w);
        const newCode = dict.size;
        dict.set(wc, newCode);
        codes.push(outCode);
        steps.push({
          read: c, cand: wc,
          out: { text: w, code: outCode },
          entry: { text: wc, code: newCode }
        });
        w = c;
      }
    }
    if (w !== '') {
      const last = dict.get(w);
      codes.push(last);
      steps.push({ read: 'EOF', cand: w, out: { text: w, code: last }, entry: null });
    }
    return { codes, steps, dict, alphabet };
  },

  decode(codes, alphabet) {
    if (!codes.length) return { text: '', steps: [] };
    const table = [...alphabet];
    let prev = table[codes[0]];
    let out = prev;
    const steps = [{ code: codes[0], entry: prev, add: null }];
    for (let i = 1; i < codes.length; i++) {
      const k = codes[i];
      const entry = k < table.length ? table[k] : prev + prev[0];
      const add = prev + entry[0];
      table.push(add);
      out += entry;
      steps.push({ code: k, entry, add: { text: add, code: table.length - 1 } });
      prev = entry;
    }
    return { text: out, steps };
  }
};

/* ---------- 4. JPEG building blocks ---------- */
const JPEG = {
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

  blank() {
    return Array.from({ length: 8 }, () => Array(8).fill(0));
  },

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

  levelShift(b) {
    return b.map(r => r.map(v => v - 128));
  },

  cu(u) {
    return u === 0 ? 1 / Math.SQRT2 : 1;
  },

  dct(f) {
    const F = JPEG.blank();
    for (let u = 0; u < 8; u++) {
      for (let v = 0; v < 8; v++) {
        let s = 0;
        for (let x = 0; x < 8; x++) {
          for (let y = 0; y < 8; y++) {
            s += f[x][y] *
              Math.cos((2 * x + 1) * u * Math.PI / 16) *
              Math.cos((2 * y + 1) * v * Math.PI / 16);
          }
        }
        F[u][v] = 0.25 * JPEG.cu(u) * JPEG.cu(v) * s;
      }
    }
    return F;
  },

  idct(F) {
    const f = JPEG.blank();
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        let s = 0;
        for (let u = 0; u < 8; u++) {
          for (let v = 0; v < 8; v++) {
            s += JPEG.cu(u) * JPEG.cu(v) * F[u][v] *
              Math.cos((2 * x + 1) * u * Math.PI / 16) *
              Math.cos((2 * y + 1) * v * Math.PI / 16);
          }
        }
        f[x][y] = 0.25 * s;
      }
    }
    return f;
  },

  quantTable(quality) {
    const s = quality < 50 ? 5000 / quality : 200 - 2 * quality;
    return JPEG.Q50.map(r =>
      r.map(v => Math.min(255, Math.max(1, Math.floor((v * s + 50) / 100))))
    );
  },

  quantize(F, Q) {
    return F.map((r, i) => r.map((v, j) => Math.round(v / Q[i][j])));
  },

  dequantize(qm, Q) {
    return qm.map((r, i) => r.map((v, j) => v * Q[i][j]));
  },

  reconstruct(deq) {
    const f = JPEG.idct(deq);
    return f.map(r => r.map(v => Math.min(255, Math.max(0, Math.round(v + 128)))));
  },

  zigzagOrder() {
    const order = [];
    for (let s = 0; s <= 14; s++) {
      const list = [];
      for (let i = 0; i < 8; i++) {
        const j = s - i;
        if (j >= 0 && j < 8) list.push([i, j]);
      }
      if (s % 2 === 0) list.reverse();
      order.push(...list);
    }
    return order;
  },

  zigzagSeq(M) {
    return JPEG.zigzagOrder().map(([r, c]) => M[r][c]);
  },

  tokenize(seq) {
    const out = [`DC=${seq[0]}`];
    let run = 0;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === 0) run++;
      else { out.push(`(${run},${seq[i]})`); run = 0; }
    }
    if (run > 0) out.push('EOB');
    return out;
  }
};
