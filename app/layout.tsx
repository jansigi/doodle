import type { Metadata } from "next";
import localFont from "next/font/local";
import { AudioLines } from "lucide-react";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Worship-Band-Planer",
  description: "Semesterplanung für die Worship-Band",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <header className="border-b border-slate-200/80 bg-white">
          {/* Not a link: band members land on their doodle and should not
              wander off to the create page. */}
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-2.5 px-4 sm:px-6">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-indigo-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16)]">
              <AudioLines className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              Worship-Band-Planer
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
