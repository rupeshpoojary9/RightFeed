"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPath } from "@/app/actions";

export default function CreatePathForm({ goals }: { goals: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState(createPath, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.push(`/paths/${state.data}`);
  }, [state, router]);

  return (
    <form action={action}>
      <label htmlFor="goal_id">Goal</label>
      <div className="inline-form">
        <select id="goal_id" name="goal_id" required defaultValue={goals[0]?.id}>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button className="primary" disabled={pending}>{pending ? "Designing your path…" : "Build path"}</button>
      </div>
      {state && !state.ok ? <p className="small" style={{ color: "var(--danger)", marginTop: 6 }}>{state.error}</p> : null}
    </form>
  );
}
