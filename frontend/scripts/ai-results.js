requireAuth(['employer']);
initSidebar('rankings');

const jobSelect = document.getElementById('job-select');
const rankingsBody = document.getElementById('rankings-body');
const analyzeBtn = document.getElementById('analyze-btn');
const jobParam = new URLSearchParams(window.location.search).get('job');

async function loadRankings() {
  const jobId = jobSelect.value;
  if (!jobId) {
    rankingsBody.innerHTML = '<p>Select a job to view rankings.</p>';
    return;
  }
  rankingsBody.innerHTML = loaderMarkup({ message: 'Loading rankings...' });
  try {
    const { rankings } = await api.getRankings(jobId);
    if (!rankings.length) {
      rankingsBody.innerHTML = `<div class="empty-state">
        <div class="icon">🤖</div>
        <p>No AI rankings yet. Click "Run AI Analysis" to rank candidates.</p>
      </div>`;
      return;
    }
    rankingsBody.innerHTML = rankings.map((r, i) => `
      <div class="rank-row" data-id="${r.id}">
        <div class="rank-num">#${i + 1}</div>
        <div><strong>${r.applicantName}</strong><br><small style="color:var(--text-muted)">${r.applicantEmail}</small></div>
        <div><span class="badge badge-${r.aiScore >= 80 ? 'success' : r.aiScore >= 60 ? 'warning' : 'danger'}">${Math.round(r.aiScore)}%</span></div>
        <div><span class="badge badge-info">${r.stageLabel}</span></div>
        <div class="score-bar"><div class="score-bar-fill" style="width:${r.aiScore}%"></div></div>
      </div>`).join('');

    rankingsBody.querySelectorAll('.rank-row').forEach((row) => {
      row.addEventListener('click', () => openCandidateModal(row.dataset.id));
    });
  } catch (e) {
    rankingsBody.innerHTML = `<p class="alert alert-error">${e.message}</p>`;
  }
}

analyzeBtn.addEventListener('click', async () => {
  const jobId = jobSelect.value;
  if (!jobId) return alert('Select a job first');
  setButtonLoading(analyzeBtn, true, 'Run AI Analysis', 'Analyzing...');
  try {
    await api.runAiAnalysis(jobId);
    await loadRankings();
  } catch (e) {
    alert(e.message);
  } finally {
    setButtonLoading(analyzeBtn, false, 'Run AI Analysis');
  }
});

(async () => {
  const jobs = await api.getJobs('?mine=1');
  jobSelect.innerHTML = jobs.map((j) => `<option value="${j.id}">${j.title}</option>`).join('');
  if (jobParam) jobSelect.value = jobParam;
  jobSelect.addEventListener('change', loadRankings);
  await loadRankings();
})();
