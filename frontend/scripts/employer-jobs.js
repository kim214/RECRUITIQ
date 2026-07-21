/** Shared employer job list — always fetches fresh data after posting a job. */

async function fetchEmployerJobs() {
  return api.getJobs('?mine=1');
}

async function populateJobSelect(selectEl, options = {}) {
  const { selectedId = null, emptyLabel = 'No jobs posted yet' } = options;
  if (!selectEl) return [];

  selectEl.innerHTML = `<option value="">Loading jobs...</option>`;
  const jobs = await fetchEmployerJobs();

  if (!jobs.length) {
    selectEl.innerHTML = `<option value="">${emptyLabel}</option>`;
    return jobs;
  }

  selectEl.innerHTML = jobs.map((j) => {
    const apps = j.applicationCount != null ? ` (${j.applicationCount} apps)` : '';
    return `<option value="${j.id}">${j.title}${apps}</option>`;
  }).join('');

  const pick = selectedId
    || new URLSearchParams(window.location.search).get('job')
    || sessionStorage.getItem('reqruit_new_job');
  if (pick && jobs.some((j) => j.id === pick)) {
    selectEl.value = pick;
  }
  sessionStorage.removeItem('reqruit_new_job');
  return jobs;
}

function markJobsUpdated(jobId) {
  if (jobId) sessionStorage.setItem('reqruit_new_job', jobId);
  sessionStorage.setItem('reqruit_jobs_updated', String(Date.now()));
}

window.addEventListener('pageshow', () => {
  if (sessionStorage.getItem('reqruit_jobs_updated')) {
    sessionStorage.removeItem('reqruit_jobs_updated');
    if (typeof window.reloadEmployerJobs === 'function') window.reloadEmployerJobs();
  }
});
