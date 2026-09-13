import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { query, tx, closeDb, databaseHealth } from '../api/_db.js';
import { planRetention, applyRetention } from '../api/_retention.js';
import { planProfileReminders, sendProfileReminders } from '../api/_reminders.js';
import { triageTransition, REPORT_STATUSES } from '../api/_moderation.js';
import { SUPPORT_STATUSES } from '../api/_support.js';
import { applyRefund } from '../api/_premium.js';
import { telegramApi } from '../api/_telegram.js';

export function loadOperatorEnv() {
  if (process.env.NEON_ENV_FILE) {
    const env = parseEnv(fs.readFileSync(process.env.NEON_ENV_FILE, 'utf8'));
    process.env.DATABASE_URL ||= env.DATABASE_URL;
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
}

export async function runOperator(command, args = process.argv.slice(2)) {
  const value = flag => args.includes(flag) ? args[args.indexOf(flag)+1] : null;
  try {
    loadOperatorEnv();
    if (command === 'health') {
      const health = await databaseHealth();
      if (health.reachable) {
        const version = await query('SELECT max(version)::int AS version FROM schema_versions');
        health.compatible = version.rows[0].version === 2;
      }
      console.log(JSON.stringify(health));
      if (!health.reachable || !health.compatible) process.exitCode = 1;
    } else if (command === 'retention') {
      const protectedIds = (value('--protect') || '').split(',').filter(Boolean);
      const plan = await planRetention(null,{protectedIds});
      console.log(JSON.stringify({mode:args.includes('--apply')?'apply':'dry-run',counts:Object.fromEntries(Object.entries(plan).filter(([,v])=>Array.isArray(v)&&v.every(x=>typeof x==='string')).map(([k,v])=>[k,v.length])),skipped:plan.skipped}));
      if (args.includes('--apply')) console.log(JSON.stringify(await applyRetention(null,plan)));
    } else if (command === 'reminders') {
      const plan = await planProfileReminders(null,{limit:Math.min(200,Math.max(1,Number(value('--limit'))||200)),protectedIds:(value('--protect')||'').split(',').filter(Boolean)});
      console.log(JSON.stringify({eligible:plan.users.length,mode:args.includes('--apply')?'apply':'dry-run'}));
      if (args.includes('--apply')) console.log(JSON.stringify(await sendProfileReminders(null,plan)));
    } else if (command === 'support' || command === 'reports') {
      const support = command === 'support';
      const table = support ? 'support_requests' : 'reports';
      const key = support ? 'reference' : 'id';
      const states = support ? SUPPORT_STATUSES : REPORT_STATUSES;
      const move = support ? '--move' : args.includes('--resolve') ? '--resolve' : '--dismiss';
      if (args.includes(move)) {
        const recordId = value(move);
        const next = support ? args[args.indexOf(move)+2] : move==='--resolve'?'resolved':'dismissed';
        if (!states.includes(next)) throw new Error('INVALID_STATUS');
        await tx(async q => {
          const current = await q(`SELECT status FROM ${table} WHERE ${key}=$1 FOR UPDATE`,[recordId]);
          if (!current.rows.length) throw new Error('RECORD_NOT_FOUND');
          if (!support && triageTransition(current.rows[0].status,next,value('--note')).error) throw new Error('INVALID_TRANSITION');
          await q(`UPDATE ${table} SET status=$1,status_updated_at=now(),status_note=$2 WHERE ${key}=$3`,[next,String(value('--note')||'').slice(0,500),recordId]);
        });
        console.log(JSON.stringify({updated:1,status:next}));
      } else {
        const status = value('--status') || (args.includes('--all')?null:'open');
        if (status && !states.includes(status)) throw new Error('INVALID_STATUS');
        const rows = await query(`SELECT ${key} AS reference,${support?'category':'reason'},status,created_at FROM ${table}
          WHERE ($1::text IS NULL OR status=$1) ORDER BY created_at DESC LIMIT 100`,[status]);
        console.log(JSON.stringify(rows.rows));
      }
    } else if (command === 'refund') {
      const chargeId = args.find(a=>!a.startsWith('--'));
      if (!chargeId) throw new Error('CHARGE_REQUIRED');
      const rows = await query('SELECT telegram_user_id,refund_status,plan_id,stars,currency FROM bezy_payments WHERE telegram_payment_charge_id=$1',[chargeId]);
      const payment = rows.rows[0];
      if (!payment) throw new Error('UNKNOWN_PAYMENT');
      console.log(JSON.stringify({plan:payment.plan_id,stars:payment.stars,currency:payment.currency,status:payment.refund_status}));
      if (!args.includes('--apply') || payment.refund_status==='refunded') return;
      try { await telegramApi('refundStarPayment',{user_id:String(payment.telegram_user_id),telegram_payment_charge_id:chargeId}); }
      catch {
        await query("UPDATE bezy_payments SET refund_status='failed',refund_failed_at=now(),refund_failure_reason='TELEGRAM_REFUND_UNCONFIRMED' WHERE telegram_payment_charge_id=$1",[chargeId]);
        throw new Error('TELEGRAM_REFUND_UNCONFIRMED');
      }
      const result = await applyRefund(null,chargeId,{source:'admin_script'});
      console.log(JSON.stringify({outcome:result.outcome,revoked:result.revoked}));
    } else if (command === 'report-stats') {
      console.log(JSON.stringify((await query('SELECT reason,status,count(*)::int AS count FROM reports GROUP BY reason,status ORDER BY reason,status')).rows));
    } else if (command === 'rate-limits') {
      console.log(JSON.stringify((await query(`SELECT bucket.key AS category,count(*)::int AS accounts,sum((bucket.value->>'c')::int)::int AS requests
        FROM rate_limits CROSS JOIN LATERAL jsonb_each(buckets) bucket GROUP BY bucket.key ORDER BY bucket.key`)).rows));
    } else if (['outcomes','funnel','discover','matches'].includes(command)) {
      // Derived counts only: no new events, tracking identifiers or chat text.
      const metrics = await query(`SELECT
        (SELECT count(*)::int FROM users) AS accounts,
        (SELECT count(*)::int FROM users WHERE profile_complete AND age_eligibility_confirmed) AS completed_profiles,
        (SELECT count(*)::int FROM users WHERE discoverable AND profile_complete AND NOT processing_restricted AND NOT processing_objection) AS discoverable_profiles,
        (SELECT count(DISTINCT actor_id)::int FROM actions) AS members_with_discovery_decisions,
        (SELECT count(*)::int FROM actions WHERE action IN ('like','super')) AS likes,
        (SELECT count(*)::int FROM matches) AS matches,
        (SELECT count(*)::int FROM matches WHERE active) AS active_matches,
        (SELECT count(DISTINCT conversation_id)::int FROM messages) AS conversations_with_first_message,
        (SELECT count(*)::int FROM (SELECT conversation_id FROM messages GROUP BY conversation_id HAVING count(DISTINCT sender_id)>1) replies) AS conversations_with_reply,
        (SELECT count(*)::int FROM conversations WHERE status='open' AND last_message_at < now()-interval '7 days') AS quiet_conversations,
        (SELECT count(*)::int FROM premium_memberships WHERE active AND expires_at>now()) AS active_premium,
        (SELECT count(DISTINCT telegram_user_id)::int FROM bezy_payments WHERE status='processed') AS paying_members,
        (SELECT count(*)::int FROM support_requests) AS support_requests`);
      console.log(JSON.stringify({derived:metrics.rows[0],limitations:['Discovery opens are not recorded.','Deleted activity is excluded; retained evidence can outlive accounts.','Counts are descriptive, not causal conversion attribution.']}));
    } else throw new Error('UNKNOWN_OPERATION');
  } catch { console.error(JSON.stringify({operation:command,error:'OPERATION_FAILED'})); process.exitCode=1; }
  finally { await closeDb(); }
}
