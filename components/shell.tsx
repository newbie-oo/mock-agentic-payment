"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PanelsTopLeft,
  ArrowRightLeft,
  Link2,
  Sparkles,
  Layers3,
} from "lucide-react";
const pages = [
  { href: "/", name: "Overview", icon: PanelsTopLeft },
  { href: "/transactions", name: "Transactions", icon: ArrowRightLeft },
  { href: "/links", name: "Payment Links", icon: Link2 },
  { href: "/assistant", name: "AI Assistant", icon: Sparkles },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/pay/"))
    return <main className="public">{children}</main>;
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span>
            <Layers3 size={23} />
          </span>
          PayPilot
        </div>
        <nav>
          {pages.map((p) => (
            <Link
              key={p.href}
              className={path === p.href ? "active" : ""}
              href={p.href}
            >
              <p.icon size={17} />
              {p.name}
            </Link>
          ))}
        </nav>
        <div className="identity">
          <b>ส</b>
          <div>
            Studio Bangkok<small>Demo merchant</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="top">
          <span>
            Workspace <i>/</i>{" "}
            <strong>{pages.find((p) => p.href === path)?.name}</strong>
          </span>
          <span className="badge">Sandbox</span>
        </header>
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
