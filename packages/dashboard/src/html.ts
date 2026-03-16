export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tunnlo Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: #0a0c10;
      color: #c9d1d9;
      min-height: 100vh;
    }

    /* Nav */
    nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      height: 56px;
      background: #161b22;
      border-bottom: 1px solid #21262d;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    nav .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: #e6edf3;
      font-weight: 700;
      font-size: 18px;
      letter-spacing: -0.3px;
    }
    nav .brand .logo {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #58a6ff, #a371f7);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 800;
      color: #fff;
    }
    nav .nav-links {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    nav .nav-links a {
      text-decoration: none;
      color: #8b949e;
      font-size: 14px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 6px;
      transition: all 0.15s ease;
    }
    nav .nav-links a:hover { color: #e6edf3; background: #21262d; }
    nav .nav-links a.active { color: #e6edf3; background: #1f6feb22; }
    nav .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #3fb950;
      background: #3fb95015;
      padding: 4px 12px;
      border-radius: 20px;
      border: 1px solid #3fb95030;
    }
    nav .status-pill .dot {
      width: 6px;
      height: 6px;
      background: #3fb950;
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Main */
    .main { max-width: 1280px; margin: 0 auto; padding: 28px 32px; }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
    }
    .page-header h1 {
      font-size: 22px;
      font-weight: 600;
      color: #e6edf3;
    }
    .page-header .meta {
      font-size: 12px;
      color: #484f58;
    }

    /* Metric cards */
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 28px;
    }
    .metric-card {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 10px;
      padding: 18px 20px;
      transition: border-color 0.15s ease;
    }
    .metric-card:hover { border-color: #30363d; }
    .metric-card .metric-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #484f58;
      margin-bottom: 6px;
    }
    .metric-card .metric-value {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.5px;
      line-height: 1.1;
    }
    .metric-card .metric-sub {
      font-size: 11px;
      color: #484f58;
      margin-top: 4px;
    }
    .c-blue { color: #58a6ff; }
    .c-green { color: #3fb950; }
    .c-orange { color: #d29922; }
    .c-red { color: #f85149; }
    .c-purple { color: #a371f7; }

    /* Sections */
    .section {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 10px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-bottom: 1px solid #21262d;
    }
    .section-header h2 {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #8b949e;
    }
    .section-header .count {
      font-size: 11px;
      color: #484f58;
      background: #21262d;
      padding: 2px 8px;
      border-radius: 10px;
    }

    /* Tables */
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left;
      padding: 10px 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #484f58;
      background: #0d1117;
      border-bottom: 1px solid #21262d;
    }
    td {
      padding: 10px 20px;
      font-size: 13px;
      border-bottom: 1px solid #161b2280;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #1c212940; }

    /* Status badges */
    .status {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 500;
    }
    .status::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .status-connected::before { background: #3fb950; }
    .status-connected { color: #3fb950; }
    .status-degraded::before { background: #d29922; }
    .status-degraded { color: #d29922; }
    .status-error::before { background: #f85149; }
    .status-error { color: #f85149; }
    .status-disconnected::before { background: #484f58; }
    .status-disconnected { color: #484f58; }

    /* Event badges */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    .badge.received { background: #1f6feb20; color: #58a6ff; }
    .badge.filtered { background: #d2992220; color: #d29922; }
    .badge.processing { background: #a371f720; color: #a371f7; animation: pulse 1.5s ease-in-out infinite; }
    .badge.sent { background: #3fb95020; color: #3fb950; }
    .badge.dropped { background: #f8514920; color: #f85149; }
    .badge.buffered { background: #a371f720; color: #a371f7; }

    /* Activity bar */
    .activity-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      font-size: 12px;
      color: #8b949e;
      border-bottom: 1px solid #21262d;
      background: #0d1117;
    }
    .activity-bar .activity-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #484f58;
      flex-shrink: 0;
    }
    .activity-bar.active .activity-dot {
      background: #a371f7;
      animation: pulse 1s ease-in-out infinite;
    }
    .activity-bar .activity-text { flex: 1; }

    /* Progress bar */
    .bar-track {
      width: 100%;
      height: 4px;
      background: #21262d;
      border-radius: 2px;
      overflow: hidden;
      margin-top: 4px;
    }
    .bar-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.5s ease;
    }

    /* Errors */
    .error-list { padding: 16px 20px; max-height: 240px; overflow-y: auto; }
    .error-item {
      padding: 10px 12px;
      border-left: 3px solid #f85149;
      margin-bottom: 8px;
      background: #f8514908;
      border-radius: 0 6px 6px 0;
      font-size: 12px;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
    }
    .error-time { color: #484f58; font-size: 11px; margin-right: 8px; }
    .error-source { color: #f85149; margin-right: 6px; }
    .empty-msg { padding: 32px 20px; text-align: center; color: #30363d; font-size: 13px; }

    /* Mobile */
    .table-scroll { overflow-x: auto; overflow-y: auto; max-height: 400px; -webkit-overflow-scrolling: touch; }

    @media (max-width: 600px) {
      nav { padding: 0 16px; gap: 8px; }
      nav .nav-links { display: none; }
      .main { padding: 16px; }
      .page-header { flex-direction: column; align-items: flex-start; gap: 4px; }
      .metrics-row { grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .metric-card { padding: 12px 14px; }
      .metric-card .metric-value { font-size: 20px; }
      th, td { padding: 8px 12px; white-space: nowrap; }
      .response-meta { flex-wrap: wrap; gap: 6px; }
      .error-list, .response-list { padding: 12px; }
    }

    /* Agent tabs */
    .agent-tabs {
      display: flex;
      align-items: center;
      gap: 0;
      padding: 0 20px;
      border-bottom: 1px solid #21262d;
      background: #0d1117;
      overflow-x: auto;
    }
    .agent-tab {
      padding: 10px 18px;
      font-size: 12px;
      font-weight: 600;
      color: #8b949e;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      transition: all 0.15s ease;
      user-select: none;
    }
    .agent-tab:hover { color: #c9d1d9; }
    .agent-tab.active {
      color: #58a6ff;
      border-bottom-color: #58a6ff;
    }
    .agent-tab .tab-count {
      font-size: 10px;
      color: #484f58;
      background: #21262d;
      padding: 1px 6px;
      border-radius: 8px;
      margin-left: 6px;
    }
    .agent-tab.active .tab-count {
      background: #1f6feb30;
      color: #58a6ff;
    }

    /* Agent panels */
    .agent-panels { position: relative; }
    .agent-panel { display: none; }
    .agent-panel.active { display: block; }

    /* Agent color coding */
    .agent-color-0 { --agent-color: #58a6ff; }
    .agent-color-1 { --agent-color: #a371f7; }
    .agent-color-2 { --agent-color: #3fb950; }
    .agent-color-3 { --agent-color: #d29922; }
    .agent-color-4 { --agent-color: #f778ba; }
    .agent-color-5 { --agent-color: #79c0ff; }

    /* LLM Responses */
    .response-list { padding: 16px 20px; max-height: 480px; overflow-y: auto; }
    .response-item {
      padding: 14px 16px;
      border-left: 3px solid var(--agent-color, #58a6ff);
      margin-bottom: 10px;
      background: #58a6ff08;
      border-radius: 0 8px 8px 0;
    }
    .response-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
      font-size: 11px;
      color: #484f58;
    }
    .response-meta .resp-source { color: #58a6ff; font-weight: 600; }
    .response-meta .resp-agent { color: var(--agent-color, #58a6ff); font-weight: 600; }
    .response-meta .resp-tokens { color: #d29922; }
    .response-meta .resp-latency { color: #3fb950; }
    .response-meta .resp-actions {
      background: #a371f720;
      color: #a371f7;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 600;
      font-size: 10px;
    }
    .response-content {
      font-size: 13px;
      line-height: 1.6;
      color: #c9d1d9;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      max-height: 120px;
      overflow-y: auto;
    }

    /* Side-by-side comparison */
    .agent-compare {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      gap: 0;
    }
    .agent-compare .agent-column {
      border-right: 1px solid #21262d;
    }
    .agent-compare .agent-column:last-child { border-right: none; }
    .agent-column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: #0d1117;
      border-bottom: 1px solid #21262d;
      font-size: 12px;
      font-weight: 600;
    }
    .agent-column-header .agent-name { color: var(--agent-color, #58a6ff); }
    .agent-column-header .agent-stats { color: #484f58; font-weight: 400; font-size: 11px; }
  </style>
</head>
<body>
  <nav>
    <a href="/" class="brand">
      <span class="logo">T</span>
      Tunnlo
    </a>
    <div class="nav-links">
      <a href="/" class="active">Dashboard</a>
      <a href="/editor">Filter Editor</a>
    </div>
    <div class="status-pill">
      <span class="dot"></span>
      <span id="nav-status">Running</span>
    </div>
  </nav>

  <div class="main">
    <div class="page-header">
      <h1>Pipeline Overview</h1>
      <span class="meta" id="refresh-meta">Auto-refresh: 2s</span>
    </div>

    <div class="metrics-row" id="overview"></div>

    <div class="section">
      <div class="section-header">
        <h2>Adapters</h2>
        <span class="count" id="adapter-count">0</span>
      </div>
      <div class="table-scroll"><table id="adapters-table">
        <thead><tr><th>Adapter ID</th><th>Status</th><th>Events Produced</th><th>Last Event</th></tr></thead>
        <tbody></tbody>
      </table></div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Filter Chain</h2>
        <span class="count" id="filter-count">0</span>
      </div>
      <div class="table-scroll"><table id="filters-table">
        <thead><tr><th>Filter</th><th>Events In</th><th>Events Out</th><th>Drop Rate</th><th></th></tr></thead>
        <tbody></tbody>
      </table></div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Recent Events</h2>
        <span class="count" id="event-count">0</span>
      </div>
      <div class="activity-bar" id="activity-bar">
        <span class="activity-dot"></span>
        <span class="activity-text" id="activity-text">Idle</span>
      </div>
      <div class="table-scroll"><table id="events-table">
        <thead><tr><th>Time</th><th>Source</th><th>Type</th><th>Priority</th><th>Status</th></tr></thead>
        <tbody></tbody>
      </table></div>
    </div>

    <div class="section" id="responses-section">
      <div class="section-header">
        <h2>Agent Responses</h2>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="count" id="response-count">0</span>
          <button id="compare-toggle" style="font-size:11px;padding:3px 10px;border-radius:4px;border:1px solid #30363d;background:#21262d;color:#8b949e;cursor:pointer;display:none" title="Toggle side-by-side comparison">Compare</button>
        </div>
      </div>
      <div class="agent-tabs" id="agent-tabs">
        <div class="agent-tab active" data-agent="all">All</div>
      </div>
      <div class="agent-panels" id="agent-panels">
        <div class="agent-panel active" data-agent="all" id="panel-all">
          <div class="response-list">
            <div class="empty-msg">No responses yet</div>
          </div>
        </div>
      </div>
      <div class="agent-compare" id="agent-compare" style="display:none"></div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Errors</h2>
        <span class="count" id="error-count">0</span>
      </div>
      <div class="error-list" id="errors">
        <div class="empty-msg">No errors</div>
      </div>
    </div>
  </div>

  <script>
    function esc(s) {
      const d = document.createElement('div');
      d.appendChild(document.createTextNode(String(s)));
      return d.innerHTML;
    }
    function fmtUp(s) {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return h > 0 ? h + 'h ' + m + 'm' : m > 0 ? m + 'm ' + sec + 's' : sec + 's';
    }
    function fmtNum(n) {
      return n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' :
             n >= 1_000 ? (n / 1_000).toFixed(1) + 'K' : String(n);
    }

    function metricCard(label, value, color, sub) {
      return '<div class="metric-card"><div class="metric-label">' + label +
        '</div><div class="metric-value ' + color + '">' + value + '</div>' +
        (sub ? '<div class="metric-sub">' + sub + '</div>' : '') + '</div>';
    }

    function dropBar(rate) {
      const pct = Math.round(rate * 100);
      const color = pct > 50 ? '#f85149' : pct > 20 ? '#d29922' : '#3fb950';
      return pct + '%<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';
    }

    const AGENT_COLORS = ['#58a6ff', '#a371f7', '#3fb950', '#d29922', '#f778ba', '#79c0ff'];
    let lastRespCount = 0;
    let knownAgents = [];
    let activeTab = 'all';
    let compareMode = false;

    function getAgentColor(agentId) {
      const idx = knownAgents.indexOf(agentId);
      return AGENT_COLORS[idx % AGENT_COLORS.length];
    }

    function renderResponseItem(r, colorClass) {
      return '<div class="response-item ' + colorClass + '" style="border-left-color:' + getAgentColor(r.agent_id || 'default') + '">' +
        '<div class="response-meta">' +
        '<span class="resp-source">' + esc(r.source_id) + '</span>' +
        (r.agent_id ? '<span class="resp-agent" style="color:' + getAgentColor(r.agent_id) + '">' + esc(r.agent_id) + '</span>' : '') +
        '<span>' + esc(new Date(r.timestamp).toLocaleTimeString()) + '</span>' +
        '<span class="resp-tokens">' + r.tokens_used + ' tokens</span>' +
        '<span class="resp-latency">' + r.latency_ms + 'ms</span>' +
        (r.has_actions ? '<span class="resp-actions">ACTIONS</span>' : '') +
        '</div><div class="response-content">' + esc(r.content) + '</div></div>';
    }

    function ensureAgentTab(agentId) {
      if (knownAgents.includes(agentId)) return;
      knownAgents.push(agentId);
      const colorIdx = knownAgents.length - 1;

      // Add tab
      const tabsDiv = document.getElementById('agent-tabs');
      const tab = document.createElement('div');
      tab.className = 'agent-tab';
      tab.dataset.agent = agentId;
      tab.innerHTML = esc(agentId) + '<span class="tab-count" id="tab-count-' + agentId + '">0</span>';
      tab.onclick = function() { switchTab(agentId); };
      tabsDiv.appendChild(tab);

      // Add panel
      const panelsDiv = document.getElementById('agent-panels');
      const panel = document.createElement('div');
      panel.className = 'agent-panel';
      panel.dataset.agent = agentId;
      panel.id = 'panel-' + agentId;
      panel.innerHTML = '<div class="response-list"><div class="empty-msg">No responses yet</div></div>';
      panelsDiv.appendChild(panel);

      // Show compare button when 2+ agents
      if (knownAgents.length >= 2) {
        document.getElementById('compare-toggle').style.display = '';
      }
    }

    function switchTab(agentId) {
      activeTab = agentId;
      document.querySelectorAll('.agent-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.agent === agentId);
      });
      document.querySelectorAll('.agent-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.agent === agentId);
      });
    }

    function updateResponses(resps) {
      document.getElementById('response-count').textContent = resps.length;

      if (resps.length === 0) {
        lastRespCount = 0;
        const allList = document.querySelector('#panel-all .response-list');
        if (allList) allList.innerHTML = '<div class="empty-msg">No responses yet</div>';
        return;
      }

      // Discover new agents
      resps.forEach(r => { if (r.agent_id) ensureAgentTab(r.agent_id); });

      if (resps.length <= lastRespCount) return;

      const newResps = resps.slice(lastRespCount);

      // Update "All" panel
      const allList = document.querySelector('#panel-all .response-list');
      if (lastRespCount === 0) allList.innerHTML = '';
      const allFrag = document.createDocumentFragment();
      newResps.slice().reverse().forEach(r => {
        const item = document.createElement('div');
        item.innerHTML = renderResponseItem(r, '');
        allFrag.appendChild(item.firstChild);
      });
      allList.insertBefore(allFrag, allList.firstChild);

      // Update per-agent panels
      const byAgent = {};
      newResps.forEach(r => {
        const aid = r.agent_id || 'default';
        if (!byAgent[aid]) byAgent[aid] = [];
        byAgent[aid].push(r);
      });

      for (const [aid, items] of Object.entries(byAgent)) {
        const panel = document.getElementById('panel-' + aid);
        if (!panel) continue;
        const list = panel.querySelector('.response-list');
        if (list.querySelector('.empty-msg')) list.innerHTML = '';
        const frag = document.createDocumentFragment();
        items.slice().reverse().forEach(r => {
          const item = document.createElement('div');
          item.innerHTML = renderResponseItem(r, '');
          frag.appendChild(item.firstChild);
        });
        list.insertBefore(frag, list.firstChild);
      }

      // Update tab counts
      const allCounts = {};
      resps.forEach(r => {
        const aid = r.agent_id || 'default';
        allCounts[aid] = (allCounts[aid] || 0) + 1;
      });
      for (const [aid, count] of Object.entries(allCounts)) {
        const el = document.getElementById('tab-count-' + aid);
        if (el) el.textContent = count;
      }

      // Update compare view if active
      if (compareMode) renderCompareView(resps);

      lastRespCount = resps.length;
    }

    function renderCompareView(resps) {
      const compareDiv = document.getElementById('agent-compare');
      const byAgent = {};
      resps.forEach(r => {
        const aid = r.agent_id || 'default';
        if (!byAgent[aid]) byAgent[aid] = [];
        byAgent[aid].push(r);
      });

      compareDiv.innerHTML = knownAgents.map((aid, idx) => {
        const items = byAgent[aid] || [];
        const colorClass = 'agent-color-' + (idx % 6);
        return '<div class="agent-column ' + colorClass + '">' +
          '<div class="agent-column-header">' +
            '<span class="agent-name" style="color:' + AGENT_COLORS[idx % AGENT_COLORS.length] + '">' + esc(aid) + '</span>' +
            '<span class="agent-stats">' + items.length + ' responses</span>' +
          '</div>' +
          '<div class="response-list">' +
            (items.length === 0 ? '<div class="empty-msg">No responses</div>' :
              items.slice().reverse().map(r => renderResponseItem(r, '')).join('')) +
          '</div></div>';
      }).join('');
    }

    // Compare toggle
    document.getElementById('compare-toggle').onclick = function() {
      compareMode = !compareMode;
      const btn = document.getElementById('compare-toggle');
      const panels = document.getElementById('agent-panels');
      const tabs = document.getElementById('agent-tabs');
      const compare = document.getElementById('agent-compare');

      if (compareMode) {
        btn.style.background = '#1f6feb30';
        btn.style.color = '#58a6ff';
        btn.style.borderColor = '#1f6feb';
        panels.style.display = 'none';
        tabs.style.display = 'none';
        compare.style.display = '';
        lastRespCount = 0; // force full re-render
      } else {
        btn.style.background = '#21262d';
        btn.style.color = '#8b949e';
        btn.style.borderColor = '#30363d';
        panels.style.display = '';
        tabs.style.display = '';
        compare.style.display = 'none';
        lastRespCount = 0;
      }
    };

    // Tab click for "All"
    document.querySelector('.agent-tab[data-agent="all"]').onclick = function() { switchTab('all'); };

    async function refresh() {
      try {
        const res = await fetch('/api/metrics');
        const m = await res.json();

        document.getElementById('overview').innerHTML =
          metricCard('Uptime', fmtUp(m.uptime_seconds), 'c-blue') +
          metricCard('Events Received', fmtNum(m.events_received), 'c-blue', 'total events ingested') +
          metricCard('Throughput', m.events_per_second.toFixed(1) + '/s', 'c-green') +
          metricCard('Sent to LLM', fmtNum(m.events_sent_to_llm), 'c-green') +
          metricCard('Buffered', fmtNum(m.events_buffered), 'c-purple', 'in aggregation window') +
          metricCard('Dropped', fmtNum(m.events_dropped), m.events_dropped > 0 ? 'c-red' : 'c-green') +
          metricCard('Tokens (1h)', fmtNum(m.tokens_used_this_hour), 'c-orange') +
          metricCard('Avg Latency', m.avg_latency_ms + 'ms', m.avg_latency_ms > 2000 ? 'c-red' : 'c-green');

        document.getElementById('adapter-count').textContent = m.adapters.length;
        const adBody = document.querySelector('#adapters-table tbody');
        adBody.innerHTML = m.adapters.length === 0
          ? '<tr><td colspan="4" class="empty-msg">No adapters</td></tr>'
          : m.adapters.map(a =>
            '<tr><td style="font-weight:500">' + esc(a.id) + '</td><td><span class="status status-' + esc(a.status) + '">' + esc(a.status) +
            '</span></td><td>' + fmtNum(a.events_produced) + '</td><td style="color:#484f58">' + (a.last_event_at ? esc(new Date(a.last_event_at).toLocaleTimeString()) : '-') + '</td></tr>'
          ).join('');

        document.getElementById('filter-count').textContent = m.filters.length;
        const fBody = document.querySelector('#filters-table tbody');
        fBody.innerHTML = m.filters.length === 0
          ? '<tr><td colspan="5" class="empty-msg">No filters</td></tr>'
          : m.filters.map(f =>
            '<tr><td style="font-weight:500">' + esc(f.name) + '</td><td>' + fmtNum(f.events_in) + '</td><td>' + fmtNum(f.events_out) +
            '</td><td style="width:140px">' + dropBar(f.drop_rate) + '</td><td></td></tr>'
          ).join('');

        const activeLlm = m.active_llm_requests || 0;
        const actBar = document.getElementById('activity-bar');
        const actText = document.getElementById('activity-text');
        if (activeLlm > 0) {
          actBar.className = 'activity-bar active';
          actText.textContent = 'Waiting for LLM response... (' + activeLlm + ' in flight)';
        } else {
          actBar.className = 'activity-bar';
          actText.textContent = 'Idle';
        }

        document.getElementById('event-count').textContent = m.recent_events.length;
        const eBody = document.querySelector('#events-table tbody');
        eBody.innerHTML = m.recent_events.length === 0
          ? '<tr><td colspan="5" class="empty-msg">No events yet</td></tr>'
          : m.recent_events.slice().reverse().map(e =>
            '<tr><td style="color:#484f58;font-family:monospace;font-size:12px">' + esc(new Date(e.timestamp).toLocaleTimeString()) +
            '</td><td>' + esc(e.source_id) + '</td><td><span class="badge">' + esc(e.event_type) +
            '</span></td><td>' + esc(e.priority ?? 3) +
            '</td><td><span class="badge ' + esc(e.status) + '">' + esc(e.status) + '</span></td></tr>'
          ).join('');

        updateResponses(m.llm_responses || []);

        document.getElementById('error-count').textContent = m.errors.length;
        const errDiv = document.getElementById('errors');
        errDiv.innerHTML = m.errors.length === 0
          ? '<div class="empty-msg">No errors</div>'
          : m.errors.slice().reverse().map(e =>
            '<div class="error-item"><span class="error-time">' + esc(new Date(e.timestamp).toLocaleTimeString()) +
            '</span><span class="error-source">[' + esc(e.source) + ']</span>' + esc(e.message) + '</div>'
          ).join('');

        document.getElementById('nav-status').textContent = 'Running \\u00b7 ' + fmtUp(m.uptime_seconds);
      } catch (e) {
        document.getElementById('nav-status').textContent = 'Disconnected';
      }
    }

    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`;
