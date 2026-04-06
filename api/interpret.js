const { interpretAndGenerate } = require('../lib/ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await interpretAndGenerate({
      headers: req.headers || {},
      musicSummary: req.body?.musicSummary,
      interpretation: req.body?.interpretation
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};
