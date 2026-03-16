#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, output: process.stdout });
let rlClosed = false;
rl.on('close', () => { rlClosed = true; });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    if (rlClosed) return resolve('');
    rl.question(question, (a) => resolve(a.trim()));
    rl.once('close', () => resolve(''));
  });
}

async function choose(question: string, options: { label: string; value: string }[]): Promise<string> {
  console.log(question);
  options.forEach((opt, i) => console.log(`  ${i + 1}) ${opt.label}`));
  const answer = await ask(`  Choice [1]: `);
  const index = parseInt(answer || '1', 10) - 1;
  return (index >= 0 && index < options.length) ? options[index].value : options[0].value;
}

// ── LLM choices ──────────────────────────────────────────────────────────────

const LLM_OPTIONS = [
  { label: 'Anthropic Claude (requires ANTHROPIC_API_KEY)', value: 'anthropic/claude-sonnet-4-5' },
  { label: 'OpenAI GPT-4o (requires OPENAI_API_KEY)', value: 'openai/gpt-4o' },
  { label: 'Ollama — local models, no API key needed', value: 'ollama/llama3.1:8b' },
  { label: 'OpenClaw — WebSocket agent gateway', value: 'runtime:openclaw' },
  { label: 'LangGraph — LangChain agent graphs', value: 'runtime:langgraph' },
  { label: 'CrewAI — multi-agent framework', value: 'runtime:crewai' },
];

interface AgentDef {
  id: string;
  runtime: string;
  model: string;
  runtimeConfig: Record<string, string>;
  sources?: string[];
  system_prompt: string;
}

async function collectRuntimeConfig(runtime: string): Promise<Record<string, string>> {
  const cfg: Record<string, string> = {};
  if (runtime === 'openclaw') {
    cfg.gateway_url = await ask('  OpenClaw gateway URL [ws://localhost:3000/ws]: ') || 'ws://localhost:3000/ws';
    cfg.agent_id = await ask('  Agent ID [default]: ') || 'default';
  } else if (runtime === 'langgraph') {
    cfg.endpoint_url = await ask('  LangGraph endpoint URL [http://localhost:8123]: ') || 'http://localhost:8123';
    cfg.graph_id = await ask('  Graph ID [agent]: ') || 'agent';
  } else if (runtime === 'crewai') {
    cfg.endpoint_url = await ask('  CrewAI endpoint URL [http://localhost:8000]: ') || 'http://localhost:8000';
    cfg.crew_id = await ask('  Crew ID [default]: ') || 'default';
  }
  return cfg;
}

function parseLlmChoice(llmChoice: string): { model: string; runtime: string } {
  if (llmChoice.startsWith('runtime:')) {
    return { model: '', runtime: llmChoice.slice('runtime:'.length) };
  }
  return { model: llmChoice, runtime: 'direct-llm' };
}

function defaultPromptForSource(source: string): string {
  const prompts: Record<string, string> = {
    stdin: `You are a monitoring agent. Analyze incoming events and respond with
    observations, potential issues, and recommended actions.`,
    tshark: `You are a network security analyst monitoring live traffic.
    Assess each packet: is this normal or suspicious? Should an alert be raised?`,
    log: `You are a log analysis agent. Monitor incoming log lines and identify
    errors, warnings, anomalies, or patterns worth flagging.`,
    'mcp-bridge': `You are a monitoring agent connected to an MCP server.
    Analyze incoming tool results and events, identify issues, and recommend actions.`,
    kafka: `You are a real-time event processing agent consuming messages from Kafka.
    Analyze each event for anomalies, errors, or patterns worth flagging.`,
    'google-docs': `You are a document collaboration assistant monitoring Google Docs.
    Summarize comments, evaluate suggestions, and flag significant edits.`,
  };
  return prompts[source] || prompts.stdin;
}

