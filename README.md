# FMC — Control de Facturación

App interna (**Next.js 14 App Router + Supabase + Vercel**) que reemplaza el Excel
`Control de facturas.xlsx`. **En producción** en `facturacion.fondomutuodecobertura.com`.
Uso de un solo operador.

Genera los 3 archivos SIIGO desde las plantillas de las mutuales, controla cuentas de cobro
y pagos, calcula IVA/reserva por cuatrimestre, emite la cuenta de cobro en PDF y la envía por
correo, y guarda respaldos.

> **Documentación completa (fuera del repo):** `../GUIA_DEL_SISTEMA.md` (cómo funciona,
> reglas de negocio, troubleshooting) y `../Review.md` (estado, seguridad, auditoría,
> pendientes). Léelos para el contexto completo.

## Stack

- Next.js 14 (App Router), React
- Supabase: Postgres + Auth (2FA TOTP) + Storage
- Vercel (hosting; despliega desde `main`)
- Gmail SMTP (nodemailer) · jsPDF (PDF en el servidor)

## Estructura (dentro de `app/`, que es la raíz del repo)

```
middleware.js         auth: login + 2FA (aal2) + allowlist de correo
next.config.mjs       cabeceras de seguridad + CSP
lib/                  supabase (service role), requireUser, actividad, pdf, format, siigo/*
app/                  Shell + Sidebar (navegación lateral) + páginas + api/*
```

Páginas: tablero, generar, facturas-venta, reportes, actividad, clientes, cuenta/[id],
login, seguridad. Cada ruta `/api` valida la sesión con `requireUser()`.

## Correr en local

```bash
npm install
cp .env.example .env.local   # completar claves (Supabase → Settings → API, y Gmail)
npm run dev
```

## Variables de entorno (en Vercel)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ALLOWED_EMAILS`. Las `NEXT_PUBLIC_*` se incrustan en el
build → al cambiarlas, **Redeploy sin caché**.

## Desplegar

Trabajar en una **rama** → mergear a **`main`** → Vercel redespliega producción solo. Cada
rama genera un **deploy de preview** para probar sin afectar producción.

## Base de datos

Esquema/seed/migración en `../db/` (generados por `../scripts/migrar_historico.py`). Parches
aplicados: `parche_fechas_historico.sql`, `parche_actividad_usuario.sql`,
`parche_seguridad_supabase.sql`. Cambios → Supabase → SQL Editor.
