import Link from "next/link";
import {
  ArrowUpRight,
  Sparkles,
  Wallet,
  CheckCircle,
  Clock3,
  CircleAlert,
} from "lucide-react";
import { metrics } from "@/lib/service";
import { baht } from "@/lib/display";
import { History } from "@/components/shared";
import { Trend } from "@/components/chart";
export default async function Home() {
  const m = await metrics();
  return (
    <>
      <h1>Payment overview</h1>
      <p className="sub">Revenue and collections for Studio Bangkok.</p>
      <section className="stats">
        {[
          { label: "Total revenue", v: baht(m.revenue), icon: Wallet },
          { label: "Successful payments", v: m.success, icon: CheckCircle },
          { label: "Outstanding balance", v: baht(m.pending), icon: Clock3 },
          { label: "Failed attempts", v: m.failed, icon: CircleAlert },
        ].map((k) => (
          <article key={k.label}>
            <k.icon size={18} />
            <small>{k.label}</small>
            <b>{k.v}</b>
          </article>
        ))}
      </section>
      <div className="split">
        <section className="panel">
          <h2>Revenue trend</h2>
          <p className="sub">Settled payments · last 14 days · THB</p>
          <Trend data={m.trend} />
        </section>
        <section className="hero">
          <Sparkles size={24} />
          <h2>Collection assistant</h2>
          <p>
            {m.customers} customers have {baht(m.pending)} outstanding across{" "}
            {m.open} open orders.
          </p>
          <Link className="button light" href="/assistant">
            Review collections <ArrowUpRight size={16} />
          </Link>
        </section>
      </div>
      <section className="panel">
        <div className="row">
          <h2>Recent transactions</h2>
          <Link href="/transactions">View all →</Link>
        </div>
        <History compact />
      </section>
      <section className="panel">
        <h2>Payment performance</h2>
        <p>
          {m.denominator ? m.rate.toFixed(1) + "% success" : "No attempts yet"}{" "}
          · {m.success} settlements / {m.denominator} recorded attempts
        </p>
        {m.methods.map((x) => (
          <p key={x.method}>
            {x.method} · {x._count} successful payments
          </p>
        ))}
      </section>
    </>
  );
}
