"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { BezyMark, cx, IconClose, Spinner } from "@/components/bezy/ui";
import { getPhotoUrl, subscribePhotos } from "@/lib/bezy/photos";
import { initialsOf, type PhotoRef } from "@/lib/bezy/data";
import { useBezy } from "@/contexts/bezy-context";

/* ---------- loading + branding ---------- */

export function LoadingScreen({ label = "Warming things up…" }: { label?: string }) {
  return (
    <div className="bz-app-bg flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6">
      <BezyMark className="h-14 w-14 rounded-2xl" />
      <p className="font-display text-xl font-semibold text-bz-ink">Bezy</p>
      <div className="flex items-center gap-2 text-bz-muted">
        <Spinner className="h-4 w-4 text-bz-rose" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

/* ---------- storage notice ---------- */

export function StorageNotice() {
  const { storageTrouble } = useBezy();
  if (!storageTrouble) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-[210] flex justify-center px-4">
      <div className="anim-toast rounded-full border border-bz-line bg-bz-panel px-4 py-2 text-xs font-medium text-bz-muted shadow-lg">
        Still saving to your Pi account…
      </div>
    </div>
  );
}

/* ---------- toasts ---------- */

export function ToastHost() {
  const { toasts } = useBezy();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[200] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "anim-toast max-w-sm rounded-full px-4 py-2.5 text-sm font-medium shadow-lg",
            t.tone === "danger"
              ? "bg-bz-danger text-white"
              : t.tone === "rose"
                ? "bz-rose-grad text-bz-on-rose"
                : "bg-bz-ink text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ---------- overlay + sheet ---------- */

export function Overlay({
  children,
  onClose,
  className,
}: {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[120] bz-app-bg">
      <div
        className={cx("mx-auto flex h-[100dvh] w-full max-w-md flex-col", className)}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
      {onClose ? <span className="sr-only">Close</span> : null}
    </div>
  );
}

export function OverlayHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="bz-safe-top sticky top-0 z-10 flex items-center gap-2 border-b border-bz-line bg-bz-panel/95 px-3 py-3 backdrop-blur">
      <button
        onClick={onBack}
        aria-label="Back"
        className="bz-press flex h-9 w-9 items-center justify-center rounded-full text-bz-ink"
      >
        <IconClose className="h-5 w-5" />
      </button>
      <h2 className="flex-1 truncate font-display text-base font-semibold text-bz-ink">{title}</h2>
      {right}
    </header>
  );
}

export function Sheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 anim-fade-in"
      />
      <div className="anim-sheet bz-safe-bottom relative w-full max-w-md rounded-t-3xl border-t border-bz-line bg-bz-panel p-5 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-bz-line" />
        {children}
      </div>
    </div>
  );
}

/* ---------- confirm (two-step) ---------- */

export function ConfirmButton({
  label,
  confirmLabel = "Tap again to confirm",
  onConfirm,
  className,
  icon,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
  icon?: ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <button
      onClick={() => {
        if (armed) {
          if (timer.current) clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3000);
        }
      }}
      className={cx(
        "bz-press inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold font-display",
        armed ? "bg-bz-danger text-white" : "border border-bz-danger/40 bg-bz-danger-soft text-bz-danger",
        className,
      )}
    >
      {icon}
      {armed ? confirmLabel : label}
    </button>
  );
}

/* ---------- photo art ---------- */

export function usePhotoUrl(id: string | undefined): string | undefined {
  const subscribe = useCallback((cb: () => void) => subscribePhotos(cb), []);
  const get = useCallback(() => (id ? getPhotoUrl(id) : undefined), [id]);
  return useSyncExternalStore(subscribe, get, () => undefined);
}

export function PhotoArt({
  photo,
  name,
  hueA,
  hueB,
  className,
  rounded = "rounded-3xl",
}: {
  photo?: PhotoRef | null;
  name: string;
  hueA?: number;
  hueB?: number;
  className?: string;
  rounded?: string;
}) {
  const url = usePhotoUrl(photo?.id);
  const a = hueA ?? photo?.hue ?? 12;
  const b = hueB ?? ((a + 40) % 360);
  const gradient = `linear-gradient(150deg, oklch(0.8 0.12 ${a}), oklch(0.62 0.16 ${b}))`;
  return (
    <div
      className={cx("relative overflow-hidden bg-bz-panel-2", rounded, className)}
      style={{ backgroundImage: url ? undefined : gradient }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url || "/placeholder.svg"} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="font-display text-4xl font-bold text-white/85">{initialsOf(name)}</span>
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      {icon ? (
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-bz-rose-soft text-bz-rose">
          {icon}
        </span>
      ) : null}
      <h3 className="font-display text-lg font-semibold text-bz-ink">{title}</h3>
      {children ? (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-bz-muted">{children}</p>
      ) : null}
    </div>
  );
}

export function Avatar({
  name,
  photo,
  hueA,
  hueB,
  size = 44,
  className,
}: {
  name: string;
  photo?: PhotoRef | null;
  hueA?: number;
  hueB?: number;
  size?: number;
  className?: string;
}) {
  return (
    <div style={{ width: size, height: size }} className={cx("shrink-0", className)}>
      <PhotoArt photo={photo} name={name} hueA={hueA} hueB={hueB} rounded="rounded-full" className="h-full w-full" />
    </div>
  );
}
