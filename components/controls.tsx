"use client";
import { satang } from "@/lib/money";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionDTO as AgentAction, RunDTO as Run } from "@/lib/contract";
import { Button } from "./ui/button";
import { baht, localDate } from "@/lib/display";

async function post<T>(route: string, data: unknown): Promise<T> {
  const r = await fetch("/api/" + route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await r.json();
  if (!r.ok && !result.status) throw Error(result.error || "Request failed");
  return result;
}
function useTask() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function work(f: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, work };
}
export function Copy({ id }: { id: string }) {
  const [label, set] = useState("Copy link");
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(location.origin + "/pay/" + id);
          set("Copied ✓");
        } catch {
          set("Copy from checkout address bar");
        }
      }}
    >
      {label}
    </Button>
  );
}
function Proposal({
  a,
  handle,
  busy,
}: {
  a: AgentAction;
  handle: (id: string, v: boolean) => void;
  busy: boolean;
}) {
  const p = a.payload,
    r = a.result;
  const href = a.checkoutUrl;
  return (
    <article className="proposal">
      <div className="row">
        <strong>
          {{
            create_payment_link: "Create payment link",
            regenerate_payment_link: "Replace checkout link",
            save_notification: "Save reminder",
          }[a.kind] ?? a.kind}
        </strong>
        <span className="status">{a.status.toLowerCase()}</span>
      </div>
      <small>Action {a.id}</small>
      <p>
        {p.customer} · {baht(p.amount ?? 0)}{" "}
        {p.description && "· " + p.description}
      </p>
      {p.methods && (
        <small>
          {p.currency} · {p.methods.join(", ")} · expires{" "}
          {localDate(p.expires!)}
        </small>
      )}
      {p.linkId && <small>Checkout {p.linkId}</small>}
      {p.body && <blockquote>{p.body}</blockquote>}
      {r?.summary && <p>{r.summary}</p>}
      {href && (
        <div>
          <a href={href}>Open verified checkout ↗</a> <Copy id={r!.id!} />
        </div>
      )}
      {r?.body && <p>Verified saved reminder · {r.id}</p>}
      {a.status === "PROPOSED" && (
        <div className="actions">
          <Button disabled={busy} onClick={() => handle(a.id, true)}>
            Approve
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => handle(a.id, false)}
          >
            Reject
          </Button>
        </div>
      )}
    </article>
  );
}

