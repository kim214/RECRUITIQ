const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sniffType,
  validateDocumentBuffer,
  normalizeText,
  chunkText,
  budgetText,
  assembleLlmText,
  processDocument,
} = require('./documentPipeline');

function makePdf(lines) {
  const escaped = (lines || []).map((line) => String(line)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)'));
  let content = 'BT /F1 12 Tf 72 720 Td\n';
  escaped.forEach((line, i) => {
    content += i === 0 ? `(${line}) Tj\n` : `0 -16 Td (${line}) Tj\n`;
  });
  content += 'ET';

  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let out = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n`;
  out += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('normalize and chunk long text', () => {
  const text = normalizeText('Hello   world\n\n\nPython\r\n');
  assert.equal(text, 'Hello world\n\nPython');
  const chunks = chunkText('A'.repeat(4000), { size: 1000, overlap: 100 });
  assert.ok(chunks.length >= 4);
  assert.ok(budgetText('x'.repeat(5000), 1000).includes('[...truncated...]'));
});

test('MIME sniffing and mismatch', () => {
  const pdf = makePdf(['hello']);
  assert.equal(sniffType(pdf, 'resume.pdf').type, 'pdf');
  assert.equal(sniffType(PNG_1X1, 'scan.png').type, 'png');
  const mismatch = validateDocumentBuffer(PNG_1X1, { filename: 'resume.pdf', mimetype: 'application/pdf' });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'mime_mismatch');
});

test('normal resume PDF', async () => {
  const buffer = makePdf([
    'Jane Doe',
    'Junior Python Developer',
    'Skills: Python, SQL, Git',
    'Experience: 2 years building APIs',
    'Education: Bachelor of Computer Science',
  ]);
  const result = await processDocument({ buffer, filename: 'resume.pdf', label: 'Resume' });
  assert.equal(result.ok, true);
  assert.match(result.text, /Python/);
  assert.match(result.llmText, /Jane Doe/);
  assert.ok(result.chunks.length >= 1);
  assert.equal(result.method, 'pdf-parse');
});

test('scanned document', async () => {
  const result = await processDocument({ buffer: PNG_1X1, filename: 'scan.png', label: 'Certificate 1' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'scanned_no_text');
  assert.equal(result.scanned, true);
});

test('certificate PDF', async () => {
  const buffer = makePdf([
    'Certificate of Completion',
    'Candidate: Jane Doe',
    'Issuer: Amazon Web Services',
    'Credential: AWS Certified Solutions Architect',
    'Issue date: 2024-01-15',
  ]);
  const result = await processDocument({ buffer, filename: 'aws.pdf', label: 'Certificate 1' });
  assert.equal(result.ok, true);
  assert.match(result.text, /AWS Certified Solutions Architect/);
  assert.match(result.text, /Amazon Web Services/);
});

test('transcript PDF', async () => {
  const buffer = makePdf([
    'Official Academic Transcript',
    'Student: Jane Doe',
    'Program: BSc Computer Science',
    'GPA: 3.80',
    'Course: Data Structures  A',
  ]);
  const result = await processDocument({ buffer, filename: 'transcript.pdf', label: 'Transcript' });
  assert.equal(result.ok, true);
  assert.match(result.text, /BSc Computer Science/);
  assert.match(result.text, /3.80/);
});

test('invalid document', async () => {
  const result = await processDocument({
    buffer: Buffer.from('this is not a pdf'),
    filename: 'resume.pdf',
    mimetype: 'application/pdf',
  });
  assert.equal(result.ok, false);
  assert.ok(['mime_mismatch', 'unsupported_type', 'corrupt_document'].includes(result.code));
});

test('corrupt PDF does not throw and does not fail sibling documents', async () => {
  const corrupt = await processDocument({
    buffer: Buffer.from('%PDF-1.4\ntruncated-and-broken'),
    filename: 'resume.pdf',
    label: 'Resume',
  });
  assert.equal(corrupt.ok, false);
  assert.ok(['corrupt_document', 'empty_document', 'unreadable', 'scanned_no_text'].includes(corrupt.code));

  const ok = await processDocument({
    buffer: Buffer.from('Jane Doe\nSkills: Python'),
    filename: 'cover.txt',
    label: 'Cover Letter',
  });
  assert.equal(ok.ok, true);
});

test('empty document', async () => {
  const empty = await processDocument({ buffer: Buffer.alloc(0), filename: 'resume.pdf' });
  assert.equal(empty.ok, false);
  assert.equal(empty.code, 'empty_document');

  const blankPdf = await processDocument({ buffer: makePdf([]), filename: 'blank.pdf', label: 'Resume' });
  assert.equal(blankPdf.ok, false);
  assert.ok(['empty_document', 'scanned_no_text'].includes(blankPdf.code));
});

test('txt resume is extracted', async () => {
  const result = await processDocument({
    buffer: Buffer.from('Jane Doe\nSkills: Python and SQL\nExperience: 3 years'),
    filename: 'resume.txt',
    label: 'Resume',
  });
  assert.equal(result.ok, true);
  assert.equal(result.method, 'utf8');
  assert.match(result.text, /Python/);
});

test('assembleLlmText stays within budget', () => {
  const llmText = assembleLlmText([
    { label: 'Resume', llmText: 'R'.repeat(9000) },
    { label: 'Transcript', llmText: 'T'.repeat(5000) },
  ], 4000);
  assert.ok(llmText.length <= 4200);
  assert.match(llmText, /Resume/);
});
