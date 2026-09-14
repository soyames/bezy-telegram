#!/usr/bin/env node
// Requires an existing dedicated database. Never connects to an application database.
import fs from 'node:fs';
import {testSql,closeTestDb} from '../tests/database.mjs';
try {
 await testSql('SELECT 1');
 if(process.argv.includes('--reset')) await testSql('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 const exists=await testSql("SELECT to_regclass('public.users') IS NOT NULL AS present");
 if(!exists.rows[0].present) await testSql(fs.readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
 // Every numbered migration, in order. Each one is idempotent, so a repeat run is a no-op.
 const dir=new URL('../db/',import.meta.url);
 for(const file of fs.readdirSync(dir).filter(n=>/^\d{3}-.*\.sql$/.test(n)).sort()) await testSql(fs.readFileSync(new URL(file,dir),'utf8'));
 console.log('Dedicated test database schema ready.');
}catch{console.error('TEST_DATABASE_SETUP_FAILED');process.exitCode=1;}finally{await closeTestDb();}
