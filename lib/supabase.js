// Clientes de Supabase para la app FMC.
// - supabaseBrowser: para componentes de cliente (usa la anon key, sujeta a RLS).
// - supabaseAdmin: SOLO en el servidor (service role). Nunca importar en el navegador.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseBrowser = () => createClient(url, anon);

// Usar únicamente en rutas /api o server actions.
export const supabaseAdmin = () =>
  createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

// Helpers de consecutivos (llaman a las funciones SQL del esquema).
export async function proximoConsecutivoCC(client) {
  const { data, error } = await client.rpc("proximo_consecutivo_cc");
  if (error) throw error;
  return data;
}
export async function proximaFacturaSiigo(client) {
  const { data, error } = await client.rpc("proxima_factura_siigo");
  if (error) throw error;
  return data;
}
