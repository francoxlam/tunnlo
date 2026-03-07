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

// ── Config generators ──────────────────────────────────────────────────────

function stdinConfig(model: string): string {
  return `# Tunnlo Pipeline Configuration
# Docs: https://tunnlo.dev

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
# Docs: https://tunnlo.dev
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
# Docs: https://tunnlo.dev

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

function envExample(model: string): string {
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

  if (!model.startsWith('ollama/')) {
    lines.push(`  cp .env.example .env  # add your API key`);
  }

  if (source === 'tshark') {
    lines.push(
      '',
      '  # tshark must be installed:',
      '  #   macOS:  brew install wireshark',
      '  #   Ubuntu: sudo apt install tshark',
    );
  }

  lines.push(`  npm start`, '');
  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const projectName = process.argv[2];

  if (!projectName) {
    console.log('Usage: npm create tunnlo <project-name>');
    process.exit(1);
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
  ]);

  let iface = 'en0';
  let captureFilter = '';
  let logPath = '/var/log/syslog';

  if (source === 'tshark') {
    iface = await ask('  Network interface (e.g. en0, eth0) [en0]: ') || 'en0';
    captureFilter = await ask('  Capture filter — leave blank for all traffic (e.g. tcp, "tcp port 443") [none]: ');
  } else if (source === 'log') {
    logPath = await ask('  Path to log file [/var/log/syslog]: ') || '/var/log/syslog';
  }

  console.log('');

  const model = await choose('Which LLM will you use?', [
    { label: 'Anthropic Claude (requires ANTHROPIC_API_KEY)', value: 'anthropic/claude-sonnet-4-5' },
    { label: 'OpenAI GPT-4o (requires OPENAI_API_KEY)', value: 'openai/gpt-4o' },
    { label: 'Ollama — local models, no API key needed', value: 'ollama/llama3.1:8b' },
  ]);

  rl.close();

  // ── Generate config ──

  let tunnloYaml: string;
  if (source === 'tshark') {
    tunnloYaml = tsharkConfig(model, iface, captureFilter);
  } else if (source === 'log') {
    tunnloYaml = logConfig(model, logPath);
  } else {
    tunnloYaml = stdinConfig(model);
  }

  // ── Scaffold files ──

  await mkdir(projectDir, { recursive: true });

  const pkg = {
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      start: 'tunnlo start tunnlo.yaml',
      validate: 'tunnlo validate tunnlo.yaml',
    },
    dependencies: {
      '@tunnlo/cli': '^0.1.0',
      '@tunnlo/core': '^0.1.0',
      '@tunnlo/adapters': '^0.1.0',
      '@tunnlo/filters': '^0.1.0',
      '@tunnlo/bridge-llm': '^0.1.0',
      '@tunnlo/actions': '^0.1.0',
    },
  };

  await writeFile(join(projectDir, 'package.json'), JSON.stringify(pkg, null, 2));
  await writeFile(join(projectDir, 'tunnlo.yaml'), tunnloYaml);
  await writeFile(join(projectDir, '.gitignore'), 'node_modules/\n.env\n.env.*\n');
  await writeFile(join(projectDir, '.env.example'), envExample(model));

  console.log(startInstructions(source, projectName, model));
}

main().catch((err) => {
  rl.close();
  console.error('Error:', err.message);
  process.exit(1);
});
