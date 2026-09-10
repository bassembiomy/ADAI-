import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LargeModelDiagnostics,
  loadStoredPerformanceLimits,
  saveStoredPerformanceLimits,
} from './LargeModelDiagnostics';

describe('LargeModelDiagnostics component & limits', () => {
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => { storageMap.set(key, value); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => { storageMap.clear(); },
  };

  beforeEach(() => {
    storageMap.clear();
    vi.stubGlobal('localStorage', mockLocalStorage);
  });

  it('loads default performance limits and persists updates to localStorage', () => {
    const defaults = loadStoredPerformanceLimits();
    expect(defaults.virtualizationThreshold).toBe(150);
    expect(defaults.performanceModeThreshold).toBe(500);
    expect(defaults.largeModelWarningThreshold).toBe(5000);
    expect(defaults.forcePerformanceMode).toBe(false);

    saveStoredPerformanceLimits({
      virtualizationThreshold: 200,
      performanceModeThreshold: 800,
      largeModelWarningThreshold: 10000,
      forcePerformanceMode: true,
    });

    const stored = loadStoredPerformanceLimits();
    expect(stored.virtualizationThreshold).toBe(200);
    expect(stored.performanceModeThreshold).toBe(800);
    expect(stored.largeModelWarningThreshold).toBe(10000);
    expect(stored.forcePerformanceMode).toBe(true);
  });

  it('renders entity counts, active viewport status, and memory estimate when open', () => {
    const html = renderToStaticMarkup(
      <LargeModelDiagnostics
        isOpen={true}
        onClose={vi.fn()}
        totalBlockCount={120}
        totalPartCount={80}
        totalConnectorCount={30}
        totalRelationshipCount={50}
        visibleCount={45}
        isVirtualizing={true}
        isDegradedMode={false}
        pendingWorkerJobs={1}
        lastSaveTimestamp="2026-09-10 12:00:00"
      />
    );

    // Total entities: 120 + 80 + 30 + 50 = 280
    expect(html).toContain('280');
    expect(html).toContain('45 visible');
    expect(html).toContain('Spatial Viewport Culled');
    expect(html).toContain('2026-09-10 12:00:00');
    expect(html).toContain('1 worker task(s) active');
    expect(html).toContain('SysML Large Model Diagnostics &amp; Limits');
  });

  it('returns empty output when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <LargeModelDiagnostics
        isOpen={false}
        onClose={vi.fn()}
        totalBlockCount={100}
        totalPartCount={50}
        totalConnectorCount={20}
        totalRelationshipCount={30}
      />
    );

    expect(html).toBe('');
  });

  it('displays warning banner when model exceeds warning threshold', () => {
    const html = renderToStaticMarkup(
      <LargeModelDiagnostics
        isOpen={true}
        onClose={vi.fn()}
        totalBlockCount={3000}
        totalPartCount={2000}
        totalConnectorCount={500}
        totalRelationshipCount={1000}
        visibleCount={60}
        isVirtualizing={true}
        isDegradedMode={true}
      />
    );

    expect(html).toContain('Very Large Model Detected');
    expect(html).toContain('High Performance (Simplified)');
  });
});
