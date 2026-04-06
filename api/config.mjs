import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getConfig } = require('../lib/ai.js');

export default async function handler(req, res) {
  res.status(200).json(getConfig(req.headers || {}));
}
