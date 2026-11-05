"use client";
import { useSearchParams } from "next/navigation";

const LABEL = "Search your notes and transcripts";

/** The top bar's search input, showing the current query on the results page. */
export default function SearchField() {
  const q = useSearchParams().get("q") ?? "";
  return <input key={q} name="q" type="search" defaultValue={q} placeholder="Search notes" aria-label={LABEL} title={LABEL} />;
}
