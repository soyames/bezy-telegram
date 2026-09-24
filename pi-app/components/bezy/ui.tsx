"use client";

import Image from "next/image";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  SVGProps,
  TextareaHTMLAttributes,
} from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// The App Studio host serves /_next/static but not public/, so both marks travel as
// bundled module assets instead of public/ paths. The artwork itself is the supplied
// export artwork, unchanged.
import bezyLogo from "@/lib/bezy/assets/bezy-logo.png";
import bezyLockup from "@/lib/bezy/assets/bezy-logo-lockup.png";
import bezyIcon from "@/lib/bezy/assets/bezy-icon.png";

/**
 * Official Bezy logo — used in the header and the onboarding welcome screen. This is the
 * tightly cropped lockup the Telegram mini app also shows, not the padded square: on the
 * square canvas the artwork only fills about 58%, so it rendered noticeably small.
 */
export function BezyLogo({ className }: { className?: string }) {
  return (
    <span className={cx("relative block shrink-0 overflow-hidden", className)}>
      <Image
        src={bezyLockup}
        alt="Bezy"
        fill
        sizes="160px"
        className="object-contain"
        priority
      />
    </span>
  );
}

/** Cropped "B" mark from the official Bezy icon artwork — used for small icon badges. */
export function BezyMark({ className }: { className?: string }) {
  return (
    <span className={cx("relative block shrink-0 overflow-hidden", className)}>
      <Image
        src={bezyIcon}
        alt="Bezy"
        fill
        sizes="96px"
        className="scale-[1.65] object-cover"
      />
    </span>
  );
}

/* ---------- icons ---------- */

function S(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

export const IconHeart = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M19 5.5c-1.7-1.6-4.4-1.5-6 .2l-1 1-1-1c-1.6-1.7-4.3-1.8-6-.2-1.8 1.7-1.9 4.5-.2 6.3L12 20l7.2-7.4c1.7-1.8 1.6-4.6-.2-6.3Z" />
  </S>
);
export const IconHeartFilled = (p: SVGProps<SVGSVGElement>) => (
  <S {...p} fill="currentColor" stroke="none">
    <path d="M19 5.5c-1.7-1.6-4.4-1.5-6 .2l-1 1-1-1c-1.6-1.7-4.3-1.8-6-.2-1.8 1.7-1.9 4.5-.2 6.3L12 20l7.2-7.4c1.7-1.8 1.6-4.6-.2-6.3Z" />
  </S>
);
export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </S>
);
export const IconClose = IconX;
export const IconChat = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-6.1A8.4 8.4 0 1 1 21 11.5Z" />
  </S>
);
/* Discover and Messages carry the Telegram mini app's own glyphs so the tab bar reads
   identically on both networks. */
export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </S>
);
export const IconMail = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </S>
);
export const IconUser = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
  </S>
);
export const IconSpark = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </S>
);
export const IconBack = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M15 5 8 12l7 7" />
  </S>
);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="m9 6 6 6-6 6" />
  </S>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M20 6 9 17l-5-5" />
  </S>
);
export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />
  </S>
);
export const IconFlag = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M5 21V4M5 4h11l-1.5 3L16 10H5" />
  </S>
);
export const IconBan = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m6 6 12 12" />
  </S>
);
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6h.2A1.6 1.6 0 0 0 9 1.1V1a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 15 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1Z" />
  </S>
);
export const IconEdit = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </S>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </S>
);
export const IconPin = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </S>
);
export const IconSend = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M4 12 20 4l-6 16-3-7-7-1Z" />
  </S>
);
export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </S>
);
export const IconEye = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </S>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);
export const IconCamera = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.2" />
  </S>
);
export const IconStar = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.6l1-5.8L3.5 9.7l5.9-.9Z" />
  </S>
);
export const IconGavel = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <path d="m14 6-6 6M9 5l5 5M4 20l6-6M13 3l8 8M15 13l4 4" />
  </S>
);
export const IconInfo = (p: SVGProps<SVGSVGElement>) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </S>
);

/* ---------- buttons ---------- */

type Variant = "primary" | "solid" | "outline" | "ghost" | "danger" | "like";

const VARIANT: Record<Variant, string> = {
  primary: "bz-rose-grad text-bz-on-rose shadow-sm",
  solid: "bg-bz-ink text-white",
  outline: "border border-bz-line bg-bz-panel text-bz-ink",
  ghost: "text-bz-muted",
  danger: "bg-bz-danger text-white",
  like: "bg-bz-like text-white",
};

export function Button({
  variant = "primary",
  block,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  return (
    <button
      className={cx(
        "bz-press inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold font-display disabled:opacity-50 disabled:pointer-events-none",
        VARIANT[variant],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cx(
        "text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-bz-faint",
        className,
      )}
    >
      {children}
    </p>
  );
}

type PillTone = "neutral" | "rose" | "peach" | "plum" | "like" | "danger" | "gold";
const PILL: Record<PillTone, string> = {
  neutral: "bg-bz-panel-2 text-bz-muted",
  rose: "bg-bz-rose-soft text-bz-rose-deep",
  peach: "bg-bz-peach-soft text-bz-ink",
  plum: "bg-bz-plum-soft text-bz-plum",
  like: "bg-bz-like-soft text-bz-like",
  danger: "bg-bz-danger-soft text-bz-danger",
  gold: "bg-[color-mix(in_oklch,var(--bz-gold),white_78%)] text-[color-mix(in_oklch,var(--bz-gold),black_28%)]",
};

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------- form fields ---------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-bz-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-bz-faint">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-2xl border border-bz-line bg-bz-panel px-4 py-3 text-[0.95rem] text-bz-ink placeholder:text-bz-faint outline-none focus:border-bz-rose focus:ring-2 focus:ring-bz-rose-soft";

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputBase, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputBase, "resize-none leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(inputBase, "appearance-none pr-10", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        // min-h-11 keeps every chip at the 44px touch minimum without changing how it
        // looks — the extra height lands in the padding.
        "bz-press inline-flex min-h-11 items-center rounded-full border px-3.5 py-2 text-sm font-medium",
        active
          ? "border-bz-rose bg-bz-rose-soft text-bz-rose-deep"
          : "border-bz-line bg-bz-panel text-bz-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block h-5 w-5 rounded-full border-2 border-current border-t-transparent anim-spin",
        className,
      )}
    />
  );
}

