import { query, tx, ApiError } from './_db.js';
import { requirePost, requireTelegramUser, normalizedLanguage, localized } from './_telegram.js';
import { premiumState } from './_premium.js';
import { rateLimit } from './_ratelimit.js';
import { notificationSettings, deliverNotification } from './_notify.js';

// Data-subject rights that Bezy can genuinely honour automatically:
//   action: 'export'   — GDPR Art. 15 access / Art. 20 portability, as machine-readable JSON
//   action: 'delete'   — GDPR Art. 17 erasure
//   action: 'restrict' / 'unrestrict' — GDPR Art. 18 restriction of processing
//   action: 'object' / 'unobject'     — GDPR Art. 21 objection to processing
//
// Rights that need a human (rectification beyond profile editing, complaints) are handled by
// contacts@digitalconcordia.com and are described in the Mini App and the Privacy Policy.
// Nothing here promises automation that does not exist.

const DELETE_CONFIRMATION = 'DELETE';

/**
 * Account-event confirmations. These ride the transactional `account` category, which the
 * user cannot switch off: a pause, an objection or a deletion happened to the user's own
 * account, and the bot message is the durable record of it. Sent only when the state
 * actually changed — an idempotent repeat is not a new event and gets no new message.
 */
function accountEventMessages(language) {
  return localized(language, {
    en: {
      restricted: 'Processing is now paused. Bezy is storing your data and using none of it. Resume anytime in Bezy → Profile → Safety & privacy.',
      unrestricted: 'Processing has resumed. Turn on “Show my profile in Discover” when you are ready to be seen again.',
      objected: 'Your objection is recorded. Bezy has stopped processing your data for discovery and matching. Withdraw it anytime in Bezy → Profile → Safety & privacy.',
      unobjected: 'Your objection has been withdrawn. Turn on “Show my profile in Discover” when you are ready to be seen again.',
      deleted: 'Your Bezy account has been deleted. Your profile, likes, passes, matches and blocks are gone. Payment records are kept for accounting. Goodbye 💜'
    },
    fr: {
      restricted: 'Le traitement est maintenant suspendu. Bezy conserve vos données et n’en utilise aucune. Reprenez à tout moment dans Bezy → Profil → Sécurité et confidentialité.',
      unrestricted: 'Le traitement a repris. Activez « Montrer mon profil dans Découvrir » quand vous êtes prêt·e à être vu·e à nouveau.',
      objected: 'Votre opposition est enregistrée. Bezy a cessé de traiter vos données pour la découverte et les matchs. Retirez-la à tout moment dans Bezy → Profil → Sécurité et confidentialité.',
      unobjected: 'Votre opposition a été retirée. Activez « Montrer mon profil dans Découvrir » quand vous êtes prêt·e à être vu·e à nouveau.',
      deleted: 'Votre compte Bezy a été supprimé. Votre profil, vos likes, vos passes, vos matchs et vos blocages ont été effacés. Les paiements sont conservés pour la comptabilité. Au revoir 💜'
    },
    de: {
      restricted: 'Die Verarbeitung ist jetzt pausiert. Bezy speichert deine Daten und nutzt keine davon. Setze sie jederzeit fort unter Bezy → Profil → Sicherheit & Datenschutz.',
      unrestricted: 'Die Verarbeitung wurde fortgesetzt. Aktiviere „Mein Profil in Entdecken anzeigen“, wenn du wieder sichtbar sein möchtest.',
      objected: 'Dein Widerspruch ist erfasst. Bezy hat die Verarbeitung deiner Daten für Entdecken und Matches gestoppt. Ziehe ihn jederzeit zurück unter Bezy → Profil → Sicherheit & Datenschutz.',
      unobjected: 'Dein Widerspruch wurde zurückgezogen. Aktiviere „Mein Profil in Entdecken anzeigen“, wenn du wieder sichtbar sein möchtest.',
      deleted: 'Dein Bezy-Konto wurde gelöscht. Dein Profil, deine Likes, deine übersprungenen Profile, deine Matches und deine Blockierungen sind entfernt. Zahlungsdatensätze werden für die Buchhaltung aufbewahrt. Auf Wiedersehen 💜'
    },
    es: {
      restricted: 'El tratamiento ya está pausado. Bezy guarda tus datos y no usa ninguno. Reanúdalo cuando quieras en Bezy → Perfil → Seguridad y privacidad.',
      unrestricted: 'El tratamiento se ha reanudado. Activa «Mostrar mi perfil en Descubrir» cuando quieras que te vuelvan a ver.',
      objected: 'Tu oposición ha quedado registrada. Bezy ha dejado de tratar tus datos para el descubrimiento y los matches. Retírala cuando quieras en Bezy → Perfil → Seguridad y privacidad.',
      unobjected: 'Tu oposición ha sido retirada. Activa «Mostrar mi perfil en Descubrir» cuando quieras que te vuelvan a ver.',
      deleted: 'Tu cuenta de Bezy ha sido eliminada. Tu perfil, tus likes, tus descartes, tus matches y tus bloqueos ya no existen. Los registros de pago se conservan por motivos contables. Hasta pronto 💜'
    },
    it: {
      restricted: 'Il trattamento è ora in pausa. Bezy conserva i tuoi dati e non ne usa nessuno. Riprendilo in qualsiasi momento in Bezy → Profilo → Sicurezza e privacy.',
      unrestricted: 'Il trattamento è ripreso. Attiva «Mostra il mio profilo in Scopri» quando vuoi essere di nuovo visibile.',
      objected: 'La tua opposizione è stata registrata. Bezy ha smesso di trattare i tuoi dati per la scoperta e i match. Ritirala in qualsiasi momento in Bezy → Profilo → Sicurezza e privacy.',
      unobjected: 'La tua opposizione è stata ritirata. Attiva «Mostra il mio profilo in Scopri» quando vuoi essere di nuovo visibile.',
      deleted: 'Il tuo account Bezy è stato eliminato. Il tuo profilo, i tuoi like, i profili scartati, i tuoi match e i tuoi blocchi non ci sono più. Le registrazioni dei pagamenti vengono conservate a fini contabili. Arrivederci 💜'
    },
    pt: {
      restricted: 'O tratamento está agora pausado. A Bezy guarda os teus dados e não usa nenhum. Retoma quando quiseres na Bezy → Perfil → Segurança e privacidade.',
      unrestricted: 'O tratamento foi retomado. Ativa «Mostrar o meu perfil no Descobrir» quando quiseres voltar a ser visto.',
      objected: 'A tua oposição ficou registada. A Bezy deixou de tratar os teus dados para a descoberta e os matches. Retira-a quando quiseres na Bezy → Perfil → Segurança e privacidade.',
      unobjected: 'A tua oposição foi retirada. Ativa «Mostrar o meu perfil no Descobrir» quando quiseres voltar a ser visto.',
      deleted: 'A tua conta Bezy foi eliminada. O teu perfil, os teus likes, os perfis que passaste, os teus matches e os teus bloqueios desapareceram. Os registos de pagamento são guardados para a contabilidade. Adeus 💜'
    },
    ru: {
      restricted: 'Обработка теперь приостановлена. Bezy хранит твои данные и не использует их. Возобнови в любой момент в Bezy → Профиль → Безопасность и конфиденциальность.',
      unrestricted: 'Обработка возобновлена. Включи «Показывать мой профиль в „Знакомствах“», когда захочешь снова быть видимым.',
      objected: 'Твоё возражение зарегистрировано. Bezy прекратил обработку твоих данных для знакомств и мэтчей. Отзови его в любой момент в Bezy → Профиль → Безопасность и конфиденциальность.',
      unobjected: 'Твоё возражение отозвано. Включи «Показывать мой профиль в „Знакомствах“», когда захочешь снова быть видимым.',
      deleted: 'Твой аккаунт Bezy удалён. Твой профиль, лайки, пропуски, мэтчи и блокировки исчезли. Записи о платежах хранятся для бухгалтерии. До свидания 💜'
    },
    pl: {
      restricted: 'Przetwarzanie jest teraz wstrzymane. Bezy przechowuje twoje dane i nie używa żadnych. Wznów w każdej chwili w Bezy → Profil → Bezpieczeństwo i prywatność.',
      unrestricted: 'Przetwarzanie wznowione. Włącz «Pokazuj mój profil w Odkrywaniu», gdy zechcesz być znów widoczny.',
      objected: 'Twój sprzeciw został zarejestrowany. Bezy przestało przetwarzać twoje dane do odkrywania i dopasowań. Cofnij go w każdej chwili w Bezy → Profil → Bezpieczeństwo i prywatność.',
      unobjected: 'Twój sprzeciw został cofnięty. Włącz «Pokazuj mój profil w Odkrywaniu», gdy zechcesz być znów widoczny.',
      deleted: 'Twoje konto Bezy zostało usunięte. Twój profil, polubienia, pominięcia, dopasowania i blokady zniknęły. Zapisy płatności są przechowywane do celów księgowych. Do widzenia 💜'
    },
    ar: {
      restricted: 'المعالجة متوقفة الآن. تحتفظ Bezy ببياناتك ولا تستخدم أيًا منها. استأنفها في أي وقت من Bezy ← الملف الشخصي ← الأمان والخصوصية.',
      unrestricted: 'استُؤنفت المعالجة. فعّل «إظهار ملفي في اكتشف» عندما تريد أن تكون مرئيًا مجددًا.',
      objected: 'تم تسجيل اعتراضك. توقفت Bezy عن معالجة بياناتك للاكتشاف والمطابقات. اسحبه في أي وقت من Bezy ← الملف الشخصي ← الأمان والخصوصية.',
      unobjected: 'تم سحب اعتراضك. فعّل «إظهار ملفي في اكتشف» عندما تريد أن تكون مرئيًا مجددًا.',
      deleted: 'تم حذف حسابك في Bezy. ملفك وإعجاباتك وتجاوزاتك ومطابقاتك وحظوراتك لم تعد موجودة. تُحفظ سجلات الدفع للمحاسبة. وداعًا 💜'
    },
    tr: {
      restricted: 'İşleme artık duraklatıldı. Bezy verilerini saklıyor ve hiçbirini kullanmıyor. İstediğin zaman Bezy → Profil → Güvenlik ve gizlilik\'ten sürdürebilirsin.',
      unrestricted: 'İşleme devam ediyor. Yeniden görünmek istediğinde «Profilimi Keşfet\'te göster»i aç.',
      objected: 'İtirazın kaydedildi. Bezy verilerini keşif ve eşleşme için işlemeyi bıraktı. İstediğin zaman Bezy → Profil → Güvenlik ve gizlilik\'ten geri çekebilirsin.',
      unobjected: 'İtirazın geri çekildi. Yeniden görünmek istediğinde «Profilimi Keşfet\'te göster»i aç.',
      deleted: 'Bezy hesabın silindi. Profilin, beğenilerin, geçtiklerin, eşleşmelerin ve engellemelerin gitti. Ödeme kayıtları muhasebe için saklanır. Hoşça kal 💜'
    },
    sw: {
      restricted: 'Uchakataji sasa umesimamishwa. Bezy huhifadhi data zako na hazitumii hata moja. Uendeleze wakati wowote kwenye Bezy → Wasifu → Usalama na faragha.',
      unrestricted: 'Uchakataji umeendelea. Washa «Onyesha wasifu wangu kwenye Gundua» unapotaka kuonekana tena.',
      objected: 'Pingamizi lako limerekodiwa. Bezy imeacha kuchakata data zako kwa ugunduzi na mechi. Liondoe wakati wowote kwenye Bezy → Wasifu → Usalama na faragha.',
      unobjected: 'Pingamizi lako limeondolewa. Washa «Onyesha wasifu wangu kwenye Gundua» unapotaka kuonekana tena.',
      deleted: 'Akaunti yako ya Bezy imefutwa. Wasifu wako, kupenda kwako, kupita kwako, mechi zako na vizuizi vyako vimeondoka. Rekodi za malipo huhifadhiwa kwa uhasibu. Kwaheri 💜'
    },
    yo: {
      restricted: 'Ìlò ti dá dúró báyìí. Bezy ń tọ́jú àwọn dátà rẹ, kò sì lo ìkankan nínú wọn. Tún un bẹ̀rẹ̀ nígbàkigbà nínú Bezy → Àkọọ́lẹ̀ → Ààbò àti àṣírí.',
      unrestricted: 'Ìlò ti tún bẹ̀rẹ̀. Tan «Fi àkọọ́lẹ̀ mi hàn nínú Ṣàwárí» nígbà tí o bá fẹ́ hàn lẹ́ẹ̀kan sí i.',
      objected: 'A ti gba ìtako rẹ sílẹ̀. Bezy ti dá lílo àwọn dátà rẹ fún ìṣàwárí àti mátìsì dúró. Yọ ọ́ kúrò nígbàkigbà nínú Bezy → Àkọọ́lẹ̀ → Ààbò àti àṣírí.',
      unobjected: 'A ti yọ ìtako rẹ kúrò. Tan «Fi àkọọ́lẹ̀ mi hàn nínú Ṣàwárí» nígbà tí o bá fẹ́ hàn lẹ́ẹ̀kan sí i.',
      deleted: 'A ti pa àkọọ́lẹ̀ Bezy rẹ rẹ́. Àkọọ́lẹ̀ rẹ, àwọn like rẹ, àwọn pass rẹ, àwọn mátìsì rẹ àti àwọn ìdínà rẹ ti lọ. Wọ́n ń tọ́jú àwọn àkọsílẹ̀ ìsanwó fún iṣirò. Ó dìgbà 💜'
    },
    hi: {
      restricted: 'प्रोसेसिंग अब रुकी हुई है। Bezy आपका डेटा रखता है और कुछ भी उपयोग नहीं करता। कभी भी Bezy → प्रोफ़ाइल → सुरक्षा और गोपनीयता में फिर शुरू करें।',
      unrestricted: 'प्रोसेसिंग फिर शुरू हुई। जब फिर दिखना चाहें तो «मेरी प्रोफ़ाइल खोजें में दिखाएँ» चालू करें।',
      objected: 'आपकी आपत्ति दर्ज हो गई। Bezy ने खोज और मैच के लिए आपका डेटा प्रोसेस करना बंद कर दिया। कभी भी Bezy → प्रोफ़ाइल → सुरक्षा और गोपनीयता में वापस लें।',
      unobjected: 'आपकी आपत्ति वापस ली गई। जब फिर दिखना चाहें तो «मेरी प्रोफ़ाइल खोजें में दिखाएँ» चालू करें।',
      deleted: 'आपका Bezy खाता हटा दिया गया। आपकी प्रोफ़ाइल, लाइक, छोड़े गए, मैच और ब्लॉक हट गए। भुगतान रिकॉर्ड लेखा-जोखा के लिए रखे जाते हैं। अलविदा 💜'
    },
    id: {
      restricted: 'Pemrosesan sekarang dijeda. Bezy menyimpan datamu dan tidak memakai satu pun. Lanjutkan kapan saja di Bezy → Profil → Keamanan dan privasi.',
      unrestricted: 'Pemrosesan dilanjutkan. Aktifkan «Tampilkan profilku di Jelajahi» saat kamu ingin terlihat lagi.',
      objected: 'Keberatanmu tercatat. Bezy berhenti memproses datamu untuk penjelajahan dan kecocokan. Tarik kapan saja di Bezy → Profil → Keamanan dan privasi.',
      unobjected: 'Keberatanmu ditarik. Aktifkan «Tampilkan profilku di Jelajahi» saat kamu ingin terlihat lagi.',
      deleted: 'Akun Bezy-mu dihapus. Profil, suka, lewatan, kecocokan, dan blokiranmu hilang. Catatan pembayaran disimpan untuk pembukuan. Selamat tinggal 💜'
    },
    zh: {
      restricted: '处理现已暂停。Bezy 保存你的数据且不使用其中任何内容。随时可在 Bezy → 个人资料 → 安全与隐私中恢复。',
      unrestricted: '处理已恢复。想再次被看到时，打开「在发现中展示我的资料」。',
      objected: '你的反对已记录。Bezy 已停止将你的数据用于发现和配对。随时可在 Bezy → 个人资料 → 安全与隐私中撤回。',
      unobjected: '你的反对已撤回。想再次被看到时，打开「在发现中展示我的资料」。',
      deleted: '你的 Bezy 账户已删除。你的资料、喜欢、跳过、配对和屏蔽已不复存在。付款记录为会计目的保留。再见 💜'
    },
    ja: {
      restricted: '処理は現在停止中です。Bezy はデータを保管するだけで使用しません。Bezy → プロフィール → 安全とプライバシーからいつでも再開できます。',
      unrestricted: '処理を再開しました。再び表示されたいときは「プロフィールを発見に表示」をオンにしてください。',
      objected: '異議を記録しました。Bezy は発見とマッチのためのデータ処理を停止しました。Bezy → プロフィール → 安全とプライバシーからいつでも取り下げられます。',
      unobjected: '異議を取り下げました。再び表示されたいときは「プロフィールを発見に表示」をオンにしてください。',
      deleted: 'Bezy アカウントを削除しました。プロフィール、いいね、スキップ、マッチ、ブロックは削除されました。支払い記録は会計のために保管されます。さようなら 💜'
    },
    ko: {
      restricted: '처리가 일시 중지되었습니다. Bezy는 데이터를 보관만 하고 사용하지 않습니다. Bezy → 프로필 → 안전 및 개인정보에서 언제든 재개하세요.',
      unrestricted: '처리가 재개되었습니다. 다시 보이길 원할 때 «프로필을 발견에 표시»를 켜세요.',
      objected: '이의가 기록되었습니다. Bezy가 발견과 매치를 위한 데이터 처리를 중단했습니다. Bezy → 프로필 → 안전 및 개인정보에서 언제든 철회하세요.',
      unobjected: '이의를 철회했습니다. 다시 보이길 원할 때 «프로필을 발견에 표시»를 켜세요.',
      deleted: 'Bezy 계정이 삭제되었습니다. 프로필, 좋아요, 넘김, 매치, 차단이 사라졌습니다. 결제 기록은 회계 목적으로 보관됩니다. 안녕히 가세요 💜'
    }
  });
}

