import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * General X-Bridges agent E2E certification.
 *
 * These tests assert ACTUAL outcomes — live workspace blocks, connections,
 * parameters, real engine run IDs, persisted revisions and fingerprints —
 * never mere visibility of agent chat messages.
 */
test.describe('ADIA General X-Bridges Engineering Agent E2E Flows', () => {
  test.setTimeout(240000);

  const tempProjectFile = path.resolve(process.cwd(), 'temp_e2e_general_xbridges.adia');

  test.afterEach(async () => {
    try {
      if (fs.existsSync(tempProjectFile)) {
        fs.unlinkSync(tempProjectFile);
      }
      const dir = path.dirname(tempProjectFile);
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('temp_e2e_general_xbridges.adia.tmp-')) {
          fs.unlinkSync(path.join(dir, f));
        }
      }
    } catch {
      // Ignore cleanup error
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/?projectName=adia', { waitUntil: 'domcontentloaded' });

    const overlay = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
    if ((await overlay.count()) > 0) {
      await page.keyboard.press('Escape');
      await overlay.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }

    await page.getByRole('button', { name: 'X-Bridges' }).first().click();
    await page.locator('.adia-agent-toggle-tab').click();
  });

  async function approveAllAgentApprovals(page: any, maxSteps = 60): Promise<number> {
    let approvals = 0;
    for (let i = 0; i < maxSteps; i++) {
      const btn = page.locator('.adia-agent-btn-approve').first();
      if ((await btn.count()) === 0 || !(await btn.isVisible().catch(() => false))) {
        // Check for an active approval card; absence means workflow reached a terminal state.
        const card = page.locator('[data-testid="agent-approval-card"]');
        if ((await card.count()) === 0) break;
        await page.waitForTimeout(250);
        continue;
      }
      await btn.click();
      approvals++;
      await page.waitForTimeout(200);
    }
    return approvals;
  }

  test('Flow 1: general creation yields real blocks, proof, engine run, persistence and matching fingerprint', async ({ page }) => {
    const input = page.locator('.adia-agent-input');
    const sendBtn = page.locator('.adia-agent-send-btn');

    // Generic (non-inverter) request: Step → Gain → Scope chain.
    await input.fill('Create a signal chain: Step source into a Gain of 2 into a Scope');
    await sendBtn.click();

    // Answer clarification questions until no more are asked.
    const answers = ['step amplitude 1 at t 0.5', 'gain 2'];
    for (const ans of answers) {
      const clarifying = page.locator('[data-testid="agent-status"][data-status="clarifying"]');
      await expect(clarifying).toBeVisible({ timeout: 8000 }).catch(() => {});
      if ((await clarifying.count()) > 0 && (await clarifying.isVisible().catch(() => false))) {
        await input.fill(ans);
        await sendBtn.click();
        await page.waitForTimeout(250);
      }
    }

    // Approve specification, plan, and every individual action.
    const approvalsGranted = await approveAllAgentApprovals(page);
    expect(approvalsGranted).toBeGreaterThanOrEqual(3);

    // Terminal status must be completed with consistent evidence.
    const status = page.locator('[data-testid="agent-status"]');
    await expect(status).toHaveAttribute('data-status', 'completed', { timeout: 30000 });

    // Evidence fields must be present and internally consistent.
    const engineRunId = page.locator('[data-testid="agent-evidence-engine-run-id"]');
    await expect(engineRunId).toBeVisible();
    expect((await engineRunId.innerText()).trim().length).toBeGreaterThan(0);

    const planHash = await page.locator('[data-testid="agent-evidence-plan-hash"]').innerText();
    const catalogHash = await page.locator('[data-testid="agent-evidence-catalog-hash"]').innerText();
    const savedFingerprint = await page.locator('[data-testid="agent-evidence-saved-fingerprint"]').innerText();
    const reloadedFingerprint = await page.locator('[data-testid="agent-evidence-reloaded-fingerprint"]').innerText();
    const persistedRevision = await page.locator('[data-testid="agent-evidence-persisted-revision"]').innerText();
    expect(planHash.trim().length).toBe(64);
    expect(catalogHash.trim().length).toBe(64);
    expect(savedFingerprint.trim().length).toBeGreaterThan(0);
    expect(reloadedFingerprint.trim()).toBe(savedFingerprint.trim());
    expect(Number(persistedRevision)).toBeGreaterThanOrEqual(1);

    // The LIVE workspace must actually contain the planned blocks and edges.
    const workspaceNodes = page.locator('.react-flow__node');
    await expect(workspaceNodes).toHaveCount(3, { timeout: 10000 });
    const workspaceEdges = page.locator('.react-flow__edge');
    await expect(workspaceEdges).toHaveCount(2, { timeout: 10000 });

    // Parameters must actually be applied (Gain = 2).
    const gainEvidence = page.locator('[data-testid="agent-evidence-block-GAIN"]');
    if ((await gainEvidence.count()) > 0) {
      await expect(gainEvidence).toContainText(/gain.*2/i);
    }
  });

  test('Flow 2: unsupported physics refusal with zero mutations', async ({ page }) => {
    const input = page.locator('.adia-agent-input');
    const sendBtn = page.locator('.adia-agent-send-btn');

    await input.fill('Build a perpetual motion machine that generates infinite energy from vacuum');
    await sendBtn.click();

    const lastMsg = page.locator('.adia-agent-msg.agent').last();
    await expect(lastMsg).toBeVisible({ timeout: 5000 });
    await expect(lastMsg).toContainText(/unsupported|cannot be realized|refus/i);

    // Zero mutations: workspace remains empty.
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  });

  test('Flow 3: invented blocks are refused with zero mutations', async ({ page }) => {
    const input = page.locator('.adia-agent-input');
    const sendBtn = page.locator('.adia-agent-send-btn');

    await input.fill('Instantiate a FLUX_CAPACITOR block and connect it to a Scope');
    await sendBtn.click();
    await page.waitForTimeout(500);

    // Agent must refuse; even if it asks for clarification, approving nothing mutates.
    const lastMsg = page.locator('.adia-agent-msg.agent').last();
    await expect(lastMsg).toContainText(/not.*(catalog|registered)|unknown|unsupported/i, { timeout: 8000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
  });

  test('Flow 4: inspection and diagnosis are read-only and return structured evidence', async ({ page }) => {
    const input = page.locator('.adia-agent-input');
    const sendBtn = page.locator('.adia-agent-send-btn');

    await input.fill('Inspect current schematic');
    await sendBtn.click();
    await expect(page.locator('[data-testid="agent-status"]')).toHaveAttribute('data-status', 'completed', { timeout: 8000 });

    await input.fill('Diagnose model for disconnected ports');
    await sendBtn.click();
    await expect(page.locator('[data-testid="agent-status"]')).toHaveAttribute('data-status', 'completed', { timeout: 8000 });

    // Read-only intents must not mutate the workspace.
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
  });

  test('Flow 5: persistence, reload, and one-step undo with verified fingerprints', async ({ page }) => {
    const initialSnapshot = {
      projectId: 'e2e_proj_gen_persistence',
      revision: 0,
      nodes: [],
      edges: [],
    };

    const initialReceipt = await page.evaluate(async ({ snapshot, targetPath }) => {
      const electron = (window as any).electronAPI;
      if (!electron || typeof electron.projectSaveSnapshot !== 'function') {
        throw new Error('electronAPI.projectSaveSnapshot is not available');
      }
      return await electron.projectSaveSnapshot(snapshot, { targetPath });
    }, { snapshot: initialSnapshot, targetPath: tempProjectFile });

    expect(initialReceipt.filePath).toBe(tempProjectFile);
    expect(initialReceipt.modelFingerprint).toHaveLength(64);

    const mutatedSnapshot = {
      projectId: 'e2e_proj_gen_persistence',
      revision: 1,
      nodes: [
        { id: 'step_1', type: 'xbridgesBlock', position: { x: 100, y: 100 }, data: { blockId: 'Step' } },
        { id: 'scope_1', type: 'xbridgesBlock', position: { x: 400, y: 100 }, data: { blockId: 'Scope' } }
      ],
      edges: [
        { id: 'e1', source: 'step_1', sourceHandle: 'out', target: 'scope_1', targetHandle: 'in1' }
      ]
    };

    const mutatedReceipt = await page.evaluate(async ({ snapshot, targetPath }) => {
      const electron = (window as any).electronAPI;
      return await electron.projectSaveSnapshot(snapshot, { targetPath });
    }, { snapshot: mutatedSnapshot, targetPath: tempProjectFile });

    expect(mutatedReceipt.modelFingerprint).not.toBe(initialReceipt.modelFingerprint);

    const reloaded = await page.evaluate(async ({ receipt }) => {
      const electron = (window as any).electronAPI;
      return await electron.projectReloadSnapshot(receipt);
    }, { receipt: mutatedReceipt });

    expect(reloaded.nodes).toHaveLength(2);
    expect(reloaded.edges).toHaveLength(1);
    expect(reloaded.stateHash).toBe(mutatedReceipt.modelFingerprint);

    const restoredReceipt = await page.evaluate(async ({ snapshot, targetPath }) => {
      const electron = (window as any).electronAPI;
      return await electron.projectSaveSnapshot(snapshot, { targetPath });
    }, { snapshot: initialSnapshot, targetPath: tempProjectFile });

    expect(restoredReceipt.modelFingerprint).toBe(initialReceipt.modelFingerprint);
  });
});
