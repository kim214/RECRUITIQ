const express = require('express');
const { getDb } = require('../lib/db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function callAiService(path, body) {
  try {
    const res = await fetch(`${AI_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || `AI service error (${res.status})`);
    }
    return res.json();
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
      return null;
    }
    throw err;
  }
}

function localAnalyze(job, application, applicantProfile) {
  const reqSkills = (job.requiredSkills || job.required_skills || []).map((s) => s.toLowerCase());
  const candSkills = (applicantProfile?.skills || ['JavaScript', 'React', 'Node.js']).map((s) => s.toLowerCase());
  const matched = reqSkills.filter((s) => candSkills.some((c) => c.includes(s) || s.includes(c)));
  const missing = reqSkills.filter((s) => !matched.includes(s));
  const skillScore = reqSkills.length ? Math.round((matched.length / reqSkills.length) * 100) : 70;
  const expYears = applicantProfile?.total_experience_years || 2;
  const reqExp = job.minExperience || job.experience_years || 0;
  const expScore = expYears >= reqExp ? Math.min(100, 70 + (expYears - reqExp) * 10) : Math.max(30, 50 + expYears * 10);
  const eduScore = job.requiredEducation ? 85 : 90;
  const overall = Math.round((skillScore * 0.5) + (expScore * 0.3) + (eduScore * 0.2));
  const recommendation = overall >= 85 ? 'strong_yes' : overall >= 70 ? 'yes' : overall >= 50 ? 'maybe' : 'no';

  return {
    overall_score: overall,
    skills_match: { score: skillScore, matched, missing, partial: [] },
    education_match: { score: eduScore, meets_requirement: true, details: job.requiredEducation || 'No specific requirement' },
    experience_match: { score: expScore, candidate_years: expYears, required_years: reqExp, details: `${expYears} years vs ${reqExp} required` },
    ai_summary: `${applicantProfile?.full_name || 'Candidate'} scores ${overall}% for ${job.title}. Skills match: ${matched.join(', ') || 'partial'}. ${missing.length ? `Missing: ${missing.join(', ')}.` : ''}`,
    strengths: matched.length ? [`Strong in ${matched.slice(0, 3).join(', ')}`] : ['Relevant background'],
    weaknesses: missing.length ? [`Gap in ${missing.slice(0, 2).join(', ')}`] : [],
    recommendation,
    model_version: 'local-fallback',
  };
}

router.post('/analyze/:applicationId', requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const app = await db.getApplication(req.params.applicationId);
    if (!app) return res.status(404).json({ message: 'Application not found' });
    const job = await db.getJob(app.jobId);

    let result = await callAiService(`/analyze/${req.params.applicationId}`, {
      job,
      application: app,
      profile_text: app.coverLetter || app.cover_letter || '',
    });
    if (!result) {
      result = { analysis: localAnalyze(job, app, { full_name: app.applicantName, skills: job.requiredSkills?.slice(0, 3) }) };
    }
    const analysis = result.analysis || result;
    const saved = await db.saveAnalysis({
      application_id: app.id,
      job_id: app.jobId,
      ...analysis,
      ai_summary: analysis.ai_summary || analysis.summary,
    });
    res.json({ analysis: saved, application: await db.getApplication(app.id) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/rank/:jobId', requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const job = await db.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    const apps = await db.listApplications({ jobId: req.params.jobId });
    let rankings = await callAiService(`/rank/${req.params.jobId}`, { job, applications: apps });
    if (!rankings) {
      const results = [];
      for (const app of apps) {
        const analysis = localAnalyze(job, app, { full_name: app.applicantName });
        await db.saveAnalysis({ application_id: app.id, job_id: job.id, ...analysis });
        results.push({ ...app, aiScore: analysis.overall_score, analysis });
      }
      results.sort((a, b) => b.aiScore - a.aiScore);
      rankings = { rankings: results };
    } else {
      for (const item of rankings.rankings || []) {
        if (item.analysis) {
          await db.saveAnalysis({
            application_id: item.application_id || item.id,
            job_id: req.params.jobId,
            ...item.analysis,
          });
        }
      }
    }

    const rankedApps = await db.listApplications({ jobId: req.params.jobId });
    const ranked = rankedApps
      .filter((a) => a.aiScore != null)
      .sort((a, b) => b.aiScore - a.aiScore);

    res.json({ rankings: ranked, job });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/rankings/:jobId', requireRole('employer', 'admin'), async (req, res) => {
  try {
    const db = getDb();
    const apps = await db.listApplications({ jobId: req.params.jobId });
    const ranked = apps
      .filter((a) => a.aiScore != null)
      .sort((a, b) => b.aiScore - a.aiScore);
    res.json({ rankings: ranked });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
