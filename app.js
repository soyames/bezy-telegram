const tg = window.Telegram?.WebApp;
const API = { profile: '/api/profile/me', discover: '/api/discover', swipe: '/api/swipe', matches: '/api/matches', premium: '/api/premium', likes: '/api/likes', relationship: '/api/relationship', account: '/api/account' };
const state = { lang: null, dict: null, telegramUser: null, account: null, profiles: [], matches: [], stats: null, preferences: null, notifications: null, processingRestricted: false, processingObjection: false, currentIndex: 0, view: 'discover', premium: null, likes: null, likeCount: 0, selectedPlan: 'yearly', userNavigated: false };
const $ = (id) => document.getElementById(id);

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function safeCall(fn) { try { return fn(); } catch (error) { console.warn('[Bezy] Ignored Telegram WebApp error:', error); return undefined; } }
function t(key) { return key.split('.').reduce((value, part) => value?.[part], state.dict) ?? key; }
function languageFromTelegram() { const code = state.telegramUser?.language_code || tg?.initDataUnsafe?.user?.language_code || navigator.language || 'en'; return String(code).toLowerCase().startsWith('fr') ? 'fr' : 'en'; }

async function loadLocale(language) {
  const response = await fetch(`/locales/${language}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load language: ${response.status}`);
  state.lang = language;
  state.dict = await response.json();
  localStorage.setItem('bezy-language', language);
  document.documentElement.lang = language;
  applyLocale();
}
function setText(id, value) { const node = $(id); if (node) node.textContent = value; }

