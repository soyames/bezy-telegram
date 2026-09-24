import type React from "react";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Poppins, Manrope } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { AppWrapper } from "@/components/app-wrapper";
import bezyLogo from "@/lib/bezy/assets/bezy-logo.png";
import "./globals.css";

const display = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-bz-display",
});

const sans = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bz-sans",
});

export const metadata: Metadata = {
  title: "Bezy",
  description: "Bezy — a warm, respectful dating app for adult Pioneers.",
  icons: {
    icon: bezyLogo.src,
    apple: bezyLogo.src,
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${GeistMono.variable} bg-background`}
    >
      <body className="font-sans">
        {/* Pi requires its SDK in the document head and loaded before any Pi call;
            injecting it later makes every step below fail silently. */}
        <Script src="https://sdk.minepi.com/pi-sdk.js" strategy="beforeInteractive" />
        <AppWrapper>{children}</AppWrapper>
      </body>
    </html>
  );
}
