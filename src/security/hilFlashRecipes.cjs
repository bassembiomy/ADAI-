'use strict';

// OpenOCD adds the offset to every section address; ELF/HEX images already carry absolute
// addresses, so only raw .bin images get the 0x08000000 flash base.
function openocdProgramCommand(artifactPath) {
  const offset = /\.bin$/i.test(artifactPath) ? ' 0x08000000' : '';
  return `program ${artifactPath} verify reset exit${offset}`;
}

const FLASH_RECIPES = Object.freeze({
  stm32f103c8t6: Object.freeze({
    recipeId: 'openocd-stm32f103-v1',
    executable: 'openocd',
    args: (opts) => Object.freeze([
      '-f', 'interface/stlink.cfg',
      '-f', 'target/stm32f1x.cfg',
      '-c', openocdProgramCommand(opts.artifactPath || 'firmware.elf'),
    ]),
  }),

  stm32f407vgt6: Object.freeze({
    recipeId: 'openocd-stm32f407-v1',
    executable: 'openocd',
    args: (opts) => Object.freeze([
      '-f', 'interface/stlink.cfg',
      '-f', 'target/stm32f4x.cfg',
      '-c', openocdProgramCommand(opts.artifactPath || 'firmware.elf'),
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
