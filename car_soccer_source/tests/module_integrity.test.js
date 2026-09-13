/**
 * tests/module_integrity.test.js
 * Comprehensive regression and static validation suite:
 * 1. Detects duplicate star exports in barrel files (e.g. src/entities/index.js, src/effects/index.js)
 *    that cause Vite/esbuild "Ambiguous import ... has multiple matching exports" errors.
 * 2. Validates top-level variable resolution and TDZ safety in CarSoccerEngine.js,
 *    preventing runtime errors like "ReferenceError: Can't find variable: xn".
 * 3. Ensures that all imports from barrel files resolve to a single, unambiguous export.
 */

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');

/**
 * Parses all exported identifier names from a JS module file.
 */
function parseModuleExports(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const exportedNames = new Set();
  const explicitReexports = new Set();
  const starReexports = [];

  // Match: export const/function/class/let/var NAME
  const declRegex = /export\s+(?:async\s+)?(?:const|function\*?|class|let|var)\s+([a-zA-Z0-9_$]+)/g;
  let m;
  while ((m = declRegex.exec(content)) !== null) {
    exportedNames.add(m[1]);
  }

  // Match: export { a, b as c, ... } [from './...']
  const blockRegex = /export\s*\{([^}]+)\}(?:\s*from\s*['"]([^'"]+)['"])?/g;
  while ((m = blockRegex.exec(content)) !== null) {
    const inner = m[1];
    const fromModule = m[2];
    for (const item of inner.split(',')) {
      const trimmed = item.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      const parts = trimmed.split(/\s+as\s+/);
      const exportName = (parts[1] || parts[0]).trim();
      if (exportName) {
        exportedNames.add(exportName);
        if (fromModule) {
          explicitReexports.add(exportName);
        }
      }
    }
  }

  // Match: export * from './...'
  const starRegex = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = starRegex.exec(content)) !== null) {
    starReexports.push(m[1]);
  }

  return { exportedNames, explicitReexports, starReexports, content };
}

/**
 * Parses all imports from a specific module path in a consumer file.
 */
function parseModuleImportsFrom(consumerFilePath, targetModuleRelPath) {
  const content = fs.readFileSync(consumerFilePath, 'utf-8');
  const importedNames = [];
  // Match: import { ... } from 'targetModuleRelPath'
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRegex.exec(content)) !== null) {
    const fromPath = m[2];
    if (fromPath.includes(targetModuleRelPath)) {
      const inner = m[1];
      for (const item of inner.split(',')) {
        const trimmed = item.trim();
        if (!trimmed || trimmed.startsWith('//')) continue;
        const parts = trimmed.split(/\s+as\s+/);
        const originalName = parts[0].trim();
        const localName = (parts[1] || parts[0]).trim();
        importedNames.push({ originalName, localName });
      }
    }
  }
  return importedNames;
}

test('1. Barrel files (entities/index.js and effects/index.js) have zero ambiguous star-export collisions', () => {
  const barrelFiles = [
    path.join(SRC_DIR, 'entities/index.js'),
    path.join(SRC_DIR, 'effects/index.js')
  ];

  for (const barrelPath of barrelFiles) {
    if (!fs.existsSync(barrelPath)) continue;
    const barrelDir = path.dirname(barrelPath);
    const barrel = parseModuleExports(barrelPath);

    const subModuleExports = new Map(); // exportName -> [subModuleFile, ...]

    for (const relPath of barrel.starReexports) {
      const resolvedPath = path.resolve(barrelDir, relPath);
      const sub = parseModuleExports(resolvedPath);
      for (const name of sub.exportedNames) {
        if (!subModuleExports.has(name)) {
          subModuleExports.set(name, []);
        }
        subModuleExports.get(name).push(path.basename(resolvedPath));
      }
    }

    // Check for collisions
    const collisions = [];
    for (const [name, files] of subModuleExports.entries()) {
      if (files.length > 1) {
        // If the barrel file has an explicit export for this symbol, it resolves the collision per ESM spec
        if (!barrel.explicitReexports.has(name)) {
          collisions.push({ name, files });
        }
      }
    }

    assert.equal(
      collisions.length,
      0,
      `Detected ambiguous export collisions in ${path.basename(barrelDir)}/index.js:\n` +
      collisions.map(c => `  - Symbol "${c.name}" exported by multiple files without disambiguation: [${c.files.join(', ')}]`).join('\n') +
      `\nFix: Disambiguate by removing redundant exports in submodules, or adding explicit re-export in index.js (e.g. export { ${collisions[0]?.name} } from './...').`
    );
  }
});

