import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import NavLinks from "@/components/NavLinks";

export const metadata: Metadata = {
  title: "MyTube",
  description: "A calm, growth-focused video feed. No brain rot.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-dot" aria-hidden /> MyTube
            </Link>
            <NavLinks />
          </div>
        </header>
        <div className="shell">
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
