# FMC — Sistema de Control de Facturación

App interna (Next.js + Supabase) que reemplaza el libro `Control de facturas.xlsx`.
Ver el diseño completo en `../DISEÑO_SISTEMA_CONTROL_FACTURAS.md`.

## Estado: Fase 1 (base de datos + migración) — artefactos listos

```
db/
  schema.sql                  Esquema completo (tablas, RLS, triggers, funciones)
  seed_mutuales.sql           Datos de las mutuales (generado del Excel)
  migracion_historico.sql     233 cuentas de cobro históricas (generado del Excel)
scripts/
  migrar_historico.py         Regenera los dos .sql desde el Excel
app/
  lib/siigo/utils.js          Lógica portada del HTML (validada con tests)
  lib/supabase.js             Clientes Supabase + helpers de consecutivos
  package.json, .env.example, .gitignore
```

## Pasos para montar la Fase 1

### 1. Crear el proyecto en Supabase
- Crea un proyecto nuevo en supabase.com.
- En **SQL Editor**, pega y ejecuta en orden:
  1. `db/schema.sql`
  2. `db/seed_mutuales.sql`
  3. `db/migracion_historico.sql`
- Verifica: `select count(*) from cuentas_cobro;` debe dar ~233.
- Prueba los consecutivos: `select proximo_consecutivo_cc();` y `select proxima_factura_siigo();`.

### 2. Configurar la app
```bash
cd app
npm install
cp .env.example .env.local   # y completa las claves de Supabase (Settings → API)
npm run dev
```

### 3. Desplegar a GitHub + Vercel (el tablero ya está listo)
**a) Subir a GitHub** (desde la carpeta `app/`):
```bash
cd app
git init
git add .
git commit -m "Tablero de control de facturación FMC"
# crea un repo vacío en github.com (ej. fmc-control-facturacion) y luego:
git remote add origin https://github.com/TU-USUARIO/fmc-control-facturacion.git
git branch -M main
git push -u origin main
```
**b) Conectar Vercel:**
- En vercel.com → **Add New → Project** → importa el repo de GitHub.
- En **Environment Variables** agrega las 3 de `.env.example`
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- **Deploy**. Cada push a `main` redepliega automáticamente.

> El tablero (`app/page.jsx`) lee `cuentas_cobro` y `mutuales` en el servidor con la service role
> key (segura, no llega al navegador). Si ves un error de conexión, revisa las variables y que los
> SQL ya estén ejecutados. La autenticación con login (Supabase Auth) se agrega en un paso posterior
> antes del uso real.

## Próximas fases
- **Fase 2:** portar la UI del generador SIIGO (la del HTML) a la app, leyendo/escribiendo la BD.
- **Fase 3:** generación de la cuenta de cobro en PDF (regular e irregular).
- **Fase 4:** tablero de pagos, mora, saldos y reportes.

## Notas
- `lib/siigo/utils.js` ya está probado: dígitos de verificación de las 7 mutuales correctos,
  parser de moneda colombiano, validación de correos (incluye fix de typos sin corromper dominios
  válidos) y teléfonos, y el desglose comisión → reserva/administración (13% socia / 17% no).
- Portado completo de la lógica a `lib/siigo/` (todo independiente del DOM):
  - `utils.js` — validaciones y cálculos (probado: DV de 7 mutuales, parseMoneda, correos, teléfonos, desglose comisión).
  - `geo.js` — GEO + CAPITALES + buscarGeo (probado: exacto/solo-ciudad/solo-depto-capital/ambigua/combinada).
  - `constantes.js` — NIT fondo, cuentas contables, producto, IVA, OBS.
  - `generar.js` — genera los 3 archivos SIIGO (fechas cortas + coloreado rojo/amarillo); `descargar()` y `aBuffer()` para Storage.
  - `procesar.js` — pipeline de parseo: `leerExcel()` (auto-detecta hoja), `procesarFilas()`, `procesarTexto()`.
- Falta para Fase 2: la **UI React** del generador (formulario + carga + tabla de validación + botones)
  que consume `procesar.js`/`generar.js` y registra el lote en Supabase. Más el login (Supabase Auth).
