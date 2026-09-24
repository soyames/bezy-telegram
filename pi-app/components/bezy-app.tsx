"use client";

import { BezyProvider, useBezy } from "@/contexts/bezy-context";
import { NavProvider, useNav } from "@/components/bezy/nav";
import { LoadingScreen, StorageNotice, ToastHost } from "@/components/bezy/pieces";
import { Onboarding } from "@/components/bezy/onboarding";
import { DiscoverScreen } from "@/components/bezy/discover-screen";
import { MatchesScreen } from "@/components/bezy/matches-screen";
import { MessagesScreen } from "@/components/bezy/messages-screen";
import { ProfileScreen } from "@/components/bezy/profile-screen";
import { BottomNav } from "@/components/bezy/bottom-nav";
import { BrandBar } from "@/components/bezy/brand-bar";
import { CandidateDetail } from "@/components/bezy/candidate-detail";
import { ThreadView } from "@/components/bezy/thread-view";
import { ReportSheet } from "@/components/bezy/report-sheet";
import { ProfileEdit } from "@/components/bezy/profile-edit";
import { SettingsScreen } from "@/components/bezy/settings-screen";
import { ModerationScreen } from "@/components/bezy/moderation-screen";
import { PremiumScreen } from "@/components/bezy/premium-screen";
import { LikesScreen } from "@/components/bezy/likes-screen";
import { profileComplete } from "@/lib/bezy/data";

export function BezyApp() {
  return (
    <BezyProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </BezyProvider>
  );
}

function Shell() {
  const { ready, consent, profile } = useBezy();
  const { tab } = useNav();

  if (!ready) return <LoadingScreen />;

  const onboarded = consent.onboarded && profile && profileComplete(profile);
  if (!onboarded) return <Onboarding />;

  return (
    <div className="bz-app-bg mx-auto flex min-h-[100dvh] w-full max-w-md flex-col">
      {/* Same chrome on every tab, exactly as the Telegram mini app carries it. */}
      <BrandBar />

      <main key={tab} className="anim-fade-in flex flex-1 flex-col">
        {tab === "discover" && <DiscoverScreen />}
        {tab === "matches" && <MatchesScreen />}
        {tab === "messages" && <MessagesScreen />}
        {tab === "profile" && <ProfileScreen />}
      </main>

      <BottomNav />

      {/* Overlays */}
      <CandidateDetail />
      <ThreadView />
      <ProfileEdit />
      <SettingsScreen />
      <ModerationScreen />
      <PremiumScreen />
      <LikesScreen />
      <ReportSheet />

      <ToastHost />
      <StorageNotice />
    </div>
  );
}
