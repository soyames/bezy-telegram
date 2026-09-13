import { configureLocalizedCommands, miniAppUrl, normalizedLanguage, localized, telegramApi } from '../_telegram.js';
import { parseInvoicePayload, premiumPlan, nextExpiry, applyRefund } from '../_premium.js';
import { SUPPORT_CATEGORIES, createSupportRequest, diagnosePremium, diagnoseDiscovery, diagnoseProfile } from '../_support.js';
import { enforceRateLimit } from '../_ratelimit.js';

const COMMAND_VIEWS = {
  start: null, demarrer: null, empezar: null,
  help: null, aide: null, hilfe: null, ayuda: null, aiuto: null,
  profile: 'profile', profil: 'profile', perfil: 'profile', profilo: 'profile',
  discover: 'discover', decouvrir: 'discover', entdecken: 'discover', descubrir: 'discover', scopri: 'discover',
  matches: 'matches', matchs: 'matches', premium: 'premium',
  settings: 'profile', parametres: 'profile', einstellungen: 'profile', ajustes: 'profile', impostazioni: 'profile'
};

function commandName(text) {
  const first = String(text || '').trim().split(/\s+/)[0];
  return first.replace(/^\//, '').split('@')[0].toLowerCase();
}
// Shared button labels: one localized() entry per language, reused across every surface,
// so the Mini App and the bot always call the same things the same names.
const OPEN_BEZY = { en: '💜 Open Bezy', fr: '💜 Ouvrir Bezy', de: '💜 Bezy öffnen', es: '💜 Abrir Bezy', it: '💜 Apri Bezy', pt: '💜 Abrir o Bezy', ru: '💜 Открыть Bezy', pl: '💜 Otwórz Bezy', ar: '💜 افتح Bezy', tr: '💜 Bezy\'yi aç', sw: '💜 Fungua Bezy', yo: '💜 Ṣí Bezy', hi: '💜 Bezy खोलें', id: '💜 Buka Bezy', zh: '💜 打开 Bezy', ja: '💜 Bezy を開く', ko: '💜 Bezy 열기' };
const VIEW_PREMIUM = { en: '💎 View Premium', fr: '💎 Voir Premium', de: '💎 Premium ansehen', es: '💎 Ver Premium', it: '💎 Vedi Premium', pt: '💎 Ver Premium', ru: '💎 Смотреть Premium', pl: '💎 Zobacz Premium', ar: '💎 عرض Premium', tr: '💎 Premium\'a bak', sw: '💎 Ona Premium', yo: '💎 Wo Premium', hi: '💎 Premium देखें', id: '💎 Lihat Premium', zh: '💎 查看 Premium', ja: '💎 Premium を見る', ko: '💎 Premium 보기' };
const OPEN_PROFILE = { en: '👤 Open my profile', fr: '👤 Ouvrir mon profil', de: '👤 Mein Profil öffnen', es: '👤 Abrir mi perfil', it: '👤 Apri il mio profilo', pt: '👤 Abrir o meu perfil', ru: '👤 Открыть мой профиль', pl: '👤 Otwórz mój profil', ar: '👤 افتح ملفي', tr: '👤 Profilimi aç', sw: '👤 Fungua wasifu wangu', yo: '👤 Ṣí àkọọ́lẹ̀ mi', hi: '👤 मेरी प्रोफ़ाइल खोलें', id: '👤 Buka profilku', zh: '👤 打开我的资料', ja: '👤 プロフィールを開く', ko: '👤 내 프로필 열기' };
const OPEN_DISCOVER = { en: '💜 Open Discover', fr: '💜 Ouvrir Découvrir', de: '💜 Entdecken öffnen', es: '💜 Abrir Descubrir', it: '💜 Apri Scopri', pt: '💜 Abrir Descobrir', ru: '💜 Открыть «Знакомства»', pl: '💜 Otwórz Odkrywanie', ar: '💜 افتح اكتشف', tr: '💜 Keşfet\'i aç', sw: '💜 Fungua Gundua', yo: '💜 Ṣí Ṣàwárí', hi: '💜 खोजें खोलें', id: '💜 Buka Jelajahi', zh: '💜 打开发现', ja: '💜 発見を開く', ko: '💜 발견 열기' };
const OPEN_MATCHES = { en: '💜 Open my matches', fr: '💜 Ouvrir mes matchs', de: '💜 Meine Matches öffnen', es: '💜 Abrir mis matches', it: '💜 Apri i miei match', pt: '💜 Abrir os meus matches', ru: '💜 Открыть мои мэтчи', pl: '💜 Otwórz moje dopasowania', ar: '💜 افتح مطابقاتي', tr: '💜 Eşleşmelerimi aç', sw: '💜 Fungua mechi zangu', yo: '💜 Ṣí àwọn mátìsì mi', hi: '💜 मेरे मैच खोलें', id: '💜 Buka kecocokanku', zh: '💜 打开我的配对', ja: '💜 マッチを開く', ko: '💜 내 매치 열기' };
function uiButton(language, view) { return { text: localized(language, OPEN_BEZY), web_app: { url: miniAppUrl(view) } }; }

// Long dates in bot messages follow the user's language; the timezone is pinned to UTC
// because Premium expiry is a UTC timestamp.
const DATE_LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', ru: 'ru-RU', pl: 'pl-PL', ar: 'ar', tr: 'tr-TR', sw: 'sw', yo: 'yo', hi: 'hi-IN', id: 'id-ID', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR' };
function dateLocale(language) { return DATE_LOCALE[language] || DATE_LOCALE.en; }

// A support action that fails must still answer the user — a silent dead button is a dead
// end. This fallback is the last line: it says what to do next without disclosing why.
function supportFailureMessage(language) {
  return localized(language, {
    en: 'Bezy could not process that right now. Please try again in a moment, or write to contacts@digitalconcordia.com.',
    fr: 'Bezy n’a pas pu traiter cette demande pour le moment. Réessayez dans un instant, ou écrivez à contacts@digitalconcordia.com.',
    de: 'Bezy konnte das gerade nicht verarbeiten. Versuche es gleich noch einmal oder schreibe an contacts@digitalconcordia.com.',
    es: 'Bezy no ha podido procesar eso ahora mismo. Inténtalo de nuevo en un momento o escribe a contacts@digitalconcordia.com.',
    it: 'Bezy non è riuscito a elaborare la richiesta in questo momento. Riprova tra poco o scrivi a contacts@digitalconcordia.com.',
    pt: 'A Bezy não conseguiu processar isso agora. Tenta novamente daqui a pouco ou escreve para contacts@digitalconcordia.com.',
    ru: 'Bezy не смог обработать это сейчас. Попробуй через мгновение или напиши на contacts@digitalconcordia.com.',
    pl: 'Bezy nie mogło tego teraz przetworzyć. Spróbuj ponownie za chwilę albo napisz na contacts@digitalconcordia.com.',
    ar: 'تعذّر على Bezy معالجة ذلك الآن. حاول مرة أخرى بعد لحظات أو راسل contacts@digitalconcordia.com.',
    tr: 'Bezy bunu şu anda işleyemedi. Birazdan tekrar dene veya contacts@digitalconcordia.com adresine yaz.',
    sw: 'Bezy haikuweza kuchakata hilo kwa sasa. Jaribu tena baada ya muda mfupi, au andika kwa contacts@digitalconcordia.com.',
    yo: 'Bezy kò lè ṣe èyí báyìí. Gbìyànjú lẹ́ẹ̀kan sí i láìpẹ́, tàbí kọ sí contacts@digitalconcordia.com.',
    hi: 'Bezy अभी इसे प्रोसेस नहीं कर सका। थोड़ी देर बाद फिर कोशिश करें, या contacts@digitalconcordia.com पर लिखें।',
    id: 'Bezy tidak bisa memprosesnya saat ini. Coba lagi sebentar lagi, atau tulis ke contacts@digitalconcordia.com.',
    zh: 'Bezy 暂时无法处理。请稍后再试，或写信至 contacts@digitalconcordia.com。',
    ja: 'Bezy は今これを処理できませんでした。しばらくしてからもう一度お試しいただくか、contacts@digitalconcordia.com までご連絡ください。',
    ko: 'Bezy가 지금 이를 처리하지 못했습니다. 잠시 후 다시 시도하거나 contacts@digitalconcordia.com으로 문의하세요.'
  });
}
function helpText(language) {
  return localized(language, {
    en: ['💜 <b>How Bezy works</b>', '', '1. Create your profile in the Mini App.', '2. Discover compatible people.', '3. Like or pass.', '4. A match appears when interest is mutual.', '5. Then open the conversation right here in Bezy.', '', 'Bezy is for adults aged 18 and over.', '', 'Having a problem? Send /support.'].join('\n'),
    fr: ['💜 <b>Comment fonctionne Bezy</b>', '', '1. Créez votre profil dans la Mini App.', '2. Découvrez des personnes compatibles.', '3. Likez ou passez.', '4. Un match apparaît lorsque l’intérêt est réciproque.', '5. Ouvrez ensuite la conversation directement dans Bezy.', '', 'Bezy est réservé aux personnes de 18 ans et plus.', '', 'Un problème ? Envoyez /assistance.'].join('\n'),
    de: ['💜 <b>So funktioniert Bezy</b>', '', '1. Erstelle dein Profil in der Mini-App.', '2. Entdecke kompatible Personen.', '3. Like oder überspringe.', '4. Ein Match entsteht, wenn das Interesse gegenseitig ist.', '5. Öffne dann die Unterhaltung direkt hier in Bezy.', '', 'Bezy ist nur für Erwachsene ab 18 Jahren.', '', 'Bei einem Problem sende /support.'].join('\n'),
    es: ['💜 <b>Cómo funciona Bezy</b>', '', '1. Crea tu perfil en la Mini App.', '2. Descubre personas compatibles.', '3. Da like o pasa.', '4. Un match aparece cuando el interés es mutuo.', '5. Después abre la conversación aquí mismo, en Bezy.', '', 'Bezy es solo para personas adultas de 18 años o más.', '', '¿Tienes un problema? Envía /soporte.'].join('\n'),
    it: ['💜 <b>Come funziona Bezy</b>', '', '1. Crea il tuo profilo nella Mini App.', '2. Scopri persone compatibili.', '3. Metti like o passa.', '4. Un match appare quando l’interesse è reciproco.', '5. Poi apri la conversazione proprio qui, su Bezy.', '', 'Bezy è solo per adulti di 18 anni o più.', '', 'Hai un problema? Invia /assistenza.'].join('\n'),
    pt: ['💜 <b>Como a Bezy funciona</b>', '', '1. Cria o teu perfil na Mini App.', '2. Descobre pessoas compatíveis.', '3. Dá like ou passa.', '4. Um match aparece quando o interesse é mútuo.', '5. Depois abre a conversa mesmo aqui, na Bezy.', '', 'A Bezy é só para adultos com 18 anos ou mais.', '', 'Tens um problema? Envia /support.'].join('\n'),
    ru: ['💜 <b>Как работает Bezy</b>', '', '1. Создай профиль в Mini App.', '2. Знакомься с подходящими людьми.', '3. Ставь лайк или пропускай.', '4. Мэтч появляется при взаимном интересе.', '5. Затем открой разговор прямо здесь, в Bezy.', '', 'Bezy только для взрослых от 18 лет.', '', 'Проблема? Отправь /support.'].join('\n'),
    pl: ['💜 <b>Jak działa Bezy</b>', '', '1. Utwórz profil w Mini App.', '2. Odkrywaj pasujących ludzi.', '3. Polub lub pomiń.', '4. Dopasowanie pojawia się przy wzajemnym zainteresowaniu.', '5. Potem otwórz rozmowę właśnie tutaj, w Bezy.', '', 'Bezy jest tylko dla dorosłych w wieku 18 lat lub więcej.', '', 'Masz problem? Wyślij /support.'].join('\n'),
    ar: ['💜 <b>كيف يعمل Bezy</b>', '', '1. أنشئ ملفك في التطبيق المصغّر.', '2. اكتشف أشخاصًا متوافقين.', '3. أعجب أو تجاوز.', '4. تظهر المطابقة عندما يكون الاهتمام متبادلًا.', '5. ثم افتح المحادثة هنا مباشرة، في Bezy.', '', 'Bezy للبالغين بعمر 18 عامًا أو أكثر فقط.', '', 'لديك مشكلة؟ أرسل /support.'].join('\n'),
    tr: ['💜 <b>Bezy nasıl çalışır</b>', '', '1. Mini App\'te profilini oluştur.', '2. Uyumlu insanları keşfet.', '3. Beğen veya geç.', '4. Karşılıklı ilgi olduğunda eşleşme oluşur.', '5. Ardından sohbeti tam burada, Bezy\'de aç.', '', 'Bezy yalnızca 18 yaş ve üzeri yetişkinler içindir.', '', 'Sorun mu var? /support gönder.'].join('\n'),
    sw: ['💜 <b>Jinsi Bezy inavyofanya kazi</b>', '', '1. Unda wasifu wako kwenye Mini App.', '2. Gundua watu wanaolingana.', '3. Penda au pita.', '4. Mechi inaonekana wakati maslahi yanafanana.', '5. Kisha fungua mazungumzo hapa hapa, kwenye Bezy.', '', 'Bezy ni ya watu wazima wa miaka 18 na zaidi pekee.', '', 'Una tatizo? Tuma /support.'].join('\n'),
    yo: ['💜 <b>Bí Bezy ṣe ń ṣiṣẹ́</b>', '', '1. Ṣẹ̀dá àkọọ́lẹ̀ rẹ nínú Mini App.', '2. Ṣàwárí àwọn ènìyàn tó bá ẹ mu.', '3. Fẹ́ràn tàbí fojú fo.', '4. Mátìsì máa ń hàn nígbà tí ìfẹ́ bá jọra.', '5. Lẹ́yìn náà ṣí ìbánisọ̀rọ̀ níbí gan-an, nínú Bezy.', '', 'Bezy jẹ́ ti àgbàlagbà tó pé ọmọ ọdún 18 sí sókè nìkan.', '', 'Ìṣòro kan wà? Fi /support ránṣẹ́.'].join('\n'),
    hi: ['💜 <b>Bezy कैसे काम करता है</b>', '', '1. Mini App में अपनी प्रोफ़ाइल बनाएँ।', '2. मेल खाते लोगों को खोजें।', '3. पसंद करें या छोड़ें।', '4. आपसी दिलचस्पी होने पर मैच बनता है।', '5. फिर बातचीत यहीं Bezy में खोलें।', '', 'Bezy केवल 18 वर्ष या उससे अधिक के वयस्कों के लिए है।', '', 'कोई समस्या है? /support भेजें।'].join('\n'),
    id: ['💜 <b>Cara kerja Bezy</b>', '', '1. Buat profilmu di Mini App.', '2. Temukan orang yang cocok.', '3. Suka atau lewati.', '4. Kecocokan muncul saat minat saling terbalas.', '5. Lalu buka percakapannya di sini, di dalam Bezy.', '', 'Bezy hanya untuk orang dewasa berusia 18 tahun ke atas.', '', 'Ada masalah? Kirim /support.'].join('\n'),
    zh: ['💜 <b>Bezy 如何运作</b>', '', '1. 在 Mini App 中创建你的资料。', '2. 发现与你合拍的人。', '3. 喜欢或跳过。', '4. 兴趣互相匹配时就会出现配对。', '5. 然后在 Bezy 里直接打开对话。', '', 'Bezy 仅面向年满 18 周岁的成年人。', '', '遇到问题？发送 /support。'].join('\n'),
    ja: ['💜 <b>Bezy の仕組み</b>', '', '1. Mini App でプロフィールを作成。', '2. 相性の良い人を発見。', '3. いいね、またはスキップ。', '4. お互いの関心が合えばマッチが成立。', '5. その後、ここ Bezy の中で会話を開く。', '', 'Bezy は18歳以上の大人専用です。', '', 'お困りですか？ /support を送信。'].join('\n'),
    ko: ['💜 <b>Bezy 이용 방법</b>', '', '1. Mini App에서 프로필을 만드세요.', '2. 잘 맞는 사람을 발견하세요.', '3. 좋아요 또는 넘기기.', '4. 서로의 관심이 맞으면 매치가 생깁니다.', '5. 그런 다음 바로 여기 Bezy에서 대화를 여세요.', '', 'Bezy는 만 18세 이상 성인 전용입니다.', '', '문제가 있나요? /support를 보내세요.'].join('\n')
  });
}

// ---------------------------------------------------------------------------
// Support (CN-7): the bot is the primary support channel. Categories are machine tokens;
// labels follow the user's language. Troubleshooting reads only the caller's own document.
// ---------------------------------------------------------------------------

function supportLabel(language, category) {
  const labels = {
    en: { premium: 'Premium & Telegram Stars', profile: 'Profile', likes_matches: 'Likes & Matches', discovery: 'Discovery', privacy_account: 'Privacy & Account', problem: 'Report a problem', contact: 'Contact support' },
    fr: { premium: 'Premium & Telegram Stars', profile: 'Profil', likes_matches: 'Likes & matchs', discovery: 'Découverte', privacy_account: 'Confidentialité & compte', problem: 'Signaler un problème', contact: 'Contacter le support' },
    de: { premium: 'Premium & Telegram Stars', profile: 'Profil', likes_matches: 'Likes & Matches', discovery: 'Entdecken', privacy_account: 'Datenschutz & Konto', problem: 'Problem melden', contact: 'Support kontaktieren' },
    es: { premium: 'Premium y Telegram Stars', profile: 'Perfil', likes_matches: 'Likes y matches', discovery: 'Descubrimiento', privacy_account: 'Privacidad y cuenta', problem: 'Denunciar un problema', contact: 'Contactar con soporte' },
    it: { premium: 'Premium e Telegram Stars', profile: 'Profilo', likes_matches: 'Like e match', discovery: 'Scoperta', privacy_account: 'Privacy e account', problem: 'Segnala un problema', contact: 'Contatta il supporto' },
    pt: { premium: 'Premium e Telegram Stars', profile: 'Perfil', likes_matches: 'Likes e matches', discovery: 'Descoberta', privacy_account: 'Privacidade e conta', problem: 'Denunciar um problema', contact: 'Contactar o apoio' },
    ru: { premium: 'Premium и Telegram Stars', profile: 'Профиль', likes_matches: 'Лайки и мэтчи', discovery: 'Знакомства', privacy_account: 'Конфиденциальность и аккаунт', problem: 'Сообщить о проблеме', contact: 'Связаться с поддержкой' },
    pl: { premium: 'Premium i Telegram Stars', profile: 'Profil', likes_matches: 'Polubienia i dopasowania', discovery: 'Odkrywanie', privacy_account: 'Prywatność i konto', problem: 'Zgłoś problem', contact: 'Skontaktuj się ze wsparciem' },
    ar: { premium: 'Premium و Telegram Stars', profile: 'الملف الشخصي', likes_matches: 'الإعجابات والمطابقات', discovery: 'الاكتشاف', privacy_account: 'الخصوصية والحساب', problem: 'الإبلاغ عن مشكلة', contact: 'التواصل مع الدعم' },
    tr: { premium: 'Premium ve Telegram Stars', profile: 'Profil', likes_matches: 'Beğeniler ve eşleşmeler', discovery: 'Keşif', privacy_account: 'Gizlilik ve hesap', problem: 'Sorun bildir', contact: 'Destekle iletişime geç' },
    sw: { premium: 'Premium na Telegram Stars', profile: 'Wasifu', likes_matches: 'Kupenda na mechi', discovery: 'Ugunduzi', privacy_account: 'Faragha na akaunti', problem: 'Ripoti tatizo', contact: 'Wasiliana na usaidizi' },
    yo: { premium: 'Premium àti Telegram Stars', profile: 'Àkọọ́lẹ̀', likes_matches: 'Likes àti mátìsì', discovery: 'Ìṣàwárí', privacy_account: 'Àṣírí àti àkọọ́lẹ̀', problem: 'Fi ìṣòro rẹ́jọ̀', contact: 'Kàn sí àtìlẹ́yìn' },
    hi: { premium: 'Premium और Telegram Stars', profile: 'प्रोफ़ाइल', likes_matches: 'लाइक और मैच', discovery: 'खोज', privacy_account: 'गोपनीयता और खाता', problem: 'समस्या की रिपोर्ट करें', contact: 'सहायता से संपर्क करें' },
    id: { premium: 'Premium dan Telegram Stars', profile: 'Profil', likes_matches: 'Suka dan kecocokan', discovery: 'Penjelajahan', privacy_account: 'Privasi dan akun', problem: 'Laporkan masalah', contact: 'Hubungi dukungan' },
    zh: { premium: 'Premium 与 Telegram Stars', profile: '个人资料', likes_matches: '喜欢与配对', discovery: '发现', privacy_account: '隐私与账户', problem: '报告问题', contact: '联系支持' },
    ja: { premium: 'Premium と Telegram Stars', profile: 'プロフィール', likes_matches: 'いいねとマッチ', discovery: '発見', privacy_account: 'プライバシーとアカウント', problem: '問題を報告', contact: 'サポートに連絡' },
    ko: { premium: 'Premium 및 Telegram Stars', profile: '프로필', likes_matches: '좋아요 및 매치', discovery: '발견', privacy_account: '개인정보 및 계정', problem: '문제 신고', contact: '지원팀에 문의' }
  };
  return (labels[language] || labels.en)[category] || category;
}

