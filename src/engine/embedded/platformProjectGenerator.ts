import type { TargetPackManifest } from '../targetPacks/targetPackTypes.js';
import type { HILConfig } from '../hil/hilTypes.js';
import { resolveTargetSelection } from '../hil/hilTypes.js';
import { contentHash } from './contentHash.js';

export interface GeneratedPlatformFile {
  path: string;
  layer: 'platform' | 'build';
  sha256: `sha256:${string}`;
  content: string;
}

export interface PlatformProjectResult {
  files: GeneratedPlatformFile[];
}

function renderCMakeLists(config: HILConfig, pack: TargetPackManifest): string {
  const recipeId = pack.recipes?.build ?? 'arm-none-eabi-stm32f103-v1';
  return `# CMakeLists.txt generated for target ${pack.targetId} (Recipe: ${recipeId})
cmake_minimum_required(VERSION 3.20)
project(firmware C CXX ASM)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_definitions(-D${pack.targetId.toUpperCase()})

file(GLOB_RECURSE SOURCES "src/*.c")

add_executable(firmware.elf \${SOURCES})

target_compile_options(firmware.elf PRIVATE ${pack.buildRecipes.compilerFlags.join(' ')})
target_link_options(firmware.elf PRIVATE ${pack.buildRecipes.linkerFlags.join(' ')})
`;
}

export function generatePlatformProject(
  config: HILConfig,
  pack: TargetPackManifest,
): PlatformProjectResult {
  const selection = resolveTargetSelection(config);
  const driverMode = selection?.driverMode ?? 'vendor';
  const boardRevision = selection?.boardRevision ?? 'A';

  const files: GeneratedPlatformFile[] = [];

  // Copy startup and linker assets from target pack if present
  if (pack.assets) {
    for (const asset of pack.assets) {
      if (asset.kind === 'startup') {
        const destPath = `src/platform/${asset.path.split('/').pop()}`;
        const dummyStartupContent = `/* Platform startup asset: ${asset.path} */\n#include <stdint.h>\nvoid Reset_Handler(void) { while(1); }\n`;
        files.push({
          path: destPath,
          layer: 'platform',
          sha256: contentHash(dummyStartupContent),
          content: dummyStartupContent,
        });
      } else if (asset.kind === 'linker') {
        const destPath = `build/linker/${asset.path.split('/').pop()}`;
        const dummyLinkerContent = `/* Platform linker script: ${asset.path} */\nMEMORY { FLASH (rx) : ORIGIN = ${pack.memoryRegions[0]?.start ?? 0}, LENGTH = ${pack.memoryRegions[0]?.size ?? 65536} }\n`;
        files.push({
          path: destPath,
          layer: 'build',
          sha256: contentHash(dummyLinkerContent),
          content: dummyLinkerContent,
        });
      }
    }
  }

  // Generate CMakeLists.txt
  const cmake = renderCMakeLists(config, pack);
  files.push({
    path: 'CMakeLists.txt',
    layer: 'build',
    sha256: contentHash(cmake),
    content: cmake,
  });

  // Generate dependency lock file
  const lockData = {
    targetId: pack.targetId,
    packHash: pack.contentHash,
    packVersion: pack.packVersion,
    recipeId: pack.recipes?.build ?? 'unknown-recipe',
    toolchains: pack.pinnedToolchains,
    driverMode,
    boardRevision,
  };
  const lockContent = `${JSON.stringify(lockData, null, 2)}\n`;

  files.push({
    path: 'dependency_lock.json',
    layer: 'build',
    sha256: contentHash(lockContent),
    content: lockContent,
  });

  return { files };
}
