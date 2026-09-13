// Relational fixtures for the real PostgreSQL suites. Reads return plain records;
// writes use SQL constraints and persist to the guarded disposable database.
import { testSql as sql, resetTestData } from './database.mjs';
export { resetTestData, sql };
const keys = { users: ['telegram_id'], profiles: ['telegram_id'], preferences: ['telegram_id'],
  notification_settings: ['telegram_id'], usage: ['telegram_id'], premium_memberships: ['telegram_id'],
  rate_limits: ['user_id'], matches: ['match_id'], conversations: ['conversation_id'],
  messages: ['conversation_id', 'client_id'], actions: ['actor_id', 'target_id'],
  blocks: ['blocker_id', 'blocked_id'], blocked_by: ['blocked_id', 'blocker_id'],
  likes_received: ['target_id', 'from_id'], reports: ['id'], bezy_payments: ['telegram_payment_charge_id'],
  bezy_invoices: ['nonce'], support_requests: ['reference'], prompt_answers: ['telegram_id', 'id'] };
const snake = key => key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
const camel = key => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
function predicate(table, values) {
  const columns = keys[table];
  if (!columns || values.length > columns.length) throw new Error('Unknown fixture table/key');
  return columns.slice(0, values.length).map((c, i) => `${c} = $${i + 1}`).join(' AND ') || 'TRUE';
}
function plain(table, row) {
  if (!row) return null;
  const result = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null).map(([k, v]) => [camel(k), v]));
  result.id = String(row[keys[table].at(-1)]);
  if (row.participant_a != null) result.participants = [String(row.participant_a), String(row.participant_b)];
  return result;
}
export async function getRow(table, ...values) {
  const result = await sql(`SELECT * FROM ${table} WHERE ${predicate(table, values)}`, values);
  const row = plain(table, result.rows[0]);
  if (!row) return null;
  if (table === 'users') {
    for (const [t, field] of [['profiles','profile'], ['preferences','preferences'], ['notification_settings','notifications'],
      ['premium_memberships','bezyPremium'], ['usage','usage']]) {
      const child = await getRow(t, ...values);
      if (child) { delete child.id; delete child.telegramId; row[field] = child; }
    }
    if (row.profile) row.profile.prompts = (await listRows('prompt_answers', values, null, 'position, id')).map(({id,answer}) => ({id,answer}));
  }
  if (table === 'conversations') {
    const reads = await sql('SELECT user_id, last_read_at FROM conversation_reads WHERE conversation_id=$1', values);
    row.lastRead = Object.fromEntries(reads.rows.map(r => [String(r.user_id), r.last_read_at]));
  }
  if (table === 'rate_limits') return { ...row.buckets, id: row.id };
  return row;
}
export async function listRows(table, values = [], filter = null, orderBy = null) {
  let where = predicate(table, values);
  const params = [...values];
  if (filter) {
    const [field, op, value] = filter;
    params.push(value);
    if (field === 'participants' && op === 'array-contains') where += ` AND (participant_a=$${params.length} OR participant_b=$${params.length})`;
    else {
      if (!/^[a-zA-Z]+$/.test(field) || op !== '==') throw new Error('Unsupported fixture filter');
      where += ` AND ${snake(field)}=$${params.length}`;
    }
  }
  if (orderBy && !/^[a-zA-Z_, ]+$/.test(orderBy)) throw new Error('Unsupported fixture order');
  return (await sql(`SELECT * FROM ${table} WHERE ${where}${orderBy ? ` ORDER BY ${orderBy}` : ''}`, params)).rows.map(r => plain(table, r));
}
export async function deleteRow(table, ...values) {
  return sql(`DELETE FROM ${table} WHERE ${predicate(table, values)}`, values);
}
async function upsert(table, keyValues, data) {
  const columns = keys[table];
  if (!columns) throw new Error('Unknown fixture table');
  const defaults = table === 'users' ? { createdAt: new Date(), updatedAt: new Date() }
    : ['matches','conversations','messages','actions','blocks','blocked_by','likes_received','reports','bezy_payments','bezy_invoices','support_requests'].includes(table) ? { createdAt: new Date() } : {};
  if (table === 'bezy_payments') Object.assign(defaults, {product:'bezy_premium', invoicePayload:'test_fixture', refundStatus:'none'});
  if (table === 'conversations') Object.assign(defaults, {updatedAt: new Date(), matchId:keyValues[0]});
  const fields = { ...defaults, ...data };
  delete fields.id;
  if (fields.participants) {
    const pair = fields.participants.map(String).sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
    fields.participantA = pair[0]; fields.participantB = pair[1]; delete fields.participants;
  }
  const entries = new Map(Object.entries(fields).map(([k,v]) => [snake(k), v]));
  columns.forEach((key, i) => entries.set(key, keyValues[i]));
  const names = [...entries.keys()];
  if (names.some(n => !/^[a-z_]+$/.test(n))) throw new Error('Invalid fixture column');
  const changes = names.filter(n => !columns.includes(n) && (Object.hasOwn(data,camel(n)) || n.startsWith('participant_')));
  if ((await sql(`SELECT 1 FROM ${table} WHERE ${predicate(table,keyValues)}`, keyValues)).rows.length) {
    if (changes.length) await sql(`UPDATE ${table} SET ${changes.map((n,i)=>`${n}=$${keyValues.length+i+1}`).join(',')} WHERE ${predicate(table,keyValues)}`, [...keyValues,...changes.map(n=>entries.get(n))]);
    return;
  }
  await sql(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map((_,i)=>'$'+(i+1)).join(',')})
    ON CONFLICT (${columns.join(',')}) ${changes.length ? 'DO UPDATE SET '+changes.map(n=>`${n}=EXCLUDED.${n}`).join(',') : 'DO NOTHING'}`, [...entries.values()]);
}
export async function seedRow(table, keyValues, data) {
  if (!Array.isArray(keyValues)) keyValues = [keyValues];
  if (table === 'users') {
    const {profile, preferences, notifications, bezyPremium, usage, ...user} = data;
    await upsert(table, keyValues, user);
    if (bezyPremium === null) await deleteRow('premium_memberships', ...keyValues);
    for (const [t, child] of [['profiles',profile],['preferences',preferences],['notification_settings',notifications],['premium_memberships',bezyPremium],['usage',usage]]) {
      if (!child) continue;
      const { prompts, ...fields } = child;
      await upsert(t, keyValues, fields);
      if (t === 'profiles' && prompts) {
        await deleteRow('prompt_answers', ...keyValues);
        for (const [position, prompt] of prompts.entries()) await upsert('prompt_answers', [...keyValues,prompt.id], {answer:prompt.answer, position});
      }
    }
    return;
  }
  if (table === 'rate_limits') return upsert(table, keyValues, { buckets: data });
  return upsert(table, keyValues, data);
}
