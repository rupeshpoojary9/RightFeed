const PATHS: Record<string, string> = {
  menu: "M4 6h16M4 12h16M4 18h16",
  home: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2",
  history: "M4 12a8 8 0 1 0 2.6-5.9L4 8.5M4 4v4.5h4.5M12 8v4.5l3 1.8",
  filter: "M4 5h16l-6.5 7.5V19l-3 1.5v-8z",
  path: "M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM18 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 8v3a3 3 0 0 0 3 3h6a3 3 0 0 1 3 2",
  cards: "M8 3h12v14H8zM4 7v14h12",
  chart: "M5 20V11M12 20V4M19 20v-6",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3l1.2 2.6 2.8-.8.8 2.8 2.6 1.2-1.2 2.2 1.2 2.2-2.6 1.2-.8 2.8-2.8-.8L12 21l-1.2-2.6-2.8.8-.8-2.8-2.6-1.2 1.2-2.2L4.6 9.8l2.6-1.2.8-2.8 2.8.8z",
  up: "M7 11l4-8a2 2 0 0 1 2 2v4h6l-2 11H7zM7 11H3v9h4",
  down: "M17 13l-4 8a2 2 0 0 1-2-2v-4H5L7 4h10zM17 13h4V4h-4",
  save: "M6 3h12v18l-6-4-6 4z",
  check: "M4 12l5 5L20 6",
  more: "M12 5.5v.01M12 12v.01M12 18.5v.01",
  refresh: "M20 12a8 8 0 1 1-2.6-5.9L20 8.5M20 4v4.5h-4.5",
  block: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8",
  close: "M6 6l12 12M18 6L6 18",
  "up-arrow": "M12 19V5M6 11l6-6 6 6",
  play: "M8 5l11 7-11 7z",
};

export default function Icon({ name, size = 24 }: { name: keyof typeof PATHS; size?: number }) {
  const heavy = name === "more";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={heavy ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** RightFeed's mark: the letter R, with a play triangle as its counter. */
export function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--color-accent)" />
      <path fill="var(--color-accent-ink)" fillRule="evenodd" d="M15 12.500a2.500 2.500 0 0 1 2.500-2.500H35c10.200 0 17 6.800 17 15.800 0 6.800-3.700 12-9.700 14.400l9.400 13.100c1.200 1.700 0 3.700-2 3.700h-8.400c-.8 0-1.600-.4-2.100-1.100L30.600 42H27v9.500a2.500 2.500 0 0 1-2.500 2.500h-7a2.500 2.500 0 0 1-2.500-2.500zM27 19.800v12.400c0 1 1.100 1.600 2 1.100l10.200-6.200c.8-.5.8-1.700 0-2.200L29 18.700c-.9-.5-2 .1-2 1.100z" />
    </svg>
  );
}
