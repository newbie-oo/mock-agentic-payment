import { Badge } from "./ui/badge";
import Link from "next/link";
import { baht, localDate } from "@/lib/display";
import { transactions, size } from "@/lib/service";
export function Status({ value }: { value: string }) {
  return (
    <Badge variant="outline" className={"status s-" + value}>
      {value.toLowerCase()}
    </Badge>
  );
}
export function Pager({ page, more }: { page: number; more: boolean }) {
  return (
    <footer className="pager">
      {page > 1 && <Link href={"?page=" + (page - 1)}>← Previous</Link>} Page{" "}
      {page} {more && <Link href={"?page=" + (page + 1)}>Next →</Link>}
    </footer>
  );
}
export async function History({
  page = 1,
  compact = false,
}: {
  page?: number;
  compact?: boolean;
}) {
  const rows = await transactions(
    page,
    undefined,
    undefined,
    compact ? 5 : size + 1,
  );
  return (
    <>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              {["Customer", "Amount", "Method", "Status", "Bangkok time"].map(
                (x) => (
                  <th key={x}>{x}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, compact ? 5 : size).map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.order.customer}</strong>
                  <small>{r.order.description}</small>
                </td>
                <td>{baht(r.order.amount)}</td>
                <td>{r.method}</td>
                <td>
                  <Status value={r.status} />
                </td>
                <td>{localDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>No transactions on this page.</p>}
      {!compact && <Pager page={page} more={rows.length > size} />}
    </>
  );
}