function supportMenuKeyboard(language) {
  const row = (a, b) => b ? [{ text: supportLabel(language, a), callback_data: `support:${a}` }, { text: supportLabel(language, b), callback_data: `support:${b}` }] : [{ text: supportLabel(language, a), callback_data: `support:${a}` }];
  return { inline_keyboard: [row('premium', 'profile'), row('likes_matches', 'discovery'), row('privacy_account', 'problem'), row('contact')] };
}

async function sendSupportMenu(chatId, language) {
  const text = localized(language, {
    en: ['🛟 <b>Help & support</b>', '', 'Choose what this is about. Where possible, I’ll diagnose the problem right away.', ''].join('\n'),
    fr: ['🛟 <b>Aide et assistance</b>', '', 'Choisissez ce qui vous concerne. Quand c’est possible, je diagnostique le problème tout de suite.', ''].join('\n'),
    de: ['🛟 <b>Hilfe & Support</b>', '', 'Wähle, worum es geht. Wenn möglich, diagnostiziere ich das Problem sofort.', ''].join('\n'),
    es: ['🛟 <b>Ayuda y soporte</b>', '', 'Elige de qué se trata. Cuando es posible, diagnostico el problema al momento.', ''].join('\n'),
    it: ['🛟 <b>Aiuto e supporto</b>', '', 'Scegli di cosa si tratta. Quando possibile, diagnostico subito il problema.', ''].join('\n'),
    pt: ['🛟 <b>Ajuda e apoio</b>', '', 'Escolhe sobre o que é. Quando possível, diagnostico o problema já.', ''].join('\n'),
    ru: ['🛟 <b>Помощь и поддержка</b>', '', 'Выбери, о чём речь. Когда возможно, я сразу диагностирую проблему.', ''].join('\n'),
    pl: ['🛟 <b>Pomoc i wsparcie</b>', '', 'Wybierz, czego to dotyczy. Kiedy to możliwe, od razu zdiagnozuję problem.', ''].join('\n'),
    ar: ['🛟 <b>المساعدة والدعم</b>', '', 'اختر ما يتعلق به الأمر. عندما يكون ممكنًا، أشخّص المشكلة فورًا.', ''].join('\n'),
    tr: ['🛟 <b>Yardım ve destek</b>', '', 'Ne hakkında olduğunu seç. Mümkünse sorunu hemen teşhis edeyim.', ''].join('\n'),
    sw: ['🛟 <b>Msaada na usaidizi</b>', '', 'Chagua inahusu nini. Inapowezekana, nitatambua tatizo mara moja.', ''].join('\n'),
    yo: ['🛟 <b>Ìrànlọ́wọ́ àti àtìlẹ́yìn</b>', '', 'Yan ohun tí ó jẹ mọ́. Nígbà tó bá ṣeé ṣe, mo máa ń dá ìṣòro náà mọ̀ lẹ́sẹ̀kẹsẹ̀.', ''].join('\n'),
    hi: ['🛟 <b>सहायता और समर्थन</b>', '', 'चुनें कि यह किस बारे में है। जब संभव हो, मैं समस्या का तुरंत पता लगाऊँगा।', ''].join('\n'),
    id: ['🛟 <b>Bantuan dan dukungan</b>', '', 'Pilih tentang apa ini. Jika memungkinkan, saya akan langsung mendiagnosis masalahnya.', ''].join('\n'),
    zh: ['🛟 <b>帮助与支持</b>', '', '请选择是关于什么的。可以的话，我会立即诊断问题。', ''].join('\n'),
    ja: ['🛟 <b>ヘルプとサポート</b>', '', '何についてか選んでください。可能なら、すぐに問題を診断します。', ''].join('\n'),
    ko: ['🛟 <b>도움말 및 지원</b>', '', '무엇에 관한 것인지 선택하세요. 가능하면 문제를 바로 진단하겠습니다.', ''].join('\n')
  });
  await telegramApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: supportMenuKeyboard(language) });
}

function stillNeedHelpRow(language, category) {
  return [{ text: localized(language, { en: 'Still need help?', fr: 'J’ai encore besoin d’aide', de: 'Brauchst du weitere Hilfe?', es: '¿Aún necesitas ayuda?', it: 'Ti serve ancora aiuto?', pt: 'Ainda precisas de ajuda?', ru: 'Нужна ещё помощь?', pl: 'Nadal potrzebujesz pomocy?', ar: 'ما زلت بحاجة إلى مساعدة؟', tr: 'Yine de yardıma mı ihtiyacın var?', sw: 'Bado unahitaji msaada?', yo: 'Ṣé o ṣì nílò ìrànlọ́wọ́?', hi: 'अभी भी मदद चाहिए?', id: 'Masih butuh bantuan?', zh: '还需要帮助吗？', ja: 'まだ助けが必要ですか？', ko: '아직도 도움이 필요하세요?' }), callback_data: `support:new:${category}` }];
}

// The explicit Bezy language choice lives on the user document (`locale`, written by the
// Mini App selector). Where the webhook only has update context, the document is read so an
// explicit choice wins over the Telegram language; failures fall back to the Telegram
// language, never to an error. Pre-checkout answers are the deliberate exception: Telegram
// allows ten seconds for an answer and shows its own error copy, so they use the update's
// language directly.
async function resolveChatLanguage(storage, from) {
  const telegramLanguage = normalizedLanguage(from?.language_code);
  if (!from?.id) return telegramLanguage;
  try {
    const { query } = await import('../_db.js');
    const result = await query('SELECT locale, language_code FROM users WHERE telegram_id = $1', [String(from.id)]);
    const row = result.rows[0] || {};
    return normalizedLanguage(row.locale || row.language_code || from.language_code);
  } catch (error) {
    console.warn('[bezy-webhook] language lookup failed, using Telegram language:', error.message);
    return telegramLanguage;
  }
}

async function sendDiagnosis(chatId, language, textLines, keyboard) {
  await telegramApi('sendMessage', { chat_id: chatId, text: textLines.join('\n'), parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}

async function supportPremium(chatId, language, userData) {
  const diag = diagnosePremium(userData);
  const openPremium = { text: localized(language, VIEW_PREMIUM), web_app: { url: miniAppUrl('premium') } };
  const SEPARATE = {
    en: 'ℹ️ Telegram Premium is a separate subscription: it does not include Bezy Premium.',
    fr: 'ℹ️ Telegram Premium est un abonnement distinct : il n’inclut pas Bezy Premium.',
    de: 'ℹ️ Telegram Premium ist ein separates Abo: Es enthält kein Bezy Premium.',
    es: 'ℹ️ Telegram Premium es una suscripción aparte: no incluye Bezy Premium.',
    it: 'ℹ️ Telegram Premium è un abbonamento separato: non include Bezy Premium.',
    pt: 'ℹ️ O Telegram Premium é uma subscrição separada: não inclui o Bezy Premium.',
    ru: 'ℹ️ Telegram Premium — это отдельная подписка: она не включает Bezy Premium.',
    pl: 'ℹ️ Telegram Premium to osobna subskrypcja: nie obejmuje Bezy Premium.',
    ar: 'ℹ️ Telegram Premium اشتراك منفصل: لا يشمل Bezy Premium.',
    tr: 'ℹ️ Telegram Premium ayrı bir aboneliktir: Bezy Premium\'u içermez.',
    sw: 'ℹ️ Telegram Premium ni usajili tofauti: haujumuishi Bezy Premium.',
    yo: 'ℹ️ Telegram Premium jẹ́ ìsọdìí tó yàtọ̀: kò ní Bezy Premium nínú.',
    hi: 'ℹ️ Telegram Premium एक अलग सदस्यता है: इसमें Bezy Premium शामिल नहीं है।',
    id: 'ℹ️ Telegram Premium adalah langganan terpisah: tidak termasuk Bezy Premium.',
    zh: 'ℹ️ Telegram Premium 是独立的订阅：不包含 Bezy Premium。',
    ja: 'ℹ️ Telegram Premium は別のサブスクリプションで、Bezy Premium は含まれません。',
    ko: 'ℹ️ Telegram Premium은 별도의 구독이며 Bezy Premium은 포함되지 않습니다.'
  };
  let text;
  if (diag.revoked) {
    const refunded = {
      en: 'Your Bezy Premium was refunded, so Premium access was removed. You can subscribe again anytime in Bezy Premium.',
      fr: 'Votre Bezy Premium a été remboursé, l’accès Premium a donc été retiré. Vous pouvez vous réabonner à tout moment dans Bezy Premium.',
      de: 'Dein Bezy Premium wurde erstattet, daher wurde der Premium-Zugang entfernt. Du kannst dich jederzeit in Bezy Premium erneut anmelden.',
      es: 'Tu Bezy Premium ha sido reembolsado, así que se ha retirado el acceso Premium. Puedes volver a suscribirte cuando quieras en Bezy Premium.',
      it: 'Il tuo Bezy Premium è stato rimborsato, quindi l’accesso Premium è stato rimosso. Puoi abbonarti di nuovo in qualsiasi momento in Bezy Premium.',
      pt: 'O teu Bezy Premium foi reembolsado, por isso o acesso Premium foi removido. Podes subscrever novamente quando quiseres no Bezy Premium.',
      ru: 'Твой Bezy Premium был возвращён, поэтому доступ Premium убран. Ты можешь подписаться снова в любой момент в Bezy Premium.',
      pl: 'Twoje Bezy Premium zostało zwrócone, więc dostęp Premium został usunięty. Możesz zasubskrybować ponownie w każdej chwili w Bezy Premium.',
      ar: 'تم استرداد Bezy Premium الخاص بك، لذا أُزيل وصول Premium. يمكنك الاشتراك مجددًا في أي وقت من Bezy Premium.',
      tr: 'Bezy Premium\'in iade edildi, bu yüzden Premium erişimi kaldırıldı. Bezy Premium\'dan istediğin zaman yeniden abone olabilirsin.',
      sw: 'Bezy Premium yako imerejeshwa pesa, kwa hiyo ufikiaji wa Premium umeondolewa. Unaweza kujiandikisha tena wakati wowote kwenye Bezy Premium.',
      yo: 'Wọ́n ti dá owó Bezy Premium rẹ padà, nítorí náà a ti yọ ìwọlé Premium kúrò. O lè forúkọ sílẹ̀ lẹ́ẹ̀kan sí i nígbàkigbà nínú Bezy Premium.',
      hi: 'आपका Bezy Premium रिफ़ंड हो गया, इसलिए Premium एक्सेस हटा दिया गया। आप कभी भी Bezy Premium में दोबारा सदस्यता ले सकते हैं।',
      id: 'Bezy Premium-mu telah dikembalikan, jadi akses Premium dihapus. Kamu bisa berlangganan lagi kapan saja di Bezy Premium.',
      zh: '你的 Bezy Premium 已退款，因此 Premium 权限已被移除。你可以随时在 Bezy Premium 中重新订阅。',
      ja: 'Bezy Premium は払い戻されたため、Premium アクセスは削除されました。Bezy Premium からいつでも再登録できます。',
      ko: 'Bezy Premium이 환불되어 Premium 액세스가 제거되었습니다. Bezy Premium에서 언제든 다시 구독할 수 있습니다.'
    };
    text = ['💎 <b>Premium</b>', '', localized(language, refunded), '', localized(language, SEPARATE)];
  } else if (diag.active) {
    const until = diag.expiresAt ? new Intl.DateTimeFormat(dateLocale(language), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(diag.expiresAt)) : '';
    const active = {
      en: [`Your Bezy Premium is active${until ? ` until ${until}` : ''} (${diag.daysRemaining} day(s) remaining).`, 'For Stars questions: Stars are managed by Telegram (Settings → My Stars).'],
      fr: [`Votre Bezy Premium est actif${until ? ` jusqu’au ${until}` : ''} (${diag.daysRemaining} jour(s) restant(s)).`, 'Pour les questions de Stars : les Stars sont gérés par Telegram (Réglages → Mes Stars).'],
      de: [`Dein Bezy Premium ist aktiv${until ? ` bis ${until}` : ''} (${diag.daysRemaining} Tag(e) verbleibend).`, 'Zu Stars-Fragen: Stars werden von Telegram verwaltet (Einstellungen → Meine Stars).'],
      es: [`Tu Bezy Premium está activo${until ? ` hasta ${until}` : ''} (quedan ${diag.daysRemaining} día(s)).`, 'Sobre las Stars: las gestiona Telegram (Ajustes → Mis Stars).'],
      it: [`Il tuo Bezy Premium è attivo${until ? ` fino al ${until}` : ''} (${diag.daysRemaining} giorno/i rimanenti).`, 'Per domande sulle Stars: le Stars sono gestite da Telegram (Impostazioni → Le mie Stars).'],
      pt: [`O teu Bezy Premium está ativo${until ? ` até ${until}` : ''} (${diag.daysRemaining} dia(s) restantes).`, 'Sobre Stars: as Stars são geridas pelo Telegram (Definições → As Minhas Stars).'],
      ru: [`Твой Bezy Premium активен${until ? ` до ${until}` : ''} (осталось дн.: ${diag.daysRemaining}).`, 'По вопросам Stars: Stars управляет Telegram (Настройки → Мои Stars).'],
      pl: [`Twoje Bezy Premium jest aktywne${until ? ` do ${until}` : ''} (pozostało dni: ${diag.daysRemaining}).`, 'Pytania o Stars: Stars zarządza Telegram (Ustawienia → Moje Stars).'],
      ar: [`Bezy Premium الخاص بك نشط${until ? ` حتى ${until}` : ''} (متبقٍ: ${diag.daysRemaining} يوم/أيام).`, 'بخصوص Stars: تديرها Telegram (الإعدادات ← My Stars).'],
      tr: [`Bezy Premium\'in aktif${until ? `, ${until} tarihine kadar` : ''} (${diag.daysRemaining} gün kaldı).`, 'Stars soruları için: Stars Telegram tarafından yönetilir (Ayarlar → Yıldızlarım).'],
      sw: [`Bezy Premium yako inatumika${until ? ` hadi ${until}` : ''} (zimesalia siku ${diag.daysRemaining}).`, 'Kwa maswali ya Stars: Stars husimamiwa na Telegram (Mipangilio → My Stars).'],
      yo: [`Bezy Premium rẹ ń ṣiṣẹ́${until ? ` títí ${until}` : ''} (ọjọ́ ${diag.daysRemaining} ló kù).`, 'Fún ìbéèrè Stars: Telegram ló ń bójú tó Stars (Ìtòlẹ́sẹẹsẹ → My Stars).'],
      hi: [`आपका Bezy Premium सक्रिय है${until ? `, ${until} तक` : ''} (${diag.daysRemaining} दिन शेष)।`, 'Stars के सवालों के लिए: Stars Telegram संभालता है (सेटिंग्स → My Stars)।'],
      id: [`Bezy Premium-mu aktif${until ? ` hingga ${until}` : ''} (${diag.daysRemaining} hari tersisa).`, 'Soal Stars: Stars dikelola Telegram (Pengaturan → My Stars).'],
      zh: [`你的 Bezy Premium 已激活${until ? `，有效期至 ${until}` : ''}（剩余 ${diag.daysRemaining} 天）。`, '关于 Stars：Stars 由 Telegram 管理（设置 → 我的 Stars）。'],
      ja: [`Bezy Premium は有効です${until ? `（${until} まで）` : ''}（残り${diag.daysRemaining}日）。`, 'Stars について: Stars は Telegram が管理しています（設定 → マイスターズ）。'],
      ko: [`Bezy Premium이 활성화되어 있습니다${until ? `（${until}까지）` : ''}（${diag.daysRemaining}일 남음）。`, 'Stars 문의: Stars는 Telegram이 관리합니다(설정 → 내 Stars).']
    };
    text = ['💎 <b>Premium</b>', '', ...localized(language, active)];
  } else {
    const none = {
      en: ['No active Bezy Premium was detected on your account.', '• To subscribe: open Bezy → “View membership” → choose a plan.', '• Payment is in Telegram Stars ⭐ (Settings → My Stars).'],
      fr: ['Aucun Bezy Premium actif n’est détecté sur votre compte.', '• Pour souscrire : ouvrez Bezy → « Voir l’abonnement » → choisissez une formule.', '• Le paiement se fait en Telegram Stars ⭐ (Réglages → Mes Stars).'],
      de: ['Auf deinem Konto ist kein aktives Bezy Premium zu sehen.', '• Zum Abonnieren: Öffne Bezy → „Mitgliedschaft ansehen“ → wähle einen Plan.', '• Bezahlt wird mit Telegram Stars ⭐ (Einstellungen → Meine Stars).'],
      es: ['No se ha detectado ningún Bezy Premium activo en tu cuenta.', '• Para suscribirte: abre Bezy → «Ver suscripción» → elige un plan.', '• El pago es con Telegram Stars ⭐ (Ajustes → Mis Stars).'],
      it: ['Non è stato rilevato nessun Bezy Premium attivo sul tuo account.', '• Per abbonarti: apri Bezy → «Vedi abbonamento» → scegli un piano.', '• Il pagamento avviene con Telegram Stars ⭐ (Impostazioni → Le mie Stars).'],
      pt: ['Não foi detetado nenhum Bezy Premium ativo na tua conta.', '• Para subscrever: abre a Bezy → «Ver subscrição» → escolhe um plano.', '• O pagamento é em Telegram Stars ⭐ (Definições → As Minhas Stars).'],
      ru: ['На твоём аккаунте не обнаружен активный Bezy Premium.', '• Чтобы подписаться: открой Bezy → «Смотреть подписку» → выбери план.', '• Оплата — в Telegram Stars ⭐ (Настройки → Мои Stars).'],
      pl: ['Na twoim koncie nie wykryto aktywnego Bezy Premium.', '• Aby zasubskrybować: otwórz Bezy → «Zobacz subskrypcję» → wybierz plan.', '• Płatność w Telegram Stars ⭐ (Ustawienia → Moje Stars).'],
      ar: ['لم يتم رصد أي Bezy Premium نشط على حسابك.', '• للاشتراك: افتح Bezy ← «عرض الاشتراك» ← اختر باقة.', '• الدفع عبر Telegram Stars ⭐ (الإعدادات ← My Stars).'],
      tr: ['Hesabında aktif bir Bezy Premium bulunamadı.', '• Abone olmak için: Bezy\'yi aç → «Üyeliği görüntüle» → bir plan seç.', '• Ödeme Telegram Stars ⭐ ile yapılır (Ayarlar → Yıldızlarım).'],
      sw: ['Hakuna Bezy Premium inayotumika iliyogunduliwa kwenye akaunti yako.', '• Kujiandikisha: fungua Bezy → «Ona uanachama» → chagua mpango.', '• Malipo ni kwa Telegram Stars ⭐ (Mipangilio → My Stars).'],
      yo: ['A kò rí Bezy Premium tó ń ṣiṣẹ́ lórí àkọọ́lẹ̀ rẹ.', '• Láti forúkọ sílẹ̀: ṣí Bezy → «Wo ìsọdìí» → yan ètò.', '• Ìsanwó jẹ́ pẹ̀lú Telegram Stars ⭐ (Ìtòlẹ́sẹẹsẹ → My Stars).'],
      hi: ['आपके खाते पर कोई सक्रिय Bezy Premium नहीं मिला।', '• सदस्यता के लिए: Bezy खोलें → «सदस्यता देखें» → प्लान चुनें।', '• भुगतान Telegram Stars ⭐ से होता है (सेटिंग्स → My Stars)।'],
      id: ['Tidak ada Bezy Premium aktif yang terdeteksi di akunmu.', '• Untuk berlangganan: buka Bezy → «Lihat keanggotaan» → pilih paket.', '• Pembayaran memakai Telegram Stars ⭐ (Pengaturan → My Stars).'],
      zh: ['你的账户上没有检测到生效中的 Bezy Premium。', '• 订阅方式：打开 Bezy →「查看会员」→ 选择方案。', '• 付款使用 Telegram Stars ⭐（设置 → 我的 Stars）。'],
      ja: ['アカウントに有効な Bezy Premium は見つかりませんでした。', '• 登録するには: Bezy を開く →「メンバーシップを見る」→ プランを選ぶ。', '• 支払いは Telegram Stars ⭐（設定 → マイスターズ）。'],
      ko: ['계정에서 활성화된 Bezy Premium을 찾지 못했습니다.', '• 구독하려면: Bezy 열기 → «멤버십 보기» → 플랜 선택.', '• 결제는 Telegram Stars ⭐로 이루어집니다(설정 → 내 Stars).']
    };
    text = ['💎 <b>Premium</b>', '', ...localized(language, none), localized(language, SEPARATE)];
  }
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'premium'), [openPremium]]);
}

