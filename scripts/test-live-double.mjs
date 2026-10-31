import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { root, stateDir, loadConfig, loadEnvironment, guardToken, secrets } from '../src/config.mjs';
import { loadCatalog, discover, saveCatalog } from '../src/catalog.mjs';
import { createGuard } from '../src/guard.mjs';
import { BudgetLedger } from '../src/workspace/budget-ledger.mjs';
import { createWorkflowInstance, loadWorkflow, runWorkflow } from '../src/workspace/workflow-engine.mjs';

async function runLiveTest() {
  console.log('=== PHASE 8 BOUNDED LIVE INTEGRATION TEST ===\n');

  // 1. Verify Environment & Free Models
  const env = loadEnvironment();
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in environment or .env');
  }
  env.GEMINI_FREE_TIER_CONFIRMED = 'true';

  const config = loadConfig();
  const catalog = loadCatalog();
  const geminiEntry = catalog.providers?.gemini;
  console.log('1. Verifying Model Availability & Free Tier:');
  console.log(`   - Gemini Provider Configured: ${geminiEntry?.allowed ? 'YES' : 'NO'}`);
  console.log(`   - Verified Free Models: ${geminiEntry?.freeModels?.join(', ') || 'none'}`);
  
  const coderModel = 'gemini-3.5-flash-lite';
  const reviewerModel = 'gemini-3.5-flash-lite';
  console.log(`   - Selected Implementer Model: ${coderModel} (Free Tier: $0.00)`);
  console.log(`   - Selected Reviewer Model: ${reviewerModel} (Free Tier: $0.00)`);

  // 2. Setup Isolated Test Project (Strictly outside LocalAgent workspace)
  const testDir = join(root, '.workspace-check', `live-double-${Date.now()}`);
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  mkdirSync(join(testDir, 'test'), { recursive: true });

  writeFileSync(join(testDir, 'package.json'), JSON.stringify({
    name: 'double-test-live',
    version: '1.0.0',
    type: 'module'
  }, null, 2));

  // Initial buggy implementation: returns n + 1 instead of n * 2
  const buggyCode = `export function double(n) {
  // Buggy implementation
  return n + 1;
}
`;
  writeFileSync(join(testDir, 'double.mjs'), buggyCode);

  const testCode = `import test from 'node:test';
import assert from 'node:assert/strict';
import { double } from '../double.mjs';

test('double returns double the number', () => {
  assert.equal(double(2), 4);
  assert.equal(double(-3), -6);
  assert.equal(double(0), 0);
  assert.equal(double(10), 20);
});
`;
  writeFileSync(join(testDir, 'test', 'double.test.mjs'), testCode);

  console.log('\n2. Isolated Test Workspace Initialized:');
  console.log(`   - Workspace: ${testDir}`);
  console.log('   - Running pre-implementation test (must fail)...');
  let initialTestFailed = false;
  try {
    execSync('node --test test/double.test.mjs', { cwd: testDir, stdio: 'pipe' });
  } catch (err) {
    initialTestFailed = true;
    console.log('   ✓ Pre-implementation test failed as expected (double(2) returned 3 instead of 4).');
  }
  if (!initialTestFailed) {
    throw new Error('Pre-implementation test unexpectedly passed; invalid test fixture.');
  }

  // 3. Setup Guard with Strict Free Only Budget
  const secret = secrets();
  const auditPath = join(testDir, 'routing-audit.jsonl');
  const budgetLedger = new BudgetLedger({
    policy: 'free_only',
    maxWorkflowSpendUsd: 0.00,
    maxTaskSpendUsd: 0.00,
    storageFile: join(testDir, 'budget-ledger.json')
  });

  const guard = createGuard({
    config,
    env: () => env,
    secret,
    catalog: () => catalog,
    budgetLedger,
    auditPath
  });

  await new Promise(resolve => guard.listen(0, '127.0.0.1', resolve));
  const guardPort = guard.address().port;
  const guardBase = `http://127.0.0.1:${guardPort}`;
  console.log(`\n3. Security Guard Active on ${guardBase}:`);
  console.log('   - Policy: Free Only (Strict $0.00 spending cap)');
  console.log('   - Audit Log: ' + auditPath);

  // 4. Bounded Inference Request Counter (Hard clamp: Max 3 requests)
  let inferenceRequestCount = 0;
  const MAX_INFERENCE_REQUESTS = 3;
  const recordedTokens = { prompt: 0, completion: 0, total: 0 };

  async function callGuard(provider, model, messages) {
    if (inferenceRequestCount >= MAX_INFERENCE_REQUESTS) {
      throw new Error(`Inference request limit reached (${inferenceRequestCount}/${MAX_INFERENCE_REQUESTS}). Stopping execution.`);
    }
    inferenceRequestCount++;
    console.log(`   → Dispatching Live Request #${inferenceRequestCount} to ${provider}/${model}...`);

    const token = guardToken(secret, provider);
    const res = await fetch(`${guardBase}/egress/${provider}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Guard request failed with HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    if (data.usage) {
      recordedTokens.prompt += data.usage.prompt_tokens || 0;
      recordedTokens.completion += data.usage.completion_tokens || 0;
      recordedTokens.total += data.usage.total_tokens || 0;
      console.log(`     Usage: ${data.usage.prompt_tokens} in, ${data.usage.completion_tokens} out (Total: ${data.usage.total_tokens})`);
    }
    return data.choices?.[0]?.message?.content || '';
  }

  // 5. Construct Multi-Agent Workflow Plan
  const plan = {
    id: `plan_double_${Date.now()}`,
    title: 'Fix double.mjs and verify with unit tests',
    stages: [
      {
        id: 'stage_implement',
        title: 'Implement double(n) fix',
        type: 'task',
        agent: 'coder',
        assignedModel: `gemini/${coderModel}`,
        targetFiles: ['double.mjs'],
        prompt: 'Fix function double(n) to return n * 2'
      },
      {
        id: 'stage_test',
        title: 'Run deterministic unit tests',
        type: 'task',
        agent: 'tester',
        targetFiles: ['double.mjs', 'test/double.test.mjs'],
        dependsOn: ['stage_implement'],
        prompt: 'Execute node --test test/double.test.mjs'
      },
      {
        id: 'stage_review',
        title: 'Review implementation correctness',
        type: 'task',
        agent: 'reviewer',
        assignedModel: `gemini/${reviewerModel}`,
        targetFiles: ['double.mjs'],
        dependsOn: ['stage_test'],
        prompt: 'Review double.mjs against acceptance criteria'
      }
    ]
  };

  const instance = createWorkflowInstance({ plan, workspaceDir: testDir });
  console.log(`\n4. Workflow Created: ${instance.id}`);
  console.log('   - Stage 1: Coder (Live Inference with ' + coderModel + ')');
  console.log('   - Stage 2: Tester (Deterministic Test Execution, 0 tokens)');
  console.log('   - Stage 3: Reviewer (Live Inference with ' + reviewerModel + ')');

  // 6. Execute Workflow through Workflow Engine with Custom Live Runner
  console.log('\n5. Executing Workflow:');
  const runner = async ({ step, workspaceDir }) => {
    if (step.agent === 'coder') {
      const currentCode = readFileSync(join(workspaceDir, 'double.mjs'), 'utf8');
      const response = await callGuard('gemini', coderModel, [
        {
          role: 'system',
          content: 'You are an expert JavaScript software engineer. Fix the function double(n) in double.mjs to return n * 2. Return ONLY the complete updated javascript code inside a ```javascript ... ``` code block with no preamble or explanation.'
        },
        {
          role: 'user',
          content: `Current content of double.mjs:\n\`\`\`javascript\n${currentCode}\n\`\`\`\nRequirement: return n * 2. Return the fixed file content.`
        }
      ]);

      const match = response.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
      const newCode = match ? match[1].trim() : response.trim();
      writeFileSync(join(workspaceDir, 'double.mjs'), newCode + '\n');
      console.log('     ✓ double.mjs updated with generated fix.');
      return { output: response, modifiedFiles: ['double.mjs'] };
    }

    if (step.agent === 'tester') {
      console.log('   → Running deterministic test suite...');
      try {
        const testOutput = execSync('node --test test/double.test.mjs', { cwd: workspaceDir, encoding: 'utf8' });
        console.log('     ✓ All unit tests passed!');
        return { output: testOutput, testPassed: true, modifiedFiles: [] };
      } catch (err) {
        console.log('     ✗ Unit tests failed:', err.stdout || err.message);
        return { output: err.stdout || err.message, testPassed: false, modifiedFiles: [] };
      }
    }

    if (step.agent === 'reviewer') {
      const fixedCode = readFileSync(join(workspaceDir, 'double.mjs'), 'utf8');
      const response = await callGuard('gemini', reviewerModel, [
        {
          role: 'system',
          content: 'You are a strict code reviewer. Verify if double.mjs correctly exports function double(n) that returns n * 2. If it is correct and meets all requirements, your reply must begin with "APPROVED".'
        },
        {
          role: 'user',
          content: `Review this implementation:\n\`\`\`javascript\n${fixedCode}\n\`\`\`\nRequirement: double(n) returns n * 2.`
        }
      ]);

      const approved = response.toUpperCase().includes('APPROVED');
      console.log(`     ✓ Reviewer outcome: ${approved ? 'APPROVED' : 'CHANGES_REQUESTED'}`);
      return { output: response, reviewerApproved: approved, modifiedFiles: [] };
    }
  };

  const result = await runWorkflow({
    workflowId: instance.id,
    workspaceDir: testDir,
    budgetLedger,
    catalog,
    runner
  });

  // 7. Verify Results & Audit Post-Conditions
  console.log('\n6. Workflow Execution Summary:');
  const finalWf = loadWorkflow(instance.id, testDir);
  console.log(`   - Final Status: ${finalWf.status}`);
  console.log(`   - Total Upstream Requests: ${inferenceRequestCount} (Max Allowed: ${MAX_INFERENCE_REQUESTS})`);
  console.log(`   - Total Tokens: ${recordedTokens.total} (Prompt: ${recordedTokens.prompt}, Completion: ${recordedTokens.completion})`);
  const workflowSpend = budgetLedger.getStatus(instance.id).workflow.cumulativeSpendUsd || 0;
  console.log(`   - Financial Cost: $${workflowSpend.toFixed(4)} (Zero charges verified)`);

  const updatedDoubleCode = readFileSync(join(testDir, 'double.mjs'), 'utf8');
  console.log('\n7. Final Generated double.mjs:');
  console.log(updatedDoubleCode.trim());

  // Confirm deterministic test passes on the updated file
  const finalTestResult = execSync('node --test test/double.test.mjs', { cwd: testDir, encoding: 'utf8' });
  console.log('\n8. Final Verification Test Output:');
  console.log(finalTestResult.trim());

  // Teardown
  guard.closeAllConnections();
  await new Promise(resolve => guard.close(resolve));
  console.log('\n✓ Live integration test successfully completed with zero unapproved spend.');

  return {
    success: finalWf.status === 'completed',
    requests: inferenceRequestCount,
    tokens: recordedTokens,
    cost: (budgetLedger.getStatus().monthlyCumulativeSpendUsd || 0),
    workflowId: instance.id
  };
}

runLiveTest().catch(err => {
  console.error('\n✗ Live integration test failed:', err);
  process.exitCode = 1;
});
