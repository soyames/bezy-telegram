const tg = window.Telegram?.WebApp;
const API = { profile: '/api/profile/me', discover: '/api/discover', swipe: '/api/swipe', matches: '/api/matches', premium: '/api/premium', likes: '/api/likes', relationship: '/api/relationship', account: '/api/account', support: '/api/support', messages: '/api/messages' };
// The shared Pi/Telegram community API (photos + discovery/matching/messaging) is
// hosted on its own project so each deployment stays under Vercel's function ceiling.
const SHARED_API = 'https://bezy-api.vercel.app';
const state = { lang: null, dict: null, telegramUser: null, account: null, profiles: [], matches: [], stats: null, preferences: null, notifications: null, processingRestricted: false, processingObjection: false, emptyReason: null, currentIndex: 0, view: 'discover', premium: null, likes: null, likeCount: 0, selectedPlan: 'yearly', userNavigated: false, chat: null, chatPollTimer: null, chatPollTick: 0, chatCache: new Map(), swipeInFlight: false, matchesError: false, likesError: false, premiumCheckPending: false, quota: null, totSheetRound: false, social: { candidates: [], matches: [], trouble: false }, socialLoaded: false, socialPhotoUrls: [], socialSignature: '' };
const $ = (id) => document.getElementById(id);

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function safeCall(fn) { try { return fn(); } catch (error) { console.warn('[Bezy] Ignored Telegram WebApp error:', error); return undefined; } }
function t(key) { return key.split('.').reduce((value, part) => value?.[part], state.dict) ?? key; }

// Copy for the shared community layer (Pi Network members and other Telegram members) is
// NEW, so most catalogues do not hold it yet. t() answers with the dotted key when a
// catalogue is missing one; st() keeps that fallback English instead. The values below are
// the English wording — the same wording locales/en.json carries under `shared_<key>`.
// One community, so none of this copy names a network.
const SHARED_COPY = { shared_offline: 'Community service is unavailable right now.', social_loading: 'Loading…', you_prefix: 'You: ' };
function st(key) { const value = t('app.shared_' + key); return value === 'app.shared_' + key ? (SHARED_COPY[key] || key) : value; }

// Locale resolution mirrors api/_telegram.js (normalizeLanguageTag/resolveLanguage), pinned
// by the localization suite. Priority: explicit Bezy choice (localStorage holds ONLY that) →
// Telegram language → browser preferred languages → English. Automatic detection is never
// persisted, so a Telegram or device language change keeps re-resolving.
const SUPPORTED_LOCALES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'pl', 'ar', 'tr', 'sw', 'yo', 'hi', 'id', 'zh', 'ja', 'ko'];
function normalizeLanguageTag(code) { const primary = String(code ?? '').trim().toLowerCase().split(/[-_]/)[0]; return SUPPORTED_LOCALES.includes(primary) ? primary : ''; }
function browserLanguages() { const list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language]; return list.map(normalizeLanguageTag).filter(Boolean); }
function storedExplicitLanguage() { try { return localStorage.getItem('bezy-language'); } catch { return null; } }
function resolveAppLocale() {
  const explicit = normalizeLanguageTag(storedExplicitLanguage());
  if (explicit) return explicit;
  const telegram = normalizeLanguageTag(state.telegramUser?.language_code || tg?.initDataUnsafe?.user?.language_code);
  if (telegram) return telegram;
  return browserLanguages()[0] || 'en';
}

async function loadLocale(language) {
  const response = await fetch(`/locales/${language}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load language: ${response.status}`);
  state.lang = language;
  state.dict = await response.json();
  document.documentElement.lang = language;
  // RTL is a property of the locale, not a separate layout: Arabic flips the document
  // direction and the stylesheet responds with the RTL block.
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  applyLocale();
}
function setText(id, value) { const node = $(id); if (node) node.textContent = value; }

function applyLocale() {
  setText('tagline', t('app.tagline')); setText('nav-discover', t('app.discover')); setText('nav-matches', t('app.matches')); setText('nav-messages', t('app.messages')); setText('nav-profile', t('app.profile'));
  setText('discover-title', t('app.discover_title')); setText('discover-intro', t('app.discover_intro')); setText('for-you', t('app.for_you')); setText('filterBtn', t('app.filters'));
  setText('premium-copy', t('app.premium_copy')); setText('premiumBtn', t('app.view_membership')); setText('your-matches', t('app.your_matches')); setText('discoverBtn', t('app.discover')); setText('matches-premium-copy', t('app.matches_premium_copy'));
  document.querySelectorAll('.premium-action').forEach((node) => { node.textContent = t('app.unlock_premium'); });
  setText('messages-title', t('app.messages')); setText('protected-label', t('app.protected_by_bezy')); setText('conversation-note', t('app.conversation_hint')); setText('profile-title', t('app.my_profile')); setText('profile-refresh-label', t('app.refresh')); setText('edit-profile', t('app.edit_profile')); setText('settings-privacy-label', t('app.settings_privacy')); setText('core-profile-label', t('app.core_profile')); setText('saved-badge', t('app.saved_badge'));
  setText('display-name-label', t('app.display_name')); setText('age-label', t('app.age')); setText('city-label', t('app.city')); setText('gender-label', t('app.gender')); setText('seeking-label', t('app.seeking')); setText('interests-label', t('app.interests')); setText('bio-label', t('app.bio'));
  setText('discoverable-label', t('app.show_profile')); setText('discoverable-note', t('app.discoverable_note')); setText('save-profile', t('app.save_profile')); setText('language-title', t('app.language')); setText('privacy-link', t('app.privacy')); setText('terms-link', t('app.terms')); setText('support-title', t('app.support_title')); setText('support-intro', t('app.support_intro')); setText('support-bot-btn', t('app.support_help')); setText('support-history-btn', t('app.support_history')); setText('support-formal', t('app.support_formal')); setText('support-expectation', t('app.support_expectation')); setText('support-email-btn', t('app.support_email')); setText('interests-add-btn', t('app.add_interest')); setText('share-story-btn', t('app.share_story')); setText('legal-help-btn', t('app.legal_help')); setText('footer-note', t('app.footer_note'));
  setText('people-label', t('app.people_available')); setText('match-label', t('app.best_match')); setText('new-label', t('app.new_today')); setText('message-empty', t('app.no_conversations')); setText('matches-empty', t('app.no_matches')); setText('discover-powered-by', t('app.powered_by'));
  if ($('privacy-link')) $('privacy-link').href = `/privacy?lang=${state.lang}`;
  if ($('terms-link')) $('terms-link').href = `/terms?lang=${state.lang}`;
  document.querySelectorAll('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === state.lang));
  // "I am" is never pre-selected: a pre-selected prefer_not_to_say made new accounts
  // invisible to everyone seeking a specific gender (live discovery failure). The
  // placeholder is the initial state; the form requires an affirmative choice.
  const gender = $('gender');
  if (gender) gender.innerHTML = `<option value="" selected disabled>${escapeHtml(t('app.gender_placeholder'))}</option><option value="woman">${escapeHtml(t('app.woman'))}</option><option value="man">${escapeHtml(t('app.man'))}</option><option value="non_binary">${escapeHtml(t('app.non_binary'))}</option><option value="prefer_not_to_say">${escapeHtml(t('app.prefer_not_to_say'))}</option>`;
  const seeking = $('seeking');
  if (seeking) seeking.innerHTML = `<option value="women">${escapeHtml(t('app.women'))}</option><option value="men">${escapeHtml(t('app.men'))}</option><option value="everyone">${escapeHtml(t('app.everyone'))}</option>`;
  if ($('interests')) $('interests').placeholder = t('app.interests_placeholder');
  if ($('interests-add')) $('interests-add').placeholder = t('app.add_interest_placeholder');
  if ($('bio')) $('bio').placeholder = t('app.bio_placeholder');
  if ($('chat-draft')) $('chat-draft').placeholder = t('app.msg_placeholder');
  $('chat-send')?.setAttribute('aria-label', t('app.msg_send'));
  $('chat-back')?.setAttribute('aria-label', t('app.close'));
  $('chat-menu')?.setAttribute('aria-label', t('app.safety_actions'));
  $('chat-starters-open')?.setAttribute('aria-label', t('app.starters_title'));
  setText('prompts-title', t('app.prompts_title')); setText('prompts-hint', t('app.prompts_hint')); setText('preview-profile-btn', t('app.preview_profile'));
  setText('languages-label', t('app.languages_label')); setText('languages-hint', t('app.languages_hint'));
  // Relabelled in the new language while keeping whatever is currently selected.
  languageChips('languages-list', readLanguageChips('languages-list'));
  // Relabels the questions in the new language, carrying over whatever is on screen. This
  // runs before an account has loaded too, so it must not assume saved prompts exist.
  renderPromptEditor();
  setText('discover-loading', t('app.loading')); setText('premium-loading', t('app.loading'));
  setText('premium-title', t('app.premium_title')); setText('premium-back', t('app.discover'));
  setText('premium-card-title', `✨ ${t('app.premium_title')}`); setText('matches-premium-title', `💎 ${t('app.more_connections')}`);
  setText('notifications-title', t('app.notifications_title')); setText('notifications-hint', t('app.notifications_hint')); renderNotificationSettings();
  // Trust copy is precise: what was verified (nothing), by whom (no one — self-declared),
  // and what was not (identity/age). Never a bare "Verified".
  setText('age-status-title', t('app.age_status_title')); setText('age-status', t('app.age_self_declared')); setText('age-status-note', t('app.age_note'));
  renderHomeScreenState();
  setText('safety-title', t('app.safety_title')); setText('safety-intro', t('app.safety_intro')); setText('data-title', t('app.data_title')); setText('privacy-by-design', t('app.privacy_by_design')); setText('data-controls-btn', t('app.data_controls')); setText('rights-note', t('app.rights_note'));
  setText('blocked-list-btn', t('app.blocked_people')); setText('export-data-btn', t('app.export_data')); setText('delete-account-btn', t('app.delete_account'));
  renderRestriction();
  renderObjection();
  setText('age-title', t('app.age_gate_title')); setText('age-body', t('app.age_gate_body'));
  setText('age-confirm', t('app.age_confirm')); setText('age-deny', t('app.age_deny')); setText('age-note', t('app.age_note'));
  // Accessible names are user-facing too, so they follow the selected language.
  document.documentElement.lang = state.lang;
  $('settingsBtn')?.setAttribute('aria-label', t('app.settings'));
  document.querySelector('.bottom')?.setAttribute('aria-label', t('app.navigation'));
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', t('app.meta_description'));
  renderDiscover(); renderMatches();
  // An open conversation relabels too: the round card and its state are catalogue copy.
  if (state.chat) renderGameCard();
  if (state.premium) renderPremium();
  renderPremiumSurfaces();
  updateProfileHero(); renderInterestChips(); updateBioCount();
}

function showToast(message) { const node = $('toast'); if (!node) return; node.textContent = message; node.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => node.classList.remove('show'), 2600); }

// The API returns stable machine codes rather than prose, so every message the user reads
// is rendered from the active locale catalogue.
const ERROR_KEYS = {
  INVALID_SESSION: 'app.error_session',
  DATABASE_UNAVAILABLE: 'app.error_database',
  PROFILE_NOT_FOUND: 'app.error_profile_missing',
  TARGET_NOT_FOUND: 'app.error_target_missing',
  PREMIUM_REQUIRED: 'app.premium_required',
  DISCOVERY_LIMIT_REACHED: 'app.discovery_limit',
  SUPER_LIKE_LIMIT_REACHED: 'app.super_like_limit',
  // PREMIUM_UNAVAILABLE covers any Premium failure including plain status reads — a
  // checkout-failure string would misdescribe a read error.
  PREMIUM_UNAVAILABLE: 'app.premium_unavailable',
  AGE_CONFIRMATION_REQUIRED: 'app.error_age_required',
  PROCESSING_RESTRICTED: 'app.error_processing_restricted',
  RATE_LIMITED: 'app.rate_limited',
  CONVERSATION_UNAVAILABLE: 'app.msg_conversation_unavailable',
  // The post-match game: a round that has been superseded, and an answer that was already
  // final. Neither is a failure the user caused, so both read as a plain statement of fact.
  GAME_UNAVAILABLE: 'app.tot_error_round',
  ANSWER_FINAL: 'app.tot_error_final'
};
function errorText(error) {
  // Rate limiting is reachable by an ordinary enthusiastic user, so it says how long to
  // wait rather than falling back to a generic failure message.
  if (error?.error === 'RATE_LIMITED') {
    const seconds = Number(error.retryAfter) || 0;
    if (seconds >= 120) return t('app.rate_limited_minutes').replace('{n}', String(Math.ceil(seconds / 60)));
    return t('app.rate_limited');
  }
  const key = ERROR_KEYS[error?.error];
  return key ? t(key) : t('app.error_generic');
}

function relativeTime(iso) {
  if (!iso) return '';
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed)) return '';
  const formatter = new Intl.RelativeTimeFormat(state.lang || 'en', { numeric: 'auto' });
  for (const [unit, ms] of [['day', 86400000], ['hour', 3600000], ['minute', 60000]]) {
    if (Math.abs(elapsed) >= ms) return formatter.format(-Math.round(elapsed / ms), unit);
  }
  return formatter.format(0, 'minute');
}

function closeSheet() { const host = $('sheet-host'); state.totSheetRound = false; if (!host) return; host.classList.add('hidden'); host.innerHTML = ''; }

function openSheet(title, inner, onMount) {
  const host = $('sheet-host');
  if (!host) return;
  host.innerHTML = `<div class="sheet" role="document"><div class="sheet-head"><h3>${escapeHtml(title)}</h3><button class="sheet-close" type="button" data-sheet-close aria-label="${escapeHtml(t('app.close'))}">✕</button></div>${inner}</div>`;
  host.classList.remove('hidden');
  host.onclick = (event) => { if (event.target === host || event.target.closest('[data-sheet-close]')) closeSheet(); };
  onMount?.(host);
}

function openFilters() {
  const preferences = state.preferences || { minAge: 18, maxAge: 100, city: '', sameCityOnly: false, languages: [] };
  // City and same-city are Premium filters (api/discover.js applies them only for Premium
  // members). The sheet must say so instead of accepting input the server would silently
  // ignore — a truthful control beats a silent no-op.
  const premium = premiumActive();
  const cityFields = premium
    ? `<div class="field"><label for="filter-city">${escapeHtml(t('app.city'))}</label><input id="filter-city" maxlength="80" value="${escapeHtml(preferences.city)}" placeholder="${escapeHtml(t('app.any_city'))}"></div>
       <label class="check"><input id="filter-same-city" type="checkbox" ${preferences.sameCityOnly ? 'checked' : ''}> <span>${escapeHtml(t('app.same_city_only'))}</span></label>`
    : `<div class="field"><label for="filter-city">${escapeHtml(t('app.city'))}</label><input id="filter-city" disabled placeholder="${escapeHtml(t('app.premium_required'))}"></div>
       <label class="check"><input id="filter-same-city" type="checkbox" disabled> <span>${escapeHtml(t('app.same_city_only'))}</span></label>
       <p class="filter-note">${escapeHtml(t('app.filter_premium_note'))}</p>`;
  openSheet(t('app.filters'), `
    <div class="two-col">
      <div class="field"><label for="filter-min-age">${escapeHtml(t('app.min_age'))}</label><input id="filter-min-age" type="number" min="18" max="100" value="${escapeHtml(preferences.minAge)}"></div>
      <div class="field"><label for="filter-max-age">${escapeHtml(t('app.max_age'))}</label><input id="filter-max-age" type="number" min="18" max="100" value="${escapeHtml(preferences.maxAge)}"></div>
    </div>
    <div class="field"><span class="field-label" id="filter-languages-label">${escapeHtml(t('app.filter_languages'))}</span><div class="chip-set" id="filter-languages" role="group" aria-labelledby="filter-languages-label"></div><small class="filter-note" style="margin:0">${escapeHtml(t('app.filter_languages_hint'))}</small></div>
    ${cityFields}
    <button class="save-btn" id="filter-apply" type="button">${escapeHtml(t('app.apply_filters'))}</button>
    <button class="ghost-btn" id="filter-reset" type="button">${escapeHtml(t('app.reset_filters'))}</button>
    <p class="filter-note">${escapeHtml(t('app.filters_note'))}</p>
  `, () => {
    languageChips('filter-languages', preferences.languages || []);
    // An emptied numeric input serializes as Number('') === 0, which the backend clamps to
    // maxAge 18 — an accidental filter that hides nearly everyone. A missing value means the
    // default bound instead, so clearing a field can never shrink the deck by accident.
    // On the free plan the city controls are disabled, and the payload keeps the unfiltered
    // defaults so the stored preferences always match what the user was shown.
    // When Premium status is still unknown (state.premium === null, the fetch failed or is
    // in flight) the stored city/same-city values are preserved rather than wiped: an
    // unknown entitlement must never cost a paying member their saved filters.
    const stored = state.preferences || {};
    $('filter-apply').onclick = () => savePreferences({
      minAge: Number($('filter-min-age').value) || 18,
      maxAge: Number($('filter-max-age').value) || 100,
      city: premium ? $('filter-city').value : (state.premium === null ? String(stored.city || '') : ''),
      sameCityOnly: premium ? $('filter-same-city').checked : (state.premium === null ? Boolean(stored.sameCityOnly) : false),
      languages: readLanguageChips('filter-languages')
    });
    $('filter-reset').onclick = () => savePreferences({ minAge: 18, maxAge: 100, city: '', sameCityOnly: false, languages: [] });
  });
}

