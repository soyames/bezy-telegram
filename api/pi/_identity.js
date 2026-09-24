// Pi access tokens are verified against Pi's Platform API on every protected request.
// Never trust a UID or username submitted by the browser.
export async function verifyPiToken(token, fetcher = fetch) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 4096) return null;
  const response = await fetcher('https://api.minepi.com/v2/me', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (typeof user?.uid !== 'string' || !user.uid || user.uid.length > 256) return null;
  return { uid: user.uid, username: typeof user.username === 'string' ? user.username : null };
}

export async function requirePiUser(req, res, verify = verifyPiToken) {
  const auth = req.headers?.authorization || '';
  if (!/^Bearer [^\s]+$/.test(auth)) {
    res.status(401).json({ error: 'INVALID_SESSION' });
    return null;
  }
  try {
    const user = await verify(auth.slice(7));
    if (user) return user;
  } catch (error) {
    console.error('[bezy-pi] Identity verification unavailable', error?.name);
    res.status(503).json({ error: 'PI_UNAVAILABLE' });
    return null;
  }
  res.status(401).json({ error: 'INVALID_SESSION' });
  return null;
}
