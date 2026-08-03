'use strict';

const assert = require('node:assert/strict');
const { getFlashRecipe } = require('./hilFlashRecipes.cjs');

async function runTests() {
  console.log('Running hilFlashRecipes tests...');

  // Test 1: Returns openocd flash recipe for stm32f407vgt6
  const recipeF4 = getFlashRecipe('stm32f407vgt6', {
    openocd: 'openocd',
    artifactPath: 'out/firmware.elf',
  });

  assert.equal(recipeF4.recipeId, 'openocd-stm32f407-v1');
  assert.equal(recipeF4.executable, 'openocd');
  assert.ok(recipeF4.args.includes('target/stm32f4x.cfg'));

  // Test 2: Throws for unknown flash targetId
  assert.throws(
    () => getFlashRecipe('unknown-mcu', {}),
    /UNKNOWN_FLASH_RECIPE/
  );

  console.log('hilFlashRecipes tests passed!');
}

runTests().catch(err => {
  console.error('hilFlashRecipes tests failed:', err);
  process.exit(1);
});
