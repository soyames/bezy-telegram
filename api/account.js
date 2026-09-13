import { db } from './_firebase.js';
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

function sendAccountEvent(firestore, userData, key) {
  // The user's explicit Bezy choice wins over their Telegram language.
  return deliverNotification(firestore, userData, 'account', { text: accountEventMessages(normalizedLanguage(userData?.locale || userData?.languageCode))[key] });
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
async function exportData(firestore, userId) {
  const userRef = firestore.collection('users').doc(userId);
  const snap = await userRef.get();
  if (!snap.exists) return { account: null, note: 'No Bezy account exists for this Telegram user.' };
  const data = snap.data() || {};

  const [actions, blocks, likesReceived, matchesSnap, payments, reports, supportSnap, conversationsSnap] = await Promise.all([
    userRef.collection('actions').get(),
    userRef.collection('blocks').get(),
    userRef.collection('likesReceived').get(),
    firestore.collection('matches').where('participants', 'array-contains', userId).get(),
    firestore.collection('bezyPayments').where('telegramUserId', '==', userId).get(),
    firestore.collection('reports').where('reporterId', '==', userId).get(),
    firestore.collection('supportRequests').where('telegramUserId', '==', userId).get(),
    firestore.collection('conversations').where('participants', 'array-contains', userId).get()
  ]);

  // Bezy conversations (ADR 0009) hold the data subject's own message content — Art. 15/20
  // access and portability cover it. One read per conversation for its messages; the
  // counterpart's identity is already known to the caller from the match itself.
  const conversations = [];
  for (const conv of conversationsSnap.docs) {
    const messages = await firestore.collection('conversations').doc(conv.id).collection('messages')
      .orderBy('createdAt', 'asc').get();
    conversations.push({
      conversationId: conv.id,
      otherTelegramId: (conv.data().participants || []).find((p) => p !== userId) ?? null,
      status: conv.data().status ?? 'open',
      lastMessageAt: iso(conv.data().lastMessageAt),
      messages: messages.docs.map((m) => ({
        id: m.id,
        senderId: m.data().senderId,
        text: String(m.data().text || ''),
        createdAt: iso(m.data().createdAt)
      }))
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    account: {
      telegramId: data.telegramId ?? null,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      username: data.username ?? null,
      languageCode: data.languageCode ?? null,
      photoUrl: data.photoUrl ?? null,
      isPremiumTelegram: data.isPremiumTelegram ?? null,
      createdAt: iso(data.createdAt),
      updatedAt: iso(data.updatedAt)
    },
    ageEligibility: {
      confirmed: data.ageEligibilityConfirmed === true,
      confirmedAt: iso(data.ageEligibilityConfirmedAt),
      method: data.ageEligibilityMethod ?? null
    },
    profile: data.profile ?? null,
    discoveryPreferences: data.preferences ?? null,
    notificationPreferences: notificationSettings(data),
    processingRestriction: {
      restricted: data.processingRestricted === true,
      restrictedAt: iso(data.processingRestrictedAt),
      liftedAt: iso(data.processingRestrictionLiftedAt)
    },
    processingObjection: {
      objected: data.processingObjection === true,
      objectedAt: iso(data.processingObjectedAt),
      withdrawnAt: iso(data.processingObjectionLiftedAt)
    },
    dailyUsage: data.usage ?? null,
    premium: { ...premiumState(data), raw: data.bezyPremium ? { planId: data.bezyPremium.planId ?? null, purchasedAt: iso(data.bezyPremium.purchasedAt), revokedAt: iso(data.bezyPremium.revokedAt) } : null },
    decisions: actions.docs.map((d) => ({ targetTelegramId: d.id, action: d.data().action, at: iso(d.data().createdAt) })),
    blocked: blocks.docs.map((d) => ({ targetTelegramId: d.id, at: iso(d.data().createdAt) })),
    // A count only: revealing who liked you would disclose other people's personal data.
    likesReceivedCount: likesReceived.size,
    matches: matchesSnap.docs.map((d) => ({
      matchId: d.id,
      otherTelegramId: (d.data().participants || []).find((p) => p !== userId) ?? null,
      active: d.data().active !== false,
      createdAt: iso(d.data().createdAt),
      endedAt: iso(d.data().endedAt)
    })),
    reportsYouFiled: reports.docs.map((d) => ({ reason: d.data().reason, status: d.data().status, at: iso(d.data().createdAt) })),
    conversations,
    supportRequests: supportSnap.docs.map((d) => ({
      reference: d.data().reference || d.id,
      category: d.data().category,
      status: d.data().status,
      details: String(d.data().details || '').slice(0, 500),
      createdAt: iso(d.data().createdAt)
    })),
    payments: payments.docs.map((d) => ({
      chargeId: d.id, planId: d.data().planId, stars: d.data().stars, currency: d.data().currency,
      status: d.data().status, refundStatus: d.data().refundStatus ?? 'none',
      paidAt: iso(d.data().processedAt), refundedAt: iso(d.data().refundedAt)
    })),
    notes: [
      'Bezy conversations are stored by Bezy (see "conversations" above) and are deleted when you delete your account.',
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
async function setProcessingRestriction(firestore, userId, restricted) {
  const userRef = firestore.collection('users').doc(userId);
  const snap = await userRef.get();
  if (!snap.exists) return { restricted: false, alreadyInState: true, unknownAccount: true };

  const current = snap.data() || {};
  const already = (current.processingRestricted === true) === restricted;
  const now = new Date();

  const update = restricted
    ? { processingRestricted: true, processingRestrictedAt: now, discoverable: false, updatedAt: now }
    : { processingRestricted: false, processingRestrictionLiftedAt: now, updatedAt: now };
  // The stored profile carries its own copy of `discoverable`; both must agree or the profile
  // endpoint would hand the Mini App a value discovery does not honour.
  if (restricted && current.profile) update.profile = { ...current.profile, discoverable: false };

  if (!already) {
    await userRef.update(update);
    // The user's record of what just happened to their account. Transactional, so it is
    // delivered even though engagement notifications are already suppressed by the pause.
    await sendAccountEvent(firestore, current, restricted ? 'restricted' : 'unrestricted');
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
async function setProcessingObjection(firestore, userId, objected) {
  const userRef = firestore.collection('users').doc(userId);
  const snap = await userRef.get();
  if (!snap.exists) return { objected: false, alreadyInState: true, unknownAccount: true };

  const current = snap.data() || {};
  const already = (current.processingObjection === true) === objected;
  const now = new Date();

  const update = objected
    ? { processingObjection: true, processingObjectedAt: now, discoverable: false, updatedAt: now }
    : { processingObjection: false, processingObjectionLiftedAt: now, updatedAt: now };
  // Same double write as restriction: the stored profile carries its own `discoverable` copy
  // and both must agree.
  if (objected && current.profile) update.profile = { ...current.profile, discoverable: false };

  if (!already) {
    await userRef.update(update);
    await sendAccountEvent(firestore, current, objected ? 'objected' : 'unobjected');
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
async function deleteAccount(firestore, userId) {
  const userRef = firestore.collection('users').doc(userId);
  const snap = await userRef.get();
  if (!snap.exists) return { deleted: true, alreadyDeleted: true, retained: {} };
  const data = snap.data() || {};

  // Remove this user from other people's "who liked you" lists before their own action
  // records are destroyed, since those records are what identify the fan-out targets.
  const actions = await userRef.collection('actions').get();
  const mirrors = firestore.batch();
  for (const doc of actions.docs) {
    mirrors.delete(firestore.collection('users').doc(doc.id).collection('likesReceived').doc(userId));
  }
  // Blocks placed on others leave a mirror under the blocked account; clear those too.
  const blocks = await userRef.collection('blocks').get();
  for (const doc of blocks.docs) {
    mirrors.delete(firestore.collection('users').doc(doc.id).collection('blockedBy').doc(userId));
  }
  const blockedBy = await userRef.collection('blockedBy').get();
  for (const doc of blockedBy.docs) {
    mirrors.delete(firestore.collection('users').doc(doc.id).collection('blocks').doc(userId));
  }
  await mirrors.commit();

  // End every match so the counterpart is not left with a live match to a deleted account.
  const matchesSnap = await firestore.collection('matches').where('participants', 'array-contains', userId).get();
  const now = new Date();
  const matchBatch = firestore.batch();
  for (const doc of matchesSnap.docs) {
    matchBatch.set(doc.ref, { active: false, endedAt: now, endedReason: 'account_deleted' }, { merge: true });
  }
  await matchBatch.commit();

  // Bezy conversations are deleted outright, including every message: erasure covers the
  // deleted user's message content, and the counterpart's copy of the exchange goes with
  // it. (Message-retention policy for active accounts is a flagged legal follow-up — see
  // the roadmap — this only defines the deletion behaviour, which erasure already
  // required.)
  const conversationsSnap = await firestore.collection('conversations').where('participants', 'array-contains', userId).get();
  for (const doc of conversationsSnap.docs) {
    await firestore.recursiveDelete(doc.ref);
  }

  const retained = {
    payments: (await firestore.collection('bezyPayments').where('telegramUserId', '==', userId).get()).size,
    // Invoices are retained for accounting like the payments they record, so the deletion
    // response says so rather than letting a retained document go unreported.
    invoices: (await firestore.collection('bezyInvoices').where('telegramUserId', '==', userId).get()).size,
    reportsAboutYou: (await firestore.collection('reports').where('targetId', '==', userId).get()).size,
    reportsYouFiled: (await firestore.collection('reports').where('reporterId', '==', userId).get()).size
  };

  // Sent while the account still exists: the user's durable record that erasure happened.
  // Transactional, so it is delivered regardless of notification choices.
  await sendAccountEvent(firestore, data, 'deleted');

  // Support requests are the caller's own personal data, so erasure covers them too. They
  // reference the user by Telegram id only, like everything else in the request.
  const supportSnap = await firestore.collection('supportRequests').where('telegramUserId', '==', userId).get();
  const supportBatch = firestore.batch();
  for (const doc of supportSnap.docs) supportBatch.delete(doc.ref);
  await supportBatch.commit();

  // Removes the user document and every subcollection: profile, actions, likesReceived,
  // blocks and blockedBy.
  await firestore.recursiveDelete(userRef);
  // Rate-limit counters record when the account acted, so they are erased with it.
  await firestore.collection('rateLimits').doc(userId).delete().catch(() => {});

  console.log(`[bezy-privacy] account.deleted ${JSON.stringify({ telegramUserId: userId, matchesEnded: matchesSnap.size, retainedPayments: retained.payments })}`);
  return { deleted: true, alreadyDeleted: false, matchesEnded: matchesSnap.size, retained };
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
    const firestore = db();
    if (action === 'export') {
      if (!(await rateLimit(firestore, res, userId, 'account_export'))) return;
      return res.status(200).json({ ok: true, data: await exportData(firestore, userId) });
    }
    if (action === 'restrict' || action === 'unrestrict') {
      if (!(await rateLimit(firestore, res, userId, 'account_restrict'))) return;
      return res.status(200).json({ ok: true, ...(await setProcessingRestriction(firestore, userId, action === 'restrict')) });
    }
    if (action === 'object' || action === 'unobject') {
      if (!(await rateLimit(firestore, res, userId, 'account_objection'))) return;
      return res.status(200).json({ ok: true, ...(await setProcessingObjection(firestore, userId, action === 'object')) });
    }
    if (action === 'delete') {
      // A typed confirmation guards an irreversible action against accidental calls.
      if (!(await rateLimit(firestore, res, userId, 'account_delete'))) return;
      if (req.body?.confirm !== DELETE_CONFIRMATION) {
        return res.status(400).json({ error: 'CONFIRMATION_REQUIRED' });
      }
      return res.status(200).json({ ok: true, ...(await deleteAccount(firestore, userId)) });
    }
    return res.status(400).json({ error: 'INVALID_ACTION' });
  } catch (error) {
    console.error('Account request failed:', error);
    return res.status(500).json({ error: 'DATABASE_UNAVAILABLE' });
  }
}
