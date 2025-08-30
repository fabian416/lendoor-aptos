import type React from "react"
import type { ReactNode } from "react";
import "./globals.css"
import type { Metadata } from "next"
import { Inter, JetBrains_Mono, Geist_Mono } from "next/font/google"
import { Header } from "@/components/common/Header";
import { DynamicProvider } from "@/components/providers/DynamicProvider";
import { Suspense } from "react";
import { UserJourneyProvider } from "@/components/providers/UserProvider";

const inter = Inter({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "Lendoor",
  description:
    "Lendoor is a zero-knowledge-powered platform for uncollateralized crypto lending. Prove your creditworthiness privately, borrow instantly, no collateral required.",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon.png", type: "image/png" },
    ],
  },
}

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600", "700", "800"],
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
  weight: ["400", "500", "600"],
})

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jetbrainsMono.variable} ${geistMono.variable} antialiased`}
    >
      <body className={inter.className}>
        <DynamicProvider>
          <UserJourneyProvider>
          <div className="min-h-screen bg-background">
            {/* Background geométrico sutil en blanco */}
            <div className="fixed inset-0 opacity-5 pointer-events-none">
              <div
                className="absolute inset-0"
              />
            </div>

            <div className="relative z-10">
              <Header />
              <main className="container mx-auto px-4 py-8 max-w-4xl">
                <div className="pointer-events-none fixed inset-0 -z-10 terminal-grid" />
                <Suspense fallback={null}>{children}</Suspense>
              </main>
            </div>
          </div>
          </UserJourneyProvider>
        </DynamicProvider>
      </body>
    </html>
  );
}
