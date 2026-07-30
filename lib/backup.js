// Genera un respaldo COMPLETO y AUTOCONTENIDO de la base de datos en SQL:
// estructura + datos, listo para restaurar en cualquier proyecto Postgres/Supabase.
//
// Se ejecuta en el navegador a partir de /api/export (así no topa con los límites
// de tamaño de las funciones serverless: el archivo puede pesar varios MB).
//
// ⚠️ MANTENER SINCRONIZADO con db/schema_completo.sql (fuente de la estructura).
//    El esquema va embebido a propósito: un respaldo que depende de otro archivo
//    es un respaldo frágil.

const SCHEMA_SQL = `-- ── ESTRUCTURA ──
create table if not exists mutuales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, nombre_corto text not null, nit text not null, dv text not null,
  representante text, direccion text, ciudad text, telefono text, correo text,
  correos_envio text, correos_cc text,
  es_socia boolean not null default false, activa boolean not null default true,
  creado_en timestamptz default now()
);
create table if not exists parametros (clave text primary key, valor numeric not null, nota text);
create table if not exists config (clave text primary key, valor text);
create table if not exists cuentas_cobro (
  id uuid primary key default gen_random_uuid(),
  consecutivo integer not null unique,
  tipo text not null default 'regular' check (tipo in ('regular','irregular')),
  mutual_id uuid references mutuales(id),
  cliente_nombre text, cliente_nit text, cliente_direccion text, cliente_correo text,
  mes integer check (mes between 1 and 12), anio integer not null,
  fecha_elaboracion date, fecha_vencimiento date,
  factura_inicial integer, factura_final integer, num_facturas integer,
  valor_facturado numeric not null default 0, valor_recibido numeric not null default 0,
  saldo numeric generated always as (valor_facturado - valor_recibido - coalesce(anticipos,0)) stored,
  reserva_individual numeric default 0, administracion numeric default 0,
  iva numeric default 0, anticipos numeric default 0,
  cuatrimestre integer check (cuatrimestre between 1 and 3),
  estado text not null default 'pendiente' check (estado in ('pendiente','parcial','pago')),
  documento_nombre text, pdf_path text,
  origen text default 'app' check (origen in ('app','importado')),
  notas text, creado_en timestamptz default now()
);
create index if not exists idx_cc_mutual on cuentas_cobro(mutual_id);
create index if not exists idx_cc_anio_mes on cuentas_cobro(anio, mes);
create table if not exists facturas_siigo (
  id uuid primary key default gen_random_uuid(),
  cuenta_cobro_id uuid references cuentas_cobro(id) on delete cascade,
  consecutivo integer not null unique, cedula text not null,
  nombre text, email text, telefono text, ciudad_depto text, cod_ciudad text,
  valor_comision numeric not null, valor_base numeric, creado_en timestamptz default now()
);
create index if not exists idx_fs_cc on facturas_siigo(cuenta_cobro_id);
create table if not exists items_cuenta_cobro (
  id uuid primary key default gen_random_uuid(),
  cuenta_cobro_id uuid not null references cuentas_cobro(id) on delete cascade,
  cantidad numeric not null default 1, codigo text, descripcion text not null,
  valor_unitario numeric not null,
  subtotal numeric generated always as (cantidad * valor_unitario) stored
);
create index if not exists idx_items_cc on items_cuenta_cobro(cuenta_cobro_id);
create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  cuenta_cobro_id uuid not null references cuentas_cobro(id) on delete cascade,
  fecha date not null, valor numeric not null, metodo text, notas text,
  creado_en timestamptz default now()
);
create index if not exists idx_pagos_cc on pagos(cuenta_cobro_id);
create table if not exists actividad (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'evento', descripcion text, entidad text, entidad_id text,
  detalle jsonb, usuario text, creado_en timestamptz not null default now()
);
create index if not exists idx_actividad_creado on actividad(creado_en desc);

-- ── TRIGGER: recalcula valor_recibido y estado desde los pagos ──
create or replace function recalcular_cuenta_cobro() returns trigger as $fn$
declare
  v_cc uuid := coalesce(new.cuenta_cobro_id, old.cuenta_cobro_id);
  v_recibido numeric;
begin
  select coalesce(sum(valor),0) into v_recibido from pagos where cuenta_cobro_id = v_cc;
  update cuentas_cobro
     set valor_recibido = v_recibido,
         estado = case when v_recibido <= 0 then 'pendiente'
                       when v_recibido >= valor_facturado then 'pago'
                       else 'parcial' end
   where id = v_cc;
  return null;
end;
$fn$ language plpgsql set search_path = public;
drop trigger if exists trg_pagos_recalc on pagos;
create trigger trg_pagos_recalc after insert or update or delete on pagos
  for each row execute function recalcular_cuenta_cobro();

-- ── FUNCIONES de consecutivos ──
create or replace function proximo_consecutivo_cc() returns integer as $fn$
  select greatest(
    coalesce((select max(consecutivo) from cuentas_cobro), 0),
    coalesce((select valor::int from parametros where clave = 'ultimo_consecutivo_cc'), 0)
  ) + 1;
$fn$ language sql stable set search_path = public;
create or replace function proxima_factura_siigo() returns integer as $fn$
  select greatest(
    coalesce((select max(factura_final) from cuentas_cobro),0),
    coalesce((select max(consecutivo) from facturas_siigo),0)
  ) + 1;
$fn$ language sql stable set search_path = public;

-- ── SEGURIDAD: RLS activo y SIN políticas (solo el servidor accede) ──
alter table mutuales enable row level security;
alter table parametros enable row level security;
alter table config enable row level security;
alter table cuentas_cobro enable row level security;
alter table facturas_siigo enable row level security;
alter table items_cuenta_cobro enable row level security;
alter table pagos enable row level security;
alter table actividad enable row level security;
do $do$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I;', r.policyname, r.tablename);
  end loop;
end $do$;
revoke execute on function public.proximo_consecutivo_cc() from public, anon, authenticated;
revoke execute on function public.proxima_factura_siigo() from public, anon, authenticated;
grant execute on function public.proximo_consecutivo_cc() to service_role;
grant execute on function public.proxima_factura_siigo() to service_role;
`;

