/**
 * Fetches and extracts text from applicant uploads (resume, transcript, certificates).
 */
const fs = require('fs');
const path = require('path');
const { getStorageClient, BUCKET_NAME } = require('./storage');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const FETCH_TIMEOUT_MS = 20000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function extensionFromUrl(url) {
  try {
    const clean = url.split('?')[0].split('#')[0];
    return path.extname(clean).toLowerCase();
  } catch {
    return '';
  }
}

function resolveFetchUrl(url, options = {}) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) {
    const base = options.apiOrigin || process.env.PUBLIC_APP_URL || 'http://localhost:3001';
    return `${base.replace(/\/$/, '')}${url}`;
  }
  return url;
}

function supabasePathFromPublicUrl(url) {
  const marker = `/storage/v1/object/public/${BUCKET_NAME}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

async function fetchRemoteBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_FILE_BYTES) throw new Error('File too large to parse');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadSupabaseObject(storagePath) {
  const supabase = getStorageClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(storagePath);
  if (error) throw error;
  const buf = Buffer.from(await data.arrayBuffer());
  if (buf.length > MAX_FILE_BYTES) throw new Error('File too large to parse');
  return buf;
}

async function loadDocumentBuffer(url, options = {}) {
  if (!url) return null;

  if (url.startsWith('/uploads/')) {
    const rel = url.replace(/^\/uploads\/?/, '');
    const filePath = path.join(UPLOAD_DIR, rel);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      if (buf.length > MAX_FILE_BYTES) throw new Error('File too large to parse');
      return buf;
    }
  }

  const storagePath = supabasePathFromPublicUrl(url);
  if (storagePath && getStorageClient()) {
    try {
      return await downloadSupabaseObject(storagePath);
    } catch {
      /* fall through to HTTP fetch */
    }
  }

  const fetchUrl = resolveFetchUrl(url, options);
  return fetchRemoteBuffer(fetchUrl);
}

async function extractPdfText(buffer) {
  const pdfParse = require('pdf-parse');
  const result = await pdfParse(buffer);
  return (result.text || '').replace(/\s+/g, ' ').trim();
}

async function extractDocxText(buffer) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return (result.value || '').replace(/\s+/g, ' ').trim();
}

async function extractDocText(buffer) {
  const WordExtractor = require('word-extractor');
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  const body = await doc.getBody();
  return (body || '').replace(/\s+/g, ' ').trim();
}

async function extractTextFromBuffer(buffer, ext) {
  if (!buffer?.length) return '';

  if (ext === '.pdf') return extractPdfText(buffer);
  if (ext === '.docx') return extractDocxText(buffer);
  if (ext === '.doc') return extractDocText(buffer);
  if (['.txt', '.md', '.csv'].includes(ext)) {
    return buffer.toString('utf8').replace(/\s+/g, ' ').trim();
  }

  // Images — no OCR in serverless; caller records unsupported type
  if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    throw new Error('Image files cannot be text-parsed automatically');
  }

  throw new Error(`Unsupported file type: ${ext || 'unknown'}`);
}

function listApplicationDocuments(application) {
  const docs = [];
  const resume = application.resumeUrl || application.resume_url;
  const transcript = application.transcriptUrl || application.transcript_url;
  const certs = application.certificatesUrl || application.certificates_url || [];

  if (resume) docs.push({ label: 'Resume', url: resume });
  if (transcript) docs.push({ label: 'Transcript', url: transcript });
  certs.forEach((url, i) => {
    if (url) docs.push({ label: `Certificate ${i + 1}`, url });
  });
  return docs;
}

async function extractSingleDocument(doc, options) {
  const ext = extensionFromUrl(doc.url);
  try {
    const buffer = await loadDocumentBuffer(doc.url, options);
    if (!buffer?.length) {
      return { ...doc, ok: false, chars: 0, text: '', error: 'Empty file' };
    }
    const text = await extractTextFromBuffer(buffer, ext);
    if (!text || text.length < 15) {
      return { ...doc, ok: false, chars: 0, text: '', error: 'No readable text found in document' };
    }
    return { ...doc, ok: true, chars: text.length, text, error: null };
  } catch (err) {
    return { ...doc, ok: false, chars: 0, text: '', error: err.message || 'Failed to read document' };
  }
}

async function extractApplicationDocuments(application, options = {}) {
  const documents = listApplicationDocuments(application);
  if (!documents.length) {
    return { combinedText: '', sources: [], parsedCount: 0, failedCount: 0 };
  }

  const sources = await Promise.all(documents.map((d) => extractSingleDocument(d, options)));
  const parsed = sources.filter((s) => s.ok && s.text);
  const combinedText = parsed
    .map((s) => `--- ${s.label} ---\n${s.text}`)
    .join('\n\n');

  return {
    combinedText,
    sources: sources.map(({ label, url, ok, chars, error }) => ({ label, url, ok, chars, error })),
    parsedCount: parsed.length,
    failedCount: sources.length - parsed.length,
    sections: parsed.map((s) => ({ label: s.label, text: s.text })),
  };
}

module.exports = {
  extractApplicationDocuments,
  listApplicationDocuments,
  loadDocumentBuffer,
  extractTextFromBuffer,
};
