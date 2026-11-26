import "server-only";
import { getUsers } from "@/server/users";

export interface Person {
  id: number;
  name: string;
  department: string;
}

/** Names and departments the console shows, read from the user table once per request. */
export async function loadDirectory() {
  const all = await (await getUsers()).listAll();
  const byId = new Map(all.map((u) => [u.id, u]));
  return {
    /** An employee, or a placeholder if the record is gone. */
    person: (id: number): Person => {
      const u = byId.get(id);
      return { id, name: u?.name ?? `Funcionário ${id}`, department: u?.department ?? "—" };
    },
    analystName: (id: number): string => byId.get(id)?.name ?? "analista",
  };
}
