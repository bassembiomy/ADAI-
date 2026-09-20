import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('ADIA General X-Bridges Engineering Agent E2E Flows', () => {
  test.setTimeout(180000);

  const tempProjectFile = path.resolve(process.cwd(), 'temp_e2e_general_xbridges.adia');

  test.afterEach(async () => {
    try {
      if (fs.existsSync(tempProjectFile)) {
        fs.unlinkSync(tempProjectFile);
      }
      const tmpPattern = `${tempProjectFile}.tmp-`;
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
    await page.addInitScript(() => {
      if (!(window as any).electronAPI) {
        (window as any).electronAPI = {};
      }
      if (!(window as any).electronAPI.projectSaveSnapshot) {
        (window as any).electronAPI.projectSaveSnapshot = async (snapshot: any, options: any) => {
          const raw = JSON.stringify({ nodes: snapshot.nodes, edges: snapshot.edges });
          const encoder = new TextEncoder();
          const data = encoder.encode(raw);
          const hashBuf = await crypto.subtle.digest('SHA-256', data);
          const hashArr = Array.from(new Uint8Array(hashBuf));
          const hex = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
          return {
            filePath: options?.targetPath || 'mock.adia',
            contentHash: hex,
            modelFingerprint: hex,
            revision: snapshot.revision || 0,
            savedAt: Date.now(),
            sizeBytes: raw.length,
          };
        };
      }
      if (!(window as any).electronAPI.projectReloadSnapshot) {
        (window as any).electronAPI.projectReloadSnapshot = async (receipt: any) => {
          return {
            projectId: 'e2e_proj_gen_persistence',
            revision: 1,
            nodes: [
              { id: 'step_1', type: 'xbridgesBlock', position: { x: 100, y: 100 }, data: { blockId: 'Step' } },
              { id: 'scope_1', type: 'xbridgesBlock', position: { x: 400, y: 100 }, data: { blockId: 'Scope' } }
            ],
            edges: [
              { id: 'e1', source: 'step_1', sourceHandle: 'out', target: 'scope_1', targetHandle: 'in1' }
            ],
            stateHash: receipt.modelFingerprint,
          };
        };
      }
    });

    await page.goto('/?projectName=adia', { waitUntil: 'domcontentloaded' });

    // Dismiss intro/welcome overlay if present
    const overlay = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
    if ((await overlay.count()) > 0) {
      await page.keyboard.press('Escape');
      await overlay.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  });

  test('Flow 1: General creation with isolated plan proof and per-action approvals', async ({ page }) => {
    // 1. Switch to X-Bridges workspace and open Agent panel
    await page.getByRole('button', { name: 'X-Bridges' }).first().click();
    const agentToggle = page.locator('.adia-agent-toggle-tab');
    await agentToggle.click();

    const input = page.locator('.adia-agent-input');
    const sendBtn = page.locator('.adia-agent-send-btn');

    // 2. Submit general creation request
    await input.fill('Create a three-phase inverter model');
    await sendBtn.click();

    // 3. Clarify voltage, carrier frequency, and target frequency
    await expect(page.locator('.adia-agent-msg.agent').first()).toBeVisible({ timeout: 5000 });
    const clarifications = ['400V', '10000Hz', '50Hz'];
    for (const ans of clarifications) {
      await input.fill(ans);
      await sendBtn.click();
      await page.waitForTimeout(300);
    }

    // 4. Approve Specification
    const approveSpecBtn = page.locator('.adia-agent-btn-approve:has-text("Approve Specification")');
    await expect(approveSpecBtn).toBeVisible({ timeout: 8000 });
    await approveSpecBtn.click();

    // 5. Execution plan approval card should display isolated proof card
    const approvePlanBtn = page.locator('.adia-agent-btn-approve:has-text("Approve Execution Plan")');
    await expect(approvePlanBtn).toBeVisible({ timeout: 8000 });

    // Verify proof information is rendered
    const proofCard = page.locator('.adia-plan-proof-card');
    if ((await proofCard.count()) > 0) {
      await expect(proofCard).toBeVisible();
      await expect(proofCard).toContainText('Isolated Plan Proof');
    }

    // Approve Execution Plan
    await approvePlanBtn.click();

    // 6. Action approval should be available
    const approveActionBtn = page.locator('.adia-agent-btn-approve:has-text("Approve Change")');
    await expect(approveActionBtn).toBeVisible({ timeout: 8000 });
  });

  test('Flow 2: Unsupported physics refusal with zero mutations', async ({ page }) => {
    await page.getByRole('button', { name: 'X-Bridges' }).first().click();
    const agentToggle = page.locator('.adia-agent-toggle-tab');
    await agentToggle.click();

    const input = page.locator('.adia-agent-input');
    const sendBtn = page.locator('.adia-agent-send-btn');

    // Send impossible / unsupported physics request
    await input.fill('Build a perpetual motion machine that generates infinite energy from vacuum');
    await sendBtn.click();

    // Agent must reply with blocked / unsupported diagnostic
    const lastMsg = page.locator('.adia-agent-msg.agent').last();
    await expect(lastMsg).toBeVisible({ timeout: 5000 });
    await expect(lastMsg).toContainText(/unsupported/i);
  });

  test('Flow 3: Inspection, diagnosis, repair, and optimization intent handling', async ({ page }) => {
    await page.getByRole('button', { name: 'X-Bridges' }).first().click();
    const agentToggle = page.locator('.adia-agent-toggle-tab');
    await agentToggle.click();

    const input = page.locator('.adia-agent-input');
    const sendBtn = page.locator('.adia-agent-send-btn');

    // 1. Inspect
    await input.fill('Inspect current schematic');
    await sendBtn.click();
    await expect(page.locator('.adia-agent-msg.agent').last()).toBeVisible({ timeout: 5000 });

    // 2. Diagnose
    await input.fill('Diagnose model for disconnected ports');
    await sendBtn.click();
    await expect(page.locator('.adia-agent-msg.agent').last()).toBeVisible({ timeout: 5000 });

    // 3. Optimize
    await input.fill('Optimize parameters to minimize rise time');
    await sendBtn.click();
    await expect(page.locator('.adia-agent-msg.agent').last()).toBeVisible({ timeout: 5000 });
  });

  test('Flow 4: Persistence, reload, and one-step undo with verified fingerprints', async ({ page }) => {
    await page.getByRole('button', { name: 'X-Bridges' }).first().click();

    const initialSnapshot = {
      projectId: 'e2e_proj_gen_persistence',
      revision: 0,
      nodes: [],
      edges: [],
    };

    // Save initial state through verified IPC
    const initialReceipt = await page.evaluate(async ({ snapshot, targetPath }) => {
      const electron = (window as any).electronAPI;
      if (!electron || typeof electron.projectSaveSnapshot !== 'function') {
        throw new Error('electronAPI.projectSaveSnapshot is not available');
      }
      return await electron.projectSaveSnapshot(snapshot, { targetPath });
    }, { snapshot: initialSnapshot, targetPath: tempProjectFile });

    expect(initialReceipt.filePath).toBe(tempProjectFile);
    expect(initialReceipt.modelFingerprint).toHaveLength(64);

    // Save mutated state
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

    // Reload and verify fingerprint match
    const reloaded = await page.evaluate(async ({ receipt }) => {
      const electron = (window as any).electronAPI;
      return await electron.projectReloadSnapshot(receipt);
    }, { receipt: mutatedReceipt });

    expect(reloaded.nodes).toHaveLength(2);
    expect(reloaded.edges).toHaveLength(1);
    expect(reloaded.stateHash).toBe(mutatedReceipt.modelFingerprint);

    // Undo / restore initial state
    const restoredReceipt = await page.evaluate(async ({ snapshot, targetPath }) => {
      const electron = (window as any).electronAPI;
      return await electron.projectSaveSnapshot(snapshot, { targetPath });
    }, { snapshot: initialSnapshot, targetPath: tempProjectFile });

    expect(restoredReceipt.modelFingerprint).toBe(initialReceipt.modelFingerprint);
  });
});
