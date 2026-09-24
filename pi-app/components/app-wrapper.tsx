"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PiAuthProvider, usePiAuth } from "@/contexts/pi-auth-context";
import { AuthLoadingScreen } from "./auth-loading-screen";

/**
 * Readable without a Pi session. These are the privacy and terms links given to Pi's
 * developer portal for app review, so they cannot sit behind the sign-in gate.
 */
const PUBLIC_ROUTES = ["/privacy", "/terms"];

function AppContent({ children }: { children: ReactNode }) {
  const { isAuthenticated } = usePiAuth();
  const pathname = usePathname();
  if (PUBLIC_ROUTES.includes(pathname)) return <>{children}</>;
  if (!isAuthenticated) return <AuthLoadingScreen />;
  return <>{children}</>;
}

export function AppWrapper({ children }: { children: ReactNode }) {
  return (
    <PiAuthProvider>
      <AppContent>{children}</AppContent>
    </PiAuthProvider>
  );
}
