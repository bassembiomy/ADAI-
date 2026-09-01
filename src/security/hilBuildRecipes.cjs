'use strict';

const RECIPES = Object.freeze({
  stm32f103c8t6: Object.freeze({
    recipeId: 'arm-none-eabi-stm32f103-v1',
    inspectRecipeId: 'arm-elf-v1',
    compiler: 'arm-none-eabi-gcc',
    buildArgs: (paths, sources, linker, startup) => Object.freeze([
      '-mcpu=cortex-m3', '-mthumb', '-Os', '-Wall', '-Wextra',
      '-ffunction-sections', '-fdata-sections',
      '--specs=nano.specs', '--specs=nosys.specs',
      '-I.', '-Isrc/mcal', '-Isrc/component', '-Isrc/platform',
      ...sources,
      ...(startup ? [startup] : []),
      ...(linker ? [`-T${linker}`] : []),
      '-Wl,-Map=firmware.map', '-Wl,--gc-sections', '-o', 'firmware.elf',
    ].filter(Boolean)),
  }),

  stm32f407vgt6: Object.freeze({
    recipeId: 'arm-none-eabi-stm32f407-v1',
    inspectRecipeId: 'arm-elf-v1',
    compiler: 'arm-none-eabi-gcc',
    buildArgs: (paths, sources, linker, startup) => Object.freeze([
      '-mcpu=cortex-m4', '-mthumb', '-mfloat-abi=hard', '-mfpu=fpv4-sp-d16',
      '-Os', '-Wall', '-Wextra',
      '-ffunction-sections', '-fdata-sections',
      '--specs=nano.specs', '--specs=nosys.specs',
      '-I.', '-Isrc/mcal', '-Isrc/component', '-Isrc/platform',
      ...sources,
      ...(startup ? [startup] : []),
      ...(linker ? [`-T${linker}`] : []),
      '-Wl,-Map=firmware.map', '-Wl,--gc-sections', '-o', 'firmware.elf',
    ].filter(Boolean)),
  }),

  atmega328p: Object.freeze({
    recipeId: 'avr-atmega328p-v1',
    inspectRecipeId: 'avr-elf-v1',
    compiler: 'avr-g++',
    buildArgs: (paths, sources) => {
      const srcArgs = sources.flatMap(s => s.endsWith('.ino') ? ['-x', 'c++', s] : [s]);
      return Object.freeze([
        '-mmcu=atmega328p', '-DF_CPU=16000000UL', '-DADIA_BARE_ARDUINO_MAIN', '-Os', '-Wall', '-Wextra',
        '-ffunction-sections', '-fdata-sections',
        '-I.', '-Isrc/mcal', '-Isrc/component',
        ...srcArgs,
        '-Wl,-Map=firmware.map,--gc-sections', '-o', 'firmware.elf',
      ].filter(Boolean));
    },
  }),

  atmega2560: Object.freeze({
    recipeId: 'avr-atmega2560-v1',
    inspectRecipeId: 'avr-elf-v1',
    compiler: 'avr-g++',
    buildArgs: (paths, sources) => {
      const srcArgs = sources.flatMap(s => s.endsWith('.ino') ? ['-x', 'c++', s] : [s]);
      return Object.freeze([
        '-mmcu=atmega2560', '-DF_CPU=16000000UL', '-DADIA_BARE_ARDUINO_MAIN', '-Os', '-Wall', '-Wextra',
        '-ffunction-sections', '-fdata-sections',
        '-I.', '-Isrc/mcal', '-Isrc/component',
        ...srcArgs,
        '-Wl,-Map=firmware.map,--gc-sections', '-o', 'firmware.elf',
      ].filter(Boolean));
    },
  }),

  'esp32-wroom-32': Object.freeze({
    recipeId: 'esp-idf-wroom32-v1',
    inspectRecipeId: 'esp-idf-image-v1',
    compiler: 'xtensa-esp32-elf-g++',
    buildArgs: (paths, sources) => {
      const srcArgs = sources.flatMap(s => s.endsWith('.ino') ? ['-x', 'c++', s] : [s]);
      return Object.freeze([
        '-mlongcalls', '-DADIA_BARE_ARDUINO_MAIN', '-Os', '-Wall', '-Wextra',
        '-ffunction-sections', '-fdata-sections',
        '-I.', '-Isrc/mcal', '-Isrc/component',
        ...srcArgs,
        '-Wl,-Map=firmware.map,--gc-sections', '-o', 'firmware.elf',
      ].filter(Boolean));
    },
  }),

  'generic-host': Object.freeze({
    recipeId: 'gcc-generic-host-v1',
    inspectRecipeId: 'generic-elf-v1',
    compiler: 'gcc',
    buildArgs: (paths, sources) => Object.freeze([
      '-std=c99', '-Os', '-Wall', '-Wextra',
      '-I.', '-Isrc/mcal', '-Isrc/component',
      ...sources,
      '-o', 'firmware.elf',
    ].filter(Boolean)),
  }),
});

function getBuildRecipe(targetId, opts = {}) {
  const recipe = RECIPES[targetId];
  if (!recipe) {
    throw new Error(`UNKNOWN_TARGET_RECIPE: ${targetId}`);
  }

  const executable = opts.armGcc || opts.compiler || recipe.compiler;
  const sources = opts.sources || [];
  const linker = opts.linkerScript || '';
  const startup = opts.startupFile || '';

  const args = recipe.buildArgs(opts, sources, linker, startup);

  return Object.freeze({
    recipeId: recipe.recipeId,
    inspectRecipeId: recipe.inspectRecipeId,
    executable,
    args,
  });
}

module.exports = { getBuildRecipe, RECIPES };
