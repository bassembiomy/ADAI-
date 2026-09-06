import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runTool } from './smToolRunner';
import { computeContentSha256 } from './smVerificationEvidence';

describe('smToolRunner and canonical evidence', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `adia-toolrunner-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('executes exact argument vectors without shell expansion', async () => {
    const script = join(testDir, 'args.js');
    writeFileSync(
      script,
      'process.stdout.write(JSON.stringify(process.argv.slice(2)));',
    );

    const rawArgs = ['hello world', 'a"b$c', '--flag=value with space'];
    const result = await runTool({
      executable: process.execPath,
      args: [script, ...rawArgs],
      cwd: testDir,
    });

    expect(result.available).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.command.exitCode).toBe(0);
    expect(JSON.parse(result.command.stdout)).toEqual(rawArgs);
  });

  it('confines execution to the requested cwd', async () => {
    const subDir = join(testDir, 'sub_workspace');
    mkdirSync(subDir, { recursive: true });
    const script = join(testDir, 'cwd.js');
    writeFileSync(script, 'process.stdout.write(process.cwd());');

    const result = await runTool({
      executable: process.execPath,
      args: [script],
      cwd: subDir,
    });

    expect(result.command.exitCode).toBe(0);
    expect(result.command.cwd).toBe(subDir);
    expect(result.command.stdout.toLowerCase()).toBe(subDir.toLowerCase());
  });

  it('bounds stdout and stderr buffers at maxBufferBytes', async () => {
    const script = join(testDir, 'flood.js');
    writeFileSync(
      script,
      'process.stdout.write("A".repeat(5000)); process.stderr.write("B".repeat(5000));',
    );

    const result = await runTool({
      executable: process.execPath,
      args: [script],
      cwd: testDir,
      maxBufferBytes: 100,
    });

    expect(result.command.exitCode).toBe(0);
    expect(result.command.stdout.length).toBeLessThanOrEqual(200);
    expect(result.command.stdout).toContain('[TRUNCATED]');
    expect(result.command.stderr.length).toBeLessThanOrEqual(200);
    expect(result.command.stderr).toContain('[TRUNCATED]');
  });

  it('terminates execution on timeout and flags timedOut', async () => {
    const script = join(testDir, 'sleep.js');
    writeFileSync(
      script,
      'setTimeout(() => { process.stdout.write("done"); }, 10000);',
    );

    const result = await runTool({
      executable: process.execPath,
      args: [script],
      cwd: testDir,
      timeoutMs: 200,
    });

    expect(result.available).toBe(true);
    expect(result.timedOut).toBe(true);
    expect(result.command.timedOut).toBe(true);
  });

  it('classifies ENOENT as unavailable without throwing', async () => {
    const result = await runTool({
      executable: 'non_existent_compiler_binary_xyz_123',
      args: ['--version'],
      cwd: testDir,
    });

    expect(result.available).toBe(false);
    expect(result.command.exitCode).toBeNull();
    expect(result.command.toolVersion).toBeNull();
  });

  it('captures tool version when versionArgs is provided', async () => {
    const result = await runTool({
      executable: process.execPath,
      args: ['-e', 'process.stdout.write("hello");'],
      cwd: testDir,
      versionArgs: ['--version'],
    });

    expect(result.available).toBe(true);
    expect(result.command.toolVersion).toBe(process.version);
    expect(result.command.stdout).toBe('hello');
  });

  it('hashes input files and output files with SHA-256', async () => {
    const inFile = join(testDir, 'input.txt');
    const outFile = join(testDir, 'output.txt');
    writeFileSync(inFile, 'input content 123');

    const script = join(testDir, 'transform.js');
    writeFileSync(
      script,
      `const fs = require('fs');\n` +
      `const inContent = fs.readFileSync(${JSON.stringify(inFile)}, 'utf8');\n` +
      `fs.writeFileSync(${JSON.stringify(outFile)}, inContent.toUpperCase());\n`,
    );

    const result = await runTool({
      executable: process.execPath,
      args: [script],
      cwd: testDir,
      inputFiles: [inFile],
      outputFiles: [outFile],
    });

    expect(result.command.exitCode).toBe(0);
    expect(result.command.inputHashes[inFile]).toBe(computeContentSha256('input content 123'));
    expect(result.command.outputHashes[outFile]).toBe(computeContentSha256('INPUT CONTENT 123'));
  });
});
