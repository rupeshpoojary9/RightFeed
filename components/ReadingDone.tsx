"use client";
import { useTransition } from "react";
import { markReadingDone } from "@/app/actions";

export default function ReadingDone({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="small" disabled={pending} onClick={() => start(() => markReadingDone(id))}>
      ✓ Done
    </button>
  );
}
