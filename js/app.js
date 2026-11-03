/* =====================================================================
   UI code: renders each interactive section. No server, no storage
   except the MCQ answers in localStorage.
   ===================================================================== */

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vis = c => c === ' ' ? '␣' : c === '\n' ? '⏎' : esc(c);

document.addEventListener('DOMContentLoaded', () => {
  initLossy();
  initRLE();
  initHuffman();
  initLZW();
  initJPEG();
  initQuiz();
});

/* ---------- Lossy demo ---------- */
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
      <p>Mean absolute error: <b>${mae}</b>.
      At step 1 nothing is lost. Bigger steps remove detail and also reduce the number of distinct values, which makes the data cheaper to code. That trade-off is exactly what quantization does in JPEG.</p>`;
  };
  s.addEventListener('input', run);
  run();
}

/* ---------- RLE ---------- */
function initRLE() {
  const input = $('rle-input'), out = $('rle-out');
  const run = () => {
    const s = input.value;
    const runs = RLE.encode(s);
    const enc = RLE.toString(runs);
    const dec = RLE.decode(enc);
    const ok = dec === s;
    const pct = s.length ? (enc.length / s.length * 100).toFixed(1) : 0;
    out.innerHTML = `
      <h4>Runs found: ${runs.length}</h4>
      <div class="runs">${runs.map(r => `<span class="run"><b>${r.n}</b> × ${vis(r.ch)}</span>`).join('')}</div>
      <p><b>Encoded:</b></p>
      <p class="bits big">${esc(enc)}</p>
      <p>Original ${s.length} chars → encoded ${enc.length} chars (${pct}% of original size).
      ${pct > 100 ? '<span class="bad">Expansion: RLE is bad for data with few repeats.</span>' : ''}</p>
      <p class="${ok ? 'ok' : 'bad'}">${ok ? '✔ Decoding gives back the exact original (lossless).' : '✘ Mismatch. Input probably contains digits.'}</p>`;
  };
  input.addEventListener('input', run);
  run();
}

/* ---------- Huffman ---------- */
function treeHTML(n, codes) {
  if (!n) return '';
  if (!n.left && !n.right) {
    return `<li>${vis(n.sym)} <span class="w">${n.f}</span> → <code>${codes[n.sym]}</code></li>`;
  }
  return `<li>● <span class="w">${n.f}</span><ul>${treeHTML(n.left, codes)}${treeHTML(n.right, codes)}</ul></li>`;
}

function initHuffman() {
  const input = $('huf-input'), out = $('huf-out');
  const run = () => {
    const text = input.value;
    if (!text) { out.innerHTML = '<p>Type some text above.</p>'; return; }

    const counts = {};
    for (const ch of text) counts[ch] = (counts[ch] || 0) + 1;
    const items = Object.keys(counts).map(sym => ({ sym, f: counts[sym] }));
    const H = Huffman.build(items);
    const bits = [...text].map(ch => H.codes[ch]).join('');
    const distinct = items.length;
    const fixedLen = Math.max(1, Math.ceil(Math.log2(distinct)));
    const total = text.length;

    const byFreq = items.slice().sort((a, b) => b.f - a.f || (a.sym < b.sym ? -1 : 1));
    const byCode = items.slice().sort((a, b) =>
      H.codes[a.sym].length - H.codes[b.sym].length || (a.sym < b.sym ? -1 : 1));

    out.innerHTML = `
      <div class="two-col">
        <div>
          <h4>1. Frequency table</h4>
          <table class="tbl">
            <tr><th>Symbol</th><th>Count</th><th>Probability</th></tr>
            ${byFreq.map(it => `<tr><td>${vis(it.sym)}</td><td>${it.f}</td><td>${(it.f / total).toFixed(2)}</td></tr>`).join('')}
          </table>
        </div>
        <div>
          <h4>2. Code table</h4>
          <table class="tbl">
            <tr><th>Symbol</th><th>Code</th><th>Length</th></tr>
            ${byCode.map(it => `<tr><td>${vis(it.sym)}</td><td><code>${H.codes[it.sym]}</code></td><td>${H.codes[it.sym].length}</td></tr>`).join('')}
          </table>
        </div>
      </div>

      <h4>3. Merge steps (the two smallest weights are merged each time)</h4>
      <ol class="steps">${H.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>

      <h4>4. The code tree</h4>
      <ul class="tree">${treeHTML(H.root, H.codes)}</ul>

      <h4>5. Encoded bit stream</h4>
      <p class="bits">${esc(bits)}</p>
      <p>Bits used: Huffman <b>${bits.length}</b> · fixed-length (${fixedLen} bits/symbol) <b>${total * fixedLen}</b> · 8-bit ASCII <b>${total * 8}</b></p>
      <p>Average code length: <b>${H.avg.toFixed(2)}</b> bits/symbol. Entropy (theoretical minimum): <b>${H.entropy.toFixed(2)}</b> bits/symbol.</p>
      <p class="note">Huffman codes are always within 1 bit of the entropy. Decoding walks the tree: 0 = left, 1 = right, and a leaf gives one symbol.</p>`;
  };
  input.addEventListener('input', run);
  run();
}

/* ---------- LZW ---------- */
function initLZW() {
  const input = $('lzw-input'), out = $('lzw-out');
  const run = () => {
    const text = input.value;
    if (!text) { out.innerHTML = '<p>Type some text above.</p>'; return; }

    const E = LZW.encode(text);
    const D = LZW.decode(E.codes, E.alphabet);
    const ok = D.text === text;
    const bitsPer = Math.max(1, Math.ceil(Math.log2(E.dict.size)));

    out.innerHTML = `
      <p>Initial dictionary (single symbols): ${E.alphabet.map((c, i) => `<code>${i}=${vis(c)}</code>`).join(' ')}</p>

      <h4>Encoder walk-through</h4>
      <div class="scroll"><table class="tbl">
        <tr><th>Read c</th><th>w + c</th><th>Output</th><th>New dictionary entry</th></tr>
        ${E.steps.map(s => `
          <tr>
            <td>${vis(s.read)}</td>
            <td>${vis(s.cand)}</td>
            <td>${s.out ? `<b>${s.out.code}</b> (${vis(s.out.text)})` : '—'}</td>
            <td>${s.entry ? `${s.entry.code} = ${vis(s.entry.text)}` : '—'}</td>
          </tr>`).join('')}
      </table></div>

      <p><b>Output codes:</b> <code>${E.codes.join(' ')}</code></p>
      <p>Input: ${text.length} chars × 8 bits = ${text.length * 8} bits.
      Output: ${E.codes.length} codes × about ${bitsPer} bits = about ${E.codes.length * bitsPer} bits.
      Short text may not shrink. LZW shines on long, repetitive data.</p>

      <h4>Decoder rebuilds the same dictionary</h4>
      <div class="scroll"><table class="tbl">
        <tr><th>Code in</th><th>Decoded string</th><th>Dictionary entry added</th></tr>
        ${D.steps.map(s => `
          <tr>
            <td>${s.code}</td>
            <td>${vis(s.entry)}</td>
            <td>${s.add ? `${s.add.code} = ${vis(s.add.text)}` : '—'}</td>
          </tr>`).join('')}
      </table></div>

      <p class="${ok ? 'ok' : 'bad'}">${ok ? '✔ Decoded text equals the original (lossless).' : '✘ Mismatch.'}</p>`;
  };
  input.addEventListener('input', run);
  run();
}

/* ---------- JPEG (stepper) ---------- */
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
      const e = Math.abs(block[x][y] - rec[x][y]);
      maxErr = Math.max(maxErr, e);
      sumErr += e;
    }
    const nz = seq.filter(v => v !== 0).length;
    return { quality, Q, shifted, F, quant, seq, tokens, rec, deq, maxErr, meanErr: sumErr / 64, nz };
  };

  const slides = D => [
    {
      t: '1. Input: one 8×8 block',
      d: 'The image is cut into 8×8 blocks, processed left to right and top to bottom. These are the gray levels (0 to 255) of one block.',
      h: matHTML(block)
    },
    {
      t: '2. Level shift',
      d: 'Subtract 128 so the values are centred on zero (range becomes −128 to 127). This keeps the DCT output balanced.',
      h: matHTML(D.shifted)
    },
    {
      t: '3. 2-D DCT: spatial → frequency',
      d: 'The top-left value F(0,0) is the DC term, which is the block average. Moving right or down means higher frequencies. Most energy sits in the top-left corner. This is energy compaction.',
      h: matHTML(D.F, { dec: 1, heat: true })
    },
    {
      t: '4. Quantization (the only lossy step)',
      d: `Divide each coefficient by the matching entry of table Q and round. Quality is ${D.quality}. Large Q values at the bottom-right zero out high frequencies that the eye rarely notices.`,
      h: `<div class="pair">
            <div><h5>Quantization table Q</h5>${matHTML(D.Q)}</div>
            <div><h5>Quantized F / Q (rounded)</h5>${matHTML(D.quant, { heat: true })}</div>
          </div>
          <p>Nonzero coefficients now: <b>${D.nz}</b> of 64.</p>`
    },
    {
      t: '5. Zigzag scan',
      d: 'Read the 8×8 grid along anti-diagonals. Low frequencies come first and the zeros bunch up at the end, which helps the next step.',
      h: `<div class="seq">${D.seq.map((v, i) =>
            `<span class="cell ${v === 0 ? 'z' : ''}"><small>${i}</small>${v}</span>`).join('')}</div>`
    },
    {
      t: '6. Run-length + entropy coding',
      d: 'The sequence becomes (zero-run, value) pairs. Trailing zeros are replaced by one EOB (end-of-block) symbol. The tokens are then Huffman-coded, so frequent tokens get short codes.',
      h: `<p class="bits">${D.tokens.map(esc).join('  ')}</p>
          <p>Output tokens: <b>${D.tokens.length}</b> instead of 64 values.</p>`
    },
    {
      t: '7. Decoder: dequantize → IDCT → +128',
      d: 'Multiply each value by Q to get approximate DCT values, apply the inverse DCT, and add 128 back. The result is close to the original but not identical. That gap is the loss.',
      h: `<div class="pair">
            <div><h5>Original block</h5>${matHTML(block)}</div>
            <div><h5>Reconstructed block</h5>${matHTML(D.rec)}</div>
          </div>
          <p>Max pixel error: <b>${D.maxErr}</b> · Mean absolute error: <b>${D.meanErr.toFixed(2)}</b>.
          Try moving the quality slider. Lower quality gives more error and fewer tokens.</p>`
    }
  ];

  const render = () => {
    const D = compute();
    const S = slides(D);
    if (idx > S.length - 1) idx = S.length - 1;
    title.textContent = S[idx].t;
    body.innerHTML = `<p>${S[idx].d}</p>${S[idx].h}`;
    dots.innerHTML = S.map((_, i) =>
      `<button class="dot ${i === idx ? 'on' : ''}" data-i="${i}" aria-label="Step ${i + 1}"></button>`).join('');
    prev.disabled = idx === 0;
    next.disabled = idx === S.length - 1;
  };

  q.addEventListener('input', render);
  prev.addEventListener('click', () => { idx--; render(); });
  next.addEventListener('click', () => { idx++; render(); });
  dots.addEventListener('click', e => {
    const b = e.target.closest('.dot');
    if (b) { idx = +b.dataset.i; render(); }
  });
  render();
}

/* ---------- MCQs (answers saved only in localStorage, no score) ---------- */
const QUIZ = [
  {
    q: 'Which of these is a lossless technique?',
    o: ['Quantization in JPEG', 'Run-length encoding', 'Discarding high-frequency DCT coefficients', 'Psychovisual thresholding'],
    a: 1,
    why: 'RLE only rewrites runs, and decoding restores the exact input. The other three discard information.'
  },
  {
    q: 'In Huffman coding, which symbols get the shortest codes?',
    o: ['The least frequent symbols', 'The most frequent symbols', 'The symbols with the largest values', 'All symbols get the same length'],
    a: 1,
    why: 'Huffman merges the least-weight nodes first, so frequent symbols stay high in the tree with short paths.'
  },
  {
    q: 'What does "prefix-free" mean for Huffman codes?',
    o: ['Every code starts with a 0', 'No code is the beginning of another code', 'All codes have equal length', 'Codes are sorted alphabetically'],
    a: 1,
    why: 'Prefix-free codes can be decoded bit by bit without separators, because no code can be mistaken for the start of another.'
  },
  {
    q: 'RLE is applied to "AAAABBBCCDAA". What is the output?',
    o: ['4A3B2C1D2A', '4A3B2C1D', 'A4B3C2D1A2', '4A3B2C2D2A'],
    a: 0,
    why: 'Runs are AAAA, BBB, CC, D, AA, which gives 4A 3B 2C 1D 2A.'
  },
  {
    q: 'After the 2-D DCT of a typical 8×8 block, where is most of the energy?',
    o: ['Bottom-right corner (high frequencies)', 'Spread evenly across all 64 coefficients', 'Top-left corner (low frequencies)', 'In the centre of the block'],
    a: 2,
    why: 'Natural image blocks are smooth, so their energy sits in the DC term and nearby low frequencies. This is energy compaction.'
  },
  {
    q: 'Which JPEG step is irreversible and causes the information loss?',
    o: ['Level shift', 'Zigzag scan', 'Quantization', 'Entropy coding'],
    a: 2,
    why: 'Rounding after division by Q cannot be undone, so the decoder can only multiply back and approximate.'
  },

  /* ---- Chapter 6: Object recognition ---- */
  {
    part: 'Chapter 6 · Object recognition & case studies',
    q: 'Which pair correctly matches recognition families to descriptor types?',
    o: ['Decision-theoretic: relational; Structural: quantitative', 'Decision-theoretic: quantitative; Structural: qualitative/relational', 'Both use only quantitative descriptors', 'Both use only grammars'],
    a: 1,
    why: 'Decision-theoretic methods work on measured numbers (pattern vectors). Structural methods work on how primitives relate (strings, trees).'
  },
  {
    q: 'With decision functions d₁(x) … d_W(x), an unknown x is assigned to class ωᵢ when…',
    o: ['dᵢ(x) is the smallest', 'dᵢ(x) = 0', 'dᵢ(x) is the largest of all dⱼ(x)', 'dᵢ(x) is negative'],
    a: 2,
    why: 'dᵢ(x) > dⱼ(x) for all j ≠ i. The boundary between two classes is where dᵢⱼ(x) = dᵢ(x) − dⱼ(x) = 0.'
  },
  {
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
    q: 'In a CNN, the main purpose of a pooling layer is to…',
    o: ['add more filters', 'reduce spatial size, cutting computation and helping control overfitting', 'convert features into class probabilities', 'increase image resolution'],
    a: 1,
    why: 'Max or average pooling shrinks width and height and gives a more abstract representation.'
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
    why: 'The RPN slides over the shared feature map and proposes regions; it is trained jointly with the detector.'
  },
  {
    q: 'What does RoI pooling do?',
    o: ['Removes background pixels', 'Turns proposals of any size into fixed-size feature vectors', 'Increases the number of proposals', 'Computes IoU'],
    a: 1,
    why: 'The fully connected classifier needs a fixed-size input, so every proposal is pooled to the same grid size.'
  },
  {
    q: 'Grammar G with P = {S→aA, A→bA, A→bB, B→c} generates strings of the form…',
    o: ['aⁿbⁿ', 'abⁿc (n ≥ 1)', 'abc only', 'cbⁿa'],
    a: 1,
    why: 'S→aA starts with a, A→bA repeats b, A→bB adds a final b, and B→c ends with c.'
  },
  {
    q: 'Chain code 0 0 3 2 2 1 (4-directional). What is its shape number?',
    o: ['303303', '033033', '003221', '330330'],
    a: 1,
    why: 'First difference (current − previous, mod 4, circular) = 3 0 3 3 0 3. The smallest cyclic rotation is 0 3 3 0 3 3.'
  },
  {
    q: 'Shapes a and b have degree of similarity k = 8. Their distance D(a, b) is…',
    o: ['8', '0', '1/8', '64'],
    a: 2,
    why: 'D(a, b) = 1/k. A larger k means more similar shapes and a smaller distance.'
  },
  {
    q: 'In string matching, if strings a and b are identical then…',
    o: ['α = 0 and R = 0', 'β = 0 and R = α/β is infinite', 'β = max(|a|,|b|)', 'R = 1'],
    a: 1,
    why: 'β = max(|a|,|b|) − α = 0 when every symbol matches, so R = α/β → ∞.'
  }
];

function initQuiz() {
  const box = $('quiz-box');
  const KEY = 'dip-compression-mcq-v1';
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