export function Assistant({
  initial,
  hero,
  mode,
}: {
  initial: Run | null;
  hero: string;
  mode: string;
}) {
  const [run, set] = useState(initial),
    [prompt, setPrompt] = useState(""),
    [progress, show] = useState("");
  const task = useTask(),
    router = useRouter();
  async function send(value: string) {
    await task.work(async () => {
      show("Reading merchant records…");
      set(
        await post<Run>("agent", {
          prompt: value,
          ...(run?.status === "NEEDS_INPUT" && value !== hero
            ? { runId: run.id }
            : {}),
        }),
      );
      setPrompt("");
      router.refresh();
    });
  }
  const proposed = run?.actions.filter((a) => a.status === "PROPOSED") ?? [];
  async function decisions(ids: string[], approve: boolean) {
    await task.work(async () => {
      if (!run) return;
      show("Checking current order status…");
      if (ids.length > 1) {
        const result = await post<{ run: Run }>("decisions", {
          runId: run.id,
          approve,
        });
        set(result.run);
      } else {
        await post<AgentAction>("decision", { actionId: ids[0], approve });
        const result = await fetch(
          "/api/run?id=" + encodeURIComponent(run.id),
          { cache: "no-store" },
        );
        if (!result.ok) throw Error("Run unavailable");
        set(await result.json());
      }
      router.refresh();
    });
  }
  return (
    <>
      <section className="hero">
        <span className="pill">{mode}</span>
        <h2>Collection workspace</h2>
        <p>Review open orders and choose which follow-ups to approve.</p>
        <Button
          className="light"
          disabled={task.busy}
          onClick={() => send(hero)}
        >
          Review outstanding payments →
        </Button>
      </section>
      <form
        className="panel composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(prompt);
        }}
      >
        <label htmlFor="prompt">Ask PayPilot</label>
        <textarea
          id="prompt"
          required
          maxLength={2000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าสมชาย หมดอายุพรุ่งนี้"
        />
        <Button disabled={task.busy}>Run assistant</Button>
      </form>
      {task.busy && <p role="status">{progress}</p>}
      <p role="alert">{task.error}</p>
      {run && (
        <section className="panel">
          <small>
            {run.mode} · {run.status} · {localDate(run.createdAt)}
          </small>
          <h2>{run.prompt}</h2>
          <p className="summary">{run.summary}</p>
          <div className="row">
            <strong>
              {proposed.length} awaiting approval ·{" "}
              {run.actions.filter((a) => a.status === "EXECUTED").length}{" "}
              executed
            </strong>
            {proposed.length > 0 && (
              <Button
                disabled={task.busy}
                onClick={() =>
                  decisions(
                    proposed.map((a) => a.id),
                    true,
                  )
                }
              >
                Approve all eligible
              </Button>
            )}
          </div>
          {run.actions
            .filter((a) => a.status !== "EVENT")
            .map((a) => (
              <Proposal
                key={a.id}
                a={a}
                busy={task.busy}
                handle={(id, v) => decisions([id], v)}
              />
            ))}
          <details>
            <summary>Activity timeline</summary>
            <ol>
              {run.actions.map((a) => (
                <li key={a.id}>
                  {localDate(a.createdAt)} · {a.kind} ·{" "}
                  {a.status === "EVENT" ? a.payload.summary : a.status}
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}
    </>
  );
}
export function Manual({ linkId }: { linkId?: string }) {
  const [open, setOpen] = useState(false),
    [action, set] = useState<AgentAction | null>(null);
  const task = useTask(),
    router = useRouter();
  const stage = (args: unknown) =>
    task.work(async () => {
      set(
        await post("proposal", {
          kind: linkId ? "regenerate_payment_link" : "create_payment_link",
          args,
        }),
      );
      setOpen(false);
    });
  function review(id: string, approve: boolean) {
    void task.work(async () => {
      set(await post("decision", { actionId: id, approve }));
      router.refresh();
    });
  }
  return (
    <>
      <Button
        variant={linkId ? "ghost" : "default"}
        disabled={task.busy}
        onClick={() => (linkId ? stage({ linkId }) : setOpen(!open))}
      >
        {linkId ? "Replace" : open ? "Close" : "Create payment link"}
      </Button>
      {open && (
        <form
          className="panel fields"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void stage({
              amount: satang(String(f.get("amount"))),
              currency: f.get("currency"),
              description: f.get("description"),
              customer: f.get("customer"),
              methods: f.getAll("method"),
              expires: new Date(
                String(f.get("expiry")) + "+07:00",
              ).toISOString(),
            });
          }}
        >
          <label>
            Customer
            <input name="customer" required maxLength={100} />
          </label>
          <label>
            Description
            <input name="description" required maxLength={250} />
          </label>
          <label>
            Amount
            <input name="amount" type="number" min=".01" step=".01" required />
          </label>
          <label>
            Currency
            <select name="currency">
              <option>THB</option>
            </select>
          </label>
          <label>
            Expires (Bangkok)
            <input
              name="expiry"
              type="datetime-local"
              required
              defaultValue={new Date(Date.now() + 31 * 3600000)
                .toISOString()
                .slice(0, 16)}
            />
          </label>
          <fieldset>
            <legend>Methods</legend>
            {["QR", "CARD"].map((m) => (
              <label key={m}>
                <input
                  type="checkbox"
                  name="method"
                  value={m}
                  defaultChecked={m === "QR"}
                />{" "}
                {m}
              </label>
            ))}
          </fieldset>
          <Button disabled={task.busy}>Preview</Button>
        </form>
      )}
      {action && <Proposal a={action} handle={review} busy={task.busy} />}
      <span role="alert">{task.error}</span>
    </>
  );
}
export function Simulator({
  linkId,
  methods,
}: {
  linkId: string;
  methods: string[];
}) {
  const task = useTask(),
    router = useRouter(),
    [message, set] = useState("");
  return (
    <form
      className="fields"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void task.work(async () => {
          const a = await post<{ status: string }>("checkout", {
            linkId,
            method: f.get("method"),
            status: f.get("status"),
            requestId: crypto.randomUUID(),
          });
          set("Recorded " + a.status.toLowerCase());
          router.refresh();
        });
      }}
    >
      <label>
        Payment method
        <select name="method">
          {methods.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label>
        Sandbox outcome
        <select name="status">
          <option>SUCCESS</option>
          <option>PENDING</option>
          <option>FAILED</option>
        </select>
      </label>
      <Button disabled={task.busy}>Simulate checkout</Button>
      <p role="status">{task.error || message}</p>
    </form>
  );
}
