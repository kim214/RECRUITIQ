/**
 * Hybrid AI analysis: evidence-based scores + LLM narrative & semantic skill review.
 */
const { analyzeWithLlm } = require('./llmAnalyzer');

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function recommendationFromScore(score) {
  if (score >= 82) return 'strong_yes';
  if (score >= 68) return 'yes';
  if (score >= 48) return 'maybe';
  return 'no';
}

function recalculateOverall(skills, experience, education, certs) {
  const components = [
    skills?.score != null ? { score: skills.score, weight: 0.45 } : null,
    experience?.score != null ? { score: experience.score, weight: 0.3 } : null,
    education?.score != null ? { score: education.score, weight: 0.15 } : null,
    certs?.score != null ? { score: certs.score, weight: 0.1 } : null,
  ].filter(Boolean);

  if (!components.length) return 30;
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  return clamp(components.reduce((s, c) => s + c.score * (c.weight / totalWeight), 0));
}

function applySkillAdjustments(evidenceAnalysis, adjustments, requiredSkills) {
  const required = (requiredSkills || []).map(String);
  const skills = {
    ...(evidenceAnalysis.skills_match || {}),
    matched: [...(evidenceAnalysis.skills_match?.matched || [])],
    partial: [...(evidenceAnalysis.skills_match?.partial || [])],
    missing: [...(evidenceAnalysis.skills_match?.missing || [])],
  };

  const adds = adjustments?.add_to_matched || adjustments?.matched_additions || [];
  adds.forEach((item) => {
    const skill = typeof item === 'string' ? item : item.skill;
    if (!skill || !required.some((r) => r.toLowerCase() === skill.toLowerCase())) return;
    if (!skills.matched.includes(skill)) {
      skills.matched.push(skill);
      skills.partial = skills.partial.filter((s) => s.toLowerCase() !== skill.toLowerCase());
      skills.missing = skills.missing.filter((s) => s.toLowerCase() !== skill.toLowerCase());
    }
  });

  const partials = adjustments?.add_to_partial || adjustments?.partial_additions || [];
  partials.forEach((item) => {
    const skill = typeof item === 'string' ? item : item.skill;
    if (!skill) return;
    if (!skills.matched.includes(skill) && !skills.partial.includes(skill)) {
      skills.partial.push(skill);
      skills.missing = skills.missing.filter((s) => s.toLowerCase() !== skill.toLowerCase());
    }
  });

  const total = required.length || 1;
  const points = skills.matched.length + skills.partial.length * 0.45;
  skills.score = clamp((points / total) * 100);
  return skills;
}

function mergeHybridAnalysis(evidenceAnalysis, llmResult, job) {
  if (!llmResult) return evidenceAnalysis;

  const requiredSkills = job.requiredSkills || job.required_skills || [];
  const skills_match = applySkillAdjustments(
    evidenceAnalysis,
    llmResult.skill_adjustments,
    requiredSkills,
  );

  const experience_match = evidenceAnalysis.experience_match;
  const education_match = evidenceAnalysis.education_match;
  const certsScore = evidenceAnalysis.certifications_match?.score;
  const certs_match = evidenceAnalysis.certifications_match;

  let overall_score = recalculateOverall(
    skills_match,
    experience_match,
    education_match,
    certsScore != null ? { score: certsScore } : null,
  );

  if (evidenceAnalysis.data_quality === 'none') overall_score = Math.min(overall_score, 35);
  else if (evidenceAnalysis.data_quality === 'low' && !evidenceAnalysis.documents_reviewed?.length) {
    overall_score = Math.min(overall_score, Math.max(overall_score - 8, 45));
  }

  const summary = llmResult.summary || llmResult.ai_summary || evidenceAnalysis.ai_summary;
  const strengths = (llmResult.strengths?.length ? llmResult.strengths : evidenceAnalysis.strengths).slice(0, 5);
  const weaknesses = (llmResult.weaknesses?.length ? llmResult.weaknesses : evidenceAnalysis.weaknesses).slice(0, 6);
  const recommendation = llmResult.recommendation || recommendationFromScore(overall_score);

  return {
    ...evidenceAnalysis,
    overall_score,
    skills_match,
    experience_match,
    education_match,
    ai_summary: summary,
    summary,
    strengths,
    weaknesses,
    recommendation,
    model_version: llmResult.model_version || 'hybrid-v1',
  };
}

async function runHybridAnalysis(job, application, profileText, docMeta, evidenceAnalysis) {
  const llmResult = await analyzeWithLlm(job, application, profileText, docMeta, evidenceAnalysis);
  if (!llmResult) return evidenceAnalysis;
  return mergeHybridAnalysis(evidenceAnalysis, llmResult, job);
}

module.exports = {
  runHybridAnalysis,
  mergeHybridAnalysis,
  applySkillAdjustments,
  recalculateOverall,
  recommendationFromScore,
};
