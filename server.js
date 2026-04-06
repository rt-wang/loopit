const express = require('express');
const app = express();
const PORT = 3000;
const { getConfig, interpretAndGenerate } = require('./lib/ai');

// Load .env manually (no dotenv dependency)
const fs = require('fs');
const path = require('path');
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) {
      process.env[key.trim()] = val.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
} catch (e) {
  // .env is optional: public deployments can rely on per-user keys from the client.
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json(getConfig(req.headers));
});

app.post('/api/interpret', async (req, res) => {
  try {
    const result = await interpretAndGenerate({
      headers: req.headers,
      musicSummary: req.body?.musicSummary,
      interpretation: req.body?.interpretation
    });
    return res.json(result);
  } catch (err) {
    console.error('API error:', err);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Synesthetic Loop server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
