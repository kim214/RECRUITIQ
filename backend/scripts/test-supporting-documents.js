require('dotenv').config();
const { extractSupportingDocuments, collectBundles, CERT_DETECTED, TRANSCRIPT_DETECTED } = require('../lib/supportingDocumentAnalyzer');

const job = {
  title: 'Python Developer',
  requiredSkills: ['Python', 'AWS'],
  requiredEducation: 'Bachelor of Computer Science',
  requiredCertifications: ['AWS Cloud Practitioner'],
};

const CASES = [
  {
    name: 'certificate',
    sections: [{
      label: 'Certificate 1',
      text: `Certificate of Completion
Candidate: Jane Doe
Issuer: Amazon Web Services
Credential: AWS Certified Cloud Practitioner
Certificate number: AWS-CLF-998877
Issue date: 15 January 2024
Expiry date: 15 January 2027
Domain: Cloud computing`,
    }],
    sources: [{ label: 'Certificate 1', ok: true }],
  },
  {
    name: 'transcript',
    sections: [{
      label: 'Transcript',
      text: `Official Academic Transcript
University of Nairobi
Jane Doe
Qualification: BSc Computer Science
Classification: Second Class Honours
GPA: 3.80
Subjects:
Data Structures  A
Database Systems  B+
Operating Systems  A-`,
    }],
    sources: [{ label: 'Transcript', ok: true }],
  },
  {
    name: 'missing-grades',
    sections: [{
      label: 'Transcript',
      text: 'This is a cover note about my studies. I enjoyed campus life.',
    }],
    sources: [{ label: 'Transcript', ok: true }],
  },
];

async function main() {
  for (const testCase of CASES) {
    const bundles = collectBundles(testCase.sections, testCase.sources);
    const t0 = Date.now();
    const result = await extractSupportingDocuments({ id: testCase.name }, job, bundles);
    console.log('\n===', testCase.name, `${Date.now() - t0}ms`, 'model=', result.model);
    console.log(JSON.stringify({
      certificates: result.certificates,
      transcript: result.transcript,
      cert_status: result.certificates[0]?.verification_status,
      transcript_status: result.transcript?.verification_status,
      verified_any: !!(result.certificates.some((c) => c.verified) || result.transcript?.verified),
    }, null, 2));
    if (result.certificates.some((c) => c.verified) || result.transcript?.verified) {
      throw new Error('Must not mark documents verified');
    }
    if (testCase.name === 'certificate' && result.certificates[0]?.verification_status !== CERT_DETECTED) {
      throw new Error('Expected Certificate information detected');
    }
    if (testCase.name === 'transcript' && result.transcript?.verification_status !== TRANSCRIPT_DETECTED) {
      throw new Error('Expected Transcript information detected');
    }
  }
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
