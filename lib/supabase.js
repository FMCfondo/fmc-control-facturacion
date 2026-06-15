// Cliente de Supabase para el servidor (service role). Nunca importar en el navegador.
// El cliente del navegador (login/logout) está en lib/supabaseClient.js.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

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
