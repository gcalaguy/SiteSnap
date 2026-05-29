/**
 * check-api-externals.ts
 *
 * Cross-checks the api-server esbuild external array against the declared
 * dependencies in api-server/package.json.
 *
 * Any package that is:
 *   1. listed in the `external` array of build.mjs (won't be bundled), AND
 *   2. actually imported somewhere in artifacts/api-server/src/
 *
 * MUST also be declared in artifacts/api-server/package.json dependencies.
 * If it's missing, the server will crash at startup with ERR_MODULE_NOT_FOUND.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const API_SERVER_DIR = join(WORKSPACE_ROOT, 'artifacts/api-server');

function extractExternals(): string[] {
  const buildMjs = readFileSync(join(API_SERVER_DIR, 'build.mjs'), 'utf-8');
  const match = buildMjs.match(/external:\s*\[([\s\S]*?)\]/);
  if (!match) throw new Error('Could not find external array in build.mjs');
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function getDeclaredDeps(): Set<string> {
  const pkg = JSON.parse(readFileSync(join(API_SERVER_DIR, 'package.json'), 'utf-8'));
  const deps = new Set<string>();
  // Only "dependencies" are installed in production. devDependencies and
  // peerDependencies are NOT available at runtime on a production install,
  // so a package that is only in devDependencies will still crash the server.
  for (const name of Object.keys(pkg['dependencies'] ?? {})) {
    deps.add(name);
  }
  return deps;
}

function walkTs(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...walkTs(join(dir, entry.name)));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

function extractImports(file: string): string[] {
  const src = readFileSync(file, 'utf-8');
  const specifiers: string[] = [];
  // Static: import ... from "pkg"
  for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) specifiers.push(m[1]);
  // Side-effect: import "pkg"
  for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) specifiers.push(m[1]);
  // Dynamic: import("pkg") or import('pkg')
  for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.push(m[1]);
  return specifiers;
}

function toPackageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/');
  }
  return specifier.split('/')[0];
}

function matchesExternal(specifier: string, externals: string[]): boolean {
  for (const ext of externals) {
    if (ext === '*.node') continue;
    if (ext.endsWith('/*')) {
      if (specifier.startsWith(ext.slice(0, -1))) return true;
    } else if (specifier === ext || specifier.startsWith(ext + '/')) {
      return true;
    }
  }
  return false;
}

const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http',
  'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'timers', 'tls', 'trace_events', 'tty', 'url', 'util',
  'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

function isBuiltin(specifier: string): boolean {
  const root = specifier.split('/')[0];
  return specifier.startsWith('node:') || NODE_BUILTINS.has(root);
}

function isWorkspaceOrRelative(specifier: string): boolean {
  return specifier.startsWith('@workspace/') || specifier.startsWith('.');
}

function main() {
  const externals = extractExternals();
  const declaredDeps = getDeclaredDeps();
  const srcFiles = walkTs(join(API_SERVER_DIR, 'src'));

  const missing: Array<{ pkg: string; importedAs: string; file: string }> = [];
  const checked = new Set<string>();

  for (const file of srcFiles) {
    for (const imp of extractImports(file)) {
      if (isBuiltin(imp) || isWorkspaceOrRelative(imp)) continue;
      if (!matchesExternal(imp, externals)) continue;
      const pkgName = toPackageName(imp);
      if (checked.has(pkgName)) continue;
      checked.add(pkgName);
      if (!declaredDeps.has(pkgName)) {
        missing.push({
          pkg: pkgName,
          importedAs: imp,
          file: relative(WORKSPACE_ROOT, file),
        });
      }
    }
  }

  if (missing.length > 0) {
    console.error(
      '\n❌ Externalized packages imported by the server but missing from api-server/package.json:\n'
    );
    for (const { pkg, importedAs, file } of missing) {
      console.error(`  - ${pkg}  (imported as "${importedAs}" in ${file})`);
    }
    console.error(
      '\nAdd these to artifacts/api-server/package.json "dependencies".\n' +
      'Without them, the server will crash at startup with ERR_MODULE_NOT_FOUND.\n'
    );
    process.exit(1);
  }

  console.log(
    `✅ All externalized packages that are imported in server code are declared in package.json` +
    ` (${checked.size} package${checked.size === 1 ? '' : 's'} checked)`
  );
}

main();
