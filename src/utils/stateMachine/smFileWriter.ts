import { existsSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve, sep, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GeneratedFile } from './smRuntimeGenerator';

export function writeGeneratedArtifacts(targetDir: string, files: readonly GeneratedFile[]): void {
  const root = resolve(targetDir);

  for (const file of files) {
    if (isAbsolute(file.name) || /^[a-zA-Z]:/.test(file.name)) {
      throw new Error(`Path traversal forbidden: absolute or drive-qualified path '${file.name}'`);
    }

    if (/(?:^|[/\\])\.\.(?:[/\\]|$)/.test(file.name)) {
      throw new Error(`Path traversal forbidden: '${file.name}' contains relative escape`);
    }

    const fullPath = resolve(root, file.name);
    if (fullPath !== root && !fullPath.startsWith(root + sep)) {
      throw new Error(`Path traversal forbidden: '${file.name}' escapes target directory`);
    }

    const policy = file.overwritePolicy || 'ALWAYS';
    if (policy === 'CREATE_IF_MISSING' && existsSync(fullPath)) {
      continue;
    }

    mkdirSync(dirname(fullPath), { recursive: true });
    const tmpPath = `${fullPath}.tmp-${process.pid}-${randomUUID()}`;

    try {
      writeFileSync(tmpPath, file.content, 'utf8');
      renameSync(tmpPath, fullPath);
    } catch (err) {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
      throw err;
    }
  }
}
