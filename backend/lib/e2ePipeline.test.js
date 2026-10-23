/**
 * Milestone 18 — end-to-end pipeline for one job and five candidate scenarios.
 * Uses the real matching/scoring/ranking/evidence modules. Does not call Ollama,
 * Tesseract, or the embedding model (those stay optional / VM-deferred).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { processDocument, assembleLlmText } = require('./documentPipeline');
const { mergeEmployerHints, jobFingerprint } = require('./jobRequirementAnalyzer');
const { buildEvidence, findEvidenceFor } = require('./evidenceBuilder');
const { buildRequirementMatches } = require('./requirementMatcher');
const { computeScore, applyScoreToAnalysis, recommendationFromScore } = require('./scoringEngine');
const { rankApplications } = require('./ranker');
const { compareEmbeddings } = require('./embeddingService');
const { STEPS, buildStatus, isActive, isTerminal } = require('./analysisStatus');
const { partialDocumentNotes, applyPartialDocumentNotes, fallbackNarrative } = require('./analysisFailures');
const { cacheKeys, hasFreshAnalysis, staleReason } = require('./analysisCache');
const { canAccessApplication } = require('./access');

const jobDraft = {
  title: 'Python Developer',
  description: 'Build FastAPI services with PostgreSQL. Docker and AWS are a plus. Bachelor\'s in Computer Science. 2+ years.',
  requiredSkills: ['Python', 'FastAPI', 'PostgreSQL'],
  requiredEducation: "Bachelor's in Computer Science",
  requiredCertifications: ['AWS Certified Cloud Practitioner'],
  minExperience: 2,
};

const job = {
  ...jobDraft,
  requirementProfile: {
    ...mergeEmployerHints({
      preferred_skills: ['Docker', 'AWS'],
      responsibilities: ['Build backend APIs'],
    }, jobDraft),
    source_hash: jobFingerprint(jobDraft),
  },
};

const SCENARIOS = {
  A: {
    applicantName: 'Jane Doe',
    resume: `Jane Doe
Skills: Python, FastAPI, PostgreSQL, Docker, AWS
Experience: Senior Python Developer, Acme, 2019-2025. 6 years building FastAPI APIs on PostgreSQL.
Education: Bachelor's in Computer Science, University of Nairobi, 2015-2019
Certifications: AWS Certified Cloud Practitioner
Projects: Hiring API platform using FastAPI and PostgreSQL
Languages: English`,
  },
  B: {
    applicantName: 'John Missing',
    resume: `John Missing
Skills: Excel, Marketing, Salesforce
Experience: Marketing Associate, 2023-2024. One year of campaign work.
Education: High school diploma
Languages: English`,
  },
  C: {
    applicantName: 'Peter Smith',
    resume: `Peter Smith
Skills: Python, FastAPI, PostgreSQL, Docker
Experience: Lead backend engineer, 2016-2025. 2+ years of experience shipping FastAPI and PostgreSQL services.
Education: Diploma in Information Technology
Projects: Payments API
Languages: English`,
  },
  D: {
    applicantName: 'Mary Wanjiku',
    resume: `Mary Wanjiku
Skills: Python
Role: Campus intern for six months in 2025. Coursework only. No FastAPI. No PostgreSQL production work.
Education: Bachelor's in Computer Science, University of Nairobi. MSc Computer Science.
Languages: English`,
  },
  E: {
    applicantName: 'Poor Match',
    resume: `I am a highly motivated candidate. Please hire me. I work hard and learn quickly.`,
  },
};

async function processResume(text, label = 'Resume') {
  return processDocument({
    buffer: Buffer.from(text, 'utf8'),
    filename: `${label.toLowerCase().replace(/\s+/g, '-')}.txt`,
    label,
  });
}

async function analyzeCandidate(key) {
  const spec = SCENARIOS[key];
  const resume = await processResume(spec.resume);
  assert.equal(resume.ok, true, `${key} resume should parse`);

  const sections = [{
    label: 'Resume',
    text: resume.text,
    llmText: resume.llmText,
    chunks: resume.chunks,
  }];
  const llmText = assembleLlmText(sections);
  assert.ok(llmText.length > 10);

  const candidateProfile = profileFromScenario(key, spec);
  const application = {
    id: `app-${key}`,
    applicantName: spec.applicantName,
    resumeUrl: `/uploads/${key}/resume.txt`,
    coverLetter: spec.coverLetter || '',
    candidateProfile,
  };
  const evidence = buildEvidence(application, { job, sections });
  const withEvidence = { ...application, evidence };
  const matches = buildRequirementMatches(job, withEvidence, {
    sections,
    docMeta: { parsedCount: 1, parsedLabels: ['Resume'], failedLabels: [] },
  });
  const withMatches = { ...withEvidence, requirementMatches: matches };
  const breakdown = computeScore(job, withMatches);
  const llmTriedToCheat = {
    overall_score: 99,
    recommendation: 'strong_yes',
    summary: 'Perfect hire.',
    strengths: ['LLM invented a perfect score'],
    weaknesses: [],
  };
  const analysis = applyScoreToAnalysis(llmTriedToCheat, breakdown);
  const steps = [];
  for (const step of STEPS) steps.push(buildStatus(step));

  return {
    key,
    applicantName: spec.applicantName,
    sections,
    evidence,
    matches,
    breakdown,
    analysis,
    application: {
      ...withMatches,
      scoreBreakdown: breakdown,
      aiScore: analysis.overall_score,
      analysis: {
        overallScore: analysis.overall_score,
        matchLabel: analysis.match_label,
        recommendation: analysis.recommendation,
        summary: analysis.ai_summary,
        strengths: analysis.strengths,
        documentsReviewed: ['Resume'],
        audit: cacheKeys(job, { ...withMatches, resumeUrl: `/uploads/${key}/resume.txt` }),
      },
      analysisStatus: steps[steps.length - 1],
    },
    steps,
  };
}

function profileFromScenario(key) {
  if (key === 'A') {
    return {
      candidate: { name: 'Jane Doe', name_status: 'FOUND' },
      skills: ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'AWS'],
      education: [{ qualification: "Bachelor's in Computer Science", institution: 'University of Nairobi' }],
      experience: [{ job_title: 'Senior Python Developer', employer: 'Acme', start_date: '2019', end_date: '2025' }],
      certifications: ['AWS Certified Cloud Practitioner'],
      projects: [{ name: 'Hiring API platform', technologies: ['FastAPI', 'PostgreSQL'] }],
      languages: ['English'],
    };
  }
  if (key === 'B') {
    return {
      candidate: { name: 'John Missing', name_status: 'FOUND' },
      skills: ['Excel', 'Marketing', 'Salesforce'],
      education: [{ qualification: 'High school diploma' }],
      experience: [{ job_title: 'Marketing Associate', start_date: '2023', end_date: '2024' }],
      certifications: [],
      projects: [],
      languages: ['English'],
    };
  }
  if (key === 'C') {
    return {
      candidate: { name: 'Peter Smith', name_status: 'FOUND' },
      skills: ['Python', 'FastAPI', 'PostgreSQL', 'Docker'],
      education: [{ qualification: 'Diploma in Information Technology' }],
      experience: [{ job_title: 'Lead backend engineer', start_date: '2016', end_date: '2025' }],
      certifications: [],
      projects: [{ name: 'Payments API', technologies: ['FastAPI'] }],
      languages: ['English'],
    };
  }
  if (key === 'D') {
    return {
      candidate: { name: 'Mary Wanjiku', name_status: 'FOUND' },
      skills: ['Python'],
      education: [
        { qualification: "Bachelor's in Computer Science", institution: 'University of Nairobi' },
        { qualification: 'MSc Computer Science' },
      ],
      experience: [{ job_title: 'Campus intern', start_date: '2025', end_date: '2025' }],
      certifications: [],
      projects: [],
      languages: ['English'],
    };
  }
  return {
    candidate: { name: 'Poor Match', name_status: 'UNKNOWN' },
    skills: [],
    education: [],
    experience: [],
    certifications: [],
    projects: [],
    languages: [],
  };
}

test('e2e: employer job → five candidates → rank → recruiter view', async () => {
  assert.ok(job.requirementProfile.required_skills.includes('Python'));
  assert.ok(job.requirementProfile.preferred_skills.includes('Docker'));
  assert.ok(job.requirementProfile.education_requirements[0].includes('Bachelor'));

  const results = {};
  for (const key of ['A', 'B', 'C', 'D', 'E']) {
    results[key] = await analyzeCandidate(key);
  }

  const A = results.A.breakdown;
  const B = results.B.breakdown;
  const C = results.C.breakdown;
  const D = results.D.breakdown;
  const E = results.E.breakdown;

  assert.ok(A.overall_score > B.overall_score, `A (${A.overall_score}) should beat B (${B.overall_score})`);
  assert.ok(A.overall_score > E.overall_score, `A (${A.overall_score}) should beat E (${E.overall_score})`);
  assert.ok(C.skills_score > D.skills_score, `C skills ${C.skills_score} vs D ${D.skills_score}`);
  assert.ok(D.education_score > C.education_score, `D education ${D.education_score} vs C ${C.education_score}`);
  assert.ok(C.overall_score > D.overall_score, `C overall ${C.overall_score} vs D ${D.overall_score}`);
  assert.ok(B.overall_score > E.overall_score || B.overall_score === E.overall_score);

  for (const key of ['A', 'B', 'C', 'D', 'E']) {
    const row = results[key];
    assert.equal(row.analysis.overall_score, row.breakdown.overall_score);
    assert.notEqual(row.analysis.overall_score, 99);
    assert.equal(row.analysis.recommendation, recommendationFromScore(row.breakdown.overall_score));
  }

  const python = findEvidenceFor(results.A.application, 'Python');
  assert.ok(python.length > 0, 'recruiter can see why Jane has Python');
  assert.match(python[0].evidence || python[0].value || '', /Python/i);

  const ranked = rankApplications(Object.values(results).map((row) => row.application));
  assert.equal(ranked[0].applicantName, 'Jane Doe');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[ranked.length - 1].applicantName, 'Poor Match');
  const names = ranked.map((r) => r.applicantName);
  assert.ok(names.indexOf('Peter Smith') < names.indexOf('Mary Wanjiku'), 'strong experience ranks above weak experience');
  assert.ok(names.indexOf('John Missing') > names.indexOf('Jane Doe'));

  assert.equal(compareEmbeddings(null, null), null);

  const docMeta = {
    parsedCount: 2,
    parsedLabels: ['Resume', 'Certificate 1'],
    failedLabels: ['Transcript'],
  };
  const notes = partialDocumentNotes(docMeta);
  assert.deepEqual(notes, [
    'Transcript could not be analyzed.',
    'Analysis is based on available documents.',
  ]);
  const partial = applyPartialDocumentNotes(results.A.analysis, docMeta);
  assert.equal(partial.partial_documents, true);
  assert.ok(partial.weaknesses.includes('Transcript could not be analyzed.'));

  const degraded = fallbackNarrative(docMeta, { message: 'Ollama is unavailable.' });
  assert.equal(degraded.overall_score, null);
  const rescued = applyScoreToAnalysis(degraded, results.A.breakdown);
  assert.equal(rescued.overall_score, results.A.breakdown.overall_score);

  const queued = buildStatus('QUEUED');
  const done = results.A.application.analysisStatus;
  assert.equal(isActive(queued), true);
  assert.equal(isTerminal(done), true);
  assert.equal(done.state, 'completed');
  assert.deepEqual(STEPS, [
    'QUEUED',
    'PROCESSING_DOCUMENTS',
    'EXTRACTING_INFORMATION',
    'ANALYZING_REQUIREMENTS',
    'MATCHING_CANDIDATE',
    'CALCULATING_SCORE',
    'COMPLETED',
  ]);

  const stamped = results.A.application;
  assert.equal(hasFreshAnalysis(stamped, job), true);
  assert.equal(staleReason({ ...stamped, resumeUrl: '/uploads/A/resume-v2.txt' }, job), 'documents');

  const appA = { applicantId: 'cand-A', jobId: 'job-1' };
  assert.equal(canAccessApplication({ role: 'employer', userId: 'emp-1' }, appA, { ownsJob: true }), true);
  assert.equal(canAccessApplication({ role: 'employer', userId: 'emp-2' }, appA, { ownsJob: false }), false);
  assert.equal(canAccessApplication({ role: 'applicant', userId: 'cand-B' }, appA), false);
});
