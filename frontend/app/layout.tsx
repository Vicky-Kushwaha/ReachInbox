import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReachInbox — Email Scheduler",
  description: "A tiny slice of ReachInbox's cold email scheduling engine.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900 antialiased">{children}</body>
    </html>
  );
}
