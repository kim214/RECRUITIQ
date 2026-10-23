require('dotenv').config();
const { processDocument, sniffType, assembleLlmText } = require('../lib/documentPipeline');

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
  objs.forEach((body) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${offsets.length - 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
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

const CASES = [
  {
    name: 'normal-resume-pdf',
    filename: 'resume.pdf',
    label: 'Resume',
    buffer: makePdf(['Jane Doe', 'Python developer', 'Skills: Python SQL Git', '2 years API experience']),
  },
  {
    name: 'scanned-document',
    filename: 'scan.png',
    label: 'Certificate 1',
    buffer: PNG_1X1,
  },
  {
    name: 'certificate',
    filename: 'cert.pdf',
    label: 'Certificate 1',
    buffer: makePdf(['Certificate of Completion', 'Jane Doe', 'AWS Certified Solutions Architect', 'Issuer: Amazon']),
  },
  {
    name: 'transcript',
    filename: 'transcript.pdf',
    label: 'Transcript',
    buffer: makePdf(['Official Transcript', 'Jane Doe', 'BSc Computer Science', 'GPA 3.80']),
  },
  {
    name: 'invalid-document',
    filename: 'resume.pdf',
    label: 'Resume',
    buffer: Buffer.from('not-a-pdf'),
  },
  {
    name: 'empty-document',
    filename: 'resume.pdf',
    label: 'Resume',
    buffer: Buffer.alloc(0),
  },
];

async function main() {
  for (const testCase of CASES) {
    const t0 = Date.now();
    const result = await processDocument({
      buffer: testCase.buffer,
      filename: testCase.filename,
      label: testCase.label,
    });
    console.log('\n===', testCase.name, `${Date.now() - t0}ms`);
    console.log(JSON.stringify({
      ok: result.ok,
      code: result.code || null,
      method: result.method || null,
      type: result.detected?.type || sniffType(testCase.buffer, testCase.filename).type,
      scanned: !!result.scanned,
      chars: result.chars,
      preview: (result.text || result.error || '').slice(0, 180),
      chunks: result.chunks?.length || 0,
    }, null, 2));
  }

  const llm = assembleLlmText([
    { label: 'Resume', llmText: 'Python developer with SQL' },
    { label: 'Transcript', llmText: 'BSc Computer Science' },
  ]);
  console.log('\n=== llm-assembly');
  console.log(llm);
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
