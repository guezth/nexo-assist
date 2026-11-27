import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EmployeeShell } from "@/components/employee-shell";
import { NovoChamadoClient } from "./novo-chamado-client";
import { can } from "@/domain/access";
import { getSession } from "@/server/auth/session";

async function NovoChamadoScreen() {
  const user = await getSession();
  if (!user || !can(user.accessLevel, "chat")) redirect("/login");

  return (
    <EmployeeShell user={user} active="ticket" title="Novo chamado">
      <NovoChamadoClient />
    </EmployeeShell>
  );
}

export default function NovoChamadoPage() {
  return (
    <Suspense fallback={null}>
      <NovoChamadoScreen />
    </Suspense>
  );
}
