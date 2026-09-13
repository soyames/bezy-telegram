import crypto from 'node:crypto';
import { db } from './_firebase.js';
import { requirePost, requireTelegramUser, telegramApi, normalizedLanguage } from './_telegram.js';
import { premiumPlan, premiumPlans, premiumState, PREMIUM_BENEFITS, limitsFor, currentUsage, buildInvoicePayload } from './_premium.js';
import { rateLimit } from './_ratelimit.js';

const PLAN_LABELS = {
  en: { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' },
  fr: { monthly: 'Mensuel', quarterly: 'Trimestriel', yearly: 'Annuel' },
  de: { monthly: 'Monatlich', quarterly: 'Vierteljährlich', yearly: 'Jährlich' },
  es: { monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual' },
  it: { monthly: 'Mensile', quarterly: 'Trimestrale', yearly: 'Annuale' },
  pt: { monthly: 'Mensal', quarterly: 'Trimestral', yearly: 'Anual' },
  ru: { monthly: 'Ежемесячный', quarterly: 'Квартальный', yearly: 'Годовой' },
  pl: { monthly: 'Miesięczny', quarterly: 'Kwartalny', yearly: 'Roczny' },
  ar: { monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' },
  tr: { monthly: 'Aylık', quarterly: '3 Aylık', yearly: 'Yıllık' },
  sw: { monthly: 'Kila mwezi', quarterly: 'Kila robo mwaka', yearly: 'Kila mwaka' },
  yo: { monthly: 'Oṣooṣù', quarterly: 'Ìdámẹ́rin ọdún', yearly: 'Ọdọọdún' },
  hi: { monthly: 'मासिक', quarterly: 'त्रैमासिक', yearly: 'वार्षिक' },
  id: { monthly: 'Bulanan', quarterly: 'Tiga bulanan', yearly: 'Tahunan' },
  zh: { monthly: '按月', quarterly: '按季度', yearly: '按年' },
  ja: { monthly: '月額', quarterly: '3か月', yearly: '年額' },
  ko: { monthly: '월간', quarterly: '분기', yearly: '연간' }
};
const INVOICE_DESCRIPTION = {
  en: 'See who liked you, advanced discovery, more Super Likes, increased visibility and unlimited discovery.',
  fr: 'Voyez qui vous a liké, découverte avancée, plus de Super Likes, visibilité accrue et découverte illimitée.',
  de: 'Sieh, wer dich geliked hat, erweiterte Suche, mehr Super Likes, mehr Sichtbarkeit und unbegrenztes Entdecken.',
  es: 'Ve quién te ha dado like, descubrimiento avanzado, más Super Likes, más visibilidad y descubrimiento ilimitado.',
  it: 'Vedi chi ti ha messo like, scoperta avanzata, più Super Like, maggiore visibilità e scoperta illimitata.',
  pt: 'Vê quem gostou de ti, descoberta avançada, mais Super Likes, maior visibilidade e descoberta ilimitada.',
  ru: 'Смотри, кто тебя лайкнул, расширенные знакомства, больше Супер Лайков, больше заметности и безлимитные знакомства.',
  pl: 'Zobacz, kto cię polubił, zaawansowane odkrywanie, więcej Super Polubień, większa widoczność i nieograniczone odkrywanie.',
  ar: 'اعرف من أعجب بك، واكتشاف متقدم، وإعجابات سوبر أكثر، وظهور أكبر، واكتشاف غير محدود.',
  tr: 'Seni kimin beğendiğini gör, gelişmiş keşif, daha fazla Süper Beğeni, daha fazla görünürlük ve sınırsız keşif.',
  sw: 'Ona nani alikupenda, ugunduzi wa hali ya juu, Super Like zaidi, kuonekana zaidi na ugunduzi usio na kikomo.',
  yo: 'Wo ẹni tó fẹ́ràn rẹ, ìṣàwárí onípele, Súpà Like púpọ̀ sí i, ìhàn púpọ̀ sí i àti ìṣàwárí àìlópin.',
  hi: 'देखें किसने आपको पसंद किया, उन्नत खोज, अधिक सुपर लाइक, अधिक दृश्यता और असीमित खोज।',
  id: 'Lihat siapa yang menyukaimu, penjelajahan lanjutan, lebih banyak Super Like, visibilitas lebih tinggi, dan penjelajahan tanpa batas.',
  zh: '看看谁喜欢了你、高级发现、更多超级喜欢、更高曝光和无限发现。',
  ja: 'あなたをいいねした人、高度な発見、もっと多くのスーパーいいね、より高い露出、無制限の発見。',
  ko: '나를 좋아한 사람 보기, 고급 발견, 더 많은 슈퍼 좋아요, 더 높은 노출, 무제한 발견.'
};

export function publicPlans() {
  return Object.values(premiumPlans()).map((plan) => ({
    id: plan.id,
    stars: plan.stars,
    currency: plan.currency,
    durationMonths: plan.durationMonths,
    bestValue: plan.id === 'yearly'
  }));
}

async function statusResponse(res, userId) {
  const snap = await db().collection('users').doc(String(userId)).get();
  const data = snap.exists ? snap.data() : {};
  const state = premiumState(data);
  const limits = limitsFor(state.active);
  const usage = currentUsage(data);
  return res.status(200).json({
    ok: true,
    premium: state,
    benefits: PREMIUM_BENEFITS,
    plans: publicPlans(),
    limits,
    usage: {
      discoveryActions: usage.discoveryActions,
      superLikes: usage.superLikes,
      discoveryRemaining: Math.max(0, limits.discoveryActions - usage.discoveryActions),
      superLikesRemaining: Math.max(0, limits.superLikes - usage.superLikes)
    }
  });
}

// Creates a Telegram Stars invoice link. This grants nothing: Premium is activated only
// when the webhook receives and validates a successful_payment update.
async function createInvoice(req, res, user) {
  const plan = premiumPlan(req.body?.planId);
  if (!plan) return res.status(400).json({ error: 'INVALID_PLAN' });

  const language = normalizedLanguage(user.language_code);
  const nonce = crypto.randomUUID();
  const payload = buildInvoicePayload(plan.id, user.id, nonce);

  // The pending invoice is recorded before the link is issued so pre-checkout can verify
  // the plan and price against server state rather than trusting the echoed payload alone.
  await db().collection('bezyInvoices').doc(nonce).set({
    nonce,
    telegramUserId: String(user.id),
    planId: plan.id,
    stars: plan.stars,
    currency: plan.currency,
    payload,
    status: 'pending',
    createdAt: new Date()
  });

  const title = `Bezy Premium · ${(PLAN_LABELS[language] || PLAN_LABELS.en)[plan.id]}`;
  const invoiceLink = await telegramApi('createInvoiceLink', {
    title: title.slice(0, 32),
    description: (INVOICE_DESCRIPTION[language] || INVOICE_DESCRIPTION.en).slice(0, 255),
    payload,
    // Telegram Stars require an empty provider_token and exactly one price component.
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: title.slice(0, 32), amount: plan.stars }]
  });

  return res.status(200).json({
    ok: true,
    invoiceLink,
    plan: { id: plan.id, stars: plan.stars, currency: plan.currency, durationMonths: plan.durationMonths }
  });
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  try {
    const action = String(req.body?.action || 'status');
    if (action === 'status') {
      if (!(await rateLimit(db(), res, user.id, 'premium_status'))) return;
      return await statusResponse(res, user.id);
    }
    if (action === 'invoice') {
      if (!(await rateLimit(db(), res, user.id, 'premium_invoice'))) return;
      return await createInvoice(req, res, user);
    }
    return res.status(400).json({ error: 'INVALID_ACTION' });
  } catch (error) {
    console.error('Premium request failed:', error);
    return res.status(500).json({ error: 'PREMIUM_UNAVAILABLE' });
  }
}
