// One-off: derive the Pi app's legal pages from the Telegram app's, changing only the
// facts that differ. Nothing is retyped, so the legal wording is preserved verbatim.
import fs from 'node:fs';

function load(page) {
  const src = fs.readFileSync(`${page}/index.html`, 'utf8');
  const obj = eval('(' + src.match(/const en=(\{[\s\S]*?\});\s*(?:const fr|\/\*|$)/)[1] + ')');
  return obj;
}

const CROSS_PLATFORM = [
  '3. One Bezy community',
  'Bezy is a single community with two ways in. When you create a Bezy profile, it is published to Bezy’s shared community service and can be discovered by other members on either network — people using the Pi app and people using the Telegram Mini App see the same pool of profiles, and a match or conversation can be with someone on the other network. Nothing tells another member which network you joined through. What is shared is your dating profile (display name, age, gender, area you enter, interests, bio, looking-for), your dating photos, and your likes, passes, matches, messages, blocks and reports. Your Pi identity itself — your Pi UID and username — is never shown to another member; they see only the profile you chose to publish.',
];

const PHOTOS = [
  '4. Photos',
  'Dating photos you add are stored in a private Vercel Blob store, with a reference held in Bezy’s shared database. They are never stored in the database itself and are not publicly readable: another member can only load a photo through a server-authenticated request, and only when Bezy’s access rules allow it for that person. A copy may be cached on a viewer’s own device, so a copy already viewed cannot be recalled from that device — deleting the photo stops any further access but cannot erase a copy someone already has. Your Pi profile picture is not used by Bezy; the photos you add in Bezy are the ones other members see.',
];

const privacyReplacements = [
  {
    // intro
    index: 'intro',
    from: /[\s\S]*/,
    to: 'Bezy is a Pi-native service. The Bezy app runs inside Pi Browser and signs you in with your Pi account, while Bezy services are operated through Vercel and a server-side PostgreSQL database hosted by Neon.',
  },
  {
    index: 1,
    from: /[\s\S]*/,
    to: 'When you use Bezy through Pi, we receive your Pi user identifier (UID) and username. We do not receive your Pi password, and we do not receive any personal details from Pi beyond those two values. We also process information you choose to provide in your Bezy profile: age, gender, who you are looking for, the area or city you enter (we do not use GPS or precise location), interests, a short bio, and the dating photos you add. We also process likes, passes, matches, messages, membership status, reports and moderation information, the operational counters needed for rate limiting and abuse protection, and any support requests you send us.',
  },
  {
    index: 3,
    from: /authenticate you through Telegram/,
    to: 'authenticate you through Pi',
  },
  {
    index: 5,
    from: /[\s\S]*/,
    to: 'Bezy currently uses Pi Network for sign-in and for payment processing; Vercel for hosting, serverless API execution and private photo storage; and Neon as the provider of the managed server-side PostgreSQL database. The Bezy app has no direct access to the database or to the photo store.',
  },
  {
    index: 6,
    from: /[\s\S]*/,
    to: 'Bezy Premium is paid in Pi. Payment is handled by Pi Network’s own payment flow, shown to you inside the Pi app: Bezy never sees your wallet credentials or any card details, and Bezy cannot charge you without your approval of each payment. Bezy’s server checks every payment against Pi’s Platform API before Premium is granted, and records the payment identifier, plan, amount and dates so the entitlement survives a reinstall. Premium is a one-off payment for a fixed period, not an automatic subscription. Additional payment information is governed by the applicable Pi Network terms.',
  },
  {
    index: 8,
    from: /correct Telegram account/,
    to: 'correct account',
  },
  {
    index: 10,
    from: /Telegram Mini App identity data is validated server-side before it is trusted\./,
    to: 'Pi access tokens are validated server-side against the Pi Platform API before they are trusted.',
  },
  {
    index: 11,
    from: /or the Telegram bot where appropriate/,
    to: 'where appropriate',
  },
  {
    index: 12,
    from: /Blocking or reporting someone in Bezy does not block or report them on Telegram; use Telegram’s own controls for that\./,
    to: 'Blocking and reporting take effect across the whole Bezy community, on both networks: the person cannot see you, message you or match with you anywhere in Bezy.',
  },
  {
    index: 13,
    from: /containing only a Telegram identifier, a plan, an amount and dates/,
    to: 'containing only a Pi identifier, a plan, an amount and dates',
  },
  {
    index: 13,
    from: /Deleting your Bezy account does not delete your Telegram account\./,
    to: 'Deleting your Bezy account does not delete your Pi account.',
  },
];

