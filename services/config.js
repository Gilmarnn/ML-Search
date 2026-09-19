const { get, set } = require('./storage');
const defaultConfig={lookbackDays:30,minAgeDays:30,lowVisits30:25,highVisits30:200,minScore:55,competitorLimit:12,competitorMinSample:4,marketplaceFeePct:0,taxPct:0,fixedFee:0,packagingCost:0,minMarginPct:15,maxPriceDropPct:5,scheduledAnalysis:false,cronSchedule:'0 9 * * *'};
async function loadConfig(){return {...defaultConfig,...await get('config',{})}}
async function saveConfig(config){await set('config',{...defaultConfig,...config});return true}
module.exports={loadConfig,saveConfig,defaultConfig};
