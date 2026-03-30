import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeNest BZR",
  description: "SaaS za agencije bezbednosti i zdravlja na radu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