const termsReplacements = [
  {
    index: 'intro',
    from: /[\s\S]*/,
    to: 'Please read these terms before using Bezy. Bezy is an adult social and dating service delivered as an app inside Pi Browser, and its community is shared with Bezy’s Telegram Mini App.',
  },
  {
    index: 3,
    from: /[\s\S]*/,
    to: 'Bezy uses Pi Network as its identity layer. You sign in with your Pi account, and your use of Pi remains subject to Pi Network’s own terms and policies. Bezy does not provide a separate password-based account, and Bezy never receives your Pi password or wallet credentials.',
  },
  {
    index: 9,
    from: /[\s\S]*/,
    to: 'Bezy offers optional paid features (Bezy Premium) paid in Pi, which is the only payment method Bezy uses for Premium. Each purchase is a one-off payment for a fixed period and does <strong>not</strong> renew automatically, so there is no subscription to cancel: access simply ends when the period you paid for ends, unless you choose to buy again. Buying again while your membership is still active adds the new period to your existing expiry rather than replacing it. Prices, plan lengths and the purchase flow are shown inside the app, and you approve every payment yourself in Pi; Bezy never charges you automatically. Purchases are subject to the applicable Pi Network payment terms and to any mandatory consumer rights. If a Premium payment is refunded, Premium access is removed from your account immediately, even if the period you purchased has not yet ended. Paid features do not change Bezy’s safety or conduct rules, and buying Premium does not guarantee matches, dates or any other outcome.',
  },
];

// Headings carry the same facts as the bodies, so they need the same treatment. Matched by
// text, not position, because inserting sections shifts every index after them.
const termsHeadingReplacements = [
  [/^(\d+\. )Telegram account$/, '$1Pi account'],
  [/^(\d+\. )Premium and Telegram Stars$/, '$1Premium and Pi payments'],
];

function applyReplacements(obj, replacements, extra = []) {
  for (const r of replacements) {
    if (r.index === 'intro') {
      obj.intro = obj.intro.replace(r.from, r.to);
    } else {
      const section = obj.sections[r.index];
      const next = section[1].replace(r.from, r.to);
      if (next === section[1]) throw new Error(`no match for ${section[0]} (${r.from})`);
      section[1] = next;
    }
  }
  // Insert the new sections after "Messages" (index 2) so they sit with the data sections.
  // Copied, not shared: both pages splice these, and renumbering mutates them in place, so a
  // shared reference would leave one page carrying the other's numbers.
  obj.sections.splice(3, 0, [...CROSS_PLATFORM], [...PHOTOS]);
  // Renumber every heading in order, so inserting a section can never leave two 3s.
  const start = Number(obj.sections[0][0].match(/^(\d+)\./)?.[1] ?? 1);
  obj.sections.forEach((section, i) => {
    section[0] = `${start + i}. ${section[0].replace(/^\d+\.\s*/, '')}`;
  });
  return obj;
}

function page(obj, route) {
  const body = obj.sections
    .map(([h, p]) => `      <h2>${h}</h2>\n      <p>${p}</p>`)
    .join('\n');
  return `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bezy — ${obj.title}",
  description: "${obj.title} for the Bezy app on Pi Network.",
};

/**
 * Generated from the Telegram app's ${obj.title.toLowerCase()} so the two stay in step.
 * Only the facts that differ between the networks are changed.
 */
export default function ${route}() {
  return (
    <main className="mx-auto w-full max-w-[760px] px-4 py-8 text-bz-ink">
      <h1 className="font-display text-3xl font-bold tracking-tight">${obj.title}</h1>
      <p className="mt-1 text-xs text-bz-muted">${obj.date}</p>
      <p className="mt-6 text-sm leading-relaxed text-bz-muted">${obj.intro}</p>
${body}
      <p className="mt-8 text-xs leading-relaxed text-bz-faint">
        Contact: contacts@digitalconcordia.com — we aim to answer within 3 working days.
      </p>
    </main>
  );
}
`;
}

const privacy = applyReplacements(load('privacy'), privacyReplacements);
const terms = applyReplacements(load('terms'), termsReplacements);
for (const [from, to] of termsHeadingReplacements) {
  const hit = terms.sections.find((section) => from.test(section[0]));
  if (!hit) throw new Error(`heading not matched: ${from}`);
  hit[0] = hit[0].replace(from, to);
}

fs.mkdirSync('pi-app/app/privacy', { recursive: true });
fs.mkdirSync('pi-app/app/terms', { recursive: true });
fs.writeFileSync('pi-app/app/privacy/page.tsx', page(privacy, 'PrivacyPolicy'));
fs.writeFileSync('pi-app/app/terms/page.tsx', page(terms, 'TermsOfService'));

for (const [name, obj] of [['privacy', privacy], ['terms', terms]]) {
  const leftover = obj.sections.filter(([, p]) => /Telegram|Stars/.test(p)).map(([h]) => h);
  console.log(`${name}: ${obj.sections.length} sections` + (leftover.length ? ` — STILL MENTIONS TELEGRAM: ${leftover.join('; ')}` : ' — clean'));
}
