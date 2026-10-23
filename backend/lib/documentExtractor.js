/**
 * Fetches applicant uploads, then runs the document pipeline (validate → extract → normalize → chunk).
 */
const fs = require('fs');
const path = require('path');
const { getStorageClient, BUCKET_NAME } = require('./storage');
const { processDocument, assembleLlmText, MAX_FILE_BYTES } = require('./documentPipeline');
const { resolveLocalUploadPath, supabaseObjectPath } = require('./documentUrlPolicy');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function extensionFromUrl(url) {
  try {
    const clean = url.split('?')[0].split('#')[0];
    return path.extname(clean).toLowerCase();
  } catch {
    return '';
  }
}

function filenameFromUrl(url) {
  try {
    const clean = decodeURIComponent(String(url).split('?')[0].split('#')[0]);
    return path.basename(clean) || `document${extensionFromUrl(url)}`;
  } catch {
    return 'document';
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

async function loadDocumentBuffer(url) {
  if (!url) return null;

  const filePath = resolveLocalUploadPath(url, UPLOAD_DIR);
  if (filePath && fs.existsSync(filePath)) {
    const buf = fs.readFileSync(filePath);
    if (buf.length > MAX_FILE_BYTES) throw new Error('File too large to parse');
    return buf;
  }

  const storagePath = supabaseObjectPath(url);
  if (storagePath && getStorageClient()) {
    return downloadSupabaseObject(storagePath);
  }

  throw new Error('Unsupported document URL');
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
  const filename = filenameFromUrl(doc.url);
  try {
    const buffer = await loadDocumentBuffer(doc.url, options);
    if (!buffer?.length) {
      return {
        ...doc,
        ok: false,
        chars: 0,
        text: '',
        llmText: '',
        chunks: [],
        code: 'empty_document',
        error: 'Empty file',
      };
    }
    const processed = await processDocument({
      buffer,
      filename,
      label: doc.label,
    });
    return { ...doc, ...processed };
  } catch (err) {
    const timeout = /timed out|timeout|abort/i.test(err.message || '') || err.name === 'AbortError';
    return {
      ...doc,
      ok: false,
      chars: 0,
      text: '',
      llmText: '',
      chunks: [],
      code: timeout ? 'timeout' : 'unreadable',
      error: timeout ? 'Document download timed out' : (err.message || 'Failed to read document'),
    };
  }
}

async function extractApplicationDocuments(application, options = {}) {
  const documents = listApplicationDocuments(application);
  if (!documents.length) {
    return {
      combinedText: '',
      llmText: '',
      sources: [],
      parsedCount: 0,
      failedCount: 0,
      sections: [],
      chunks: [],
    };
  }

  const sources = await Promise.all(documents.map((d) => extractSingleDocument(d, options)));
  const parsed = sources.filter((s) => s.ok && s.text);
  const sections = parsed.map((s) => ({
    label: s.label,
    text: s.text,
    llmText: s.llmText || s.text,
    chunks: s.chunks || [],
    method: s.method,
    scanned: !!s.scanned,
    truncated: !!s.truncated,
  }));
  const combinedText = sections
    .map((s) => `--- ${s.label} ---\n${s.text}`)
    .join('\n\n');
  const llmText = assembleLlmText(sections);
  const chunks = sections.flatMap((s) => (s.chunks || []).map((text) => ({ label: s.label, text })));

  return {
    combinedText,
    llmText,
    sources: sources.map((s) => ({
      label: s.label,
      url: s.url,
      ok: s.ok,
      chars: s.chars,
      error: s.error,
      code: s.code || null,
      method: s.method || null,
      scanned: !!s.scanned,
      truncated: !!s.truncated,
      type: s.detected?.type || null,
    })),
    parsedCount: parsed.length,
    failedCount: sources.length - parsed.length,
    sections,
    chunks,
  };
}

module.exports = {
  extractApplicationDocuments,
  listApplicationDocuments,
  loadDocumentBuffer,
  extractSingleDocument,
};
