"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Icon from "./Icons";

type Item = { href: string; label: string; icon: Parameters<typeof Icon>[0]["name"] };

const GROUPS: { title?: string; items: Item[] }[] = [
  { items: [{ href: "/", label: "Today", icon: "home" }] },
  {
    title: "Library",
    items: [
      { href: "/library?tab=later", label: "Watch later", icon: "clock" },
      { href: "/library?tab=history", label: "History", icon: "history" },
      { href: "/library?tab=filtered", label: "Filtered out", icon: "filter" },
    ],
  },
  {
    title: "Learn",
    items: [
      { href: "/paths", label: "Paths", icon: "path" },
      { href: "/review", label: "Review", icon: "cards" },
      { href: "/progress", label: "Progress", icon: "chart" },
      { href: "/search", label: "Search", icon: "search" },
    ],
  },
  { items: [{ href: "/settings", label: "Settings", icon: "gear" }] },
];

function Links() {
  const path = usePathname();
  const params = useSearchParams();
  const isCurrent = (href: string) => {
    if (href === "/") return path === "/";
    if (href.startsWith("/library")) return path === "/library" && href.endsWith(`=${params.get("tab") ?? "later"}`);
    return path.startsWith(href);
  };
  return (
    <>
      {GROUPS.map((g, i) => (
        <div key={i} className="guide-group">
          {g.title ? <div className="guide-title">{g.title}</div> : null}
          {g.items.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isCurrent(l.href) ? "page" : undefined}>
              <Icon name={l.icon} />
              {l.label}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

export default function NavLinks() {
  return (
    <nav className="guide" aria-label="Main" id="guide">
      <Suspense fallback={null}>
        <Links />
      </Suspense>
    </nav>
  );
}
