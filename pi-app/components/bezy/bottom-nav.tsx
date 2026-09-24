"use client";

import { useBezy } from "@/contexts/bezy-context";
import { useNav, type Tab } from "@/components/bezy/nav";
import {
  IconHeart,
  IconHeartFilled,
  IconHome,
  IconMail,
  IconUser,
  cx,
} from "@/components/bezy/ui";

/** Same four tabs, same order and same glyphs as the Telegram mini app's bottom bar. */
const TABS: { id: Tab; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "matches", label: "Matches" },
  { id: "messages", label: "Messages" },
  { id: "profile", label: "Profile" },
];

function TabIcon({ id, active }: { id: Tab; active: boolean }) {
  const className = "h-[22px] w-[22px]";
  if (id === "discover") return <IconHome className={className} />;
  if (id === "matches")
    return active ? (
      <IconHeartFilled className={className} />
    ) : (
      <IconHeart className={className} />
    );
  if (id === "messages") return <IconMail className={className} />;
  return <IconUser className={className} />;
}

export function BottomNav() {
  const { tab, setTab } = useNav();
  const { unreadCount } = useBezy();

  return (
    <nav className="bz-safe-bottom sticky bottom-0 z-40 border-t border-bz-line bg-[rgb(248_247_251/0.94)] backdrop-blur-[18px]">
      <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-[5px] px-3 py-2">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "bz-press relative flex flex-col items-center gap-[3px] rounded-[13px] px-1 py-1.5",
                active ? "bg-bz-rose-soft text-bz-rose" : "text-bz-faint",
              )}
            >
              <span className="relative">
                <TabIcon id={t.id} active={active} />
                {t.id === "messages" && unreadCount > 0 ? (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bz-rose px-1 text-[0.6rem] font-bold text-bz-on-rose">
                    {unreadCount}
                  </span>
                ) : null}
              </span>
              <span className="text-[10px] font-bold">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
