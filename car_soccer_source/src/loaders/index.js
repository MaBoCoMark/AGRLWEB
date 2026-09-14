/**
 * src/loaders/index.js
 * 3D Asset Loaders and Parsers (Phase 7.8 Deobfuscation)
 */

export * from './OBJLoader.js';
export * from './GLTFLoader.js';

// Explicitly disambiguate shared loader helpers
export { createDefaultLoadingManager } from './OBJLoader.js';
