import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ConsoleView } from "@/components/console/console-view";
import { analysts, employees } from "@/data/seed";
import { getSession } from "@/server/auth/session";
import { buildDetail } from "@/server/console/detail";
import { sortSummaries, toRow } from "@/server/console/views";
import { getConversations } from "@/server/conversations";
import { getPersistentServices } from "@/server/services";

const analystName = (id: number) => analysts.find((a) => a.id === id)?.name ?? "analista";

async function ConsoleScreen({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getSession();
  if (!user || user.role !== "analyst") redirect("/login");
  const analyst = analysts.find((a) => a.id === user.id);
  if (!analyst) redirect("/login");

  const now = new Date();
  const conversations = await getConversations();
  const summaries = sortSummaries(await conversations.listForConsole(), user.id);
  const person = (id: number) => employees.find((e) => e.id === id) ?? { id, name: `Funcionário ${id}`, department: "—" };

  const rows = summaries.map((summary) => toRow(summary, person(summary.employeeId), now, user.id, analystName));

  const requested = Number((await searchParams).c);
  // The selection lives in the URL, so it stays put when the list reorders (e.g. after taking a conversation over).
  if (!(Number.isInteger(requested) && requested > 0) && rows[0]) redirect(`/console?c=${rows[0].id}`);
  const selected = Number.isInteger(requested) && requested > 0 ? await conversations.findById(requested) : null;
  const { tickets } = await getPersistentServices();
  const detail = selected
    ? await buildDetail(selected, person(selected.employeeId), { id: analyst.id, name: analyst.name, level: analyst.level }, analystName, tickets, now)
    : null;

  return <ConsoleView rows={rows} selectedId={selected?.id ?? null} detail={detail} analystName={analyst.name} />;
}

export default function ConsolePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  return (
    <Suspense fallback={null}>
      <ConsoleScreen searchParams={searchParams} />
    </Suspense>
  );
}
