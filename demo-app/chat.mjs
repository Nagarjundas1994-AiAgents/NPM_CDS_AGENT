/**
 * cds-agents Demo — Interactive CLI Chat
 *
 * Start the CAP app first:
 *   cd demo-app && cds watch
 *
 * Then in another terminal:
 *   node chat.mjs
 *
 * Example prompts:
 *   "List all students with GPA below 2.0"
 *   "Create a new course called Machine Learning with code ML101, 4 credits, CS department"
 *   "Put all students with GPA below 2.0 on academic probation"
 *   "Show enrollment statistics"
 *   "Enroll Alice Johnson in Database Systems for Spring 2024"
 */

import { CAPAgent } from 'cds-agents';
import * as readline from 'node:readline';

// ─── Configuration ──────────────────────────────────────────────────────────
// Set your preferred model and API key via environment variables:
//   OPENAI_API_KEY=sk-... node chat.mjs
//   ANTHROPIC_API_KEY=sk-... MODEL=claude-sonnet-4-5 node chat.mjs
//   GOOGLE_API_KEY=... MODEL=gemini-2.0-flash node chat.mjs

const model = process.env.MODEL || 'gpt-4o';

const agent = new CAPAgent({
  service: 'StudentService',
  baseUrl: process.env.CAP_URL || 'http://localhost:4004',
  model,
  tools: 'auto',
  auth: { type: 'none' },
  dryRun: process.env.DRY_RUN === 'true',
});

// ─── Interactive REPL ───────────────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('╔══════════════════════════════════════════════════╗');
console.log('║         🎓 University AI Assistant               ║');
console.log('║    Powered by cds-agents + ' + model.padEnd(21) + '  ║');
console.log('╠══════════════════════════════════════════════════╣');
console.log('║  Ask me anything about students, courses,        ║');
console.log('║  enrollments — or run service actions!            ║');
console.log('║  Type "exit" to quit.                            ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');

async function prompt() {
  rl.question('You: ', async (input) => {
    const trimmed = input.trim();
    if (!trimmed || trimmed.toLowerCase() === 'exit') {
      console.log('\n👋 Goodbye!');
      rl.close();
      return;
    }

    try {
      console.log('\n🤖 Thinking...\n');
      const response = await agent.invoke(trimmed);
      console.log(`Assistant: ${response}\n`);
    } catch (error) {
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    }

    prompt();
  });
}

prompt();
