// How big is the pool the Pi app's deck draws from? Read-only.
import fs from 'node:fs'; import pg from 'pg';
const env=Object.fromEntries(fs.readFileSync(process.argv[2],'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const a=l.indexOf('=');return [l.slice(0,a).trim(), l.slice(a+1).trim().replace(/^"|"$/g,'')]}));
const c=new pg.Client({host:env.PGHOST_UNPOOLED||env.PGHOST,user:env.PGUSER,password:env.PGPASSWORD,database:env.PGDATABASE||'postgres',ssl:true});
await c.connect();
const q=async(sql)=>(await c.query(sql)).rows;
console.log('profiles by provider:');
for (const r of await q(`SELECT provider, count(*)::int AS n FROM bezy_social_profiles GROUP BY provider ORDER BY provider`)) console.log(`  ${r.provider.padEnd(10)} ${r.n}`);
console.log('discoverable members (the deck pool):');
for (const r of await q(`SELECT provider, count(*)::int AS n FROM bezy_media_members WHERE discoverable AND adult_confirmed GROUP BY provider ORDER BY provider`)) console.log(`  ${r.provider.padEnd(10)} ${r.n}`);
console.log('narrow-area profiles left:', (await q(`SELECT count(*)::int AS n FROM bezy_social_profiles WHERE widen_area=false`))[0].n);
console.log('photos stored:', (await q(`SELECT count(*)::int AS n FROM bezy_media_photos`))[0].n);
await c.end();
