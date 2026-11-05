type Pick = { id: string; goal_id: number | null };

/**
 * Fills the lineup up to `size`. Existing picks keep their places, and each new video takes
 * the first free place, so a dropped video is replaced where it was. Each new video comes
 * from the goal with the fewest picks; `pool` must be ordered best first.
 */
export function fillLineup<T extends Pick>(active: (T & { position: number })[], pool: T[], size: number): (T & { position: number })[] {
  const taken = new Set(active.map((v) => v.id));
  const used = new Set(active.map((v) => v.position));
  const counts = new Map<number | null, number>();
  for (const v of active) counts.set(v.goal_id, (counts.get(v.goal_id) ?? 0) + 1);

  const queues = new Map<number | null, T[]>();
  for (const v of pool) {
    if (taken.has(v.id)) continue;
    if (!queues.has(v.goal_id)) queues.set(v.goal_id, []);
    queues.get(v.goal_id)!.push(v);
  }

  const added: (T & { position: number })[] = [];
  let position = 0;
  while (active.length + added.length < size) {
    let goal: number | null | undefined;
    for (const [g, q] of queues) {
      if (q.length && (goal === undefined || (counts.get(g) ?? 0) < (counts.get(goal) ?? 0))) goal = g;
    }
    if (goal === undefined) break;
    while (used.has(position)) position++;
    used.add(position);
    added.push({ ...queues.get(goal)!.shift()!, position });
    counts.set(goal, (counts.get(goal) ?? 0) + 1);
  }
  return added;
}
