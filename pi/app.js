const button = document.getElementById('sign-in');
const status = document.getElementById('status');
const account = document.getElementById('account');
const identity = document.getElementById('identity');

const sandbox = new URLSearchParams(location.search).get('sandbox') === '1';
if (window.Pi) {
  window.Pi.init({ version: '2.0', sandbox });
} else {
  status.textContent = 'Open Bezy in Pi Browser to sign in.';
  button.disabled = true;
}

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Connecting to Pi…';
  try {
    // The callback is required when requesting the payments scope. It must not
    // complete a payment before the server has a durable purchase record.
    const auth = await window.Pi.authenticate(['username'], () => {});
    const response = await fetch('/api/pi/session', {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Pi identity could not be verified');
    const user = await response.json();
    identity.textContent = user.username ? `Signed in as @${user.username}` : 'Signed in with Pi';
    account.hidden = false;
    status.textContent = 'Pi sign-in verified.';
    button.hidden = true;
    // Access tokens stay in memory and are never added to a URL or localStorage.
  } catch {
    status.textContent = 'Sign-in did not finish. Please try again in Pi Browser.';
    button.disabled = false;
  }
});
