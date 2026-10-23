require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

async function start() {
  const { initDb } = require('./lib/db');
  await initDb();
  const { kick } = require('./lib/analysisQueue');
  app.listen(PORT, () => {
    console.log(`RecruitIQ API running at http://localhost:${PORT}`);
    console.log(`Open app: http://localhost:${PORT}/frontend/home/index.html`);
    kick();
    const { warmupModels } = require('./lib/ai/ollamaProvider');
    warmupModels();
  });
}

start();
