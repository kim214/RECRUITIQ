/**
 * Rank candidates by the deterministic RecruitIQ score.
 * score_breakdown wins over any LLM overall_score.
 */

const { matchLabel } = require('./scoringEngine');

function rankingScore(application) {
  const breakdown = application?.scoreBreakdown || application?.score_breakdown;
  if (breakdown?.overall_score != null && Number.isFinite(Number(breakdown.overall_score))) {
    return Number(breakdown.overall_score);
  }
  if (application?.aiScore != null && Number.isFinite(Number(application.aiScore))) {
    return Number(application.aiScore);
  }
  const analysisScore = application?.analysis?.overallScore ?? application?.analysis?.overall_score;
  if (analysisScore != null && Number.isFinite(Number(analysisScore))) {
    return Number(analysisScore);
  }
  return null;
}

function rankingLabel(application, score) {
  const breakdown = application?.scoreBreakdown || application?.score_breakdown;
  return breakdown?.match_label
    || application?.analysis?.matchLabel
    || (score != null ? matchLabel(score) : null);
}

function compareRanked(a, b) {
  if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
  return String(a.applicantCode || a.applicantName || '').localeCompare(String(b.applicantCode || b.applicantName || ''), undefined, { sensitivity: 'base' });
}

function rankApplications(applications) {
  return (applications || [])
    .map((app) => {
      const rankScore = rankingScore(app);
      return {
        ...app,
        rankScore,
        matchLabel: rankingLabel(app, rankScore),
      };
    })
    .filter((app) => app.rankScore != null)
    .sort(compareRanked)
    .map((app, index) => ({
      ...app,
      rank: index + 1,
      aiScore: app.rankScore,
    }));
}

module.exports = {
  rankingScore,
  rankingLabel,
  rankApplications,
};