function generateAgentsYaml(agents: AgentDef[]): string {
  if (agents.length === 1 && !agents[0].sources) {
    const a = agents[0];
    if (a.runtime === 'direct-llm') {
      return `agent:
  runtime: direct-llm
  model: ${a.model}
  system_prompt: |
    ${a.system_prompt.split('\n').join('\n    ')}
  token_budget:
    max_per_hour: ${a.model.startsWith('ollama/') ? '50000' : '100000'}
    max_per_event: 4000`;
    }
    // Non-direct-llm runtime
    const runtimeYaml = Object.entries(a.runtimeConfig)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');
    return `agent:
  runtime: ${a.runtime}
${runtimeYaml}`;
  }

  return 'agents:\n' + agents.map((a) => {
    const lines: string[] = [];
    lines.push(`  - id: ${a.id}`);
    if (a.runtime === 'direct-llm') {
      lines.push(`    runtime: direct-llm`);
      lines.push(`    model: ${a.model}`);
    } else {
      lines.push(`    runtime: ${a.runtime}`);
      for (const [k, v] of Object.entries(a.runtimeConfig)) {
        lines.push(`    ${k}: ${v}`);
      }
    }
    if (a.sources && a.sources.length > 0) {
      lines.push(`    sources: [${a.sources.join(', ')}]`);
    }
    lines.push(`    system_prompt: |`);
    lines.push(`      ${a.system_prompt.split('\n').join('\n      ')}`);
    if (a.runtime === 'direct-llm') {
      lines.push(`    token_budget:`);
      lines.push(`      max_per_hour: ${a.model.startsWith('ollama/') ? '50000' : '100000'}`);
      lines.push(`      max_per_event: 4000`);
    }
    return lines.join('\n');
  }).join('\n\n');
}

// ── Config generators ──────────────────────────────────────────────────────

function stdinConfig(model: string): string {
  return `# Tunnlo Pipeline Configuration
# Docs: https://tunnlo.com

sources:
  - id: stdin-input
    adapter: native/stdin
    config: {}

# ─── Alternative: Wireshark / tshark ────────────────────────────────────────
# To monitor live network traffic instead, replace the source above with:
#
# Prerequisite: install tshark — https://www.wireshark.org/download.html
#   macOS:  brew install wireshark
#   Ubuntu: sudo apt install tshark
#
# sources:
#   - id: network-traffic
#     adapter: native/tshark
#     config:
#       interface: en0          # find yours: ip link (Linux) or networksetup -listallnetworkservices (macOS)
#       capture_filter: tcp     # optional BPF filter, e.g. "tcp port 443"
#       output_format: json
# ────────────────────────────────────────────────────────────────────────────

filters:
  - type: rate-limiter
    max_events_per_minute: 30

  - type: dedup
    window_seconds: 10
    key_fields:
      - payload.data

agent:
  runtime: direct-llm
  model: ${model}
  system_prompt: |
    You are a monitoring agent. Analyze incoming events and respond with
    observations, potential issues, and recommended actions.

    If you want to trigger a webhook action, include a JSON block like:
    \`\`\`json:actions
    [{"type": "webhook", "config": {}, "payload": {"message": "your alert"}}]
    \`\`\`
  token_budget:
    max_per_hour: 50000
    max_per_event: 4000

behavior:
  on_llm_unreachable: drop_and_alert
`;
}

function tsharkConfig(model: string, iface: string, captureFilter: string): string {
  const filterLine = captureFilter ? `      capture_filter: "${captureFilter}"` : `      # capture_filter: tcp   # optional BPF filter, e.g. "tcp port 443"`;
  return `# Tunnlo Pipeline Configuration — Network Monitor
# Docs: https://tunnlo.com
#
# Prerequisite: tshark must be installed.
#   macOS:  brew install wireshark
#   Ubuntu: sudo apt install tshark
#   Windows: install Wireshark from https://www.wireshark.org/download.html

sources:
  - id: network-traffic
    adapter: native/tshark
    config:
      interface: ${iface}
${filterLine}
      output_format: json

filters:
  - type: dedup
    window_seconds: 30
    key_fields:
      - payload.src_ip
      - payload.dst_port

  - type: rate-limiter
    max_events_per_minute: 20

agent:
  runtime: direct-llm
  model: ${model}
  system_prompt: |
    You are a network security analyst monitoring live traffic.
    For each packet event, assess:
    1. Is this normal traffic or potentially suspicious?
    2. What kind of activity does this represent?
    3. Should an alert be raised?

    If you detect suspicious activity, trigger a webhook alert:
    \`\`\`json:actions
    [{"type": "webhook", "config": {}, "payload": {"severity": "high", "message": "description"}}]
    \`\`\`
  token_budget:
    max_per_hour: 100000
    max_per_event: 4000

behavior:
  on_llm_unreachable: drop_and_alert
`;
}

