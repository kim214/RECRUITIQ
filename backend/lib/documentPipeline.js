/**
 * Candidate document pipeline:
 * validate → detect type → extract text → OCR if enabled → normalize → chunk
 *
 * Reuses pdf-parse / mammoth / word-extractor. Does not send raw files to Ollama.
 */

const path = require('path');
const { isOcrEnabled, isRemoteOcrConfigured, ocrReady, recognizeRemote } = require('./ocrService');

const MAX_FILE_BYTES = Number(process.env.DOC_MAX_BYTES || 10 * 1024 * 1024);
const MIN_TEXT_CHARS = 15;
const LLM_COMBINED_BUDGET = Number(process.env.DOC_LLM_MAX_CHARS || 12000);
const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 140;

const LABEL_BUDGET = {
  Resume: 8000,
  'Cover Letter': 1500,
  Transcript: 4000,
};

const ALLOWED_TYPES = new Set(['pdf', 'docx', 'doc', 'txt', 'png', 'jpeg']);
const EXT_FOR_TYPE = {
  pdf: ['.pdf'],
  docx: ['.docx'],
  doc: ['.doc'],
  txt: ['.txt', '.md', '.csv'],
  png: ['.png'],
  jpeg: ['.jpg', '.jpeg'],
};

function sniffType(buffer, filename = '', claimedMime = '') {
  const ext = path.extname(filename || '').toLowerCase();
  if (!buffer?.length) {
    return { type: 'empty', ext, mime: claimedMime || '' };
  }

  const head = buffer.subarray(0, 8);
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { type: 'pdf', ext: ext || '.pdf', mime: 'application/pdf' };
  }
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) {
    return { type: 'png', ext: ext || '.png', mime: 'image/png' };
  }
  if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) {
    return { type: 'jpeg', ext: ext || '.jpg', mime: 'image/jpeg' };
  }
  if (head[0] === 0xD0 && head[1] === 0xCF && head[2] === 0x11 && head[3] === 0xE0) {
    return { type: 'doc', ext: ext || '.doc', mime: 'application/msword' };
  }
  if (head[0] === 0x50 && head[1] === 0x4B) {
    const zipProbe = buffer.subarray(0, Math.min(buffer.length, 4000)).toString('latin1');
    if (zipProbe.includes('word/') || ext === '.docx') {
      return {
        type: 'docx',
        ext: '.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
    return { type: 'unknown', ext, mime: claimedMime || 'application/zip' };
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 800));
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127) || byte >= 192) printable += 1;
  }
  if (sample.length && printable / sample.length >= 0.9) {
    return { type: 'txt', ext: ext || '.txt', mime: 'text/plain' };
  }

  return { type: 'unknown', ext, mime: claimedMime || 'application/octet-stream' };
}

function validateDocumentBuffer(buffer, { filename = '', mimetype = '' } = {}) {
  if (!buffer) {
    return { ok: false, code: 'empty_document', error: 'Empty document' };
  }
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!buf.length) {
    return { ok: false, code: 'empty_document', error: 'Empty document' };
  }
  if (buf.length > MAX_FILE_BYTES) {
    return { ok: false, code: 'too_large', error: `File exceeds ${MAX_FILE_BYTES} byte limit` };
  }

  const ext = path.extname(filename || '').toLowerCase();
  const detected = sniffType(buf, filename, mimetype);
  if (detected.type === 'empty') {
    return { ok: false, code: 'empty_document', error: 'Empty document', detected };
  }
  if (!ALLOWED_TYPES.has(detected.type)) {
    return {
      ok: false,
      code: 'unsupported_type',
      error: `Unsupported or unreadable file type${ext ? ` (${ext})` : ''}`,
      detected,
    };
  }
  const expectedExts = EXT_FOR_TYPE[detected.type] || [];
  if (ext && expectedExts.length && !expectedExts.includes(ext)) {
    return {
      ok: false,
      code: 'mime_mismatch',
      error: `File content does not match extension ${ext}`,
      detected,
    };
  }
  return { ok: true, detected, bytes: buf.length };
}

