"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h2>Workspace unavailable</h2>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
