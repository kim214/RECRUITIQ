require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

async function start() {
  const { initDb } = require('./lib/db');
  await initDb();
  app.listen(PORT, () => {
    console.log(`Reqruit IQ API running at http://localhost:${PORT}`);
    console.log(`Open app: http://localhost:${PORT}/frontend/home/index.html`);
  });
}

start();