async function supportProfile(chatId, language, userData) {
  const diag = diagnoseProfile(userData);
  const openProfile = { text: localized(language, OPEN_PROFILE), web_app: { url: miniAppUrl('profile') } };
  const fieldNames = {
    en: { displayName: 'name', age: 'age', city: 'city', gender: '“I am”', seeking: '“looking for”' },
    fr: { displayName: 'nom', age: 'âge', city: 'ville', gender: '« je suis »', seeking: '« je recherche »' },
    de: { displayName: 'Name', age: 'Alter', city: 'Stadt', gender: '„Ich bin“', seeking: '„Ich suche“' },
    es: { displayName: 'nombre', age: 'edad', city: 'ciudad', gender: '«Yo soy»', seeking: '«Busco»' },
    it: { displayName: 'nome', age: 'età', city: 'città', gender: '«Io sono»', seeking: '«Cerco»' },
    pt: { displayName: 'nome', age: 'idade', city: 'cidade', gender: '«Eu sou»', seeking: '«Procuro»' },
    ru: { displayName: 'имя', age: 'возраст', city: 'город', gender: '«Кто я»', seeking: '«Кого ищу»' },
    pl: { displayName: 'imię', age: 'wiek', city: 'miasto', gender: '«Kim jestem»', seeking: '«Kogo szukam»' },
    ar: { displayName: 'الاسم', age: 'العمر', city: 'المدينة', gender: '«أنا»', seeking: '«أبحث عن»' },
    tr: { displayName: 'ad', age: 'yaş', city: 'şehir', gender: '«Ben»', seeking: '«Aradığım»' },
    sw: { displayName: 'jina', age: 'umri', city: 'mji', gender: '«Mimi ni»', seeking: '«Natafuta»' },
    yo: { displayName: 'orúkọ', age: 'ọjọ́ orí', city: 'ìlú', gender: '«Èmi ni»', seeking: '«Mo ń wá»' },
    hi: { displayName: 'नाम', age: 'उम्र', city: 'शहर', gender: '«मैं हूँ»', seeking: '«मैं ढूँढ रहा/रही हूँ»' },
    id: { displayName: 'nama', age: 'usia', city: 'kota', gender: '«Aku adalah»', seeking: '«Mencari»' },
    zh: { displayName: '姓名', age: '年龄', city: '城市', gender: '「我是」', seeking: '「我在寻找」' },
    ja: { displayName: '名前', age: '年齢', city: '都市', gender: '「私は」', seeking: '「探している」' },
    ko: { displayName: '이름', age: '나이', city: '도시', gender: '「나는」', seeking: '「찾는 대상」' }
  };
  let text;
  if (!diag.complete) {
    const names = diag.missing.map((f) => (fieldNames[language] || fieldNames.en)[f]).join(', ');
    const incomplete = {
      en: ['👤 <b>Profile</b>', '', `Your profile is incomplete. Missing: ${names}.`, '', 'Open Bezy → Profile, fill in the fields and press “Save profile”. Your profile only appears in Discover once it is complete.'],
      fr: ['👤 <b>Profil</b>', '', `Votre profil est incomplet. Il manque : ${names}.`, '', 'Ouvrez Bezy → Profil, complétez les champs, puis « Enregistrer le profil ». Votre profil n’apparaît dans Découvrir que lorsqu’il est complet.'],
      de: ['👤 <b>Profil</b>', '', `Dein Profil ist unvollständig. Es fehlt: ${names}.`, '', 'Öffne Bezy → Profil, fülle die Felder aus und tippe auf „Profil speichern“. Dein Profil erscheint erst in Entdecken, wenn es vollständig ist.'],
      es: ['👤 <b>Perfil</b>', '', `Tu perfil está incompleto. Faltan: ${names}.`, '', 'Abre Bezy → Perfil, rellena los campos y pulsa «Guardar perfil». Tu perfil solo aparece en Descubrir cuando está completo.'],
      it: ['👤 <b>Profilo</b>', '', `Il tuo profilo è incompleto. Mancano: ${names}.`, '', 'Apri Bezy → Profilo, compila i campi e premi «Salva profilo». Il tuo profilo appare in Scopri solo quando è completo.'],
      pt: ['👤 <b>Perfil</b>', '', `O teu perfil está incompleto. Em falta: ${names}.`, '', 'Abre a Bezy → Perfil, preenche os campos e prime «Guardar perfil». O teu perfil só aparece no Descobrir quando está completo.'],
      ru: ['👤 <b>Профиль</b>', '', `Твой профиль не заполнен. Не хватает: ${names}.`, '', 'Открой Bezy → Профиль, заполни поля и нажми «Сохранить профиль». Профиль появляется в «Знакомствах» только после заполнения.'],
      pl: ['👤 <b>Profil</b>', '', `Twój profil jest niekompletny. Brakuje: ${names}.`, '', 'Otwórz Bezy → Profil, uzupełnij pola i naciśnij «Zapisz profil». Profil pojawia się w Odkrywaniu dopiero po ukończeniu.'],
      ar: ['👤 <b>الملف الشخصي</b>', '', `ملفك غير مكتمل. الناقص: ${names}.`, '', 'افتح Bezy ← الملف الشخصي، املأ الحقول واضغط «حفظ الملف». لا يظهر ملفك في اكتشف إلا بعد اكتماله.'],
      tr: ['👤 <b>Profil</b>', '', `Profilin eksik. Eksikler: ${names}.`, '', 'Bezy\'yi aç → Profil, alanları doldur ve «Profili kaydet»e bas. Profilin yalnızca tamamlanınca Keşfet\'te görünür.'],
      sw: ['👤 <b>Wasifu</b>', '', `Wasifu wako haujakamilika. Zinazokosekana: ${names}.`, '', 'Fungua Bezy → Wasifu, jaza sehemu na ubonyeze «Hifadhi wasifu». Wasifu wako unaonekana kwenye Gundua tu ukikamilika.'],
      yo: ['👤 <b>Àkọọ́lẹ̀</b>', '', `Àkọọ́lẹ̀ rẹ kò pé. Àwọn tó kù: ${names}.`, '', 'Ṣí Bezy → Àkọọ́lẹ̀, kún àwọn ààyè náà, kí o sì tẹ «Fi àkọọ́lẹ̀ pamọ́». Àkọọ́lẹ̀ rẹ máa ń hàn nínú Ṣàwárí nígbà tó bá pé nìkan.'],
      hi: ['👤 <b>प्रोफ़ाइल</b>', '', `आपकी प्रोफ़ाइल अधूरी है। कमी: ${names}।`, '', 'Bezy → प्रोफ़ाइल खोलें, फ़ील्ड भरें और «प्रोफ़ाइल सहेजें» दबाएँ। प्रोफ़ाइल पूरी होने पर ही खोजें में दिखती है।'],
      id: ['👤 <b>Profil</b>', '', `Profilmu belum lengkap. Yang kurang: ${names}.`, '', 'Buka Bezy → Profil, isi kolomnya, lalu tekan «Simpan profil». Profilmu hanya muncul di Jelajahi setelah lengkap.'],
      zh: ['👤 <b>个人资料</b>', '', `你的资料不完整。缺少：${names}。`, '', '打开 Bezy → 个人资料，填写字段后按「保存资料」。资料完成后才会在「发现」中显示。'],
      ja: ['👤 <b>プロフィール</b>', '', `プロフィールが未完成です。不足: ${names}。`, '', 'Bezy → プロフィールを開き、項目を入力して「プロフィールを保存」を押してください。完成するまで発見には表示されません。'],
      ko: ['👤 <b>프로필</b>', '', `프로필이 미완성입니다. 부족한 항목: ${names}.`, '', 'Bezy → 프로필을 열고 항목을 채운 뒤 «프로필 저장»을 누르세요. 완성되어야 발견에 표시됩니다.']
    };
    text = localized(language, incomplete);
  } else {
    const complete = {
      en: ['👤 <b>Profile</b>', '', 'Your profile is complete. You can edit it anytime in Bezy → Profile.', '', 'Your Telegram username is only shown after a match — that is by design.'],
      fr: ['👤 <b>Profil</b>', '', 'Votre profil est complet. Vous pouvez le modifier à tout moment dans Bezy → Profil.', '', 'Votre nom d’utilisateur Telegram n’est montré qu’après un match — c’est normal.'],
      de: ['👤 <b>Profil</b>', '', 'Dein Profil ist vollständig. Du kannst es jederzeit in Bezy → Profil bearbeiten.', '', 'Dein Telegram-Benutzername wird erst nach einem Match angezeigt — das ist Absicht.'],
      es: ['👤 <b>Perfil</b>', '', 'Tu perfil está completo. Puedes editarlo cuando quieras en Bezy → Perfil.', '', 'Tu nombre de usuario de Telegram solo se muestra después de un match: es a propósito.'],
      it: ['👤 <b>Profilo</b>', '', 'Il tuo profilo è completo. Puoi modificarlo in qualsiasi momento in Bezy → Profilo.', '', 'Il tuo nome utente Telegram viene mostrato solo dopo un match: è voluto.'],
      pt: ['👤 <b>Perfil</b>', '', 'O teu perfil está completo. Podes editá-lo quando quiseres na Bezy → Perfil.', '', 'O teu nome de utilizador do Telegram só é mostrado depois de um match — é de propósito.'],
      ru: ['👤 <b>Профиль</b>', '', 'Твой профиль заполнен. Ты можешь изменить его в любой момент в Bezy → Профиль.', '', 'Твой никнейм Telegram показывается только после мэтча — так задумано.'],
      pl: ['👤 <b>Profil</b>', '', 'Twój profil jest kompletny. Możesz go edytować w każdej chwili w Bezy → Profil.', '', 'Twoja nazwa Telegram jest widoczna dopiero po dopasowaniu — tak jest zaprojektowane.'],
      ar: ['👤 <b>الملف الشخصي</b>', '', 'ملفك مكتمل. يمكنك تعديله في أي وقت من Bezy ← الملف الشخصي.', '', 'لا يظهر اسم مستخدم Telegram إلا بعد المطابقة — وهذا مقصود.'],
      tr: ['👤 <b>Profil</b>', '', 'Profilin tamamlandı. İstediğin zaman Bezy → Profil\'den düzenleyebilirsin.', '', 'Telegram kullanıcı adın yalnızca eşleşmeden sonra görünür — bu bilinçli bir tasarımdır.'],
      sw: ['👤 <b>Wasifu</b>', '', 'Wasifu wako umekamilika. Unaweza kuuhariri wakati wowote kwenye Bezy → Wasifu.', '', 'Jina lako la mtumiaji wa Telegram linaonekana tu baada ya mechi — hivyo ndivyo ilivyokusudiwa.'],
      yo: ['👤 <b>Àkọọ́lẹ̀</b>', '', 'Àkọọ́lẹ̀ rẹ ti pé. O lè ṣàtúnṣe rẹ̀ nígbàkigbà nínú Bezy → Àkọọ́lẹ̀.', '', 'Orúkọ Telegram rẹ máa ń hàn lẹ́yìn mátìsì nìkan — èròǹgbà ni.'],
      hi: ['👤 <b>प्रोफ़ाइल</b>', '', 'आपकी प्रोफ़ाइल पूरी है। आप इसे कभी भी Bezy → प्रोफ़ाइल में बदल सकते हैं।', '', 'आपका Telegram यूज़रनेम मैच के बाद ही दिखता है — यह जानबूझकर है।'],
      id: ['👤 <b>Profil</b>', '', 'Profilmu lengkap. Kamu bisa mengubahnya kapan saja di Bezy → Profil.', '', 'Nama pengguna Telegram-mu hanya muncul setelah kecocokan — itu memang disengaja.'],
      zh: ['👤 <b>个人资料</b>', '', '你的资料已完整。你可以随时在 Bezy → 个人资料中编辑。', '', '你的 Telegram 用户名只在配对后显示——这是有意设计的。'],
      ja: ['👤 <b>プロフィール</b>', '', 'プロフィールは完成しています。Bezy → プロフィールからいつでも編集できます。', '', 'Telegram のユーザー名はマッチ後にのみ表示されます——仕様です。'],
      ko: ['👤 <b>프로필</b>', '', '프로필이 완성되었습니다. Bezy → 프로필에서 언제든 수정할 수 있습니다.', '', 'Telegram 사용자 이름은 매치 후에만 표시됩니다 — 의도된 설계입니다.']
    };
    text = localized(language, complete);
  }
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'profile'), [openProfile]]);
}

