/**
 * Deterministic candidate scoring.
 * Ollama supplies matches, evidence, and narrative. This module owns the numbers.
 */

const crypto = require('crypto');

const SCORING_VERSION = 'm9-v1';
const DIMENSIONS = ['skills', 'experience', 'education', 'certifications', 'projects', 'job_specific'];
const DEFAULT_WEIGHTS = {
  skills: 35,
  experience: 25,
  education: 15,
  certifications: 10,
  projects: 10,
  job_specific: 5,
};
const REQUIRED_SHARE = 0.9;
const PREFERRED_SHARE = 0.1;

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(n) || 0)));
}

function recommendationFromScore(score) {
  if (score >= 82) return 'strong_yes';
  if (score >= 68) return 'yes';
  if (score >= 48) return 'maybe';
  return 'no';
}

function matchLabel(score) {
  if (score >= 82) return 'Strong Match';
  if (score >= 68) return 'Good Match';
  if (score >= 48) return 'Potential Match';
  return 'Poor Match';
}

function jobProfile(job) {
  return job?.requirementProfile || job?.requirement_profile || {};
}

function candidateProfile(application) {
  return application?.candidateProfile || application?.candidate_profile || {};
}

function matchRecord(application) {
  return application?.requirementMatches || application?.requirement_matches || { items: [] };
}

function statusPoints(status) {
  if (status === 'MATCH') return 1;
  if (status === 'PARTIAL_MATCH') return 0.5;
  if (status === 'UNCLEAR') return 0.25;
  return 0;
}

function averagePoints(items) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + statusPoints(item.status), 0) / items.length;
}

function categoryRatio(items) {
  if (!items?.length) return null;
  const required = items.filter((item) => item.priority === 'REQUIRED');
  const preferred = items.filter((item) => item.priority === 'PREFERRED');
  if (required.length && preferred.length) {
    return averagePoints(required) * REQUIRED_SHARE + averagePoints(preferred) * PREFERRED_SHARE;
  }
  if (required.length) return averagePoints(required);
  if (preferred.length) return averagePoints(preferred);
  return null;
}

function resolveWeights(job) {
  const raw = job?.scoringWeights || job?.scoring_weights || {};
  const merged = { ...DEFAULT_WEIGHTS };
  for (const key of DIMENSIONS) {
    if (raw[key] != null && Number.isFinite(Number(raw[key]))) {
      merged[key] = Math.max(0, Number(raw[key]));
    }
  }
  const total = DIMENSIONS.reduce((sum, key) => sum + merged[key], 0);
  if (!total) return { ...DEFAULT_WEIGHTS };
  if (total === 100) return merged;
  const scaled = {};
  let used = 0;
  DIMENSIONS.forEach((key, index) => {
    if (index === DIMENSIONS.length - 1) {
      scaled[key] = 100 - used;
      return;
    }
    scaled[key] = Math.round((merged[key] / total) * 100);
    used += scaled[key];
  });
  return scaled;
}

function itemsByCategory(items, category) {
  return (items || []).filter((item) => item.category === category);
}

function projectsRatio(application, job) {
  const projects = (candidateProfile(application).projects || []).filter((row) => (
    row && (row.name || row.description || (row.technologies || []).length)
  ));
  const blob = JSON.stringify(jobProfile(job)).toLowerCase();
  const mentioned = /\bprojects?\b/.test(blob);
  if (!projects.length) return mentioned ? 0 : null;

  const skills = [
    ...(jobProfile(job).required_skills || job.requiredSkills || job.required_skills || []),
    ...(jobProfile(job).preferred_skills || []),
  ].map((s) => String(s || '').toLowerCase()).filter((s) => s.length > 1);

  let overlap = 0;
  for (const project of projects) {
    const techs = (project.technologies || []).map((t) => String(t || '').toLowerCase());
    const text = `${project.name || ''} ${project.description || ''} ${techs.join(' ')}`.toLowerCase();
    const hit = skills.some((skill) => (
      text.includes(skill) || techs.some((tech) => tech.includes(skill) || skill.includes(tech))
    ));
    if (hit) overlap += 1;
  }
  return Math.min(1, 0.4 + 0.6 * (overlap / projects.length));
}

function jobSpecificRatio(job, application) {
  const others = jobProfile(job).other_requirements || [];
  if (!others.length) return null;
  const profile = candidateProfile(application);
  const hay = [
    ...(profile.skills || []),
    ...(profile.languages || []),
    ...(profile.qualifications || []),
    ...(profile.certifications || []),
    application.coverLetter || application.cover_letter || '',
  ].join(' ').toLowerCase();

  const synthetic = others.map((req) => {
    const text = String(req || '').toLowerCase();
    let status = 'NOT_FOUND';
    if (text && hay.includes(text)) status = 'MATCH';
    else {
      const words = text.split(/\W+/).filter((w) => w.length > 3);
      if (words.some((word) => hay.includes(word))) status = 'PARTIAL_MATCH';
    }
    return { status, priority: 'REQUIRED' };
  });
  return categoryRatio(synthetic);
}

function dimension(label, key, ratio, weights) {
  const applicable = ratio != null;
  const max = applicable ? weights[key] : 0;
  const pct = applicable ? clamp(ratio * 100) : null;
  const points = applicable ? clamp(ratio * max, 0, max) : 0;
  return { key, label, applicable, pct, points, max };
}

