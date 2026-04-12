import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { getSessionUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <Dashboard email={user.email} />;
}
