const { Pool } = require('pg');

let pool = null;
let ready = null;
function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false } });
  return pool;
}
async function initStorage() {
  if (!ready) ready = db().query(`CREATE TABLE IF NOT EXISTS meli_auto_store (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await ready;
}
async function get(key, fallback) { await initStorage(); const r=await db().query('SELECT value FROM meli_auto_store WHERE key=$1',[key]); return r.rows[0]?.value ?? fallback; }
async function set(key, value) { await initStorage(); await db().query(`INSERT INTO meli_auto_store(key,value,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,[key,JSON.stringify(value)]); return value; }
async function del(key) { await initStorage(); await db().query('DELETE FROM meli_auto_store WHERE key=$1',[key]); }
async function saveAuth(v){return set('auth',v)}
async function loadAuth(){return get('auth',null)}
async function clearAuth(){return del('auth')}
async function appendHistory(entry){const h=await get('history',[]);h.push({timestamp:new Date().toISOString(),...entry});if(h.length>1000)h.splice(0,h.length-1000);await set('history',h)}
async function readHistory(limit=100){const h=await get('history',[]);return h.slice(-Math.max(1,limit)).reverse()}
async function saveRecommendations(v){return set('recommendations',v)}
async function loadRecommendations(){return get('recommendations',{generatedAt:null,summary:{},items:[]})}
async function loadCosts(){return get('costs',{})}
async function saveCost(itemId,cost){const costs=await loadCosts(),v=Number(cost);if(!Number.isFinite(v)||v<=0)delete costs[itemId];else costs[itemId]=v;await set('costs',costs);return costs[itemId]||null}
module.exports={initStorage,saveAuth,loadAuth,clearAuth,appendHistory,readHistory,saveRecommendations,loadRecommendations,loadCosts,saveCost,get,set};