function applyLocale() {
  setText('tagline', t('app.tagline')); setText('nav-discover', t('app.discover')); setText('nav-matches', t('app.matches')); setText('nav-messages', t('app.messages')); setText('nav-profile', t('app.profile'));
  setText('discover-title', t('app.discover_title')); setText('discover-intro', t('app.discover_intro')); setText('for-you', t('app.for_you')); setText('filterBtn', t('app.filters'));
  setText('premium-copy', t('app.premium_copy')); setText('premiumBtn', t('app.view_membership')); setText('your-matches', t('app.your_matches')); setText('discoverBtn', t('app.discover')); setText('matches-premium-copy', t('app.matches_premium_copy'));
  document.querySelectorAll('.premium-action').forEach((node) => { node.textContent = t('app.unlock_premium'); });
  setText('messages-title', t('app.messages')); setText('protected-label', t('app.protected_by_bezy')); setText('profile-title', t('app.my_profile')); setText('profile-refresh', t('app.refresh')); setText('edit-profile', t('app.edit_profile'));
  setText('display-name-label', t('app.display_name')); setText('age-label', t('app.age')); setText('city-label', t('app.city')); setText('gender-label', t('app.gender')); setText('seeking-label', t('app.seeking')); setText('interests-label', t('app.interests')); setText('bio-label', t('app.bio'));
  setText('discoverable-label', t('app.show_profile')); setText('save-profile', t('app.save_profile')); setText('language-title', t('app.language')); setText('legal-title', t('app.legal_privacy')); setText('privacy-link', t('app.privacy')); setText('terms-link', t('app.terms')); setText('support-title', t('app.support_title')); setText('support-intro', t('app.support_intro')); setText('support-email-btn', t('app.support_email'));
  setText('people-label', t('app.people_available')); setText('match-label', t('app.best_match')); setText('new-label', t('app.new_today')); setText('message-empty', t('app.no_conversations')); setText('matches-empty', t('app.no_matches'));
  if ($('privacy-link')) $('privacy-link').href = `/privacy?lang=${state.lang}`;
  if ($('terms-link')) $('terms-link').href = `/terms?lang=${state.lang}`;
  document.querySelectorAll('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === state.lang));
  const gender = $('gender');
  if (gender) gender.innerHTML = `<option value="woman">${escapeHtml(t('app.woman'))}</option><option value="man">${escapeHtml(t('app.man'))}</option><option value="non_binary">${escapeHtml(t('app.non_binary'))}</option><option value="prefer_not_to_say">${escapeHtml(t('app.prefer_not_to_say'))}</option>`;
  const seeking = $('seeking');
  if (seeking) seeking.innerHTML = `<option value="women">${escapeHtml(t('app.women'))}</option><option value="men">${escapeHtml(t('app.men'))}</option><option value="everyone">${escapeHtml(t('app.everyone'))}</option>`;
  if ($('interests')) $('interests').placeholder = t('app.interests_placeholder');
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
  setText('safety-title', t('app.safety_title')); setText('safety-intro', t('app.safety_intro')); setText('rights-note', t('app.rights_note'));
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
  if (state.premium) renderPremium();
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
  PREMIUM_UNAVAILABLE: 'app.payment_failed',
  AGE_CONFIRMATION_REQUIRED: 'app.error_age_required',
  PROCESSING_RESTRICTED: 'app.error_processing_restricted',
  RATE_LIMITED: 'app.rate_limited'
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

function closeSheet() { const host = $('sheet-host'); if (!host) return; host.classList.add('hidden'); host.innerHTML = ''; }

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
  openSheet(t('app.filters'), `
    <div class="two-col">
      <div class="field"><label for="filter-min-age">${escapeHtml(t('app.min_age'))}</label><input id="filter-min-age" type="number" min="18" max="100" value="${escapeHtml(preferences.minAge)}"></div>
      <div class="field"><label for="filter-max-age">${escapeHtml(t('app.max_age'))}</label><input id="filter-max-age" type="number" min="18" max="100" value="${escapeHtml(preferences.maxAge)}"></div>
    </div>
    <div class="field"><span class="field-label" id="filter-languages-label">${escapeHtml(t('app.filter_languages'))}</span><div class="chip-set" id="filter-languages" role="group" aria-labelledby="filter-languages-label"></div><small class="filter-note" style="margin:0">${escapeHtml(t('app.filter_languages_hint'))}</small></div>
    <div class="field"><label for="filter-city">${escapeHtml(t('app.city'))}</label><input id="filter-city" maxlength="80" value="${escapeHtml(preferences.city)}" placeholder="${escapeHtml(t('app.any_city'))}"></div>
    <label class="check"><input id="filter-same-city" type="checkbox" ${preferences.sameCityOnly ? 'checked' : ''}> <span>${escapeHtml(t('app.same_city_only'))}</span></label>
    <button class="save-btn" id="filter-apply" type="button">${escapeHtml(t('app.apply_filters'))}</button>
    <button class="ghost-btn" id="filter-reset" type="button">${escapeHtml(t('app.reset_filters'))}</button>
    <p class="filter-note">${escapeHtml(t('app.filters_note'))}</p>
  `, () => {
    languageChips('filter-languages', preferences.languages || []);
    $('filter-apply').onclick = () => savePreferences({
      minAge: Number($('filter-min-age').value),
      maxAge: Number($('filter-max-age').value),
      city: $('filter-city').value,
      sameCityOnly: $('filter-same-city').checked,
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
function openTelegramLink(url) { if (!url) return; if (tg?.openTelegramLink && url.startsWith('https://t.me/')) tg.openTelegramLink(url); else if (tg?.openLink) tg.openLink(url); else window.open(url, '_blank', 'noopener'); }

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
  if (state.view === 'profile') renderAccount();
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
const LANGUAGE_IDS = ['en', 'fr', 'es', 'pt', 'ar', 'de', 'it', 'ru', 'sw', 'yo'];
const MAX_LANGUAGES = 5;

function languageName(id) { return t(`app.language_${id}`); }

// A chip group rather than a multi-select: it is legible on a phone, and it keeps the
// selection visible while the user reads the rest of the form.
function languageChips(hostId, selected) {
  const host = $(hostId);
  if (!host) return;
  const chosen = new Set(selected || []);
  host.innerHTML = LANGUAGE_IDS.map((id) =>
    `<button type="button" class="chip" data-language-chip="${escapeHtml(id)}" aria-pressed="${chosen.has(id)}">${escapeHtml(languageName(id))}</button>`).join('');
  host.querySelectorAll('[data-language-chip]').forEach((chip) => {
    chip.onclick = () => {
      const on = chip.getAttribute('aria-pressed') === 'true';
      // The cap is enforced by the API too; this only stops the user selecting a sixth and
      // then silently losing it on save.
      if (!on && readLanguageChips(hostId).length >= MAX_LANGUAGES) return;
      chip.setAttribute('aria-pressed', String(!on));
    };
  });
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
    rows.push(`<div class="prompt-row"><select aria-label="${escapeHtml(t('app.prompts_select_label'))}">${options}</select><input maxlength="200" aria-label="${escapeHtml(t('app.prompts_answer_label'))}" placeholder="${escapeHtml(t('app.prompt_placeholder'))}" value="${escapeHtml(value.answer)}"></div>`);
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
  const items = answered.map((prompt) => `<div class="card-prompt"><b>${escapeHtml(promptQuestion(prompt.id))}</b><p>${escapeHtml(prompt.answer)}</p></div>`).join('');
  return `<div class="card-prompts">${items}</div>`;
}

function renderAccount() {
  const account = state.account || {}, profile = account.profile || {};
  const name = profile.displayName || account.firstName || state.telegramUser?.first_name || t('app.bezy_member');
  const photo = account.photoUrl || state.telegramUser?.photo_url || '';
  if ($('my-name')) $('my-name').textContent = name;
  if ($('profile-status')) {
    $('profile-status').textContent = !account.profileComplete ? t('app.complete_profile')
      : account.discoverable ? t('app.profile_live') : t('app.profile_hidden');
  }
  if ($('display-name')) $('display-name').value = profile.displayName || account.firstName || '';
  if ($('age')) $('age').value = profile.age || '';
  if ($('city')) $('city').value = profile.city || '';
  if ($('gender')) $('gender').value = profile.gender || 'prefer_not_to_say';
  if ($('seeking')) $('seeking').value = profile.seeking || 'everyone';
  if ($('interests')) $('interests').value = Array.isArray(profile.interests) ? profile.interests.join(', ') : '';
  if ($('bio')) $('bio').value = profile.bio || '';
  renderPromptEditor(Array.isArray(profile.prompts) ? profile.prompts : []);
  languageChips('languages-list', Array.isArray(profile.languages) ? profile.languages : []);
  if ($('discoverable')) $('discoverable').checked = Boolean(profile.discoverable);
  if ($('my-avatar')) $('my-avatar').innerHTML = photo ? `<img src="${escapeHtml(photo)}" alt="">` : escapeHtml(name.charAt(0).toUpperCase() || 'B');
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

const NOTIFICATION_CATEGORIES = ['matches', 'super_likes', 'profile_reminders'];
const NOTIFICATION_NOTES = { super_likes: 'app.notify_super_likes_note', profile_reminders: 'app.notify_profile_reminders_note' };

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
}

// One card renderer for both Discover and the profile preview, so what a user sees when
// previewing their own profile is literally the markup other people are served.
function profileCardHtml(profile, { actions = false } = {}) {
  const initial = (profile.displayName || 'B').charAt(0).toUpperCase();
  const image = profile.photoUrl ? `<img src="${escapeHtml(profile.photoUrl)}" alt="">` : '';
  const age = profile.age ? `, ${escapeHtml(profile.age)}` : '';
  const meta = [profile.city, profile.bio].filter(Boolean).map(escapeHtml).join(' · ');
  const tags = languageTags(profile.languages)
    + (profile.interests || []).slice(0, 5).map((interest) => `<span class="tag">${escapeHtml(interest)}</span>`).join('');
  const score = profile.compatibility ? `<div class="score">${escapeHtml(profile.compatibility)}% ${escapeHtml(t('app.match_score'))}</div>` : '';
  const controls = actions
    ? `<div class="actions"><button class="action pass" id="passBtn" type="button">✕ ${escapeHtml(t('app.pass'))}</button><button class="action super" id="superBtn" type="button">★ ${escapeHtml(t('app.super'))}</button><button class="action like" id="likeBtn" type="button">♥ ${escapeHtml(t('app.like'))}</button></div>`
    : '';
  return `<article class="profile-card" id="profile-card"><div class="portrait">${image}${score}<div class="avatar-letter">${escapeHtml(initial)}</div><div class="portrait-overlay"></div><div class="profile-copy"><h2>${escapeHtml(profile.displayName || t('app.bezy_member'))}${age}</h2><p>${meta || '💜 Bezy'}</p><div class="tags">${tags}</div></div></div>${promptCardHtml(profile)}${controls}</article>`;
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
    host.innerHTML = `<div class="empty">${escapeHtml(state.account?.profileComplete ? t('app.no_profiles') : t('app.complete_profile'))}</div>`;
    return;
  }
  host.innerHTML = profileCardHtml(profile, { actions: true });
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
    const data = await api(API.discover);
    state.profiles = data.profiles || [];
    state.stats = data.stats || null;
    state.preferences = data.preferences || state.preferences;
    state.currentIndex = 0;
    renderDiscover();
  } catch (error) {
    const host = $('discover-content'); if (host) host.innerHTML = `<div class="empty">${escapeHtml(errorText(error))}</div>`;
  }
}
async function actOnCurrent(action) {
  const profile = state.profiles[state.currentIndex]; if (!profile) return;
  try {
    const result = await api(API.swipe, { body: { targetId: profile.id, action } });
    state.profiles.splice(state.currentIndex, 1);
    if (state.stats) state.stats.available = Math.max(0, (state.stats.available || 1) - 1);
    if (result.matched) { showToast(t('app.match_created')); await loadMatches(); }
    renderDiscover();
  } catch (error) {
    if (error.error === 'DISCOVERY_LIMIT_REACHED') { showToast(t('app.discovery_limit')); showView('premium'); return; }
    if (error.error === 'SUPER_LIKE_LIMIT_REACHED') { showToast(t('app.super_like_limit')); showView('premium'); return; }
    showToast(errorText(error));
  }
}

// ---------------------------------------------------------------------------
// Why you matched, and the openers derived from it
// Both read the same `sharedSignals` the backend attaches to a match, so the explanation
// and the suggestion can never describe different things. The API returns these only for
// mutual matches, which is what keeps them out of reach before both people have opted in.
// ---------------------------------------------------------------------------

function signalText(signal) {
  const values = (signal?.values || []).map((value) => String(value)).join(', ');
  if (signal?.type === 'interests' && values) return t('app.why_interests').replace('{values}', values);
  if (signal?.type === 'city' && values) return t('app.why_city').replace('{values}', values);
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
    }
    if (suggestions.length >= 3) break;
  }
  if (!suggestions.length) suggestions.push(t('app.starter_generic'));
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
  const body = suggestions.map((suggestion, index) => `<div class="starter"><p>${escapeHtml(suggestion)}</p><button type="button" data-starter="${index}">${escapeHtml(t('app.starter_copy'))}</button></div>`).join('');
  openSheet(t('app.starters_title'), `${whyMatchedHtml(match)}${body}<p class="filter-note">${escapeHtml(t('app.starters_hint'))}</p>`, (host) => {
    host.querySelectorAll('[data-starter]').forEach((button) => {
      button.onclick = () => copyText(suggestions[Number(button.dataset.starter)]);
    });
  });
}

function renderMatches() {
  const grid = $('match-grid'), empty = $('matches-empty'), conversations = $('conversation-list'), messageEmpty = $('message-empty');
  if (!grid || !empty || !conversations || !messageEmpty) return;
  if (!state.matches.length) { grid.innerHTML = ''; empty.textContent = t('app.no_matches'); empty.classList.remove('hidden'); conversations.innerHTML = ''; messageEmpty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = state.matches.map((match) => {
    const initial = (match.displayName || 'B').charAt(0).toUpperCase(); const image = match.photoUrl ? `<img src="${escapeHtml(match.photoUrl)}" alt="">` : escapeHtml(initial);
    const button = match.username ? `<button class="match-open" data-chat="${escapeHtml(match.username)}" type="button">${escapeHtml(t('app.open_chat'))}</button>` : `<button class="match-open" data-nochat="1" type="button">${escapeHtml(t('app.open_chat'))}</button>`;
    return `<article class="match-card"><div class="match-photo">${image}</div><div class="match-info"><b>${escapeHtml(match.displayName || t('app.bezy_member'))}${match.age ? `, ${escapeHtml(match.age)}` : ''}</b><span>${escapeHtml(match.city || '')}</span>${whyMatchedHtml(match)}${button}<button class="match-open" data-starters="${escapeHtml(match.id)}" type="button">${escapeHtml(t('app.starters_title'))}</button><button class="match-open" data-actions="${escapeHtml(match.id)}" type="button">${escapeHtml(t('app.safety_actions'))}</button></div></article>`;
  }).join('');
  grid.querySelectorAll('[data-chat]').forEach((button) => button.onclick = () => openTelegramLink(`https://t.me/${button.dataset.chat}`));
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
  grid.querySelectorAll('[data-nochat]').forEach((button) => button.onclick = () => showToast(t('app.open_chat')));
  conversations.innerHTML = state.matches.map((match) => {
    const initial = (match.displayName || 'B').charAt(0).toUpperCase(); const avatar = match.photoUrl ? `<img src="${escapeHtml(match.photoUrl)}" alt="">` : escapeHtml(initial);
    const action = match.username ? `<button class="match-open" data-chat="${escapeHtml(match.username)}" type="button">${escapeHtml(t('app.open_chat'))}</button>` : '';
    const starters = `<button class="match-open" data-starters="${escapeHtml(match.id)}" type="button">${escapeHtml(t('app.starters_title'))}</button>`;
    const when = relativeTime(match.matchedAt);
    return `<div class="conversation"><div class="conv-avatar">${avatar}</div><div class="conv-main"><b>${escapeHtml(match.displayName || t('app.bezy_member'))}</b><p>${escapeHtml(t('app.conversation_hint'))}</p>${action}${starters}</div><span class="time">${escapeHtml(when)}</span></div>`;
  }).join('');
  messageEmpty.classList.add('hidden'); conversations.querySelectorAll('[data-chat]').forEach((button) => button.onclick = () => openTelegramLink(`https://t.me/${button.dataset.chat}`));
  conversations.querySelectorAll('[data-starters]').forEach((button) => {
    button.onclick = () => {
      const match = state.matches.find((m) => m.id === button.dataset.starters);
      if (match) openStarters(match);
    };
  });
}
// ---------------------------------------------------------------------------
// Bezy Premium
// The Mini App only ever displays membership state returned by the backend. It never
// marks the user Premium itself, and prices always come from the server.
// ---------------------------------------------------------------------------

const BENEFIT_KEYS = { who_liked_you: 'app.benefit_who_liked_you', advanced_discovery: 'app.benefit_advanced_discovery', more_super_likes: 'app.benefit_more_super_likes', increased_visibility: 'app.benefit_increased_visibility', unlimited_discovery: 'app.benefit_unlimited_discovery' };

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
  if ($('premium-buy')) $('premium-buy').onclick = startCheckout;
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
    renderLikers();
    if (result.matched) { showToast(t('app.match_created')); await loadMatches(); }
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
  await loadLikes();
}

async function loadLikes() {
  try {
    const data = await api(API.likes);
    state.likes = data.likes || [];
    state.likeCount = data.likeCount || 0;
  } catch (error) {
    // A free member is expected to be refused here; the count is still shown as a teaser.
    state.likes = [];
    state.likeCount = error.likeCount || 0;
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
    tg.openInvoice(invoiceLink, async (status) => {
      if (status === 'paid') {
        showToast(t('app.payment_received'));
        // Telegram reporting "paid" is not proof of entitlement: the backend activates
        // Premium from the webhook, so the app re-reads authoritative membership state.
        await refreshPremiumUntilActive();
      } else if (status === 'cancelled') showToast(t('app.payment_cancelled'));
      else if (status === 'failed') showToast(t('app.payment_failed'));
      else if (status === 'pending') showToast(t('app.payment_pending'));
    });
  } catch (error) {
    showToast(error.error === 'INVALID_PLAN' ? t('app.error_generic') : t('app.payment_failed'));
  } finally {
    if (button) { button.disabled = false; renderPremium(); }
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
        renderPremium();
        await loadLikes();
        showToast(t('app.premium_active'));
        return true;
      }
    } catch { /* retried below */ }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
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
    <button class="ghost-btn" data-act="chat">${escapeHtml(t('app.open_chat'))}</button>
    <button class="ghost-btn" data-act="unmatch">${escapeHtml(t('app.unmatch'))}</button>
    <button class="ghost-btn" data-act="block">${escapeHtml(t('app.block'))}</button>
    <button class="ghost-btn" data-act="report" style="color:var(--danger)">${escapeHtml(t('app.report'))}</button>
    <p class="filter-note">${escapeHtml(t('app.safety_sheet_note'))}</p>
  `, (host) => {
    host.querySelector('[data-act="chat"]').onclick = () => {
      closeSheet();
      if (match.username) openTelegramLink(`https://t.me/${match.username}`); else showToast(t('app.open_chat'));
    };
    host.querySelector('[data-act="unmatch"]').onclick = () => confirmAction('unmatch', match);
    host.querySelector('[data-act="block"]').onclick = () => confirmAction('block', match);
    host.querySelector('[data-act="report"]').onclick = () => openReportSheet(match);
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
        await api(API.relationship, { body: { action, targetId: match.id } });
        closeSheet();
        showToast(t(`app.${action}_done`));
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
        await loadMatches();
      } catch (error) { showToast(errorText(error)); }
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

