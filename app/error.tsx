"use client";
export default function ErrorPage() {
  return (
    <section className="panel">
      <h2>Workspace unavailable</h2>
      <button onClick={() => window.location.reload()}>Try again</button>
    </section>
  );
}
