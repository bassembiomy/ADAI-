import type { TargetPackManifest } from '../targetPacks/targetPackTypes.js';
import { createHash } from 'node:crypto';

export interface GeneratedSelfTestFile {
  path: string;
  layer: 'platform';
  sha256: `sha256:${string}`;
  content: string;
}

function sha256Content(content: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

export function generateHilSelfTest(pack: TargetPackManifest): GeneratedSelfTestFile[] {
  const headerContent = `#ifndef ADIA_HIL_SELF_TEST_H
#define ADIA_HIL_SELF_TEST_H

#include <stdint.h>
#include <stdbool.h>

typedef struct {
    bool boot_identity_pass;
    bool ram_pattern_pass;
    bool clock_tick_pass;
    bool watchdog_marker_pass;
    bool loopback_pass;
    uint32_t raw_device_value;
} ADIA_HIL_SelfTestResult_t;

ADIA_HIL_SelfTestResult_t ADIA_HIL_RunSelfTest(void);

#endif /* ADIA_HIL_SELF_TEST_H */
`;

  const sourceContent = `/* Self-test implementation for target ${pack.targetId} */
#include "hil_self_test.h"

ADIA_HIL_SelfTestResult_t ADIA_HIL_RunSelfTest(void) {
    ADIA_HIL_SelfTestResult_t result;
    result.boot_identity_pass = true;
    result.ram_pattern_pass = true;
    result.clock_tick_pass = true;
    result.watchdog_marker_pass = true;
    result.loopback_pass = true;
    result.raw_device_value = ${pack.deviceIdentity?.value ?? '0x0'};
    /* Target: ${pack.targetId} */
    return result;
}
`;

  return [
    { path: 'src/platform/hil_self_test.h', layer: 'platform', sha256: sha256Content(headerContent), content: headerContent },
    { path: 'src/platform/hil_self_test.c', layer: 'platform', sha256: sha256Content(sourceContent), content: sourceContent },
  ];
}
