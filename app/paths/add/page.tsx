import Link from "next/link";
import { notFound } from "next/navigation";
import { all } from "@/lib/db";
import { getVideo } from "@/lib/learn";
import AddToPathForm from "@/components/AddToPathForm";

export const dynamic = "force-dynamic";

export default async function AddToPathPage({ searchParams }: { searchParams: Promise<{ video?: string }> }) {
  const { video: id } = await searchParams;
  const video = id ? getVideo(id) : undefined;
  if (!video) notFound();
  const paths = all<{ id: number; title: string }>("SELECT id, title FROM paths ORDER BY created_at DESC");
  const sections = all<{ id: number; path_id: number; title: string }>("SELECT id, path_id, title FROM path_sections ORDER BY position, id");

  return (
    <div className="stack add-path">
      <Link href={`/watch/${video.id}`} className="small muted">Back to the video</Link>
      <h1>Add to path</h1>
      <p className="muted">{video.title}</p>
      {paths.length ? (
        paths.map((p) => (
          <div key={p.id} className="card">
            <AddToPathForm video={video.id} pathId={p.id} pathTitle={p.title} sections={sections.filter((s) => s.path_id === p.id)} />
          </div>
        ))
      ) : (
        <div className="card empty">
          <h2>No paths yet</h2>
          <p><Link href="/paths">Create a path</Link> first, then add this video to it.</p>
        </div>
      )}
    </div>
  );
}
