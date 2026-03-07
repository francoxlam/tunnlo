#!/usr/bin/env node
import { mkdir, writeFile, readFile, readdir, stat, cp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const projectName = process.argv[2];

  if (!projectName) {
    console.log('Usage: npm create tunnlo <project-name>');
    console.log('');
    console.log('Creates a new Tunnlo project with example configuration.');
    process.exit(1);
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(projectName)) {
    console.error('Error: project name must only contain letters, numbers, hyphens, and underscores.');
    process.exit(1);
  }

  const projectDir = join(process.cwd(), projectName);

  console.log(`Creating new Tunnlo project in ${projectDir}...`);

  await mkdir(projectDir, { recursive: true });

  // Write package.json
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

  // Write example config
  const config = `# Tunnlo Pipeline Configuration
# Docs: https://github.com/tunnlo/tunnlo

sources:
  - id: stdin-input
    adapter: native/stdin
    config: {}

filters:
  - type: rate-limiter
    max_events_per_minute: 30

  - type: dedup
    window_seconds: 10
    key_fields:
      - payload.data

agent:
  runtime: direct-llm
  model: anthropic/claude-sonnet-4-5
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

  await writeFile(join(projectDir, 'tunnlo.yaml'), config);

  // Write .gitignore
  await writeFile(join(projectDir, '.gitignore'), 'node_modules/\n.env\n.env.*\n');

  // Write .env.example
  await writeFile(
    join(projectDir, '.env.example'),
    '# Set your LLM API key\nANTHROPIC_API_KEY=\nOPENAI_API_KEY=\n',
  );

  console.log('');
  console.log(`Done! To get started:`);
  console.log('');
  console.log(`  cd ${projectName}`);
  console.log(`  npm install`);
  console.log(`  cp .env.example .env  # add your API key`);
  console.log(`  echo "hello world" | npm start`);
  console.log('');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
