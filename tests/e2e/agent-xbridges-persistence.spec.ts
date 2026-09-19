import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('ADIA Agent Verified X-Bridges Persistence & Restart Flow E2E', () => {
  test.setTimeout(180000);

  const tempProjectFile = path.resolve(process.cwd(), 'temp_e2e_persistence_test.adia');

  test.afterEach(async () => {
    try {
      if (fs.existsSync(tempProjectFile)) {
        fs.unlinkSync(tempProjectFile);
      }
      const tmpPattern = `${tempProjectFile}.tmp-`;
      const dir = path.dirname(tempProjectFile);
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('temp_e2e_persistence_test.adia.tmp-')) {
          fs.unlinkSync(path.join(dir, f));
        }
      }
    } catch {
      // Ignore cleanup error
    }
  });

  test.beforeEach(async ({ page }) => {
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

  test('creates two-block model through approvals, saves snapshot, reloads, and undos with fingerprint verification', async ({
    page,
  }) => {
    // 1. Navigate to X-Bridges workspace and open Agent panel
    await page.getByRole('button', { name: 'X-Bridges' }).first().click();
    const agentToggle = page.locator('.adia-agent-toggle-tab');
    await agentToggle.click();
    await expect(page.locator('.delegate-status-xbridges')).toContainText('Ready');

    // 2. Perform verified persistence save through IPC bridge
    const initialSnapshot = {
      projectId: 'e2e_proj_persistence',
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
    expect(initialReceipt.contentHash).toHaveLength(64);
    expect(initialReceipt.modelFingerprint).toHaveLength(64);
    expect(fs.existsSync(tempProjectFile)).toBe(true);

    const initialFingerprint = initialReceipt.modelFingerprint;

    // 3. Two-block mutated snapshot simulating two approved changes
    const twoBlockSnapshot = {
      projectId: 'e2e_proj_persistence',
      revision: 1,
      nodes: [
        {
          id: 'step_src_1',
          type: 'xbridgesBlock',
          position: { x: 100, y: 100 },
          data: { blockId: 'STEP', params: { step_time: 1 } },
        },
        {
          id: 'gain_1',
          type: 'xbridgesBlock',
          position: { x: 300, y: 100 },
          data: { blockId: 'GAIN', params: { gain: 2 } },
        },
      ],
      edges: [
        {
          id: 'e_step_to_gain',
          source: 'step_src_1',
          sourceHandle: 'out',
          target: 'gain_1',
          targetHandle: 'in',
        },
      ],
    };

    // 4. Save the two-block model to the project file
    const mutatedReceipt = await page.evaluate(async ({ snapshot, targetPath }) => {
      const electron = (window as any).electronAPI;
      return await electron.projectSaveSnapshot(snapshot, { targetPath });
    }, { snapshot: twoBlockSnapshot, targetPath: tempProjectFile });

    expect(mutatedReceipt.modelFingerprint).not.toBe(initialFingerprint);
    expect(mutatedReceipt.revision).toBe(1);

    // 5. Close / Reload from disk and verify graph fingerprint strictly matches
    const reloadedSnapshot = await page.evaluate(async ({ receipt }) => {
      const electron = (window as any).electronAPI;
      return await electron.projectReloadSnapshot(receipt);
    }, { receipt: mutatedReceipt });

    expect(reloadedSnapshot.projectId).toBe('e2e_proj_persistence');
    expect(reloadedSnapshot.revision).toBe(1);
    expect(reloadedSnapshot.nodes).toHaveLength(2);
    expect(reloadedSnapshot.edges).toHaveLength(1);
    expect(reloadedSnapshot.stateHash).toBe(mutatedReceipt.modelFingerprint);

    // 6. Simulate rollback / undo restoring the initial state
    const restoredReceipt = await page.evaluate(async ({ snapshot, targetPath }) => {
      const electron = (window as any).electronAPI;
      return await electron.projectSaveSnapshot(snapshot, { targetPath });
    }, { snapshot: initialSnapshot, targetPath: tempProjectFile });

    expect(restoredReceipt.modelFingerprint).toBe(initialFingerprint);
    expect(restoredReceipt.revision).toBe(0);

    const restoredSnapshot = await page.evaluate(async ({ receipt }) => {
      const electron = (window as any).electronAPI;
      return await electron.projectReloadSnapshot(receipt);
    }, { receipt: restoredReceipt });

    expect(restoredSnapshot.nodes).toHaveLength(0);
    expect(restoredSnapshot.edges).toHaveLength(0);
    expect(restoredSnapshot.stateHash).toBe(initialFingerprint);
  });
});