function logConfig(model: string, logPath: string): string {
  return `# Tunnlo Pipeline Configuration — Log Monitor
# Docs: https://tunnlo.com

sources:
  - id: log-file
    adapter: native/log-tailer
    config:
      path: ${logPath}
      # poll_interval_ms: 500   # how often to check for new lines

filters:
  - type: rate-limiter
    max_events_per_minute: 30

  - type: dedup
    window_seconds: 10
    key_fields:
      - payload.data

agent:
  runtime: direct-llm
  model: ${model}
  system_prompt: |
    You are a log analysis agent. Monitor incoming log lines and identify
    errors, warnings, anomalies, or patterns worth flagging.
  token_budget:
    max_per_hour: 50000
    max_per_event: 4000

behavior:
  on_llm_unreachable: drop_and_alert
`;
}

function mcpBridgeConfig(model: string, serverUrl: string): string {
  return `# Tunnlo Pipeline Configuration — MCP Bridge
# Docs: https://tunnlo.com
#
# Receives events from an MCP-compatible server.

sources:
  - id: mcp-source
    adapter: mcp-bridge
    config:
      server_url: ${serverUrl}

filters:
  - type: rate-limiter
    max_events_per_minute: 30

  - type: dedup
    window_seconds: 10
    key_fields:
      - payload.data

agent:
  runtime: direct-llm
  model: ${model}
  system_prompt: |
    You are a monitoring agent connected to an MCP server.
    Analyze incoming tool results and events, identify issues,
    and recommend actions.
  token_budget:
    max_per_hour: 50000
    max_per_event: 4000

behavior:
  on_llm_unreachable: drop_and_alert
`;
}

function kafkaConfig(model: string, brokers: string, topic: string, groupId: string): string {
  return `# Tunnlo Pipeline Configuration — Kafka Consumer
# Docs: https://tunnlo.com
#
# Prerequisite: a running Kafka cluster accessible at the configured brokers.

sources:
  - id: kafka-source
    adapter: kafka
    config:
      brokers:
${brokers.split(',').map((b) => `        - ${b.trim()}`).join('\n')}
      topic: ${topic}
      group_id: ${groupId}
      # from_beginning: false        # set true to replay from earliest offset
      # ssl: false                   # enable for TLS connections
      # sasl:                        # uncomment for authenticated clusters
      #   mechanism: plain           # plain | scram-sha-256 | scram-sha-512
      #   username: user
      #   password: secret

filters:
  - type: rate-limiter
    max_events_per_minute: 60

  - type: dedup
    window_seconds: 10
    key_fields:
      - payload.data

agent:
  runtime: direct-llm
  model: ${model}
  system_prompt: |
    You are a real-time event processing agent consuming messages from Kafka.
    Analyze each event for anomalies, errors, or patterns worth flagging.
    Provide concise assessments and recommended actions.

    If you detect an issue that warrants an alert, trigger a webhook:
    \`\`\`json:actions
    [{"type": "webhook", "config": {}, "payload": {"severity": "high", "message": "description"}}]
    \`\`\`
  token_budget:
    max_per_hour: 100000
    max_per_event: 4000

behavior:
  on_llm_unreachable: drop_and_alert
`;
}

function googleDocsConfig(model: string, credentialsPath: string, docIds: string[], watchTypes: string[]): string {
  const docIdLines = docIds.map((id) => `        - ${id}`).join('\n');
  const watchLines = watchTypes.map((t) => `        - ${t}`).join('\n');
  return `# Tunnlo Pipeline Configuration — Google Docs Monitor
# Docs: https://tunnlo.com
#
# Watches Google Docs for new comments, suggestions, and edits,
# then sends them to an LLM for analysis and action.
#
# Prerequisites:
#   1. npm install googleapis
#   2. Create a Google Cloud project with Docs & Drive APIs enabled
#   3. Create a service account key (JSON) and save it at the path below
#   4. Share your Google Doc(s) with the service account email (Commenter access)
#      (find the email in your service account JSON under "client_email")

sources:
  - id: google-docs
    adapter: google-docs
    config:
      credentials_path: ${credentialsPath}
      doc_ids:
${docIdLines}
      watch:
${watchLines}
      poll_interval_ms: 15000           # check every 15 seconds
      # include_resolved: false         # set true to include resolved comments

filters:
  # Batch rapid edits from the same author into one event
  - type: dedup
    window_seconds: 30
    key_fields:
      - payload.doc_id
      - payload.type
      - payload.author

  # Aggregate changes within a 60-second window
  - type: windowed-aggregation
    window_seconds: 60

  - type: rate-limiter
    max_events_per_minute: 10

agent:
  runtime: direct-llm
  model: ${model}
  system_prompt: |
    You are a document collaboration assistant monitoring Google Docs.

    When you receive events, analyze them and respond concisely:

    - **Comments**: Summarize the comment and suggest a response.
      If it's a question, answer it based on the context provided.
    - **Suggestions**: Evaluate the suggested edit (e.g. Replace "X" → "Y")
      and recommend whether to accept or reject it with a brief reason.
    - **Edits**: Summarize what changed and flag anything that might need
      review (e.g., deleted sections, restructured content).

    Keep responses to 2-3 sentences. Be helpful and actionable.
  token_budget:
    max_per_hour: 50000
    max_per_event: 4000

behavior:
  on_llm_unreachable: buffer_limited

dashboard:
  enabled: true
`;
}

