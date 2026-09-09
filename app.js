const tg = window.Telegram?.WebApp;
const API = { profile: '/api/profile/me', discover: '/api/discover', swipe: '/api/swipe', matches: '/api/matches' };
const state = { lang: null, dict: null, telegramUser: null, account: null, profiles: [], matches: [], currentIndex: 0, view: 'discover' };
const $ = (id) => document.getElementById(id);

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function t(key) { return key.split('.').reduce((value, part) => value?.[part], state.dict) ?? key; }
function languageFromTelegram() { const code = state.telegramUser?.language_code || tg?.initDataUnsafe?.user?.language_code || navigator.language || 'en'; return String(code).toLowerCase().startsWith('fr') ? 'fr' : 'en'; }

async function loadLocale(language) {
  const response = await fetch(`/locales/${language}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load language');
  state.lang = language; state.dict = await response.json(); localStorage.setItem('bezy-language', language);
  document.documentElement.lang = language; applyLocale();
}
function setText(id, value) { const node = $(id); if (node) node.textContent = value; }

function applyLocale() {
  setText('tagline', t('app.tagline')); setText('nav-discover', t('app.discover')); setText('nav-matches', t('app.matches')); setText('nav-messages', t('app.messages')); setText('nav-profile', t('app.profile'));
  setText('discover-title', t('app.discover_title')); setText('discover-intro', t('app.discover_intro')); setText('privacy-pill', t('app.private_by_design')); setText('for-you', t('app.for_you')); setText('filterBtn', t('app.filters'));
  setText('premium-copy', t('app.premium_copy')); setText('premiumBtn', t('app.view_membership')); setText('your-matches', t('app.your_matches')); setText('discoverBtn', t('app.discover')); setText('matches-premium-copy', t('app.matches_premium_copy'));
  document.querySelectorAll('.premium-action').forEach((node) => { node.textContent = t('app.unlock_premium'); });
  setText('messages-title', t('app.messages')); setText('protected-label', t('app.protected_by_bezy')); setText('profile-title', t('app.my_profile')); setText('profile-refresh', t('app.refresh')); setText('edit-profile', t('app.edit_profile'));
  setText('display-name-label', t('app.display_name')); setText('age-label', t('app.age')); setText('city-label', t('app.city')); setText('gender-label', t('app.gender')); setText('seeking-label', t('app.seeking')); setText('interests-label', t('app.interests')); setText('bio-label', t('app.bio'));
  setText('discoverable-label', t('app.show_profile')); setText('save-profile', t('app.save_profile')); setText('language-title', t('app.language')); setText('legal-title', t('app.legal_privacy')); setText('privacy-link', t('app.privacy')); setText('terms-link', t('app.terms'));
  setText('people-label', t('app.people_nearby')); setText('match-label', t('app.best_match')); setText('new-label', t('app.new_today')); setText('message-empty', t('app.no_conversations')); setText('matches-empty', t('app.no_matches'));
  if ($('privacy-link')) $('privacy-link').href = `/privacy?lang=${state.lang}`; if ($('terms-link')) $('terms-link').href = `/terms?lang=${state.lang}`;
  document.querySelectorAll('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === state.lang));
  const gender = $('gender'); if (gender) gender.innerHTML = `<option value="woman">${escapeHtml(t('app.woman'))}</option><option value="man">${escapeHtml(t('app.man'))}</option><option value="non_binary">${escapeHtml(t('app.non_binary'))}</option><option value="prefer_not_to_say">${escapeHtml(t('app.prefer_not_to_say'))}</option>`;
  const seeking = $('seeking'); if (seeking) seeking.innerHTML = `<option value="women">${escapeHtml(t('app.women'))}</option><option value="men">${escapeHtml(t('app.men'))}</option><option value="everyone">${escapeHtml(t('app.everyone'))}</option>`;
  if ($('interests')) $('interests').placeholder = t('app.interests_placeholder');
  renderDiscover(); renderMatches();
}

function showToast(message) { const node = $('toast'); node.textContent = message; node.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => node.classList.remove('show'), 2600); }
async function api(path, options = {}) {
  const body = options.body ? { ...options.body, initData: tg?.initData || '' } : { initData: tg?.initData || '' };
  const response = await fetch(path, { method: options.method || 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || t('app.error_generic')); return data;
}
function openTelegramLink(url) { if (!url) return; if (tg?.openTelegramLink && url.startsWith('https://t.me/')) tg.openTelegramLink(url); else if (tg?.openLink) tg.openLink(url); else window.open(url, '_blank', 'noopener'); }

function showView(view, options = {}) {
  const target = view === 'premium' ? 'discover' : view; state.view = target;
  document.querySelectorAll('.view').forEach((node) => node.classList.toggle('active', node.id === `${target}-view`)); document.querySelectorAll('.nav button').forEach((button) => button.classList.toggle('active', button.dataset.view === target));
  if (target === 'discover') loadDiscover(); if (target === 'matches') loadMatches(); if (target === 'messages') loadMatches(true); if (target === 'profile') renderAccount(); if (view === 'premium' || options.premium) showToast(t('app.premium_soon'));
}

function renderAccount() {
  const account = state.account || {}, profile = account.profile || {}; const name = profile.displayName || account.firstName || state.telegramUser?.first_name || 'Bezy member'; const photo = account.photoUrl || state.telegramUser?.photo_url || '';
  $('my-name').textContent = name; $('profile-status').textContent = account.profileComplete ? t('app.show_profile') : t('app.complete_profile'); $('display-name').value = profile.displayName || account.firstName || ''; $('age').value = profile.age || ''; $('city').value = profile.city || '';
  $('gender').value = profile.gender || 'prefer_not_to_say'; $('seeking').value = profile.seeking || 'everyone'; $('interests').value = Array.isArray(profile.interests) ? profile.interests.join(', ') : ''; $('bio').value = profile.bio || ''; $('discoverable').checked = Boolean(profile.discoverable);
  $('my-avatar').innerHTML = photo ? `<img src="${escapeHtml(photo)}" alt="">` : escapeHtml(name.charAt(0).toUpperCase() || 'B');
}

function renderDiscover() {
  const host = $('discover-content'); if (!host) return; const profile = state.profiles[state.currentIndex];
  if (!profile) { host.innerHTML = `<div class="empty">${escapeHtml(state.account?.profileComplete ? t('app.no_profiles') : t('app.complete_profile'))}</div>`; return; }
  const initial = (profile.displayName || 'B').charAt(0).toUpperCase(); const image = profile.photoUrl ? `<img src="${escapeHtml(profile.photoUrl)}" alt="">` : ''; const age = profile.age ? `, ${escapeHtml(profile.age)}` : '';
  const meta = [profile.city, profile.bio].filter(Boolean).map(escapeHtml).join(' · '); const tags = (profile.interests || []).slice(0, 5).map((interest) => `<span class="tag">${escapeHtml(interest)}</span>`).join('');
  host.innerHTML = `<article class="profile-card" id="profile-card"><div class="portrait">${image}<div class="avatar-letter">${escapeHtml(initial)}</div><div class="portrait-overlay"></div><div class="profile-copy"><h2>${escapeHtml(profile.displayName || 'Bezy member')}${age}</h2><p>${meta || '💜 Bezy'}</p><div class="tags">${tags}</div></div></div><div class="actions"><button class="action pass" id="passBtn" type="button">✕ ${escapeHtml(t('app.pass'))}</button><button class="action super" id="superBtn" type="button">★ ${escapeHtml(t('app.super'))}</button><button class="action like" id="likeBtn" type="button">♥ ${escapeHtml(t('app.like'))}</button></div></article>`;
  $('passBtn').onclick = () => actOnCurrent('pass'); $('superBtn').onclick = () => actOnCurrent('super'); $('likeBtn').onclick = () => actOnCurrent('like'); setText('people-count', String(state.profiles.length)); setText('match-percent', '—'); setText('new-count', '—');
}

async function loadDiscover() {
  if (!state.account?.profileComplete) { state.profiles = []; renderDiscover(); return; }
  try { const data = await api(API.discover); state.profiles = data.profiles || []; state.currentIndex = 0; renderDiscover(); }
  catch (error) { $('discover-content').innerHTML = `<div class="empty">${escapeHtml(error.message || t('app.error_generic'))}</div>`; }
}
async function actOnCurrent(action) {
  const profile = state.profiles[state.currentIndex]; if (!profile) return;
  try { const result = await api(API.swipe, { body: { targetId: profile.id, action } }); state.profiles.splice(state.currentIndex, 1); if (result.matched) { showToast(t('app.match_created')); await loadMatches(); } else renderDiscover(); }
  catch (error) { showToast(error.message || t('app.error_generic')); }
}

function renderMatches() {
  const grid = $('match-grid'), empty = $('matches-empty'); if (!grid || !empty) return;
  if (!state.matches.length) { grid.innerHTML = ''; empty.textContent = t('app.no_matches'); empty.classList.remove('hidden'); $('conversation-list').innerHTML = ''; $('message-empty').classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = state.matches.map((match) => { const initial = (match.displayName || 'B').charAt(0).toUpperCase(); const image = match.photoUrl ? `<img src="${escapeHtml(match.photoUrl)}" alt="">` : escapeHtml(initial); const button = match.username ? `<button class="match-open" data-chat="${escapeHtml(match.username)}" type="button">${escapeHtml(t('app.open_chat'))}</button>` : `<button class="match-open" data-nochat="1" type="button">${escapeHtml(t('app.open_chat'))}</button>`; return `<article class="match-card"><div class="match-photo">${image}</div><div class="match-info"><b>${escapeHtml(match.displayName)}${match.age ? `, ${escapeHtml(match.age)}` : ''}</b><span>${escapeHtml(match.city || '')}</span>${button}</div></article>`; }).join('');
  grid.querySelectorAll('[data-chat]').forEach((button) => button.onclick = () => openTelegramLink(`https://t.me/${button.dataset.chat}`)); grid.querySelectorAll('[data-nochat]').forEach((button) => button.onclick = () => showToast(t('app.open_chat')));
  $('conversation-list').innerHTML = state.matches.map((match) => { const initial = (match.displayName || 'B').charAt(0).toUpperCase(); const avatar = match.photoUrl ? `<img src="${escapeHtml(match.photoUrl)}" alt="">` : escapeHtml(initial); const action = match.username ? `<button class="match-open" data-chat="${escapeHtml(match.username)}" type="button">${escapeHtml(t('app.open_chat'))}</button>` : ''; return `<div class="conversation"><div class="conv-avatar">${avatar}</div><div class="conv-main"><b>${escapeHtml(match.displayName)}</b><p>${escapeHtml(match.bio || t('app.match_created'))}</p>${action}</div></div>`; }).join('');
  $('message-empty').classList.add('hidden'); $('conversation-list').querySelectorAll('[data-chat]').forEach((button) => button.onclick = () => openTelegramLink(`https://t.me/${button.dataset.chat}`));
}
async function loadMatches(messagesView = false) { try { const data = await api(API.matches); state.matches = data.matches || []; renderMatches(); } catch (error) { if (messagesView) showToast(error.message || t('app.error_generic')); } }

async function saveProfile(event) {
  event.preventDefault(); const profile = { displayName: $('display-name').value, age: Number($('age').value), city: $('city').value, gender: $('gender').value, seeking: $('seeking').value, interests: $('interests').value.split(',').map((value) => value.trim()).filter(Boolean), bio: $('bio').value, discoverable: $('discoverable').checked };
  try { const data = await api(API.profile, { body: { profile } }); state.account = data.profile; renderAccount(); showToast(t('app.profile_saved')); if (state.account.profileComplete && state.account.discoverable) showView('discover'); }
  catch (error) { showToast(error.message || t('app.error_generic')); }
}
async function loadAccount() { const data = await api(API.profile); state.account = data.profile; state.telegramUser = state.telegramUser || data.profile; renderAccount(); return data; }

function bindEvents() {
  document.querySelectorAll('.nav button').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view))); $('settingsBtn').onclick = () => showView('profile'); $('discoverBtn').onclick = () => showView('discover'); $('premiumBtn').onclick = () => showView('premium'); document.querySelectorAll('.premium-action').forEach((button) => button.onclick = () => showView('premium')); $('profile-form').addEventListener('submit', saveProfile);
  $('profile-refresh').onclick = async () => { try { await loadAccount(); showToast(t('app.profile_saved')); } catch (error) { showToast(error.message || t('app.error_generic')); } }; $('filterBtn').onclick = () => showToast(t('app.filters'));
  document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', async () => { try { await loadLocale(button.dataset.language); renderAccount(); } catch { showToast(t('app.error_generic')); } }));
}

async function init() {
  if (!tg?.initData) { document.body.innerHTML = `<main style="padding:40px;font-family:system-ui;text-align:center"><h2>Bezy</h2><p>Open Bezy from Telegram to continue.</p></main>`; return; }
  tg.ready(); tg.expand?.(); if (tg.requestFullscreen) tg.requestFullscreen().catch(() => {}); state.telegramUser = tg.initDataUnsafe?.user || null;
  const storedLanguage = localStorage.getItem('bezy-language'); await loadLocale(storedLanguage || languageFromTelegram()); bindEvents();
  try { const account = await loadAccount(); const requestedView = new URLSearchParams(location.search).get('view') || (account.needsProfile ? 'profile' : 'discover'); showView(requestedView); }
  catch (error) { showToast(error.message || t('app.error_generic')); }
}

document.addEventListener('DOMContentLoaded', init);
