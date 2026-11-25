import { orders, size } from "@/lib/service";
import { baht, localDate, pageNumber } from "@/lib/display";
import { Copy, Manual } from "@/components/controls";
import { Pager, Status } from "@/components/shared";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageNumber((await searchParams).page),
    rows = await orders(page);
  return (
    <>
      <h1>Payment links</h1>
      <p className="sub">Create and manage checkouts for your customers.</p>
      <Manual />
      <section className="panel">
        <div className="scroll">
          <table>
            <thead>
              <tr>
                {["Order", "Amount", "Status", "Checkout", "Manage"].map(
                  (x) => (
                    <th key={x}>{x}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const l = o.links[0];
                return (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.customer}</strong>
                      <small>{o.description}</small>
                    </td>
                    <td>{baht(o.amount)}</td>
                    <td>
                      <Status
                        value={
                          o.status === "PAID"
                            ? "PAID"
                            : +l.expires < Date.now()
                              ? "EXPIRED"
                              : "OPEN"
                        }
                      />
                    </td>
                    <td>
                      <a href={"/pay/" + l.id}>Open ↗</a> <Copy id={l.id} />
                      <small>Expires {localDate(l.expires)}</small>
                    </td>
                    <td>{o.status === "OPEN" && <Manual linkId={l.id} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && <p>No payment links on this page.</p>}
        <Pager page={page} more={rows.length === size} />
      </section>
    </>
  );
}
