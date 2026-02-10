import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OutreachAI",
  description: "Event-driven AI CRM for cold outreach"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