async function savePreferences(preferences) {
  try {
    await api(API.profile, { body: { preferences } });
    state.preferences = preferences;
    closeSheet();
    showToast(t('app.filters_applied'));
    await loadDiscover();
  } catch (error) {
    showToast(errorText(error));
  }
}
async function api(path, options = {}) {
  const body = options.body ? { ...options.body, initData: tg?.initData || '' } : { initData: tg?.initData || '' };
  const response = await fetch(path, { method: options.method || 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // The payload is preserved on the error so callers can react to typed codes such as
    // PREMIUM_REQUIRED or DISCOVERY_LIMIT_REACHED, and read fields like likeCount.
    const error = new Error(data.error || t('app.error_generic'));
    Object.assign(error, data, { status: response.status });
    throw error;
  }
  return data;
}
// User-added photos travel through authenticated Vercel endpoints. Telegram
// continues to serve the existing profile avatar directly.
async function media(path, options = {}) {
  const response = await fetch(`${SHARED_API}/api/media/${path}`, {
    ...options,
    headers: { ...(options.headers || {}), 'X-Telegram-Init-Data': tg?.initData || '' }
  });
  if (!response.ok) throw new Error('Photo service is unavailable. Please try again.');
  return response;
}
// The shared community backend (/api/social/*) serves Pi Network members and other
// Telegram members in the same deck, match list and conversations. It is keyed by an
// opaque member id and authenticated by the Mini App's initData, exactly like the rest of
// the app — same origin, so there is nothing else to carry. Typed failures keep the same
// shape as api(): the payload is copied onto the error, with `.error` and `.status`.
// Reads omit the method; every write names it, because a GET carrying a body is refused by
// the fetch spec rather than being sent.
async function social(path, options = {}) {
  const response = await fetch(`${SHARED_API}/api/social/${path}`, {
    method: options.method || 'GET',
    headers: { 'content-type': 'application/json', 'X-Telegram-Init-Data': tg?.initData || '' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  // 204 responses (unmatch, block, read) carry no body at all.
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || t('app.error_generic'));
    Object.assign(error, data, { status: response.status });
    throw error;
  }
  return data;
}
// The community profile is derived server-side from the existing Telegram account. It is a
// fire-and-forget mirror: a missing or ineligible profile must never block or surface here.
function syncSocialProfile() { void social('profile', { method: 'POST', body: {} }).catch(() => {}); }
let datingPhotoUrls = [];
function clearDatingPhotoUrls() {
  datingPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  datingPhotoUrls = [];
}
async function refreshDatingPhotos() {
  const gallery = $('dating-photo-gallery');
  if (!gallery || !tg?.initData) return;
  clearDatingPhotoUrls();
  gallery.replaceChildren();
  const { photos } = await (await media('photos')).json();
  for (const photo of photos) {
    const bytes = await (await media(`photos?id=${encodeURIComponent(photo.id)}`)).blob();
    const url = URL.createObjectURL(bytes);
    datingPhotoUrls.push(url);
    const img = document.createElement('img');
    img.src = url; img.alt = 'Dating photo'; img.style.cssText = 'width:80px;height:96px;object-fit:cover;border-radius:12px';
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Remove';
    remove.onclick = async () => {
      try { await media(`photos?id=${encodeURIComponent(photo.id)}`, { method: 'DELETE' }); await refreshDatingPhotos(); }
      catch (error) { showToast(error.message); }
    };
    const item = document.createElement('div'); item.append(img, remove); gallery.append(item);
  }
  const input = $('dating-photo-upload');
  if (input) input.disabled = photos.length >= 6;
  // The hero reads datingPhotoUrls, so it has to repaint once the bytes have landed —
  // otherwise a fresh open shows the Telegram avatar until something else triggers a render.
  renderAccount();
}
async function syncTelegramMedia() {
  await media('member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  await refreshDatingPhotos();
}
// Bezy conversations (ADR 0009): the conversation UI and message delivery live inside the
// Mini App; Telegram keeps identity, hosting and notifications. There is no Telegram chat
// handoff anymore — the primary match action opens the Bezy conversation screen.
//
// A device-local marker flips the label from "Start conversation" to "Continue
// conversation" once the conversation has been opened here.
function chatOpenedKey(matchId) { return `bezy-chat-opened-${matchId}`; }
function hasChatOpened(matchId) { try { return localStorage.getItem(chatOpenedKey(matchId)) === '1'; } catch { return false; } }
function markChatOpened(matchId) { try { localStorage.setItem(chatOpenedKey(matchId), '1'); } catch { /* label only */ } }
function chatLabel(match) { return t(hasChatOpened(match?.matchId) ? 'app.continue_conversation' : 'app.start_conversation'); }

function showView(view) {
  const validViews = new Set(['discover', 'matches', 'messages', 'profile', 'premium', 'age']);
  // Bezy is 18+ only: until the declaration is made, no other view is reachable.
  if (state.needsAgeConfirmation && view !== 'age') view = 'age';
  state.view = validViews.has(view) ? view : 'discover';
  document.querySelectorAll('.view').forEach((node) => node.classList.toggle('active', node.id === `${state.view}-view`));
  // Premium is reached from in-app entry points rather than the bottom bar, so no tab is
  // highlighted while it is open.
  document.querySelectorAll('.nav button').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
  if (state.view === 'discover') loadDiscover();
  if (state.view === 'matches') loadMatches();
  if (state.view === 'messages') loadMatches(true);
  // The hero shows the member's own dating photo, which has to be fetched before it can.
  if (state.view === 'profile') { renderAccount(); void refreshDatingPhotos().catch(() => {}); }
  if (state.view === 'premium') loadPremium();
  window.scrollTo?.({ top: 0, behavior: 'smooth' });
}

// ---------------------------------------------------------------------------
// Profile prompts
// These ids mirror PROMPT_IDS in api/profile/me.js. They are machine tokens and are never
// translated — the question text is read from `app.prompt_<id>` in the active catalogue,
// so the same stored answer renders in whichever language the reader is using.
// ---------------------------------------------------------------------------

const PROMPT_IDS = ['perfect_sunday', 'i_value', 'first_date', 'should_know', 'talk_for_hours'];
const MAX_PROMPTS = 3;

// Languages spoken. These ids mirror LANGUAGE_IDS in api/profile/me.js — ISO 639-1 machine
// tokens, never translated; the display name comes from `language_<id>`.
const LANGUAGE_IDS = ['en', 'fr', 'es', 'pt', 'ar', 'de', 'it', 'ru', 'sw', 'yo', 'pl', 'tr', 'hi', 'id', 'zh', 'ja', 'ko'];
const MAX_LANGUAGES = 5;

function languageName(id) { return t(`app.language_${id}`); }

// A chip group rather than a multi-select: it is legible on a phone, and it keeps the
// selection visible while the user reads the rest of the form.
function languageChips(hostId, selected) {
  const host = $(hostId);
  if (!host) return;
  const chosen = new Set(selected || []);
  host.innerHTML = LANGUAGE_IDS.map((id) =>
    `<button type="button" class="chip" data-language-chip="${escapeHtml(id)}" aria-pressed="${chosen.has(id)}">${escapeHtml(languageName(id))}<span class="chip-check" aria-hidden="true">✓</span></button>`).join('');
  host.querySelectorAll('[data-language-chip]').forEach((chip) => {
    chip.onclick = () => {
      const on = chip.getAttribute('aria-pressed') === 'true';
      // The cap is enforced by the API too; this only stops the user selecting a sixth and
      // then silently losing it on save.
      if (!on && readLanguageChips(hostId).length >= MAX_LANGUAGES) return;
      chip.setAttribute('aria-pressed', String(!on));
    };
  });
  updateLanguageCount();
}

function readLanguageChips(hostId) {
  return [...document.querySelectorAll(`#${hostId} [data-language-chip][aria-pressed="true"]`)]
    .map((chip) => chip.dataset.languageChip);
}

// Rendered from the catalogue, so a stored `fr` shows as "French" or "Français" depending on
// who is reading. Unknown ids are skipped rather than shown as a raw token.
function languageTags(languages) {
  return (languages || [])
    .filter((id) => LANGUAGE_IDS.includes(id))
    .map((id) => `<span class="tag">${escapeHtml(languageName(id))}</span>`)
    .join('');
}

function promptQuestion(id) { return t(`app.prompt_${id}`); }

// Reads the editor rows as they currently stand, including a half-finished row the user
// has not saved. Used both to submit and to survive a language switch without losing input.
function currentPromptRows() {
  return [...document.querySelectorAll('#prompts-list .prompt-row')].map((row) => ({
    id: row.querySelector('select')?.value || '',
    answer: row.querySelector('input')?.value || ''
  }));
}

function readPromptEditor() {
  const seen = new Set();
  const prompts = [];
  for (const row of currentPromptRows()) {
    const answer = row.answer.trim();
    if (!row.id || !answer || seen.has(row.id)) continue;
    seen.add(row.id);
    prompts.push({ id: row.id, answer });
  }
  return prompts.slice(0, MAX_PROMPTS);
}

// Called with the saved prompts when the account loads, and with no argument when the
// language changes — in which case the rows are rebuilt from whatever is on screen.
function renderPromptEditor(prompts) {
  const host = $('prompts-list');
  if (!host) return;
  const values = Array.isArray(prompts) ? prompts : currentPromptRows();
  const rows = [];
  for (let index = 0; index < MAX_PROMPTS; index += 1) {
    const value = values[index] || { id: '', answer: '' };
    const options = [`<option value="">${escapeHtml(t('app.prompt_none'))}</option>`]
      .concat(PROMPT_IDS.map((id) => `<option value="${escapeHtml(id)}"${id === value.id ? ' selected' : ''}>${escapeHtml(promptQuestion(id))}</option>`))
      .join('');
    rows.push(`<div class="prompt-row"><span class="prompt-num">${escapeHtml(t('app.prompt_number').replace('{n}', String(index + 1)))}</span><select aria-label="${escapeHtml(t('app.prompts_select_label'))}">${options}</select><input maxlength="200" aria-label="${escapeHtml(t('app.prompts_answer_label'))}" placeholder="${escapeHtml(t('app.prompt_placeholder'))}" value="${escapeHtml(value.answer)}"></div>`);
  }
  host.innerHTML = rows.join('');
}

// Answered prompts as they appear on a card. Unknown ids are skipped rather than shown
// with a raw token, so removing a prompt from the catalogue degrades quietly.
function promptCardHtml(profile) {
  const answered = (profile.prompts || [])
    .filter((prompt) => PROMPT_IDS.includes(prompt?.id) && String(prompt?.answer || '').trim())
    .slice(0, MAX_PROMPTS);
  if (!answered.length) return '';
  const items = answered.map((prompt) => {
    const translation = profile.translations?.[`prompt:${prompt.id}`];
    return `<div class="card-prompt tr-group"><b>${escapeHtml(promptQuestion(prompt.id))}</b><p class="tr-target" dir="auto">${escapeHtml(translation ? translation.text : prompt.answer)}</p>${translation ? translationToggle(translation, prompt.answer, '') : ''}</div>`;
  }).join('');
  return `<div class="card-prompts">${items}</div>`;
}

// The translate affordance: a small note plus a toggle button that swaps between the
// translated text and the user's original words. The original is always preserved in the
// button's data attributes — never edited, never overwritten, never fabricated.
function translationToggle(translation, original, city) {
  return `<div class="tr-row"><span class="tr-note">${escapeHtml(t('app.translated_from').replace('{lang}', languageName(translation.sourceLang)))}</span> <button type="button" class="tr-toggle" data-original="${escapeHtml(original)}" data-translated="${escapeHtml(translation.text)}" data-source="${escapeHtml(translation.sourceLang)}" data-city="${escapeHtml(city)}">${escapeHtml(t('app.show_original'))}</button></div>`;
}

// Attached after each render that contains translated cards. The toggle flips the target
// text and its label between the translation and the original — both directions.
function bindTranslationToggles(root) {
  root.querySelectorAll('.tr-toggle').forEach((button) => {
    button.onclick = () => {
      const group = button.closest('.tr-group');
      const target = group?.querySelector('.tr-target');
      const note = group?.querySelector('.tr-note');
      const showingOriginal = button.dataset.mode === 'original';
      if (target) {
        const city = button.dataset.city;
        const text = showingOriginal ? button.dataset.translated : button.dataset.original;
        target.textContent = city ? [city, text].filter(Boolean).join(' · ') || '💜 Bezy' : text;
      }
      if (note) {
        note.textContent = showingOriginal
          ? t('app.translated_from').replace('{lang}', languageName(button.dataset.source))
          : t('app.original_label').replace('{lang}', languageName(button.dataset.source));
      }
      button.textContent = showingOriginal ? t('app.show_original') : t('app.show_translation');
      button.dataset.mode = showingOriginal ? 'translated' : 'original';
    };
  });
}

// ---------------------------------------------------------------------------
// Profile hero & chip editors
// The hero card mirrors the form fields, and the completion percentage is
// derived from what the profile actually holds rather than a stored number.
// ---------------------------------------------------------------------------

function profileCompletionPercent() {
  // One definition of completeness: the same four fields the backend requires for the
  // profile to go live (`api/profile/me.js`: displayName, age, city, gender) plus the 18+
  // declaration, which the server also requires. The bar and the status pill can no longer
  // contradict each other — a live profile reads 100%, and a pre-declaration profile never
  // shows 100% next to a "Complete your profile" status.
  const account = state.account || {}, profile = account.profile || {};
  const checks = [
    Boolean(profile.displayName), // the server requires the stored name — firstName is not a substitute
    Boolean(profile.age),
    Boolean(profile.city),
    Boolean(profile.gender),
    account.ageEligibility?.confirmed === true
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function updateProfileHero() {
  const name = $('display-name')?.value.trim();
  if (name && $('my-name')) $('my-name').textContent = name;
  if ($('my-age-hero')) $('my-age-hero').textContent = $('age')?.value ? `, ${$('age').value}` : '';
  if ($('my-city-hero')) $('my-city-hero').textContent = $('city')?.value.trim() || '';
  const percent = profileCompletionPercent();
  if ($('completion-bar')) $('completion-bar').style.width = `${percent}%`;
  if ($('completion-label')) $('completion-label').textContent = t('app.profile_complete_pct').replace('{percent}', String(percent));
}

function updateBioCount() {
  const bio = $('bio'), out = $('bio-count');
  if (bio && out) out.textContent = `${bio.value.length}/${bio.maxLength || 500}`;
}

// Interests are edited as chips; the comma-joined hidden input stays the single source of
// truth, so saveProfile and the preview keep reading the same field as before.
function interestList() {
  return ($('interests')?.value || '').split(',').map((value) => value.trim()).filter(Boolean);
}

function setInterests(values) {
  if ($('interests')) $('interests').value = values.join(', ');
  renderInterestChips();
}

function addInterest(raw) {
  const value = String(raw || '').trim().replace(/,+$/, '');
  if (!value) return;
  const list = interestList();
  // The server stores at most 12; the client enforces the same cap and says so, instead of
  // accepting a 13th interest that silently disappears on save.
  if (list.length >= 12) { showToast(t('app.interests_limit')); return; }
  if (list.some((item) => item.toLowerCase() === value.toLowerCase())) return;
  list.push(value);
  setInterests(list);
}

function removeInterest(value) {
  setInterests(interestList().filter((item) => item.toLowerCase() !== value.toLowerCase()));
}

function renderInterestChips() {
  const host = $('interests-chips');
  if (!host) return;
  host.innerHTML = interestList().map((value) =>
    `<span class="pf-interest">${escapeHtml(value)}<button type="button" class="pf-interest-x" data-interest="${escapeHtml(value)}" aria-label="${escapeHtml(t('app.remove'))}">×</button></span>`).join('');
  host.querySelectorAll('[data-interest]').forEach((button) => { button.onclick = () => removeInterest(button.dataset.interest); });
}

// The "Saved" pill in the Core Profile header, flashed after a successful save rather
// than permanently shown — a persistent badge would claim savedness between edits.
function flashSavedBadge() {
  const badge = $('saved-badge');
  if (!badge) return;
  badge.classList.add('show');
  clearTimeout(flashSavedBadge.timer);
  flashSavedBadge.timer = setTimeout(() => badge.classList.remove('show'), 2400);
}

function updateLanguageCount() {
  const out = $('languages-count');
  if (out) out.textContent = t('app.languages_chosen_count').replace('{chosen}', String(readLanguageChips('languages-list').length)).replace('{max}', String(MAX_LANGUAGES));
}

// The Edit / Settings & Privacy segmented switch. The form holds the editable fields, the
// settings panel everything else; values typed in the form survive the switch.
function setProfileTab(tab) {
  const tabEdit = $('tab-edit'), tabSettings = $('tab-settings');
  if (!tabEdit || !tabSettings) return;
  const edit = tab === 'edit';
  tabEdit.classList.toggle('active', edit);
  tabSettings.classList.toggle('active', !edit);
  tabEdit.setAttribute('aria-selected', String(edit));
  tabSettings.setAttribute('aria-selected', String(!edit));
  $('profile-form')?.classList.toggle('hidden', !edit);
  $('dating-photos-panel')?.classList.toggle('hidden', !edit);
  $('profile-settings-panel')?.classList.toggle('hidden', edit);
}

function renderAccount() {
  const account = state.account || {}, profile = account.profile || {};
  const name = profile.displayName || account.firstName || state.telegramUser?.first_name || t('app.bezy_member');
  // The member's own uploaded dating photo comes first: it is the one they chose to be seen
  // with, and the one other members see. The Telegram avatar is only the fallback.
  const photo = datingPhotoUrls[0] || account.photoUrl || state.telegramUser?.photo_url || '';
  if ($('my-name')) $('my-name').textContent = name;
  if ($('profile-status')) {
    $('profile-status').textContent = !account.profileComplete ? t('app.complete_profile')
      : account.discoverable ? t('app.profile_live') : t('app.profile_hidden');
  }
  if ($('display-name')) $('display-name').value = profile.displayName || account.firstName || '';
  if ($('age')) $('age').value = profile.age || '';
  if ($('city')) $('city').value = profile.city || '';
  // Never silently default to a stored value the user did not choose: an account without a
  // saved gender keeps the placeholder selected and cannot be saved until one is picked.
  if ($('gender')) $('gender').value = profile.gender || '';
  if ($('seeking')) $('seeking').value = profile.seeking || 'everyone';
  if ($('interests')) $('interests').value = Array.isArray(profile.interests) ? profile.interests.join(', ') : '';
  if ($('bio')) $('bio').value = profile.bio || '';
  renderPromptEditor(Array.isArray(profile.prompts) ? profile.prompts : []);
  languageChips('languages-list', Array.isArray(profile.languages) ? profile.languages : []);
  if ($('discoverable')) $('discoverable').checked = Boolean(profile.discoverable);
  if ($('my-avatar')) $('my-avatar').innerHTML = photo ? `<img src="${escapeHtml(photo)}" alt="">` : escapeHtml(name.charAt(0).toUpperCase() || 'B');
  // The hero status pill reflects the same three states as the text inside it: live in
  // Discover, complete but hidden, or incomplete.
  const pill = $('profile-status-pill');
  if (pill) {
    pill.classList.toggle('live', Boolean(account.discoverable));
    pill.classList.toggle('off', Boolean(account.profileComplete) && !account.discoverable);
    pill.classList.toggle('warn', !account.profileComplete);
  }
  updateProfileHero(); renderInterestChips(); updateBioCount();
  renderNotificationSettings();
  renderRestriction();
  renderObjection();
}

// ---------------------------------------------------------------------------
// Notification preferences
// These ids mirror the optional categories in api/_notify.js. They are machine tokens; the
// label comes from `notify_<id>`. Transactional messages — payment, refund, account events —
// are deliberately not represented here, because they are not the user's to switch off: they
// are the only record they get of something that happened to their money or their account.
// ---------------------------------------------------------------------------

const NOTIFICATION_CATEGORIES = ['matches', 'super_likes', 'profile_reminders', 'messages'];
const NOTIFICATION_NOTES = { super_likes: 'app.notify_super_likes_note', profile_reminders: 'app.notify_profile_reminders_note', messages: 'app.notify_messages_note' };

function renderNotificationSettings() {
  const host = $('notification-list');
  if (!host) return;
  const settings = state.notifications || {};
  host.innerHTML = NOTIFICATION_CATEGORIES.map((id) => {
    const note = NOTIFICATION_NOTES[id] ? `<small>${escapeHtml(t(NOTIFICATION_NOTES[id]))}</small>` : '';
    // Absent means on: an account that predates these settings is not silently muted.
    const checked = settings[id] === false ? '' : ' checked';
    return `<label class="notify-row"><span class="notify-text"><b>${escapeHtml(t(`app.notify_${id}`))}</b>${note}</span><input type="checkbox" data-notify="${escapeHtml(id)}"${checked}></label>`;
  }).join('');
  host.querySelectorAll('[data-notify]').forEach((input) => { input.onchange = saveNotifications; });
}

async function saveNotifications() {
  const next = {};
  document.querySelectorAll('#notification-list [data-notify]').forEach((input) => { next[input.dataset.notify] = input.checked; });
  try {
    const data = await api(API.profile, { body: { notifications: next } });
    state.notifications = data.notifications || next;
    showToast(t('app.notifications_saved'));
  } catch (error) {
    showToast(errorText(error));
    // The server is the authority on what is stored, so a failed save snaps the toggle back
    // rather than leaving the user believing a change took effect.
    renderNotificationSettings();
  }
}

function renderStats() {
  const stats = state.stats;
  if (!stats) { setText('people-count', '—'); setText('match-percent', '—'); setText('new-count', '—'); return; }
  setText('people-count', String(stats.available ?? 0));
  setText('match-percent', stats.bestMatch ? `${stats.bestMatch}%` : '—');
  setText('new-count', String(stats.newToday ?? 0));
  // The server computes the day's remaining actions; the UI says so quietly instead of
  // letting the user discover the wall by hitting it.
  const quota = state.quota;
  const note = $('quota-line');
  if (note) {
    const parts = [];
    if (quota && Number.isFinite(quota.limits?.discoveryActions)) parts.push(t('app.quota_likes_left').replace('{n}', String(quota.discoveryRemaining)));
    if (quota && Number.isFinite(quota.limits?.superLikes)) parts.push(t('app.quota_super_likes_left').replace('{n}', String(quota.superLikesRemaining)));
    note.textContent = parts.join(' · ');
  }
}

// Premium compatibility insight (PR-8): the deterministic score explained with the terms the
// card already shows. The server attaches `breakdown` to deck cards for Premium callers only,
// so the gate is the API, not the UI — free users simply never receive the field.
function breakdownHtml(breakdown) {
  const chips = [];
  if ((breakdown.sharedInterests || []).length) {
    chips.push(t('app.why_interests').replace('{values}', (breakdown.sharedInterests || []).slice(0, 3).map((value) => String(value)).join(', ')));
  }
  if ((breakdown.sharedLanguages || []).length) {
    chips.push(t('app.why_languages').replace('{values}', (breakdown.sharedLanguages || []).slice(0, 3).map(languageName).join(', ')));
  }
  if (breakdown.sharedCity) chips.push(t('app.why_city').replace('{values}', String(breakdown.sharedCity)));
  if (breakdown.closeInAge) chips.push(t('app.why_age'));
  return chips.map((chip) => `<span class="why-chip">${escapeHtml(chip)}</span>`).join('');
}

// One card renderer for both Discover and the profile preview, so what a user sees when
// previewing their own profile is literally the markup other people are served.
function profileCardHtml(profile, { actions = false } = {}) {
  const initial = (profile.displayName || 'B').charAt(0).toUpperCase();
  const image = profile.photoUrl ? `<img src="${escapeHtml(profile.photoUrl)}" alt="">` : '';
  const age = profile.age ? `, ${escapeHtml(profile.age)}` : '';
  const bioTranslation = profile.translations?.bio;
  const meta = [profile.city, bioTranslation ? bioTranslation.text : profile.bio].filter(Boolean).map(escapeHtml).join(' · ');
  const isNewChip = profile.isNew ? `<span class="tag tag-new">🆕 ${escapeHtml(t('app.new_today'))}</span>` : '';
  // One deck, one community: a card never says which network the person joined from.
  const tags = languageTags(profile.languages) + isNewChip
    + (profile.interests || []).slice(0, 5).map((interest) => `<span class="tag">${escapeHtml(interest)}</span>`).join('');
  // "Why this person?" for everyone, computed only from facts the card already shows —
  // shared interests, shared languages, same city. Premium viewers get the richer numeric
  // breakdown instead, so this line renders only for free users. The preview passes
  // { actions: false }, so it never renders there.
  const mine = state.account?.profile || {};
  const shares = [];
  // Shared cards carry no language, prompt or score data, so the "why" line is left to
  // them: a chip about a shared city would be the only honest one, and the source chip
  // already says where the card came from.
  if (actions && !profile.isShared && !profile.breakdown) {
    const myInterests = new Set((mine.interests || []).map((v) => String(v).toLowerCase()));
    const sharedInterests = (profile.interests || []).filter((v) => myInterests.has(String(v).toLowerCase()));
    if (sharedInterests.length) shares.push(t('app.why_interests').replace('{values}', sharedInterests.slice(0, 3).map((v) => String(v)).join(', ')));
    const sharedLanguages = (profile.languages || []).filter((id) => (mine.languages || []).includes(id));
    if (sharedLanguages.length) shares.push(t('app.why_languages').replace('{values}', sharedLanguages.slice(0, 3).map(languageName).join(', ')));
    if (mine.city && String(mine.city).trim().toLowerCase() === String(profile.city || '').trim().toLowerCase()) {
      shares.push(t('app.why_city').replace('{values}', String(profile.city)));
    }
  }
  const whyLine = shares.length ? `<div class="why-chips">${shares.map((text) => `<span class="why-chip">${escapeHtml(text)}</span>`).join('')}</div>` : '';
  const score = profile.compatibility ? `<div class="score">${escapeHtml(profile.compatibility)}% ${escapeHtml(t('app.match_score'))}</div>` : '';
  const breakdown = profile.breakdown ? `<div class="why-chips">${breakdownHtml(profile.breakdown)}</div>` : '';
  // A shared candidate has no Super Like on this side of the product, so the grid keeps
  // exactly the two decisions the shared API accepts and drops the third column with it.
  const actionsHtml = profile.isShared
    ? `<div class="actions" style="grid-template-columns:1fr 1.4fr"><button class="action pass" id="passBtn" type="button">✕ ${escapeHtml(t('app.pass'))}</button><button class="action like" id="likeBtn" type="button">♥ ${escapeHtml(t('app.like'))}</button></div>`
    : `<div class="actions"><button class="action pass" id="passBtn" type="button">✕ ${escapeHtml(t('app.pass'))}</button><button class="action super" id="superBtn" type="button">★ ${escapeHtml(t('app.super'))}</button><button class="action like" id="likeBtn" type="button">♥ ${escapeHtml(t('app.like'))}</button></div>`;
  const controls = actions ? actionsHtml : '';
  return `<article class="profile-card" id="profile-card"><div class="portrait">${image}${score}<div class="avatar-letter">${escapeHtml(initial)}</div><div class="portrait-overlay"></div><div class="profile-copy"><h2>${escapeHtml(profile.displayName || t('app.bezy_member'))}${age}</h2><div class="tr-group"><p class="tr-target" dir="auto">${meta || '💜 Bezy'}</p>${bioTranslation ? translationToggle(bioTranslation, profile.bio, profile.city) : ''}</div><div class="tags">${tags}</div>${whyLine}${breakdown}${actions ? `<button class="card-safety" id="deck-safety" type="button">${escapeHtml(t('app.safety_actions'))}</button>` : ''}</div></div>${profile.isShared ? '' : promptCardHtml(profile)}${controls}</article>`;
}

function renderDiscover() {
  const host = $('discover-content'); if (!host) return;
  renderStats();
  const profile = state.profiles[state.currentIndex];
  if (!profile) {
    // A paused account has an empty deck for a reason the user chose, so it says so — and says
    // which legal state is in force — rather than implying Bezy has run out of people.
    if (state.processingRestricted) {
      host.innerHTML = `<div class="restricted-notice"><b>${escapeHtml(t('app.restricted_badge'))}</b>${escapeHtml(t('app.restricted_notice'))}</div>`;
      return;
    }
    if (state.processingObjection) {
      host.innerHTML = `<div class="restricted-notice"><b>${escapeHtml(t('app.objection_badge'))}</b>${escapeHtml(t('app.objection_notice'))}</div>`;
      return;
    }
    // An honest zero-result deck: it says why and hands the decision back to the user.
    // Bezy never silently relaxes filters or recycles decided candidates to fill the deck.
    if (state.emptyReason === 'filters') {
      host.innerHTML = `<div class="empty"><p>${escapeHtml(t('app.empty_filters'))}</p><button class="ghost-btn" id="empty-adjust-filters" type="button">${escapeHtml(t('app.adjust_filters'))}</button><button class="ghost-btn" id="empty-reset-filters" type="button">${escapeHtml(t('app.reset_filters'))}</button></div>`;
      $('empty-adjust-filters').onclick = openFilters;
      $('empty-reset-filters').onclick = async () => {
        try { await savePreferences({ minAge: 18, maxAge: 100, city: '', sameCityOnly: false, languages: [] }); } catch { /* toast from savePreferences */ }
      };
      return;
    }
    if (state.emptyReason === 'pool') {
      host.innerHTML = `<div class="empty"><p>${escapeHtml(t('app.empty_pool'))}</p><button class="ghost-btn" id="empty-check-later" type="button">${escapeHtml(t('app.check_later'))}</button></div>`;
      $('empty-check-later').onclick = async () => { try { await loadDiscover(); } catch { /* error state already rendered */ } };
      return;
    }
    if (state.emptyReason === 'no_supply') {
      host.innerHTML = `<div class="empty"><p>${escapeHtml(t('app.empty_no_supply'))}</p><button class="ghost-btn" id="empty-check-later" type="button">${escapeHtml(t('app.check_later'))}</button></div>`;
      $('empty-check-later').onclick = async () => { try { await loadDiscover(); } catch { /* error state already rendered */ } };
      return;
    }
    if (state.emptyReason === 'eligibility') {
      // Says exactly what the caller's own profile is stored as, so the reason for an empty
      // deck is visible on the same screen — the caller's own values, never anyone else's.
      const own = state.account?.profile || {};
      const genderLabel = own.gender ? t(`app.${own.gender}`) : '';
      const seekingLabel = own.seeking ? t(`app.${own.seeking}`) : '';
      const youLine = genderLabel && seekingLabel
        ? `<p>${escapeHtml(t('app.empty_eligibility_you').replace('{gender}', genderLabel).replace('{seeking}', seekingLabel))}</p>`
        : '';
      host.innerHTML = `<div class="empty"><p>${escapeHtml(t('app.empty_eligibility'))}</p>${youLine}<button class="ghost-btn" id="empty-edit-profile" type="button">${escapeHtml(t('app.empty_eligibility_edit'))}</button><button class="ghost-btn" id="empty-check-later" type="button">${escapeHtml(t('app.check_later'))}</button></div>`;
      $('empty-edit-profile').onclick = () => showView('profile');
      $('empty-check-later').onclick = async () => { try { await loadDiscover(); } catch { /* error state already rendered */ } };
      return;
    }
    host.innerHTML = `<div class="empty">${escapeHtml(state.account?.profileComplete ? t('app.no_profiles') : t('app.complete_profile'))}</div>`;
    return;
  }
  host.innerHTML = profileCardHtml(profile, { actions: true });
  void (async () => {
    try {
      // A shared candidate's photos are media photos, served by id from the community
      // store. The initial-letter art stays the fallback, exactly as it does below.
      if (profile.isShared) {
        if (!profile.photoIds?.length) return;
        const blob = await (await media(`photos?id=${encodeURIComponent(profile.photoIds[0])}`)).blob();
        if (state.profiles[state.currentIndex]?.id !== profile.id) return;
        const portrait = host.querySelector('.portrait');
        if (!portrait) return;
        const sharedImage = document.createElement('img');
        const sharedUrl = URL.createObjectURL(blob);
        sharedImage.src = sharedUrl;
        sharedImage.alt = '';
        sharedImage.onload = () => URL.revokeObjectURL(sharedUrl);
        sharedImage.onerror = () => URL.revokeObjectURL(sharedUrl);
        portrait.querySelector('img')?.remove();
        portrait.prepend(sharedImage);
        return;
      }
      const { photos } = await (await media(`photos?provider=telegram&subject=${encodeURIComponent(profile.id)}`)).json();
      if (!photos?.length) return;
      const blob = await (await media(`photos?id=${encodeURIComponent(photos[0].id)}`)).blob();
      if (state.profiles[state.currentIndex]?.id !== profile.id) return;
      const portrait = host.querySelector('.portrait');
      if (!portrait) return;
      const image = document.createElement('img');
      const url = URL.createObjectURL(blob);
      image.src = url;
      image.alt = '';
      image.onload = () => URL.revokeObjectURL(url);
      image.onerror = () => URL.revokeObjectURL(url);
      portrait.querySelector('img')?.remove();
      portrait.prepend(image);
    } catch { /* Existing Telegram avatar remains the fallback. */ }
  })();
  bindTranslationToggles(host);
  // Safety is available on the deck too — block and report must not require a match.
  if ($('deck-safety')) $('deck-safety').onclick = () => openDeckSafety(profile);
  if ($('passBtn')) $('passBtn').onclick = () => actOnCurrent('pass');
  if ($('superBtn')) $('superBtn').onclick = () => actOnCurrent('super');
  if ($('likeBtn')) $('likeBtn').onclick = () => actOnCurrent('like');
}

/**
 * "How others see you" — the Discover card built from the user's own saved profile.
 *
 * It is rendered from what the profile form currently holds, not from a server round trip,
 * so it stays a preview and never writes anything. It deliberately shows only the fields
 * `api/discover.js` publishes: the Telegram @username and id are not part of a deck card
 * and so are absent here too, which is exactly the point the hint text makes.
 */
function openPreview() {
  const account = state.account || {};
  const saved = account.profile || {};
  if (!account.profileComplete) {
    openSheet(t('app.preview_title'), `<p class="filter-note" style="margin:0">${escapeHtml(t('app.preview_incomplete'))}</p>`);
    return;
  }
  const preview = {
    displayName: $('display-name')?.value.trim() || saved.displayName || account.firstName || '',
    age: Number($('age')?.value) || saved.age || null,
    city: $('city')?.value.trim() || saved.city || '',
    bio: $('bio')?.value.trim() || saved.bio || '',
    interests: ($('interests')?.value || '').split(',').map((value) => value.trim()).filter(Boolean),
    prompts: readPromptEditor(),
    languages: readLanguageChips('languages-list'),
    photoUrl: account.photoUrl || state.telegramUser?.photo_url || ''
  };
  openSheet(t('app.preview_title'), `${profileCardHtml(preview)}<p class="filter-note">${escapeHtml(t('app.preview_hint'))}</p>`);
}

async function loadDiscover() {
  if (!state.account?.profileComplete) { state.profiles = []; state.stats = null; renderDiscover(); return; }
  try {
    // `lang` carries the already-resolved viewer locale (explicit > Telegram > browser) so
    // the server attaches profile-content translations for the same language the UI shows.
    const data = await api(API.discover, { body: { lang: state.lang } });
    state.profiles = data.profiles || [];
    state.stats = data.stats || null;
    state.quota = data.quota || null;
    state.preferences = data.preferences || state.preferences;
    state.emptyReason = data.emptyReason ?? null;
    state.currentIndex = 0;
    // The community deck is additive and never blocks the Telegram deck: whatever it
    // returns (including nothing) is appended after the legacy profiles.
    await loadSharedCandidates();
    renderDiscover();
  } catch (error) {
    // A failed deck load is recoverable, not a dead end: the error names itself and offers
    // the one action that makes sense.
    const host = $('discover-content');
    if (host) host.innerHTML = `<div class="empty"><p>${escapeHtml(errorText(error))}</p><button class="ghost-btn" id="deck-retry" type="button">${escapeHtml(t('app.check_later'))}</button></div>`;
    const retry = $('deck-retry');
    if (retry) retry.onclick = () => { renderDiscover(); loadDiscover(); };
  }
}
// ---------------------------------------------------------------------------
// Shared community layer (Pi Network members and other Telegram members)
//
// Candidates arrive in the community's own shape and are mapped onto the legacy card shape
// once, here, so every renderer downstream stays exactly the renderer it already is. The
// layer is additive in both directions: a community failure leaves the Telegram deck, list
// and conversations untouched, and vice versa.
// ---------------------------------------------------------------------------

// Maps a candidate onto the deck-card shape the existing renderers already understand.
// `id` and `sharedId` carry the opaque member id (block/report target it); a shared match
// uses its own `matchId` for the conversation, set in socialMatchView below.
function sharedProfile(candidate) {
  return {
    id: candidate.id, sharedId: candidate.id, isShared: true, provider: candidate.provider,
    displayName: candidate.name, age: candidate.age, city: candidate.area, bio: candidate.bio,
    interests: candidate.interests || [], languages: [], gender: candidate.gender,
    hueA: candidate.hueA, hueB: candidate.hueB, photoIds: candidate.photoIds || [],
    translations: null, compatibility: null, breakdown: null, isNew: false
  };
}

// Appends the community's candidates AFTER the Telegram deck. A failure is a quiet flag and
// never an error state: the deck already in hand keeps working, and the user is never told
// about a service they did not ask for.
async function loadSharedCandidates() {
  try {
    const data = await social('discover');
    state.social.candidates = data.candidates || [];
    state.social.trouble = false;
  } catch {
    state.social.candidates = [];
    state.social.trouble = true;
    return;
  }
  for (const candidate of state.social.candidates) state.profiles.push(sharedProfile(candidate));
  // A deck that was empty only because the Telegram pool ran dry now has cards after all:
  // the empty state must describe what is actually on screen.
  if (state.social.candidates.length && (state.emptyReason === 'pool' || state.emptyReason === 'no_supply')) state.emptyReason = null;
  if (state.stats && state.social.candidates.length) state.stats.available = (Number(state.stats.available) || 0) + state.social.candidates.length;
}

async function actOnCurrent(action) {
  const profile = state.profiles[state.currentIndex]; if (!profile) return;
  // One action in flight at a time: a double tap must never fire two swipes whose second
  // response splices an un-actioned card out of the deck.
  if (state.swipeInFlight) return;
  state.swipeInFlight = true;
  try {
    // Shared cards decide through the community API. The two branches must never touch
    // each other: a shared card never reaches the legacy swipe endpoint, and a legacy card
    // never reaches the community one.
    if (profile.isShared) {
      const sharedResult = await social('decision', { method: 'POST', body: { target: profile.id, decision: action === 'pass' ? 'pass' : 'like' } });
      state.profiles.splice(state.currentIndex, 1);
      // Shared cards carry no compatibility or new-today data, so only availability moves.
      if (state.stats) state.stats.available = state.profiles.length;
      if (sharedResult.matched) {
        showToast(t('app.match_created'));
        await loadMatches();
        await loadSocialMatches();
        // No "why you matched" sheet: the community layer has no shared signals to explain,
        // so the toast is the whole moment rather than a sheet with nothing in it.
      }
      if (!state.profiles.length) {
        const host = $('discover-content');
        if (host) host.innerHTML = `<div class="loading">${escapeHtml(t('app.loading'))}</div>`;
        try { await loadDiscover(); } catch { renderDiscover(); }
        return;
      }
      renderDiscover();
      return;
    }
    const result = await api(API.swipe, { body: { targetId: profile.id, action } });
    state.profiles.splice(state.currentIndex, 1);
    // The stats describe the deck in hand, so they follow the swipe: availability falls,
    // and best/new are recomputed from the profiles still in front of the user.
    const remaining = state.profiles;
    if (state.stats) {
      state.stats.available = remaining.length;
      state.stats.bestMatch = remaining.length ? Math.max(...remaining.map((p) => Number(p.compatibility) || 0)) : 0;
      state.stats.newToday = remaining.filter((p) => p.isNew).length;
    }
    if (result.matched) {
      showToast(t('app.match_created'));
      await loadMatches();
      // Momentum: the match moment continues into "why you matched" and an easy first
      // move, instead of dropping back into the deck with just a toast. The sheet is
      // dismissible — the user always keeps agency.
      const fresh = state.matches.find((m) => m.id === profile.id);
      if (fresh) openStarters(fresh);
    }
    // The server pages the deck 20 at a time. Acting on the last card of a page must fetch
    // the next one — a dead-end empty state here would be a lie about the pool.
    if (!state.profiles.length) {
      const host = $('discover-content');
      if (host) host.innerHTML = `<div class="loading">${escapeHtml(t('app.loading'))}</div>`;
      try { await loadDiscover(); } catch { renderDiscover(); }
      return;
    }
    renderDiscover();
  } catch (error) {
    if (profile.isShared) {
      // The candidate is gone from the community's reality (decided elsewhere, blocked,
      // deleted): the deck advances exactly as it does for the legacy TARGET_NOT_FOUND,
      // because keeping the card would turn every tap into the same dead end.
      if (error.status === 404 || error.error === 'TARGET_NOT_FOUND') {
        state.profiles.splice(state.currentIndex, 1);
        if (state.stats) state.stats.available = state.profiles.length;
        if (!state.profiles.length) {
          try { await loadDiscover(); } catch { renderDiscover(); }
          return;
        }
        renderDiscover();
        return;
      }
      // Anything else is the community service being unavailable: the card stays so the
      // swipe can be retried, and the message says which service it was.
      showToast(st('shared_offline'));
      return;
    }
    // Hitting a daily limit is a moment for a calm explanation, not an uninvited
    // teleport into the Premium screen — the Premium card is already visible on this
    // very screen, so the toast is enough of a CTA.
    if (error.error === 'DISCOVERY_LIMIT_REACHED' || error.error === 'SUPER_LIKE_LIMIT_REACHED') {
      showToast(error.error === 'DISCOVERY_LIMIT_REACHED' ? t('app.discovery_limit') : t('app.super_like_limit'));
      return;
    }
    // The target is gone from the server's reality (paused, hidden, blocked, deleted):
    // keeping the card on screen would turn every tap into the same dead end. The deck
    // advances instead, exactly as if the swipe had succeeded.
    if (error.error === 'TARGET_NOT_FOUND') {
      state.profiles.splice(state.currentIndex, 1);
      if (state.stats) state.stats.available = state.profiles.length;
      if (!state.profiles.length) {
        try { await loadDiscover(); } catch { renderDiscover(); }
        return;
      }
      renderDiscover();
      return;
    }
    showToast(errorText(error));
  } finally {
    state.swipeInFlight = false;
  }
}

// ---------------------------------------------------------------------------
// Why you matched, and the openers derived from it
// Both read the same `sharedSignals` the backend attaches to a match, so the explanation
// and the suggestion can never describe different things. The API returns these only for
// mutual matches, which is what keeps them out of reach before both people have opted in.
// ---------------------------------------------------------------------------

function signalText(signal) {
  if (signal?.type === 'interests') {
    const values = (signal.values || []).map((value) => String(value)).join(', ');
    if (values) return t('app.why_interests').replace('{values}', values);
  }
  if (signal?.type === 'city') {
    const values = (signal.values || []).map((value) => String(value)).join(', ');
    if (values) return t('app.why_city').replace('{values}', values);
  }
  if (signal?.type === 'languages') {
    // Language ids are machine tokens; the display names come from the active catalogue.
    const names = (signal.values || []).map(languageName).filter(Boolean).join(', ');
    if (names) return t('app.why_languages').replace('{values}', names);
  }
  if (signal?.type === 'age') return t('app.why_age');
  return '';
}

function whyMatchedHtml(match) {
  const reasons = (match.sharedSignals || []).map(signalText).filter(Boolean);
  // A match with nothing in common is still a match: both people chose each other.
  const chips = (reasons.length ? reasons : [t('app.why_none')])
    .map((reason) => `<span class="why-chip">${escapeHtml(reason)}</span>`).join('');
  // Deliberately not a <b>: inside a match card the name is the only bold element, and a
  // second one both misleads assistive technology and makes ".match-info b" ambiguous.
  return `<div class="why-matched"><span class="why-label">${escapeHtml(t('app.why_matched'))}</span><div class="why-chips">${chips}</div></div>`;
}

function starterSuggestions(match) {
  const suggestions = [];
  for (const signal of match.sharedSignals || []) {
    if (signal?.type === 'interests') {
      for (const value of signal.values || []) suggestions.push(t('app.starter_interest').replace('{value}', String(value)));
    } else if (signal?.type === 'city' && (signal.values || []).length) {
      suggestions.push(t('app.starter_city').replace('{value}', String(signal.values[0])));
    } else if (signal?.type === 'languages' && (signal.values || []).length) {
      // A shared language is real common ground — a thread, not a compliment.
      suggestions.push(t('app.starter_languages').replace('{value}', languageName(signal.values[0]) || String(signal.values[0])));
    }
    if (suggestions.length >= 3) break;
  }
  // Every match gets usable openers. Contextual starters come first (only from factual
  // shared signals, never invented); the remaining slots — or the whole list when no
  // signal exists — are filled with neutral universal questions that claim no shared
  // fact. The "why you matched" section stays honest separately (why_none when empty).
  for (const key of ['app.starter_universal_1', 'app.starter_universal_2', 'app.starter_universal_3']) {
    if (suggestions.length >= 3) break;
    suggestions.push(t(key));
  }
  return suggestions.slice(0, 3);
}

// Telegram's in-app webview does not always grant the async clipboard, so fall back to a
// selection copy rather than leaving the button silently dead.
function copyText(value) {
  const fallback = () => {
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    document.body.removeChild(field);
    return copied;
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value)
      .then(() => showToast(t('app.starter_copied')))
      .catch(() => showToast(fallback() ? t('app.starter_copied') : t('app.error_generic')));
    return;
  }
  showToast(fallback() ? t('app.starter_copied') : t('app.error_generic'));
}

function openStarters(match) {
  const suggestions = starterSuggestions(match);
  const body = suggestions.map((suggestion, index) => `<div class="starter"><p>${escapeHtml(suggestion)}</p><div class="starter-actions"><button type="button" data-use="${index}">${escapeHtml(t('app.msg_use_this_message'))}</button><button type="button" data-starter="${index}">${escapeHtml(t('app.starter_copy'))}</button></div></div>`).join('');
  // Ways to start now offers three things: ask a question, use a starter, or play the
  // optional post-match game. The game is one more way in, never a replacement for the
  // starters — and never the first thing the sheet pushes.
  const game = `<button class="mf-action tot-entry" id="tot-play" type="button">✨ ${escapeHtml(t('app.tot_play'))}</button><p class="filter-note">${escapeHtml(t('app.tot_intro'))}</p>`;
  // The suggestion list is never empty: starterSuggestions falls back to the generic opener
  // when no shared signal yields one, so the sheet always gives the user something usable.
  openSheet(t('app.starters_title'), `${whyMatchedHtml(match)}<div class="starter-head">${escapeHtml(t('app.start_with'))}</div>${body}${game}<p class="filter-note">${escapeHtml(t('app.starters_hint'))}</p>`, (host) => {
    host.querySelectorAll('[data-starter]').forEach((button) => {
      button.onclick = () => copyText(suggestions[Number(button.dataset.starter)]);
    });
    host.querySelectorAll('[data-use]').forEach((button) => {
      button.onclick = () => { closeSheet(); useStarter(match, suggestions[Number(button.dataset.use)]); };
    });
    const play = host.querySelector('#tot-play');
    if (play) play.onclick = () => { closeSheet(); openGame(match); };
  });
}

// ---------------------------------------------------------------------------
// THIS OR THAT — the optional post-match conversation game
//
// It lives inside the conversation it belongs to: the entry point is Ways to start, the
// state is one compact card above the messages, and the round itself is an ordinary sheet.
// There are no points, no streaks, no timers and no compatibility score — five small
// questions, both people answer, and the answers become something to talk about.
//
// Everything the UI knows comes from the server: which questions are in the round, which of
// them the user has answered, and which are revealed. The counterpart's pick for a question
// the user has not answered is never in the payload at all, so there is nothing here to hide
// and nothing a devtools console could reveal.
// ---------------------------------------------------------------------------

const TOT_POLL_EVERY = 3; // conversation poll ticks (~12s) between round refreshes

function totLabel(questionId, option) { return t(`app.tot_q_${questionId}_${option}`); }
function totName(match) { return match?.displayName || t('app.bezy_member'); }

// "Results ready" is the moment the user has not looked yet; once they open the finished
// round it is simply "Completed". Device-local, like the conversation-opened marker — no
// new server state for a label.
function totSeenKey(roundId) { return `bezy-tot-seen-${roundId}`; }
function totSeen(roundId) { try { return localStorage.getItem(totSeenKey(roundId)) === '1'; } catch { return false; } }
function markTotSeen(roundId) { try { localStorage.setItem(totSeenKey(roundId), '1'); } catch { /* label only */ } }

function totDisplayState(round) {
  if (!round) return null;
  if (round.state !== 'completed') return round.state;
  return totSeen(round.roundId) ? 'completed' : 'results';
}

function totStateLabel(round, match) {
  const state = totDisplayState(round);
  if (state === 'your_turn') return t('app.tot_state_your_turn');
  if (state === 'waiting') return t('app.tot_state_waiting').replace('{name}', totName(match));
  if (state === 'results') return t('app.tot_state_results');
  return t('app.tot_state_completed');
}

function totActionLabel(round) {
  const state = totDisplayState(round);
  if (state === 'your_turn') return t('app.tot_answer');
  if (state === 'results') return t('app.tot_see_results');
  return t('app.tot_view');
}

// The conversation's own view of the game: one compact card, never five system messages.
// With no round it renders nothing at all — the entry point stays in Ways to start.
function renderGameCard() {
  const host = $('chat-game');
  const chat = state.chat;
  if (!host) return;
  const round = chat?.game?.round || null;
  // The round belongs to the Telegram conversation; a shared one has no round to show.
  if (!chat || !round || chat.locked || chat.unavailable || chat.match?.isShared) { host.innerHTML = ''; host.classList.add('hidden'); return; }
  const cardState = totDisplayState(round);
  host.classList.remove('hidden');
  host.innerHTML = `<div class="tot-card" role="group" aria-label="${escapeHtml(t('app.tot_title'))}">
    <div class="tot-card-copy"><span class="tot-card-title">✨ ${escapeHtml(t('app.tot_title'))}</span><span class="tot-card-state ${escapeHtml(cardState)}">${escapeHtml(totStateLabel(round, chat.match))}</span></div>
    <button class="tot-card-action" id="tot-open" type="button">${escapeHtml(totActionLabel(round))}</button>
  </div>`;
  const open = $('tot-open');
  if (open) open.onclick = () => openGame(chat.match);
}

// Reads the round for the open conversation. A failure leaves whatever is on screen alone:
// the game is optional, so it must never take a conversation down with it.
async function loadGameState() {
  const chat = state.chat;
  if (!chat || chat.locked || chat.unavailable) return;
  // This or That is a Telegram-conversation capability; there is no round to read for a
  // shared conversation, and nothing to ask the shared service either.
  if (chat.match?.isShared) return;
  try {
    const data = await api(API.messages, { body: { action: 'game_state', conversationId: chat.match.matchId } });
    if (state.chat !== chat) return;
    chat.game = { ...(chat.game || {}), round: data.round || null };
    renderGameCard();
    if (state.totSheetRound) renderGameSheet();
  } catch (error) {
    if (state.chat !== chat) return;
    // PREMIUM_REQUIRED and CONVERSATION_UNAVAILABLE are already rendered by the message
    // path; anything else is transient and the next tick retries.
    if (error.error === 'PREMIUM_REQUIRED' || error.error === 'CONVERSATION_UNAVAILABLE') {
      chat.game = { round: null };
      renderGameCard();
    }
  }
}

function openGame(match) {
  // The game belongs to the conversation, so opening it from a match card opens the
  // conversation first — there is no second place the round could live.
  if (!state.chat || state.chat.match?.id !== match.id) openChat(match);
  const round = state.chat?.game?.round || null;
  // Looking at a finished round is what turns "results ready" into "completed".
  if (round && round.state === 'completed') markTotSeen(round.roundId);
  // openSheet() clears the flag through closeSheet() on every exit path, so the sheet is
  // marked open only after the host has been rebuilt.
  openSheet(t('app.tot_title'), '<div id="tot-body"></div>', () => { state.totSheetRound = true; renderGameSheet(); });
  loadGameState();
}

function totRevealHtml(question, match) {
  if (question.revealed) {
    const mine = totLabel(question.id, question.mine);
    const theirs = totLabel(question.id, question.theirs);
    if (question.mine === question.theirs) {
      return `<p class="tot-reveal same">${escapeHtml(t('app.tot_same').replace('{choice}', mine))}</p>`;
    }
    // A difference is never framed as a failure: it is the interesting half of the game.
    return `<p class="tot-reveal different">${escapeHtml(t('app.tot_different').replace('{mine}', mine).replace('{name}', totName(match)).replace('{theirs}', theirs))}</p>
      <p class="tot-reveal-note">${escapeHtml(t('app.tot_different_note'))}</p>`;
  }
  if (question.mine) {
    return `<p class="tot-reveal pending">${escapeHtml(t('app.tot_waiting_question').replace('{name}', totName(match)))}</p>`;
  }
  return '';
}

function renderGameSheet({ focusOptions = false } = {}) {
  const body = $('tot-body');
  const chat = state.chat;
  if (!body || !chat) return;
  const round = chat.game?.round || null;
  const match = chat.match;

  if (!round) {
    body.innerHTML = `<p class="tot-intro">${escapeHtml(t('app.tot_intro'))}</p>
      <button class="save-btn" id="tot-start" type="button">${escapeHtml(t('app.tot_start'))}</button>
      <p class="filter-note">${escapeHtml(t('app.tot_optional_note'))}</p>`;
    const start = $('tot-start');
    if (start) start.onclick = () => startGameRound();
    return;
  }

  const total = round.questions.length;
  const current = round.questions.find((question) => !question.mine) || null;
  const answered = round.questions.filter((question) => question.mine);
  const sections = [];

  if (current) {
    const index = round.questions.indexOf(current) + 1;
    sections.push(`<p class="tot-progress">${escapeHtml(t('app.tot_progress').replace('{n}', String(index)).replace('{total}', String(total)))}</p>
      <div class="tot-options" role="group" aria-label="${escapeHtml(t('app.tot_progress').replace('{n}', String(index)).replace('{total}', String(total)))}">
        <button class="tot-option" type="button" data-question="${escapeHtml(current.id)}" data-choice="a">${escapeHtml(totLabel(current.id, 'a'))}</button>
        <button class="tot-option" type="button" data-question="${escapeHtml(current.id)}" data-choice="b">${escapeHtml(totLabel(current.id, 'b'))}</button>
      </div>
      <p class="filter-note">${escapeHtml(t('app.tot_final_note'))}</p>`);
  } else if (round.state === 'waiting') {
    sections.push(`<p class="tot-intro">${escapeHtml(t('app.tot_waiting_body').replace('{name}', totName(match)))}</p>`);
  }

  // The summary is a count of same and different picks, never a score and never a
  // percentage: what matters is that there is something to talk about.
  if (round.status === 'completed' && round.summary) {
    sections.push(`<div class="tot-summary"><span class="tot-summary-title">${escapeHtml(t('app.tot_title'))}</span>
      <span class="tot-summary-line">${escapeHtml(t('app.tot_summary_same').replace('{n}', String(round.summary.same)))}</span>
      <span class="tot-summary-line">${escapeHtml(t('app.tot_summary_different').replace('{n}', String(round.summary.different)))}</span></div>`);
  }

  const list = answered.map((question) => `<div class="tot-item">
      <p class="tot-item-q">${escapeHtml(totLabel(question.id, 'a'))} · ${escapeHtml(totLabel(question.id, 'b'))}</p>
      ${totRevealHtml(question, match)}
    </div>`).join('');
  if (list) sections.push(`<div class="tot-list">${list}</div>`);

  if (round.status === 'completed') {
    sections.push(`<button class="save-btn" id="tot-talk" type="button">${escapeHtml(t('app.tot_talk_about'))}</button>
      <button class="ghost-btn" id="tot-again" type="button">${escapeHtml(t('app.tot_new_round'))}</button>`);
  }

  body.innerHTML = sections.join('');
  body.querySelectorAll('[data-choice]').forEach((button) => {
    button.onclick = () => answerGameQuestion(button.dataset.question, button.dataset.choice);
  });
  // Answering replaces the sheet's contents, which would otherwise drop keyboard and
  // screen-reader focus on the floor. The next question takes it — without scrolling the
  // page out from under anyone.
  if (focusOptions) body.querySelector('.tot-option')?.focus({ preventScroll: true });
  const talk = $('tot-talk');
  if (talk) talk.onclick = () => { closeSheet(); state.totSheetRound = false; talkAboutRound(round, match); };
  const again = $('tot-again');
  if (again) again.onclick = () => startGameRound();
}

// "Talk about one" fills the composer — it never sends. A difference is the more interesting
// thing to ask about, so it is preferred; otherwise the first question of the round.
function talkAboutRound(round, match) {
  const pick = round.questions.find((question) => question.revealed && question.mine !== question.theirs)
    || round.questions.find((question) => question.revealed)
    || round.questions[0];
  if (!pick) return;
  useStarter(match, t('app.tot_talk_message')
    .replace('{a}', totLabel(pick.id, 'a'))
    .replace('{b}', totLabel(pick.id, 'b')));
}

// Starting is idempotent on the server, and the in-flight guard keeps a double tap from
// even reaching it twice.
async function startGameRound() {
  const chat = state.chat;
  if (!chat || chat.game?.inFlight) return;
  chat.game = { ...(chat.game || {}), inFlight: true };
  try {
    const data = await api(API.messages, { body: { action: 'game_start', conversationId: chat.match.matchId } });
    if (state.chat !== chat) return;
    chat.game = { round: data.round || null, inFlight: false };
    renderGameCard();
    renderGameSheet();
  } catch (error) {
    if (state.chat !== chat) return;
    chat.game = { ...(chat.game || {}), inFlight: false };
    showToast(errorText(error));
  }
}

async function answerGameQuestion(questionId, choice) {
  const chat = state.chat;
  // A round that vanished under the user (a new round started on the other device, an
  // expired membership) must never turn a tap into a crash.
  if (!chat || !chat.game?.round || chat.game.inFlight) return;
  chat.game = { ...(chat.game || {}), inFlight: true };
  try {
    const data = await api(API.messages, { body: { action: 'game_answer', conversationId: chat.match.matchId, roundId: chat.game.round.roundId, questionId, choice } });
    if (state.chat !== chat) return;
    chat.game = { round: data.round || null, inFlight: false };
    if (chat.game.round?.state === 'completed') markTotSeen(chat.game.round.roundId);
    renderGameCard();
    renderGameSheet({ focusOptions: true });
  } catch (error) {
    if (state.chat !== chat) return;
    chat.game = { ...(chat.game || {}), inFlight: false };
    // An answer that was already stored comes back with the round attached: the stored
    // answer stands and the sheet re-renders around it rather than losing the round.
    if (error.round) { chat.game = { round: error.round, inFlight: false }; renderGameCard(); renderGameSheet(); }
    showToast(errorText(error));
  }
}

// "Use this message" fills the Bezy composer with the opener. It never sends: the user
// reviews the text and taps send themselves.
function useStarter(match, text) {
  if (!state.chat || state.chat.match?.id !== match.id) openChat(match);
  const input = $('chat-draft');
  if (input) { input.value = text; updateChatSendState(); input.focus(); }
}

// ---------------------------------------------------------------------------
// Bezy conversation screen (ADR 0009)
// Real-time uses short polling while a conversation is open. Database access stays
// behind the authorized Vercel API, so polling is the
// smallest mechanism that fits the architecture. Sends are idempotent: the client-generated
// id is stable across retries and the API writes the message document under that id.
// ---------------------------------------------------------------------------

const CHAT_POLL_MS = 4000;
// The shared match list moves far more slowly than a conversation, and it is only a list:
// a slow refresh is enough for a Pi match's reply to appear in Telegram on its own.
const SOCIAL_POLL_MS = 15000;

function chatClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

// The conversation is a detail screen of the shell: the underlying view becomes Messages
// (so the nav highlight and the back control both land there), the layer clears the global
// bottom navigation, and the last loaded state is cached so closing and reopening does not
// throw the history away.
function updateChatNavClearance() {
  const nav = document.querySelector('.bottom');
  const screen = $('chat-screen');
  if (nav && screen) screen.style.setProperty('--bezy-nav-h', `${nav.offsetHeight}px`);
}

function openChat(match) {
  const screen = $('chat-screen');
  if (!screen || !match) return;
  stopChatPolling();
  const cached = state.chatCache.get(match.matchId) || null;
  // `unread` seeds the read-marking from the list's own snapshot; a counterpart message
  // arriving during polling flips it back on.
  state.chat = { match, messages: cached ? cached.messages : [], pending: cached ? cached.pending : new Map(), locked: false, unavailable: false, unread: Boolean(match.conversation?.unread), loadFailed: false, game: { round: null, inFlight: false }, lastSocialAt: 0 };
  // The previous conversation's messages must never sit under the new match's name: the
  // history area starts empty (loading) and renders only for the conversation being opened.
  const history = $('chat-messages');
  if (history) history.innerHTML = `<div class="chat-empty"><p>${escapeHtml(t('app.loading'))}</p></div>`;
  markChatOpened(match.matchId);
  setText('chat-name', match.displayName || t('app.bezy_member'));
  setText('chat-sub', [match.age ? String(match.age) : '', match.city].filter(Boolean).join(' · '));
  setText('chat-status', '');
  // A shared conversation carries no shared signals, so there is nothing for "Ways to
  // start" to suggest: the control is removed rather than left promising context that
  // does not exist. The legacy conversation keeps it, exactly as before.
  $('chat-starters-open')?.classList.toggle('hidden', Boolean(match.isShared));
  const why = $('chat-why');
  if (why) {
    if (match.isShared) {
      // Nothing to explain, so the strip is removed entirely instead of rendering empty.
      why.innerHTML = '';
      why.classList.add('hidden');
    } else {
      why.classList.remove('hidden');
      // Match context flows into the conversation — but stays out of the way. The "why you
      // matched" chips are one collapsible strip above the messages, dismissed with a tap.
      why.innerHTML = `<div class="chat-why-bar"><span>${escapeHtml(t('app.why_matched'))}</span><button type="button" class="chat-why-toggle" aria-label="${escapeHtml(t('app.close'))}">▾</button></div>${whyMatchedHtml(match)}`;
      const toggle = why.querySelector('.chat-why-toggle');
      if (toggle) toggle.onclick = () => why.classList.toggle('collapsed');
    }
  }
  const locked = $('chat-locked');
  if (locked) locked.classList.add('hidden');
  const composer = $('chat-composer');
  if (composer) composer.classList.remove('hidden');
  const draft = $('chat-draft');
  if (draft) draft.value = '';
  updateChatSendState();
  updateChatNavClearance();
  // The previous conversation's round must never render above this one's messages.
  renderGameCard();
  screen.classList.remove('hidden');
  showView('messages');
  loadChatMessages();
  loadGameState();
  startChatPolling();
}

function closeChat() {
  stopChatPolling();
  if (state.chat) {
    // The history (including any failed pending sends) survives the round trip to the list.
    state.chatCache.set(state.chat.match.matchId, { messages: state.chat.messages, pending: state.chat.pending });
  }
  const screen = $('chat-screen');
  if (screen) screen.classList.add('hidden');
  state.chat = null;
  renderMatches();
}

function updateChatSendState() {
  const send = $('chat-send');
  if (send) send.disabled = !$('chat-draft')?.value.trim() || state.chat?.locked || state.chat?.unavailable;
}

// Fetches the message history. Poll failures and transient errors leave whatever is on
// screen alone; the typed states (locked/unavailable) only render for their typed errors.
async function loadChatMessages() {
  const chat = state.chat;
  if (!chat) return;
  try {
    // A shared conversation is incremental: the API answers with everything newer than the
    // watermark, so the local history is extended rather than replaced — a poll can never
    // drop a message the user is reading.
    if (chat.match.isShared) {
      const data = await social(`messages?match=${encodeURIComponent(chat.match.matchId)}&after=${chat.lastSocialAt || 0}`);
      if (state.chat !== chat) return;
      chat.locked = false;
      chat.unavailable = false;
      const known = new Set(chat.messages.map((message) => message.id));
      for (const raw of data.messages || []) {
        const at = new Date(raw.at).getTime() || 0;
        if (at > (chat.lastSocialAt || 0)) chat.lastSocialAt = at;
        // The renderer decides sent/received by comparing the sender id with the viewer's,
        // so the counterpart is marked rather than invented.
        const message = { id: raw.id, senderId: raw.fromMe ? String(state.telegramUser?.id || '') : 'other', createdAt: raw.at, text: raw.text };
        if (known.has(message.id)) continue;
        known.add(message.id);
        chat.messages.push(message);
      }
      // The watermark is part of the signature, so a first arrival always repaints.
      const signature = JSON.stringify({
        ids: chat.messages.map((message) => message.id),
        at: chat.lastSocialAt || 0,
        pending: [...chat.pending.entries()].map(([id, p]) => `${id}:${p.failed}`).join('|')
      });
      if (signature !== chat.renderedSignature) {
        chat.renderedSignature = signature;
        renderChatMessages();
      }
      const myId = String(state.telegramUser?.id || '');
      const newest = chat.messages.length ? chat.messages[chat.messages.length - 1] : null;
      if (newest && newest.senderId !== myId && newest.id !== chat.lastSeenCounterpartId) {
        chat.unread = true;
        chat.lastSeenCounterpartId = newest.id;
      }
      if (chat.unread) markChatRead(newest?.createdAt || null);
      return;
    }
    const data = await api(API.messages, { body: { action: 'list', conversationId: chat.match.matchId } });
    if (state.chat !== chat) return;
    chat.locked = false;
    chat.unavailable = false;
    const next = data.messages || [];
    // The polling loop renders only when something actually changed — rebuilding the list
    // every tick would destroy scroll position and text selection for nothing.
    const signature = JSON.stringify({
      ids: next.map((m) => m.id),
      pending: [...chat.pending.entries()].map(([id, p]) => `${id}:${p.failed}`).join('|')
    });
    const changed = signature !== chat.renderedSignature;
    chat.messages = next;
    if (changed) {
      chat.renderedSignature = signature;
      renderChatMessages();
    }
    // A newly arrived counterpart message makes the conversation unread again; the read
    // watermark follows the newest message actually listed, so nothing lands under it
    // without ever being rendered.
    const myId = String(state.telegramUser?.id || '');
    const newest = next.length ? next[next.length - 1] : null;
    if (newest && newest.senderId !== myId && newest.id !== chat.lastSeenCounterpartId) {
      chat.unread = true;
      chat.lastSeenCounterpartId = newest.id;
    }
    if (chat.unread) markChatRead(newest?.createdAt || null);
  } catch (error) {
    if (state.chat !== chat) return;
    if (chat.match.isShared) {
      // There is no Premium gate on the shared conversation: the only terminal state is one
      // the server no longer offers (an unmatch, a block, a deleted counterpart).
      if (error.error === 'CONVERSATION_UNAVAILABLE' || error.status === 404) { chat.unavailable = true; renderChatUnavailable(); return; }
      if (!chat.messages.length) {
        // A failed FIRST load with nothing on screen says so instead of claiming the
        // conversation is empty; the poll keeps retrying behind the visible control.
        chat.loadFailed = true;
        const host = $('chat-messages');
        if (host) host.innerHTML = `<div class="chat-empty"><p>${escapeHtml(t('app.error_generic'))}</p><button class="chat-starters-btn" id="chat-load-retry" type="button">${escapeHtml(t('app.check_later'))}</button></div>`;
        const retry = $('chat-load-retry');
        if (retry) retry.onclick = () => loadChatMessages();
      }
      return;
    }
    if (error.error === 'PREMIUM_REQUIRED') { chat.locked = true; renderChatLocked(); }
    else if (error.error === 'CONVERSATION_UNAVAILABLE') { chat.unavailable = true; renderChatUnavailable(); }
    else if (!chat.messages.length) {
      // A failed FIRST load with nothing on screen says so instead of claiming the
      // conversation is empty; the poll keeps retrying behind the visible control.
      chat.loadFailed = true;
      const host = $('chat-messages');
      if (host) host.innerHTML = `<div class="chat-empty"><p>${escapeHtml(t('app.error_generic'))}</p><button class="chat-starters-btn" id="chat-load-retry" type="button">${escapeHtml(t('app.check_later'))}</button></div>`;
      const retry = $('chat-load-retry');
      if (retry) retry.onclick = () => loadChatMessages();
    }
    // RATE_LIMITED and network failures with content on screen: keep it; the poll retries.
  }
}

function chatMessageHtml(message, myId, failed) {
  const sent = String(message.senderId || '') === myId;
  const time = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString({ en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', ru: 'ru-RU', pl: 'pl-PL', ar: 'ar', tr: 'tr-TR', sw: 'sw', yo: 'yo', hi: 'hi-IN', id: 'id-ID', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR' }[state.lang] || 'en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';
  const retry = failed
    ? `<button class="msg-retry" type="button" data-retry="${escapeHtml(message.id)}">${escapeHtml(t('app.msg_retry'))}</button>`
    : '';
  return `<div class="msg ${sent ? 'sent' : 'received'}${failed ? ' failed' : ''}" data-message="${escapeHtml(message.id)}">${escapeHtml(message.text)}${time ? `<span class="msg-time">${escapeHtml(time)}</span>` : ''}${retry}</div>`;
}

function renderChatMessages() {
  const chat = state.chat;
  const host = $('chat-messages');
  if (!chat || !host) return;
  const myId = String(state.telegramUser?.id || '');
  // Reading history must never yank the user to the bottom: the position is preserved
  // unless they were already near the newest message (reading live).
  const nearBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 80;
  const scrollTop = host.scrollTop;
  const confirmed = new Set(chat.messages.map((message) => message.id));
  const rendered = new Set();
  const items = [];
  for (const message of chat.messages) {
    if (rendered.has(message.id)) continue; // the server never sends duplicates; stay defensive
    rendered.add(message.id);
    items.push(chatMessageHtml(message, myId, false));
  }
  // Pending sends render after the confirmed history; a failed send keeps its retry.
  for (const [clientId, pending] of chat.pending) {
    if (!confirmed.has(clientId) && !rendered.has(clientId)) {
      rendered.add(clientId);
      items.push(`<div class="msg sent ${pending.failed ? 'failed' : 'pending'}" data-message="${escapeHtml(clientId)}">${escapeHtml(pending.text)}${pending.failed ? `<button class="msg-retry" type="button" data-retry="${escapeHtml(clientId)}">${escapeHtml(t('app.msg_retry'))}</button>` : ''}</div>`);
    }
  }
  if (!items.length) {
    // A shared conversation has no starters to offer — there are no shared signals behind
    // them — so the empty state is the plain statement and nothing more.
    host.innerHTML = chat.match.isShared
      ? `<div class="chat-empty"><p>${escapeHtml(t('app.msg_no_messages'))}</p></div>`
      : `<div class="chat-empty"><p>${escapeHtml(t('app.msg_no_messages'))}</p><button class="chat-starters-btn" id="chat-starters" type="button">✨ ${escapeHtml(t('app.starters_title'))}</button></div>`;
    const starters = $('chat-starters');
    if (starters) starters.onclick = () => openStarters(chat.match);
    return;
  }
  host.innerHTML = items.join('');
  host.querySelectorAll('[data-retry]').forEach((button) => {
    button.onclick = () => {
      const pending = chat.pending.get(button.dataset.retry);
      if (!pending) return;
      pending.failed = false;
      renderChatMessages();
      deliverChatMessage(pending);
    };
  });
  host.scrollTop = nearBottom ? host.scrollHeight : scrollTop;
}

async function sendChat(rawText) {
  const chat = state.chat;
  const text = String(rawText || '').trim();
  if (!chat || !text || chat.locked || chat.unavailable) return;
  const pending = { clientId: chatClientId(), text, failed: false };
  chat.pending.set(pending.clientId, pending);
  renderChatMessages();
  const input = $('chat-draft');
  if (input) { input.value = ''; updateChatSendState(); }
  await deliverChatMessage(pending);
}

async function deliverChatMessage(pending) {
  const chat = state.chat;
  if (!chat || !chat.pending.has(pending.clientId)) return;
  try {
    if (chat.match.isShared) {
      // The client id is the same idempotency key the legacy send uses, and the community
      // API stores the message under it — a retry reconciles instead of duplicating.
      const data = await social('messages', { method: 'POST', body: { match: chat.match.matchId, clientId: pending.clientId, text: pending.text } });
      if (state.chat !== chat) return;
      chat.pending.delete(pending.clientId);
      if (data.message) {
        const at = new Date(data.message.at).getTime() || 0;
        if (at > (chat.lastSocialAt || 0)) chat.lastSocialAt = at;
        chat.messages.push({ id: data.message.id, senderId: String(state.telegramUser?.id || ''), createdAt: data.message.at, text: data.message.text });
      }
      renderChatMessages();
      // Sending reads your own conversation; the watermark follows the newest listed message.
      const sharedNewest = chat.messages.length ? chat.messages[chat.messages.length - 1] : null;
      markChatRead(sharedNewest?.createdAt || null);
      return;
    }
    const data = await api(API.messages, { body: { action: 'send', conversationId: chat.match.matchId, text: pending.text, clientId: pending.clientId } });
    if (state.chat !== chat) return;
    chat.pending.delete(pending.clientId);
    if (data.message) chat.messages.push(data.message);
    renderChatMessages();
    // Sending reads your own conversation; the watermark follows the newest listed message.
    const newest = chat.messages.length ? chat.messages[chat.messages.length - 1] : null;
    markChatRead(newest?.createdAt || null);
  } catch (error) {
    if (state.chat !== chat) return;
    if (chat.match.isShared) {
      // No Premium gate here: a 404 means the conversation is gone for good, anything else
      // (a rate limit included) keeps the message on screen with its retry.
      if (error.error === 'CONVERSATION_UNAVAILABLE' || error.status === 404) { chat.pending.clear(); chat.unavailable = true; renderChatUnavailable(); }
      else { pending.failed = true; renderChatMessages(); }
      return;
    }
    if (error.error === 'PREMIUM_REQUIRED') { chat.pending.clear(); chat.locked = true; renderChatLocked(); }
    else if (error.error === 'CONVERSATION_UNAVAILABLE') { chat.pending.clear(); chat.unavailable = true; renderChatUnavailable(); }
    else { pending.failed = true; renderChatMessages(); }
  }
}

function renderChatLocked() {
  const host = $('chat-locked');
  if (!host) return;
  const composer = $('chat-composer');
  if (composer) composer.classList.add('hidden');
  host.classList.remove('hidden');
  host.innerHTML = `<p>${escapeHtml(t('app.msg_premium_locked'))}</p><button class="save-btn" id="chat-unlock" type="button">${escapeHtml(t('app.unlock_premium'))}</button>`;
  const unlock = $('chat-unlock');
  if (unlock) unlock.onclick = () => { closeChat(); showView('premium'); };
  // The game is a capability of the conversation: when the conversation is locked it goes
  // with it, exactly as the composer does.
  renderGameCard();
  updateChatSendState();
}

function renderChatUnavailable() {
  setText('chat-status', t('app.msg_conversation_unavailable'));
  const composer = $('chat-composer');
  if (composer) composer.classList.add('hidden');
  // A block, an unmatch or a closed conversation takes the round off the screen too.
  renderGameCard();
  updateChatSendState();
}

function markChatRead(lastMessageAt) {
  const chat = state.chat;
  if (!chat || chat.locked || chat.unavailable) return;
  if (chat.match.isShared) {
    // The shared layer has no watermark to advance: reading is a per-conversation flag.
    social('messages', { method: 'POST', body: { match: chat.match.matchId, read: true } })
      .then(() => {
        if (state.chat !== chat) return;
        chat.unread = false;
        // The list behind this screen must agree, without waiting for the next poll.
        const match = state.social.matches.find((m) => m.id === chat.match.matchId);
        if (match) match.unread = false;
      })
      .catch(() => { /* the poll retries */ });
    return;
  }
  api(API.messages, { body: { action: 'read', conversationId: chat.match.matchId, lastMessageAt } })
    .then(() => {
      if (state.chat !== chat) return;
      chat.unread = false;
      // The Messages list behind this screen must agree: the unread badge and the
      // "waiting" state clear without waiting for the next /api/matches fetch.
      const match = state.matches.find((m) => m.id === chat.match.id);
      if (match?.conversation) match.conversation = { ...match.conversation, unread: false };
    })
    .catch(() => { /* the poll retries */ });
}

function startChatPolling() {
  stopChatPolling();
  state.chatPollTick = 0;
  state.chatPollTimer = setInterval(() => {
    if (!state.chat || document.hidden) return;
    loadChatMessages();
    // The round changes far more slowly than a conversation does, so it rides the same loop
    // at a third of the rate — and every tick while its sheet is actually open.
    state.chatPollTick += 1;
    if (state.totSheetRound || state.chatPollTick % TOT_POLL_EVERY === 0) loadGameState();
  }, CHAT_POLL_MS);
}

function stopChatPolling() {
  if (state.chatPollTimer) { clearInterval(state.chatPollTimer); state.chatPollTimer = null; }
}

// One full-width card per match: photo header, the why-you-matched chips, an icebreaker
// teaser drawn from their first answered prompt, and the three actions in the design's
// primary-to-tertiary order. The card keeps the `match-card` class and the `.match-info b`
// name element the e2e specs pin. Only the Matches grid draws it now — Messages uses the
// compact conversation row — so card ids need no prefix to stay unique.
function matchCardHtml(match) {
  const initial = (match.displayName || 'B').charAt(0).toUpperCase();
  const image = match.photoUrl ? `<img src="${escapeHtml(match.photoUrl)}" alt="">` : '';
  const age = match.age ? `, ${escapeHtml(match.age)}` : '';
  const city = match.city ? `<span class="mf-city"><span aria-hidden="true">📍</span>${escapeHtml(match.city)}</span>` : '';
  // The primary action opens the Bezy conversation screen — no Telegram handoff (ADR 0009).
  const chat = `<button class="mf-primary" data-open-chat="${escapeHtml(match.id)}" type="button">${escapeHtml(chatLabel(match))}</button>`;
  const firstPrompt = (match.prompts || []).find((prompt) => prompt?.id && String(prompt?.answer || '').trim());
  const icebreakerTranslation = firstPrompt ? match.translations?.[`prompt:${firstPrompt.id}`] : null;
  const icebreaker = firstPrompt
    ? `<div class="mf-icebreaker tr-group"><span class="mf-icebreaker-label">${escapeHtml(t('app.icebreaker_label').replace('{name}', match.displayName || t('app.bezy_member')))}</span><p class="tr-target" dir="auto">${escapeHtml(icebreakerTranslation ? icebreakerTranslation.text : firstPrompt.answer)}</p>${icebreakerTranslation ? translationToggle(icebreakerTranslation, firstPrompt.answer, '') : ''}</div>`
    : '';
  // The conversation preview for the Messages list: last message line and unread state.
  const preview = match.conversation?.lastMessagePreview
    ? `<p class="mf-preview${match.conversation.unread ? ' unread' : ''}">${match.conversation.unread ? '<span class="chat-badge" aria-hidden="true"></span>' : ''}${escapeHtml(match.conversation.lastMessagePreview)}</p>`
    : '';
  // One glanceable state per connection, derived only from facts Bezy already has:
  // NEW (no conversation yet), WAITING (their latest message is unread), QUIET (no
  // activity for a week). No timers, no pressure — an honest map of where things are.
  const lastAt = match.conversation?.lastMessageAt ? new Date(match.conversation.lastMessageAt).getTime() : 0;
  const quietForAWeek = lastAt > 0 && Date.now() - lastAt >= 7 * 86400000;
  const stateLabel = match.conversation?.unread
    ? `<span class="mf-state waiting">${escapeHtml(t('app.match_state_waiting'))}</span>`
    : (!lastAt
      ? `<span class="mf-state fresh">${escapeHtml(t('app.match_state_new'))}</span>`
      : (quietForAWeek ? `<span class="mf-state quiet">${escapeHtml(t('app.match_state_quiet'))}</span>` : ''));
  return `<article class="match-card" id="match-${escapeHtml(match.id)}">
    <div class="mf-photo">${image}<span class="mf-photo-glow" aria-hidden="true"></span>${image ? '' : `<span class="mf-initial" aria-hidden="true">${escapeHtml(initial)}</span>`}<span class="mf-photo-shade" aria-hidden="true"></span>
      <div class="mf-photo-info match-info"><b class="mf-name">${escapeHtml(match.displayName || t('app.bezy_member'))}${age}</b>${city}</div>
    </div>
    <div class="mf-body">
      ${whyMatchedHtml(match)}
      ${icebreaker}
      ${preview}
      ${stateLabel}
      <div class="mf-actions">
        ${chat}
        <button class="mf-action" data-starters="${escapeHtml(match.id)}" type="button">${escapeHtml(t('app.starters_title'))}</button>
        <button class="mf-action mf-safety" data-actions="${escapeHtml(match.id)}" type="button">${escapeHtml(t('app.safety_actions'))}</button>
      </div>
    </div>
  </article>`;
}

// The horizontal strip above the cards: avatar, name and how long ago the match happened.
// Each entry anchors to its card, so tapping one jumps to the full card.
function matchesCarouselHtml(matches) {
  return matches.map((match) => {
    const initial = (match.displayName || 'B').charAt(0).toUpperCase();
    const avatar = match.photoUrl ? `<img src="${escapeHtml(match.photoUrl)}" alt="">` : escapeHtml(initial);
    const when = relativeTime(match.matchedAt);
    return `<a class="mf-carousel-item" href="#match-${escapeHtml(match.id)}"><span class="mf-ring">${avatar}</span><span class="mf-carousel-name">${escapeHtml(match.displayName || t('app.bezy_member'))}</span><span class="mf-carousel-when">${escapeHtml(when)}</span></a>`;
  }).join('');
}

function bindChatOpeners(root) {
  root.querySelectorAll('[data-open-chat]').forEach((button) => {
    button.onclick = () => {
      const match = state.matches.find((m) => m.id === button.dataset.openChat);
      if (match) openChat(match);
    };
  });
}

/**
 * One conversation per row for the Messages tab: avatar, name, last message and timestamp,
 * with the unread badge on the preview. Each row is one tap from the conversation.
 */
function conversationRowHtml(match) {
  const initial = (match.displayName || 'B').charAt(0).toUpperCase();
  const avatar = match.photoUrl
    ? `<span class="conv-avatar"><img src="${escapeHtml(match.photoUrl)}" alt=""></span>`
    : `<span class="conv-avatar">${escapeHtml(initial)}</span>`;
  const unread = match.conversation?.unread === true;
  const preview = match.conversation?.lastMessagePreview
    ? `<p class="mf-preview${unread ? ' unread' : ''}">${unread ? '<span class="chat-badge" aria-hidden="true"></span>' : ''}${escapeHtml(match.conversation.lastMessagePreview)}</p>`
    : '';
  const lastAt = match.conversation?.lastMessageAt ? new Date(match.conversation.lastMessageAt).getTime() : 0;
  return `<button class="conversation conversation-btn" type="button" data-open-chat="${escapeHtml(match.id)}">
    ${avatar}
    <span class="conv-main"><b>${escapeHtml(match.displayName || t('app.bezy_member'))}</b>${preview}</span>
    <span class="time">${escapeHtml(relativeTime(lastAt || match.createdAt))}</span>
  </button>`;
}

function renderMatches() {
  const grid = $('match-grid'), empty = $('matches-empty'), conversations = $('conversation-list'), messageEmpty = $('message-empty'), carousel = $('matches-carousel');
  if (!grid || !empty || !conversations || !messageEmpty) return;
  setText('match-count', String(state.matches.length));
  if (state.matchesError && !state.matches.length) {
    // The fetch failed: say so instead of claiming there are no matches. One retry control,
    // written into both lists so neither tab goes blank.
    const failure = `<p>${escapeHtml(t('app.error_generic'))}</p>`;
    grid.innerHTML = '';
    empty.innerHTML = `${failure}<button class="ghost-btn" id="matches-retry" type="button">${escapeHtml(t('app.check_later'))}</button>`;
    empty.classList.remove('hidden');
    conversations.innerHTML = `${failure}<button class="ghost-btn" id="messages-retry" type="button">${escapeHtml(t('app.check_later'))}</button>`;
    messageEmpty.classList.add('hidden');
    if (carousel) carousel.innerHTML = '';
    $('matches-retry').onclick = () => loadMatches();
    $('messages-retry').onclick = () => loadMatches();
    renderSocialMatches();
    return;
  }
  if (!state.matches.length) { grid.innerHTML = ''; empty.textContent = t('app.no_matches'); empty.classList.remove('hidden'); conversations.innerHTML = ''; messageEmpty.classList.remove('hidden'); if (carousel) carousel.innerHTML = ''; renderSocialMatches(); return; }
  empty.classList.add('hidden');
  if (carousel) carousel.innerHTML = matchesCarouselHtml(state.matches);
  grid.innerHTML = state.matches.map(matchCardHtml).join('');
  bindTranslationToggles(grid);
  bindChatOpeners(grid);
  grid.querySelectorAll('[data-starters]').forEach((button) => {
    button.onclick = () => {
      const match = state.matches.find((m) => m.id === button.dataset.starters);
      if (match) openStarters(match);
    };
  });
  grid.querySelectorAll('[data-actions]').forEach((button) => {
    button.onclick = () => {
      const match = state.matches.find((m) => m.id === button.dataset.actions);
      if (match) openMatchActions(match);
    };
  });
  // Messages lists conversations, not matches: one compact row each, so the tab answers
  // "who has written to me" instead of repeating the Matches grid. Starters and the match
  // actions stay on the card in Matches, where there is room for them.
  conversations.innerHTML = state.matches.map(conversationRowHtml).join('');
  messageEmpty.classList.add('hidden');
  bindChatOpeners(conversations);
  renderSocialMatches();
}

// ---------------------------------------------------------------------------
// Shared community matches (Pi Network members)
//
// The section lives in its own container inside the Matches view, so the legacy grid and
// carousel keep rendering exactly as they do today and nothing here can be wiped by a later
// renderMatches(). Rows are rebuilt only when the visible facts change — a rebuild would
// otherwise throw away the object URLs behind the avatars on every poll.
// ---------------------------------------------------------------------------

function clearSocialPhotoUrls() {
  state.socialPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  state.socialPhotoUrls = [];
}

// A shared match shaped the way the conversation screen expects a match to be. `matchId` is
// the conversation the community API speaks in; `sharedId` is the counterpart's member id,
// which block and report target. A deleted counterpart still gets a row — a fallback name,
// no photo, and a conversation the server answers with CONVERSATION_UNAVAILABLE.
function socialMatchView(match) {
  const counterpart = match.counterpart || null;
  return {
    id: match.id, matchId: match.id, isShared: true, sharedId: counterpart?.id || null,
    displayName: counterpart?.name || '', age: counterpart?.age || null,
    city: counterpart?.area || '', photoIds: counterpart?.photoIds || [],
    conversation: { unread: Boolean(match.unread) }
  };
}

function socialMatchRowHtml(match) {
  const view = socialMatchView(match);
  const last = match.lastMessage || null;
  const initial = (view.displayName || 'B').charAt(0).toUpperCase();
  const avatar = view.photoIds.length
    ? `<div class="conv-avatar" data-shared-photo="${escapeHtml(view.photoIds[0])}">${escapeHtml(initial)}</div>`
    : `<div class="conv-avatar">${escapeHtml(initial)}</div>`;
  // Who spoke last is part of reading the list at a glance, so the viewer's own message is
  // marked — the same way the server marks it on the Telegram side.
  const preview = last
    ? `<p class="mf-preview${match.unread ? ' unread' : ''}">${match.unread ? '<span class="chat-badge" aria-hidden="true"></span>' : ''}${escapeHtml(last.fromMe ? `${st('you_prefix')}${last.text}` : String(last.text || ''))}</p>`
    : '';
  return `<button class="conversation conversation-btn" type="button" data-shared-chat="${escapeHtml(match.id)}">
    ${avatar}
    <div class="conv-main"><b>${escapeHtml(view.displayName || t('app.bezy_member'))}</b><p>${escapeHtml(view.city)}</p>${preview}</div>
    <span class="time">${escapeHtml(relativeTime(last?.at || match.createdAt))}</span>
  </button>`;
}

// Photos arrive after the rows do, so the list paints immediately and the initial letter is
// the fallback if the photo cannot be read. A row rebuilt while its photo was in flight is
// simply skipped — its URL is never created, so nothing leaks.
async function hydrateSocialAvatar(node) {
  try {
    const blob = await (await media(`photos?id=${encodeURIComponent(node.dataset.sharedPhoto)}`)).blob();
    if (!node.isConnected) return;
    const url = URL.createObjectURL(blob);
    state.socialPhotoUrls.push(url);
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    node.replaceChildren(image);
  } catch { /* The initial letter remains. */ }
}

function renderSocialMatches() {
  const host = $('social-matches');
  if (!host) return;
  const matches = state.social.matches || [];
  if (!matches.length) {
    // An absent community section is not an empty state: the view is left exactly as the
    // legacy renderer drew it, and a section that went away is removed.
    if (state.socialSignature) { state.socialSignature = ''; clearSocialPhotoUrls(); host.innerHTML = ''; }
    return;
  }
  // "No matches yet" must never sit under a list that has matches.
  $('matches-empty')?.classList.add('hidden');
  const signature = JSON.stringify(matches.map((m) => [m.id, Boolean(m.unread), m.counterpart?.name || '', m.lastMessage?.text || '', m.lastMessage?.fromMe === true, m.lastMessage?.at || '']));
  if (signature === state.socialSignature) return;
  state.socialSignature = signature;
  clearSocialPhotoUrls();
  // No section header and no source label: Bezy is one community, and a match from one
  // network is not a different kind of match from a match on the other.
  host.innerHTML = matches.map(socialMatchRowHtml).join('');
  host.querySelectorAll('[data-shared-chat]').forEach((row) => {
    row.onclick = () => {
      const match = state.social.matches.find((m) => m.id === row.dataset.sharedChat);
      if (match) openChat(socialMatchView(match));
    };
  });
  for (const node of host.querySelectorAll('[data-shared-photo]')) hydrateSocialAvatar(node);
}

// Loaded on every matches render, on demand after a decision, and on the slow poll below —
// never allowed to raise: the community service being down is a flag, not an error screen.
async function loadSocialMatches() {
  try {
    const data = await social('matches');
    state.social.matches = data.matches || [];
    state.socialLoaded = true;
    state.social.trouble = false;
  } catch {
    state.social.trouble = true;
  }
  renderSocialMatches();
}
// ---------------------------------------------------------------------------
// Bezy Premium
// The Mini App only ever displays membership state returned by the backend. It never
// marks the user Premium itself, and prices always come from the server.
// ---------------------------------------------------------------------------

const BENEFIT_KEYS = { who_liked_you: 'app.benefit_who_liked_you', advanced_discovery: 'app.benefit_advanced_discovery', more_super_likes: 'app.benefit_more_super_likes', increased_visibility: 'app.benefit_increased_visibility', unlimited_discovery: 'app.benefit_unlimited_discovery', messaging: 'app.benefit_messaging' };

function benefitList() {
  return `<ul class="benefits">${(state.premium?.benefits || Object.keys(BENEFIT_KEYS))
    .map((key) => `<li><span class="tick">✓</span><b>${escapeHtml(t(BENEFIT_KEYS[key] || key))}</b></li>`).join('')}</ul>`;
}

function formatDate(iso) {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat(state.lang || 'en', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)); }
  catch { return String(iso).slice(0, 10); }
}

function planLabel(id) { return t(`app.plan_${id}`); }

function renderPremium() {
  const host = $('premium-content');
  if (!host) return;
  const data = state.premium;
  if (!data) { host.innerHTML = `<div class="loading">${escapeHtml(t('app.loading'))}</div>`; return; }
  const membership = data.premium || { active: false };

  if (membership.active) {
    host.innerHTML = `
      <div class="premium-hero"><h2>💎 ${escapeHtml(t('app.premium_title'))}</h2><p>${escapeHtml(t('app.premium_active_intro'))}</p>${benefitList()}</div>
      <div class="membership">
        <div class="kv"><span>${escapeHtml(t('app.plan'))}</span><b>${escapeHtml(planLabel(membership.planId))}</b></div>
        <div class="kv"><span>${escapeHtml(t('app.active_until'))}</span><b>${escapeHtml(formatDate(membership.expiresAt))}</b></div>
        <div class="kv"><span>${escapeHtml(t('app.days_remaining'))}</span><b>${escapeHtml(membership.daysRemaining)}</b></div>
      </div>
      <div class="settings-card"><h3>${escapeHtml(t('app.who_liked_you'))}</h3><div id="likers-host"></div></div>
      <div class="settings-card"><h3>${escapeHtml(t('app.renew'))}</h3>${planCards(data.plans)}<button class="save-btn" id="premium-buy" type="button">${escapeHtml(t('app.renew_with_stars'))}</button><p class="quota-note">${escapeHtml(t('app.stars_needed'))}</p></div>`;
  } else {
    // A member whose Premium lapsed or was refunded previously saw the same screen as
    // someone who never subscribed, with no explanation of what happened.
    const lapsed = membership.revoked
      ? t('app.premium_revoked')
      : (membership.expiresAt && new Date(membership.expiresAt) <= new Date() ? t('app.premium_expired') : '');
    host.innerHTML = `
      ${lapsed ? `<div class="lapsed-notice"><b>${escapeHtml(lapsed)}</b>${escapeHtml(t('app.premium_lapsed_hint'))}</div>` : ''}
      <div class="premium-hero"><h2>💎 ${escapeHtml(t('app.premium_title'))}</h2><p>${escapeHtml(t('app.premium_intro'))}</p>${benefitList()}</div>
      <div class="settings-card"><h3>${escapeHtml(t('app.choose_plan'))}</h3>${planCards(data.plans)}<button class="save-btn" id="premium-buy" type="button">${escapeHtml(t('app.subscribe_with_stars'))}</button>
      <p class="quota-note">${escapeHtml(t('app.stars_needed'))}</p>
      <p class="quota-note">${escapeHtml(t('app.stars_note'))}</p>
      <p class="quota-note">${escapeHtml(t('app.not_telegram_premium'))}</p></div>
      <div class="settings-card"><h3>${escapeHtml(t('app.who_liked_you'))}</h3><div id="likers-host"></div></div>`;
  }

  host.querySelectorAll('[data-plan]').forEach((button) => {
    button.onclick = () => { state.selectedPlan = button.dataset.plan; renderPremium(); };
  });
  if ($('premium-buy')) {
    // While a payment is still processing, the buy button becomes a status check: buying
    // again would double-charge Stars for the same moment of doubt.
    $('premium-buy').onclick = state.premiumCheckPending ? refreshPremiumUntilActive : startCheckout;
    if (state.premiumCheckPending) $('premium-buy').textContent = t('app.check_payment_status');
  }
  renderLikers();
}

function planCards(plans = []) {
  if (!plans.length) return `<div class="empty">${escapeHtml(t('app.error_generic'))}</div>`;
  if (!plans.some((plan) => plan.id === state.selectedPlan)) state.selectedPlan = plans[0].id;
  return `<div class="plan-list">${plans.map((plan) => `
    <button class="plan ${plan.id === state.selectedPlan ? 'selected' : ''}" data-plan="${escapeHtml(plan.id)}" type="button">
      <span><span class="plan-name">${escapeHtml(planLabel(plan.id))}${plan.bestValue ? `<span class="badge">${escapeHtml(t('app.best_value'))}</span>` : ''}</span>
      <span class="plan-sub">${escapeHtml(t('app.months_count').replace('{n}', plan.durationMonths))}</span></span>
      <span class="plan-price">${escapeHtml(plan.stars)} ⭐</span>
    </button>`).join('')}</div>`;
}

function renderLikers() {
  const host = $('likers-host');
  if (!host) return;
  if (state.likesError) {
    host.innerHTML = `<div class="empty"><p>${escapeHtml(t('app.error_generic'))}</p><button class="ghost-btn" id="likes-retry" type="button">${escapeHtml(t('app.check_later'))}</button></div>`;
    $('likes-retry').onclick = () => loadLikes();
    return;
  }
  if (!state.premium?.premium?.active) {
    const count = state.likeCount || 0;
    host.innerHTML = `<div class="locked"><b>🔒 ${escapeHtml(count ? t('app.likes_waiting').replace('{n}', count) : t('app.who_liked_you'))}</b>${escapeHtml(t('app.who_liked_you_locked'))}</div>`;
    return;
  }
  const likes = state.likes || [];
  if (!likes.length) { host.innerHTML = `<div class="empty">${escapeHtml(t('app.no_likes_yet'))}</div>`; return; }
  host.innerHTML = `<div class="liker-list">${likes.map((liker) => {
    const initial = (liker.displayName || 'B').charAt(0).toUpperCase();
    const photo = liker.photoUrl ? `<img src="${escapeHtml(liker.photoUrl)}" alt="">` : escapeHtml(initial);
    return `<article class="liker"><div class="liker-photo">${photo}</div><div class="liker-info">
      <b>${escapeHtml(liker.displayName || t('app.bezy_member'))}${liker.age ? `, ${escapeHtml(liker.age)}` : ''}</b>
      <span class="plan-sub">${escapeHtml(liker.city || '')}</span>
      <div class="liker-actions"><button class="pass" data-liker-pass="${escapeHtml(liker.id)}" type="button">${escapeHtml(t('app.pass'))}</button><button class="like" style="background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff" data-liker-like="${escapeHtml(liker.id)}" type="button">${escapeHtml(t('app.like'))}</button></div>
    </div></article>`;
  }).join('')}</div>`;
  host.querySelectorAll('[data-liker-like]').forEach((b) => { b.onclick = () => respondToLiker(b.dataset.likerLike, 'like'); });
  host.querySelectorAll('[data-liker-pass]').forEach((b) => { b.onclick = () => respondToLiker(b.dataset.likerPass, 'pass'); });
}

// Reuses the existing swipe endpoint, so a like from here creates a match through exactly
// the same mutual-like logic as Discover.
async function respondToLiker(targetId, action) {
  try {
    const result = await api(API.swipe, { body: { targetId, action } });
    state.likes = (state.likes || []).filter((liker) => liker.id !== targetId);
    // The same person is now decided: they must not reappear in the Discover deck either,
    // or the user would be offered a profile they just acted on.
    const deckIndex = state.profiles.findIndex((p) => p.id === targetId);
    if (deckIndex >= 0) state.profiles.splice(deckIndex, 1);
    renderLikers();
    if (result.matched) {
      showToast(t('app.match_created'));
      await loadMatches();
      // Same Momentum beat as the deck: the match flows straight into why + first move.
      const fresh = state.matches.find((m) => m.id === targetId);
      if (fresh) openStarters(fresh);
    }
  } catch (error) {
    showToast(errorText(error));
  }
}

async function loadPremium() {
  try {
    state.premium = await api(API.premium, { body: { action: 'status' } });
  } catch (error) {
    const host = $('premium-content');
    if (host) host.innerHTML = `<div class="empty">${escapeHtml(errorText(error))}</div>`;
    return;
  }
  renderPremium();
  renderPremiumSurfaces();
  await loadLikes();
}

// The promotional Premium cards on Discover and Matches render by the one entitlement
// source — state.premium, loaded from the backend — never by a client-side guess. An active
// member sees their membership status and "View membership" instead of an "Unlock Premium"
// pitch; expired or revoked memberships read as free, exactly like the server does.
function premiumActive() { return state.premium?.premium?.active === true; }

function renderPremiumSurfaces() {
  const active = premiumActive();
  document.querySelectorAll('.premium-action').forEach((node) => { node.textContent = t(active ? 'app.view_membership' : 'app.unlock_premium'); });
  setText('premium-copy', t(active ? 'app.premium_active_intro' : 'app.premium_copy'));
  setText('matches-premium-copy', t(active ? 'app.premium_active_intro' : 'app.matches_premium_copy'));
  setText('matches-premium-title', active ? t('app.premium_active') : `💎 ${t('app.more_connections')}`);
}

async function loadLikes() {
  try {
    const data = await api(API.likes);
    state.likes = data.likes || [];
    state.likeCount = data.likeCount || 0;
    state.likesError = false;
  } catch (error) {
    if (error.error === 'PREMIUM_REQUIRED') {
      // A free member is expected to be refused here; the count is still shown as a teaser.
      state.likes = [];
      state.likeCount = error.likeCount || 0;
      state.likesError = false;
    } else {
      // A real failure must not read as "no one is waiting" or "0 people liked you".
      state.likesError = true;
    }
  }
  renderLikers();
}

async function startCheckout() {
  const button = $('premium-buy');
  if (button) { button.disabled = true; button.textContent = t('app.preparing_checkout'); }
  try {
    const { invoiceLink } = await api(API.premium, { body: { action: 'invoice', planId: state.selectedPlan } });
    if (!invoiceLink) throw new Error(t('app.payment_failed'));
    if (!tg?.openInvoice) { showToast(t('app.payment_unsupported')); return; }
    // The sheet callback is asynchronous: the screen must not re-render from stale state
    // while the status poll below is still running, so every render happens inside the
    // callback after the poll settles.
    tg.openInvoice(invoiceLink, async (status) => {
      if (button) button.disabled = false;
      if (status === 'paid') {
        showToast(t('app.payment_received'));
        // Telegram reporting "paid" is not proof of entitlement: the backend activates
        // Premium from the webhook, so the app re-reads authoritative membership state.
        await refreshPremiumUntilActive();
        return;
      }
      if (status === 'pending') {
        // "Pending" is not a failure — the webhook may still land. The same authoritative
        // poll runs, and a give-up leaves a status-check button instead of a dead screen.
        showToast(t('app.payment_pending'));
        await refreshPremiumUntilActive();
        return;
      }
      if (status === 'cancelled') showToast(t('app.payment_cancelled'));
      else if (status === 'failed') showToast(t('app.payment_failed'));
      renderPremium();
    });
  } catch (error) {
    showToast(error.error === 'INVALID_PLAN' ? t('app.error_generic') : t('app.payment_failed'));
    if (button) button.disabled = false;
  }
}

// The webhook may land a moment after Telegram closes the payment sheet, so membership is
// re-read a few times before giving up rather than assuming success or failure.
async function refreshPremiumUntilActive(attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const data = await api(API.premium, { body: { action: 'status' } });
      state.premium = data;
      if (data.premium?.active) {
        state.premiumCheckPending = false;
        renderPremium();
        renderPremiumSurfaces();
        await loadLikes();
        showToast(t('app.premium_active'));
        return true;
      }
    } catch { /* retried below */ }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  // The payment may still land: the buy control turns into a status check instead of
  // re-offering a second charge.
  state.premiumCheckPending = true;
  renderPremium();
  showToast(t('app.payment_processing'));
  return false;
}

// ---------------------------------------------------------------------------
// Safety and privacy: block, report, unmatch, data export, account deletion.
// Every one of these is enforced by the API; the UI is only the entry point.
// ---------------------------------------------------------------------------

function openMatchActions(match) {
  openSheet(match.displayName || t('app.bezy_member'), `
    <p class="filter-note" style="margin-bottom:10px">${escapeHtml(t('app.closure_hint'))}</p>
    <button class="ghost-btn" data-act="unmatch">${escapeHtml(t('app.unmatch'))}</button>
    <button class="ghost-btn" data-act="block">${escapeHtml(t('app.block'))}</button>
    <button class="ghost-btn" data-act="report" style="color:var(--danger)">${escapeHtml(t('app.report'))}</button>
    <p class="filter-note">${escapeHtml(t('app.safety_sheet_note'))}</p>
  `, (host) => {
    host.querySelector('[data-act="unmatch"]').onclick = () => confirmAction('unmatch', match);
    host.querySelector('[data-act="block"]').onclick = () => confirmAction('block', match);
    host.querySelector('[data-act="report"]').onclick = () => openReportSheet(match);
  });
}

// The same safety sheet for someone the user has NOT matched with (from Discover): block
// and report must not require a match — "block or report anyone who makes you
// uncomfortable" is the copy's own promise. Unmatch is a match-only action and is absent.
function openDeckSafety(profile) {
  // A shared card gets the same two actions, enforced by the community service instead of
  // the Telegram one; the sheet itself is identical.
  if (profile.isShared) {
    openSheet(profile.displayName || t('app.bezy_member'), `
      <button class="ghost-btn" data-act="block">${escapeHtml(t('app.block'))}</button>
      <button class="ghost-btn" data-act="report" style="color:var(--danger)">${escapeHtml(t('app.report'))}</button>
      <p class="filter-note">${escapeHtml(t('app.safety_sheet_note'))}</p>
    `, (host) => {
      host.querySelector('[data-act="block"]').onclick = () => confirmAction('block', profile);
      host.querySelector('[data-act="report"]').onclick = () => openSharedReportSheet(profile);
    });
    return;
  }
  openSheet(profile.displayName || t('app.bezy_member'), `
    <button class="ghost-btn" data-act="block">${escapeHtml(t('app.block'))}</button>
    <button class="ghost-btn" data-act="report" style="color:var(--danger)">${escapeHtml(t('app.report'))}</button>
    <p class="filter-note">${escapeHtml(t('app.safety_sheet_note'))}</p>
  `, (host) => {
    host.querySelector('[data-act="block"]').onclick = () => confirmAction('block', profile);
    host.querySelector('[data-act="report"]').onclick = () => openReportSheet(profile);
  });
}

function confirmAction(action, match) {
  openSheet(t(`app.${action}`), `
    <p class="filter-note" style="font-size:13px;margin-bottom:14px">${escapeHtml(t(`app.${action}_confirm`).replace('{name}', match.displayName || t('app.bezy_member')))}</p>
    <button class="save-btn" data-act="confirm">${escapeHtml(t(`app.${action}`))}</button>
    <button class="ghost-btn" data-sheet-close>${escapeHtml(t('app.cancel'))}</button>
  `, (host) => {
    host.querySelector('[data-act="confirm"]').onclick = async () => {
      try {
        if (match.isShared) {
          // Unmatch and block live in the community service; the local caches follow so
          // the row, the deck card and the open conversation leave together.
          if (action === 'unmatch') await social('matches', { method: 'POST', body: { match: match.matchId, action: 'unmatch' } });
          else await social('block', { method: 'POST', body: { target: match.sharedId || match.id } });
          closeSheet();
          showToast(t(`app.${action}_done`));
          state.social.matches = state.social.matches.filter((m) => m.id !== match.matchId);
          if (state.chat?.match?.matchId === match.matchId) closeChat();
          const sharedDeckIndex = state.profiles.findIndex((p) => p.isShared && p.id === (match.sharedId || match.id));
          if (sharedDeckIndex >= 0) {
            state.profiles.splice(sharedDeckIndex, 1);
            if (state.stats) state.stats.available = state.profiles.length;
            renderDiscover();
          }
          renderSocialMatches();
          await loadSocialMatches();
          return;
        }
        await api(API.relationship, { body: { action, targetId: match.id } });
        closeSheet();
        showToast(t(`app.${action}_done`));
        // The open conversation closes with the relationship it depended on.
        if (state.chat?.match?.id === match.id) closeChat();
        // A deck card the user just acted on must leave the deck too.
        const deckIndex = state.profiles.findIndex((p) => p.id === match.id);
        if (deckIndex >= 0) { state.profiles.splice(deckIndex, 1); renderDiscover(); }
        await loadMatches();
      } catch (error) { showToast(errorText(error)); }
    };
  });
}

function openReportSheet(match) {
  const reasons = ['harassment', 'spam', 'scam', 'fake_profile', 'inappropriate_content', 'underage', 'other'];
  openSheet(t('app.report'), `
    <div class="field"><label for="report-reason">${escapeHtml(t('app.report_reason'))}</label>
      <select id="report-reason">${reasons.map((r) => `<option value="${r}">${escapeHtml(t(`app.reason_${r}`))}</option>`).join('')}</select></div>
    <div class="field"><label for="report-details">${escapeHtml(t('app.report_details'))}</label>
      <textarea id="report-details" maxlength="1000"></textarea></div>
    <button class="save-btn" id="report-send" type="button">${escapeHtml(t('app.report_send'))}</button>
    <p class="filter-note">${escapeHtml(t('app.report_note'))}</p>
  `, () => {
    $('report-send').onclick = async () => {
      try {
        await api(API.relationship, { body: { action: 'report', targetId: match.id, reason: $('report-reason').value, details: $('report-details').value } });
        closeSheet();
        showToast(t('app.report_done'));
        // Reported = blocked = decided: the person leaves the deck as well as the match list.
        const deckIndex = state.profiles.findIndex((p) => p.id === match.id);
        if (deckIndex >= 0) { state.profiles.splice(deckIndex, 1); renderDiscover(); }
        await loadMatches();
      } catch (error) { showToast(errorText(error)); }
    };
  });
}

// The shared layer's report vocabulary is its own (five tokens, a shorter note), so the
// sheet is built from that list while the copy reuses the reason labels the Telegram sheet
// already shows for the same five situations.
const SOCIAL_REPORT_REASONS = [['fake', 'app.reason_fake_profile'], ['harassment', 'app.reason_harassment'], ['inappropriate', 'app.reason_inappropriate_content'], ['underage', 'app.reason_underage'], ['other', 'app.reason_other']];

function openSharedReportSheet(target) {
  openSheet(t('app.report'), `
    <div class="field"><label for="report-reason">${escapeHtml(t('app.report_reason'))}</label>
      <select id="report-reason">${SOCIAL_REPORT_REASONS.map(([value, key]) => `<option value="${escapeHtml(value)}">${escapeHtml(t(key))}</option>`).join('')}</select></div>
    <div class="field"><label for="report-details">${escapeHtml(t('app.report_details'))}</label>
      <textarea id="report-details" maxlength="300"></textarea></div>
    <button class="save-btn" id="report-send" type="button">${escapeHtml(t('app.report_send'))}</button>
    <p class="filter-note">${escapeHtml(t('app.report_note'))}</p>
  `, () => {
    $('report-send').onclick = async () => {
      try {
        await social('report', { method: 'POST', body: { target: target.sharedId || target.id, reason: $('report-reason').value, note: $('report-details').value } });
        closeSheet();
        showToast(t('app.report_done'));
        // Reporting also blocks them server-side, so the card and the row leave the screen
        // exactly as they do on the Telegram side.
        const deckIndex = state.profiles.findIndex((p) => p.isShared && p.id === (target.sharedId || target.id));
        if (deckIndex >= 0) {
          state.profiles.splice(deckIndex, 1);
          if (state.stats) state.stats.available = state.profiles.length;
          renderDiscover();
        }
        state.social.matches = state.social.matches.filter((m) => m.id !== target.matchId);
        renderSocialMatches();
        await loadSocialMatches();
      } catch { showToast(st('shared_offline')); }
    };
  });
}

async function openBlockedList() {
  try {
    const data = await api(API.relationship, { body: { action: 'list_blocks', targetId: 'none' } });
    const blocked = data.blocked || [];
    openSheet(t('app.blocked_people'), blocked.length
      ? blocked.map((b) => `<div class="conversation"><div class="conv-main"><b>${escapeHtml(b.displayName || t('app.bezy_member'))}</b></div><button class="match-open" data-unblock="${escapeHtml(b.id)}" type="button">${escapeHtml(t('app.unblock'))}</button></div>`).join('')
      : `<div class="empty">${escapeHtml(t('app.no_blocked'))}</div>`,
    (host) => {
      host.querySelectorAll('[data-unblock]').forEach((button) => {
        button.onclick = async () => {
          try {
            await api(API.relationship, { body: { action: 'unblock', targetId: button.dataset.unblock } });
            closeSheet();
            showToast(t('app.unblock_done'));
          } catch (error) { showToast(errorText(error)); }
        };
      });
    });
  } catch (error) { showToast(errorText(error)); }
}

// GDPR access/portability: the export is produced by the backend and handed to the user as
// a JSON file they can keep.
async function exportMyData() {
  try {
    showToast(t('app.export_preparing'));
    const { data } = await api(API.account, { body: { action: 'export' } });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bezy-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast(t('app.export_ready'));
  } catch (error) { showToast(errorText(error)); }
}

// Erasure is irreversible, so it requires an explicit typed confirmation.
// ---------------------------------------------------------------------------
// Restriction of processing (GDPR Art. 18)
// A recorded legal state, not a visibility preference: while it is in force Bezy stores the
// account and does nothing else with it. Lifting it deliberately does not republish the
// profile — the user turns "Show my profile in Discover" back on themselves.
// ---------------------------------------------------------------------------

function renderRestriction() {
  const restricted = state.processingRestricted === true;
  const notice = $('restriction-notice');
  if (notice) {
    notice.innerHTML = restricted
      ? `<div class="restricted-notice"><b>${escapeHtml(t('app.restricted_badge'))}</b>${escapeHtml(t('app.restricted_notice'))}</div>`
      : '';
  }
  setText('restrict-btn', restricted ? t('app.unrestrict_action') : t('app.restrict_action'));
}

async function applyRestriction(restricted) {
  try {
    await api(API.account, { body: { action: restricted ? 'restrict' : 'unrestrict' } });
    closeSheet();
    // Reloaded rather than assumed: the server decides the state, and lifting also changes
    // discoverability, which the profile form has to show correctly.
    await loadAccount();
    await loadDiscover();
    showToast(t(restricted ? 'app.restrict_done' : 'app.unrestrict_done'));
  } catch (error) {
    showToast(errorText(error));
  }
}

function openRestrict() {
  // Resuming restores a normal account and needs no ceremony; pausing stops the product
  // working, so it is explained and confirmed first.
  if (state.processingRestricted === true) { applyRestriction(false); return; }
  openSheet(t('app.restrict_title'), `
    <p class="filter-note" style="font-size:13px;margin-bottom:12px">${escapeHtml(t('app.restrict_explain'))}</p>
    <p class="filter-note" style="font-size:13px;margin-bottom:12px">${escapeHtml(t('app.restrict_note'))}</p>
    <button class="save-btn" id="restrict-go" type="button">${escapeHtml(t('app.restrict_confirm'))}</button>
    <button class="ghost-btn" data-sheet-close>${escapeHtml(t('app.cancel'))}</button>
  `, () => { $('restrict-go').onclick = () => applyRestriction(true); });
}

// Objection to processing (GDPR Art. 21)
// A recorded legal state, distinct from restriction: the user objects to the processing of
// their data for discovery and matching, and Bezy stops immediately. Withdrawing the
// objection does not republish the profile — the user turns "Show my profile in Discover"
// back on themselves.
// ---------------------------------------------------------------------------

function renderObjection() {
  const objected = state.processingObjection === true;
  const notice = $('objection-notice');
  if (notice) {
    notice.innerHTML = objected
      ? `<div class="restricted-notice"><b>${escapeHtml(t('app.objection_badge'))}</b>${escapeHtml(t('app.objection_notice'))}</div>`
      : '';
  }
  setText('object-btn', objected ? t('app.unobject_action') : t('app.object_action'));
}

async function applyObjection(objected) {
  try {
    await api(API.account, { body: { action: objected ? 'object' : 'unobject' } });
    closeSheet();
    // Reloaded rather than assumed: the server decides the state, and objecting also changes
    // discoverability, which the profile form has to show correctly.
    await loadAccount();
    await loadDiscover();
    showToast(t(objected ? 'app.objection_done' : 'app.unobject_done'));
  } catch (error) {
    showToast(errorText(error));
  }
}

function openObjection() {
  // Withdrawing restores a normal account and needs no ceremony; objecting stops the product
  // working, so it is explained and confirmed first.
  if (state.processingObjection === true) { applyObjection(false); return; }
  openSheet(t('app.objection_title'), `
    <p class="filter-note" style="font-size:13px;margin-bottom:12px">${escapeHtml(t('app.objection_explain'))}</p>
    <p class="filter-note" style="font-size:13px;margin-bottom:12px">${escapeHtml(t('app.objection_note'))}</p>
    <button class="save-btn" id="objection-go" type="button">${escapeHtml(t('app.objection_confirm'))}</button>
    <button class="ghost-btn" data-sheet-close>${escapeHtml(t('app.cancel'))}</button>
  `, () => { $('objection-go').onclick = () => applyObjection(true); });
}

// ---------------------------------------------------------------------------
// Home-screen installation — the official Telegram Mini Apps capability only.
//
// There is deliberately NO database state, no API endpoint and no persistence: the
// Telegram/device home-screen state is the single source of truth. Outside Telegram (or
// where the API is absent) the card hides itself — the feature never pretends to work.
// States: unsupported → hidden · unknown/missed → optional CTA (never a nag) ·
// added → installed note. Authentication, Premium and messaging are untouched.
// ---------------------------------------------------------------------------

function renderHomeScreenState() {
  const card = $('home-screen-card');
  if (!card) return;
  const api = tg;
  if (!api?.addToHomeScreen || !api?.checkHomeScreenStatus) {
    card.classList.add('hidden');
    return;
  }
  setText('home-screen-title', t('app.home_screen_title'));
  setText('home-screen-body', t('app.home_screen_body'));
  const addBtn = $('home-screen-add');
  const added = $('home-screen-added');
  const show = (withCta, installedText) => {
    if (addBtn) addBtn.classList.toggle('hidden', !withCta);
    if (added) { added.classList.toggle('hidden', !installedText); if (installedText) added.textContent = installedText; }
  };
  api.checkHomeScreenStatus((status) => {
    if (status === 'unsupported') { card.classList.add('hidden'); return; } // graceful, not broken
    if (status === 'added') { card.classList.remove('hidden'); setText('home-screen-add', t('app.home_screen_add')); show(false, t('app.home_screen_added')); return; }
    // 'unknown' or 'missed': the CTA stays available and stays optional.
    card.classList.remove('hidden');
    setText('home-screen-add', t('app.home_screen_add'));
    show(true, '');
    if (addBtn) addBtn.onclick = () => {
      Promise.resolve(api.addToHomeScreen()).then(() => {
        api.checkHomeScreenStatus((after) => { if (after === 'added') show(false, t('app.home_screen_added')); });
      }).catch(() => { /* the CTA stays; nothing breaks */ });
    };
  });
}

// ---------------------------------------------------------------------------
// The two legal processing states (restriction, objection) sit behind one human-readable
// entry point — the CX decision. The sheet explains in plain language, shows the current
// state, and hands over to the existing flows with their legally precise copy.
// ---------------------------------------------------------------------------

function openDataControls() {
  const restricted = state.processingRestricted === true;
  const objected = state.processingObjection === true;
  const badge = (key) => `<div class="restricted-notice"><b>${escapeHtml(t(`app.${key}`))}</b></div>`;
  openSheet(t('app.data_controls'), `
    <p class="filter-note" style="font-size:13px;margin-bottom:12px">${escapeHtml(t('app.data_controls_intro'))}</p>
    ${restricted ? badge('restricted_badge') : ''}
    ${objected ? badge('objection_badge') : ''}
    <button class="ghost-btn" id="controls-restrict" type="button">${escapeHtml(t(restricted ? 'app.unrestrict_action' : 'app.restrict_action'))}</button>
    <button class="ghost-btn" id="controls-object" type="button">${escapeHtml(t(objected ? 'app.unobject_action' : 'app.object_action'))}</button>
    <button class="ghost-btn" data-sheet-close>${escapeHtml(t('app.cancel'))}</button>
  `, () => {
    $('controls-restrict').onclick = () => openRestrict();
    $('controls-object').onclick = () => openObjection();
  });
}

// ---------------------------------------------------------------------------
// Support (CN-7): the bot is the primary channel — the card's first button opens it. The
// form here is the same structured intake the bot runs; both write to the same collection,
// and the caller always sees only their own requests.
// ---------------------------------------------------------------------------

const SUPPORT_CATEGORIES = ['premium', 'profile', 'likes_matches', 'discovery', 'privacy_account', 'problem', 'contact'];

function supportCategoryLabel(id) { return t(`app.support_cat_${id}`); }
function supportStatusLabel(status) { return t(`app.support_status_${status}`); }

function openSupportForm() {
  openSheet(t('app.support_form_title'), `
    <div class="field"><label for="support-category">${escapeHtml(t('app.support_form_category'))}</label>
      <select id="support-category"><option value="">…</option>${SUPPORT_CATEGORIES.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(supportCategoryLabel(id))}</option>`).join('')}</select></div>
    <div class="field"><label for="support-details">${escapeHtml(t('app.support_form_details'))}</label>
      <textarea id="support-details" placeholder="${escapeHtml(t('app.support_form_placeholder'))}"></textarea></div>
    <button class="save-btn" id="support-submit" type="button">${escapeHtml(t('app.support_submit'))}</button>
    <button class="ghost-btn" data-sheet-close>${escapeHtml(t('app.cancel'))}</button>
  `, () => {
    $('support-submit').onclick = async () => {
      const category = $('support-category').value;
      const details = $('support-details').value.trim();
      if (!category || !details) { showToast(t('app.support_required')); return; }
      try {
        const data = await api(API.support, { body: { action: 'create', category, details } });
        closeSheet();
        showToast(t('app.support_done').replace('{ref}', String(data.reference || '')));
      } catch (error) { showToast(errorText(error)); }
    };
  });
}

async function openSupportHistory() {
  openSheet(t('app.support_history'), `<div class="loading" id="support-history-list">${escapeHtml(t('app.loading'))}</div>`, () => {});
  // The sheet can be closed while the request is in flight; every touch of the list node
  // below is null-guarded so a closed sheet is a no-op, never an unhandled rejection.
  const list = () => $('support-history-list');
  const write = (html) => { const node = list(); if (node) node.innerHTML = html; };
  try {
    const data = await api(API.support, { body: { action: 'list' } });
    const requests = data.requests || [];
    write(requests.length
      ? requests.map((r) => `<div class="menu-row"><div class="left"><b>${escapeHtml(r.reference)}</b><span>${escapeHtml(supportCategoryLabel(r.category))} · ${escapeHtml(supportStatusLabel(r.status))}${r.createdAt ? ` · ${escapeHtml(r.createdAt.slice(0, 10))}` : ''}</span></div></div>`).join('')
      : `<div class="empty">${escapeHtml(t('app.support_history_empty'))}</div>`);
  } catch (error) {
    write(`<div class="empty">${escapeHtml(errorText(error))}</div>`);
  }
  // Intake lives behind the history, so the card itself keeps exactly two CTAs: Get help
  // and My support requests. This button opens the same structured form as before.
  const node = list();
  if (!node) return;
  const newRequest = document.createElement('button');
  newRequest.id = 'support-new-btn';
  newRequest.className = 'ghost-btn';
  newRequest.type = 'button';
  newRequest.textContent = t('app.support_contact');
  newRequest.style.marginTop = '12px';
  node.after(newRequest);
  newRequest.onclick = () => openSupportForm();
}

function openDeleteAccount() {
  openSheet(t('app.delete_account'), `
    <p class="filter-note" style="font-size:13px;margin-bottom:12px">${escapeHtml(t('app.delete_explain'))}</p>
    <p class="filter-note" style="font-size:13px;margin-bottom:12px">${escapeHtml(t('app.delete_retained'))}</p>
    <div class="field"><label for="delete-confirm">${escapeHtml(t('app.delete_type'))}</label><input id="delete-confirm" autocomplete="off" placeholder="DELETE"></div>
    <button class="save-btn" id="delete-go" type="button" style="background:var(--danger)">${escapeHtml(t('app.delete_account'))}</button>
    <button class="ghost-btn" data-sheet-close>${escapeHtml(t('app.cancel'))}</button>
  `, () => {
    $('delete-go').onclick = async () => {
      if ($('delete-confirm').value.trim().toUpperCase() !== 'DELETE') { showToast(t('app.delete_type')); return; }
      try {
        await api(API.account, { body: { action: 'delete', confirm: 'DELETE' } });
        closeSheet();
        document.body.innerHTML = `<main style="padding:48px 24px;font-family:system-ui;text-align:center"><h2>${escapeHtml(t('app.delete_done_title'))}</h2><p style="color:#77727f;line-height:1.5">${escapeHtml(t('app.delete_done_body'))}</p></main>`;
      } catch (error) { showToast(errorText(error)); }
    };
  });
}

async function loadMatches(messagesView = false) {
  // The shared community list is refreshed alongside the Telegram one — the two lists are
  // one screen, so they are never more than one render apart. Its own failure is silent.
  void loadSocialMatches();
  try {
    const data = await api(API.matches, { body: { lang: state.lang } });
    state.matches = data.matches || [];
    state.matchesError = false;
    renderMatches();
  } catch (error) {
    // A failed fetch must not paint "No matches yet" as if it were true — that is a lie
    // about the state of the account. The list keeps whatever it had and says the truth.
    state.matchesError = true;
    if (messagesView) showToast(errorText(error));
    renderMatches();
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const profile = { displayName: $('display-name').value, age: Number($('age').value), city: $('city').value, gender: $('gender').value, seeking: $('seeking').value, interests: $('interests').value.split(',').map((value) => value.trim()).filter(Boolean), bio: $('bio').value, prompts: readPromptEditor(), languages: readLanguageChips('languages-list'), discoverable: $('discoverable').checked };
  try { const data = await api(API.profile, { body: { profile } }); state.account = data.profile; renderAccount(); void syncTelegramMedia().catch(() => {}); syncSocialProfile(); showToast(t('app.profile_saved')); flashSavedBadge(); if (state.account.profileComplete && state.account.discoverable) showView('discover'); }
  catch (error) { showToast(errorText(error)); }
}
async function loadAccount() {
  const data = await api(API.profile);
  state.account = data.profile;
  state.notifications = data.notifications || null;
  state.processingRestricted = data.processingRestricted === true;
  state.processingObjection = data.processingObjection === true;
  state.needsAgeConfirmation = data.needsAgeConfirmation === true;
  document.body.classList.toggle('age-gated', state.needsAgeConfirmation);
  renderAccount();
  void syncTelegramMedia().catch(() => {});
  return data;
}

// The declaration must be an explicit affirmative action: nothing is pre-selected, and the
// user cannot proceed without choosing. This is a self-declaration, not age verification.
async function confirmAge() {
  const button = $('age-confirm');
  if (button) button.disabled = true;
  try {
    const data = await api(API.profile, { body: { ageEligibilityConfirmed: true } });
    state.account = data.profile;
    state.needsAgeConfirmation = data.needsAgeConfirmation === true;
    document.body.classList.remove('age-gated');
    renderAccount();
    showView(state.account?.profileComplete ? 'discover' : 'profile');
  } catch (error) {
    showToast(errorText(error));
  } finally {
    if (button) button.disabled = false;
  }
}

// Declining is terminal for the session: no profile, no discovery, no matching.
let ageGateHtml = null;
function denyAge() {
  const host = document.querySelector('#age-view .age-gate');
  if (!host) return;
  // Keep the gate so it can be put back: overwriting its markup destroys the two buttons,
  // and without a way back a mis-tap would strand the member until they restarted the
  // Mini App.
  if (ageGateHtml === null) ageGateHtml = host.innerHTML;
  document.body.classList.add('age-gated');
  host.innerHTML = `<div class="age-badge">18+</div><h2>${escapeHtml(t('app.age_blocked_title'))}</h2><p>${escapeHtml(t('app.age_blocked_body'))}</p><button class="ghost-btn" id="age-back" type="button">${escapeHtml(t('app.cancel'))}</button>`;
  $('age-back').onclick = () => {
    document.body.classList.remove('age-gated');
    host.innerHTML = ageGateHtml;
    ageGateHtml = null;
    bindAgeGate();
  };
}

// The gate's own controls, bound once and rebound whenever the gate is restored.
function bindAgeGate() {
  if ($('age-confirm')) $('age-confirm').onclick = confirmAge;
  if ($('age-deny')) $('age-deny').onclick = denyAge;
}

function bindEvents() {
  if (bindEvents.done) return;
  bindEvents.done = true;
  // Navigation is bound before startup finishes, so a tap during loading must win over
  // the initial routing decision rather than being silently undone by it.
  document.addEventListener('click', (event) => { if (event.target.closest('.nav button, #premiumBtn, .premium-action, #settingsBtn')) state.userNavigated = true; }, true);
  // A tap on the global navigation while a conversation is open leaves the conversation
  // (its state is cached) and switches to the tapped screen, exactly like the other views.
  document.querySelectorAll('.nav button').forEach((button) => button.addEventListener('click', () => { if (state.chat) closeChat(); showView(button.dataset.view); }));
  if ($('settingsBtn')) $('settingsBtn').onclick = () => showView('profile');
  if ($('discoverBtn')) $('discoverBtn').onclick = () => showView('discover');
  if ($('premiumBtn')) $('premiumBtn').onclick = () => showView('premium');
  if ($('premium-back')) $('premium-back').onclick = () => showView('discover');
  document.querySelectorAll('.premium-action').forEach((button) => button.onclick = () => showView('premium'));
  if ($('profile-form')) $('profile-form').addEventListener('submit', saveProfile);
  // The shared profile is derived from the Telegram one, so the moment discoverability
  // changes is the moment it is re-derived. Fire-and-forget, like the other two syncs.
  $('discoverable')?.addEventListener('change', () => syncSocialProfile());
  /**
   * The upload passes through a serverless function, and Vercel aborts anything over
   * ~4.5 MB before Bezy sees it, so the browser shrinks the photo first: the member can
   * pick any image, at any size, from any camera. Returns the original file when the
   * browser cannot decode it, so an exotic format still gets its chance at the API.
   */
  async function shrinkPhoto(file, maxEdge = 1600, quality = 0.82) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('decode failed'));
        img.src = url;
      });
      const longest = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = Math.min(1, maxEdge / longest);
      if (scale === 1 && file.size <= 1000000) return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return file;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      return blob && blob.size < file.size ? blob : file;
    } catch { return file; }
    finally { URL.revokeObjectURL(url); }
  }
  $('dating-photo-upload')?.addEventListener('change', async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    // No size check: the photo is shrunk below. The picker only rules out what can never
    // be stored — a non-image, or SVG, which can carry script and is never re-served.
    const photoType = String(file.type || '').toLowerCase();
    if (photoType === 'image/svg+xml' || (photoType && !photoType.startsWith('image/'))) {
      showToast('Choose an image.'); return;
    }
    input.disabled = true;
    try {
      await syncTelegramMedia();
      const prepared = await shrinkPhoto(file);
      await media('photos', { method: 'POST',
        headers: { 'Content-Type': prepared.type || 'application/octet-stream' }, body: prepared });
      await refreshDatingPhotos();
    } catch (error) { showToast(error.message); }
    finally { input.disabled = false; }
  });
  if ($('preview-profile-btn')) $('preview-profile-btn').onclick = openPreview;
  // Bezy conversation controls: composer submit, send-button state, back and safety menu.
  if ($('chat-composer')) {
    $('chat-composer').addEventListener('submit', (event) => { event.preventDefault(); sendChat($('chat-draft')?.value || ''); });
    $('chat-draft')?.addEventListener('input', updateChatSendState);
  }
  if ($('chat-back')) $('chat-back').onclick = closeChat;
  if ($('chat-menu')) $('chat-menu').onclick = () => { if (state.chat) openMatchActions(state.chat.match); };
  // Momentum: "ways to start" stays reachable mid-conversation, not just in the empty state.
  if ($('chat-starters-open')) $('chat-starters-open').onclick = () => { if (state.chat) openStarters(state.chat.match); };
  // Telegram Stories: the official Mini App surface is web_app_share_to_story, which opens
  // Telegram's native story editor pre-filled with a media URL, caption and link widget.
  // The button only exists on clients that support the event — no dead controls.
  if ($('share-story-btn')) {
    const storySupported = Boolean(tg?.shareToStory) || Boolean(window.TelegramWebviewProxy?.postEvent);
    if (storySupported) {
      $('share-story-card')?.classList.remove('hidden');
      $('share-story-btn').onclick = () => {
        const mediaUrl = `${location.origin}/assets/bezy-icon.png`;
        const text = t('app.share_story_caption');
        const widgetLink = { url: 'https://t.me/BezyDatingBot', name: 'Bezy' };
        try {
          if (tg?.shareToStory) { tg.shareToStory(mediaUrl, { text, widget_link: widgetLink }); return; }
          window.TelegramWebviewProxy.postEvent('web_app_share_to_story', { media_url: mediaUrl, text, widget_link: widgetLink });
        } catch (error) {
          showToast(t('app.error_generic'));
        }
      };
    }
  }
  // Keyboard/viewport handling: the composer rides the resized Mini App viewport, the nav
  // clearance is re-measured on viewport changes, and focusing the composer keeps the
  // newest message in view.
  $('chat-draft')?.addEventListener('focus', () => { const host = $('chat-messages'); if (host) host.scrollTop = host.scrollHeight; });
  window.addEventListener('resize', updateChatNavClearance);
  safeCall(() => tg?.onEvent?.('viewportChanged', updateChatNavClearance));
  if ($('profile-refresh')) $('profile-refresh').onclick = async () => { try { await loadAccount(); showToast(t('app.profile_saved')); } catch (error) { showToast(errorText(error)); } };
  if ($('tab-edit')) $('tab-edit').onclick = () => setProfileTab('edit');
  if ($('tab-settings')) $('tab-settings').onclick = () => setProfileTab('settings');
  ['display-name', 'age', 'city'].forEach((id) => { const node = $(id); if (node) node.addEventListener('input', updateProfileHero); });
  if ($('bio')) $('bio').addEventListener('input', updateBioCount);
  const interestInput = $('interests-add');
  if (interestInput) {
    interestInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addInterest(interestInput.value); interestInput.value = ''; } });
    interestInput.addEventListener('input', () => { if (interestInput.value.includes(',')) { addInterest(interestInput.value); interestInput.value = ''; } });
    interestInput.addEventListener('blur', () => { addInterest(interestInput.value); interestInput.value = ''; });
  }
  if ($('interests-add-btn')) $('interests-add-btn').onclick = () => { addInterest(interestInput?.value || ''); if (interestInput) interestInput.value = ''; };
  if ($('filterBtn')) $('filterBtn').onclick = openFilters;
  if ($('blocked-list-btn')) $('blocked-list-btn').onclick = openBlockedList;
  if ($('export-data-btn')) $('export-data-btn').onclick = exportMyData;
  if ($('restrict-btn')) $('restrict-btn').onclick = openRestrict;
  if ($('object-btn')) $('object-btn').onclick = openObjection;
  if ($('data-controls-btn')) $('data-controls-btn').onclick = openDataControls;
  if ($('support-history-btn')) $('support-history-btn').onclick = openSupportHistory;
  if ($('delete-account-btn')) $('delete-account-btn').onclick = openDeleteAccount;
  bindAgeGate();
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });
  document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await loadLocale(button.dataset.language);
      // An explicit choice is persisted locally (so the next session resolves it before
      // any network call) and on the account (so the bot and notifications follow it too).
      // The server write is best effort — the UI switch never depends on it.
      try { localStorage.setItem('bezy-language', button.dataset.language); } catch { /* storage unavailable */ }
      api(API.profile, { body: { locale: button.dataset.language } }).catch(() => {});
      renderAccount();
      // Profile-content translations target the viewer's locale, so a language switch
      // refetches the decks; otherwise the cards would keep the previous locale's wording.
      loadDiscover();
      loadMatches();
    } catch { showToast(t('app.error_generic')); }
  }));
}

async function init() {
  if (!tg?.initData) {
    // Opened outside Telegram. The only way in is the bot itself, so the gate says why and
    // links there — the bot's /start message carries the "Open Bezy" button. Rendered before
    // any locale loads, so it follows the browser language directly.
    const browserCode = String(navigator?.language || '').toLowerCase();
    // The gate follows the same resolution as the rest of the app: regional tags
    // normalize (pt-BR → pt, ar-SA → ar, zh-CN → zh) and unsupported languages fall to en.
    const gateLanguage = normalizeLanguageTag(browserCode) || 'en';
    const GATE_COPY = {
      en: { tagline: 'Meet someone worth knowing. 💗', title: 'Open Bezy from Telegram to continue.', button: 'Open Bezy in Telegram' },
      fr: { tagline: 'Faites une belle rencontre. 💗', title: 'Ouvrez Bezy depuis Telegram pour continuer.', button: 'Ouvrir Bezy dans Telegram' },
      de: { tagline: 'Lerne jemanden kennen, der zählt. 💗', title: 'Öffne Bezy über Telegram, um fortzufahren.', button: 'Bezy in Telegram öffnen' },
      es: { tagline: 'Conoce a alguien especial. 💗', title: 'Abre Bezy desde Telegram para continuar.', button: 'Abrir Bezy en Telegram' },
      it: { tagline: 'Incontra qualcuno di speciale. 💗', title: 'Apri Bezy da Telegram per continuare.', button: 'Apri Bezy su Telegram' },
      pt: { tagline: 'Conhece alguém que vale a pena. 💗', title: 'Abre o Bezy a partir do Telegram para continuar.', button: 'Abrir o Bezy no Telegram' },
      ru: { tagline: 'Познакомься с тем, кто этого стоит. 💗', title: 'Открой Bezy из Telegram, чтобы продолжить.', button: 'Открыть Bezy в Telegram' },
      pl: { tagline: 'Poznaj kogoś, kogo warto znać. 💗', title: 'Otwórz Bezy z Telegrama, aby kontynuować.', button: 'Otwórz Bezy w Telegramie' },
      ar: { tagline: 'تعرّف على شخص يستحق أن تعرفه. 💗', title: 'افتح Bezy من تيليجرام للمتابعة.', button: 'افتح Bezy في تيليجرام' },
      tr: { tagline: 'Tanımaya değer biriyle tanış. 💗', title: 'Devam etmek için Bezy\'yi Telegram\'dan aç.', button: 'Bezy\'yi Telegram\'da aç' },
      sw: { tagline: 'Kutana na mtu anayestahili kumjua. 💗', title: 'Fungua Bezy kutoka Telegram ili kuendelea.', button: 'Fungua Bezy kwenye Telegram' },
      yo: { tagline: 'Pàdé ẹni tó tọ́ láti mọ̀. 💗', title: 'Ṣí Bezy láti inú Telegram láti tẹ̀síwájú.', button: 'Ṣí Bezy nínú Telegram' },
      hi: { tagline: 'किसी ऐसे व्यक्ति से मिलें जो जानने लायक हो. 💗', title: 'जारी रखने के लिए Telegram से Bezy खोलें.', button: 'Telegram में Bezy खोलें' },
      id: { tagline: 'Kenali seseorang yang layak untuk dikenal. 💗', title: 'Buka Bezy dari Telegram untuk melanjutkan.', button: 'Buka Bezy di Telegram' },
      zh: { tagline: '认识一个值得认识的人。💗', title: '从 Telegram 打开 Bezy 以继续。', button: '在 Telegram 中打开 Bezy' },
      ja: { tagline: '知る価値のある誰かと出会おう。💗', title: 'Telegram から Bezy を開いて続行してください。', button: 'Telegram で Bezy を開く' },
      ko: { tagline: '알 만한 가치가 있는 누군가를 만나세요. 💗', title: '계속하려면 Telegram에서 Bezy를 여세요.', button: 'Telegram에서 Bezy 열기' }
    };
    const { tagline, title, button } = GATE_COPY[gateLanguage] || GATE_COPY.en;
    // The gate uses the same brand bar as the Mini App shell: logo tile + "Bezy 💗" +
    // localized tagline, then the reason and the bot CTA.
    document.body.innerHTML = `<main style="padding:48px 24px;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui;text-align:center;color:#1d1924;background:#FAF8FE"><div style="display:inline-flex;flex-direction:column;align-items:center;margin:0 auto 22px"><img src="/assets/bezy-logo-without-tagline.png" alt="Bezy" width="72" height="80" style="border-radius:18px;border:1px solid rgba(233,229,236,.6);box-shadow:0 6px 20px rgba(99,39,155,.12);display:block"><span style="display:flex;align-items:center;gap:4px;font-size:26px;font-weight:800;letter-spacing:-.8px;color:#0f172a;margin-top:10px">Bezy <span aria-hidden="true">💗</span></span><p style="color:rgba(88,28,135,.6);margin:4px 0 0;font-size:14px;font-weight:500">${tagline}</p></div><p style="color:#77727f;margin:0 0 26px;font-size:14px">${title}</p><a href="https://t.me/BezyDatingBot" style="display:inline-block;padding:13px 30px;border-radius:14px;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;text-decoration:none;font-weight:800;font-size:14px">${button}</a></main>`;
    return;
  }
  // Telegram WebApp methods are synchronous and return undefined. They must never be
  // treated as promises, and a failure in any of them must not stop initialization.
  safeCall(() => tg.ready());
  safeCall(() => tg.expand?.());
  safeCall(() => tg.disableVerticalSwipes?.());
  state.telegramUser = tg.initDataUnsafe?.user || null;

  // Bind navigation before any network request so the UI never becomes a dead static page
  // when a locale/API request is slow or unavailable.
  bindEvents();

  // The community match list refreshes on a slow timer — started once, and skipped while
  // the app is not on screen, exactly like the conversation poll. A failure is silent.
  if (!init.socialPoll) {
    init.socialPoll = setInterval(() => { if (document.visibilityState === 'visible') void loadSocialMatches(); }, SOCIAL_POLL_MS);
  }

  const storedExplicit = storedExplicitLanguage();
  try {
    await loadLocale(resolveAppLocale());
  } catch (error) {
    console.error('[Bezy] Locale initialization failed:', error);
    state.lang = 'en';
    state.dict = {
      // BEGIN fallback catalogue — generated from locales/en.json by scripts/sync-fallback-locale.mjs
      app: {"tagline":"Meet someone worth knowing. 💗","discover":"Discover","matches":"Matches","messages":"Messages","profile":"Profile","for_you":"For you","filters":"Filters","pass":"Pass","super":"Super","like":"Like","your_matches":"Your matches","protected_by_bezy":"Protected by Bezy","view_membership":"View membership","unlock_premium":"Unlock Premium","privacy":"Privacy","terms":"Terms","settings":"Settings","no_conversations":"Your conversations will appear here after a mutual match.","discover_intro":"Real people. Mutual interest. Conversations that stay inside Bezy.","discover_title":"Find your kind of connection.","premium_copy":"See who liked you, unlock advanced discovery and get more ways to connect.","matches_premium_copy":"Premium members get more discovery options and can see who already liked them.","people_available":"people to discover","best_match":"best match","new_today":"new today","match_score":"match","min_age":"Minimum age","max_age":"Maximum age","any_city":"Any city","same_city_only":"Only show people in my city","apply_filters":"Apply filters","reset_filters":"Reset filters","filters_applied":"Filters applied.","filters_note":"Filters are saved to your account and applied every time you open Discover.","conversation_hint":"Private conversations with your matches.","profile_live":"Your profile is live in Discover.","premium_title":"Bezy Premium","premium_intro":"Unlock more ways to discover meaningful connections.","premium_active_intro":"You're a Premium member. Thank you for supporting Bezy.","benefit_who_liked_you":"See who liked you","benefit_advanced_discovery":"Advanced discovery","benefit_more_super_likes":"More Super Likes","benefit_increased_visibility":"Increased visibility","benefit_unlimited_discovery":"Unlimited discovery","benefit_messaging":"Chat with your matches","choose_plan":"Choose your plan","plan":"Plan","plan_monthly":"Monthly","plan_quarterly":"Quarterly","plan_yearly":"Yearly","months_count":"{n} months of Premium","best_value":"Best value","subscribe_with_stars":"Subscribe with Telegram Stars","renew_with_stars":"Renew with Telegram Stars","renew":"Renew or extend","active_until":"Active until","days_remaining":"Days remaining","stars_note":"Payment is handled inside Telegram with Stars. Bezy never sees your card details.","who_liked_you":"Who liked you","who_liked_you_locked":"Premium members can see everyone who already liked them, and match instantly.","likes_waiting":"{n} people already liked you","no_likes_yet":"No one is waiting yet. Keep discovering.","preparing_checkout":"Preparing checkout…","payment_cancelled":"Payment cancelled.","payment_failed":"We couldn't start the payment. Please try again.","payment_received":"Payment received. Activating your Bezy Premium…","payment_pending":"Your payment is still processing.","payment_processing":"Your payment is being processed. Premium will activate shortly.","payment_unsupported":"Please update Telegram to pay with Stars.","premium_active":"💎 Bezy Premium is active.","premium_required":"This is a Premium feature.","premium_expired":"Your Bezy Premium has expired.","discovery_limit":"You've reached today's discovery limit. Premium removes it.","super_like_limit":"You've used today's Super Likes. Premium gives you more.","profile_hidden":"Your profile is saved but hidden from Discover.","loading":"Loading…","refresh":"Refresh","start_conversation":"Start conversation","continue_conversation":"Continue conversation","no_matches":"No matches yet. Keep discovering — your next connection could be here.","no_profiles":"No more profiles right now. Check back soon.","empty_filters":"Your filters are hiding everyone right now. Adjust them, or reset them to see everyone.","empty_pool":"You've seen everyone nearby for now. New people join all the time — check back later.","empty_no_supply":"Bezy is brand new here — no one discoverable yet. Check back soon, and tell someone about Bezy.","empty_eligibility":"No one nearby matches who you're looking for right now. You can update “I am” and “Looking for” in your profile, or check back later.","empty_eligibility_you":"Your profile is currently shown as {gender}, looking for {seeking}.","empty_eligibility_edit":"Update my profile","gender_placeholder":"Choose…","adjust_filters":"Adjust filters","check_later":"Check again","complete_profile":"Complete your profile to start discovering people.","profile_complete_pct":"{percent}% complete","profile_saved":"Your profile has been saved.","saved_badge":"Saved","match_created":"It’s a match! 💜","error_generic":"Something went wrong. Please try again.","show_profile":"Show my profile in Discover","discoverable_note":"When off, your profile is saved but hidden from Discover.","legal_privacy":"Legal","language":"Language","edit_profile":"Edit profile","settings_privacy":"Settings & Privacy","core_profile":"Core Profile","display_name":"Display name","age":"Age","city":"City","gender":"I am","seeking":"Looking for","interests":"Interests","interests_placeholder":"Travel, music, books","add_interest":"Add interest","add_interest_placeholder":"Add an interest…","bio":"About me","bio_placeholder":"Tell people something memorable about your day or what makes you smile...","woman":"Woman","man":"Man","non_binary":"Non-binary","prefer_not_to_say":"Prefer not to say","women":"Women","men":"Men","everyone":"Everyone","save_profile":"Save profile","my_profile":"My profile","more_connections":"More connections","navigation":"Bezy navigation","close":"Close","meta_description":"Bezy — meet someone worth knowing, entirely inside Telegram.","bezy_member":"Bezy member","error_session":"Your Telegram session could not be verified. Please reopen Bezy.","error_database":"Bezy could not reach its database. Please try again.","error_profile_missing":"Complete your profile to start discovering people.","error_target_missing":"That profile is no longer available.","age_gate_title":"Bezy is only available to people aged 18 and over.","age_gate_body":"By continuing, I confirm that I am 18 or older.","age_confirm":"I am 18 or older","age_deny":"I am under 18","age_note":"Bezy does not verify identity or age. This is your own declaration.","age_blocked_title":"Bezy is for adults aged 18 and over.","age_blocked_body":"You cannot create a Bezy profile, discover people or match. Thank you for being honest.","error_age_required":"Please confirm you are 18 or older to continue.","safety_title":"Safety","safety_intro":"Block or report anyone who makes you uncomfortable.","data_title":"Privacy & your data","data_controls":"Data & privacy controls","data_controls_intro":"Bezy keeps your data while processing is paused or objected to — nothing is deleted, and you can lift either at any time.","privacy_by_design":"Messages stay between you and your match. Your photos stay on Telegram. We use your city, not your GPS.","safety_actions":"Safety options","safety_sheet_note":"Blocking and reporting take effect immediately and are enforced by Bezy's servers.","block":"Block","unblock":"Unblock","unblock_done":"This person has been unblocked.","block_confirm":"{name} will no longer see you or be able to contact you through Bezy. Your match will be ended.","block_done":"Blocked.","unmatch":"Unmatch","unmatch_confirm":"End your match with {name}? Neither of you will see the other in Bezy again.","unmatch_done":"Unmatched.","report":"Report","report_reason":"Reason","report_details":"What happened? (optional)","report_send":"Send report","report_done":"Report sent. This person has also been blocked.","report_note":"Reporting also blocks this person. Bezy reviews reports; we cannot promise a response time.","reason_harassment":"Harassment or abuse","reason_spam":"Spam","reason_scam":"Scam or fraud","reason_fake_profile":"Fake profile or impersonation","reason_inappropriate_content":"Inappropriate content","reason_underage":"Appears to be under 18","reason_other":"Something else","blocked_people":"Blocked people","no_blocked":"You haven't blocked anyone.","cancel":"Cancel","export_data":"Download my data","export_preparing":"Preparing your data…","export_ready":"Your data has been downloaded.","delete_account":"Delete my account","delete_explain":"This permanently deletes your Bezy profile, your likes and passes, your matches and your blocks. It cannot be undone.","delete_retained":"Records of payments you made and their invoice links are kept for accounting, and reports — filed by you or about you — are kept for safety. Your Telegram account itself is not affected.","delete_type":"Type DELETE to confirm","delete_done_title":"Your Bezy account has been deleted.","delete_done_body":"You can close this window. If you ever want to come back, just open Bezy again and create a new profile.","rights_note":"For corrections or a complaint, contact contacts@digitalconcordia.com.","legal_help":"Legal help","footer_note":"Built with intention","share_story":"Share Bezy to your story","share_story_caption":"Find your kind of connection — meet someone worth knowing on Bezy 💜","remove":"Remove","support_title":"Help & support","support_intro":"Bezy support can help diagnose common problems.","support_help":"Get help","support_formal":"Need to make a formal privacy or legal request? Contact us.","support_contact":"Contact support","support_history":"My support requests","support_history_empty":"You have no support requests.","support_form_title":"Contact support","support_form_category":"What is it about?","support_form_details":"Describe the problem","support_form_placeholder":"What happened? What have you tried?","support_submit":"Send","support_required":"Choose a topic and describe the problem.","support_done":"Your support request has been received. Reference: {ref}. We'll review it and get back to you here.","support_cat_premium":"Premium & Telegram Stars","support_cat_profile":"Profile","support_cat_likes_matches":"Likes & Matches","support_cat_discovery":"Discovery","support_cat_privacy_account":"Privacy & Account","support_cat_problem":"Report a problem","support_cat_contact":"Contact support","support_status_open":"Open","support_status_in_progress":"In progress","support_status_resolved":"Resolved","support_status_closed":"Closed","support_email":"Email support","support_expectation":"We read every message and aim to answer within 3 working days.","rate_limited":"You're going a little fast. Please try again in a moment.","rate_limited_minutes":"You've done that too many times. Please try again in about {n} minutes.","stars_needed":"You need Telegram Stars in your balance to subscribe. You can top up in Telegram under Settings, then My Stars.","not_telegram_premium":"Telegram Premium is a separate Telegram subscription. It does not include Bezy Premium — Bezy Premium is paid separately with Stars.","premium_revoked":"Your Bezy Premium was refunded.","premium_lapsed_hint":"You can subscribe again below. Your profile, matches and conversations are unaffected.","prompts_title":"Prompts & icebreakers","prompts_hint":"Optional. Answer up to three — they appear on your profile and give people something to open with.","prompt_perfect_sunday":"A perfect Sunday for me…","prompt_i_value":"Something I value…","prompt_first_date":"My ideal first date…","prompt_should_know":"One thing you should know about me…","prompt_talk_for_hours":"Something I could talk about for hours…","prompt_placeholder":"Your answer","preview_profile":"Preview my profile","preview_title":"How others see you","preview_hint":"This is your card as it appears in Discover. Your Telegram username is never shown to other members.","preview_incomplete":"Complete your profile to see how it will look.","why_matched":"Why you matched","why_interests":"You both like {values}","why_city":"You are both in {values}","why_age":"You are close in age","why_languages":"You both speak {values}","why_none":"You liked each other.","starters_title":"Ways to start","starter_interest":"Ask about {value} — you both like it.","starter_city":"Ask what they love about {value}.","starter_generic":"Start with something simple — say hi and ask about their day.","start_with":"Start with","starter_copy":"Copy","starter_copied":"Copied. You can paste it into the conversation.","starters_hint":"Bezy suggests an opener; the conversation happens right here in Bezy.","icebreaker_label":"{name}'s icebreaker","msg_placeholder":"Write a message…","msg_send":"Send","msg_send_failed":"Message not sent.","msg_retry":"Try again","msg_no_messages":"No messages yet — start the conversation.","msg_conversation_unavailable":"This conversation is no longer available.","msg_use_this_message":"Use this message","msg_premium_locked":"Your match is real and your conversation is ready. Messaging is a Premium capability — unlock Premium to continue.","notify_messages":"New messages","notify_messages_note":"When a match sends you a message","prompt_none":"No prompt","prompt_number":"Prompt {n}","prompts_select_label":"Choose a prompt","prompts_answer_label":"Prompt answer","notifications_title":"Notifications","notifications_hint":"Choose what Bezy sends you in Telegram. Payment and account messages are always sent, because they are a record of something that happened to your account.","notify_matches":"New matches","notify_super_likes":"Super Likes you receive","notify_super_likes_note":"Bezy never says who sent it — open Bezy and decide for yourself.","notify_profile_reminders":"Profile reminders","notify_profile_reminders_note":"At most one a week, and only while your profile is incomplete.","notifications_saved":"Notification settings saved.","restrict_title":"Pause all processing","restrict_explain":"Bezy keeps your data but stops using it. Your profile leaves Discover, you cannot like or match, and Bezy stops sending you match and Super Like messages. Nothing is deleted, and you can lift this at any time.","restrict_action":"Pause processing","restrict_confirm":"Pause processing now","restricted_badge":"Processing is paused.","restricted_notice":"Bezy is storing your data and nothing else. Lift the pause to return to Discover.","unrestrict_action":"Resume processing","restrict_done":"Processing is paused. Your data is kept, not used.","unrestrict_done":"Processing resumed. Turn on “Show my profile in Discover” when you are ready to be seen again.","restrict_note":"This is the right to restriction of processing. Payment and account messages are still sent, and you can still download or delete your data.","error_processing_restricted":"Processing is paused for your account. Resume it in Safety & privacy to continue.","objection_title":"Object to processing","objection_explain":"You have the right to object to the way Bezy processes your data (GDPR Art. 21). If you object, Bezy stops using your data for discovery and matching: your profile leaves Discover, you cannot like or match, and Bezy stops sending you match and Super Like messages. Nothing is deleted, and you can withdraw the objection at any time.","objection_confirm":"Object now","object_action":"Object to processing","objection_badge":"You have objected to processing.","objection_notice":"Bezy is storing your data and nothing else. Withdraw the objection to return to Discover.","unobject_action":"Withdraw objection","objection_done":"Objection recorded. Bezy has stopped processing your data.","unobject_done":"Objection withdrawn. Turn on “Show my profile in Discover” when you are ready to be seen again.","objection_note":"This is the right to object to processing. Your data is kept, not deleted, and you can still download or delete your data.","languages_label":"Languages I speak","languages_hint":"Optional. Up to five. Used to show you people you can actually talk to.","languages_chosen_count":"{chosen} of {max} chosen","filter_languages":"Languages they speak","filter_languages_hint":"Leave empty to see everyone. Profiles that have not listed a language are always shown.","language_en":"English","language_fr":"French","language_es":"Spanish","language_pt":"Portuguese","language_ar":"Arabic","language_de":"German","language_it":"Italian","language_ru":"Russian","language_sw":"Swahili","language_yo":"Yoruba","powered_by":"Powered by @BezyDatingBot","filter_premium_note":"City and same-city filters are a Premium capability. Age and languages always work on the free plan.","match_state_new":"New match","match_state_waiting":"Waiting for your reply","match_state_quiet":"Quiet for a while","starter_languages":"Ask about {value} — you both speak it.","closure_hint":"If this connection isn't moving forward, you can end it cleanly.","language_pl":"Polish","language_tr":"Turkish","language_hi":"Hindi","language_id":"Indonesian","language_zh":"Chinese","language_ja":"Japanese","language_ko":"Korean","starter_universal_1":"What’s something you’ve been enjoying lately?","starter_universal_2":"What does a really good weekend look like for you?","starter_universal_3":"What brought you to Bezy?","translated_from":"Translated from {lang}","show_original":"Show original","original_label":"Original · {lang}","show_translation":"Show translation","age_status_title":"Age & trust","age_self_declared":"18+ self-declared","premium_unavailable":"Premium is temporarily unavailable. Please try again.","interests_limit":"Up to 12 interests.","quota_likes_left":"{n} likes left today","quota_super_likes_left":"{n} Super Likes left","check_payment_status":"Check payment status","home_screen_title":"Add Bezy to Home Screen","home_screen_body":"Keep Bezy one tap away — add it to your phone’s home screen for quicker access.","home_screen_add":"Add Bezy to Home Screen","home_screen_added":"Bezy is on your home screen ✓","tot_title":"This or That","tot_play":"Play This or That","tot_intro":"Five small questions. You both answer, then you see each other's picks.","tot_optional_note":"Optional — the conversation works fine without it.","tot_start":"Start a round","tot_new_round":"Start another round","tot_state_your_turn":"Your turn","tot_state_waiting":"Waiting for {name}","tot_state_results":"Results ready","tot_state_completed":"Completed","tot_answer":"Answer","tot_see_results":"See the results","tot_view":"See the round","tot_progress":"Question {n} of {total}","tot_final_note":"Your pick is final once you tap.","tot_waiting_body":"You've answered. {name} can answer whenever they open Bezy.","tot_same":"You both chose {choice}","tot_different":"You chose {mine}. {name} chose {theirs}.","tot_different_note":"Different answers — maybe there's a story there.","tot_waiting_question":"{name} hasn't answered this one yet.","tot_summary_same":"{n} same","tot_summary_different":"{n} different","tot_talk_about":"Talk about one","tot_talk_message":"{a} or {b}? I'd love to know why you picked yours.","tot_error_round":"That round is no longer available.","tot_error_final":"That answer was already saved.","tot_q_travel_beach_mountains_a":"Beach","tot_q_travel_beach_mountains_b":"Mountains","tot_q_travel_city_countryside_a":"City break","tot_q_travel_city_countryside_b":"Countryside","tot_q_travel_planned_spontaneous_a":"Everything booked","tot_q_travel_planned_spontaneous_b":"Figure it out there","tot_q_travel_window_aisle_a":"Window seat","tot_q_travel_window_aisle_b":"Aisle seat","tot_q_travel_sunrise_sunset_a":"Sunrise","tot_q_travel_sunrise_sunset_b":"Sunset","tot_q_food_sweet_salty_a":"Sweet","tot_q_food_sweet_salty_b":"Salty","tot_q_food_cook_eatout_a":"Cook together","tot_q_food_cook_eatout_b":"Eat out","tot_q_food_coffee_tea_a":"Coffee","tot_q_food_coffee_tea_b":"Tea","tot_q_food_spicy_mild_a":"Spicy","tot_q_food_spicy_mild_b":"Mild","tot_q_food_street_restaurant_a":"Street food","tot_q_food_street_restaurant_b":"Sit-down restaurant","tot_q_comm_call_text_a":"Call","tot_q_comm_call_text_b":"Text","tot_q_comm_voice_typed_a":"Voice note","tot_q_comm_voice_typed_b":"Typed message","tot_q_comm_long_short_a":"Long messages","tot_q_comm_long_short_b":"Short messages","tot_q_comm_reply_now_later_a":"Reply right away","tot_q_comm_reply_now_later_b":"Reply once I've thought","tot_q_everyday_early_night_a":"Early bird","tot_q_everyday_early_night_b":"Night owl","tot_q_everyday_plan_spontaneous_a":"Plan ahead","tot_q_everyday_plan_spontaneous_b":"Be spontaneous","tot_q_everyday_tidy_lived_in_a":"Everything tidy","tot_q_everyday_tidy_lived_in_b":"Comfortably lived-in","tot_q_everyday_walk_ride_a":"Walk there","tot_q_everyday_walk_ride_b":"Take a ride","tot_q_everyday_music_quiet_a":"Music on","tot_q_everyday_music_quiet_b":"Quiet","tot_q_leisure_movie_series_a":"Movie night","tot_q_leisure_movie_series_b":"Series marathon","tot_q_leisure_reading_listening_a":"Reading","tot_q_leisure_reading_listening_b":"Listening to music","tot_q_leisure_museum_livemusic_a":"Museum day","tot_q_leisure_museum_livemusic_b":"Live music","tot_q_leisure_indoors_outdoors_a":"Cosy indoors","tot_q_leisure_indoors_outdoors_b":"Out in the fresh air","tot_q_leisure_dancing_watching_a":"On the dance floor","tot_q_leisure_dancing_watching_b":"Watching from the side","tot_q_social_big_small_a":"Big party","tot_q_social_big_small_b":"Small gathering","tot_q_social_host_guest_a":"Hosting","tot_q_social_host_guest_b":"Being hosted","tot_q_social_new_familiar_a":"Meeting new people","tot_q_social_new_familiar_b":"Time with close friends","tot_q_social_talk_listen_a":"Mostly talking","tot_q_social_talk_listen_b":"Mostly listening","tot_q_dating_walk_dinner_a":"A long walk","tot_q_dating_walk_dinner_b":"A proper dinner","tot_q_dating_surprise_plan_a":"Surprise me","tot_q_dating_surprise_plan_b":"Tell me the plan"},
      // END fallback catalogue
    };
    document.documentElement.lang = 'en';
    applyLocale();
  }

  try {
    const account = await loadAccount();
    // The shared community layer mirrors this account from here on. Both calls are silent:
    // Bezy works exactly as it did before whether or not that service answers.
    syncSocialProfile();
    void loadSocialMatches();
    // An explicit choice saved on the account (e.g. picked on another device) wins over
    // automatic detection on this one. The local cache only ever holds explicit choices,
    // so caching the adopted value keeps the next session's first paint correct too.
    try {
      const savedLocale = normalizeLanguageTag(account.profile?.locale);
      if (savedLocale && !storedExplicit) {
        try { localStorage.setItem('bezy-language', savedLocale); } catch { /* storage unavailable */ }
        if (savedLocale !== state.lang) await loadLocale(savedLocale);
      }
    } catch (error) {
      console.warn('[Bezy] Could not adopt saved language:', error);
    }
    const requestedView = account.needsAgeConfirmation
      ? 'age'
      : new URLSearchParams(location.search).get('view') || (account.needsProfile ? 'profile' : 'discover');
    if (!state.userNavigated || account.needsAgeConfirmation) showView(requestedView);
    // Premium entitlement is loaded at boot so every surface (promo cards, lock states)
    // renders from the backend's verdict instead of assuming the user is free.
    await loadPremium();
  } catch (error) {
    console.error('[Bezy] Account initialization failed:', error);
    showToast(errorText(error));
    if (!state.userNavigated) showView('profile');
  } finally {
    document.documentElement.dataset.bezyReady = 'true';
  }
}

// Any unexpected failure must degrade to a usable app, never to a dead static page.
async function boot() {
  try {
    await init();
  } catch (error) {
    console.error('[Bezy] Initialization failed:', error);
    try { bindEvents(); } catch { /* navigation already bound */ }
    showToast(t('app.error_generic'));
  }
}

window.addEventListener('error', (event) => console.error('[Bezy] Uncaught error:', event.error || event.message));
window.addEventListener('unhandledrejection', (event) => console.error('[Bezy] Unhandled rejection:', event.reason));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
