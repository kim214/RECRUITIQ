require('dotenv').config();
const { extractCandidateProfile, normalizeProfile } = require('../lib/candidateProfileExtractor');

const CASES = [
  {
    name: 'rich-resume',
    application: { applicantName: 'Jane Doe' },
    text: `Jane Doe
Nairobi, Kenya
Skills: Python, SQL, Git, Docker
Experience:
Python Developer, Acme Ltd, 2022-2024. Built REST APIs with FastAPI.
Junior Analyst, DataCo, 2020-2022.
Education: BSc Computer Science, University of Nairobi, 2016-2020
Projects: Hiring dashboard using React
Languages: English, Swahili
Certifications: AWS Cloud Practitioner`,
  },
  {
    name: 'missing-information',
    application: { applicantName: 'Sam Applicant' },
    text: `I am applying for this role. I work hard and learn quickly. Please consider my application.`,
  },
];

async function main() {
  for (const testCase of CASES) {
    const t0 = Date.now();
    const profile = await extractCandidateProfile(testCase.application, testCase.text);
    const normalized = normalizeProfile(profile, testCase.application);
    console.log('\n===', testCase.name, `${Date.now() - t0}ms`, 'model=', profile.model);
    console.log(JSON.stringify({
      candidate: profile.candidate,
      skills: profile.skills,
      education: profile.education,
      experience: profile.experience,
      projects: profile.projects,
      certifications: profile.certifications,
      languages: profile.languages,
      qualifications: profile.qualifications,
      evidence_count: (profile.evidence || []).length,
      name_status: normalized.candidate.name_status,
    }, null, 2));
  }
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
