"use client";
import { Suspense, useEffect, useState } from "react";
import Form from "next/form";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NavLinks from "./NavLinks";
import SearchField from "./SearchField";
import Icon, { Mark } from "./Icons";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [toggled, setToggled] = useState(false);
  useEffect(() => setToggled(false), [path]);

  // The buddy page is shared with someone else, so it gets none of the app's navigation.
  if (path.startsWith("/share")) return <main className="share-main">{children}</main>;

  return (
    <div className="app" data-toggled={toggled} data-route={path.startsWith("/watch") ? "watch" : "page"}>
      <header className="topbar">
        <div className="topbar-start">
          <button className="iconbtn" aria-label="Menu" aria-controls="guide" aria-expanded={toggled} onClick={() => setToggled((t) => !t)}>
            <Icon name="menu" />
          </button>
          <Link href="/" className="brand" aria-label="RightFeed home">
            <Mark />
            <span>RightFeed</span>
          </Link>
        </div>
        <Form action="/search" className="search" role="search">
          <Suspense fallback={<input name="q" type="search" placeholder="Search notes" aria-label="Search your notes and transcripts" />}>
            <SearchField />
          </Suspense>
          <button aria-label="Search"><Icon name="search" /></button>
        </Form>
        <Link href="/settings" className="btn iconbtn" aria-label="Settings"><Icon name="gear" /></Link>
      </header>
      <NavLinks />
      <button className="scrim" aria-label="Close menu" onClick={() => setToggled(false)} />
      <main><div className="page">{children}</div></main>
    </div>
  );
}
