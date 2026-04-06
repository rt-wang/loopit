const { getConfig } = require('../lib/ai');

module.exports = async function handler(req, res) {
  res.status(200).json(getConfig());
};