function envExample(model: string, runtime?: string, allAgents?: AgentDef[]): string {
  // Multi-agent: collect all needed keys
  if (allAgents && allAgents.length > 1) {
    const lines: string[] = [];
    const needsAnthropic = allAgents.some((a) => a.model.startsWith('anthropic/'));
    const needsOpenai = allAgents.some((a) => a.model.startsWith('openai/'));
    const hasOllama = allAgents.some((a) => a.model.startsWith('ollama/'));
    const hasFramework = allAgents.some((a) => a.runtime !== 'direct-llm');

    if (needsAnthropic) lines.push('ANTHROPIC_API_KEY=');
    if (needsOpenai) lines.push('OPENAI_API_KEY=');
    if (hasOllama) lines.push('# Ollama runs locally — make sure ollama is running: ollama serve');
    if (hasFramework) lines.push('# Agent framework runtimes handle their own LLM access.');
    if (lines.length === 0) lines.push('# No API keys required.');
    return lines.join('\n') + '\n';
  }

  // Single-agent
  if (runtime === 'openclaw' || runtime === 'langgraph' || runtime === 'crewai') {
    return '# No API key required — the agent framework handles LLM access.\n';
  }
  if (model.startsWith('anthropic/')) return 'ANTHROPIC_API_KEY=\n';
  if (model.startsWith('openai/')) return 'OPENAI_API_KEY=\n';
  // ollama — no key needed
  return '# Ollama runs locally — no API key required.\n# Make sure ollama is running: ollama serve\n';
}

