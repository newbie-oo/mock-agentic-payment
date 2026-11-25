"use client";
import { satang } from "@/lib/money";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ActionDTO as AgentAction, RunDTO as Run } from "@/lib/contract";
import { Button } from "./ui/button";
import { baht, localDate } from "@/lib/display";

async function post<T>(
  route: string,
  data: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch("/api/" + route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
  const result = await r.json().catch(() => {
    throw Error("HTTP " + r.status + " · เซิร์ฟเวอร์ตอบกลับในรูปแบบที่อ่านไม่ได้");
  });
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
function VerifiedCheckout({ href, id }: { href: string; id: string }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <div className="verified-link">
      <a href={href}>Open verified checkout ↗</a> <Copy id={id} />
      <small>{origin + href}</small>
    </div>
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
      {p.evidence && (
        <div>
          <small>
            Order {p.orderId} · {p.evidence.reason}
          </small>
          <small>
            Last activity {localDate(p.evidence.activityAt)} ·{" "}
            {p.evidence.outcome ?? "Order created"} {p.evidence.method} ·
            checkout expiry {localDate(p.evidence.expires)}
          </small>
          {p.evidence.attemptId && (
            <small>Attempt {p.evidence.attemptId}</small>
          )}
        </div>
      )}
      {p.body && <blockquote>{p.body}</blockquote>}
      {r?.summary && <p>{r.summary}</p>}
      {href && <VerifiedCheckout href={href} id={r!.id!} />}
      {r?.body && <p>Verified saved reminder · {r.id}</p>}
      {a.status === "PROPOSED" && (
        <div className="actions">
          <Button disabled={busy} onClick={() => handle(a.id, true)}>
            {a.kind === "create_payment_link" ? "อนุมัติและสร้างลิงก์" : "Approve"}
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
    [progress, show] = useState(""),
    [sending, setSending] = useState("");
  const task = useTask(),
    router = useRouter();
  const canReply =
    run?.status === "NEEDS_INPUT" || run?.status === "AWAITING_APPROVAL";
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const request = useRef<{ signature: string; requestId: string } | null>(null);
  const inFlight = useRef(false);
  const [submission, setSubmission] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!submission) return;
    if (run?.status === "NEEDS_INPUT") inputRef.current?.focus();
    else if (run?.actions.some((a) => a.checkoutUrl))
      reviewRef.current
        ?.querySelector<HTMLAnchorElement>(".verified-link a")
        ?.focus();
    else if (run?.status === "AWAITING_APPROVAL") reviewRef.current?.focus();
    else resultHeading.current?.focus();
  }, [submission, run?.status]);
  async function send(value: string, continueRunId?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    await task.work(async () => {
      if (!value.trim()) throw Error("กรุณาพิมพ์คำขอก่อนส่ง");
      setSending(value);
      setPrompt(value);
      show("กำลังส่งคำขอและตรวจสอบข้อมูล…");
      const data = {
        prompt: value,
        continueRunId,
        ...(canReply && run && value !== hero ? { runId: run.id } : {}),
      };
      const signature = JSON.stringify(data);
      if (request.current?.signature !== signature)
        request.current = { signature, requestId: crypto.randomUUID() };
      const next = await post<Run>(
        "agent",
        { ...data, requestId: request.current.requestId },
        AbortSignal.timeout(65000),
      ).catch((e: Error) => {
        if (e.name === "TimeoutError")
          throw Error("หมดเวลารอเซิร์ฟเวอร์ กรุณาตรวจสถานะรายการแล้วลองอีกครั้ง");
        if (e instanceof TypeError)
          throw Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจเครือข่ายแล้วส่งข้อความเดิมอีกครั้ง");
        throw e;
      });
      set(next);
      request.current = null;
      window.history.replaceState(
        null,
        "",
        "/assistant?run=" + encodeURIComponent(next.id),
      );
      if (next.error) throw Error(next.error);
      setPrompt("");
      setSubmission((n) => n + 1);
      router.refresh();
    });
    setSending("");
    inFlight.current = false;
  }
  const proposed = run?.actions.filter((a) => a.status === "PROPOSED") ?? [];
  const created = run?.actions.some((a) => a.checkoutUrl);
  const rejected = run?.actions.some((a) => a.status === "REJECTED");
  const nextStep = !run
    ? ""
    : run.status === "FAILED"
      ? "เกิดข้อผิดพลาด · ตรวจข้อความแล้วลองอีกครั้ง"
      : run.status === "NEEDS_INPUT"
        ? "รอคำตอบจากคุณ"
        : proposed.length
          ? "รอตรวจและอนุมัติข้อเสนอ"
          : created
            ? "สร้างลิงก์แล้ว · เปิดหรือคัดลอกลิงก์ด้านล่าง"
            : rejected
              ? "จบคำขอ · ไม่มีข้อเสนอรออนุมัติ"
              : "จบคำขอแล้ว";
  async function decisions(ids: string[], approve: boolean) {
    await task.work(async () => {
      if (!run) return;
      show("กำลังตรวจสอบผลการตัดสินใจ…");
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
      setSubmission((n) => n + 1);
    });
  }
  return (
    <>
      <section className="hero">
        <span className="pill">{run?.mode ?? mode}</span>
        <h2>Collection workspace</h2>
        <p>Review open orders and choose which follow-ups to approve.</p>
        <Button
          className="light"
          disabled={!ready || task.busy}
          onClick={() => send(hero)}
        >
          Review outstanding payments →
        </Button>
      </section>
      {run && (
        <section className="panel conversation" aria-label="บทสนทนากับ PayPilot">
          {run.actions
            .filter((a) => a.payload.priorMessage)
            .map((a) => (
              <div key={a.id}>
                <strong>คุณ</strong>
                <p>{a.payload.priorMessage}</p>
                <strong>PayPilot</strong>
                <p>{a.payload.priorReply}</p>
              </div>
            ))}
          <strong>คุณ</strong>
          <p>{run.prompt.split("\n").at(-1)}</p>
          <h2 ref={resultHeading} tabIndex={-1}>
            {run.status === "NEEDS_INPUT"
              ? /[ก-๙]/.test(run.prompt)
                ? "ขอข้อมูลเพิ่มเติม"
                : "Clarification needed"
              : "คำตอบจาก PayPilot"}
          </h2>
          <p className="summary">{run.summary}</p>
          <strong>{nextStep}</strong>
          {run.status === "NEEDS_INPUT" &&
            run.summary.includes("ตอบยืนยันได้เลย") && (
              <div className="actions">
                <Button disabled={task.busy} onClick={() => send("ใช่ ตามนี้")}>
                  ใช่ ตามนี้
                </Button>
                <Button
                  variant="outline"
                  disabled={task.busy}
                  onClick={() => inputRef.current?.focus()}
                >
                  แก้ไขรายละเอียด
                </Button>
              </div>
            )}
        </section>
      )}
      {run &&
        run.actions.some(
          (a) => a.status !== "EVENT" || a.kind === "Continue collection",
        ) && (
          <section className="panel" ref={reviewRef} tabIndex={-1}>
            <small>
              {run.mode} · {localDate(run.createdAt)}
            </small>
            {run.actions.some((a) => a.kind === "Continue collection") && (
              <Button disabled={task.busy} onClick={() => send(hero, run.id)}>
                Review next orders
              </Button>
            )}
            <div className="row">
              <strong>
                {proposed.length} awaiting approval ·{" "}
                {run.actions.filter((a) => a.status === "EXECUTED").length}{" "}
                executed
              </strong>
              {proposed.length > 1 && (
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
            {proposed.length > 1 && (
              <Button
                variant="outline"
                disabled={task.busy}
                onClick={() =>
                  decisions(
                    proposed.map((a) => a.id),
                    false,
                  )
                }
              >
                Reject all eligible
              </Button>
            )}
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
          </section>
        )}
      <form
        className="panel composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(prompt);
        }}
      >
        <label htmlFor="prompt">
          {run?.status === "NEEDS_INPUT" ? "ตอบกลับ" : "Ask PayPilot"}
        </label>
        {canReply && (
          <Button
            type="button"
            variant="ghost"
            disabled={task.busy}
            onClick={() => {
              set(null);
              setPrompt("");
              request.current = null;
              window.history.replaceState(null, "", "/assistant");
            }}
          >
            Start a new request
          </Button>
        )}
        <textarea
          id="prompt"
          ref={inputRef}
          required
          readOnly={!ready || task.busy}
          maxLength={2000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          aria-describedby="composer-help composer-status"
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              e.nativeEvent.keyCode !== 229
            ) {
              e.preventDefault();
              if (!task.busy) e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าสมชาย หมดอายุพรุ่งนี้"
        />
        <small id="composer-help">
          Enter to send · Shift+Enter for a new line
        </small>
        <Button type="submit" disabled={!ready || task.busy || !prompt.trim()}>
          {run?.status === "NEEDS_INPUT" ? "ส่งคำตอบ" : "ส่งคำขอ · Run assistant"}
        </Button>
        <div id="composer-status" role="status" aria-live="polite">
          {!ready && (
            <p>
              กำลังเชื่อมต่อผู้ช่วย หากหน้านี้ค้าง{" "}
              <a
                href={
                  run
                    ? "/assistant?run=" + encodeURIComponent(run.id)
                    : "/assistant"
                }
              >
                โหลดหน้าใหม่
              </a>
            </p>
          )}
          {task.busy && (
            <>
              {sending && <p>คุณ · {sending}</p>}
              {progress}
            </>
          )}
        </div>
        {task.error && <p role="alert">ส่งคำขอไม่สำเร็จ · {task.error}</p>}
      </form>
      {run && (
        <section className="panel">
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
  const stage = (args: () => unknown) =>
    task.work(async () => {
      set(
        await post("proposal", {
          kind: linkId ? "regenerate_payment_link" : "create_payment_link",
          args: args(),
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
        onClick={() => (linkId ? stage(() => ({ linkId })) : setOpen(!open))}
      >
        {linkId ? "Replace" : open ? "Close" : "Create payment link"}
      </Button>
      {open && (
        <form
          className="panel fields"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void stage(() => ({
              amount: satang(String(f.get("amount"))),
              currency: f.get("currency"),
              description: f.get("description"),
              customer: f.get("customer"),
              methods: f.getAll("method"),
              expires: new Date(
                String(f.get("expiry")) + "+07:00",
              ).toISOString(),
            }));
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
            <input
              name="amount"
              type="number"
              min=".01"
              max="21474836.47"
              step=".01"
              required
            />
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
  const [uncertain, setUncertain] = useState<{
    linkId: string;
    method: string;
    status: string;
    requestId: string;
  } | null>(null);
  const storageKey = "paypilot-checkout:" + linkId;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (saved?.linkId === linkId && typeof saved.requestId === "string")
        setUncertain(saved);
    } catch {
      /* In-memory retry remains available when browser storage is unavailable. */
    }
  }, [storageKey, linkId]);
  function remember(attempt: typeof uncertain) {
    setUncertain(attempt);
    try {
      if (attempt) sessionStorage.setItem(storageKey, JSON.stringify(attempt));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* Memory retains the pending request in this tab. */
    }
  }
  return (
    <form
      className="fields"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void task.work(async () => {
          const attempt = uncertain ?? {
            linkId,
            method: String(f.get("method")),
            status: String(f.get("status")),
            requestId: crypto.randomUUID(),
          };
          remember(attempt);
          const a = await post<{ id: string; status: string }>(
            "checkout",
            attempt,
          );
          remember(null);
          set("Recorded " + a.status.toLowerCase() + " · " + a.id);
          router.refresh();
        });
      }}
    >
      <label>
        Payment method
        <select name="method" disabled={!!uncertain}>
          {methods.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label>
        Sandbox outcome
        <select name="status" disabled={!!uncertain}>
          <option>SUCCESS</option>
          <option>PENDING</option>
          <option>FAILED</option>
        </select>
      </label>
      <Button disabled={task.busy}>
        {uncertain ? "Retry same attempt" : "Simulate checkout"}
      </Button>
      <p role="status">{task.error || message}</p>
      {uncertain && (
        <small>
          Awaiting receipt for {uncertain.method} · {uncertain.status}
        </small>
      )}
      {uncertain && !task.busy && (
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            remember(null);
            set("");
          }}
        >
          Start a new attempt
        </Button>
      )}
    </form>
  );
}
