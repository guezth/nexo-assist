import { getPresence } from "@/server/presence";

/** How many analysts are online now. Only a number: the login screen shows it before anyone signs in. */
export async function GET() {
  const online = await (await getPresence()).countOnline();
  return Response.json({ online }, { headers: { "cache-control": "no-store" } });
}