function startInstructions(source: string, projectName: string, model: string): string {
  const lines: string[] = [
    '',
    `Done! To get started:`,
    '',
    `  cd ${projectName}`,
    `  npm install`,
  ];

  if (model && !model.startsWith('ollama/')) {
    lines.push(`  cp .env.example .env  # add your API key`);
  }

  if (source === 'google-docs') {
    lines.push(
      '',
      '  # Google Docs setup:',
      '  #   1. Place your service account JSON key file in the project',
      '  #   2. Share your Google Doc(s) with the service account email',
      '  #      (use "Commenter" access so comments can be read)',
      '  #   3. Replace YOUR_DOC_ID_HERE in tunnlo.yaml with your doc ID',
      '  #      (from the URL: docs.google.com/document/d/{DOC_ID}/edit)',
    );
  } else if (source === 'tshark') {
    lines.push(
      '',
      '  # tshark must be installed:',
      '  #   macOS:  brew install wireshark',
      '  #   Ubuntu: sudo apt install tshark',
    );
  } else if (source === 'kafka') {
    lines.push(
      '',
      '  # Make sure your Kafka cluster is running and accessible.',
      '  # For local development, try: docker run -d --name kafka \\',
      '  #   -p 9092:9092 apache/kafka:latest',
    );
  }

  lines.push(`  npm start`, '');
  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  let projectName = process.argv[2];

  if (!projectName) {
    projectName = await ask('Project name: ');
    if (!projectName) {
      console.error('Error: project name is required.');
      process.exit(1);
    }
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(projectName)) {
    console.error('Error: project name must only contain letters, numbers, hyphens, and underscores.');
    process.exit(1);
  }

  const projectDir = join(process.cwd(), projectName);
  console.log(`\nCreating Tunnlo project: ${projectName}\n`);

  // ── Prompts ──

  const source = await choose('What data source will you use?', [
    { label: 'Standard input (stdin) — pipe data in manually', value: 'stdin' },
    { label: 'Wireshark / tshark — monitor live network traffic', value: 'tshark' },
    { label: 'Log file — tail a log file on disk', value: 'log' },
    { label: 'MCP Bridge — receive events from an MCP server', value: 'mcp-bridge' },
    { label: 'Kafka — consume messages from a Kafka topic', value: 'kafka' },
    { label: 'Google Docs — monitor comments, suggestions & edits', value: 'google-docs' },
  ]);

  let iface = 'en0';
  let captureFilter = '';
  let logPath = '/var/log/syslog';
  let mcpServerUrl = 'http://localhost:3001';
  let kafkaBrokers = 'localhost:9092';
  let kafkaTopic = 'events';
  let kafkaGroupId = 'tunnlo-adapter';
  let gdocsCredentials = './service-account.json';
  let gdocsDocIds: string[] = [];
  let gdocsWatch: string[] = [];

  if (source === 'google-docs') {
    console.log('\n  Google Docs Setup');
    console.log('  You need a Google Cloud service account with Docs & Drive APIs enabled.');
    console.log('  Download the JSON key file and share your doc(s) with the service account email.\n');
    gdocsCredentials = await ask('  Path to service account JSON [./service-account.json]: ') || './service-account.json';
    const docIdsInput = await ask('  Document ID(s) — comma-separated, from the URL after /d/ : ');
    gdocsDocIds = docIdsInput
      ? docIdsInput.split(',').map((id) => id.trim()).filter(Boolean)
      : ['YOUR_DOC_ID_HERE'];
    if (gdocsDocIds.length === 0) gdocsDocIds = ['YOUR_DOC_ID_HERE'];

    const watchChoice = await choose('  What do you want to monitor?', [
      { label: 'Comments and suggestions (recommended)', value: 'comments,suggestions' },
      { label: 'Everything — comments, suggestions, and edits', value: 'comments,suggestions,edits' },
      { label: 'Comments only', value: 'comments' },
      { label: 'Suggestions only', value: 'suggestions' },
    ]);
    gdocsWatch = watchChoice.split(',');
  } else if (source === 'tshark') {
    iface = await ask('  Network interface (e.g. en0, eth0) [en0]: ') || 'en0';
    captureFilter = await ask('  Capture filter — leave blank for all traffic (e.g. tcp, "tcp port 443") [none]: ');
  } else if (source === 'log') {
    logPath = await ask('  Path to log file [/var/log/syslog]: ') || '/var/log/syslog';
  } else if (source === 'mcp-bridge') {
    mcpServerUrl = await ask('  MCP server URL [http://localhost:3001]: ') || 'http://localhost:3001';
  } else if (source === 'kafka') {
    kafkaBrokers = await ask('  Broker addresses (comma-separated) [localhost:9092]: ') || 'localhost:9092';
    kafkaTopic = await ask('  Topic to consume [events]: ') || 'events';
    kafkaGroupId = await ask('  Consumer group ID [tunnlo-adapter]: ') || 'tunnlo-adapter';
  }

  console.log('');

  const llmChoice = await choose('Which LLM / agent runtime will you use?', LLM_OPTIONS);
  const { model: firstModel, runtime: firstRuntime } = parseLlmChoice(llmChoice);
  const firstRuntimeConfig = await collectRuntimeConfig(firstRuntime);

  const agents: AgentDef[] = [{
    id: 'default',
    runtime: firstRuntime,
    model: firstModel,
    runtimeConfig: firstRuntimeConfig,
    system_prompt: defaultPromptForSource(source),
  }];

  // Collect source IDs for routing reference
  const sourceIds: string[] = [];
  if (source === 'stdin') sourceIds.push('stdin-input');
  else if (source === 'tshark') sourceIds.push('network-traffic');
  else if (source === 'log') sourceIds.push('log-file');
  else if (source === 'mcp-bridge') sourceIds.push('mcp-source');
  else if (source === 'kafka') sourceIds.push('kafka-source');
  else if (source === 'google-docs') sourceIds.push('google-docs');

  console.log('');
  const wantMulti = await ask('Would you like to add more agents? (e.g., compare LLMs or route sources to different agents) [y/N]: ');

  if (wantMulti.toLowerCase() === 'y' || wantMulti.toLowerCase() === 'yes') {
    // Rename first agent
    const firstName = await ask(`  Name for agent 1 [${agents[0].id}]: `) || agents[0].id;
    agents[0].id = firstName;

    // Ask about source routing for agent 1
    if (sourceIds.length > 0) {
      console.log(`  Available sources: ${sourceIds.join(', ')}`);
      const firstSources = await ask(`  Route agent "${firstName}" to specific sources? (comma-separated, or blank for all): `);
      if (firstSources.trim()) {
        agents[0].sources = firstSources.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    let addMore = true;
    let agentNum = 2;
    while (addMore) {
      console.log(`\n  Agent ${agentNum}:`);
      const nextLlm = await choose('  Which LLM / agent runtime?', LLM_OPTIONS);
      const { model: nextModel, runtime: nextRuntime } = parseLlmChoice(nextLlm);
      const nextRuntimeConfig = await collectRuntimeConfig(nextRuntime);

      const nextId = await ask(`  Agent name [agent-${agentNum}]: `) || `agent-${agentNum}`;

      let nextSources: string[] | undefined;
      if (sourceIds.length > 0) {
        console.log(`  Available sources: ${sourceIds.join(', ')}`);
        const srcInput = await ask(`  Route agent "${nextId}" to specific sources? (comma-separated, or blank for all): `);
        if (srcInput.trim()) {
          nextSources = srcInput.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }

      agents.push({
        id: nextId,
        runtime: nextRuntime,
        model: nextModel,
        runtimeConfig: nextRuntimeConfig,
        sources: nextSources,
        system_prompt: defaultPromptForSource(source),
      });

      agentNum++;
      const more = await ask('\n  Add another agent? [y/N]: ');
      addMore = more.toLowerCase() === 'y' || more.toLowerCase() === 'yes';
    }
  }

  // Determine primary model for env example
  const model = firstModel;
  const runtime = firstRuntime;

  rl.close();

  // ── Generate config ──

  let tunnloYaml: string;
  if (source === 'google-docs') {
    tunnloYaml = googleDocsConfig(model, gdocsCredentials, gdocsDocIds, gdocsWatch);
  } else if (source === 'tshark') {
    tunnloYaml = tsharkConfig(model, iface, captureFilter);
  } else if (source === 'log') {
    tunnloYaml = logConfig(model, logPath);
  } else if (source === 'mcp-bridge') {
    tunnloYaml = mcpBridgeConfig(model, mcpServerUrl);
  } else if (source === 'kafka') {
    tunnloYaml = kafkaConfig(model, kafkaBrokers, kafkaTopic, kafkaGroupId);
  } else {
    tunnloYaml = stdinConfig(model);
  }

  // Replace the agent section with generated single/multi-agent YAML
  const agentsYaml = generateAgentsYaml(agents);
  tunnloYaml = tunnloYaml.replace(/agent:\n  runtime: direct-llm\n  model: [^\n]*\n  system_prompt:[\s\S]*?(?=\nbehavior:)/, agentsYaml + '\n');

  // Enable dashboard for multi-agent setups (per-agent response panels)
  if (agents.length > 1 && !tunnloYaml.includes('dashboard:')) {
    tunnloYaml += '\ndashboard:\n  enabled: true\n';
  }

  // ── Scaffold files ──

  await mkdir(projectDir, { recursive: true });

  const deps: Record<string, string> = {
    '@tunnlo/cli': '^0.1.0',
    '@tunnlo/core': '^0.1.0',
    '@tunnlo/adapters': '^0.1.0',
    '@tunnlo/filters': '^0.1.0',
    '@tunnlo/bridge-llm': '^0.1.0',
    '@tunnlo/actions': '^0.1.0',
  };

  if (source === 'kafka') {
    deps['kafkajs'] = '^2.2.4';
  }
  if (source === 'google-docs') {
    deps['googleapis'] = '^140.0.0';
  }

  const pkg = {
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      start: 'tunnlo start tunnlo.yaml',
      validate: 'tunnlo validate tunnlo.yaml',
    },
    dependencies: deps,
  };

  await writeFile(join(projectDir, 'package.json'), JSON.stringify(pkg, null, 2));
  await writeFile(join(projectDir, 'tunnlo.yaml'), tunnloYaml);
  await writeFile(join(projectDir, '.gitignore'), 'node_modules/\n.env\n.env.*\n');
  await writeFile(join(projectDir, '.env.example'), envExample(model, runtime, agents));

  console.log(startInstructions(source, projectName, model));
}

main().catch((err) => {
  rl.close();
  console.error('Error:', err.message);
  process.exit(1);
});
