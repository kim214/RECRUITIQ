const localStore = require('./localStore');

let store = localStore;

function useSupabase() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  return !!(url && key && !url.includes('your-project') && !key.includes('your-service'));
}

async function initDb() {
  if (useSupabase()) {
    try {
      const supabaseStore = require('./supabaseStore');
      await supabaseStore.init();
      store = supabaseStore;
      console.log('Database: Supabase connected');
    } catch (err) {
      console.warn('Supabase init failed, using local store:', err.message);
      store = localStore;
      console.log('Database: Local JSON store (backend/data/db.json)');
    }
  } else {
    store = localStore;
    console.log('Database: Local JSON store (backend/data/db.json)');
    console.log('Tip: Set SUPABASE_URL + SUPABASE_SERVICE_KEY in .env for Supabase');
  }
}

function getDb() {
  return store;
}

module.exports = { initDb, getDb, useSupabase };
