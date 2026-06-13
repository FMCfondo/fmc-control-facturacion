"use client";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

export default function LogoutButton() {
  const router = useRouter();
  async function salir() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button className="logout" onClick={salir}>Salir</button>
  );
}
