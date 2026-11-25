import "./style.css";
import { Shell } from "@/components/shell";
export const metadata = {
  title: "PayPilot · Merchant Workspace",
  description: "Bangkok studio sandbox collections",
};
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
