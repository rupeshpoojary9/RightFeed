import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "RightFeed",
  description: "A calm, growth-focused video feed. No brain rot.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