async function loadMatches(messagesView = false) { try { const data = await api(API.matches); state.matches = data.matches || []; renderMatches(); } catch (error) { if (messagesView) showToast(errorText(error)); } }

async function saveProfile(event) {
  event.preventDefault();
  const profile = { displayName: $('display-name').value, age: Number($('age').value), city: $('city').value, gender: $('gender').value, seeking: $('seeking').value, interests: $('interests').value.split(',').map((value) => value.trim()).filter(Boolean), bio: $('bio').value, prompts: readPromptEditor(), languages: readLanguageChips('languages-list'), discoverable: $('discoverable').checked };
  try { const data = await api(API.profile, { body: { profile } }); state.account = data.profile; renderAccount(); showToast(t('app.profile_saved')); if (state.account.profileComplete && state.account.discoverable) showView('discover'); }
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
function denyAge() {
  const host = document.querySelector('#age-view .age-gate');
  if (!host) return;
  document.body.classList.add('age-gated');
  host.innerHTML = `<div class="age-badge">18+</div><h2>${escapeHtml(t('app.age_blocked_title'))}</h2><p>${escapeHtml(t('app.age_blocked_body'))}</p>`;
}

function bindEvents() {
  if (bindEvents.done) return;
  bindEvents.done = true;
  // Navigation is bound before startup finishes, so a tap during loading must win over
  // the initial routing decision rather than being silently undone by it.
  document.addEventListener('click', (event) => { if (event.target.closest('.nav button, #premiumBtn, .premium-action, #settingsBtn')) state.userNavigated = true; }, true);
  document.querySelectorAll('.nav button').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  if ($('settingsBtn')) $('settingsBtn').onclick = () => showView('profile');
  if ($('discoverBtn')) $('discoverBtn').onclick = () => showView('discover');
  if ($('premiumBtn')) $('premiumBtn').onclick = () => showView('premium');
  if ($('premium-back')) $('premium-back').onclick = () => showView('discover');
  document.querySelectorAll('.premium-action').forEach((button) => button.onclick = () => showView('premium'));
  if ($('profile-form')) $('profile-form').addEventListener('submit', saveProfile);
  if ($('preview-profile-btn')) $('preview-profile-btn').onclick = openPreview;
  if ($('profile-refresh')) $('profile-refresh').onclick = async () => { try { await loadAccount(); showToast(t('app.profile_saved')); } catch (error) { showToast(errorText(error)); } };
  if ($('filterBtn')) $('filterBtn').onclick = openFilters;
  if ($('blocked-list-btn')) $('blocked-list-btn').onclick = openBlockedList;
  if ($('export-data-btn')) $('export-data-btn').onclick = exportMyData;
  if ($('restrict-btn')) $('restrict-btn').onclick = openRestrict;
  if ($('object-btn')) $('object-btn').onclick = openObjection;
  if ($('delete-account-btn')) $('delete-account-btn').onclick = openDeleteAccount;
  if ($('age-confirm')) $('age-confirm').onclick = confirmAge;
  if ($('age-deny')) $('age-deny').onclick = denyAge;
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });
  document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', async () => { try { await loadLocale(button.dataset.language); renderAccount(); } catch { showToast(t('app.error_generic')); } }));
}

