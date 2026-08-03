'use strict';

const FLASH_RECIPES = Object.freeze({
  stm32f103c8t6: Object.freeze({
    recipeId: 'openocd-stm32f103-v1',
    executable: 'openocd',
    args: (opts) => Object.freeze([
      '-f', 'interface/stlink.cfg',
      '-f', 'target/stm32f1x.cfg',
      '-c', `program ${opts.artifactPath || 'firmware.elf'} verify reset exit 0x08000000`,
    ]),
  }),

  stm32f407vgt6: Object.freeze({
    recipeId: 'openocd-stm32f407-v1',
    executable: 'openocd',
    args: (opts) => Object.freeze([
      '-f', 'interface/stlink.cfg',
      '-f', 'target/stm32f4x.cfg',
      '-c', `program ${opts.artifactPath || 'firmware.elf'} verify reset exit 0x08000000`,
    ]),
  }),

  atmega328p: Object.freeze({
    recipeId: 'avrdude-atmega328p-v1',
    executable: 'avrdude',
    args: (opts) => Object.freeze([
      '-c', opts.programmerId || 'usbasp',
      '-p', 'm328p',
      '-U', `flash:w:${opts.artifactPath || 'firmware.hex'}:i`,
    ]),
  }),

  atmega2560: Object.freeze({
    recipeId: 'avrdude-atmega2560-v1',
    executable: 'avrdude',
    args: (opts) => Object.freeze([
      '-c', opts.programmerId || 'wiring',
      '-p', 'm2560',
      '-U', `flash:w:${opts.artifactPath || 'firmware.hex'}:i`,
    ]),
  }),

  'esp32-wroom-32': Object.freeze({
    recipeId: 'esptool-wroom32-v1',
    executable: 'esptool.py',
    args: (opts) => Object.freeze([
      '--chip', 'esp32',
      '--port', opts.port || 'COM3',
      '--baud', '921600',
      'write_flash', '-z', '0x10000', opts.artifactPath || 'firmware.bin',
    ]),
  }),
});

function getFlashRecipe(targetId, opts = {}) {
  const recipe = FLASH_RECIPES[targetId];
  if (!recipe) {
    throw new Error(`UNKNOWN_FLASH_RECIPE: ${targetId}`);
  }

  const executable = opts.openocd || opts.avrdude || opts.esptool || recipe.executable;
  const args = recipe.args(opts);

  return Object.freeze({
    recipeId: recipe.recipeId,
    executable,
    args,
  });
}

module.exports = { getFlashRecipe, FLASH_RECIPES };
