#!/usr/bin/env node
// Configuration checks print names and boolean results, never values.
import fs from 'node:fs';
import { parseEnv } from 'node:util';
let failures=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failures++;};
try {
 const env=parseEnv(fs.readFileSync(process.argv[2]||process.env.NEON_ENV_FILE,'utf8'));
 let url;try{url=new URL(env.DATABASE_URL);}catch{}
 check('database configured',Boolean(url&&['postgres:','postgresql:'].includes(url.protocol)));
 check('Neon pooler configured',Boolean(url?.hostname.includes('-pooler.')));
 check('production target differs from test database',Boolean(url&&url.pathname!='/bezy_test'));
 check('bot token configured',Boolean(env.TELEGRAM_BOT_TOKEN));
 check('webhook secret configured',Boolean(env.TELEGRAM_WEBHOOK_SECRET));
 check('Mini App HTTPS configured',Boolean(env.BEZY_MINI_APP_URL?.startsWith('https://')));
 for(const [name,price] of [['MONTHLY',250],['QUARTERLY',600],['YEARLY',1900]])
   check(`${name} Stars price`,!env[`BEZY_PREMIUM_STARS_${name}`]||Number(env[`BEZY_PREMIUM_STARS_${name}`])===price);
}catch{check('configuration readable',false);}
console.log(JSON.stringify({failed:failures}));process.exitCode=failures?1:0;