async function init() {
  if (!tg?.initData) {
    // Opened outside Telegram. The only way in is the bot itself, so the gate says why and
    // links there — the bot's /start message carries the "Open Bezy" button. Rendered before
    // any locale loads, so it follows the browser language directly.
    const french = String(navigator?.language || '').toLowerCase().startsWith('fr');
    const title = french ? 'Ouvrez Bezy depuis Telegram pour continuer.' : 'Open Bezy from Telegram to continue.';
    const button = french ? 'Ouvrir Bezy dans Telegram' : 'Open Bezy in Telegram';
    document.body.innerHTML = `<main style="padding:48px 24px;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui;text-align:center;color:#1d1924;background:#f8f7fb"><img src="/assets/bezy-icon.png" alt="Bezy" width="96" height="96" style="border-radius:26px;box-shadow:0 10px 26px rgba(124,58,237,.25);margin:0 auto 18px;display:block"><h2 style="margin:0 0 8px;font-size:26px">Bezy</h2><p style="color:#77727f;margin:0 0 26px;font-size:14px">${title}</p><a href="https://t.me/BezyDatingBot" style="display:inline-block;padding:13px 30px;border-radius:14px;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;text-decoration:none;font-weight:800;font-size:14px">${button}</a></main>`;
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

  const storedLanguage = (() => { try { return localStorage.getItem('bezy-language'); } catch { return null; } })();
  try {
    await loadLocale(storedLanguage || languageFromTelegram());
  } catch (error) {
    console.error('[Bezy] Locale initialization failed:', error);
    state.lang = 'en';
    state.dict = { app: {
      tagline: 'Meet someone worth knowing.', discover: 'Discover', matches: 'Matches', messages: 'Messages', profile: 'Profile', for_you: 'For you', filters: 'Filters', pass: 'Pass', super: 'Super', like: 'Like', your_matches: 'Your matches', protected_by_bezy: 'Protected by Bezy', view_membership: 'View membership', unlock_premium: 'Unlock Premium', privacy: 'Privacy', terms: 'Terms', settings: 'Settings', no_conversations: 'Your conversations will appear here after a mutual match.', discover_intro: 'Real people. Mutual interest. Conversations that stay on Telegram.', discover_title: 'Find your kind of connection.', premium_copy: 'See who liked you, unlock advanced discovery and get more ways to connect.', matches_premium_copy: 'Premium members get more discovery options and can see who already liked them.', best_match: 'best match', new_today: 'new today', loading: 'Loading…', refresh: 'Refresh', open_chat: 'Open Telegram chat', no_matches: 'No matches yet. Keep discovering — your next connection could be here.', no_profiles: 'No more profiles right now. Check back soon.', complete_profile: 'Complete your profile to start discovering people.', profile_saved: 'Your profile has been saved.', match_created: 'It’s a match! 💜', error_generic: 'Something went wrong. Please try again.', show_profile: 'Show my profile in Discover', legal_privacy: 'Legal & privacy', language: 'Language', edit_profile: 'Edit profile', display_name: 'Display name', age: 'Age', city: 'City', gender: 'I am', seeking: 'Looking for', interests: 'Interests', interests_placeholder: 'Travel, music, books', bio: 'About me', woman: 'Woman', man: 'Man', non_binary: 'Non-binary', prefer_not_to_say: 'Prefer not to say', women: 'Women', men: 'Men', everyone: 'Everyone', save_profile: 'Save profile', my_profile: 'My profile',
      people_available: 'people to discover', match_score: 'match', min_age: 'Minimum age', max_age: 'Maximum age', any_city: 'Any city', same_city_only: 'Only show people in my city', apply_filters: 'Apply filters', reset_filters: 'Reset filters', filters_applied: 'Filters applied.', filters_note: 'Filters are saved to your account and applied every time you open Discover.', conversation_hint: 'Matched — your conversation continues in Telegram.', profile_live: 'Your profile is live in Discover.', profile_hidden: 'Your profile is saved but hidden from Discover.',
      premium_title: 'Bezy Premium', premium_intro: 'Unlock more ways to discover meaningful connections.', premium_active_intro: "You're a Premium member. Thank you for supporting Bezy.", benefit_who_liked_you: 'See who liked you', benefit_advanced_discovery: 'Advanced discovery', benefit_more_super_likes: 'More Super Likes', benefit_increased_visibility: 'Increased visibility', benefit_unlimited_discovery: 'Unlimited discovery', choose_plan: 'Choose your plan', plan: 'Plan', plan_monthly: 'Monthly', plan_quarterly: 'Quarterly', plan_yearly: 'Yearly', months_count: '{n} months of Premium', best_value: 'Best value', subscribe_with_stars: 'Subscribe with Telegram Stars', renew_with_stars: 'Renew with Telegram Stars', renew: 'Renew or extend', active_until: 'Active until', days_remaining: 'Days remaining', stars_note: 'Payment is handled inside Telegram with Stars. Bezy never sees your card details.', stars_needed: 'You need Telegram Stars in your balance to subscribe. You can top up in Telegram under Settings, then My Stars.', not_telegram_premium: 'Telegram Premium is a separate Telegram subscription. It does not include Bezy Premium - Bezy Premium is paid separately with Stars.', who_liked_you: 'Who liked you', who_liked_you_locked: 'Premium members can see everyone who already liked them, and match instantly.', likes_waiting: '{n} people already liked you', no_likes_yet: 'No one is waiting yet. Keep discovering.', preparing_checkout: 'Preparing checkout…', payment_cancelled: 'Payment cancelled.', payment_failed: "We couldn't start the payment. Please try again.", payment_received: 'Payment received. Activating your Bezy Premium…', payment_pending: 'Your payment is still processing.', payment_processing: 'Your payment is being processed. Premium will activate shortly.', payment_unsupported: 'Please update Telegram to pay with Stars.', premium_active: '💎 Bezy Premium is active.', premium_required: 'This is a Premium feature.', premium_expired: 'Your Bezy Premium has expired.', premium_revoked: 'Your Bezy Premium was refunded.', premium_lapsed_hint: 'You can subscribe again below. Your profile, matches and conversations are unaffected.', discovery_limit: "You've reached today's discovery limit. Premium removes it.", super_like_limit: "You've used today's Super Likes. Premium gives you more.",
      more_connections: 'More connections', navigation: 'Bezy navigation', close: 'Close', bezy_member: 'Bezy member', meta_description: 'Bezy — meet someone worth knowing, entirely inside Telegram.', error_session: 'Your Telegram session could not be verified. Please reopen Bezy.', error_database: 'Bezy could not reach its database. Please try again.', error_profile_missing: 'Complete your profile to start discovering people.', error_target_missing: 'That profile is no longer available.',
      age_gate_title: 'Bezy is only available to people aged 18 and over.', age_gate_body: 'By continuing, I confirm that I am 18 or older.', age_confirm: 'I am 18 or older', age_deny: 'I am under 18', age_note: 'Bezy does not verify identity or age. This is your own declaration.', age_blocked_title: 'Bezy is for adults aged 18 and over.', age_blocked_body: 'You cannot create a Bezy profile, discover people or match. Thank you for being honest.', error_age_required: 'Please confirm you are 18 or older to continue.', rate_limited: "You're going a little fast. Please try again in a moment.", rate_limited_minutes: "You've done that too many times. Please try again in about {n} minutes."
    }};
    document.documentElement.lang = 'en';
    applyLocale();
  }

  try {
    const account = await loadAccount();
    const requestedView = account.needsAgeConfirmation
      ? 'age'
      : new URLSearchParams(location.search).get('view') || (account.needsProfile ? 'profile' : 'discover');
    if (!state.userNavigated || account.needsAgeConfirmation) showView(requestedView);
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
