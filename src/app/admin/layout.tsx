import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/firebase/auth-helpers";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/?next=/admin");
  }
  if (!isAdminEmail(user.email)) {
    return (
      <main className="page">
        <h1>Admin</h1>
        <p className="status error">
          Your account ({user.email}) is not authorised to view this page.
        </p>
      </main>
    );
  }
  return <>{children}</>;
}
