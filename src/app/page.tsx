import { redirect } from "next/navigation";

// The proxy already routes "/" by session; this is only a fallback.
export default function Home() {
  redirect("/login");
}