const DISCOVERY_TITLE = { en: '🔎 <b>Discovery — here is what I see</b>', fr: '🔎 <b>Découverte — voici ce que je vois</b>', de: '🔎 <b>Entdecken — das sehe ich</b>', es: '🔎 <b>Descubrimiento: esto es lo que veo</b>', it: '🔎 <b>Scoperta: ecco cosa vedo</b>', pt: '🔎 <b>Descoberta — eis o que eu vejo</b>', ru: '🔎 <b>Знакомства — вот что я вижу</b>', pl: '🔎 <b>Odkrywanie — oto co widzę</b>', ar: '🔎 <b>الاكتشاف — إليك ما أراه</b>', tr: '🔎 <b>Keşif — işte gördüklerim</b>', sw: '🔎 <b>Ugunduzi — haya ndiyo ninayoyaona</b>', yo: '🔎 <b>Ìṣàwárí — èyí ni ohun tí mo rí</b>', hi: '🔎 <b>खोज — मैं यह देख रहा हूँ</b>', id: '🔎 <b>Penjelajahan — ini yang saya lihat</b>', zh: '🔎 <b>发现——这是我看到的情况</b>', ja: '🔎 <b>発見——確認できたこと</b>', ko: '🔎 <b>발견 — 제가 확인한 내용</b>' };
const DISCOVERY_PLAIN = { en: '🔎 <b>Discovery</b>', fr: '🔎 <b>Découverte</b>', de: '🔎 <b>Entdecken</b>', es: '🔎 <b>Descubrimiento</b>', it: '🔎 <b>Scoperta</b>', pt: '🔎 <b>Descoberta</b>', ru: '🔎 <b>Знакомства</b>', pl: '🔎 <b>Odkrywanie</b>', ar: '🔎 <b>الاكتشاف</b>', tr: '🔎 <b>Keşif</b>', sw: '🔎 <b>Ugunduzi</b>', yo: '🔎 <b>Ìṣàwárí</b>', hi: '🔎 <b>खोज</b>', id: '🔎 <b>Penjelajahan</b>', zh: '🔎 <b>发现</b>', ja: '🔎 <b>発見</b>', ko: '🔎 <b>발견</b>' };
const DISCOVERY_ALL_GOOD = {
  en: 'Everything looks correct: your profile is complete, you are discoverable, and you still have discovery actions left today. If there are few people around you, it may simply mean there are not many profiles yet.',
  fr: 'Tout semble correct : profil complet, visible dans Découvrir, et il vous reste des actions de découverte aujourd’hui. S’il y a peu de monde autour de vous, cela peut simplement signifier qu’il n’y a pas encore beaucoup de profils.',
  de: 'Alles sieht gut aus: Dein Profil ist vollständig, du bist sichtbar, und du hast heute noch Entdecken-Aktionen übrig. Wenn es wenige Leute in deiner Nähe gibt, kann das einfach bedeuten, dass es noch nicht viele Profile gibt.',
  es: 'Todo parece correcto: tu perfil está completo, eres visible en Descubrir y todavía te quedan acciones de descubrimiento hoy. Si hay poca gente cerca de ti, puede significar simplemente que aún no hay muchos perfiles.',
  it: 'Tutto sembra corretto: il tuo profilo è completo, sei visibile in Scopri e oggi hai ancora azioni di scoperta a disposizione. Se ci sono poche persone vicino a te, può semplicemente voler dire che non ci sono ancora molti profili.',
  pt: 'Tudo parece correto: o teu perfil está completo, estás visível no Descobrir e ainda tens ações de descoberta hoje. Se há poucas pessoas perto de ti, pode simplesmente significar que ainda não há muitos perfis.',
  ru: 'Всё выглядит правильно: профиль заполнен, ты виден в «Знакомствах», и на сегодня ещё остались действия. Если рядом мало людей, это может просто значить, что профилей пока немного.',
  pl: 'Wszystko wygląda poprawnie: profil jest kompletny, jesteś widoczny w Odkrywaniu i masz dziś jeszcze akcje odkrywania. Jeśli w pobliżu jest mało osób, może to po prostu znaczyć, że profili jest jeszcze niewiele.',
  ar: 'كل شيء يبدو سليمًا: ملفك مكتمل، وأنت ظاهر في اكتشف، وما زالت لديك إجراءات اكتشاف اليوم. إذا كان عدد الأشخاص قليلًا حولك، فقد يعني ذلك ببساطة أنه لا توجد ملفات كثيرة بعد.',
  tr: 'Her şey doğru görünüyor: profilin tamamlandı, Keşfet\'te görünürsün ve bugün hâlâ keşif hakkın var. Etrafında az insan varsa, bu sadece henüz çok profil olmadığı anlamına gelebilir.',
  sw: 'Kila kitu kinaonekana sawa: wasifu wako umekamilika, unaonekana kwenye Gundua, na bado una vitendo vya ugunduzi leo. Ikiwa kuna watu wachache karibu nawe, inaweza kumaanisha tu kwamba bado hakuna wasifu wengi.',
  yo: 'Gbogbo rẹ̀ dára: àkọọ́lẹ̀ rẹ ti pé, o ń hàn nínú Ṣàwárí, o sì ṣì ní àwọn ìgbésẹ̀ ìṣàwárí lónìí. Tí àwọn ènìyàn kò bá pọ̀ ní àyíká rẹ, ó lè túmọ̀ sí pé àwọn àkọọ́lẹ̀ kò tíì pọ̀.',
  hi: 'सब कुछ सही दिखता है: प्रोफ़ाइल पूरी है, आप खोजें में दिख रहे हैं और आज के लिए खोज क्रियाएँ बाकी हैं। अगर आस-पास कम लोग हैं, तो इसका मतलब बस यह हो सकता है कि अभी प्रोफ़ाइल कम हैं।',
  id: 'Semuanya tampak benar: profilmu lengkap, kamu terlihat di Jelajahi, dan masih ada jatah penjelajahan hari ini. Jika sedikit orang di sekitarmu, mungkin itu hanya berarti belum banyak profil.',
  zh: '一切看起来正常：资料已完整，你已出现在「发现」中，今天也还有发现次数。如果附近人少，可能只是说明目前资料还不多。',
  ja: 'すべて正常です：プロフィールは完成し、発見に表示されており、今日の操作回数も残っています。周りに人が少ない場合は、単にプロフィールがまだ少ないだけかもしれません。',
  ko: '모든 것이 정상입니다: 프로필이 완성되었고 발견에 표시되며, 오늘 쓸 수 있는 발견 횟수도 남아 있습니다. 주변에 사람이 적다면 아직 프로필이 많지 않다는 뜻일 수 있습니다.'
};
const DISCOVERY_FINDINGS = {
  profile: {
    en: '• Your profile is incomplete — complete it in Bezy → Profile.',
    fr: '• Votre profil est incomplet — complétez-le dans Bezy → Profil.',
    de: '• Dein Profil ist unvollständig — vervollständige es in Bezy → Profil.',
    es: '• Tu perfil está incompleto: complétalo en Bezy → Perfil.',
    it: '• Il tuo profilo è incompleto: completalo in Bezy → Profilo.',
    pt: '• O teu perfil está incompleto — completa-o na Bezy → Perfil.',
    ru: '• Твой профиль не заполнен — заполни его в Bezy → Профиль.',
    pl: '• Twój profil jest niekompletny — uzupełnij go w Bezy → Profil.',
    ar: '• ملفك غير مكتمل — أكمله في Bezy ← الملف الشخصي.',
    tr: '• Profilin eksik — Bezy → Profil\'den tamamla.',
    sw: '• Wasifu wako haujakamilika — ukamilishe kwenye Bezy → Wasifu.',
    yo: '• Àkọọ́lẹ̀ rẹ kò pé — parí rẹ̀ nínú Bezy → Àkọọ́lẹ̀.',
    hi: '• आपकी प्रोफ़ाइल अधूरी है — Bezy → प्रोफ़ाइल में पूरी करें।',
    id: '• Profilmu belum lengkap — lengkapi di Bezy → Profil.',
    zh: '• 你的资料不完整——请在 Bezy → 个人资料中完善。',
    ja: '• プロフィールが未完成です——Bezy → プロフィールで完成させてください。',
    ko: '• 프로필이 미완성입니다 — Bezy → 프로필에서 완성하세요.'
  },
  age: {
    en: '• You have not confirmed that you are 18 or over yet.',
    fr: '• Vous n’avez pas encore confirmé avoir 18 ans ou plus.',
    de: '• Du hast noch nicht bestätigt, dass du 18 oder älter bist.',
    es: '• Todavía no has confirmado que tienes 18 años o más.',
    it: '• Non hai ancora confermato di avere 18 anni o più.',
    pt: '• Ainda não confirmaste que tens 18 anos ou mais.',
    ru: '• Ты ещё не подтвердил, что тебе 18 или больше.',
    pl: '• Nie potwierdziłeś jeszcze, że masz 18 lat lub więcej.',
    ar: '• لم تؤكد بعد أن عمرك 18 عامًا أو أكثر.',
    tr: '• Henüz 18 yaşında veya daha büyük olduğunu onaylamadın.',
    sw: '• Bado hujathibitisha kwamba una miaka 18 au zaidi.',
    yo: '• O kò tíì fìdí rẹ̀ múlẹ̀ pé o pé ọmọ ọdún 18 tàbí jù bẹ́ẹ̀ lọ.',
    hi: '• आपने अभी तक पुष्टि नहीं की है कि आप 18 वर्ष या उससे अधिक के हैं।',
    id: '• Kamu belum mengonfirmasi bahwa usiamu 18 tahun atau lebih.',
    zh: '• 你还没有确认自己已年满 18 周岁。',
    ja: '• まだ18歳以上であることを確認していません。',
    ko: '• 아직 만 18세 이상임을 확인하지 않았습니다.'
  },
  restricted: {
    en: '• Processing is paused — resume it in Profile → Safety & privacy.',
    fr: '• Le traitement est suspendu — reprenez-le dans Profil → Sécurité et confidentialité.',
    de: '• Die Verarbeitung ist pausiert — setze sie unter Profil → Sicherheit & Datenschutz fort.',
    es: '• El tratamiento está pausado: reanúdalo en Perfil → Seguridad y privacidad.',
    it: '• Il trattamento è in pausa: riprendilo in Profilo → Sicurezza e privacy.',
    pt: '• O tratamento está pausado — retoma-o em Perfil → Segurança e privacidade.',
    ru: '• Обработка приостановлена — возобнови её в Профиле → Безопасность и конфиденциальность.',
    pl: '• Przetwarzanie jest wstrzymane — wznów je w Profil → Bezpieczeństwo i prywatność.',
    ar: '• المعالجة متوقفة مؤقتًا — استئنفها في الملف الشخصي ← الأمان والخصوصية.',
    tr: '• İşleme duraklatıldı — Profil → Güvenlik ve gizlilik\'ten sürdür.',
    sw: '• Uchakataji umesimamishwa — uendeleze kwenye Wasifu → Usalama na faragha.',
    yo: '• Ìlò ti dá dúró — tún un bẹ̀rẹ̀ nínú Àkọọ́lẹ̀ → Ààbò àti àṣírí.',
    hi: '• प्रोसेसिंग रुकी हुई है — प्रोफ़ाइल → सुरक्षा और गोपनीयता में फिर शुरू करें।',
    id: '• Pemrosesan dijeda — lanjutkan di Profil → Keamanan dan privasi.',
    zh: '• 处理已暂停——请在个人资料 → 安全与隐私中恢复。',
    ja: '• 処理が停止中です——プロフィール → 安全とプライバシーで再開してください。',
    ko: '• 처리가 일시 중지되었습니다 — 프로필 → 안전 및 개인정보에서 재개하세요.'
  },
  objection: {
    en: '• You have objected to processing — withdraw the objection in Profile → Safety & privacy.',
    fr: '• Vous vous êtes opposé·e au traitement — retirez l’opposition dans Profil → Sécurité et confidentialité.',
    de: '• Du hast der Verarbeitung widersprochen — ziehe den Widerspruch unter Profil → Sicherheit & Datenschutz zurück.',
    es: '• Te has opuesto al tratamiento: retira la oposición en Perfil → Seguridad y privacidad.',
    it: '• Ti sei opposto al trattamento: ritira l’opposizione in Profilo → Sicurezza e privacy.',
    pt: '• Opor-te ao tratamento — retira a oposição em Perfil → Segurança e privacidade.',
    ru: '• Ты возразил против обработки — отзови возражение в Профиле → Безопасность и конфиденциальность.',
    pl: '• Wniosłeś sprzeciw wobec przetwarzania — cofnij go w Profil → Bezpieczeństwo i prywatność.',
    ar: '• لقد اعترضت على المعالجة — اسحب الاعتراض في الملف الشخصي ← الأمان والخصوصية.',
    tr: '• İşlemeye itiraz ettin — itirazı Profil → Güvenlik ve gizlilik\'ten geri çek.',
    sw: '• Umepinga uchakataji — ondoa pingamizi kwenye Wasifu → Usalama na faragha.',
    yo: '• O ti tako ìlò — yọ ìtako kúrò nínú Àkọọ́lẹ̀ → Ààbò àti àṣírí.',
    hi: '• आपने प्रोसेसिंग पर आपत्ति की है — प्रोफ़ाइल → सुरक्षा और गोपनीयता में आपत्ति वापस लें।',
    id: '• Kamu keberatan atas pemrosesan — tarik keberatan di Profil → Keamanan dan privasi.',
    zh: '• 你已反对处理——请在个人资料 → 安全与隐私中撤回反对。',
    ja: '• 処理に異議を申し立てています——プロフィール → 安全とプライバシーで取り下げてください。',
    ko: '• 처리에 이의를 제기했습니다 — 프로필 → 안전 및 개인정보에서 철회하세요.'
  },
  discoverable: {
    en: '• “Show my profile in Discover” is switched off.',
    fr: '• « Montrer mon profil dans Découvrir » est désactivé.',
    de: '• „Mein Profil in Entdecken anzeigen“ ist ausgeschaltet.',
    es: '• «Mostrar mi perfil en Descubrir» está desactivado.',
    it: '• «Mostra il mio profilo in Scopri» è disattivato.',
    pt: '• «Mostrar o meu perfil no Descobrir» está desligado.',
    ru: '• «Показывать мой профиль в „Знакомствах“» выключено.',
    pl: '• «Pokazuj mój profil w Odkrywaniu» jest wyłączone.',
    ar: '• «إظهار ملفي في اكتشف» مُعطَّل.',
    tr: '• «Profilimi Keşfet\'te göster» kapalı.',
    sw: '• «Onyesha wasifu wangu kwenye Gundua» imezimwa.',
    yo: '• «Fi àkọọ́lẹ̀ mi hàn nínú Ṣàwárí» ti wà ní pípàdé.',
    hi: '• «मेरी प्रोफ़ाइल खोजें में दिखाएँ» बंद है।',
    id: '• «Tampilkan profilku di Jelajahi» dinonaktifkan.',
    zh: '• 「在发现中展示我的资料」已关闭。',
    ja: '• 「プロフィールを発見に表示」がオフです。',
    ko: '• «프로필을 발견에 표시»가 꺼져 있습니다.'
  },
  limit: {
    en: '• You have reached today’s discovery limit — it resets tomorrow (Premium removes it).',
    fr: '• Vous avez atteint la limite de découverte du jour — elle se réinitialise demain (Premium la supprime).',
    de: '• Du hast das heutige Entdecken-Limit erreicht — es wird morgen zurückgesetzt (Premium entfernt es).',
    es: '• Has alcanzado el límite de descubrimiento de hoy: se restablece mañana (Premium lo elimina).',
    it: '• Hai raggiunto il limite di scoperta di oggi: si azzera domani (Premium lo elimina).',
    pt: '• Atingiste o limite de descoberta de hoje — repõe-se amanhã (o Premium remove-o).',
    ru: '• Ты достиг сегодняшнего лимита знакомств — он сбросится завтра (Premium убирает его).',
    pl: '• Osiągnąłeś dzisiejszy limit odkrywania — resetuje się jutro (Premium go usuwa).',
    ar: '• بلغت حد الاكتشاف اليومي — يُعاد غدًا (Premium يزيله).',
    tr: '• Bugünkü keşif limitine ulaştın — yarın sıfırlanır (Premium kaldırır).',
    sw: '• Umefikia kikomo cha ugunduzi cha leo — kitaanza upya kesho (Premium huondoa kikomo).',
    yo: '• O ti dé ààlà ìṣàwárí òní — yóò tún bẹ̀rẹ̀ lọ́la (Premium máa ń yọ ọ́ kúrò).',
    hi: '• आप आज की खोज सीमा पर पहुँच गए हैं — यह कल रीसेट होगी (Premium इसे हटा देता है)।',
    id: '• Kamu mencapai batas penjelajahan hari ini — besok diatur ulang (Premium menghapusnya).',
    zh: '• 你已达到今日发现上限——明天重置（Premium 可解除）。',
    ja: '• 今日の発見上限に達しました——明日リセットされます（Premium なら上限なし）。',
    ko: '• 오늘의 발견 한도에 도달했습니다 — 내일 초기화됩니다(Premium은 한도를 없앱니다).'
  },
  filters: {
    en: '• Your filters (city, same-city, languages, age range) narrow the results.',
    fr: '• Vos filtres (ville, même ville, langues, tranche d’âge) réduisent les résultats.',
    de: '• Deine Filter (Stadt, gleiche Stadt, Sprachen, Altersspanne) schränken die Ergebnisse ein.',
    es: '• Tus filtros (ciudad, misma ciudad, idiomas, rango de edad) reducen los resultados.',
    it: '• I tuoi filtri (città, stessa città, lingue, fascia d’età) restringono i risultati.',
    pt: '• Os teus filtros (cidade, mesma cidade, idiomas, intervalo de idades) reduzem os resultados.',
    ru: '• Твои фильтры (город, только мой город, языки, возраст) сужают результаты.',
    pl: '• Twoje filtry (miasto, tylko moje miasto, języki, przedział wieku) zawężają wyniki.',
    ar: '• فلاترك (المدينة، مدينتي فقط، اللغات، نطاق العمر) تقلّل النتائج.',
    tr: '• Filtrelerin (şehir, aynı şehir, diller, yaş aralığı) sonuçları daraltıyor.',
    sw: '• Vichujio vyako (mji, mji wangu pekee, lugha, umri) vinapunguza matokeo.',
    yo: '• Àwọn àyẹ̀wò rẹ (ìlú, ìlú mi nìkan, àwọn èdè, ọjọ́ orí) ń dín àwọn àbájáde kù.',
    hi: '• आपके फ़िल्टर (शहर, सिर्फ़ मेरा शहर, भाषाएँ, आयु सीमा) परिणाम कम करते हैं।',
    id: '• Filtermu (kota, hanya kota yang sama, bahasa, rentang usia) mempersempit hasil.',
    zh: '• 你的筛选（城市、同城、语言、年龄范围）缩小了结果。',
    ja: '• フィルター（都市、同じ都市のみ、言語、年齢範囲）が結果を絞っています。',
    ko: '• 필터(도시, 같은 도시, 언어, 나이 범위)가 결과를 좁히고 있습니다.'
  }
};

async function supportDiscovery(chatId, language, userData) {
  const diag = diagnoseDiscovery(userData);
  const openDiscover = { text: localized(language, OPEN_DISCOVER), web_app: { url: miniAppUrl('discover') } };
  const F = (id) => localized(language, DISCOVERY_FINDINGS[id]);
  const findings = [];
  if (!diag.profileComplete) findings.push(F('profile'));
  if (!diag.ageEligibilityConfirmed) findings.push(F('age'));
  if (diag.processingRestricted) findings.push(F('restricted'));
  if (diag.processingObjection) findings.push(F('objection'));
  if (!diag.discoverable) findings.push(F('discoverable'));
  if (diag.discoveryRemaining === 0) findings.push(F('limit'));
  if (diag.filtersActive) findings.push(F('filters'));
  const text = findings.length
    ? [localized(language, DISCOVERY_TITLE), '', ...findings]
    : [localized(language, DISCOVERY_PLAIN), '', localized(language, DISCOVERY_ALL_GOOD)];
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'discovery'), [openDiscover]]);
}