test('2. All imports into CarSoccerEngine.js from entities/index.js resolve uniquely', () => {
  const enginePath = path.join(SRC_DIR, 'game/CarSoccerEngine.js');
  const barrelPath = path.join(SRC_DIR, 'entities/index.js');
  const barrelDir = path.dirname(barrelPath);

  const imports = parseModuleImportsFrom(enginePath, 'entities');
  assert.ok(imports.length > 0, 'CarSoccerEngine.js should import from entities');

  // Build resolved export map of entities/index.js
  const barrel = parseModuleExports(barrelPath);
  const starExportProviders = new Map(); // name -> [file, ...]

  for (const relPath of barrel.starReexports) {
    const subPath = path.resolve(barrelDir, relPath);
    const sub = parseModuleExports(subPath);
    for (const name of sub.exportedNames) {
      if (!starExportProviders.has(name)) starExportProviders.set(name, []);
      starExportProviders.get(name).push(path.basename(subPath));
    }
  }

  const missingOrAmbiguous = [];
  for (const { originalName, localName } of imports) {
    const isExplicit = barrel.explicitReexports.has(originalName);
    const providers = starExportProviders.get(originalName) || [];

    if (!isExplicit && providers.length > 1) {
      missingOrAmbiguous.push(`Ambiguous import "${originalName}" (matched in ${providers.join(', ')})`);
    } else if (!isExplicit && providers.length === 0 && !barrel.exportedNames.has(originalName)) {
      missingOrAmbiguous.push(`Missing export "${originalName}" (not found in any star or explicit export)`);
    }
  }

  assert.deepEqual(
    missingOrAmbiguous,
    [],
    `Ambiguous or missing imports in CarSoccerEngine.js:\n` + missingOrAmbiguous.join('\n')
  );
});

test('3. CarSoccerEngine.js critical variables (xn, mg, gg, vg, jg, ow, RS, GS, OS) are declared and imported before usage', () => {
  const enginePath = path.join(SRC_DIR, 'game/CarSoccerEngine.js');
  const source = fs.readFileSync(enginePath, 'utf-8');
  const lines = source.split('\n');

  // Find imports
  const importedIdentifiers = new Set();
  const importBlockMatch = source.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]*entities[^'"]*['"]/);
  assert.ok(importBlockMatch, 'CarSoccerEngine.js must import from entities');

  for (const item of importBlockMatch[1].split(',')) {
    const trimmed = item.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    const parts = trimmed.split(/\s+as\s+/);
    importedIdentifiers.add((parts[1] || parts[0]).trim());
  }

  // Must import DEFAULT_TEAM_COLORS as xn
  assert.ok(
    importedIdentifiers.has('xn'),
    'CarSoccerEngine.js must import xn (DEFAULT_TEAM_COLORS as xn) to prevent ReferenceError at runtime'
  );

  // Must import suspension and wheel creators
  assert.ok(importedIdentifiers.has('createSuspensionUnit'), 'Must import createSuspensionUnit');
  assert.ok(importedIdentifiers.has('createOffroadWheelMesh'), 'Must import createOffroadWheelMesh');
  assert.ok(importedIdentifiers.has('createSuspensionKnuckle'), 'Must import createSuspensionKnuckle');
  assert.ok(importedIdentifiers.has('setupCarReactionJets'), 'Must import setupCarReactionJets');

  // Check usage order: xn must not be used before it is defined/imported
  let xnImportLine = -1;
  let firstXnUsageLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('DEFAULT_TEAM_COLORS as xn') && xnImportLine === -1) {
      xnImportLine = i + 1;
    }
    if ((line.includes('teamColors: xn') || line.includes('xn[Ni]')) && firstXnUsageLine === -1) {
      firstXnUsageLine = i + 1;
    }
  }

  assert.ok(xnImportLine > 0, 'xn import statement must be present');
  assert.ok(firstXnUsageLine > 0, 'first usage of xn must be found');
  assert.ok(
    xnImportLine < firstXnUsageLine,
    `xn must be imported (line ${xnImportLine}) before its usage (line ${firstXnUsageLine}) to avoid ReferenceError`
  );
});

test('4. Submodules (StadiumArena.js and VehicleAssembly.js) do not shadow ArenaWorld exports unexpectedly', () => {
  const arenaPath = path.join(SRC_DIR, 'entities/ArenaWorld.js');
  const stadiumPath = path.join(SRC_DIR, 'entities/StadiumArena.js');
  const vehiclePath = path.join(SRC_DIR, 'entities/VehicleAssembly.js');

  const arenaExports = parseModuleExports(arenaPath).exportedNames;
  const stadiumExports = parseModuleExports(stadiumPath).exportedNames;
  const vehicleExports = parseModuleExports(vehiclePath).exportedNames;

  // StadiumArena should not export WS or JS (already in ArenaWorld)
  assert.ok(!stadiumExports.has('WS'), 'StadiumArena.js should not re-export WS');
  assert.ok(!stadiumExports.has('JS'), 'StadiumArena.js should not re-export JS');

  // VehicleAssembly should not export xn, mg, gg, vg, jg (belong to ArenaWorld legacy aliases)
  assert.ok(!vehicleExports.has('xn'), 'VehicleAssembly.js should not export xn');
  assert.ok(!vehicleExports.has('mg'), 'VehicleAssembly.js should not export mg');
  assert.ok(!vehicleExports.has('gg'), 'VehicleAssembly.js should not export gg');
  assert.ok(!vehicleExports.has('vg'), 'VehicleAssembly.js should not export vg');
  assert.ok(!vehicleExports.has('jg'), 'VehicleAssembly.js should not export jg');
});