function sendAccountEvent(storage, userData, key) {
  // The user's explicit Bezy choice wins over their Telegram language.
  return deliverNotification(null, userData, 'account', { text: accountEventMessages(normalizedLanguage(userData?.locale || userData?.languageCode))[key] });
}

function iso(value) {
  const ms = value?.toMillis?.() ?? (value instanceof Date ? value.getTime() : null);
  return ms ? new Date(ms).toISOString() : null;
}

/**
 * Everything Bezy holds about the caller, assembled from their own records only.
 * Other people's personal data is never included: likes received are returned as a count,
 * and matches expose only the counterpart's Telegram id, which the user already has.
 */
async function exportData(storage, userId) {
  const [userResult, profileResult, promptResult, prefsResult, nsResult, premiumResult, usageResult] = await Promise.all([
    query('SELECT * FROM users WHERE telegram_id = $1', [userId]),
    query('SELECT * FROM profiles WHERE telegram_id = $1', [userId]),
    query('SELECT id, answer FROM prompt_answers WHERE telegram_id = $1 ORDER BY position, id', [userId]),
    query('SELECT * FROM preferences WHERE telegram_id = $1', [userId]),
    query('SELECT * FROM notification_settings WHERE telegram_id = $1', [userId]),
    query('SELECT * FROM premium_memberships WHERE telegram_id = $1', [userId]),
    query('SELECT * FROM usage WHERE telegram_id = $1', [userId])
  ]);
  const u = userResult.rows[0];
  if (!u) return { account: null, note: 'No Bezy account exists for this Telegram user.' };
  const p = profileResult.rows[0] || {};
  const pr = prefsResult.rows[0] || {};
  const ns = nsResult.rows[0] || {};
  const pm = premiumResult.rows[0] || null;
  const us = usageResult.rows[0] || null;

  const data = {
    telegramId: String(u.telegram_id),
    firstName: u.first_name ?? null,
    lastName: u.last_name ?? null,
    username: u.username ?? null,
    languageCode: u.language_code ?? null,
    locale: u.locale ?? null,
    photoUrl: u.photo_url ?? null,
    isPremiumTelegram: u.is_premium_telegram ?? null,
    createdAt: iso(u.created_at),
    updatedAt: iso(u.updated_at),
    ageEligibilityConfirmed: u.age_eligibility_confirmed === true,
    ageEligibilityConfirmedAt: iso(u.age_eligibility_confirmed_at),
    ageEligibilityMethod: u.age_eligibility_method ?? null,
    processingRestricted: u.processing_restricted === true,
    processingRestrictedAt: iso(u.processing_restricted_at),
    processingRestrictionLiftedAt: iso(u.processing_restriction_lifted_at),
    processingObjection: u.processing_objection === true,
    processingObjectedAt: iso(u.processing_objected_at),
    processingObjectionLiftedAt: iso(u.processing_objection_lifted_at),
    profile: {
      displayName: p.display_name ?? '', age: p.age ?? null, gender: p.gender ?? '', seeking: p.seeking ?? 'everyone',
      city: p.city ?? '', bio: p.bio ?? '', interests: p.interests ?? [],
      prompts: promptResult.rows.map((r) => ({ id: r.id, answer: r.answer })),
      languages: p.languages ?? [], discoverable: u.discoverable === true, profileComplete: u.profile_complete === true
    },
    preferences: { minAge: pr.min_age ?? 18, maxAge: pr.max_age ?? 100, city: pr.city ?? '', sameCityOnly: pr.same_city_only === true, languages: pr.languages ?? [] },
    notifications: { matches: ns.matches !== false, super_likes: ns.super_likes !== false, profile_reminders: ns.profile_reminders !== false, messages: ns.messages !== false },
    bezyPremium: pm ? {
      active: pm.active === true, planId: pm.plan_id, expiresAt: iso(pm.expires_at), purchasedAt: iso(pm.purchased_at),
      updatedAt: iso(pm.updated_at), source: pm.source, telegramPaymentChargeId: pm.telegram_payment_charge_id,
      revokedAt: iso(pm.revoked_at), revocationReason: pm.revocation_reason
    } : null,
    usage: us ? { day: String(us.day), discoveryActions: Number(us.discovery_actions) || 0, superLikes: Number(us.super_likes) || 0 } : null
  };

  const [actions, blocks, likesReceived, matchesResult, payments, reports, supportResult, conversationsResult] = await Promise.all([
    query('SELECT target_id, action, created_at FROM actions WHERE actor_id = $1', [userId]),
    query('SELECT blocked_id, created_at FROM blocks WHERE blocker_id = $1', [userId]),
    query('SELECT from_id FROM likes_received WHERE target_id = $1', [userId]),
    query('SELECT * FROM matches WHERE participant_a = $1 OR participant_b = $1', [userId]),
    query('SELECT * FROM bezy_payments WHERE telegram_user_id = $1', [userId]),
    query('SELECT reason, status, created_at FROM reports WHERE reporter_id = $1', [userId]),
    query('SELECT reference, category, status, details, created_at FROM support_requests WHERE telegram_user_id = $1', [userId]),
    query('SELECT * FROM conversations WHERE participant_a = $1 OR participant_b = $1', [userId])
  ]);

  // Bezy conversations (ADR 0009) hold the data subject's own message content — Art. 15/20
  // access and portability cover it. One read per conversation for its messages; the
  // counterpart's identity is already known to the caller from the match itself.
  const conversations = [];
  for (const conv of conversationsResult.rows) {
    const messages = await query(
      'SELECT client_id, sender_id, text, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [String(conv.conversation_id)]
    );
    // Post-match conversation games are conversation content too, so the caller's OWN picks
    // travel with the conversation they were made in. The counterpart's picks are their
    // personal data and are deliberately absent — including the ones already revealed in the
    // app, which the caller has seen but does not hold a copy of.
    const games = await query(
      `SELECT r.round_id, r.game, r.initiator_id, r.status, r.created_at, r.completed_at,
              COALESCE(json_agg(json_build_object('questionId', a.question_id, 'choice', a.choice, 'at', a.created_at)
                       ORDER BY a.created_at) FILTER (WHERE a.question_id IS NOT NULL), '[]') AS answers
         FROM game_rounds r
         LEFT JOIN game_answers a ON a.round_id = r.round_id AND a.user_id = $2
        WHERE r.conversation_id = $1
        GROUP BY r.round_id ORDER BY r.created_at ASC`,
      [String(conv.conversation_id), userId]
    );
    const otherId = String(conv.participant_a) === userId ? String(conv.participant_b) : String(conv.participant_a);
    conversations.push({
      conversationId: String(conv.conversation_id),
      otherTelegramId: otherId,
      status: conv.status ?? 'open',
      lastMessageAt: iso(conv.last_message_at),
      messages: messages.rows.map((m) => ({
        id: String(m.client_id),
        senderId: String(m.sender_id),
        text: String(m.text || ''),
        createdAt: iso(m.created_at)
      })),
      games: games.rows.map((g) => ({
        roundId: String(g.round_id),
        game: String(g.game),
        startedByYou: String(g.initiator_id) === userId,
        status: String(g.status),
        createdAt: iso(g.created_at),
        completedAt: iso(g.completed_at),
        // Canonical question ids and option ids — the same machine tokens Bezy stores.
        yourAnswers: (g.answers || []).map((a) => ({ questionId: String(a.questionId), choice: String(a.choice), at: iso(a.at) }))
      }))
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    account: {
      telegramId: data.telegramId,
      firstName: data.firstName,
      lastName: data.lastName,
      username: data.username,
      languageCode: data.languageCode,
      photoUrl: data.photoUrl,
      isPremiumTelegram: data.isPremiumTelegram,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    },
    ageEligibility: {
      confirmed: data.ageEligibilityConfirmed,
      confirmedAt: data.ageEligibilityConfirmedAt,
      method: data.ageEligibilityMethod
    },
    profile: data.profile,
    discoveryPreferences: data.preferences,
    notificationPreferences: notificationSettings(data),
    processingRestriction: {
      restricted: data.processingRestricted,
      restrictedAt: data.processingRestrictedAt,
      liftedAt: data.processingRestrictionLiftedAt
    },
    processingObjection: {
      objected: data.processingObjection,
      objectedAt: data.processingObjectedAt,
      withdrawnAt: data.processingObjectionLiftedAt
    },
    dailyUsage: data.usage,
    premium: { ...premiumState(data), raw: data.bezyPremium ? { planId: data.bezyPremium.planId ?? null, purchasedAt: data.bezyPremium.purchasedAt, revokedAt: data.bezyPremium.revokedAt } : null },
    decisions: actions.rows.map((r) => ({ targetTelegramId: String(r.target_id), action: r.action, at: iso(r.created_at) })),
    blocked: blocks.rows.map((r) => ({ targetTelegramId: String(r.blocked_id), at: iso(r.created_at) })),
    // A count only: revealing who liked you would disclose other people's personal data.
    likesReceivedCount: likesReceived.rows.length,
    matches: matchesResult.rows.map((r) => ({
      matchId: String(r.match_id),
      otherTelegramId: String(r.participant_a) === userId ? String(r.participant_b) : String(r.participant_a),
      active: r.active !== false,
      createdAt: iso(r.created_at),
      endedAt: iso(r.ended_at)
    })),
    reportsYouFiled: reports.rows.map((r) => ({ reason: r.reason, status: r.status, at: iso(r.created_at) })),
    conversations,
    supportRequests: supportResult.rows.map((r) => ({
      reference: String(r.reference),
      category: r.category,
      status: r.status,
      details: String(r.details || '').slice(0, 500),
      createdAt: iso(r.created_at)
    })),
    payments: payments.rows.map((r) => ({
      chargeId: String(r.telegram_payment_charge_id), planId: r.plan_id, stars: String(r.stars), currency: r.currency,
      status: r.status, refundStatus: r.refund_status ?? 'none',
      paidAt: iso(r.processed_at), refundedAt: iso(r.refunded_at)
    })),
    notes: [
      'Bezy conversations are stored by Bezy (see "conversations" above) and are deleted when you delete your account.',
      'Conversation games include your own picks only: the other person\'s picks are their data, not yours.',
      'Reports filed about you are not included: disclosing them would identify the reporter.',
      'Payment records are retained for accounting purposes after account deletion.'
    ]
  };
}

/**
 * Restriction of processing (GDPR Art. 18), as a self-service, reversible control.
 *
 * This is deliberately more than the `discoverable` toggle it replaces as a workaround.
 * `discoverable` is a visibility preference; restriction is a recorded legal state that stops
 * Bezy *processing* the account at all — no deck, no swiping in either direction, no new
 * matches, no engagement notifications — while storing everything untouched. Nothing is
 * deleted, and the user keeps their own access rights: export still works, because Art. 15 is
 * a different right and restriction must not be a trap that locks someone out of their data.
 *
 * Lifting the restriction deliberately does NOT re-publish the profile. `discoverable` stays
 * false until the user turns it back on themselves, so nobody is silently returned to the deck
 * by an action they took for a different reason.
 *
 * Idempotent in both directions: restricting twice, or lifting when not restricted, is safe
 * and reports the same outcome.
 */
async function setProcessingRestriction(storage, userId, restricted) {
  const result = await query('SELECT telegram_id, first_name, language_code, locale, processing_restricted FROM users WHERE telegram_id = $1', [userId]);
  const u = result.rows[0];
  if (!u) return { restricted: false, alreadyInState: true, unknownAccount: true };

  const current = { telegramId: String(u.telegram_id), firstName: u.first_name ?? null, languageCode: u.language_code ?? null, locale: u.locale ?? null };
  const already = (u.processing_restricted === true) === restricted;

  if (!already) {
    await tx(async (q) => {
      if (restricted) {
        await q(
          `UPDATE users SET processing_restricted = TRUE, processing_restricted_at = now(), discoverable = FALSE, updated_at = now()
           WHERE telegram_id = $1`,
          [userId]
        );
        // The stored profile carries its own copy of `discoverable`; both must agree or the
        // profile endpoint would hand the Mini App a value discovery does not honour.
        await q('UPDATE profiles SET discoverable = FALSE WHERE telegram_id = $1', [userId]);
      } else {
        await q(
          `UPDATE users SET processing_restricted = FALSE, processing_restriction_lifted_at = now(), updated_at = now()
           WHERE telegram_id = $1`,
          [userId]
        );
      }
    });
    // The user's record of what just happened to their account. Transactional, so it is
    // delivered even though engagement notifications are already suppressed by the pause.
    await sendAccountEvent(storage, current, restricted ? 'restricted' : 'unrestricted');
  }

  console.log(`[bezy-privacy] account.processing_restriction ${JSON.stringify({ telegramUserId: userId, restricted, alreadyInState: already })}`);
  return { restricted, alreadyInState: already };
}

/**
 * Objection to processing (GDPR Art. 21), as a self-service, reversible control — Art. 21(5)
 * explicitly allows an objection to be exercised "by automated means", so a button in the Mini
 * App is the right shape for this right.
 *
 * The operational effect mirrors restriction: the account is paused (see `_privacy.js`), so no
 * deck, no swiping in either direction, no new matches, no engagement notifications, while
 * everything is stored untouched. Export and deletion stay available — an objection must not
 * be a trap that locks someone out of their data.
 *
 * The legal states stay distinct in storage and in the export, because the rights themselves
 * are distinct and a future request ("what happened to my account?") must be answerable from
 * the record. Withdrawing the objection does NOT republish the profile, for the same reason
 * restriction does not: `discoverable` stays false until the user turns it back on.
 *
 * A controller receiving an objection must either stop processing or demonstrate compelling
 * legitimate grounds to continue. Bezy stops immediately; whether compelling grounds could
 * ever exist for a dating profile is part of the operator's legal review (P0-5 family), not
 * something this code invents.
 *
 * Idempotent in both directions, like restriction.
 */
async function setProcessingObjection(storage, userId, objected) {
  const result = await query('SELECT telegram_id, first_name, language_code, locale, processing_objection FROM users WHERE telegram_id = $1', [userId]);
  const u = result.rows[0];
  if (!u) return { objected: false, alreadyInState: true, unknownAccount: true };

  const current = { telegramId: String(u.telegram_id), firstName: u.first_name ?? null, languageCode: u.language_code ?? null, locale: u.locale ?? null };
  const already = (u.processing_objection === true) === objected;

  if (!already) {
    await tx(async (q) => {
      if (objected) {
        await q(
          `UPDATE users SET processing_objection = TRUE, processing_objected_at = now(), discoverable = FALSE, updated_at = now()
           WHERE telegram_id = $1`,
          [userId]
        );
        // Same double write as restriction: the stored profile carries its own `discoverable`
        // copy and both must agree.
        await q('UPDATE profiles SET discoverable = FALSE WHERE telegram_id = $1', [userId]);
      } else {
        await q(
          `UPDATE users SET processing_objection = FALSE, processing_objection_lifted_at = now(), updated_at = now()
           WHERE telegram_id = $1`,
          [userId]
        );
      }
    });
    await sendAccountEvent(storage, current, objected ? 'objected' : 'unobjected');
  }

  console.log(`[bezy-privacy] account.processing_objection ${JSON.stringify({ telegramUserId: userId, objected, alreadyInState: already })}`);
  return { objected, alreadyInState: already };
}

/**
 * Erasure. Removes the profile and all dating activity, and makes the account
 * undiscoverable immediately. Idempotent: deleting twice is safe and reports the same
 * outcome.
 *
 * Deliberately retained:
 *   - bezyPayments and bezyInvoices: financial records kept for accounting/tax obligations.
 *     They hold a Telegram id, a plan, an amount and timestamps — no profile content — and
 *     are the minimum needed to reconcile a Stars transaction. Retention period is a LEGAL
 *     REVIEW item, not something this code should invent.
 *   - reports in both directions: reports filed ABOUT this user cannot be deleted, or a
 *     user could erase the safety record of their own conduct. Reports filed BY this user
 *     about others are likewise kept, so a reporter cannot retract the safety record by
 *     erasing their account — a basis/period question flagged for legal review, not
 *     decided in code.
 */
async function deleteAccount(storage, userId) {
  const userResult = await query(
    `SELECT telegram_id, first_name, language_code, locale FROM users WHERE telegram_id = $1`,
    [userId]
  );
  const u = userResult.rows[0];
  if (!u) return { deleted: true, alreadyDeleted: true, retained: {} };
  const data = {
    telegramId: String(u.telegram_id),
    firstName: u.first_name ?? null,
    languageCode: u.language_code ?? null,
    locale: u.locale ?? null
  };

  let matchesEnded = 0;
  let retained;
  await tx(async (q) => {
    // Remove this user from other people's "who liked you" lists before their own action
    // rows are destroyed, since those rows are what identify the fan-out targets.
    await q('DELETE FROM likes_received WHERE from_id = $1', [userId]);
    // Blocks placed on others leave a mirror under the blocked account; clear those too.
    await q('DELETE FROM blocked_by WHERE blocker_id = $1', [userId]);
    await q('DELETE FROM blocks WHERE blocked_id = $1', [userId]);

    // End every match so the counterpart is not left with a live match to a deleted account.
    const ended = await q(
      `UPDATE matches SET active = FALSE, ended_at = now(), ended_reason = 'account_deleted'
       WHERE (participant_a = $1 OR participant_b = $1) AND active = TRUE`,
      [userId]
    );
    matchesEnded = ended.rowCount || 0;

    // Bezy conversations are deleted outright, including every message: erasure covers the
    // deleted user's message content, and the counterpart's copy of the exchange goes with
    // it. The messages cascade with the conversations rows.
    await q('DELETE FROM conversations WHERE participant_a = $1 OR participant_b = $2', [userId, userId]);

    // Deleting the user row cascades the strictly-erased set: profiles, prompt answers,
    // preferences, notification settings, usage, membership, actions, likes, blocks,
    // support requests and the translation cache. Rate-limit counters record when the
    // account acted and are erased explicitly (the table has no FK, mirroring PostgreSQL).
    await q('DELETE FROM users WHERE telegram_id = $1', [userId]);
    await q('DELETE FROM rate_limits WHERE user_id = $1', [userId]);

    // Retained counts, computed before the delete for the response (payments, invoices and
    // reports are intentionally NOT deleted — see the erasure contract above).
    const [payments, invoices, aboutYou, byYou] = await Promise.all([
      q('SELECT count(*)::int AS n FROM bezy_payments WHERE telegram_user_id = $1', [userId]),
      q('SELECT count(*)::int AS n FROM bezy_invoices WHERE telegram_user_id = $1', [userId]),
      q('SELECT count(*)::int AS n FROM reports WHERE target_id = $1', [userId]),
      q('SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1', [userId])
    ]);
    retained = {
      payments: payments.rows[0].n,
      invoices: invoices.rows[0].n,
      reportsAboutYou: aboutYou.rows[0].n,
      reportsYouFiled: byYou.rows[0].n
    };
  });

  // Sent while the account still exists: the user's durable record that erasure happened.
  // Transactional, so it is delivered regardless of notification choices.
  await sendAccountEvent(storage, data, 'deleted');

  console.log(`[bezy-privacy] account.deleted ${JSON.stringify({ telegramUserId: userId, matchesEnded, retainedPayments: retained.payments })}`);
  return { deleted: true, alreadyDeleted: false, matchesEnded, retained };
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const user = requireTelegramUser(req, res);
  if (!user) return;

  // Identity comes only from validated Telegram initData, so a caller can never act on
  // another account: there is no user id parameter to tamper with.
  const userId = String(user.id);
  const action = String(req.body?.action || '');

  try {
    if (action === 'export') {
      if (!(await rateLimit(null, res, userId, 'account_export'))) return;
      return res.status(200).json({ ok: true, data: await exportData(null, userId) });
    }
    if (action === 'restrict' || action === 'unrestrict') {
      if (!(await rateLimit(null, res, userId, 'account_restrict'))) return;
      return res.status(200).json({ ok: true, ...(await setProcessingRestriction(null, userId, action === 'restrict')) });
    }
    if (action === 'object' || action === 'unobject') {
      if (!(await rateLimit(null, res, userId, 'account_objection'))) return;
      return res.status(200).json({ ok: true, ...(await setProcessingObjection(null, userId, action === 'object')) });
    }
    if (action === 'delete') {
      // A typed confirmation guards an irreversible action against accidental calls.
      if (!(await rateLimit(null, res, userId, 'account_delete'))) return;
      if (req.body?.confirm !== DELETE_CONFIRMATION) {
        return res.status(400).json({ error: 'CONFIRMATION_REQUIRED' });
      }
      return res.status(200).json({ ok: true, ...(await deleteAccount(null, userId)) });
    }
    return res.status(400).json({ error: 'INVALID_ACTION' });
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    console.error('Account request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}