const MATCHES_SOME = {
  en: ['💜 <b>Likes & Matches</b>', '', 'You have {count} match(es). Open Bezy → Matches to see them. The conversation itself happens right here in Bezy.', '', 'A like alone does not create a match: the interest must be mutual.'],
  fr: ['💜 <b>Likes & matchs</b>', '', 'Vous avez {count} match(s). Ouvrez Bezy → Matchs pour les voir. La conversation elle-même a lieu ici, dans Bezy.', '', 'Un like seul ne crée pas de match : il faut que l’intérêt soit réciproque.'],
  de: ['💜 <b>Likes & Matches</b>', '', 'Du hast {count} Match(es). Öffne Bezy → Matches, um sie zu sehen. Die Unterhaltung selbst findet direkt hier in Bezy statt.', '', 'Ein Like allein ergibt kein Match: Das Interesse muss gegenseitig sein.'],
  es: ['💜 <b>Likes y matches</b>', '', 'Tienes {count} match(es). Abre Bezy → Matches para verlos. La conversación en sí tiene lugar aquí mismo, en Bezy.', '', 'Un like por sí solo no crea un match: el interés debe ser mutuo.'],
  it: ['💜 <b>Like e match</b>', '', 'Hai {count} match. Apri Bezy → Match per vederli. La conversazione stessa avviene proprio qui, su Bezy.', '', 'Un like da solo non crea un match: l’interesse deve essere reciproco.'],
  pt: ['💜 <b>Likes e matches</b>', '', 'Tens {count} match(es). Abre a Bezy → Matches para os veres. A conversa em si acontece mesmo aqui, na Bezy.', '', 'Um like sozinho não cria um match: o interesse tem de ser mútuo.'],
  ru: ['💜 <b>Лайки и мэтчи</b>', '', 'У тебя {count} мэтч(ей). Открой Bezy → Мэтчи, чтобы их увидеть. Сам разговор происходит прямо здесь, в Bezy.', '', 'Один лайк не создаёт мэтч: интерес должен быть взаимным.'],
  pl: ['💜 <b>Polubienia i dopasowania</b>', '', 'Masz {count} dopasowań. Otwórz Bezy → Dopasowania, aby je zobaczyć. Rozmowa toczy się właśnie tutaj, w Bezy.', '', 'Samo polubienie nie tworzy dopasowania: zainteresowanie musi być wzajemne.'],
  ar: ['💜 <b>الإعجابات والمطابقات</b>', '', 'لديك {count} مطابقة/مطابقات. افتح Bezy ← المطابقات لرؤيتها. المحادثة نفسها تحدث هنا مباشرة، في Bezy.', '', 'الإعجاب وحده لا يُنشئ مطابقة: يجب أن يكون الاهتمام متبادلًا.'],
  tr: ['💜 <b>Beğeniler ve eşleşmeler</b>', '', '{count} eşleşmen var. Görmek için Bezy → Eşleşmeler\'i aç. Sohbetin kendisi tam burada, Bezy\'de gerçekleşir.', '', 'Tek başına beğeni eşleşme oluşturmaz: ilginin karşılıklı olması gerekir.'],
  sw: ['💜 <b>Kupenda na mechi</b>', '', 'Una mechi {count}. Fungua Bezy → Mechi ili kuziona. Mazungumzo yenyewe hufanyika hapa hapa, kwenye Bezy.', '', 'Kupenda peke yake hakuleti mechi: maslahi lazima yafanane.'],
  yo: ['💜 <b>Likes àti mátìsì</b>', '', 'O ní mátìsì {count}. Ṣí Bezy → Àwọn mátìsì láti rí wọn. Ìbánisọ̀rọ̀ fúnra rẹ̀ máa ń ṣẹlẹ̀ níbí gan-an, nínú Bezy.', '', 'Likes nìkan kì í dá mátìsì: ìfẹ́ gbọ́dọ̀ jọra.'],
  hi: ['💜 <b>लाइक और मैच</b>', '', 'आपके {count} मैच हैं। उन्हें देखने के लिए Bezy → मैच खोलें। बातचीत यहीं Bezy में होती है।', '', 'अकेला लाइक मैच नहीं बनाता: दिलचस्पी आपसी होनी चाहिए।'],
  id: ['💜 <b>Suka dan kecocokan</b>', '', 'Kamu punya {count} kecocokan. Buka Bezy → Kecocokan untuk melihatnya. Percakapannya sendiri terjadi di sini, di dalam Bezy.', '', 'Suka saja tidak membuat kecocokan: minatnya harus saling terbalas.'],
  zh: ['💜 <b>喜欢与配对</b>', '', '你有 {count} 个配对。打开 Bezy → 配对即可查看。对话就在 Bezy 里进行。', '', '仅仅喜欢不会形成配对：兴趣必须是相互的。'],
  ja: ['💜 <b>いいねとマッチ</b>', '', '{count}件のマッチがあります。Bezy → マッチで確認できます。会話そのものはここ Bezy の中で行われます。', '', 'いいねだけではマッチになりません：関心が相互である必要があります。'],
  ko: ['💜 <b>좋아요 및 매치</b>', '', '{count}개의 매치가 있습니다. Bezy → 매치에서 확인하세요. 대화는 바로 여기 Bezy에서 이루어집니다.', '', '좋아요만으로는 매치가 되지 않습니다: 관심이 서로 맞아야 합니다.']
};
const MATCHES_NONE = {
  en: ['💜 <b>Likes & Matches</b>', '', 'No matches yet. A match happens when two people like each other.', '', '• Complete your profile: it only appears in Discover once complete.', '• Check your filters — too strict, and they narrow the results.', '• Keep liking: the more you discover, the better your chances.'],
  fr: ['💜 <b>Likes & matchs</b>', '', 'Aucun match pour l’instant. Un match naît quand deux personnes se likent mutuellement.', '', '• Complétez votre profil : il apparaît dans Découvrir uniquement s’il est complet.', '• Vérifiez vos filtres — trop stricts, ils réduisent les résultats.', '• Continuez à liker : plus vous découvrez, plus vous avez de chances.'],
  de: ['💜 <b>Likes & Matches</b>', '', 'Noch keine Matches. Ein Match entsteht, wenn sich zwei Personen gegenseitig liken.', '', '• Vervollständige dein Profil: Es erscheint nur in Entdecken, wenn es vollständig ist.', '• Prüfe deine Filter — zu streng, und sie schränken die Ergebnisse ein.', '• Like weiter: Je mehr du entdeckst, desto besser deine Chancen.'],
  es: ['💜 <b>Likes y matches</b>', '', 'Todavía no hay matches. Un match se produce cuando dos personas se dan like mutuamente.', '', '• Completa tu perfil: solo aparece en Descubrir cuando está completo.', '• Revisa tus filtros: si son demasiado estrictos, reducen los resultados.', '• Sigue dando like: cuanto más descubres, más posibilidades tienes.'],
  it: ['💜 <b>Like e match</b>', '', 'Ancora nessun match. Un match nasce quando due persone si mettono like a vicenda.', '', '• Completa il tuo profilo: appare in Scopri solo quando è completo.', '• Controlla i filtri: se troppo restrittivi, riducono i risultati.', '• Continua a mettere like: più scopri, più probabilità hai.'],
  pt: ['💜 <b>Likes e matches</b>', '', 'Ainda sem matches. Um match acontece quando duas pessoas gostam uma da outra.', '', '• Completa o teu perfil: só aparece no Descobrir quando está completo.', '• Verifica os teus filtros — demasiado restritos reduzem os resultados.', '• Continua a dar like: quanto mais descobres, melhores as tuas hipóteses.'],
  ru: ['💜 <b>Лайки и мэтчи</b>', '', 'Пока нет мэтчей. Мэтч появляется, когда два человека лайкают друг друга.', '', '• Заполни профиль: он появляется в «Знакомствах» только после заполнения.', '• Проверь фильтры — слишком строгие сужают результаты.', '• Лайкай дальше: чем больше открываешь, тем больше шансов.'],
  pl: ['💜 <b>Polubienia i dopasowania</b>', '', 'Na razie brak dopasowań. Dopasowanie powstaje, gdy dwie osoby się polubią.', '', '• Uzupełnij profil: pojawia się w Odkrywaniu dopiero po ukończeniu.', '• Sprawdź filtry — zbyt restrykcyjne zawężają wyniki.', '• Polub dalej: im więcej odkrywasz, tym większe szanse.'],
  ar: ['💜 <b>الإعجابات والمطابقات</b>', '', 'لا مطابقات بعد. تحدث المطابقة عندما يُعجب شخصان ببعضهما.', '', '• أكمل ملفك: لا يظهر في اكتشف إلا بعد اكتماله.', '• راجع فلاترك — إن كانت صارمة جدًا فهي تقلّل النتائج.', '• واصل الإعجاب: كلما اكتشفت أكثر، زادت فرصك.'],
  tr: ['💜 <b>Beğeniler ve eşleşmeler</b>', '', 'Henüz eşleşme yok. İki kişi birbirini beğenince eşleşme oluşur.', '', '• Profilini tamamla: yalnızca tamamlanınca Keşfet\'te görünür.', '• Filtrelerini kontrol et — çok katıysa sonuçları daraltır.', '• Beğenmeye devam et: ne kadar keşfedersen şansın o kadar artar.'],
  sw: ['💜 <b>Kupenda na mechi</b>', '', 'Bado hakuna mechi. Mechi hutokea wakati watu wawili wanapendana.', '', '• Kamilisha wasifu wako: unaonekana kwenye Gundua tu ukikamilika.', '• Kagua vichujio vyako — vikiwa vikali sana vinapunguza matokeo.', '• Endelea kupenda: kadiri unavyogundua, ndivyo nafasi zako zinavyozidi kuwa bora.'],
  yo: ['💜 <b>Likes àti mátìsì</b>', '', 'Kò sí mátìsì báyìí. Mátìsì máa ń ṣẹlẹ̀ nígbà tí ènìyàn méjì bá fẹ́ràn ara wọn.', '', '• Parí àkọọ́lẹ̀ rẹ: ó máa ń hàn nínú Ṣàwárí nígbà tó bá pé nìkan.', '• Ṣàyẹ̀wò àwọn àyẹ̀wò rẹ — bí wọ́n bá le jù, wọ́n máa ń dín àwọn àbájáde kù.', '• Máa fẹ́ràn lọ: bí o bá ṣe ń ṣàwárí sí i, àǹfààní rẹ á sì pọ̀ sí i.'],
  hi: ['💜 <b>लाइक और मैच</b>', '', 'अभी कोई मैच नहीं। दो लोग एक-दूसरे को पसंद करें तो मैच बनता है।', '', '• प्रोफ़ाइल पूरी करें: पूरी होने पर ही यह खोजें में दिखती है।', '• फ़िल्टर जाँचें — बहुत सख्त हों तो परिणाम कम हो जाते हैं।', '• पसंद करते रहें: जितना अधिक खोजेंगे, संभावनाएँ उतनी बेहतर।'],
  id: ['💜 <b>Suka dan kecocokan</b>', '', 'Belum ada kecocokan. Kecocokan terjadi saat dua orang saling menyukai.', '', '• Lengkapi profilmu: hanya muncul di Jelajahi setelah lengkap.', '• Periksa filtermu — terlalu ketat akan mempersempit hasil.', '• Terus menyukai: makin banyak menjelajah, makin besar peluangmu.'],
  zh: ['💜 <b>喜欢与配对</b>', '', '还没有配对。两个人互相喜欢时才会配对。', '', '• 完善你的资料：完成后才会出现在「发现」中。', '• 检查你的筛选——太严格会缩小结果。', '• 继续喜欢：发现得越多，机会越大。'],
  ja: ['💜 <b>いいねとマッチ</b>', '', 'まだマッチがありません。マッチは二人がお互いをいいねしたときに成立します。', '', '• プロフィールを完成させましょう：完成後にのみ発見に表示されます。', '• フィルターを確認——厳しすぎると結果が絞られます。', '• いいねを続けましょう：発見するほどチャンスが増えます。'],
  ko: ['💜 <b>좋아요 및 매치</b>', '', '아직 매치가 없습니다. 두 사람이 서로 좋아하면 매치가 생깁니다.', '', '• 프로필을 완성하세요: 완성되어야 발견에 표시됩니다.', '• 필터를 확인하세요 — 너무 엄격하면 결과가 줄어듭니다.', '• 계속 좋아요를 누르세요: 더 많이 발견할수록 기회가 커집니다.']
};
const PRIVACY_GUIDE = {
  en: ['🔐 <b>Privacy & Account</b>', '', 'Much of this is self-service in Bezy → Profile → Safety & privacy:', '', '• Download my data', '• Pause processing (and resume it)', '• Object to processing', '• Delete my account', '', 'For legal or formal requests: contacts@digitalconcordia.com'],
  fr: ['🔐 <b>Confidentialité & compte</b>', '', 'Beaucoup de choses se font vous-même dans Bezy → Profil → Sécurité et confidentialité :', '', '• Télécharger mes données', '• Suspendre le traitement (et le reprendre)', '• S’opposer au traitement', '• Supprimer mon compte', '', 'Pour les demandes juridiques ou formelles : contacts@digitalconcordia.com'],
  de: ['🔐 <b>Datenschutz & Konto</b>', '', 'Vieles davon erledigst du selbst unter Bezy → Profil → Sicherheit & Datenschutz:', '', '• Meine Daten herunterladen', '• Verarbeitung pausieren (und fortsetzen)', '• Der Verarbeitung widersprechen', '• Konto löschen', '', 'Für rechtliche oder formelle Anfragen: contacts@digitalconcordia.com'],
  es: ['🔐 <b>Privacidad y cuenta</b>', '', 'Gran parte de esto puedes hacerlo tú mismo en Bezy → Perfil → Seguridad y privacidad:', '', '• Descargar mis datos', '• Pausar el tratamiento (y reanudarlo)', '• Oponerse al tratamiento', '• Eliminar mi cuenta', '', 'Para solicitudes legales o formales: contacts@digitalconcordia.com'],
  it: ['🔐 <b>Privacy e account</b>', '', 'Gran parte di questo puoi farlo da solo in Bezy → Profilo → Sicurezza e privacy:', '', '• Scarica i miei dati', '• Metti in pausa il trattamento (e riprendilo)', '• Opponiti al trattamento', '• Elimina il mio account', '', 'Per richieste legali o formali: contacts@digitalconcordia.com'],
  pt: ['🔐 <b>Privacidade e conta</b>', '', 'Muito disto é self-service na Bezy → Perfil → Segurança e privacidade:', '', '• Transferir os meus dados', '• Pausar o tratamento (e retomá-lo)', '• Opor-me ao tratamento', '• Eliminar a minha conta', '', 'Para pedidos legais ou formais: contacts@digitalconcordia.com'],
  ru: ['🔐 <b>Конфиденциальность и аккаунт</b>', '', 'Многое из этого ты можешь сделать сам в Bezy → Профиль → Безопасность и конфиденциальность:', '', '• Скачать мои данные', '• Приостановить обработку (и возобновить)', '• Возразить против обработки', '• Удалить мой аккаунт', '', 'Для юридических или формальных запросов: contacts@digitalconcordia.com'],
  pl: ['🔐 <b>Prywatność i konto</b>', '', 'Wiele z tego zrobisz sam w Bezy → Profil → Bezpieczeństwo i prywatność:', '', '• Pobierz moje dane', '• Wstrzymaj przetwarzanie (i wznow je)', '• Wnieś sprzeciw wobec przetwarzania', '• Usuń moje konto', '', 'W sprawie próśb prawnych lub formalnych: contacts@digitalconcordia.com'],
  ar: ['🔐 <b>الخصوصية والحساب</b>', '', 'يمكنك إنجاز الكثير من هذا بنفسك في Bezy ← الملف الشخصي ← الأمان والخصوصية:', '', '• تنزيل بياناتي', '• إيقاف المعالجة مؤقتًا (واستئنافها)', '• الاعتراض على المعالجة', '• حذف حسابي', '', 'للطلبات القانونية أو الرسمية: contacts@digitalconcordia.com'],
  tr: ['🔐 <b>Gizlilik ve hesap</b>', '', 'Bunların çoğunu Bezy → Profil → Güvenlik ve gizlilik\'ten kendin yapabilirsin:', '', '• Verilerimi indir', '• İşlemeyi duraklat (ve sürdür)', '• İşlemeye itiraz et', '• Hesabımı sil', '', 'Yasal veya resmi talepler için: contacts@digitalconcordia.com'],
  sw: ['🔐 <b>Faragha na akaunti</b>', '', 'Mengi ya haya unayaweza mwenyewe kwenye Bezy → Wasifu → Usalama na faragha:', '', '• Pakua data zangu', '• Simamisha uchakataji (na uendeleze)', '• Pinga uchakataji', '• Futa akaunti yangu', '', 'Kwa maombi ya kisheria au rasmi: contacts@digitalconcordia.com'],
  yo: ['🔐 <b>Àṣírí àti àkọọ́lẹ̀</b>', '', 'Ọ̀pọ̀ nínú èyí ni o lè ṣe fúnra rẹ nínú Bezy → Àkọọ́lẹ̀ → Ààbò àti àṣírí:', '', '• Ṣe ìsàlẹ̀ àwọn dátà mi', '• Dá ìlò dúró (kí o sì tún un bẹ̀rẹ̀)', '• Tako ìlò', '• Pa àkọọ́lẹ̀ mi rẹ́', '', 'Fún àwọn ìbéèrè lábẹ́ òfin tàbí àgbàjọ: contacts@digitalconcordia.com'],
  hi: ['🔐 <b>गोपनीयता और खाता</b>', '', 'इसमें से बहुत कुछ आप Bezy → प्रोफ़ाइल → सुरक्षा और गोपनीयता में खुद कर सकते हैं:', '', '• मेरा डेटा डाउनलोड करें', '• प्रोसेसिंग रोकें (और फिर शुरू करें)', '• प्रोसेसिंग पर आपत्ति करें', '• मेरा खाता हटाएँ', '', 'क़ानूनी या औपचारिक अनुरोधों के लिए: contacts@digitalconcordia.com'],
  id: ['🔐 <b>Privasi dan akun</b>', '', 'Banyak dari ini bisa kamu lakukan sendiri di Bezy → Profil → Keamanan dan privasi:', '', '• Unduh dataku', '• Jeda pemrosesan (dan lanjutkan)', '• Keberatan atas pemrosesan', '• Hapus akunku', '', 'Untuk permintaan hukum atau resmi: contacts@digitalconcordia.com'],
  zh: ['🔐 <b>隐私与账户</b>', '', '其中很多都可以在 Bezy → 个人资料 → 安全与隐私中自助完成：', '', '• 下载我的数据', '• 暂停处理（及恢复）', '• 反对处理', '• 删除我的账户', '', '法律或正式请求请联系：contacts@digitalconcordia.com'],
  ja: ['🔐 <b>プライバシーとアカウント</b>', '', '多くは Bezy → プロフィール → 安全とプライバシーでご自身で行えます：', '', '• データをダウンロード', '• 処理を停止（および再開）', '• 処理に異議を申し立てる', '• アカウントを削除', '', '法的または正式なリクエスト: contacts@digitalconcordia.com'],
  ko: ['🔐 <b>개인정보 및 계정</b>', '', '대부분은 Bezy → 프로필 → 안전 및 개인정보에서 직접 할 수 있습니다:', '', '• 내 데이터 다운로드', '• 처리 일시 중지(및 재개)', '• 처리 이의 제기', '• 내 계정 삭제', '', '법적 또는 공식 요청: contacts@digitalconcordia.com']
};

async function supportMatches(chatId, language, matchCount) {
  const openMatches = { text: localized(language, OPEN_MATCHES), web_app: { url: miniAppUrl('matches') } };
  const text = matchCount > 0
    ? localized(language, MATCHES_SOME).map((line) => line.replace('{count}', String(matchCount)))
    : localized(language, MATCHES_NONE);
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'likes_matches'), [openMatches]]);
}

async function supportPrivacy(chatId, language) {
  const openProfile = { text: localized(language, OPEN_PROFILE), web_app: { url: miniAppUrl('profile') } };
  const text = localized(language, PRIVACY_GUIDE);
  await sendDiagnosis(chatId, language, text, [stillNeedHelpRow(language, 'privacy_account'), [openProfile]]);
}

async function handleSupportCategory(chatId, language, from, category, storage) {
  const { query } = await import('../_db.js');
  const userResult = await query(
    `SELECT u.telegram_id, u.first_name, u.language_code, u.locale, u.age_eligibility_confirmed,
            u.profile_complete, u.discoverable, u.processing_restricted, u.processing_objection,
            p.display_name, p.age, p.gender, p.seeking, p.city, p.bio, p.interests, p.languages,
            pm.active AS premium_active, pm.plan_id AS premium_plan_id, pm.expires_at AS premium_expires_at,
            pm.revoked_at AS premium_revoked_at, pm.revocation_reason AS premium_revocation_reason,
            pr.min_age AS pref_min_age, pr.max_age AS pref_max_age, pr.city AS pref_city,
            pr.same_city_only AS pref_same_city_only, pr.languages AS pref_languages,
            us.day AS usage_day, us.discovery_actions AS usage_discovery_actions, us.super_likes AS usage_super_likes
     FROM users u
     LEFT JOIN profiles p ON p.telegram_id = u.telegram_id
     LEFT JOIN premium_memberships pm ON pm.telegram_id = u.telegram_id
     LEFT JOIN preferences pr ON pr.telegram_id = u.telegram_id
     LEFT JOIN usage us ON us.telegram_id = u.telegram_id
     WHERE u.telegram_id = $1`,
    [String(from.id)]
  );
  const r = userResult.rows[0] || {};
  const userData = r.telegram_id ? {
    telegramId: String(r.telegram_id),
    firstName: r.first_name ?? null,
    languageCode: r.language_code ?? null,
    locale: r.locale ?? null,
    ageEligibilityConfirmed: r.age_eligibility_confirmed === true,
    profileComplete: r.profile_complete === true,
    discoverable: r.discoverable === true,
    processingRestricted: r.processing_restricted === true,
    processingObjection: r.processing_objection === true,
    profile: {
      displayName: r.display_name ?? '', age: r.age ?? null, gender: r.gender ?? '', seeking: r.seeking ?? 'everyone',
      city: r.city ?? '', bio: r.bio ?? '', interests: r.interests ?? [], languages: r.languages ?? []
    },
    preferences: { minAge: r.pref_min_age ?? 18, maxAge: r.pref_max_age ?? 100, city: r.pref_city ?? '', sameCityOnly: r.pref_same_city_only === true, languages: r.pref_languages ?? [] },
    bezyPremium: {
      active: r.premium_active === true, planId: r.premium_plan_id ?? null,
      expiresAt: r.premium_expires_at ? new Date(r.premium_expires_at) : null,
      revokedAt: r.premium_revoked_at ? new Date(r.premium_revoked_at) : null,
      revocationReason: r.premium_revocation_reason ?? null
    },
    usage: { day: r.usage_day ?? null, discoveryActions: Number(r.usage_discovery_actions) || 0, superLikes: Number(r.usage_super_likes) || 0 }
  } : {};
  // The row is already in hand: the explicit Bezy choice wins over the Telegram
  // language, matching how notifications resolve the recipient's language.
  language = normalizedLanguage(userData.locale || from.language_code);
  if (category === 'contact' || category === 'problem') {
    await beginSupportIntake(chatId, language, from, category, storage);
    return;
  }
  if (category === 'premium') return supportPremium(chatId, language, userData);
  if (category === 'profile') return supportProfile(chatId, language, userData);
  if (category === 'discovery') return supportDiscovery(chatId, language, userData);
  if (category === 'likes_matches') {
    const matches = await query(
      'SELECT count(*)::int AS n FROM matches WHERE (participant_a = $1 OR participant_b = $1) AND active = TRUE',
      [String(from.id)]
    );
    return supportMatches(chatId, language, matches.rows[0].n);
  }
  if (category === 'privacy_account') return supportPrivacy(chatId, language);
}