function listsFrom(items) {
  return {
    matched: items.filter((item) => item.status === 'MATCH').map((item) => item.requirement),
    partial: items.filter((item) => item.status === 'PARTIAL_MATCH').map((item) => item.requirement),
    missing: items.filter((item) => item.status === 'NOT_FOUND' || item.status === 'UNCLEAR').map((item) => item.requirement),
  };
}

function scoreFingerprint(job, application) {
  const payload = {
    version: SCORING_VERSION,
    weights: resolveWeights(job),
    matches: matchRecord(application).source_hash || '',
    projects: (candidateProfile(application).projects || []).map((p) => p.name || p.description || ''),
    other: jobProfile(job).other_requirements || [],
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

function computeScore(job, application) {
  const weights = resolveWeights(job);
  const matches = matchRecord(application);
  const items = matches.items || [];
  const skillsItems = itemsByCategory(items, 'skill');
  const experienceItems = itemsByCategory(items, 'experience');
  const educationItems = itemsByCategory(items, 'education');
  const certItems = itemsByCategory(items, 'certification');

  const dims = {
    skills: dimension('Skills', 'skills', categoryRatio(skillsItems), weights),
    experience: dimension('Experience', 'experience', categoryRatio(experienceItems), weights),
    education: dimension('Education', 'education', categoryRatio(educationItems), weights),
    certifications: dimension('Certifications', 'certifications', categoryRatio(certItems), weights),
    projects: dimension('Projects', 'projects', projectsRatio(application, job), weights),
    job_specific: dimension('Job-specific', 'job_specific', jobSpecificRatio(job, application), weights),
  };

  let earned = 0;
  let possible = 0;
  for (const key of DIMENSIONS) {
    if (!dims[key].applicable) continue;
    earned += dims[key].points;
    possible += dims[key].max;
  }
  const overall_score = possible ? clamp((earned / possible) * 100) : 0;

  const skillLists = listsFrom(skillsItems);
  const certLists = listsFrom(certItems);
  const edu = dims.education;
  const exp = dims.experience;

  return {
    scoring_version: SCORING_VERSION,
    weights,
    dimensions: dims,
    skills_score: dims.skills.points,
    experience_score: dims.experience.points,
    education_score: dims.education.points,
    certification_score: dims.certifications.points,
    project_score: dims.projects.points,
    job_specific_score: dims.job_specific.points,
    overall_score,
    recommendation: recommendationFromScore(overall_score),
    match_label: matchLabel(overall_score),
    skills_match: {
      score: dims.skills.pct ?? 0,
      ...skillLists,
    },
    experience_match: {
      score: dims.experience.pct ?? 0,
      details: exp.applicable
        ? `Experience ${exp.points}/${exp.max}`
        : 'No explicit experience requirements to score.',
    },
    education_match: {
      score: dims.education.pct ?? 0,
      meets_requirement: (educationItems.some((item) => item.priority === 'REQUIRED' && item.status === 'MATCH'))
        || (educationItems.length > 0 && educationItems.every((item) => item.status === 'MATCH')),
      details: edu.applicable
        ? `Education ${edu.points}/${edu.max}`
        : 'No explicit education requirements to score.',
    },
    certifications_match: dims.certifications.applicable
      ? { score: dims.certifications.pct, ...certLists }
      : { score: null, matched: [], missing: [] },
    source_hash: scoreFingerprint(job, application),
  };
}

function hasFreshScore(application, job) {
  const stored = application?.scoreBreakdown || application?.score_breakdown;
  if (!stored?.source_hash || stored.overall_score == null) return false;
  return stored.source_hash === scoreFingerprint(job, application);
}

function applyScoreToAnalysis(analysis, breakdown) {
  const rec = breakdown.recommendation || recommendationFromScore(breakdown.overall_score);
  return {
    ...(analysis || {}),
    overall_score: breakdown.overall_score,
    skills_match: {
      ...(analysis?.skills_match || {}),
      ...breakdown.skills_match,
    },
    experience_match: {
      ...(analysis?.experience_match || {}),
      ...breakdown.experience_match,
    },
    education_match: {
      ...(analysis?.education_match || {}),
      ...breakdown.education_match,
    },
    certifications_match: breakdown.certifications_match,
    recommendation: rec,
    match_label: breakdown.match_label || matchLabel(breakdown.overall_score),
    score_breakdown: breakdown,
    scoring_version: breakdown.scoring_version,
  };
}

async function ensureScoreBreakdown(db, application, { job, force = false } = {}) {
  if (!application || !job) return application;
  if (!force && hasFreshScore(application, job)) {
    return {
      ...application,
      scoreBreakdown: application.scoreBreakdown || application.score_breakdown,
    };
  }
  const record = computeScore(job, application);
  try {
    if (db?.updateApplication) {
      return db.updateApplication(application.id, { scoreBreakdown: record });
    }
  } catch (err) {
    console.error(`Score breakdown save failed (${application.id}):`, err.message);
  }
  return { ...application, scoreBreakdown: record, score_breakdown: record };
}

module.exports = {
  SCORING_VERSION,
  DEFAULT_WEIGHTS,
  DIMENSIONS,
  resolveWeights,
  categoryRatio,
  computeScore,
  scoreFingerprint,
  hasFreshScore,
  applyScoreToAnalysis,
  ensureScoreBreakdown,
  recommendationFromScore,
  matchLabel,
};
