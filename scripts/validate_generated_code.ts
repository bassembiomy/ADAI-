import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

// ==========================================
// 1. C-Code AST Parser Helpers (Zero Dependency)
// ==========================================

export function parseCEnum(content: string, enumName: string): Map<string, number> {
  const enumRegex = new RegExp(`typedef\\s+enum\\s*\\{([^}]+)\\}\\s*${enumName};`, 'g');
  const match = enumRegex.exec(content);
  const map = new Map<string, number>();
  if (!match) return map;
  const body = match[1];
  let val = 0;
  body.split(',').forEach(item => {
    const parts = item.split('=');
    const name = parts[0].trim();
    if (!name) return;
    if (parts[1]) {
      val = parseInt(parts[1].trim());
    }
    map.set(name, val);
    val++;
  });
  return map;
}

export function parseCStruct(content: string, structName: string): { type: string; name: string }[] {
  const structRegex = new RegExp(`typedef\\s+struct\\s*\\{([^}]+)\\}\\s*${structName};`, 'g');
  const match = structRegex.exec(content);
  if (!match) return [];
  const body = match[1];
  const members: { type: string; name: string }[] = [];
  const lines = body.split('\n');
  lines.forEach(line => {
    const lineMatch = /^\s*(volatile\s+)?([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+);/.exec(line.trim());
    if (lineMatch) {
      members.push({ type: lineMatch[2], name: lineMatch[3] });
    }
  });
  return members;
}

export function parseCMacros(content: string): Map<string, string> {
  const map = new Map<string, string>();
  // Match macros like: #define KEY (VALUE)
  const macroRegex = /#define\s+([A-Za-z0-9_]+)\s+\(([^)]+)\)/g;
  let match;
  while ((match = macroRegex.exec(content)) !== null) {
    map.set(match[1], match[2].trim());
  }
  // Match simple macros like: #define KEY VALUE
  const simpleRegex = /#define\s+([A-Za-z0-9_]+)\s+([0-9A-Za-z_]+U?)/g;
  while ((match = simpleRegex.exec(content)) !== null) {
    if (!['SM_CONFIG_H', 'SM_CORE_H', 'SM_SAFETY_H', 'SM_USER_LOGIC_H', 'MCAL_DIO_H'].includes(match[1])) {
      map.set(match[1], match[2].trim());
    }
  }
  return map;
}

export function parseFunctionSignatures(content: string): { returnType: string; name: string; params: string[]; isStatic: boolean }[] {
  const cleaned = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  const fnRegex = /(static\s+)?\b(void|SM_Error_t|SM_Node_t|bool|uint32_t|int32_t)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*([^{;]*[{;])/g;
  let match;
  const signatures: { returnType: string; name: string; params: string[]; isStatic: boolean }[] = [];
  while ((match = fnRegex.exec(cleaned)) !== null) {
    const isStatic = !!match[1];
    const returnType = match[2].trim();
    const name = match[3].trim();
    const params = match[4]
      .replace(/\s*\*\s*/g, '* ')
      .replace(/\s+/g, ' ')
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    signatures.push({ returnType, name, params, isStatic });
  }
  return signatures;
}

export function extractFunctionCalls(content: string, prefix: string): string[] {
  const cleaned = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  const callRegex = new RegExp(`\\b(${prefix}[A-Za-z0-9_]+)\\s*\\(`, 'g');
  let match;
  const calls = new Set<string>();
  while ((match = callRegex.exec(cleaned)) !== null) {
    calls.add(match[1]);
  }
  return Array.from(calls);
}

// Helper functions for variable category filters
const isInputVariable = (name: string): boolean => {
  return name.startsWith('in_') || name.startsWith('sensor_') || name.startsWith('btn_') || name.startsWith('sw_') || name.startsWith('input_') || name.startsWith('button_') ||
         name.endsWith('_in') || name.endsWith('_sensor') || name.endsWith('_btn') || name.endsWith('_sw') || name.endsWith('_button') || name.endsWith('_input');
};

const isOutputVariable = (name: string): boolean => {
  return name.startsWith('out_') || name.startsWith('led_') || name.startsWith('motor_') || name.startsWith('output_') || name.startsWith('actuator_') || name.startsWith('relay_') || name.startsWith('valve_') ||
         name.endsWith('_out') || name.endsWith('_led') || name.endsWith('_motor') || name.endsWith('_active') || name.endsWith('_output') || name.endsWith('_actuator') || name.endsWith('_relay') || name.endsWith('_valve');
};

// ==========================================
// 2. Validation Rules (TR-01 to TR-07)
// ==========================================

export function validateTR01(outputDir: string): { success: boolean; errors: string[] } {
  const configPath = path.join(outputDir, 'sm_config.h');
  const errors: string[] = [];
  if (!fs.existsSync(configPath)) {
    return { success: false, errors: [`File not found: ${configPath}`] };
  }
  const content = fs.readFileSync(configPath, 'utf8');

  // Guard occurrences
  const guardCount = (content.match(/#ifndef\s+SM_CONFIG_H/g) || []).length;
  if (guardCount !== 1) {
    errors.push(`Header guard #ifndef SM_CONFIG_H appears ${guardCount} times (expected exactly 1).`);
  }

  // Duplicate #defines
  const defineLines = content.split('\n');
  const keys: string[] = [];
  defineLines.forEach(line => {
    const match = /^\s*#define\s+([A-Za-z0-9_]+)/.exec(line);
    if (match) {
      keys.push(match[1]);
    }
  });
  const uniqueKeys = new Set(keys);
  if (keys.length !== uniqueKeys.size) {
    const duplicates = keys.filter((item, index) => keys.indexOf(item) !== index);
    errors.push(`Duplicate macro definitions found in sm_config.h: ${Array.from(new Set(duplicates)).join(', ')}`);
  }

  return { success: errors.length === 0, errors };
}

export function validateTR02(outputDir: string, jsonModel: any): { success: boolean; errors: string[] } {
  const configPath = path.join(outputDir, 'sm_config.h');
  const errors: string[] = [];
  if (!fs.existsSync(configPath)) {
    return { success: false, errors: [`File not found: ${configPath}`] };
  }
  const content = fs.readFileSync(configPath, 'utf8');

  const enumMap = parseCEnum(content, 'SM_Node_t');
  const macroMap = parseCMacros(content);

  const states = jsonModel.states || [];
  states.forEach((s: any) => {
    // Determine the expected enum name of the state
    const cleanName = s.name.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').toUpperCase();
    const enumName = `SM_ST_${cleanName}`;
    const idxMacroName = `${enumName}_IDX`;

    const enumVal = enumMap.get(enumName);
    const macroValStr = macroMap.get(idxMacroName);

    if (enumVal === undefined) {
      errors.push(`State enum ${enumName} not found in SM_Node_t enum.`);
      return;
    }
    if (macroValStr === undefined) {
      errors.push(`Index macro ${idxMacroName} not found.`);
      return;
    }

    const macroVal = parseInt(macroValStr.replace('U', ''));
    if (enumVal !== macroVal) {
      errors.push(`Mismatched value: ${enumName} has value ${enumVal}, but ${idxMacroName} has value ${macroVal}.`);
    }
  });

  return { success: errors.length === 0, errors };
}

export function validateTR03(outputDir: string): { success: boolean; errors: string[] } {
  const errors: string[] = [];
  const filePairs = [
    { header: 'sm_mapping.h', source: 'sm_mapping.c' },
    { header: 'sm_core.h', source: 'sm_core.c' },
    { header: 'sm_user_logic.h', source: 'sm_user_logic.c' },
    { header: 'sm_safety.h', source: 'sm_safety.c' }
  ];

  filePairs.forEach(pair => {
    const hPath = path.join(outputDir, pair.header);
    const cPath = path.join(outputDir, pair.source);
    if (!fs.existsSync(hPath) || !fs.existsSync(cPath)) return;

    const hContent = fs.readFileSync(hPath, 'utf8');
    const cContent = fs.readFileSync(cPath, 'utf8');

    const hSigs = parseFunctionSignatures(hContent);
    const cSigs = parseFunctionSignatures(cContent);

    cSigs.forEach(cSig => {
      // Check pass-by-pointer for any parameter containing ADIA_Instance_t
      cSig.params.forEach(param => {
        if (param.includes('ADIA_Instance_t') && !param.includes('ADIA_Instance_t*')) {
          errors.push(`Function ${cSig.name} in ${pair.source} does not use pass-by-pointer instance context (found: '${param}').`);
        }
      });

      // Internal static helper functions in .c do not require public header prototypes
      if (cSig.isStatic) return;

      // Match with header declaration
      const hSig = hSigs.find(h => h.name === cSig.name);
      if (!hSig) {
        errors.push(`Function ${cSig.name} defined in ${pair.source} is missing a prototype declaration in ${pair.header}.`);
      } else {
        // Compare parameters
        if (cSig.params.join(',') !== hSig.params.join(',')) {
          errors.push(`Function ${cSig.name} parameter mismatch between ${pair.header} ('${hSig.params.join(', ')}') and ${pair.source} ('${cSig.params.join(', ')}').`);
        }
        if (cSig.returnType !== hSig.returnType) {
          errors.push(`Function ${cSig.name} return type mismatch between ${pair.header} ('${hSig.returnType}') and ${pair.source} ('${cSig.returnType}').`);
        }
      }
    });
  });

  return { success: errors.length === 0, errors };
}

export function validateTR04(outputDir: string, jsonModel: any): { success: boolean; errors: string[] } {
  const configPath = path.join(outputDir, 'sm_config.h');
  const errors: string[] = [];
  if (!fs.existsSync(configPath)) {
    return { success: false, errors: [`File not found: ${configPath}`] };
  }
  const content = fs.readFileSync(configPath, 'utf8');
  const structMembers = parseCStruct(content, 'SM_Data_t');

  const jsonVars = jsonModel.variables || [];
  const expectedNames = new Set(jsonVars.map((v: any) => v.name));

  // Check set difference
  structMembers.forEach(m => {
    if (!expectedNames.has(m.name)) {
      errors.push(`Struct member '${m.name}' in SM_Data_t is not defined in the JSON model variables.`);
    }
  });

  // Blacklist check for 'x' and 'state_timer'
  const blacklist = ['x', 'state_timer'];
  blacklist.forEach(varName => {
    const hasBlacklisted = structMembers.some(m => m.name === varName);
    if (hasBlacklisted && !expectedNames.has(varName)) {
      errors.push(`Blacklisted phantom variable '${varName}' was detected in SM_Data_t struct.`);
    }
  });

  return { success: errors.length === 0, errors };
}

export function validateTR05(outputDir: string, jsonModel: any): { success: boolean; errors: string[] } {
  const cPath = path.join(outputDir, 'sm_core.c');
  const errors: string[] = [];
  if (!fs.existsSync(cPath)) {
    return { success: false, errors: [`File not found: ${cPath}`] };
  }
  const content = fs.readFileSync(cPath, 'utf8');
  const cleaned = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

  const jsonVars = jsonModel.variables || [];
  const inputVars = new Set(jsonVars.filter((v: any) => v.isInput || v.direction === 'input' || isInputVariable(v.name)).map((v: any) => v.name));
  const outputVars = new Set(jsonVars.filter((v: any) => v.isOutput || v.direction === 'output' || isOutputVariable(v.name)).map((v: any) => v.name));

  // Extract lines inside SM_Sync_IO
  const syncIOStart = cleaned.indexOf('SM_Sync_IO(');
  if (syncIOStart > -1) {
    const syncIOEnd = cleaned.indexOf('}', syncIOStart);
    const syncIOBody = cleaned.substring(syncIOStart, syncIOEnd);

    // 1. Check assignments with MCAL_Dio_ReadChannel
    const readRegex = /instance->data\.([A-Za-z0-9_]+)\s*=[^;]*MCAL_Dio_ReadChannel/g;
    let match;
    while ((match = readRegex.exec(syncIOBody)) !== null) {
      const varName = match[1];
      if (!inputVars.has(varName)) {
        errors.push(`LHS variable '${varName}' in MCAL_Dio_ReadChannel assignment is not flagged as input in JSON model.`);
      }
    }

    // 2. Check arguments of MCAL_Dio_WriteChannel
    const writeRegex = /MCAL_Dio_WriteChannel\s*\(\s*[A-Za-z0-9_]+\s*,\s*([^)]+)\)/g;
    while ((match = writeRegex.exec(syncIOBody)) !== null) {
      const expr = match[1].trim();
      const varMatch = /instance->data\.([A-Za-z0-9_]+)/.exec(expr);
      if (varMatch) {
        const varName = varMatch[1];
        if (!outputVars.has(varName)) {
          errors.push(`Variable '${varName}' written to MCAL_Dio_WriteChannel is not flagged as output in JSON model.`);
        }
      }
    }
  }

  return { success: errors.length === 0, errors };
}

export function validateTR06(outputDir: string): { success: boolean; errors: string[]; warning?: string } {
  const errors: string[] = [];
  const cPath = path.join(outputDir, 'sm_core.c');
  if (!fs.existsSync(cPath)) {
    return { success: false, errors: [`File not found: ${cPath}`] };
  }

  const compilers = ['gcc', 'clang', 'avr-gcc'];
  let availableCompiler: string | null = null;
  for (const c of compilers) {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' });
      availableCompiler = c;
      break;
    } catch {
      // Ignore
    }
  }

  if (!availableCompiler) {
    return {
      success: true,
      errors: [],
      warning: `No C compiler (gcc, clang, avr-gcc) found on system path. Skipping TR-06 compilation dry-run.`
    };
  }

  try {
    const syntaxFlag = availableCompiler === 'avr-gcc' ? '-c' : '-fsyntax-only';
    execFileSync(availableCompiler, [syntaxFlag, '-Wall', '-Wextra', '-Werror', `-I${outputDir}`, cPath], { stdio: 'pipe' });
  } catch (err: any) {
    errors.push(`Compiler dry-run failed using ${availableCompiler}: ${err.stderr?.toString() || err.message}`);
  }

  return { success: errors.length === 0, errors };
}

export function validateTR07(outputDir: string): { success: boolean; errors: string[] } {
  const errors: string[] = [];
  const cPath = path.join(outputDir, 'sm_core.c');
  const hPath = path.join(outputDir, 'mcal_dio.h');
  if (!fs.existsSync(cPath) || !fs.existsSync(hPath)) {
    return { success: false, errors: ['Missing sm_core.c or mcal_dio.h files.'] };
  }

  const cContent = fs.readFileSync(cPath, 'utf8');
  const hContent = fs.readFileSync(hPath, 'utf8');

  const mcalCalls = extractFunctionCalls(cContent, 'MCAL_');
  const hSigs = parseFunctionSignatures(hContent);
  const declaredMcalFns = new Set(hSigs.filter(s => s.name.startsWith('MCAL_')).map(s => s.name));

  mcalCalls.forEach(callName => {
    if (!declaredMcalFns.has(callName)) {
      errors.push(`MCAL function call '${callName}' in sm_core.c is missing a prototype declaration in mcal_dio.h.`);
    }
  });

  return { success: errors.length === 0, errors };
}

export function runValidationPipeline(modelPath: string, outputDir: string): { success: boolean; results: any } {
  const results: any = {};
  let overallSuccess = true;

  if (!fs.existsSync(modelPath)) {
    throw new Error(`JSON Model file not found: ${modelPath}`);
  }
  const jsonModel = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

  const tr01 = validateTR01(outputDir);
  results.TR01 = { success: tr01.success, errors: tr01.errors };
  if (!tr01.success) overallSuccess = false;

  const tr02 = validateTR02(outputDir, jsonModel);
  results.TR02 = { success: tr02.success, errors: tr02.errors };
  if (!tr02.success) overallSuccess = false;

  const tr03 = validateTR03(outputDir);
  results.TR03 = { success: tr03.success, errors: tr03.errors };
  if (!tr03.success) overallSuccess = false;

  const tr04 = validateTR04(outputDir, jsonModel);
  results.TR04 = { success: tr04.success, errors: tr04.errors };
  if (!tr04.success) overallSuccess = false;

  const tr05 = validateTR05(outputDir, jsonModel);
  results.TR05 = { success: tr05.success, errors: tr05.errors };
  if (!tr05.success) overallSuccess = false;

  const tr06 = validateTR06(outputDir);
  results.TR06 = { success: tr06.success, errors: tr06.errors, warning: tr06.warning };
  if (!tr06.success) overallSuccess = false;

  const tr07 = validateTR07(outputDir);
  results.TR07 = { success: tr07.success, errors: tr07.errors };
  if (!tr07.success) overallSuccess = false;

  return { success: overallSuccess, results };
}

// CLI Execution block
if (typeof require !== 'undefined' && require.main === module) {
  const args = process.argv.slice(2);
  let modelPath = '';
  let outputDir = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      modelPath = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    }
  }

  if (!modelPath || !outputDir) {
    console.error('Usage: npx ts-node scripts/validate_generated_code.ts --model <path_to_json> --output <path_to_generated_dir>');
    process.exit(1);
  }

  console.log('[ADIA Test Suite] Starting Validation...');
  try {
    const { success, results } = runValidationPipeline(modelPath, outputDir);
    
    const printStatus = (name: string, trSuccess: boolean, trWarning?: string) => {
      if (trSuccess) {
        if (trWarning) {
          console.log(`[WARN] ${name} (Warning: ${trWarning})`);
        } else {
          console.log(`[PASS] ${name}`);
        }
      } else {
        console.log(`[FAIL] ${name}`);
      }
    };

    printStatus('TR-01: Duplicate Content Check', results.TR01.success);
    printStatus('TR-02: Enum/Index Alignment', results.TR02.success);
    printStatus('TR-03: Signature Consistency', results.TR03.success);
    printStatus('TR-04: Phantom Variable Check', results.TR04.success);
    printStatus('TR-05: I/O Binding Safety', results.TR05.success);
    printStatus('TR-06: Syntax Compilation', results.TR06.success, results.TR06.warning);
    printStatus('TR-07: MCAL Interface Contract', results.TR07.success);

    Object.keys(results).forEach((k) => {
      const res = results[k];
      if (!res.success && res.errors.length > 0) {
        res.errors.forEach((err: string) => {
          console.error(`       -> ERROR: ${err}`);
        });
      }
    });

    fs.writeFileSync('test_results.json', JSON.stringify({ success, results }, null, 2));

    console.log('\n=========================================');
    if (success) {
      console.log('RESULT: PASSED (All validation gates completed successfully)');
      console.log('=========================================');
      process.exit(0);
    } else {
      console.log('RESULT: FAILED (Critical validation errors detected)');
      console.log('=========================================');
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`FATAL ERROR running validation pipeline: ${err.message}`);
    process.exit(1);
  }
}
