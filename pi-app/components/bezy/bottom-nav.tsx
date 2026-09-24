"use client";

import { useBezy } from "@/contexts/bezy-context";
import { useNav, type Tab } from "@/components/bezy/nav";
import {
  IconChat,
  IconHeart,
  IconHeartFilled,
  IconUser,
  cx,
} from "@/components/bezy/ui";

const TABS: { id: Tab; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "matches", label: "Matches" },
  { id: "profile", label: "Profile" },
];

export function BottomNav() {
  const { tab, setTab } = useNav();
  const { unreadCount } = useBezy();

  return (
    <nav className="bz-safe-bottom sticky bottom-0 z-40 border-t border-bz-line bg-bz-panel/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md items-stretch justify-around px-2 py-1.5">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "bz-press relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[0.7rem] font-semibold",
                active ? "text-bz-rose" : "text-bz-faint",
              )}
            >
              <span className="relative">
                {t.id === "discover" ? (
                  active ? (
                    <IconHeartFilled className="h-6 w-6" />
                  ) : (
                    <IconHeart className="h-6 w-6" />
                  )
                ) : t.id === "matches" ? (
                  <IconChat className="h-6 w-6" />
                ) : (
                  <IconUser className="h-6 w-6" />
                )}
                {t.id === "matches" && unreadCount > 0 ? (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bz-rose px-1 text-[0.6rem] font-bold text-bz-on-rose">
                    {unreadCount}
                  </span>
                ) : null}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