/**
 * Intake: the user taps "still need help?" (or a no-diagnostics category). A transient
 * `pendingSupportRequest` field on their own document records the category; the next plain
 * message they send becomes the request. The field lives on the user doc, so account
 * deletion erases it with everything else.
 */
const SUPPORT_INTAKE = {
  en: ['🛟 <b>Describe your problem</b>', '', 'Just reply here with your next message: what you did, what you saw, and what you expected.'].join('\n'),
  fr: ['🛟 <b>Décrivez votre problème</b>', '', 'Répondez simplement ici avec votre prochain message : ce que vous avez fait, ce que vous avez vu, et ce qui vous attendiez.'].join('\n'),
  de: ['🛟 <b>Beschreibe dein Problem</b>', '', 'Antworte einfach hier mit deiner nächsten Nachricht: was du getan hast, was du gesehen hast und was du erwartet hast.'].join('\n'),
  es: ['🛟 <b>Describe tu problema</b>', '', 'Responde aquí con tu siguiente mensaje: qué has hecho, qué has visto y qué esperabas.'].join('\n'),
  it: ['🛟 <b>Descrivi il tuo problema</b>', '', 'Rispondi qui con il prossimo messaggio: cosa hai fatto, cosa hai visto e cosa ti aspettavi.'].join('\n'),
  pt: ['🛟 <b>Descreve o teu problema</b>', '', 'Responde aqui com a tua próxima mensagem: o que fizeste, o que viste e o que esperavas.'].join('\n'),
  ru: ['🛟 <b>Опиши свою проблему</b>', '', 'Просто ответь здесь следующим сообщением: что ты делал, что видел и чего ожидал.'].join('\n'),
  pl: ['🛟 <b>Opisz swój problem</b>', '', 'Po prostu odpowiedz tutaj następną wiadomością: co zrobiłeś, co widziałeś i czego się spodziewałeś.'].join('\n'),
  ar: ['🛟 <b>صِف مشكلتك</b>', '', 'أجب هنا برسالتك التالية: ماذا فعلت، وماذا رأيت، وماذا كنت تتوقع.'].join('\n'),
  tr: ['🛟 <b>Sorununu açıkla</b>', '', 'Bir sonraki mesajınla buraya yanıt ver: ne yaptın, ne gördün ve ne bekliyordun.'].join('\n'),
  sw: ['🛟 <b>Eleza tatizo lako</b>', '', 'Jibu hapa kwa ujumbe wako unaofuata: ulifanya nini, uliona nini, na ulitarajia nini.'].join('\n'),
  yo: ['🛟 <b>Ṣàlàyé ìṣòro rẹ</b>', '', 'Kàn dáhùn níbí pẹ̀lú ìfiránṣẹ́ rẹ tó kàn: kí ni o ṣe, kí ni o rí, àti kí ni o retí.'].join('\n'),
  hi: ['🛟 <b>अपनी समस्या बताएँ</b>', '', 'बस अपने अगले संदेश से यहाँ जवाब दें: आपने क्या किया, क्या देखा और क्या उम्मीद की थी।'].join('\n'),
  id: ['🛟 <b>Jelaskan masalahmu</b>', '', 'Balas saja di sini dengan pesan berikutnya: apa yang kamu lakukan, apa yang kamu lihat, dan apa yang kamu harapkan.'].join('\n'),
  zh: ['🛟 <b>描述你的问题</b>', '', '直接用下一条消息在这里回复：你做了什么、看到了什么、预期是什么。'].join('\n'),
  ja: ['🛟 <b>問題を説明してください</b>', '', '次のメッセージでここに返信してください：何をしたか、何を見たか、何を期待していたか。'].join('\n'),
  ko: ['🛟 <b>문제를 설명하세요</b>', '', '다음 메시지로 여기에 답장하세요: 무엇을 했는지, 무엇을 봤는지, 무엇을 기대했는지.'].join('\n')
};
const SUPPORT_RATE_LIMITED = {
  en: 'You have sent too many requests. Please try again in a moment.',
  fr: 'Vous avez envoyé trop de demandes. Réessayez dans un moment.',
  de: 'Du hast zu viele Anfragen gesendet. Versuche es gleich noch einmal.',
  es: 'Has enviado demasiadas solicitudes. Vuelve a intentarlo en un momento.',
  it: 'Hai inviato troppe richieste. Riprova tra un momento.',
  pt: 'Enviaste demasiados pedidos. Tenta novamente daqui a pouco.',
  ru: 'Ты отправил слишком много запросов. Попробуй ещё раз через мгновение.',
  pl: 'Wysłałeś zbyt wiele próśb. Spróbuj ponownie za chwilę.',
  ar: 'أرسلت طلبات كثيرة جدًا. حاول مرة أخرى بعد لحظات.',
  tr: 'Çok fazla istek gönderdin. Birazdan tekrar dene.',
  sw: 'Umetuma maombi mengi sana. Jaribu tena baada ya muda mfupi.',
  yo: 'O fi ọ̀pọ̀ ìbéèrè ránṣẹ́ jù. Gbìyànjú lẹ́ẹ̀kan sí i láìpẹ́.',
  hi: 'आपने बहुत अधिक अनुरोध भेजे हैं। थोड़ी देर बाद फिर कोशिश करें।',
  id: 'Kamu mengirim terlalu banyak permintaan. Coba lagi sebentar lagi.',
  zh: '你发送的请求太多了。请稍后再试。',
  ja: 'リクエストが多すぎます。しばらくしてからもう一度お試しください。',
  ko: '요청을 너무 많이 보냈습니다. 잠시 후 다시 시도하세요.'
};
const SUPPORT_CONFIRMATION = {
  en: (ref) => `Your support request has been received.\nReference: ${ref}.\nWe'll review it and get back to you here. For legal or formal matters: contacts@digitalconcordia.com`,
  fr: (ref) => `Votre demande d’assistance a bien été reçue.\nRéférence : ${ref}.\nNous allons l’examiner et vous répondre ici. Pour les questions juridiques ou formelles : contacts@digitalconcordia.com`,
  de: (ref) => `Deine Support-Anfrage ist eingegangen.\nReferenz: ${ref}.\nWir prüfen sie und melden uns hier bei dir. Für rechtliche oder formelle Anliegen: contacts@digitalconcordia.com`,
  es: (ref) => `Hemos recibido tu solicitud de soporte.\nReferencia: ${ref}.\nLa revisaremos y te responderemos aquí. Para asuntos legales o formales: contacts@digitalconcordia.com`,
  it: (ref) => `La tua richiesta di supporto è stata ricevuta.\nRiferimento: ${ref}.\nLa esamineremo e ti risponderemo qui. Per questioni legali o formali: contacts@digitalconcordia.com`,
  pt: (ref) => `O teu pedido de apoio foi recebido.\nReferência: ${ref}.\nVamos analisá-lo e responder-te aqui. Para assuntos legais ou formais: contacts@digitalconcordia.com`,
  ru: (ref) => `Твоё обращение в поддержку получено.\nНомер: ${ref}.\nМы рассмотрим его и ответим здесь. По юридическим или формальным вопросам: contacts@digitalconcordia.com`,
  pl: (ref) => `Twoje zgłoszenie do wsparcia zostało przyjęte.\nNumer: ${ref}.\nRozpatrzymy je i odpowiemy tutaj. W sprawach prawnych lub formalnych: contacts@digitalconcordia.com`,
  ar: (ref) => `تم استلام طلب الدعم الخاص بك.\nالمرجع: ${ref}.\nسنراجعه ونرد عليك هنا. للشؤون القانونية أو الرسمية: contacts@digitalconcordia.com`,
  tr: (ref) => `Destek talebin alındı.\nReferans: ${ref}.\nİnceleyip sana buradan döneceğiz. Yasal veya resmi konular için: contacts@digitalconcordia.com`,
  sw: (ref) => `Ombi lako la usaidizi limepokelewa.\nKumbukumbu: ${ref}.\nTutalikagua na kukujibu hapa. Kwa masuala ya kisheria au rasmi: contacts@digitalconcordia.com`,
  yo: (ref) => `A ti gba ìbéèrè àtìlẹ́yìn rẹ.\nÌtọ́kasí: ${ref}.\nA ó ṣàyẹ̀wò rẹ̀, a ó sì dá ọ lóhùn níbí. Fún àwọn ọ̀ràn lábẹ́ òfin tàbí àgbàjọ: contacts@digitalconcordia.com`,
  hi: (ref) => `आपका सहायता अनुरोध मिल गया।\nसंदर्भ: ${ref}।\nहम इसकी समीक्षा करके यहीं जवाब देंगे। क़ानूनी या औपचारिक मामलों के लिए: contacts@digitalconcordia.com`,
  id: (ref) => `Permintaan dukunganmu telah diterima.\nReferensi: ${ref}.\nKami akan meninjaunya dan membalas di sini. Untuk urusan hukum atau resmi: contacts@digitalconcordia.com`,
  zh: (ref) => `你的支持请求已收到。\n编号：${ref}。\n我们会审核并在此回复你。法律或正式事务请联系：contacts@digitalconcordia.com`,
  ja: (ref) => `サポートリクエストを受け付けました。\n参照番号: ${ref}。\n確認してここで返信します。法的または正式な件は: contacts@digitalconcordia.com`,
  ko: (ref) => `지원 요청이 접수되었습니다.\n참조 번호: ${ref}.\n검토 후 여기에서 답변드리겠습니다. 법적 또는 공식 사안: contacts@digitalconcordia.com`
};

async function beginSupportIntake(chatId, language, from, category, storage) {
  const { query } = await import('../_db.js');
  await query(
    'INSERT INTO users (telegram_id, pending_support_category, pending_support_at, created_at, updated_at) VALUES ($1, $2, now(), now(), now()) ON CONFLICT (telegram_id) DO UPDATE SET pending_support_category = EXCLUDED.pending_support_category, pending_support_at = EXCLUDED.pending_support_at, updated_at = now()',
    [String(from.id), category]
  );
  const text = localized(language, SUPPORT_INTAKE);
  await telegramApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

async function handleSupportText(chatId, language, from, storage, messageText) {
  const { query } = await import('../_db.js');
  const userId = String(from.id);
  const userResult = await query(
    'SELECT pending_support_category, locale, language_code FROM users WHERE telegram_id = $1',
    [userId]
  );
  const row = userResult.rows[0] || {};
  const pending = row.pending_support_category;
  if (!pending || !SUPPORT_CATEGORIES.includes(pending)) return false;
  // The row is already in hand: the explicit Bezy choice wins over the Telegram
  // language, matching how notifications resolve the recipient's language.
  language = normalizedLanguage(row.locale || from.language_code);

  // Support spam protection: the same bucket as the Mini App, so neither channel can flood
  // the queue. Fails open like every rate limit.
  try {
    await enforceRateLimit(storage, userId, 'support_create');
  } catch (error) {
    if (error.rateLimited) {
      const text = localized(language, SUPPORT_RATE_LIMITED);
      await telegramApi('sendMessage', { chat_id: chatId, text });
      return true;
    }
    throw error;
  }

  const reference = await createSupportRequest(storage, {
    telegramUserId: userId,
    category: pending,
    details: String(messageText || ''),
    // The resolved Bezy locale (explicit choice > Telegram language) is what the operator
    // queue should record — the same language the user actually reads.
    languageCode: language
  });
  await query(
    'UPDATE users SET pending_support_category = NULL, pending_support_at = NULL, updated_at = now() WHERE telegram_id = $1',
    [userId]
  );
  const text = localized(language, SUPPORT_CONFIRMATION)(reference);
  await telegramApi('sendMessage', { chat_id: chatId, text });
  return true;
}

const WELCOME = {
  en: '💜 Welcome to Bezy.\n\nReal people, mutual interest — and your conversations happen right here in Bezy.',
  fr: '💜 Bienvenue sur Bezy.\n\nDe vraies personnes, un intérêt réciproque — et vos conversations ont lieu ici, dans Bezy.',
  de: '💜 Willkommen bei Bezy.\n\nEchte Menschen, gegenseitiges Interesse — und eure Unterhaltungen finden direkt hier in Bezy statt.',
  es: '💜 Te damos la bienvenida a Bezy.\n\nPersonas reales, interés mutuo — y tus conversaciones tienen lugar aquí, en Bezy.',
  it: '💜 Benvenuto su Bezy.\n\nPersone vere, interesse reciproco — e le vostre conversazioni avvengono proprio qui, su Bezy.',
  pt: '💜 Bem-vindo à Bezy.\n\nPessoas reais, interesse mútuo — e as tuas conversas acontecem mesmo aqui, na Bezy.',
  ru: '💜 Добро пожаловать в Bezy.\n\nНастоящие люди, взаимный интерес — и ваши разговоры происходят прямо здесь, в Bezy.',
  pl: '💜 Witaj w Bezy.\n\nPrawdziwi ludzie, wzajemne zainteresowanie — a rozmowy toczą się właśnie tutaj, w Bezy.',
  ar: '💜 مرحبًا بك في Bezy.\n\nأشخاص حقيقيون واهتمام متبادل — ومحادثاتك تحدث هنا مباشرة، في Bezy.',
  tr: '💜 Bezy\'ye hoş geldin.\n\nGerçek insanlar, karşılıklı ilgi — ve sohbetlerin tam burada, Bezy\'de gerçekleşir.',
  sw: '💜 Karibu Bezy.\n\nWatu halisi, maslahi ya pande mbili — na mazungumzo yako hufanyika hapa hapa, kwenye Bezy.',
  yo: '💜 Káàbọ̀ sí Bezy.\n\nÀwọn ènìyàn gidi, ìfẹ́ àjùmọ̀ṣe — àwọn ìbánisọ̀rọ̀ rẹ sì máa ń ṣẹlẹ̀ níbí gan-an, nínú Bezy.',
  hi: '💜 Bezy में आपका स्वागत है।\n\nअसली लोग, आपसी दिलचस्पी — और आपकी बातचीत यहीं Bezy में होती है।',
  id: '💜 Selamat datang di Bezy.\n\nOrang nyata, minat yang saling terbalas — dan percakapanmu terjadi di sini, di dalam Bezy.',
  zh: '💜 欢迎来到 Bezy。\n\n真实的人，共同的兴趣——对话就在 Bezy 里进行。',
  ja: '💜 Bezy へようこそ。\n\n本当の人々、お互いの関心——会話はここ Bezy の中で行われます。',
  ko: '💜 Bezy에 오신 것을 환영합니다.\n\n진짜 사람들, 서로의 관심 — 대화는 바로 여기 Bezy에서 이루어집니다.'
};
const PREMIUM_COMMAND = {
  en: ['💎 <b>Bezy Premium</b>', '', 'Unlock more ways to discover meaningful connections.', '', '✓ See who liked you', '✓ Advanced discovery', '✓ More Super Likes', '✓ Increased visibility', '✓ Unlimited discovery', '',
     'Payment is made with Telegram Stars ⭐. You need Stars in your balance (Settings → My Stars).', '',
     '⚠️ Telegram Premium is a separate Telegram subscription and does not include Bezy Premium.', '', 'Open Bezy Premium to choose your plan.'].join('\n'),
  fr: ['💎 <b>Bezy Premium</b>', '', 'Débloquez davantage de façons de faire de belles rencontres.', '', '✓ Voir qui vous a liké', '✓ Découverte avancée', '✓ Plus de Super Likes', '✓ Visibilité accrue', '✓ Découverte illimitée', '',
     'Le paiement se fait avec les Telegram Stars ⭐. Vous devez disposer de Stars sur votre solde (Réglages → Mes Stars).', '',
     '⚠️ Telegram Premium est un abonnement Telegram distinct et n’inclut pas Bezy Premium.', '', 'Ouvrez Bezy Premium pour choisir votre formule.'].join('\n'),
  de: ['💎 <b>Bezy Premium</b>', '', 'Schalte weitere Wege frei, um besondere Verbindungen zu finden.', '', '✓ Sieh, wer dich geliked hat', '✓ Erweiterte Suche', '✓ Mehr Super Likes', '✓ Mehr Sichtbarkeit', '✓ Unbegrenztes Entdecken', '',
     'Bezahlt wird mit Telegram Stars ⭐. Du brauchst Stars auf deinem Guthaben (Einstellungen → Meine Stars).', '',
     '⚠️ Telegram Premium ist ein separates Telegram-Abo und enthält kein Bezy Premium.', '', 'Öffne Bezy Premium, um deinen Plan zu wählen.'].join('\n'),
  es: ['💎 <b>Bezy Premium</b>', '', 'Desbloquea más formas de encontrar conexiones especiales.', '', '✓ Ve quién te ha dado like', '✓ Descubrimiento avanzado', '✓ Más Super Likes', '✓ Más visibilidad', '✓ Descubrimiento ilimitado', '',
     'El pago se realiza con Telegram Stars ⭐. Necesitas Stars en tu saldo (Ajustes → Mis Stars).', '',
     '⚠️ Telegram Premium es una suscripción aparte de Telegram y no incluye Bezy Premium.', '', 'Abre Bezy Premium para elegir tu plan.'].join('\n'),
  it: ['💎 <b>Bezy Premium</b>', '', 'Sblocca altri modi per trovare connessioni speciali.', '', '✓ Vedi chi ti ha messo like', '✓ Scoperta avanzata', '✓ Più Super Like', '✓ Maggiore visibilità', '✓ Scoperta illimitata', '',
     'Il pagamento avviene con le Telegram Stars ⭐. Ti servono Stars nel tuo saldo (Impostazioni → Le mie Stars).', '',
     '⚠️ Telegram Premium è un abbonamento Telegram separato e non include Bezy Premium.', '', 'Apri Bezy Premium per scegliere il tuo piano.'].join('\n'),
  pt: ['💎 <b>Bezy Premium</b>', '', 'Desbloqueia mais formas de descobrir ligações especiais.', '', '✓ Vê quem gostou de ti', '✓ Descoberta avançada', '✓ Mais Super Likes', '✓ Maior visibilidade', '✓ Descoberta ilimitada', '',
     'O pagamento é feito com Telegram Stars ⭐. Precisas de Stars no teu saldo (Definições → As Minhas Stars).', '',
     '⚠️ O Telegram Premium é uma subscrição separada e não inclui o Bezy Premium.', '', 'Abre o Bezy Premium para escolheres o teu plano.'].join('\n'),
  ru: ['💎 <b>Bezy Premium</b>', '', 'Открой больше способов находить особенные связи.', '', '✓ Смотри, кто тебя лайкнул', '✓ Расширенные знакомства', '✓ Больше Супер Лайков', '✓ Больше заметности', '✓ Безлимитные знакомства', '',
     'Оплата — в Telegram Stars ⭐. Нужны Stars на балансе (Настройки → Мои Stars).', '',
     '⚠️ Telegram Premium — отдельная подписка Telegram и не включает Bezy Premium.', '', 'Открой Bezy Premium, чтобы выбрать план.'].join('\n'),
  pl: ['💎 <b>Bezy Premium</b>', '', 'Odblokuj więcej sposobów na znajdowanie wyjątkowych więzi.', '', '✓ Zobacz, kto cię polubił', '✓ Zaawansowane odkrywanie', '✓ Więcej Super Polubień', '✓ Większa widoczność', '✓ Nieograniczone odkrywanie', '',
     'Płatność w Telegram Stars ⭐. Potrzebujesz Stars na saldzie (Ustawienia → Moje Stars).', '',
     '⚠️ Telegram Premium to osobna subskrypcja Telegrama i nie obejmuje Bezy Premium.', '', 'Otwórz Bezy Premium, aby wybrać plan.'].join('\n'),
  ar: ['💎 <b>Bezy Premium</b>', '', 'افتح طرقًا أكثر للعثور على تواصل مميز.', '', '✓ اعرف من أعجب بك', '✓ اكتشاف متقدم', '✓ إعجابات سوبر أكثر', '✓ ظهور أكبر', '✓ اكتشاف غير محدود', '',
     'الدفع عبر Telegram Stars ⭐. تحتاج إلى Stars في رصيدك (الإعدادات ← My Stars).', '',
     '⚠️ Telegram Premium اشتراك منفصل ولا يشمل Bezy Premium.', '', 'افتح Bezy Premium لاختيار باقتك.'].join('\n'),
  tr: ['💎 <b>Bezy Premium</b>', '', 'Özel bağlantılar bulmanın daha fazla yolunu aç.', '', '✓ Seni kimin beğendiğini gör', '✓ Gelişmiş keşif', '✓ Daha fazla Süper Beğeni', '✓ Daha fazla görünürlük', '✓ Sınırsız keşif', '',
     'Ödeme Telegram Stars ⭐ ile yapılır. Bakiyende Stars olması gerekir (Ayarlar → Yıldızlarım).', '',
     '⚠️ Telegram Premium ayrı bir Telegram aboneliğidir ve Bezy Premium\'u içermez.', '', 'Planını seçmek için Bezy Premium\'u aç.'].join('\n'),
  sw: ['💎 <b>Bezy Premium</b>', '', 'Fungua njia zaidi za kupata miunganisho ya pekee.', '', '✓ Ona nani alikupenda', '✓ Ugunduzi wa hali ya juu', '✓ Super Like zaidi', '✓ Kuonekana zaidi', '✓ Ugunduzi usio na kikomo', '',
     'Malipo hufanyika kwa Telegram Stars ⭐. Unahitaji Stars kwenye salio lako (Mipangilio → My Stars).', '',
     '⚠️ Telegram Premium ni usajili tofauti wa Telegram na haujumuishi Bezy Premium.', '', 'Fungua Bezy Premium ili kuchagua mpango wako.'].join('\n'),
  yo: ['💎 <b>Bezy Premium</b>', '', 'Ṣí àwọn ọ̀nà sí i láti rí ìsopọ̀ pàtàkì.', '', '✓ Wo ẹni tó fẹ́ràn rẹ', '✓ Ìṣàwárí onípele', '✓ Súpà Like púpọ̀ sí i', '✓ Ìhàn púpọ̀ sí i', '✓ Ìṣàwárí àìlópin', '',
     'Ìsanwó jẹ́ pẹ̀lú Telegram Stars ⭐. O nílò Stars lórí ìwọ̀n owó rẹ (Ìtòlẹ́sẹẹsẹ → My Stars).', '',
     '⚠️ Telegram Premium jẹ́ ìsọdìí Telegram tó yàtọ̀, kò sì ní Bezy Premium nínú.', '', 'Ṣí Bezy Premium láti yan ètò rẹ.'].join('\n'),
  hi: ['💎 <b>Bezy Premium</b>', '', 'ख़ास जुड़ाव पाने के और तरीके अनलॉक करें।', '', '✓ देखें किसने आपको पसंद किया', '✓ उन्नत खोज', '✓ अधिक सुपर लाइक', '✓ अधिक दृश्यता', '✓ असीमित खोज', '',
     'भुगतान Telegram Stars ⭐ से होता है। बैलेंस में Stars चाहिए (सेटिंग्स → My Stars)।', '',
     '⚠️ Telegram Premium एक अलग Telegram सदस्यता है और इसमें Bezy Premium शामिल नहीं है।', '', 'प्लान चुनने के लिए Bezy Premium खोलें।'].join('\n'),
  id: ['💎 <b>Bezy Premium</b>', '', 'Buka lebih banyak cara untuk menemukan koneksi istimewa.', '', '✓ Lihat siapa yang menyukaimu', '✓ Penjelajahan lanjutan', '✓ Lebih banyak Super Like', '✓ Visibilitas lebih tinggi', '✓ Penjelajahan tanpa batas', '',
     'Pembayaran memakai Telegram Stars ⭐. Kamu butuh Stars di saldo (Pengaturan → My Stars).', '',
     '⚠️ Telegram Premium adalah langganan Telegram terpisah dan tidak termasuk Bezy Premium.', '', 'Buka Bezy Premium untuk memilih paketmu.'].join('\n'),
  zh: ['💎 <b>Bezy Premium</b>', '', '解锁更多寻找特别连接的方式。', '', '✓ 看看谁喜欢了你', '✓ 高级发现', '✓ 更多超级喜欢', '✓ 更高曝光', '✓ 无限发现', '',
     '付款使用 Telegram Stars ⭐。余额中需要有 Stars（设置 → 我的 Stars）。', '',
     '⚠️ Telegram Premium 是独立的 Telegram 订阅，不包含 Bezy Premium。', '', '打开 Bezy Premium 选择你的方案。'].join('\n'),
  ja: ['💎 <b>Bezy Premium</b>', '', '特別なつながりを見つける方法をもっと解除しよう。', '', '✓ あなたをいいねした人を見る', '✓ 高度な発見', '✓ もっと多くのスーパーいいね', '✓ より高い露出', '✓ 無制限の発見', '',
     '支払いは Telegram Stars ⭐。残高に Stars が必要です（設定 → マイスターズ）。', '',
     '⚠️ Telegram Premium は別の Telegram サブスクリプションで、Bezy Premium は含まれません。', '', 'Bezy Premium を開いてプランを選びましょう。'].join('\n'),
  ko: ['💎 <b>Bezy Premium</b>', '', '특별한 연결을 찾는 더 많은 방법을 열어보세요.', '', '✓ 나를 좋아한 사람 보기', '✓ 고급 발견', '✓ 더 많은 슈퍼 좋아요', '✓ 더 높은 노출', '✓ 무제한 발견', '',
     '결제는 Telegram Stars ⭐로 이루어집니다. 잔액에 Stars가 필요합니다(설정 → 내 Stars).', '',
     '⚠️ Telegram Premium은 별도의 Telegram 구독이며 Bezy Premium은 포함되지 않습니다.', '', 'Bezy Premium을 열어 플랜을 선택하세요.'].join('\n')
};

async function sendCommand(chatId, command, language) {
  if (command === 'help' || command === 'aide' || command === 'hilfe' || command === 'ayuda' || command === 'aiuto') {
    await telegramApi('sendMessage', { chat_id: chatId, text: helpText(language), parse_mode: 'HTML', reply_markup: { inline_keyboard: [[uiButton(language, null)]] } });
    return;
  }
  if (command === 'premium') {
    const text = localized(language, PREMIUM_COMMAND);
    const label = localized(language, VIEW_PREMIUM);
    await telegramApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: miniAppUrl('premium') } }]] } });
    return;
  }
  const view = COMMAND_VIEWS[command] ?? null;
  // The /start moment is the promise: what Bezy is, and that the conversation happens
  // right here in Bezy — one message, no onboarding wall.
  const text = localized(language, WELCOME);
  await telegramApi('sendMessage', { chat_id: chatId, text, reply_markup: { inline_keyboard: [[uiButton(language, view)]] } });
}

