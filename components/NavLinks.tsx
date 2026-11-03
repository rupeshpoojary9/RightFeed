"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/library", label: "Library" },
  { href: "/paths", label: "Paths" },
  { href: "/review", label: "Review" },
  { href: "/progress", label: "Progress" },
  { href: "/search", label: "Search" },
  { href: "/settings", label: "Settings" },
];

export default function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
