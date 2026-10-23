#!/usr/bin/env node
/**
 * RecruitIQ OCR sidecar for the GCP VM.
 * Uses system Tesseract (and pdftoppm for scanned PDFs). Listen on localhost
 * and put Nginx in front, or open OCR_PORT only to the API.
 *
 *   OCR_PORT=3100 OCR_API_KEY=same-as-ollama node ocr-server.js
 */

const http = require('http');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = Number(process.env.OCR_PORT || 3100);
const HOST = process.env.OCR_HOST || '127.0.0.1';
const API_KEY = process.env.OCR_API_KEY || process.env.OLLAMA_API_KEY || '';
const MAX_BYTES = Number(process.env.DOC_MAX_BYTES || 10 * 1024 * 1024);
const MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 4);

function authorized(req) {
  if (!API_KEY) return true;
  const got = req.headers['x-ocr-key'] || req.headers['x-ollama-key'] || '';
  return got === API_KEY;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function tesseractBin() {
  return process.env.TESSERACT_BIN || 'tesseract';
}

function hasBinary(bin) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [bin], { encoding: 'utf8' });
  return result.status === 0;
}

function run(bin, args, { input, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    const errors = [];
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} timed out`));
    }, timeoutMs);
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => errors.push(d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${bin} failed: ${Buffer.concat(errors).toString('utf8').slice(0, 400)}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function ocrImage(buffer) {
  return run(tesseractBin(), ['stdin', 'stdout', '--psm', '6', '-l', 'eng'], { input: buffer });
}

function pdfToPngs(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recruitiq-ocr-'));
  const pdfPath = path.join(dir, 'doc.pdf');
  fs.writeFileSync(pdfPath, buffer);
  const prefix = path.join(dir, 'page');
  const result = spawnSync('pdftoppm', ['-png', '-f', '1', '-l', String(MAX_PAGES), pdfPath, prefix], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(result.stderr || 'pdftoppm failed');
  }
  const files = fs.readdirSync(dir)
    .filter((name) => name.startsWith('page') && name.endsWith('.png'))
    .sort()
    .map((name) => path.join(dir, name));
  return { dir, files };
}

async function ocrPdf(buffer) {
  if (!hasBinary('pdftoppm')) {
    throw new Error('pdftoppm is not installed (apt install poppler-utils)');
  }
  const { dir, files } = pdfToPngs(buffer);
  try {
    const pages = [];
    for (const file of files) {
      const text = await ocrImage(fs.readFileSync(file));
      if (text.trim()) pages.push(text.trim());
    }
    return pages.join('\n\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error('File too large to parse'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (!authorized(req)) return json(res, 401, { ok: false, message: 'Unauthorized' });

  if (req.method === 'GET' && (req.url === '/health' || req.url === '/ocr/health' || req.url === '/ocr/health/')) {
    return json(res, 200, {
      ok: true,
      engine: 'tesseract',
      tesseract: hasBinary(tesseractBin()),
      pdftoppm: hasBinary('pdftoppm'),
    });
  }

  if (req.method === 'POST' && (req.url === '/ocr' || req.url.startsWith('/ocr?'))) {
    try {
      if (!hasBinary(tesseractBin())) {
        return json(res, 503, { ok: false, message: 'tesseract is not installed on this VM' });
      }
      const buffer = await readBody(req);
      const filename = decodeURIComponent(String(req.headers['x-filename'] || 'document'));
      const mime = String(req.headers['content-type'] || '');
      const isPdf = mime.includes('pdf') || /\.pdf$/i.test(filename);
      const text = isPdf ? await ocrPdf(buffer) : await ocrImage(buffer);
      return json(res, 200, { ok: true, engine: 'tesseract', text: String(text || '').trim() });
    } catch (err) {
      return json(res, 500, { ok: false, message: err.message || 'OCR failed' });
    }
  }

  json(res, 404, { ok: false, message: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`RecruitIQ OCR listening on http://${HOST}:${PORT}`);
  console.log(`tesseract=${hasBinary(tesseractBin())} pdftoppm=${hasBinary('pdftoppm')} auth=${API_KEY ? 'on' : 'off'}`);
});