// ---------------------------------------------------------------------------
// Telegram Stars payments
//
// Premium is granted by exactly one event: a validated `successful_payment`. Creating an
// invoice, opening the Telegram payment sheet, or passing pre-checkout grants nothing.
// ---------------------------------------------------------------------------

// Telegram requires an answer within 10 seconds. Every field is re-derived from server
// state: the plan, the price and the buyer all come from PostgreSQL, never from the update.
// Telegram shows error_message directly to the buyer, so it follows their language.
const CHECKOUT_ERRORS = {
  en: {
    invalid: 'This payment link is not valid. Please reopen Bezy Premium and try again.',
    plan: 'That Premium plan is no longer available.',
    account: 'This payment link belongs to a different Telegram account.',
    currency: 'Bezy Premium can only be purchased with Telegram Stars.',
    price: 'The price has changed. Please reopen Bezy Premium and try again.',
    expired: 'This payment link has expired. Please reopen Bezy Premium.',
    unverified: 'This payment could not be verified. Please reopen Bezy Premium.'
  },
  fr: {
    invalid: 'Ce lien de paiement n’est pas valide. Rouvrez Bezy Premium et réessayez.',
    plan: 'Cette formule Premium n’est plus disponible.',
    account: 'Ce lien de paiement appartient à un autre compte Telegram.',
    currency: 'Bezy Premium ne peut être acheté qu’avec les Telegram Stars.',
    price: 'Le prix a changé. Rouvrez Bezy Premium et réessayez.',
    expired: 'Ce lien de paiement a expiré. Rouvrez Bezy Premium.',
    unverified: 'Ce paiement n’a pas pu être vérifié. Rouvrez Bezy Premium.'
  },
  de: {
    invalid: 'Dieser Zahlungslink ist nicht gültig. Bitte öffne Bezy Premium erneut und versuche es noch einmal.',
    plan: 'Dieser Premium-Plan ist nicht mehr verfügbar.',
    account: 'Dieser Zahlungslink gehört zu einem anderen Telegram-Konto.',
    currency: 'Bezy Premium kann nur mit Telegram Stars gekauft werden.',
    price: 'Der Preis hat sich geändert. Bitte öffne Bezy Premium erneut und versuche es noch einmal.',
    expired: 'Dieser Zahlungslink ist abgelaufen. Bitte öffne Bezy Premium erneut.',
    unverified: 'Diese Zahlung konnte nicht bestätigt werden. Bitte öffne Bezy Premium erneut.'
  },
  es: {
    invalid: 'Este enlace de pago no es válido. Vuelve a abrir Bezy Premium e inténtalo de nuevo.',
    plan: 'Ese plan Premium ya no está disponible.',
    account: 'Este enlace de pago pertenece a otra cuenta de Telegram.',
    currency: 'Bezy Premium solo se puede comprar con Telegram Stars.',
    price: 'El precio ha cambiado. Vuelve a abrir Bezy Premium e inténtalo de nuevo.',
    expired: 'Este enlace de pago ha caducado. Vuelve a abrir Bezy Premium.',
    unverified: 'No se pudo verificar este pago. Vuelve a abrir Bezy Premium.'
  },
  it: {
    invalid: 'Questo link di pagamento non è valido. Riapri Bezy Premium e riprova.',
    plan: 'Questo piano Premium non è più disponibile.',
    account: 'Questo link di pagamento appartiene a un altro account Telegram.',
    currency: 'Bezy Premium può essere acquistato solo con le Telegram Stars.',
    price: 'Il prezzo è cambiato. Riapri Bezy Premium e riprova.',
    expired: 'Questo link di pagamento è scaduto. Riapri Bezy Premium.',
    unverified: 'Non è stato possibile verificare questo pagamento. Riapri Bezy Premium.'
  },
  pt: {
    invalid: 'Este link de pagamento não é válido. Volta a abrir o Bezy Premium e tenta novamente.',
    plan: 'Esse plano Premium já não está disponível.',
    account: 'Este link de pagamento pertence a outra conta do Telegram.',
    currency: 'O Bezy Premium só pode ser comprado com Telegram Stars.',
    price: 'O preço mudou. Volta a abrir o Bezy Premium e tenta novamente.',
    expired: 'Este link de pagamento expirou. Volta a abrir o Bezy Premium.',
    unverified: 'Não foi possível verificar este pagamento. Volta a abrir o Bezy Premium.'
  },
  ru: {
    invalid: 'Эта платёжная ссылка недействительна. Открой Bezy Premium заново и попробуй ещё раз.',
    plan: 'Этот план Premium больше недоступен.',
    account: 'Эта платёжная ссылка принадлежит другому аккаунту Telegram.',
    currency: 'Bezy Premium можно купить только за Telegram Stars.',
    price: 'Цена изменилась. Открой Bezy Premium заново и попробуй ещё раз.',
    expired: 'Срок действия этой платёжной ссылки истёк. Открой Bezy Premium заново.',
    unverified: 'Не удалось подтвердить этот платёж. Открой Bezy Premium заново.'
  },
  pl: {
    invalid: 'Ten link płatności jest nieprawidłowy. Otwórz Bezy Premium ponownie i spróbuj jeszcze raz.',
    plan: 'Ten plan Premium nie jest już dostępny.',
    account: 'Ten link płatności należy do innego konta Telegram.',
    currency: 'Bezy Premium można kupić wyłącznie za Telegram Stars.',
    price: 'Cena się zmieniła. Otwórz Bezy Premium ponownie i spróbuj jeszcze raz.',
    expired: 'Ten link płatności wygasł. Otwórz Bezy Premium ponownie.',
    unverified: 'Nie udało się zweryfikować tej płatności. Otwórz Bezy Premium ponownie.'
  },
  ar: {
    invalid: 'رابط الدفع هذا غير صالح. أعد فتح Bezy Premium وحاول مجددًا.',
    plan: 'خطة Premium هذه لم تعد متاحة.',
    account: 'رابط الدفع هذا يخص حساب تيليجرام آخر.',
    currency: 'لا يمكن شراء Bezy Premium إلا عبر Telegram Stars.',
    price: 'تغيّر السعر. أعد فتح Bezy Premium وحاول مجددًا.',
    expired: 'انتهت صلاحية رابط الدفع هذا. أعد فتح Bezy Premium.',
    unverified: 'تعذر التحقق من هذا الدفع. أعد فتح Bezy Premium.'
  },
  tr: {
    invalid: 'Bu ödeme bağlantısı geçerli değil. Bezy Premium\'u yeniden aç ve tekrar dene.',
    plan: 'Bu Premium planı artık mevcut değil.',
    account: 'Bu ödeme bağlantısı başka bir Telegram hesabına ait.',
    currency: 'Bezy Premium yalnızca Telegram Stars ile satın alınabilir.',
    price: 'Fiyat değişti. Bezy Premium\'u yeniden aç ve tekrar dene.',
    expired: 'Bu ödeme bağlantısının süresi doldu. Bezy Premium\'u yeniden aç.',
    unverified: 'Bu ödeme doğrulanamadı. Bezy Premium\'u yeniden aç.'
  },
  sw: {
    invalid: 'Kiungo hiki cha malipo si sahihi. Fungua Bezy Premium tena na ujaribu tena.',
    plan: 'Mpango huo wa Premium haupatikani tena.',
    account: 'Kiungo hiki cha malipo ni cha akaunti nyingine ya Telegram.',
    currency: 'Bezy Premium inaweza kununuliwa kwa Telegram Stars pekee.',
    price: 'Bei imebadilika. Fungua Bezy Premium tena na ujaribu tena.',
    expired: 'Kiungo hiki cha malipo kimeisha muda. Fungua Bezy Premium tena.',
    unverified: 'Malipo haya hayakuweza kuthibitishwa. Fungua Bezy Premium tena.'
  },
  yo: {
    invalid: 'Ìjápọ̀ ìsanwó yìí kò wúlò. Ṣí Bezy Premium lẹ́ẹ̀kan sí i kí o sì gbìyànjú lẹ́ẹ̀kan sí i.',
    plan: 'Ètò Premium yẹn kò sí mọ́.',
    account: 'Ìjápọ̀ ìsanwó yìí jẹ́ ti àkọọ́lẹ̀ Telegram mìíràn.',
    currency: 'A lè ra Bezy Premium pẹ̀lú Telegram Stars nìkan.',
    price: 'Iye ti yí padà. Ṣí Bezy Premium lẹ́ẹ̀kan sí i kí o sì gbìyànjú lẹ́ẹ̀kan sí i.',
    expired: 'Ìjápọ̀ ìsanwó yìí ti dópin. Ṣí Bezy Premium lẹ́ẹ̀kan sí i.',
    unverified: 'A kò lè fìdí ìsanwó yìí múlẹ̀. Ṣí Bezy Premium lẹ́ẹ̀kan sí i.'
  },
  hi: {
    invalid: 'यह भुगतान लिंक मान्य नहीं है। Bezy Premium फिर से खोलें और दोबारा कोशिश करें।',
    plan: 'वह Premium प्लान अब उपलब्ध नहीं है।',
    account: 'यह भुगतान लिंक किसी और Telegram खाते का है।',
    currency: 'Bezy Premium केवल Telegram Stars से खरीदा जा सकता है।',
    price: 'कीमत बदल गई है। Bezy Premium फिर से खोलें और दोबारा कोशिश करें।',
    expired: 'यह भुगतान लिंक समाप्त हो गया है। Bezy Premium फिर से खोलें।',
    unverified: 'यह भुगतान सत्यापित नहीं हो सका। Bezy Premium फिर से खोलें।'
  },
  id: {
    invalid: 'Tautan pembayaran ini tidak valid. Buka Bezy Premium lagi dan coba kembali.',
    plan: 'Paket Premium itu tidak tersedia lagi.',
    account: 'Tautan pembayaran ini milik akun Telegram lain.',
    currency: 'Bezy Premium hanya bisa dibeli dengan Telegram Stars.',
    price: 'Harganya berubah. Buka Bezy Premium lagi dan coba kembali.',
    expired: 'Tautan pembayaran ini kedaluwarsa. Buka Bezy Premium lagi.',
    unverified: 'Pembayaran ini tidak bisa diverifikasi. Buka Bezy Premium lagi.'
  },
  zh: {
    invalid: '此支付链接无效。请重新打开 Bezy Premium 再试一次。',
    plan: '该 Premium 方案已不再提供。',
    account: '此支付链接属于另一个 Telegram 账户。',
    currency: 'Bezy Premium 只能用 Telegram Stars 购买。',
    price: '价格已变更。请重新打开 Bezy Premium 再试一次。',
    expired: '此支付链接已过期。请重新打开 Bezy Premium。',
    unverified: '无法验证此付款。请重新打开 Bezy Premium。'
  },
  ja: {
    invalid: 'この支払いリンクは無効です。Bezy Premium を開き直してもう一度お試しください。',
    plan: 'その Premium プランは利用できなくなりました。',
    account: 'この支払いリンクは別の Telegram アカウントのものです。',
    currency: 'Bezy Premium は Telegram Stars でのみ購入できます。',
    price: '価格が変更されました。Bezy Premium を開き直してもう一度お試しください。',
    expired: 'この支払いリンクは期限切れです。Bezy Premium を開き直してください。',
    unverified: 'この支払いを確認できませんでした。Bezy Premium を開き直してください。'
  },
  ko: {
    invalid: '이 결제 링크는 유효하지 않습니다. Bezy Premium을 다시 열고 다시 시도하세요.',
    plan: '해당 Premium 플랜은 더 이상 제공되지 않습니다.',
    account: '이 결제 링크는 다른 Telegram 계정의 것입니다.',
    currency: 'Bezy Premium은 Telegram Stars로만 구매할 수 있습니다.',
    price: '가격이 변경되었습니다. Bezy Premium을 다시 열고 다시 시도하세요.',
    expired: '이 결제 링크는 만료되었습니다. Bezy Premium을 다시 여세요.',
    unverified: '이 결제를 확인할 수 없었습니다. Bezy Premium을 다시 여세요.'
  }
};

// Payment logging is deliberately narrow: enough to diagnose a failed checkout from the
// Vercel logs, with no bot token, no database credentials, no initData and no profile content.
function logPayment(event, fields) {
  console.log(`[bezy-payment] ${event} ${JSON.stringify(fields)}`);
}

