import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppTopbar from "@/components/AppTopbar";
import { getSessioneUtente } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Preventivatore",
  description: "Strumento interno per la creazione di preventivi",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessione = await getSessioneUtente();

  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-brand-surface text-brand-text select-text">
        {sessione && (
          <AppTopbar
            displayName={sessione.displayName}
            isAdmin={sessione.isAdmin}
          />
        )}
        {children}
      </body>
    </html>
  );
}
