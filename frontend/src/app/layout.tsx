import type React from "react"
import type { ReactNode } from "react";
import "./globals.css"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { DynamicProvider } from "@/components/DynamicProvider";
import Background from "@/components/Background";

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "LenDoor",
  description:
    "LenDoor is a zero-knowledge-powered platform for uncollateralized crypto lending. Prove your creditworthiness privately, borrow instantly, no collateral required.",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon.png", type: "image/png" },
    ],
  },
}


export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <DynamicProvider>
          <Background>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-grow p-4">{children}</main>
              <Footer />
            </div>
          </Background>
        </DynamicProvider>
      </body>
    </html>
  );
}