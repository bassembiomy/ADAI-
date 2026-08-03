'use strict';

const assert = require('node:assert/strict');
const { getBuildRecipe } = require('./hilBuildRecipes.cjs');

async function runTests() {
  console.log('Running hilBuildRecipes tests...');

  // Test 1: Returns frozen executable and arguments for stm32f407vgt6
  const recipeF4 = getBuildRecipe('stm32f407vgt6', {
    armGcc: 'arm-none-eabi-gcc',
    linkerScript: 'build/linker/stm32f407vgtx.ld',
    startupFile: 'src/platform/startup_stm32f407xx.c',
    sources: ['src/mcal/adia_mcal.c', 'src/component/adia_component.c'],
  });

  assert.equal(recipeF4.executable, 'arm-none-eabi-gcc');
  assert.ok(Object.isFrozen(recipeF4.args));
  assert.ok(recipeF4.args.includes('-mcpu=cortex-m4'));
  assert.ok(recipeF4.args.includes('-mfloat-abi=hard'));
  assert.ok(recipeF4.args.includes('-mfpu=fpv4-sp-d16'));
  assert.ok(recipeF4.args.includes('-Wl,-Map=firmware.map'));

  // Test 2: Throws for unknown targetId
  assert.throws(
    () => getBuildRecipe('unknown-mcu', {}),
    /UNKNOWN_TARGET_RECIPE/
  );

  console.log('hilBuildRecipes tests passed!');
}

runTests().catch(err => {
  console.error('hilBuildRecipes tests failed:', err);
  process.exit(1);
});
