"use client";
import { useState, useTransition } from "react";
import { generateReflection } from "@/app/actions";

export default function ReflectionButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className="primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await generateReflection();
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "Reflecting on your week…" : "Write this week's reflection"}
      </button>
      {error ? <p className="small" style={{ color: "var(--color-error)" }}>{error}</p> : null}
    </div>
  );
}
