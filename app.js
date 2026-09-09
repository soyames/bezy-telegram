const tg = window.Telegram?.WebApp;
const API = { profile: '/api/profile/me', discover: '/api/discover', swipe: '/api/swipe', matches: '/api/matches', premium: '/api/premium', likes: '/api/likes' };
const state = { lang: null, dict: null, telegramUser: null, account: null, profiles: [], matches: [], stats: null, preferences: null, currentIndex: 0, view: 'discover', premium: null, likes: null, likeCount: 0, selectedPlan: 'yearly', userNavigated: false };
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
  setText('discoverable-label', t('app.show_profile')); setText('save-profile', t('app.save_profile')); setText('language-title', t('app.language')); setText('legal-title', t('app.legal_privacy')); setText('privacy-link', t('app.privacy')); setText('terms-link', t('app.terms'));
  setText('people-label', t('app.people_available')); setText('match-label', t('app.best_match')); setText('new-label', t('app.new_today')); setText('message-empty', t('app.no_conversations')); setText('matches-empty', t('app.no_matches'));
  if ($('privacy-link')) $('privacy-link').href = `/privacy?lang=${state.lang}`;
  if ($('terms-link')) $('terms-link').href = `/terms?lang=${state.lang}`;
  document.querySelectorAll('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === state.lang));
  const gender = $('gender');
  if (gender) gender.innerHTML = `<option value="woman">${escapeHtml(t('app.woman'))}</option><option value="man">${escapeHtml(t('app.man'))}</option><option value="non_binary">${escapeHtml(t('app.non_binary'))}</option><option value="prefer_not_to_say">${escapeHtml(t('app.prefer_not_to_say'))}</option>`;
  const seeking = $('seeking');
  if (seeking) seeking.innerHTML = `<option value="women">${escapeHtml(t('app.women'))}</option><option value="men">${escapeHtml(t('app.men'))}</option><option value="everyone">${escapeHtml(t('app.everyone'))}</option>`;
  if ($('interests')) $('interests').placeholder = t('app.interests_placeholder');
  setText('premium-title', t('app.premium_title')); setText('premium-back', t('app.discover'));
  setText('premium-card-title', `✨ ${t('app.premium_title')}`); setText('matches-premium-title', `💎 ${t('app.more_connections')}`);
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
  PREMIUM_UNAVAILABLE: 'app.payment_failed'
};
function errorText(error) {
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
  const preferences = state.preferences || { minAge: 18, maxAge: 100, city: '', sameCityOnly: false };
  openSheet(t('app.filters'), `
    <div class="two-col">
      <div class="field"><label for="filter-min-age">${escapeHtml(t('app.min_age'))}</label><input id="filter-min-age" type="number" min="18" max="100" value="${escapeHtml(preferences.minAge)}"></div>
      <div class="field"><label for="filter-max-age">${escapeHtml(t('app.max_age'))}</label><input id="filter-max-age" type="number" min="18" max="100" value="${escapeHtml(preferences.maxAge)}"></div>
    </div>
    <div class="field"><label for="filter-city">${escapeHtml(t('app.city'))}</label><input id="filter-city" maxlength="80" value="${escapeHtml(preferences.city)}" placeholder="${escapeHtml(t('app.any_city'))}"></div>
    <label class="check"><input id="filter-same-city" type="checkbox" ${preferences.sameCityOnly ? 'checked' : ''}> <span>${escapeHtml(t('app.same_city_only'))}</span></label>
    <button class="save-btn" id="filter-apply" type="button">${escapeHtml(t('app.apply_filters'))}</button>
    <button class="ghost-btn" id="filter-reset" type="button">${escapeHtml(t('app.reset_filters'))}</button>
    <p class="filter-note">${escapeHtml(t('app.filters_note'))}</p>
  `, () => {
    $('filter-apply').onclick = () => savePreferences({
      minAge: Number($('filter-min-age').value),
      maxAge: Number($('filter-max-age').value),
      city: $('filter-city').value,
      sameCityOnly: $('filter-same-city').checked
    });
    $('filter-reset').onclick = () => savePreferences({ minAge: 18, maxAge: 100, city: '', sameCityOnly: false });
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
  const validViews = new Set(['discover', 'matches', 'messages', 'profile', 'premium']);
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
  if ($('discoverable')) $('discoverable').checked = Boolean(profile.discoverable);
  if ($('my-avatar')) $('my-avatar').innerHTML = photo ? `<img src="${escapeHtml(photo)}" alt="">` : escapeHtml(name.charAt(0).toUpperCase() || 'B');
}

function renderStats() {
  const stats = state.stats;
  if (!stats) { setText('people-count', '—'); setText('match-percent', '—'); setText('new-count', '—'); return; }
  setText('people-count', String(stats.available ?? 0));
  setText('match-percent', stats.bestMatch ? `${stats.bestMatch}%` : '—');
  setText('new-count', String(stats.newToday ?? 0));
}

function renderDiscover() {
  const host = $('discover-content'); if (!host) return;
  renderStats();
  const profile = state.profiles[state.currentIndex];
  if (!profile) { host.innerHTML = `<div class="empty">${escapeHtml(state.account?.profileComplete ? t('app.no_profiles') : t('app.complete_profile'))}</div>`; return; }
  const initial = (profile.displayName || 'B').charAt(0).toUpperCase();
  const image = profile.photoUrl ? `<img src="${escapeHtml(profile.photoUrl)}" alt="">` : '';
  const age = profile.age ? `, ${escapeHtml(profile.age)}` : '';
  const meta = [profile.city, profile.bio].filter(Boolean).map(escapeHtml).join(' · ');
  const tags = (profile.interests || []).slice(0, 5).map((interest) => `<span class="tag">${escapeHtml(interest)}</span>`).join('');
  const score = profile.compatibility ? `<div class="score">${escapeHtml(profile.compatibility)}% ${escapeHtml(t('app.match_score'))}</div>` : '';
  host.innerHTML = `<article class="profile-card" id="profile-card"><div class="portrait">${image}${score}<div class="avatar-letter">${escapeHtml(initial)}</div><div class="portrait-overlay"></div><div class="profile-copy"><h2>${escapeHtml(profile.displayName || t('app.bezy_member'))}${age}</h2><p>${meta || '💜 Bezy'}</p><div class="tags">${tags}</div></div></div><div class="actions"><button class="action pass" id="passBtn" type="button">✕ ${escapeHtml(t('app.pass'))}</button><button class="action super" id="superBtn" type="button">★ ${escapeHtml(t('app.super'))}</button><button class="action like" id="likeBtn" type="button">♥ ${escapeHtml(t('app.like'))}</button></div></article>`;
  if ($('passBtn')) $('passBtn').onclick = () => actOnCurrent('pass');
  if ($('superBtn')) $('superBtn').onclick = () => actOnCurrent('super');
  if ($('likeBtn')) $('likeBtn').onclick = () => actOnCurrent('like');
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

function renderMatches() {
  const grid = $('match-grid'), empty = $('matches-empty'), conversations = $('conversation-list'), messageEmpty = $('message-empty');
  if (!grid || !empty || !conversations || !messageEmpty) return;
  if (!state.matches.length) { grid.innerHTML = ''; empty.textContent = t('app.no_matches'); empty.classList.remove('hidden'); conversations.innerHTML = ''; messageEmpty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = state.matches.map((match) => {
    const initial = (match.displayName || 'B').charAt(0).toUpperCase(); const image = match.photoUrl ? `<img src="${escapeHtml(match.photoUrl)}" alt="">` : escapeHtml(initial);
    const button = match.username ? `<button class="match-open" data-chat="${escapeHtml(match.username)}" type="button">${escapeHtml(t('app.open_chat'))}</button>` : `<button class="match-open" data-nochat="1" type="button">${escapeHtml(t('app.open_chat'))}</button>`;
    return `<article class="match-card"><div class="match-photo">${image}</div><div class="match-info"><b>${escapeHtml(match.displayName || t('app.bezy_member'))}${match.age ? `, ${escapeHtml(match.age)}` : ''}</b><span>${escapeHtml(match.city || '')}</span>${button}</div></article>`;
  }).join('');
  grid.querySelectorAll('[data-chat]').forEach((button) => button.onclick = () => openTelegramLink(`https://t.me/${button.dataset.chat}`));
  grid.querySelectorAll('[data-nochat]').forEach((button) => button.onclick = () => showToast(t('app.open_chat')));
  conversations.innerHTML = state.matches.map((match) => {
    const initial = (match.displayName || 'B').charAt(0).toUpperCase(); const avatar = match.photoUrl ? `<img src="${escapeHtml(match.photoUrl)}" alt="">` : escapeHtml(initial);
    const action = match.username ? `<button class="match-open" data-chat="${escapeHtml(match.username)}" type="button">${escapeHtml(t('app.open_chat'))}</button>` : '';
    const when = relativeTime(match.matchedAt);
    return `<div class="conversation"><div class="conv-avatar">${avatar}</div><div class="conv-main"><b>${escapeHtml(match.displayName || t('app.bezy_member'))}</b><p>${escapeHtml(t('app.conversation_hint'))}</p>${action}</div><span class="time">${escapeHtml(when)}</span></div>`;
  }).join('');
  messageEmpty.classList.add('hidden'); conversations.querySelectorAll('[data-chat]').forEach((button) => button.onclick = () => openTelegramLink(`https://t.me/${button.dataset.chat}`));
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
      <div class="settings-card"><h3>${escapeHtml(t('app.renew'))}</h3>${planCards(data.plans)}<button class="save-btn" id="premium-buy" type="button">${escapeHtml(t('app.renew_with_stars'))}</button></div>`;
  } else {
    host.innerHTML = `
      <div class="premium-hero"><h2>💎 ${escapeHtml(t('app.premium_title'))}</h2><p>${escapeHtml(t('app.premium_intro'))}</p>${benefitList()}</div>
      <div class="settings-card"><h3>${escapeHtml(t('app.choose_plan'))}</h3>${planCards(data.plans)}<button class="save-btn" id="premium-buy" type="button">${escapeHtml(t('app.subscribe_with_stars'))}</button><p class="quota-note">${escapeHtml(t('app.stars_note'))}</p></div>
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

async function loadMatches(messagesView = false) { try { const data = await api(API.matches); state.matches = data.matches || []; renderMatches(); } catch (error) { if (messagesView) showToast(errorText(error)); } }

async function saveProfile(event) {
  event.preventDefault();
  const profile = { displayName: $('display-name').value, age: Number($('age').value), city: $('city').value, gender: $('gender').value, seeking: $('seeking').value, interests: $('interests').value.split(',').map((value) => value.trim()).filter(Boolean), bio: $('bio').value, discoverable: $('discoverable').checked };
  try { const data = await api(API.profile, { body: { profile } }); state.account = data.profile; renderAccount(); showToast(t('app.profile_saved')); if (state.account.profileComplete && state.account.discoverable) showView('discover'); }
  catch (error) { showToast(errorText(error)); }
}
async function loadAccount() { const data = await api(API.profile); state.account = data.profile; renderAccount(); return data; }

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
  if ($('profile-refresh')) $('profile-refresh').onclick = async () => { try { await loadAccount(); showToast(t('app.profile_saved')); } catch (error) { showToast(errorText(error)); } };
  if ($('filterBtn')) $('filterBtn').onclick = openFilters;
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });
  document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', async () => { try { await loadLocale(button.dataset.language); renderAccount(); } catch { showToast(t('app.error_generic')); } }));
}

async function init() {
  if (!tg?.initData) {
    document.body.innerHTML = `<main style="padding:40px;font-family:system-ui;text-align:center"><h2>Bezy</h2><p>Open Bezy from Telegram to continue.</p></main>`;
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
      tagline: 'Meet someone worth knowing.', discover: 'Discover', matches: 'Matches', messages: 'Messages', profile: 'Profile', for_you: 'For you', filters: 'Filters', pass: 'Pass', super: 'Super', like: 'Like', your_matches: 'Your matches', protected_by_bezy: 'Protected by Bezy', view_membership: 'View membership', unlock_premium: 'Unlock Premium', privacy: 'Privacy', terms: 'Terms', settings: 'Settings', no_conversations: 'Your conversations will appear here after a mutual match.', discover_intro: 'Real people. Mutual interest. Conversations that stay on Telegram.', discover_title: 'Find your kind of connection.', premium_copy: 'See who liked you, unlock advanced discovery and get more ways to connect.', matches_premium_copy: 'Premium members get more discovery options and can see who already liked them.', people_nearby: 'people nearby', best_match: 'best match', new_today: 'new today', loading: 'Loading…', refresh: 'Refresh', open_chat: 'Open Telegram chat', no_matches: 'No matches yet. Keep discovering — your next connection could be here.', no_profiles: 'No more profiles right now. Check back soon.', complete_profile: 'Complete your profile to start discovering people.', profile_saved: 'Your profile has been saved.', match_created: 'It’s a match! 💜', error_generic: 'Something went wrong. Please try again.', premium_soon: 'Bezy Premium is coming soon.', adults_only: 'Bezy is for adults aged 18 and over.', show_profile: 'Show my profile in Discover', legal_privacy: 'Legal & privacy', language: 'Language', edit_profile: 'Edit profile', display_name: 'Display name', age: 'Age', city: 'City', gender: 'I am', seeking: 'Looking for', interests: 'Interests', interests_placeholder: 'Travel, music, books', bio: 'About me', woman: 'Woman', man: 'Man', non_binary: 'Non-binary', prefer_not_to_say: 'Prefer not to say', women: 'Women', men: 'Men', everyone: 'Everyone', save_profile: 'Save profile', my_profile: 'My profile',
      people_available: 'people to discover', match_score: 'match', min_age: 'Minimum age', max_age: 'Maximum age', any_city: 'Any city', same_city_only: 'Only show people in my city', apply_filters: 'Apply filters', reset_filters: 'Reset filters', filters_applied: 'Filters applied.', filters_note: 'Filters are saved to your account and applied every time you open Discover.', conversation_hint: 'Matched — your conversation continues in Telegram.', profile_live: 'Your profile is live in Discover.', profile_hidden: 'Your profile is saved but hidden from Discover.',
      premium_title: 'Bezy Premium', premium_intro: 'Unlock more ways to discover meaningful connections.', premium_active_intro: "You're a Premium member. Thank you for supporting Bezy.", benefit_who_liked_you: 'See who liked you', benefit_advanced_discovery: 'Advanced discovery', benefit_more_super_likes: 'More Super Likes', benefit_increased_visibility: 'Increased visibility', benefit_unlimited_discovery: 'Unlimited discovery', choose_plan: 'Choose your plan', plan: 'Plan', plan_monthly: 'Monthly', plan_quarterly: 'Quarterly', plan_yearly: 'Yearly', months_count: '{n} months of Premium', best_value: 'Best value', subscribe_with_stars: 'Subscribe with Telegram Stars', renew_with_stars: 'Renew with Telegram Stars', renew: 'Renew or extend', active_until: 'Active until', days_remaining: 'Days remaining', stars_note: 'Payment is handled inside Telegram with Stars. Bezy never sees your card details.', who_liked_you: 'Who liked you', who_liked_you_locked: 'Premium members can see everyone who already liked them, and match instantly.', likes_waiting: '{n} people already liked you', no_likes_yet: 'No one is waiting yet. Keep discovering.', preparing_checkout: 'Preparing checkout…', payment_cancelled: 'Payment cancelled.', payment_failed: "We couldn't start the payment. Please try again.", payment_received: 'Payment received. Activating your Bezy Premium…', payment_pending: 'Your payment is still processing.', payment_processing: 'Your payment is being processed. Premium will activate shortly.', payment_unsupported: 'Please update Telegram to pay with Stars.', premium_active: '💎 Bezy Premium is active.', premium_required: 'This is a Premium feature.', premium_expired: 'Your Bezy Premium has expired.', discovery_limit: "You've reached today's discovery limit. Premium removes it.", super_like_limit: "You've used today's Super Likes. Premium gives you more.",
      more_connections: 'More connections', navigation: 'Bezy navigation', close: 'Close', bezy_member: 'Bezy member', meta_description: 'Bezy — meet someone worth knowing, entirely inside Telegram.', error_session: 'Your Telegram session could not be verified. Please reopen Bezy.', error_database: 'Bezy could not reach its database. Please try again.', error_profile_missing: 'Complete your profile to start discovering people.', error_target_missing: 'That profile is no longer available.'
    }};
    document.documentElement.lang = 'en';
    applyLocale();
  }

  try {
    const account = await loadAccount();
    const requestedView = new URLSearchParams(location.search).get('view') || (account.needsProfile ? 'profile' : 'discover');
    if (!state.userNavigated) showView(requestedView);
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
