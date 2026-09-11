const tg = window.Telegram?.WebApp;
const API = { profile: '/api/profile/me', discover: '/api/discover', swipe: '/api/swipe', matches: '/api/matches', premium: '/api/premium', likes: '/api/likes', relationship: '/api/relationship', account: '/api/account', support: '/api/support' };
const state = { lang: null, dict: null, telegramUser: null, account: null, profiles: [], matches: [], stats: null, preferences: null, notifications: null, processingRestricted: false, processingObjection: false, emptyReason: null, currentIndex: 0, view: 'discover', premium: null, likes: null, likeCount: 0, selectedPlan: 'yearly', userNavigated: false };
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
  setText('messages-title', t('app.messages')); setText('protected-label', t('app.protected_by_bezy')); setText('conversation-note', t('app.conversation_hint')); setText('profile-title', t('app.my_profile')); setText('profile-refresh-label', t('app.refresh')); setText('edit-profile', t('app.edit_profile')); setText('settings-privacy-label', t('app.settings_privacy')); setText('core-profile-label', t('app.core_profile')); setText('saved-badge', t('app.saved_badge'));
  setText('display-name-label', t('app.display_name')); setText('age-label', t('app.age')); setText('city-label', t('app.city')); setText('gender-label', t('app.gender')); setText('seeking-label', t('app.seeking')); setText('interests-label', t('app.interests')); setText('bio-label', t('app.bio'));
  setText('discoverable-label', t('app.show_profile')); setText('discoverable-note', t('app.discoverable_note')); setText('save-profile', t('app.save_profile')); setText('language-title', t('app.language')); setText('privacy-link', t('app.privacy')); setText('terms-link', t('app.terms')); setText('support-title', t('app.support_title')); setText('support-intro', t('app.support_intro')); setText('support-bot-btn', t('app.support_help')); setText('support-history-btn', t('app.support_history')); setText('support-formal', t('app.support_formal')); setText('support-expectation', t('app.support_expectation')); setText('support-email-btn', t('app.support_email')); setText('interests-add-btn', t('app.add_interest')); setText('legal-help-btn', t('app.legal_help')); setText('footer-note', t('app.footer_note'));
  setText('people-label', t('app.people_available')); setText('match-label', t('app.best_match')); setText('new-label', t('app.new_today')); setText('message-empty', t('app.no_conversations')); setText('matches-empty', t('app.no_matches'));
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
  if (state.premium) renderPremium();
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
    // An emptied numeric input serializes as Number('') === 0, which the backend clamps to
    // maxAge 18 — an accidental filter that hides nearly everyone. A missing value means the
    // default bound instead, so clearing a field can never shrink the deck by accident.
    $('filter-apply').onclick = () => savePreferences({
      minAge: Number($('filter-min-age').value) || 18,
      maxAge: Number($('filter-max-age').value) || 100,
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
function openTelegramLink(url) {
  if (!url) return;
  // https://t.me links go through the WebApp API's documented input and never the in-app
  // browser. tg:// is Telegram's own in-app scheme (tg://user?id= for a matched user
  // without a @username): it is NOT the documented input of openTelegramLink — clients
  // reject or silently drop it — so it is handed to the client's native opener by
  // navigating the webview, which Telegram intercepts for its own scheme.
  if (url.startsWith('https://t.me/')) {
    if (tg?.openTelegramLink) { tg.openTelegramLink(url); return; }
    if (tg?.openLink) { tg.openLink(url); return; }
    window.open(url, '_blank', 'noopener');
    return;
  }
  if (url.startsWith('tg://')) {
    // Recorded first so the test harness can observe the handoff without a real Telegram
    // client; inert in production.
    window.__lastTelegramLink = url;
    window.location.href = url;
  }
}

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
  const items = answered.map((prompt) => `<div class="card-prompt"><b>${escapeHtml(promptQuestion(prompt.id))}</b><p>${escapeHtml(prompt.answer)}</p></div>`).join('');
  return `<div class="card-prompts">${items}</div>`;
}

// ---------------------------------------------------------------------------
// Profile hero & chip editors
// The hero card mirrors the form fields, and the completion percentage is
// derived from what the profile actually holds rather than a stored number.
// ---------------------------------------------------------------------------

function profileCompletionPercent() {
  const account = state.account || {}, profile = account.profile || {};
  const checks = [
    Boolean(profile.displayName || account.firstName),
    Boolean(profile.age),
    Boolean(profile.city),
    Boolean(profile.gender),
    Boolean(profile.bio),
    Boolean((profile.interests || []).length),
    Boolean((profile.languages || []).length),
    Boolean((profile.prompts || []).some((prompt) => prompt?.id && String(prompt?.answer || '').trim())),
    Boolean(account.photoUrl || state.telegramUser?.photo_url)
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
  $('profile-settings-panel')?.classList.toggle('hidden', edit);
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
  const meta = [profile.city, profile.bio].filter(Boolean).map(escapeHtml).join(' · ');
  const isNewChip = profile.isNew ? `<span class="tag">🆕 ${escapeHtml(t('app.new_today'))}</span>` : '';
  const tags = languageTags(profile.languages) + isNewChip
    + (profile.interests || []).slice(0, 5).map((interest) => `<span class="tag">${escapeHtml(interest)}</span>`).join('');
  // "Why this person?" for everyone, computed only from facts the card already shows —
  // shared interests, shared languages, same city. Premium viewers get the richer numeric
  // breakdown instead, so this line renders only for free users. The preview passes
  // { actions: false }, so it never renders there.
  const mine = state.account?.profile || {};
  const shares = [];
  if (actions && !profile.breakdown) {
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
  const controls = actions
    ? `<div class="actions"><button class="action pass" id="passBtn" type="button">✕ ${escapeHtml(t('app.pass'))}</button><button class="action super" id="superBtn" type="button">★ ${escapeHtml(t('app.super'))}</button><button class="action like" id="likeBtn" type="button">♥ ${escapeHtml(t('app.like'))}</button></div>`
    : '';
  return `<article class="profile-card" id="profile-card"><div class="portrait">${image}${score}<div class="avatar-letter">${escapeHtml(initial)}</div><div class="portrait-overlay"></div><div class="profile-copy"><h2>${escapeHtml(profile.displayName || t('app.bezy_member'))}${age}</h2><p>${meta || '💜 Bezy'}</p><div class="tags">${tags}</div>${whyLine}${breakdown}</div></div>${promptCardHtml(profile)}${controls}</article>`;
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
        try { await savePreferences({ minAge: 18, maxAge: 100, city: '', sameCityOnly: false, languages: [] }); await loadDiscover(); } catch { /* toast from savePreferences */ }
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
    state.emptyReason = data.emptyReason ?? null;
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
  // The suggestion list is never empty: starterSuggestions falls back to the generic opener
  // when no shared signal yields one, so the sheet always gives the user something usable.
  openSheet(t('app.starters_title'), `${whyMatchedHtml(match)}<div class="starter-head">${escapeHtml(t('app.start_with'))}</div>${body}<p class="filter-note">${escapeHtml(t('app.starters_hint'))}</p>`, (host) => {
    host.querySelectorAll('[data-starter]').forEach((button) => {
      button.onclick = () => copyText(suggestions[Number(button.dataset.starter)]);
    });
  });
}

// The conversation hand-off link for a matched user. With a @username the public t.me link
// opens their chat or profile directly. Without one, the Mini App webview cannot fire
// tg:// deep links reliably on any platform, so the CTA opens the Bezy bot with a start
// payload: the bot re-sends the match notification, whose "Open Telegram chat" button is
// resolved by the Telegram client itself — the supported path to a username-less profile.
function chatLinkFor(match) {
  const username = String(match?.username || '').trim().replace(/^@/, '');
  if (username) return `https://t.me/${username}`;
  const matchId = String(match?.matchId || '').trim();
  if (matchId) return `https://t.me/BezyDatingBot?start=match_${matchId}`;
  return '';
}

// A local, per-match marker flips the label from "Start conversation" to "Continue
// conversation" after the first tap. The actual conversation stays entirely on Telegram;
// this marker is only a label switch and never leaves the device.
function chatOpenedKey(matchId) { return `bezy-chat-opened-${matchId}`; }
function hasChatOpened(matchId) { try { return localStorage.getItem(chatOpenedKey(matchId)) === '1'; } catch { return false; } }
function markChatOpened(matchId) { try { localStorage.setItem(chatOpenedKey(matchId), '1'); } catch { /* label only */ } }
function chatLabel(match) { return t(hasChatOpened(match?.matchId) ? 'app.continue_conversation' : 'app.start_conversation'); }

function chatButtonHtml(match, className = 'match-open') {
  const link = chatLinkFor(match);
  if (!link) return '';
  return `<button class="${className}" data-chat="${escapeHtml(link)}" data-match="${escapeHtml(match.matchId || '')}" type="button">${escapeHtml(chatLabel(match))}</button>`;
}

function bindChatButtons(root) {
  root.querySelectorAll('[data-chat]').forEach((button) => {
    button.onclick = () => {
      if (button.dataset.match) { markChatOpened(button.dataset.match); button.textContent = t('app.continue_conversation'); }
      openTelegramLink(button.dataset.chat);
    };
  });
}

// One full-width card per match: photo header, the why-you-matched chips, an icebreaker
// teaser drawn from their first answered prompt, and the three actions in the design's
// primary-to-tertiary order. The card keeps the `match-card` class and the `.match-info b`
// name element the e2e specs pin. `idPrefix` keeps card ids unique when the same renderer
// feeds both the Matches and the Messages tabs (both views live in one document).
function matchCardHtml(match, idPrefix = '') {
  const initial = (match.displayName || 'B').charAt(0).toUpperCase();
  const image = match.photoUrl ? `<img src="${escapeHtml(match.photoUrl)}" alt="">` : '';
  const age = match.age ? `, ${escapeHtml(match.age)}` : '';
  const city = match.city ? `<span class="mf-city"><span aria-hidden="true">📍</span>${escapeHtml(match.city)}</span>` : '';
  const chat = chatButtonHtml(match, 'mf-primary');
  const firstPrompt = (match.prompts || []).find((prompt) => prompt?.id && String(prompt?.answer || '').trim());
  const icebreaker = firstPrompt
    ? `<div class="mf-icebreaker"><span class="mf-icebreaker-label">${escapeHtml(t('app.icebreaker_label').replace('{name}', match.displayName || t('app.bezy_member')))}</span><p>${escapeHtml(firstPrompt.answer)}</p></div>`
    : '';
  // A matched user without a @username has no t.me link: Telegram can only open their
  // profile from the numeric deep link, and the first message is one tap from there. Say so
  // instead of leaving the user to guess why a chat did not open directly.
  const username = String(match.username || '').trim().replace(/^@/, '');
  const handoffHint = username ? '' : `<p class="mf-handoff-hint">${escapeHtml(t('app.chat_no_username_hint'))}</p>`;
  return `<article class="match-card" id="${idPrefix}match-${escapeHtml(match.id)}">
    <div class="mf-photo">${image}<span class="mf-photo-glow" aria-hidden="true"></span>${image ? '' : `<span class="mf-initial" aria-hidden="true">${escapeHtml(initial)}</span>`}<span class="mf-photo-shade" aria-hidden="true"></span>
      <div class="mf-photo-info match-info"><b class="mf-name">${escapeHtml(match.displayName || t('app.bezy_member'))}${age}</b>${city}</div>
    </div>
    <div class="mf-body">
      ${whyMatchedHtml(match)}
      ${icebreaker}
      <div class="mf-actions">
        ${chat}
        <button class="mf-action" data-starters="${escapeHtml(match.id)}" type="button">${escapeHtml(t('app.starters_title'))}</button>
        <button class="mf-action mf-safety" data-actions="${escapeHtml(match.id)}" type="button">${escapeHtml(t('app.safety_actions'))}</button>
      </div>
      ${handoffHint}
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

function renderMatches() {
  const grid = $('match-grid'), empty = $('matches-empty'), conversations = $('conversation-list'), messageEmpty = $('message-empty'), carousel = $('matches-carousel');
  if (!grid || !empty || !conversations || !messageEmpty) return;
  setText('match-count', String(state.matches.length));
  if (!state.matches.length) { grid.innerHTML = ''; empty.textContent = t('app.no_matches'); empty.classList.remove('hidden'); conversations.innerHTML = ''; messageEmpty.classList.remove('hidden'); if (carousel) carousel.innerHTML = ''; return; }
  empty.classList.add('hidden');
  if (carousel) carousel.innerHTML = matchesCarouselHtml(state.matches);
  grid.innerHTML = state.matches.map(matchCardHtml).join('');
  bindChatButtons(grid);
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
  // The Messages tab renders the same card hierarchy as Matches — why you matched, the
  // conversation CTA, ways to start, safety — so a conversation is always one primary tap
  // away, and the copy above the list explains that it continues in Telegram.
  conversations.innerHTML = state.matches.map((match) => matchCardHtml(match, 'c')).join('');
  messageEmpty.classList.add('hidden');
  bindChatButtons(conversations);
  conversations.querySelectorAll('[data-starters]').forEach((button) => {
    button.onclick = () => {
      const match = state.matches.find((m) => m.id === button.dataset.starters);
      if (match) openStarters(match);
    };
  });
  conversations.querySelectorAll('[data-actions]').forEach((button) => {
    button.onclick = () => {
      const match = state.matches.find((m) => m.id === button.dataset.actions);
      if (match) openMatchActions(match);
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
    <button class="ghost-btn" data-act="chat">${escapeHtml(chatLabel(match))}</button>
    <button class="ghost-btn" data-act="unmatch">${escapeHtml(t('app.unmatch'))}</button>
    <button class="ghost-btn" data-act="block">${escapeHtml(t('app.block'))}</button>
    <button class="ghost-btn" data-act="report" style="color:var(--danger)">${escapeHtml(t('app.report'))}</button>
    <p class="filter-note">${escapeHtml(t('app.safety_sheet_note'))}</p>
  `, (host) => {
    host.querySelector('[data-act="chat"]').onclick = () => {
      closeSheet();
      const link = chatLinkFor(match);
      if (!link) { showToast(t('app.error_generic')); return; }
      markChatOpened(match.matchId);
      openTelegramLink(link);
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
  try {
    const data = await api(API.support, { body: { action: 'list' } });
    const requests = data.requests || [];
    $('support-history-list').innerHTML = requests.length
      ? requests.map((r) => `<div class="menu-row"><div class="left"><b>${escapeHtml(r.reference)}</b><span>${escapeHtml(supportCategoryLabel(r.category))} · ${escapeHtml(supportStatusLabel(r.status))}${r.createdAt ? ` · ${escapeHtml(r.createdAt.slice(0, 10))}` : ''}</span></div></div>`).join('')
      : `<div class="empty">${escapeHtml(t('app.support_history_empty'))}</div>`;
  } catch (error) {
    $('support-history-list').innerHTML = `<div class="empty">${escapeHtml(errorText(error))}</div>`;
  }
  // Intake lives behind the history, so the card itself keeps exactly two CTAs: Get help
  // and My support requests. This button opens the same structured form as before.
  const newRequest = document.createElement('button');
  newRequest.id = 'support-new-btn';
  newRequest.className = 'ghost-btn';
  newRequest.type = 'button';
  newRequest.textContent = t('app.support_contact');
  newRequest.style.marginTop = '12px';
  $('support-history-list').after(newRequest);
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

async function loadMatches(messagesView = false) { try { const data = await api(API.matches); state.matches = data.matches || []; renderMatches(); } catch (error) { if (messagesView) showToast(errorText(error)); } }

async function saveProfile(event) {
  event.preventDefault();
  const profile = { displayName: $('display-name').value, age: Number($('age').value), city: $('city').value, gender: $('gender').value, seeking: $('seeking').value, interests: $('interests').value.split(',').map((value) => value.trim()).filter(Boolean), bio: $('bio').value, prompts: readPromptEditor(), languages: readLanguageChips('languages-list'), discoverable: $('discoverable').checked };
  try { const data = await api(API.profile, { body: { profile } }); state.account = data.profile; renderAccount(); showToast(t('app.profile_saved')); flashSavedBadge(); if (state.account.profileComplete && state.account.discoverable) showView('discover'); }
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
    state.dict = {
      // BEGIN fallback catalogue — generated from locales/en.json by scripts/sync-fallback-locale.mjs
      app: {"tagline":"Meet someone worth knowing.","discover":"Discover","matches":"Matches","messages":"Messages","profile":"Profile","for_you":"For you","filters":"Filters","pass":"Pass","super":"Super","like":"Like","your_matches":"Your matches","protected_by_bezy":"Protected by Bezy","view_membership":"View membership","unlock_premium":"Unlock Premium","privacy":"Privacy","terms":"Terms","settings":"Settings","no_conversations":"Your conversations will appear here after a mutual match.","discover_intro":"Real people. Mutual interest. Conversations that stay on Telegram.","discover_title":"Find your kind of connection.","premium_copy":"See who liked you, unlock advanced discovery and get more ways to connect.","matches_premium_copy":"Premium members get more discovery options and can see who already liked them.","people_available":"people to discover","best_match":"best match","new_today":"new today","match_score":"match","min_age":"Minimum age","max_age":"Maximum age","any_city":"Any city","same_city_only":"Only show people in my city","apply_filters":"Apply filters","reset_filters":"Reset filters","filters_applied":"Filters applied.","filters_note":"Filters are saved to your account and applied every time you open Discover.","conversation_hint":"Your conversation happens securely in Telegram.","profile_live":"Your profile is live in Discover.","premium_title":"Bezy Premium","premium_intro":"Unlock more ways to discover meaningful connections.","premium_active_intro":"You're a Premium member. Thank you for supporting Bezy.","benefit_who_liked_you":"See who liked you","benefit_advanced_discovery":"Advanced discovery","benefit_more_super_likes":"More Super Likes","benefit_increased_visibility":"Increased visibility","benefit_unlimited_discovery":"Unlimited discovery","choose_plan":"Choose your plan","plan":"Plan","plan_monthly":"Monthly","plan_quarterly":"Quarterly","plan_yearly":"Yearly","months_count":"{n} months of Premium","best_value":"Best value","subscribe_with_stars":"Subscribe with Telegram Stars","renew_with_stars":"Renew with Telegram Stars","renew":"Renew or extend","active_until":"Active until","days_remaining":"Days remaining","stars_note":"Payment is handled inside Telegram with Stars. Bezy never sees your card details.","who_liked_you":"Who liked you","who_liked_you_locked":"Premium members can see everyone who already liked them, and match instantly.","likes_waiting":"{n} people already liked you","no_likes_yet":"No one is waiting yet. Keep discovering.","preparing_checkout":"Preparing checkout…","payment_cancelled":"Payment cancelled.","payment_failed":"We couldn't start the payment. Please try again.","payment_received":"Payment received. Activating your Bezy Premium…","payment_pending":"Your payment is still processing.","payment_processing":"Your payment is being processed. Premium will activate shortly.","payment_unsupported":"Please update Telegram to pay with Stars.","premium_active":"💎 Bezy Premium is active.","premium_required":"This is a Premium feature.","premium_expired":"Your Bezy Premium has expired.","discovery_limit":"You've reached today's discovery limit. Premium removes it.","super_like_limit":"You've used today's Super Likes. Premium gives you more.","profile_hidden":"Your profile is saved but hidden from Discover.","loading":"Loading…","refresh":"Refresh","start_conversation":"Start conversation","continue_conversation":"Continue conversation","no_matches":"No matches yet. Keep discovering — your next connection could be here.","no_profiles":"No more profiles right now. Check back soon.","empty_filters":"Your filters are hiding everyone right now. Adjust them, or reset them to see everyone.","empty_pool":"You've seen everyone nearby for now. New people join all the time — check back later.","empty_no_supply":"Bezy is brand new here — no one discoverable yet. Check back soon, and tell someone about Bezy.","empty_eligibility":"No one nearby matches who you're looking for right now. You can update “I am” and “Looking for” in your profile, or check back later.","empty_eligibility_you":"Your profile is currently shown as {gender}, looking for {seeking}.","empty_eligibility_edit":"Update my profile","gender_placeholder":"Choose…","adjust_filters":"Adjust filters","check_later":"Check again","complete_profile":"Complete your profile to start discovering people.","profile_complete_pct":"{percent}% complete","profile_saved":"Your profile has been saved.","saved_badge":"Saved","match_created":"It’s a match! 💜","error_generic":"Something went wrong. Please try again.","show_profile":"Show my profile in Discover","discoverable_note":"When off, your profile is saved but hidden from Discover.","legal_privacy":"Legal","language":"Language","edit_profile":"Edit profile","settings_privacy":"Settings & Privacy","core_profile":"Core Profile","display_name":"Display name","age":"Age","city":"City","gender":"I am","seeking":"Looking for","interests":"Interests","interests_placeholder":"Travel, music, books","add_interest":"Add interest","add_interest_placeholder":"Add an interest…","bio":"About me","bio_placeholder":"Tell people something memorable about your day or what makes you smile...","woman":"Woman","man":"Man","non_binary":"Non-binary","prefer_not_to_say":"Prefer not to say","women":"Women","men":"Men","everyone":"Everyone","save_profile":"Save profile","my_profile":"My profile","more_connections":"More connections","navigation":"Bezy navigation","close":"Close","meta_description":"Bezy — meet someone worth knowing, entirely inside Telegram.","bezy_member":"Bezy member","error_session":"Your Telegram session could not be verified. Please reopen Bezy.","error_database":"Bezy could not reach its database. Please try again.","error_profile_missing":"Complete your profile to start discovering people.","error_target_missing":"That profile is no longer available.","age_gate_title":"Bezy is only available to people aged 18 and over.","age_gate_body":"By continuing, I confirm that I am 18 or older.","age_confirm":"I am 18 or older","age_deny":"I am under 18","age_note":"Bezy does not verify identity or age. This is your own declaration.","age_blocked_title":"Bezy is for adults aged 18 and over.","age_blocked_body":"You cannot create a Bezy profile, discover people or match. Thank you for being honest.","error_age_required":"Please confirm you are 18 or older to continue.","safety_title":"Safety","safety_intro":"Block or report anyone who makes you uncomfortable.","data_title":"Privacy & your data","data_controls":"Data & privacy controls","data_controls_intro":"Bezy keeps your data while processing is paused or objected to — nothing is deleted, and you can lift either at any time.","privacy_by_design":"Your chats stay in Telegram. Your photos stay on Telegram. We use your city, not your GPS.","safety_actions":"Safety options","safety_sheet_note":"Blocking and reporting take effect immediately and are enforced by Bezy's servers.","block":"Block","unblock":"Unblock","unblock_done":"This person has been unblocked.","block_confirm":"{name} will no longer see you or be able to contact you through Bezy. Your match will be ended.","block_done":"Blocked.","unmatch":"Unmatch","unmatch_confirm":"End your match with {name}? Neither of you will see the other in Bezy again.","unmatch_done":"Unmatched.","report":"Report","report_reason":"Reason","report_details":"What happened? (optional)","report_send":"Send report","report_done":"Report sent. This person has also been blocked.","report_note":"Reporting also blocks this person. Bezy reviews reports; we cannot promise a response time.","reason_harassment":"Harassment or abuse","reason_spam":"Spam","reason_scam":"Scam or fraud","reason_fake_profile":"Fake profile or impersonation","reason_inappropriate_content":"Inappropriate content","reason_underage":"Appears to be under 18","reason_other":"Something else","blocked_people":"Blocked people","no_blocked":"You haven't blocked anyone.","cancel":"Cancel","export_data":"Download my data","export_preparing":"Preparing your data…","export_ready":"Your data has been downloaded.","delete_account":"Delete my account","delete_explain":"This permanently deletes your Bezy profile, your likes and passes, your matches and your blocks. It cannot be undone.","delete_retained":"Records of payments you made and their invoice links are kept for accounting, and reports — filed by you or about you — are kept for safety. Your Telegram account itself is not affected.","delete_type":"Type DELETE to confirm","delete_done_title":"Your Bezy account has been deleted.","delete_done_body":"You can close this window. If you ever want to come back, just open Bezy again and create a new profile.","rights_note":"For corrections or a complaint, contact contacts@digitalconcordia.com.","legal_help":"Legal help","footer_note":"Built with intention","remove":"Remove","support_title":"Help & support","support_intro":"Bezy support can help diagnose common problems.","support_help":"Get help","support_formal":"Need to make a formal privacy or legal request? Contact us.","support_contact":"Contact support","support_history":"My support requests","support_history_empty":"You have no support requests.","support_form_title":"Contact support","support_form_category":"What is it about?","support_form_details":"Describe the problem","support_form_placeholder":"What happened? What have you tried?","support_submit":"Send","support_required":"Choose a topic and describe the problem.","support_done":"Your support request has been received. Reference: {ref}. We'll review it and get back to you here.","support_cat_premium":"Premium & Telegram Stars","support_cat_profile":"Profile","support_cat_likes_matches":"Likes & Matches","support_cat_discovery":"Discovery","support_cat_privacy_account":"Privacy & Account","support_cat_problem":"Report a problem","support_cat_contact":"Contact support","support_status_open":"Open","support_status_in_progress":"In progress","support_status_resolved":"Resolved","support_status_closed":"Closed","support_email":"Email support","support_expectation":"We read every message and aim to answer within 3 working days.","rate_limited":"You're going a little fast. Please try again in a moment.","rate_limited_minutes":"You've done that too many times. Please try again in about {n} minutes.","stars_needed":"You need Telegram Stars in your balance to subscribe. You can top up in Telegram under Settings, then My Stars.","not_telegram_premium":"Telegram Premium is a separate Telegram subscription. It does not include Bezy Premium — Bezy Premium is paid separately with Stars.","premium_revoked":"Your Bezy Premium was refunded.","premium_lapsed_hint":"You can subscribe again below. Your profile, matches and conversations are unaffected.","prompts_title":"Prompts & icebreakers","prompts_hint":"Optional. Answer up to three — they appear on your profile and give people something to open with.","prompt_perfect_sunday":"A perfect Sunday for me…","prompt_i_value":"Something I value…","prompt_first_date":"My ideal first date…","prompt_should_know":"One thing you should know about me…","prompt_talk_for_hours":"Something I could talk about for hours…","prompt_placeholder":"Your answer","preview_profile":"Preview my profile","preview_title":"How others see you","preview_hint":"This is your card as it appears in Discover. Your Telegram username stays hidden until you match.","preview_incomplete":"Complete your profile to see how it will look.","why_matched":"Why you matched","why_interests":"You both like {values}","why_city":"You are both in {values}","why_age":"You are close in age","why_languages":"You both speak {values}","why_none":"You liked each other.","starters_title":"Ways to start","starter_interest":"Ask about {value} — you both like it.","starter_city":"Ask what they love about {value}.","starter_generic":"Start with something simple about what you already have in common.","start_with":"Start with","starter_copy":"Copy","starter_copied":"Copied. Paste it in Telegram.","starters_hint":"Bezy suggests an opener; the conversation itself happens in Telegram.","icebreaker_label":"{name}'s icebreaker","chat_no_username_hint":"They have no @username — tap Continue, then tap “Open Telegram chat” in the Bezy chat to reach their profile.","prompt_none":"No prompt","prompt_number":"Prompt {n}","prompts_select_label":"Choose a prompt","prompts_answer_label":"Prompt answer","notifications_title":"Notifications","notifications_hint":"Choose what Bezy sends you in Telegram. Payment and account messages are always sent, because they are a record of something that happened to your account.","notify_matches":"New matches","notify_super_likes":"Super Likes you receive","notify_super_likes_note":"Bezy never says who sent it — open Bezy and decide for yourself.","notify_profile_reminders":"Profile reminders","notify_profile_reminders_note":"At most one a week, and only while your profile is incomplete.","notifications_saved":"Notification settings saved.","restrict_title":"Pause all processing","restrict_explain":"Bezy keeps your data but stops using it. Your profile leaves Discover, you cannot like or match, and Bezy stops sending you match and Super Like messages. Nothing is deleted, and you can lift this at any time.","restrict_action":"Pause processing","restrict_confirm":"Pause processing now","restricted_badge":"Processing is paused.","restricted_notice":"Bezy is storing your data and nothing else. Lift the pause to return to Discover.","unrestrict_action":"Resume processing","restrict_done":"Processing is paused. Your data is kept, not used.","unrestrict_done":"Processing resumed. Turn on “Show my profile in Discover” when you are ready to be seen again.","restrict_note":"This is the right to restriction of processing. Payment and account messages are still sent, and you can still download or delete your data.","error_processing_restricted":"Processing is paused for your account. Resume it in Safety & privacy to continue.","objection_title":"Object to processing","objection_explain":"You have the right to object to the way Bezy processes your data (GDPR Art. 21). If you object, Bezy stops using your data for discovery and matching: your profile leaves Discover, you cannot like or match, and Bezy stops sending you match and Super Like messages. Nothing is deleted, and you can withdraw the objection at any time.","objection_confirm":"Object now","object_action":"Object to processing","objection_badge":"You have objected to processing.","objection_notice":"Bezy is storing your data and nothing else. Withdraw the objection to return to Discover.","unobject_action":"Withdraw objection","objection_done":"Objection recorded. Bezy has stopped processing your data.","unobject_done":"Objection withdrawn. Turn on “Show my profile in Discover” when you are ready to be seen again.","objection_note":"This is the right to object to processing. Your data is kept, not deleted, and you can still download or delete your data.","languages_label":"Languages I speak","languages_hint":"Optional. Up to five. Used to show you people you can actually talk to.","languages_chosen_count":"{chosen} of {max} chosen","filter_languages":"Languages they speak","filter_languages_hint":"Leave empty to see everyone. Profiles that have not listed a language are always shown.","language_en":"English","language_fr":"French","language_es":"Spanish","language_pt":"Portuguese","language_ar":"Arabic","language_de":"German","language_it":"Italian","language_ru":"Russian","language_sw":"Swahili","language_yo":"Yoruba"},
      // END fallback catalogue
    };
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