function normalizeText(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/\u0000/g, '')
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\n-- \d+ of \d+ --\s*/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function budgetForLabel(label) {
  if (LABEL_BUDGET[label]) return LABEL_BUDGET[label];
  if (/certificate/i.test(label || '')) return 1500;
  return 3000;
}

function budgetText(text, maxChars) {
  const clean = normalizeText(text);
  if (clean.length <= maxChars) return clean;
  const head = Math.floor(maxChars * 0.72);
  const tail = Math.max(0, maxChars - head - 16);
  return `${clean.slice(0, head)}\n[...truncated...]\n${tail ? clean.slice(-tail) : ''}`.trim();
}

function chunkText(text, { size = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) {
  const clean = normalizeText(text);
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks = [];
  let i = 0;
  while (i < clean.length && chunks.length < 16) {
    const end = Math.min(clean.length, i + size);
    chunks.push(clean.slice(i, end).trim());
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return chunks.filter(Boolean);
}

async function extractPdf(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    let pageCount = Array.isArray(result?.pages) ? result.pages.length : 0;
    if (!pageCount) {
      try {
        const info = await parser.getInfo();
        pageCount = info?.total || info?.numPages || info?.pages || 0;
      } catch {
        pageCount = 0;
      }
    }
    return {
      text: result?.text || '',
      pageCount,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extractDocx(buffer) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function extractDoc(buffer) {
  const WordExtractor = require('word-extractor');
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  const body = await doc.getBody();
  return body || '';
}

async function maybeOcr(buffer, detected, filename = 'document') {
  try {
    if (String(process.env.OCR_ENABLED || '').trim() === '0') {
      return {
        attempted: false,
        text: '',
        error: 'OCR is disabled',
      };
    }
    if (!['png', 'jpeg', 'pdf'].includes(detected.type)) {
      return { attempted: false, text: '', error: 'OCR supports PNG, JPEG, and scanned PDF' };
    }

    if (await ocrReady()) {
      const result = await recognizeRemote(buffer, { filename, type: detected.type });
      return { attempted: true, text: result.text || '', error: result.text ? null : 'OCR returned no text' };
    }

    if (isRemoteOcrConfigured()) {
      return { attempted: true, text: '', error: 'OCR sidecar is not reachable on the GCP VM' };
    }

    if (!isOcrEnabled()) {
      return {
        attempted: false,
        text: '',
        error: 'OCR sidecar is not on the GCP VM yet',
      };
    }

    if (process.env.VERCEL) {
      return { attempted: false, text: '', error: 'OCR runs on the GCP VM (set OCR_BASE_URL)' };
    }
    if (detected.type === 'pdf') {
      return { attempted: false, text: '', error: 'Local OCR supports PNG/JPEG only; scanned PDFs need the VM sidecar' };
    }

    let createWorker;
    try {
      ({ createWorker } = require('tesseract.js'));
    } catch {
      return { attempted: false, text: '', error: 'tesseract.js is not installed; use the GCP OCR sidecar' };
    }
    if (typeof createWorker !== 'function') {
      return { attempted: false, text: '', error: 'tesseract.js is not available' };
    }

    const worker = await createWorker('eng');
    try {
      const { data } = await worker.recognize(buffer);
      return { attempted: true, text: data?.text || '', error: null };
    } finally {
      await worker.terminate().catch(() => {});
    }
  } catch (err) {
    return { attempted: true, text: '', error: err.message || 'OCR failed' };
  }
}

async function extractByType(buffer, detected) {
  if (detected.type === 'pdf') {
    const extracted = await extractPdf(buffer);
    return { text: extracted.text, method: 'pdf-parse', pageCount: extracted.pageCount };
  }
  if (detected.type === 'docx') {
    return { text: await extractDocx(buffer), method: 'mammoth', pageCount: 0 };
  }
  if (detected.type === 'doc') {
    return { text: await extractDoc(buffer), method: 'word-extractor', pageCount: 0 };
  }
  if (detected.type === 'txt') {
    return { text: buffer.toString('utf8'), method: 'utf8', pageCount: 0 };
  }
  if (detected.type === 'png' || detected.type === 'jpeg') {
    return { text: '', method: 'image', pageCount: 1, scanned: true };
  }
  throw new Error(`Unsupported file type: ${detected.type}`);
}

async function processDocument({ buffer, filename = '', mimetype = '', label = 'Document' } = {}) {
  const raw = buffer == null ? Buffer.alloc(0) : (Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  const validation = validateDocumentBuffer(raw, { filename, mimetype });
  if (!validation.ok) {
    return {
      ok: false,
      label,
      chars: 0,
      text: '',
      llmText: '',
      chunks: [],
      ...validation,
    };
  }

  const detected = validation.detected;
  try {
    const extracted = await extractByType(raw, detected);
    let text = normalizeText(extracted.text);
    let method = extracted.method;
    let scanned = !!extracted.scanned || (detected.type === 'pdf' && extracted.pageCount > 0 && text.length < 40);
    const warnings = [];

    if (text.length < MIN_TEXT_CHARS && (scanned || detected.type === 'png' || detected.type === 'jpeg')) {
      const ocr = await maybeOcr(raw, detected, filename);
      if (ocr.text && normalizeText(ocr.text).length >= MIN_TEXT_CHARS) {
        text = normalizeText(ocr.text);
        method = 'ocr';
        scanned = true;
      } else {
        warnings.push(ocr.error || 'No OCR text');
        return {
          ok: false,
          label,
          chars: 0,
          text: '',
          llmText: '',
          chunks: [],
          code: 'scanned_no_text',
          error: 'Scanned or image document has no extractable text',
          detected,
          method,
          scanned: true,
          ocrEnabled: isOcrEnabled(),
          warnings,
        };
      }
    }

    if (!text || text.length < MIN_TEXT_CHARS) {
      return {
        ok: false,
        label,
        chars: 0,
        text: '',
        llmText: '',
        chunks: [],
        code: 'empty_document',
        error: 'No readable text found in document',
        detected,
        method,
        scanned,
      };
    }

    const budget = budgetForLabel(label);
    const truncated = text.length > budget;
    const llmText = budgetText(text, budget);
    return {
      ok: true,
      label,
      chars: text.length,
      text,
      llmText,
      chunks: chunkText(llmText),
      truncated,
      detected,
      method,
      scanned,
      error: null,
      code: null,
    };
  } catch (err) {
    const message = err.message || 'Failed to read document';
    const corrupt = /pdf|invalid|corrupt|malformed|format/i.test(message);
    return {
      ok: false,
      label,
      chars: 0,
      text: '',
      llmText: '',
      chunks: [],
      code: corrupt ? 'corrupt_document' : 'unreadable',
      error: message,
      detected,
    };
  }
}

function assembleLlmText(sections, maxChars = LLM_COMBINED_BUDGET) {
  const parts = [];
  let used = 0;
  for (const section of sections || []) {
    const body = section.llmText || section.text || '';
    if (!body) continue;
    const header = `--- ${section.label} ---\n`;
    const remaining = maxChars - used;
    if (remaining <= 80) break;
    const slice = body.length + header.length > remaining
      ? budgetText(body, Math.max(0, remaining - header.length))
      : body;
    const block = `${header}${slice}`;
    parts.push(block);
    used += block.length + 2;
  }
  return parts.join('\n\n').trim();
}

module.exports = {
  MAX_FILE_BYTES,
  MIN_TEXT_CHARS,
  LLM_COMBINED_BUDGET,
  isOcrEnabled,
  sniffType,
  validateDocumentBuffer,
  normalizeText,
  budgetText,
  budgetForLabel,
  chunkText,
  processDocument,
  assembleLlmText,
};