async function handlePreCheckout(query) {
  const parsed = parseInvoicePayload(query.invoice_payload);
  const messages = CHECKOUT_ERRORS[normalizedLanguage(query.from?.language_code)] || CHECKOUT_ERRORS.en;
  const plan = parsed && premiumPlan(parsed.planId);
  const context = {
    telegramUserId: String(query.from?.id || ''),
    planId: parsed?.planId || null,
    expectedStars: plan?.stars ?? null,
    receivedAmount: Number(query.total_amount),
    currency: query.currency
  };
  const reject = (key) => {
    logPayment('pre_checkout.rejected', { ...context, reason: key });
    return telegramApi('answerPreCheckoutQuery', {
      pre_checkout_query_id: query.id,
      ok: false,
      error_message: messages[key]
    });
  };

  if (!parsed) return reject('invalid');
  if (!plan) return reject('plan');
  if (String(query.from?.id) !== parsed.telegramUserId) return reject('account');
  if (query.currency !== 'XTR') return reject('currency');
  if (Number(query.total_amount) !== plan.stars) return reject('price');

  const { query: dbQuery } = await import('../_db.js');
  const invoiceResult = await dbQuery('SELECT telegram_user_id, plan_id, stars FROM bezy_invoices WHERE nonce = $1', [parsed.nonce]);
  const invoice = invoiceResult.rows[0] || null;
  if (!invoice) return reject('expired');
  if (String(invoice.telegram_user_id) !== parsed.telegramUserId || invoice.plan_id !== plan.id || Number(invoice.stars) !== plan.stars) {
    return reject('unverified');
  }

  logPayment('pre_checkout.approved', context);
  return telegramApi('answerPreCheckoutQuery', { pre_checkout_query_id: query.id, ok: true });
}

// Activation runs in a single transaction keyed on telegram_payment_charge_id, so a
// redelivered update can never extend a membership twice.
async function handleSuccessfulPayment(message) {
  const payment = message.successful_payment;
  const chargeId = payment?.telegram_payment_charge_id;
  const parsed = parseInvoicePayload(payment?.invoice_payload);
  const plan = parsed && premiumPlan(parsed.planId);

  const context = {
    telegramUserId: String(message.from?.id || ''),
    planId: parsed?.planId || null,
    chargeId: chargeId || null,
    expectedStars: plan?.stars ?? null,
    receivedAmount: Number(payment?.total_amount),
    currency: payment?.currency
  };

  if (!chargeId || !parsed || !plan) {
    logPayment('successful_payment.rejected', { ...context, reason: 'unrecognized_payload' });
    return null;
  }
  if (String(message.from?.id) !== parsed.telegramUserId) {
    logPayment('successful_payment.rejected', { ...context, reason: 'user_mismatch' });
    return null;
  }
  if (payment.currency !== 'XTR' || Number(payment.total_amount) !== plan.stars) {
    logPayment('successful_payment.rejected', { ...context, reason: 'currency_or_amount_mismatch' });
    return null;
  }

  const { tx, advisoryLock } = await import('../_db.js');
  const now = new Date();

  // Activation runs in one transaction keyed on the charge id. The primary key on
  // telegram_payment_charge_id is the database-enforced idempotency boundary: a redelivered
  // update can never activate Premium twice, and the invoice corroboration inside the
  // transaction means a forged event without a matching invoice grants nothing.
  const result = await tx(async (q) => {
    await advisoryLock(q, `charge:${chargeId}`);
    await advisoryLock(q, `premium:${parsed.telegramUserId}`);
    const existing = await q('SELECT membership_expires_at FROM bezy_payments WHERE telegram_payment_charge_id = $1 FOR UPDATE', [chargeId]);
    if (existing.rows.length) return { duplicate: true, expiresAt: existing.rows[0].membership_expires_at || null };

    // The invoice created at pre-checkout is the server-side record of what was offered.
    // Activation corroborates the update against it — a well-formed successful_payment
    // without a matching invoice record grants nothing, mirroring the pre-checkout gate.
    const invoiceRows = await q(
      'SELECT telegram_user_id, plan_id, stars, status FROM bezy_invoices WHERE nonce = $1 FOR UPDATE',
      [parsed.nonce]
    );
    const invoice = invoiceRows.rows[0] || null;
    if (!invoice || invoice.status === 'paid' || String(invoice.telegram_user_id) !== parsed.telegramUserId || invoice.plan_id !== plan.id || Number(invoice.stars) !== plan.stars) {
      logPayment('successful_payment.rejected', { ...context, reason: 'invoice_mismatch' });
      return { rejected: true };
    }

    const membershipRows = await q(
      'SELECT active, expires_at, plan_id, purchased_at FROM premium_memberships WHERE telegram_id = $1 FOR UPDATE',
      [parsed.telegramUserId]
    );
    const userData = membershipRows.rows[0]
      ? { bezyPremium: { active: membershipRows.rows[0].active === true, planId: membershipRows.rows[0].plan_id, expiresAt: membershipRows.rows[0].expires_at ? new Date(membershipRows.rows[0].expires_at) : null, purchasedAt: membershipRows.rows[0].purchased_at ? new Date(membershipRows.rows[0].purchased_at) : null } }
      : {};
    const expiresAt = nextExpiry(userData, plan, now);

    await q(
      `INSERT INTO bezy_payments (telegram_payment_charge_id, provider_payment_charge_id, telegram_user_id, product,
                                  plan_id, stars, currency, invoice_payload, status, created_at, processed_at, membership_expires_at)
       VALUES ($1, $2, $3, 'bezy_premium', $4, $5, $6, $7, 'processed', $8, $8, $9)
       ON CONFLICT (telegram_payment_charge_id) DO NOTHING`,
      [
        chargeId, payment.provider_payment_charge_id || '', parsed.telegramUserId, plan.id,
        Number(payment.total_amount), payment.currency, payment.invoice_payload, now, expiresAt
      ]
    );

    await q(
      `INSERT INTO premium_memberships (telegram_id, active, plan_id, expires_at, purchased_at, updated_at, source, telegram_payment_charge_id)
       VALUES ($1, TRUE, $2, $3, $4, $4, 'telegram_stars', $5)
       ON CONFLICT (telegram_id) DO UPDATE SET active = TRUE, plan_id = EXCLUDED.plan_id, expires_at = EXCLUDED.expires_at,
         purchased_at = EXCLUDED.purchased_at, updated_at = EXCLUDED.updated_at, source = EXCLUDED.source,
         telegram_payment_charge_id = EXCLUDED.telegram_payment_charge_id, revoked_at = NULL, revocation_reason = NULL, refunded_charge_id = NULL`,
      [parsed.telegramUserId, plan.id, expiresAt, now, chargeId]
    );

    await q(
      `UPDATE bezy_invoices SET status = 'paid', paid_at = $1, telegram_payment_charge_id = $2 WHERE nonce = $3`,
      [now, chargeId, parsed.nonce]
    );

    return { duplicate: false, expiresAt, planId: plan.id };
  });

  if (result.rejected) return result;
  logPayment(result.duplicate ? 'successful_payment.duplicate_ignored' : 'successful_payment.activated', {
    ...context,
    idempotent: result.duplicate,
    expiresAt: result.expiresAt ? new Date(result.expiresAt.toMillis?.() ?? result.expiresAt).toISOString() : null
  });
  return result;
}

// Telegram pushes `refunded_payment` inside a normal message update whenever a Stars
// payment is refunded — whether Bezy initiated it, the owner ran the refund script, or
// Telegram support processed it. This is therefore the authoritative revocation trigger:
// entitlement is withdrawn no matter where the refund came from.
async function handleRefundedPayment(message) {
  const refund = message.refunded_payment;
  const chargeId = refund?.telegram_payment_charge_id;
  const context = {
    telegramUserId: String(message.from?.id || ''),
    chargeId: chargeId || null,
    currency: refund?.currency,
    refundedAmount: Number(refund?.total_amount)
  };

  if (!chargeId) {
    logPayment('refund.rejected', { ...context, reason: 'missing_charge_id' });
    return null;
  }

  const result = await applyRefund(null, chargeId, { source: 'telegram_webhook' });

  if (result.outcome === 'unknown_payment') {
    logPayment('refund.unknown_payment', context);
    return result;
  }
  if (result.outcome === 'already_refunded') {
    logPayment('refund.duplicate_ignored', { ...context, idempotent: true, planId: result.planId });
    return result;
  }

  logPayment('refund.revoked', {
    ...context,
    planId: result.planId,
    revoked: result.revoked,
    previousState: result.previousState,
    newState: result.newState,
    idempotent: false
  });
  return result;
}

const REFUND_CONFIRMATION = {
  en: '↩️ Your Bezy Premium subscription has been refunded, and Premium access has been removed from your account.\n\nYour profile, your matches and your Telegram conversations are unaffected.',
  fr: '↩️ Votre abonnement Bezy Premium a été remboursé. L’accès Premium a été retiré de votre compte.\n\nVotre profil, vos matchs et vos conversations Telegram ne sont pas affectés.',
  de: '↩️ Dein Bezy-Premium-Abo wurde erstattet, und der Premium-Zugang wurde von deinem Konto entfernt.\n\nDein Profil, deine Matches und deine Telegram-Unterhaltungen sind nicht betroffen.',
  es: '↩️ Tu suscripción de Bezy Premium ha sido reembolsada y el acceso Premium se ha retirado de tu cuenta.\n\nTu perfil, tus matches y tus conversaciones de Telegram no se ven afectados.',
  it: '↩️ Il tuo abbonamento Bezy Premium è stato rimborsato e l’accesso Premium è stato rimosso dal tuo account.\n\nIl tuo profilo, i tuoi match e le tue conversazioni Telegram non sono interessati.',
  pt: '↩️ A tua subscrição Bezy Premium foi reembolsada e o acesso Premium foi removido da tua conta.\n\nO teu perfil, os teus matches e as tuas conversas do Telegram não são afetados.',
  ru: '↩️ Твоя подписка Bezy Premium возвращена, а доступ Premium убран с аккаунта.\n\nТвой профиль, мэтчи и разговоры в Telegram не затронуты.',
  pl: '↩️ Twoja subskrypcja Bezy Premium została zwrócona, a dostęp Premium został usunięty z konta.\n\nTwój profil, dopasowania i rozmowy w Telegramie nie są naruszone.',
  ar: '↩️ تم استرداد اشتراك Bezy Premium الخاص بك وأُزيل وصول Premium من حسابك.\n\nملفك ومطابقاتك ومحادثاتك في تيليجرام غير متأثرة.',
  tr: '↩️ Bezy Premium aboneliğin iade edildi ve Premium erişimi hesabından kaldırıldı.\n\nProfilin, eşleşmelerin ve Telegram sohbetlerin etkilenmez.',
  sw: '↩️ Usajili wako wa Bezy Premium umerejeshwa pesa, na ufikiaji wa Premium umeondolewa kwenye akaunti yako.\n\nWasifu wako, mechi zako na mazungumzo yako ya Telegram haviathiriwi.',
  yo: '↩️ Wọ́n ti dá owó ìsọdìí Bezy Premium rẹ padà, a sì ti yọ ìwọlé Premium kúrò lórí àkọọ́lẹ̀ rẹ.\n\nÀkọọ́lẹ̀ rẹ, àwọn mátìsì rẹ àti àwọn ìbánisọ̀rọ̀ Telegram rẹ kò farapa.',
  hi: '🔁 आपका Bezy Premium रिफ़ंड हो गया और Premium एक्सेस आपके खाते से हटा दिया गया।\n\nआपकी प्रोफ़ाइल, मैच और Telegram बातचीत प्रभावित नहीं होते।',
  id: '↩️ Langganan Bezy Premium-mu telah dikembalikan, dan akses Premium dihapus dari akunmu.\n\nProfil, kecocokan, dan percakapan Telegram-mu tidak terpengaruh.',
  zh: '↩️ 你的 Bezy Premium 已退款，Premium 权限已从账户移除。\n\n你的资料、配对和 Telegram 对话不受影响。',
  ja: '↩️ Bezy Premium は払い戻され、Premium アクセスはアカウントから削除されました。\n\nプロフィール、マッチ、Telegram の会話に影響はありません。',
  ko: '↩️ Bezy Premium 구독이 환불되었고 Premium 액세스가 계정에서 제거되었습니다.\n\n프로필, 매치, Telegram 대화에는 영향이 없습니다.'
};
const PREMIUM_ACTIVATED = {
  en: (until) => `💎 Bezy Premium is now active!${until ? `\n\nActive until ${until}.` : ''}`,
  fr: (until) => `💎 Bezy Premium est maintenant actif !${until ? `\n\nActif jusqu’au ${until}.` : ''}`,
  de: (until) => `💎 Bezy Premium ist jetzt aktiv!${until ? `\n\nAktiv bis ${until}.` : ''}`,
  es: (until) => `💎 ¡Bezy Premium ya está activo!${until ? `\n\nActivo hasta el ${until}.` : ''}`,
  it: (until) => `💎 Bezy Premium è ora attivo!${until ? `\n\nAttivo fino al ${until}.` : ''}`,
  pt: (until) => `💎 O Bezy Premium está agora ativo!${until ? `\n\nAtivo até ${until}.` : ''}`,
  ru: (until) => `💎 Bezy Premium теперь активен!${until ? `\n\nАктивен до ${until}.` : ''}`,
  pl: (until) => `💎 Bezy Premium jest teraz aktywne!${until ? `\n\nAktywne do ${until}.` : ''}`,
  ar: (until) => `💎 Bezy Premium نشط الآن!${until ? `\n\nنشط حتى ${until}.` : ''}`,
  tr: (until) => `💎 Bezy Premium artık aktif!${until ? `\n\n${until} tarihine kadar aktif.` : ''}`,
  sw: (until) => `💎 Bezy Premium inatumika sasa!${until ? `\n\nInatumika hadi ${until}.` : ''}`,
  yo: (until) => `💎 Bezy Premium ti ń ṣiṣẹ́ báyìí!${until ? `\n\nŃ ṣiṣẹ́ títí ${until}.` : ''}`,
  hi: (until) => `💎 Bezy Premium अब सक्रिय है!${until ? `\n\n${until} तक सक्रिय।` : ''}`,
  id: (until) => `💎 Bezy Premium sekarang aktif!${until ? `\n\nAktif hingga ${until}.` : ''}`,
  zh: (until) => `💎 Bezy Premium 已激活！${until ? `\n\n有效期至 ${until}。` : ''}`,
  ja: (until) => `💎 Bezy Premium が有効になりました！${until ? `\n\n${until} まで有効です。` : ''}`,
  ko: (until) => `💎 Bezy Premium이 활성화되었습니다!${until ? `\n\n${until}까지 활성화됩니다.` : ''}`
};

async function confirmRefund(chatId, language) {
  const text = localized(language, REFUND_CONFIRMATION);
  const label = localized(language, OPEN_BEZY);
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: miniAppUrl('premium') } }]] }
  });
}

async function confirmPremium(chatId, language, expiresAt) {
  const date = expiresAt ? new Date(expiresAt.toMillis?.() ?? expiresAt) : null;
  const until = date
    ? new Intl.DateTimeFormat(dateLocale(language), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
    : '';
  const text = localized(language, PREMIUM_ACTIVATED)(until);
  const label = localized(language, OPEN_BEZY);
  await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: miniAppUrl('premium') } }]] }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured' });
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  // Fail closed: without the shared secret this deployment cannot tell a Telegram update
  // from a forged one — and payment updates in particular activate Premium. Production and
  // Preview/Development carry the secret (owner-confirmed); the only unsigned deployment is
  // the local test harness, which sets a local test secret. An unsigned update is
  // acknowledged (Telegram retries on non-200) and ignored, never acted on.
  if (!expectedSecret || req.headers['x-telegram-bot-api-secret-token'] !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const update = req.body || {};

  // Payment updates are handled before command routing. Telegram retries on a non-200,
  // so failures are logged and acknowledged rather than surfaced as an error status.
  if (update.pre_checkout_query) {
    try { await handlePreCheckout(update.pre_checkout_query); }
    catch (error) { console.error('Pre-checkout handling failed:', error); }
    return res.status(200).json({ ok: true });
  }

  // Support menu callbacks (CN-7). Answered first so the button press never hangs, then
  // acted on. Identity comes from the update context Telegram itself signed — never from
  // anything a client could forge.
  if (update.callback_query) {
    try {
      const query = update.callback_query;
      await telegramApi('answerCallbackQuery', { callback_query_id: query.id }).catch(() => {});
      const data = String(query?.data || '');
      if (data.startsWith('support:')) {
        const chatId = query.message?.chat?.id;
        const from = query.from;
        if (chatId && from) {
          const language = await resolveChatLanguage(null, from);
          const part = data.slice('support:'.length);
          if (part.startsWith('new:')) {
            await beginSupportIntake(chatId, language, from, part.slice(4), null);
          } else if (SUPPORT_CATEGORIES.includes(part)) {
            await handleSupportCategory(chatId, language, from, part, null);
          }
        }
      }
    } catch (error) {
      console.error('Callback handling failed:', error);
      try {
        const chatId = update.callback_query?.message?.chat?.id;
        const from = update.callback_query?.from;
        if (chatId && from) {
          await telegramApi('sendMessage', { chat_id: chatId, text: supportFailureMessage(normalizedLanguage(from.language_code)) });
        }
      } catch (replyError) {
        console.error('Support failure reply failed:', replyError);
      }
    }
    return res.status(200).json({ ok: true });
  }

  const message = update.message;
  if (!message?.chat?.id) return res.status(200).json({ ok: true });
  // The explicit Bezy choice wins over the Telegram language where the user document can
  // safely be read; every other bot reply falls back to the Telegram language.
  const language = await resolveChatLanguage(null, message.from);

  if (message.refunded_payment) {
    try {
      const result = await handleRefundedPayment(message);
      // Only a refund that actually withdrew access is announced, so a redelivered
      // update cannot produce a second "your Premium was removed" message.
      if (result?.outcome === 'refunded' && result.revoked) await confirmRefund(message.chat.id, language);
    } catch (error) {
      console.error('Refund handling failed:', error);
    }
    return res.status(200).json({ ok: true });
  }

  if (message.successful_payment) {
    try {
      const result = await handleSuccessfulPayment(message);
      if (result && !result.duplicate && !result.rejected) await confirmPremium(message.chat.id, language, result.expiresAt);
    } catch (error) {
      console.error('Successful-payment handling failed:', error);
    }
    return res.status(200).json({ ok: true });
  }

  const command = commandName(message.text);
  if (command === 'support' || command === 'assistance' || command === 'soporte' || command === 'assistenza') {
    await sendSupportMenu(message.chat.id, language);
    return res.status(200).json({ ok: true });
  }
  if (!Object.prototype.hasOwnProperty.call(COMMAND_VIEWS, command)) {
    // Not a command: if the user was mid support intake, this plain message is their
    // problem description. Anything else stays unanswered, as before.
    try {
      await handleSupportText(message.chat.id, language, message.from, null, String(message.text || ''));
    } catch (error) {
      console.error('Support intake failed:', error);
      try {
        await telegramApi('sendMessage', { chat_id: message.chat.id, text: supportFailureMessage(language) });
      } catch (replyError) {
        console.error('Support failure reply failed:', replyError);
      }
    }
    return res.status(200).json({ ok: true });
  }

  if (command === 'start' || command === 'demarrer' || command === 'empezar') {
    try { await configureLocalizedCommands(); }
    catch (error) { console.error('Unable to configure Telegram commands:', error); }
  }
  await sendCommand(message.chat.id, command, language);
  return res.status(200).json({ ok: true });
}
