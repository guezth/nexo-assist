import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ConsoleView } from "@/components/console/console-view";
import { can, supportTierOf } from "@/domain/access";
import { getSession } from "@/server/auth/session";
import { buildDetail } from "@/server/console/detail";
import { loadDirectory } from "@/server/console/directory";
import { sortSummaries, toRow } from "@/server/console/views";
import { getConversations } from "@/server/conversations";
import { getPersistentServices } from "@/server/services";

async function ConsoleScreen({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getSession();
  if (!user || !can(user.accessLevel, "console")) redirect("/login");
  const { person, analystName } = await loadDirectory();

  const now = new Date();
  const conversations = await getConversations();
  const summaries = sortSummaries(await conversations.listForConsole(), user.id);
  const rows = summaries.map((summary) => toRow(summary, person(summary.employeeId), now, user.id, analystName));

  const requested = Number((await searchParams).c);
  // The selection lives in the URL, so it stays put when the list reorders (e.g. after taking a conversation over).
  if (!(Number.isInteger(requested) && requested > 0) && rows[0]) redirect(`/console?c=${rows[0].id}`);
  const selected = Number.isInteger(requested) && requested > 0 ? await conversations.findById(requested) : null;
  const { tickets } = await getPersistentServices();
  const detail = selected
    ? await buildDetail(selected, person(selected.employeeId), { id: user.id, name: user.name, level: supportTierOf(user.accessLevel) ?? "N1" }, analystName, tickets, now)
    : null;

  return <ConsoleView rows={rows} selectedId={selected?.id ?? null} detail={detail} analystName={user.name} />;
}

export default function ConsolePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  return (
    <Suspense fallback={null}>
      <ConsoleScreen searchParams={searchParams} />
    </Suspense>
  );
}
