export const EDITOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tunnlo Filter Editor</title>
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

    /* Layout */
    .editor-layout {
      display: flex;
      height: calc(100vh - 56px);
    }

    /* Sidebar palette */
    .palette {
      width: 280px;
      flex-shrink: 0;
      background: #161b22;
      border-right: 1px solid #21262d;
      padding: 20px;
      overflow-y: auto;
    }
    .palette h2 {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #484f58;
      margin-bottom: 14px;
    }
    .filter-type {
      background: #0d1117;
      border: 1px solid #21262d;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 8px;
      cursor: grab;
      transition: all 0.15s ease;
      position: relative;
    }
    .filter-type:hover {
      border-color: #58a6ff;
      background: #1f6feb08;
      transform: translateY(-1px);
    }
    .filter-type:active { cursor: grabbing; transform: scale(0.98); }
    .filter-type .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .icon-rl { background: #3fb95020; color: #3fb950; }
    .icon-cf { background: #58a6ff20; color: #58a6ff; }
    .icon-dd { background: #d2992220; color: #d29922; }
    .icon-wa { background: #a371f720; color: #a371f7; }
    .icon-as { background: #f778ba20; color: #f778ba; }
    .icon-pr { background: #f8514920; color: #f85149; }
    .filter-type .name {
      font-weight: 600;
      font-size: 13px;
      color: #e6edf3;
    }
    .filter-type .desc {
      font-size: 11px;
      color: #484f58;
      margin-top: 3px;
      line-height: 1.4;
    }

    /* Canvas */
    .canvas-area {
      flex: 1;
      padding: 28px 32px;
      overflow-y: auto;
      background: #0a0c10;
    }
    .canvas-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .canvas-header h1 {
      font-size: 20px;
      font-weight: 600;
      color: #e6edf3;
    }
    .canvas-actions {
      display: flex;
      gap: 8px;
    }

    /* Chain items */
    .chain-flow {
      max-width: 640px;
      margin: 0 auto;
    }
    .chain-item {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 10px;
      padding: 20px;
      position: relative;
      transition: all 0.15s ease;
    }
    .chain-item:hover { border-color: #30363d; }
    .chain-item.active { border-color: #58a6ff; box-shadow: 0 0 0 1px #58a6ff30; }
    .chain-item .item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .chain-item .item-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .chain-item .step-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #21262d;
      color: #8b949e;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .chain-item .type-label {
      font-size: 13px;
      font-weight: 600;
      color: #e6edf3;
    }
    .chain-item .remove-btn {
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: #484f58;
      font-size: 18px;
      cursor: pointer;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    .chain-item .remove-btn:hover { background: #f8514920; color: #f85149; }

    .chain-item .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .chain-item .field { }
    .chain-item .field.full { grid-column: 1 / -1; }
    .chain-item .field label {
      display: block;
      font-size: 11px;
      font-weight: 500;
      color: #484f58;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .chain-item .field input,
    .chain-item .field select,
    .chain-item .field textarea {
      width: 100%;
      background: #0d1117;
      border: 1px solid #21262d;
      border-radius: 6px;
      color: #c9d1d9;
      padding: 8px 10px;
      font-size: 13px;
      font-family: inherit;
      transition: border-color 0.15s ease;
    }
    .chain-item .field input:focus,
    .chain-item .field select:focus,
    .chain-item .field textarea:focus {
      outline: none;
      border-color: #58a6ff;
      box-shadow: 0 0 0 2px #58a6ff20;
    }
    .chain-item .field textarea {
      min-height: 68px;
      resize: vertical;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      font-size: 12px;
    }

    /* Connector arrow */
    .connector {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 6px 0;
      color: #21262d;
    }
    .connector .line { width: 2px; height: 16px; background: #21262d; }
    .connector .arrow { font-size: 10px; color: #30363d; margin-top: -2px; }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 60px 40px;
      border: 2px dashed #21262d;
      border-radius: 12px;
      max-width: 640px;
      margin: 0 auto;
    }
    .empty-state .empty-icon {
      font-size: 36px;
      margin-bottom: 12px;
      opacity: 0.3;
    }
    .empty-state .empty-title {
      font-size: 16px;
      font-weight: 600;
      color: #484f58;
      margin-bottom: 6px;
    }
    .empty-state .empty-desc {
      font-size: 13px;
      color: #30363d;
    }

    /* YAML panel */
    .yaml-panel {
      width: 360px;
      flex-shrink: 0;
      background: #161b22;
      border-left: 1px solid #21262d;
      display: flex;
      flex-direction: column;
    }
    .yaml-header {
      padding: 16px 20px;
      border-bottom: 1px solid #21262d;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .yaml-header h2 {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #484f58;
    }
    .yaml-header .yaml-actions { display: flex; gap: 6px; }
    .yaml-output {
      flex: 1;
      padding: 16px 20px;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.6;
      color: #7ee787;
      white-space: pre;
      overflow: auto;
      background: #0d1117;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      border-radius: 6px;
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .btn-primary { background: #238636; color: #fff; }
    .btn-primary:hover { background: #2ea043; }
    .btn-secondary { background: #21262d; color: #c9d1d9; }
    .btn-secondary:hover { background: #30363d; }
    .btn-ghost { background: transparent; color: #8b949e; }
    .btn-ghost:hover { background: #21262d; color: #c9d1d9; }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1f6feb;
      color: #fff;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.3s ease;
      pointer-events: none;
      z-index: 200;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
  </style>
</head>
<body>
  <nav>
    <a href="/" class="brand">
      <span class="logo">T</span>
      Tunnlo
    </a>
    <div class="nav-links">
      <a href="/">Dashboard</a>
      <a href="/editor" class="active">Filter Editor</a>
    </div>
    <div style="width:100px"></div>
  </nav>

  <div class="editor-layout">
    <div class="palette">
      <h2>Filter Types</h2>
      <div class="filter-type" draggable="true" data-type="rate-limiter">
        <div class="icon icon-rl">RL</div>
        <div class="name">Rate Limiter</div>
        <div class="desc">Throttle events to N per minute</div>
      </div>
      <div class="filter-type" draggable="true" data-type="content-filter">
        <div class="icon icon-cf">CF</div>
        <div class="name">Content Filter</div>
        <div class="desc">Match fields by regex, keyword, or value list</div>
      </div>
      <div class="filter-type" draggable="true" data-type="dedup">
        <div class="icon icon-dd">DD</div>
        <div class="name">Deduplication</div>
        <div class="desc">Suppress duplicate events in a time window</div>
      </div>
      <div class="filter-type" draggable="true" data-type="windowed-aggregation">
        <div class="icon icon-wa">WA</div>
        <div class="name">Windowed Aggregation</div>
        <div class="desc">Batch events together before sending to LLM</div>
      </div>
      <div class="filter-type" draggable="true" data-type="adaptive-sampling">
        <div class="icon icon-as">AS</div>
        <div class="name">Adaptive Sampling</div>
        <div class="desc">Dynamically adjust sample rate by velocity</div>
      </div>
      <div class="filter-type" draggable="true" data-type="priority-router">
        <div class="icon icon-pr">PR</div>
        <div class="name">Priority Router</div>
        <div class="desc">Route or drop events by priority level</div>
      </div>
    </div>

    <div class="canvas-area">
      <div class="canvas-header">
        <h1>Filter Chain</h1>
        <div class="canvas-actions">
          <button class="btn btn-secondary" onclick="loadFromApi()">Load Current Config</button>
          <button class="btn btn-ghost" onclick="clearChain()">Clear All</button>
        </div>
      </div>
      <div class="chain-flow" id="chain-flow">
        <div class="empty-state" id="empty-state">
          <div class="empty-icon">&#x25B3;</div>
          <div class="empty-title">No filters in chain</div>
          <div class="empty-desc">Drag filter types from the sidebar to start building your pipeline</div>
        </div>
      </div>
    </div>

    <div class="yaml-panel">
      <div class="yaml-header">
        <h2>Generated YAML</h2>
        <div class="yaml-actions">
          <button class="btn btn-primary" onclick="copyYaml()">Copy</button>
        </div>
      </div>
      <div class="yaml-output" id="yaml-output">filters: []</div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    let chain = [];
    let activeId = null;

    function esc(s) {
      const d = document.createElement('div');
      d.appendChild(document.createTextNode(String(s)));
      return d.innerHTML;
    }
    function escAttr(s) {
      return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    const filterDefaults = {
      'rate-limiter': { max_events_per_minute: 30 },
      'content-filter': { rules: [{ field: 'payload.data', match: '' }], mode: 'all' },
      'dedup': { window_seconds: 30, key_fields: ['payload.data'] },
      'windowed-aggregation': { window_seconds: 60, max_batch_size: 50, summary_prompt: 'Analyze these events' },
      'adaptive-sampling': { base_rate: 0.5, min_rate: 0.1, max_rate: 1.0, velocity_window_seconds: 60, high_velocity_threshold: 100, low_velocity_threshold: 10 },
      'priority-router': { high_priority_threshold: 2, low_priority_threshold: 5, drop_low_priority: false },
    };

    const filterLabels = {
      'rate-limiter': 'Rate Limiter',
      'content-filter': 'Content Filter',
      'dedup': 'Deduplication',
      'windowed-aggregation': 'Windowed Aggregation',
      'adaptive-sampling': 'Adaptive Sampling',
      'priority-router': 'Priority Router',
    };

    // Toast
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }

    // Drag and drop
    document.querySelectorAll('.filter-type').forEach(el => {
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', el.dataset.type);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });

    const flow = document.getElementById('chain-flow');
    flow.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    flow.addEventListener('drop', e => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/plain');
      if (type && filterDefaults[type]) addFilter(type);
    });

    function addFilter(type) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      chain.push({ id, type, config: { ...filterDefaults[type] } });
      activeId = id;
      render();
      showToast('Added ' + filterLabels[type]);
    }

    function removeFilter(id) {
      chain = chain.filter(f => f.id !== id);
      if (activeId === id) activeId = null;
      render();
    }

    function clearChain() {
      chain = [];
      activeId = null;
      render();
    }

    function updateConfig(id, key, value) {
      const filter = chain.find(f => f.id === id);
      if (!filter) return;
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(value) && value !== '') value = Number(value);
      filter.config[key] = value;
      renderYaml();
    }

    function render() {
      const emptyEl = document.getElementById('empty-state');
      if (emptyEl) emptyEl.style.display = chain.length === 0 ? 'flex' : 'none';

      // Rebuild chain UI
      const existing = flow.querySelectorAll('.chain-item, .connector');
      existing.forEach(el => el.remove());

      chain.forEach((f, i) => {
        if (i > 0) {
          const conn = document.createElement('div');
          conn.className = 'connector';
          conn.innerHTML = '<div class="line"></div><div class="arrow">&#x25BC;</div>';
          flow.appendChild(conn);
        }

        const item = document.createElement('div');
        item.className = 'chain-item' + (activeId === f.id ? ' active' : '');
        item.onclick = () => { activeId = f.id; render(); };

        const fields = Object.entries(f.config).map(([key, val]) => {
          const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
          const isWide = key.includes('prompt') || key.includes('rules') || key.includes('key_fields');
          const safeId = escAttr(f.id);
          const safeKey = escAttr(key);

          if (typeof val === 'boolean') {
            return '<div class="field"><label>' + esc(key) + '</label><select onchange="updateConfig(\\'' + safeId + '\\',\\'' + safeKey + '\\',this.value)"><option value="true"' + (val ? ' selected' : '') + '>true</option><option value="false"' + (!val ? ' selected' : '') + '>false</option></select></div>';
          }
          if (isWide) {
            return '<div class="field full"><label>' + esc(key) + '</label><textarea onchange="updateConfig(\\'' + safeId + '\\',\\'' + safeKey + '\\',this.value)">' + esc(strVal) + '</textarea></div>';
          }
          return '<div class="field"><label>' + esc(key) + '</label><input type="' + (typeof val === 'number' ? 'number' : 'text') + '" value="' + escAttr(strVal) + '" onchange="updateConfig(\\'' + safeId + '\\',\\'' + safeKey + '\\',this.value)"></div>';
        }).join('');

        item.innerHTML =
          '<div class="item-header"><div class="item-header-left"><span class="step-num">' + (i + 1) +
          '</span><span class="type-label">' + esc(filterLabels[f.type] || f.type) +
          '</span></div><button class="remove-btn" onclick="event.stopPropagation();removeFilter(\\'' + escAttr(f.id) +
          '\\')" title="Remove">&times;</button></div><div class="fields">' + fields + '</div>';

        flow.appendChild(item);
      });

      renderYaml();
    }

    function renderYaml() {
      const filters = chain.map(f => ({ type: f.type, ...f.config }));
      const lines = ['filters:'];
      if (filters.length === 0) {
        lines[0] = 'filters: []';
      } else {
        filters.forEach(f => {
          lines.push('  - type: ' + f.type);
          Object.entries(f).forEach(([key, val]) => {
            if (key === 'type') return;
            if (Array.isArray(val)) {
              lines.push('    ' + key + ':');
              val.forEach(item => {
                if (typeof item === 'object') {
                  const entries = Object.entries(item);
                  lines.push('      - ' + entries[0][0] + ': ' + JSON.stringify(entries[0][1]));
                  entries.slice(1).forEach(([k, v]) => {
                    lines.push('        ' + k + ': ' + JSON.stringify(v));
                  });
                } else {
                  lines.push('      - ' + JSON.stringify(item));
                }
              });
            } else if (typeof val === 'string' && val.includes('\\n')) {
              lines.push('    ' + key + ': |');
              val.split('\\n').forEach(l => lines.push('      ' + l));
            } else {
              lines.push('    ' + key + ': ' + (typeof val === 'string' ? '"' + val + '"' : val));
            }
          });
        });
      }
      document.getElementById('yaml-output').textContent = lines.join('\\n');
    }

    function copyYaml() {
      navigator.clipboard.writeText(document.getElementById('yaml-output').textContent);
      showToast('Copied to clipboard');
    }

    async function loadFromApi() {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const config = await res.json();
          if (config.filters && config.filters.length > 0) {
            chain = config.filters.map((f, i) => ({
              id: Date.now().toString(36) + i,
              type: f.type,
              config: Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'type')),
            }));
            render();
            showToast('Loaded ' + chain.length + ' filters from pipeline');
          } else {
            showToast('No filters in current config');
          }
        }
      } catch (e) {
        showToast('Failed to load config');
      }
    }

    render();
  </script>
</body>
</html>`;
