export const createRequire = () => () => ({
  readFileSync: () => new Uint8Array(),
  existsSync: () => false
});
export default { createRequire };
