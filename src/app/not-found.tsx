import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <div className="eyebrow mb-3">404</div>
        <h1 className="h-display text-[56px]">This room <em>isn&apos;t</em> on file.</h1>
        <Link href="/" className="btn-primary mt-6">Back to overview</Link>
      </div>
    </div>
  );
}
