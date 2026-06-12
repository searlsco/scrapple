// Sharp stub - prevents native compilation of the real sharp package.
// Scrapple never uses image processing from the Transformers dependency.
module.exports = new Proxy({}, {
  get(_, prop) {
    if (prop === '__esModule') return false;
    throw new Error(`sharp stub: "${String(prop)}" is not implemented`);
  }
});
