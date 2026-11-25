import { History } from "@/components/shared";
import { pageNumber } from "@/lib/display";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <>
      <h1>Transactions</h1>
      <p className="sub">Checkout attempts in Bangkok time, newest first.</p>
      <section className="panel">
        <History page={pageNumber((await searchParams).page)} />
      </section>
    </>
  );
}
