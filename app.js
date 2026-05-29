'use strict';

const repoInput   = document.getElementById('repo-input');
const tokenInput  = document.getElementById('token-input');
const fetchBtn    = document.getElementById('fetch-btn');
const errorBox    = document.getElementById('error-box');
const resultsEl   = document.getElementById('results');
const userSearch  = document.getElementById('user-search');
const userHighlight = document.getElementById('user-highlight');
const contribList = document.getElementById('contrib-list');

// Stats
const statTotalCommits  = document.getElementById('stat-total-commits');
const statContributors  = document.getElementById('stat-contributors');
const statTopUser       = document.getElementById('stat-top-user');
const statTopPct        = document.getElementById('stat-top-pct');

let chartInstance = null;
let allContributors = [];

// ─── Palette ────────────────────────────────────────────────────────────────
const PALETTE = [
  '#58a6ff','#f78166','#3fb950','#e3b341','#a371f7',
  '#ffa657','#79c0ff','#ff7b72','#56d364','#f0c98a',
  '#bc8cff','#ffb77b',
];

function colorFor(i) {
  return PALETTE[i % PALETTE.length];
}

// ─── API ─────────────────────────────────────────────────────────────────────
function makeHeaders(token) {
  const h = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function fetchAllContributors(owner, repo, token) {
  const headers = makeHeaders(token);
  let page = 1;
  let all  = [];

  while (true) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors?per_page=100&page=${page}&anon=false`;
    const res = await fetch(url, { headers });

    if (res.status === 404) throw new Error('Repository not found. Check the owner/repo name.');
    if (res.status === 409) throw new Error('Repository is empty — no commits yet.');

    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      if (body.message && body.message.includes('too large')) {
        throw new TooLargeError();
      }
      throw new Error('GitHub API rate limit exceeded. Add a personal access token to raise the limit to 5000 req/h.');
    }

    if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    all = all.concat(data);
    if (data.length < 100) break;
    page++;
  }

  return all;
}

class TooLargeError extends Error {
  constructor() { super('too-large'); }
}

// Fallback for repos too large for /contributors — uses the stats endpoint.
// GitHub computes stats asynchronously: first call may return 202, retry until 200.
async function fetchStatsContributors(owner, repo, token, maxRetries = 8) {
  const headers = makeHeaders(token);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/stats/contributors`;

  setStatus('Repository is very large — fetching cached stats (may take a few seconds)…');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, { headers });

    if (res.status === 200) {
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('No contributor stats available for this repository.');
      return data
        .filter(c => c.author)
        .map(c => ({
          login:        c.author.login,
          avatar_url:   c.author.avatar_url,
          html_url:     c.author.html_url,
          contributions: c.total,
        }))
        .sort((a, b) => b.contributions - a.contributions);
    }

    if (res.status === 202) {
      // GitHub is computing — wait and retry
      setStatus(`Computing stats… (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, 2500));
      continue;
    }

    if (res.status === 403) {
      throw new Error('GitHub API rate limit exceeded. Add a personal access token to raise the limit to 5000 req/h.');
    }

    throw new Error(`Stats API error: ${res.status} ${res.statusText}`);
  }

  throw new Error('GitHub is still computing stats for this repository. Wait a few seconds and try again.');
}

function setStatus(msg) {
  fetchBtn.textContent = msg.length > 40 ? msg.slice(0, 38) + '…' : msg;
}

// ─── Render chart ────────────────────────────────────────────────────────────
const CHART_TOP_N = 10;

function renderChart(contributors, total) {
  const top     = contributors.slice(0, CHART_TOP_N);
  const others  = contributors.slice(CHART_TOP_N);
  const othersCount = others.reduce((s, c) => s + c.contributions, 0);

  const labels  = top.map(c => c.login);
  const values  = top.map(c => c.contributions);
  const colors  = top.map((_, i) => colorFor(i));

  if (othersCount > 0) {
    labels.push(`Others (${others.length})`);
    values.push(othersCount);
    colors.push('#484f58');
  }

  const ctx = document.getElementById('contrib-chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: '#161b22',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#8b949e',
            font: { size: 11 },
            boxWidth: 12,
            padding: 10,
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} commits (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ─── Render list ─────────────────────────────────────────────────────────────
function renderList(contributors, total) {
  contribList.innerHTML = '';
  const maxCommits = contributors[0]?.contributions ?? 1;

  contributors.forEach((c, i) => {
    const pct  = ((c.contributions / total) * 100).toFixed(2);
    const barW = ((c.contributions / maxCommits) * 100).toFixed(1);

    const li = document.createElement('li');
    li.className = 'contrib-item';
    li.dataset.login = c.login.toLowerCase();

    li.innerHTML = `
      <span class="contrib-rank">${i + 1}</span>
      <div class="contrib-user">
        <img src="${c.avatar_url}&s=56" alt="${c.login}" loading="lazy" />
        <a href="${c.html_url}" target="_blank" rel="noopener">${c.login}</a>
      </div>
      <span class="contrib-commits">${c.contributions.toLocaleString()}</span>
      <div class="contrib-pct-cell">
        <span class="contrib-pct-label">${pct}%</span>
        <div class="contrib-bar">
          <div class="contrib-bar-fill" style="width:${barW}%;background:${colorFor(i)}"></div>
        </div>
      </div>
    `;
    contribList.appendChild(li);
  });
}

// ─── Render stats bar ─────────────────────────────────────────────────────────
function renderStats(contributors, total) {
  const top = contributors[0];
  statTotalCommits.textContent  = total.toLocaleString();
  statContributors.textContent  = contributors.length.toLocaleString();
  statTopUser.textContent       = top?.login ?? '—';
  statTopPct.textContent        = top ? `${((top.contributions / total) * 100).toFixed(1)}%` : '—';
}

// ─── User search ──────────────────────────────────────────────────────────────
function handleSearch(query, contributors, total) {
  const q = query.trim().toLowerCase();

  // Remove previous highlight
  document.querySelectorAll('.contrib-item.highlighted').forEach(el => el.classList.remove('highlighted'));

  if (!q) {
    userHighlight.classList.add('hidden');
    return;
  }

  const found = contributors.find(c => c.login.toLowerCase() === q)
             ?? contributors.find(c => c.login.toLowerCase().startsWith(q));

  if (!found) {
    userHighlight.classList.remove('hidden');
    userHighlight.innerHTML = `<p class="not-found">No contributor matching "<strong>${escapeHtml(query)}</strong>"</p>`;
    return;
  }

  const rank = contributors.indexOf(found) + 1;
  const pct  = ((found.contributions / total) * 100).toFixed(2);

  userHighlight.classList.remove('hidden');
  userHighlight.innerHTML = `
    <div class="uh-avatar">
      <img src="${found.avatar_url}&s=88" alt="${found.login}" />
      <div>
        <div class="uh-name">${found.login}</div>
        <a class="uh-link" href="${found.html_url}" target="_blank" rel="noopener">View on GitHub →</a>
      </div>
    </div>
    <div class="uh-stats">
      <div class="uh-stat-row"><span>Rank</span><span>#${rank}</span></div>
      <div class="uh-stat-row"><span>Commits</span><span>${found.contributions.toLocaleString()}</span></div>
      <div class="uh-stat-row"><span>Share</span><span>${pct}%</span></div>
    </div>
  `;

  // Highlight and scroll into view
  const item = contribList.querySelector(`[data-login="${found.login.toLowerCase()}"]`);
  if (item) {
    item.classList.add('highlighted');
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
}

function clearError() {
  errorBox.classList.add('hidden');
  errorBox.textContent = '';
}

// ─── Main handler ─────────────────────────────────────────────────────────────
async function analyze() {
  clearError();
  resultsEl.classList.add('hidden');
  userHighlight.classList.add('hidden');
  allContributors = [];

  const raw   = repoInput.value.trim();
  const token = tokenInput.value.trim();

  if (!raw) { showError('Please enter a repository in the format owner/repo.'); return; }

  const parts = raw.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    showError('Invalid format. Use owner/repo or paste the full GitHub URL.');
    return;
  }
  const [owner, repo] = parts;

  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Loading…';

  try {
    let contributors;
    try {
      contributors = await fetchAllContributors(owner, repo, token);
    } catch (err) {
      if (err instanceof TooLargeError) {
        contributors = await fetchStatsContributors(owner, repo, token);
      } else {
        throw err;
      }
    }

    if (contributors.length === 0) {
      showError('No contributors found for this repository.');
      return;
    }

    // API already returns sorted descending, but let's ensure
    contributors.sort((a, b) => b.contributions - a.contributions);
    const total = contributors.reduce((s, c) => s + c.contributions, 0);

    allContributors = contributors;

    renderStats(contributors, total);
    renderChart(contributors, total);
    renderList(contributors, total);
    resultsEl.classList.remove('hidden');

    // Wire up search
    userSearch.value = '';
    userSearch.oninput = () => handleSearch(userSearch.value, contributors, total);

  } catch (err) {
    showError(err.message);
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Analyze';
  }
}

fetchBtn.addEventListener('click', analyze);

repoInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') analyze();
});
