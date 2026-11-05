import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card empty">
      <h1>This page isn&apos;t here</h1>
      <p>The link may be old, or the video may no longer be in your feed.</p>
      <Link href="/" className="btn primary">Go to Today</Link>
    </div>
  );
}
