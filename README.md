# Image Compression & Object Recognition

Interactive static website for Digital Image Processing (B.Tech Sem 5).

**Part A · Image compression:** why compress and compression ratio, the three redundancies (DPCM, quantization, chroma subsampling), the compression model and full JPEG pipeline, lossless vs lossy, RLE (text and binary image), Huffman (worked example with header cost), LZW (ASCII dictionary), DCT and DWT, JPEG block stepper and whole-image simulator (you can load your own image; it never leaves the browser).

**Part B · Ch 6 Object recognition & case studies:** patterns and pattern classes (vectors, strings, trees),
decision-theoretic methods (minimum-distance classifier, Bayes classifier), neural networks
(perceptron, activation functions, MLP, CNN convolution/pooling), case studies (YOLO with IoU, Faster R-CNN with RoI pooling),
structural methods (syntactic recognition with grammar and automaton, shape numbers, string matching).

Self-check MCQs for both parts are saved in the browser only (no grading).

No server, no database, no build step.

## Run locally
Double-click `index.html`, or run `python -m http.server 8000` and open http://localhost:8000

## Deploy on GitHub Pages
1. Create a public repo (e.g. `dip-compression-lab`) at https://github.com/new
2. Upload `index.html`, `README.md`, the `css` folder and the `js` folder (keep the structure; `js` has 3 files)
3. Settings → Pages → Source: Deploy from a branch → Branch `main`, folder `/ (root)` → Save
4. After 1–2 minutes the site is live at `https://<username>.github.io/dip-compression-lab/`

Reference: Gonzalez & Woods, *Digital Image Processing*.