// Orden de inserción: respeta las llaves foráneas.
// `omitir` = columnas generadas por Postgres (no se insertan).
const TABLAS = [
  { nombre: "mutuales", omitir: [] },
  { nombre: "parametros", omitir: [] },
  { nombre: "config", omitir: [] },
  { nombre: "cuentas_cobro", omitir: ["saldo"] },
  { nombre: "facturas_siigo", omitir: [] },
  { nombre: "items_cuenta_cobro", omitir: ["subtotal"] },
  { nombre: "pagos", omitir: [] },
  { nombre: "actividad", omitir: [] },
];

// Convierte un valor de JS al literal SQL correspondiente.
export function sqlVal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/**
 * Arma el respaldo completo.
 * @param {Object} datos  { cuentas_cobro: [...], facturas_siigo: [...], ... }
 * @returns {{ sql: string, resumen: Array<[string, number]> }}
 */
export function generarBackupSQL(datos) {
  const hoy = new Date();
  const resumen = [];
  const p = [
    "-- ============================================================================",
    "-- RESPALDO COMPLETO — Control de Facturación FMC",
    `-- Generado: ${hoy.toISOString()}`,
    "-- ============================================================================",
    "-- CÓMO RESTAURAR:",
    "--   1. Crea un proyecto nuevo en Supabase (o cualquier Postgres).",
    "--   2. Abre el SQL Editor, pega este archivo COMPLETO y ejecútalo.",
    "--   3. Crea tu usuario en Authentication y vuelve a activar el 2FA.",
    "--   4. Actualiza las variables NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "--      y SUPABASE_SERVICE_ROLE_KEY en Vercel, y haz Redeploy sin caché.",
    "--",
    "-- Contiene la estructura y todos los datos. Los archivos SIIGO del Storage NO",
    "-- se incluyen: se pueden regenerar desde la app.",
    "-- ⚠️ Este archivo tiene datos personales (cédulas, nombres, correos). Guárdalo",
    "--    en un lugar privado; NO lo subas a repositorios públicos.",
    "-- ============================================================================",
    "",
    SCHEMA_SQL,
    "",
    "-- ── DATOS ──",
    "begin;",
    "-- El trigger recalcularía valor_recibido durante la carga: se desactiva para",
    "-- conservar exactamente los valores respaldados y se reactiva al final.",
    "alter table pagos disable trigger trg_pagos_recalc;",
    "",
  ];

  for (const { nombre, omitir } of TABLAS) {
    const filas = datos[nombre] || [];
    resumen.push([nombre, filas.length]);
    p.push(`-- ${nombre}: ${filas.length} fila(s)`);
    if (!filas.length) { p.push(""); continue; }
    const cols = Object.keys(filas[0]).filter((c) => !omitir.includes(c));
    for (let i = 0; i < filas.length; i += 100) {
      const lote = filas.slice(i, i + 100);
      p.push(`insert into ${nombre} (${cols.join(", ")}) values`);
      p.push(lote.map((f) => "  (" + cols.map((c) => sqlVal(f[c])).join(", ") + ")").join(",\n") + "\non conflict do nothing;");
    }
    p.push("");
  }

  p.push("alter table pagos enable trigger trg_pagos_recalc;", "commit;", "");
  return { sql: p.join("\n"), resumen };
}
