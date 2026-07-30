import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import { OfflineProvider } from "@/components/offline/OfflineProvider";
import { getUserLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-bzr",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  variable: "--font-display",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Bez Zrna Rizika",
  description: "Bezbednost i zdravlje na radu — BZR app",
};

const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem('bzr-theme');
    if (t !== 'light' && t !== 'dark') t = 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getUserLocale();

  return (
    <html lang={locale} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${manrope.variable} ${cormorant.variable} min-h-screen bg-bg font-sans antialiased text-ink`}
      >
        <ThemeProvider>
          <LocaleProvider locale={locale}>
            <div className="bzr-global-chrome fixed right-3 top-3 z-50 flex items-center gap-2">
              <ThemeToggle />
            </div>
            <LocaleSwitcher />
            <OfflineProvider />
            {children}
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
