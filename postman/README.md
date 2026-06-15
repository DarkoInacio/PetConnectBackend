# Colección Postman — PetConnect API

Copia sincronizada de la colección del repo frontend **PetConnect**.

## Plan maestro

- [TEST_PLAN.md](../PetConnect/TEST_PLAN.md) (repo frontend)
- [test-cases/smoke-tests.md](./test-cases/smoke-tests.md)

## Importar

1. Postman → **Import** → seleccionar todos los `.json` de esta carpeta.
2. Activar environment **PetConnect - Local** (desarrollo) o **PetConnect - QA TCP-001** (QA completo).
3. Para deploy rápido: ejecutar carpeta **Smoke** con datos semilla.

## Regenerar

La fuente de verdad del generador está en:

```
../PetConnect/postman/generate-postman.mjs
```

Tras regenerar en frontend, copiar `PetConnect.postman_collection.json` aquí.

---

## Scripts npm

| Comando | Qué hace |
|---------|----------|
| `npm run seed:qa` | Semilla MongoDB TCP-001 + genera `PetConnect-QA.postman_environment.json` |
| `npm run seed:smoke` | Semilla smoke + genera `PetConnect-CI.postman_environment.json` |
| `npm run test:qa:full` | **Recomendado QA:** seed → health estable → Newman (14 carpetas) |
| `npm run test:qa` | Solo Newman QA (asume `seed:qa` ya corrido y API levantada) |
| `npm run test:smoke:full` | seed smoke → health → Newman carpeta Smoke |
| `npm run test:smoke` | Solo Newman Smoke (una carpeta) |

---

## QA TCP-001 con Newman (flujo completo)

### Requisitos

1. **API en marcha** en otra terminal: `npm run dev`
2. **Reiniciar `npm run dev`** tras cambios en `nodemon.json` (ignora `postman/` para que seed/Newman no reinicien el servidor).
3. **MongoDB accesible** (Atlas o local según `.env`).
4. En **desarrollo** no hay rate limit en `/api` (producción: 100 req / 15 min). Si ves `429 Too many requests`, reinicia el servidor tras actualizar el código.

### Ejecutar

```bash
npm run test:qa:full
```

Salida esperada al final:

```
QA Newman TCP-001 completado (14 carpetas).
```

Si ya corriste `seed:qa` y solo quieres repetir Newman:

```bash
npm run test:qa
```

### Orden Newman (14 carpetas)

Newman ejecuta **una carpeta por run** (no varios `--folder` a la vez) y exporta el environment entre runs para encadenar tokens e IDs (`postman/.qa-newman-env.json`, ignorado por git).

| # | Carpeta | Notas |
|---|---------|--------|
| 1 | Auth | Register 201/409; forgot + reset password (reset deja `password_dueno` igual) |
| 2 | Profile | |
| 3 | Pets | Crea mascota de prueba; **no** incluye mark-deceased |
| 4 | Providers | |
| 5 | Clinic Services | POST servicio 201/409 idempotente |
| 6 | Vet Clinical | POST encounter 201/409 (seed ya tiene encounter) |
| 7 | Bookings | |
| 8 | Chat | Lento (~2 s por mensaje IA) |
| 9 | **Appointments** | Tres sub-flujos: cancel dueño → cancel proveedor → flujo completo |
| 10 | Agenda | Genera muchos slots; GET guarda `slotId` |
| 11 | Reviews | Usa `reviewId` / `reportId` del seed |
| 12 | Admin | Suspend/reactivate vet; decide report |
| 13 | **Smoke** | 17 assertions; SMK-007b crea cita |
| 14 | **Pets cleanup** | `mark-deceased` — **siempre al final** |

**Por qué `Pets cleanup` al final:** si `mark-deceased` corre dentro de **Pets**, **Vet Clinical** y **Smoke** fallan (mascota fallecida).

**Por qué Smoke antes de Pets cleanup:** Smoke necesita mascota activa y slot disponible (Agenda regenera slots antes).

### Appointments (detalle)

La carpeta prueba tres citas distintas sobre el mismo slot (se restaura al cancelar):

1. Crear → cancelar (dueño)
2. Crear → cancelar (proveedor)
3. Crear → confirmar → notas → complete-vet → elegibilidad reseña → POST reseña

`complete-walker` y `complete-visit` devuelven **400** en citas de clínica (esperado; tests aceptan 400).

`POST crear reseña cita` acepta **201 o 409** (re-run idempotente).

### Credenciales QA (seed)

Tras `npm run seed:qa`:

| Variable | Valor típico |
|----------|----------------|
| `password_dueno`, `password_vet`, `password_admin`, `qa_password` | `QaTest2026!` |
| `email_dueno` | `dueno1@petconnect.test` |
| `email_vet` | `vet@petconnect.test` |
| `email_admin` | `admin@petconnect.test` |

Variables de datos semilla: `providerId`, `providerSlug`, `slotId`, `appointmentId`, `encounterId`, `reviewId`, `reportId`, `pendingProviderId`, `walkerProviderId`, `petId` (Firulais).

### Respuestas idempotentes (normal en re-runs)

| Request | Códigos aceptados | Motivo |
|---------|-------------------|--------|
| Register dueño | 201, 409 | Usuario ya existe |
| POST encounter (vet) | 201, 409 | Encounter del seed |
| POST servicio clínica | 201, 409 | Servicio duplicado |
| POST reseña cita | 201, 409 | Reseña ya creada |
| POST reportar reseña | 201, 409 | Reporte ya existe |
| PATCH encounter / retracción | 200, 400 | Fuera de ventana de edición |
| Admin approve/reject | 200, 400 | Mismo proveedor pendiente |

---

## QA TCP-001 en Postman UI (manual)

1. `npm run dev`
2. `npm run seed:qa`
3. **Reimportar** `PetConnect-QA.postman_environment.json` y `PetConnect.postman_collection.json` (Postman no sincroniza el env en disco automáticamente).
4. Activar environment **PetConnect - QA TCP-001**.
5. Ejecutar carpetas en el **mismo orden** que la tabla Newman de arriba.

Límite Postman: ~25 runs por batch en UI; para todo el TCP-001 usar **Newman** (`npm run test:qa:full`).

---

## Smoke (Newman / CI)

### Local

```bash
npm run test:smoke:full
```

O con seed previo:

```bash
npm run seed:smoke
npm run test:smoke
```

Environment: `PetConnect-CI.postman_environment.json` (regenerado por `seed:smoke`).

### CI (GitHub Actions)

El workflow `.github/workflows/backend-tests.yml` ejecuta en cada PR/push a `main`:

- **Jest** — tests unitarios e integración
- **Newman Smoke** — carpeta `Smoke` con MongoDB + seed automático

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `"C:\Program" no se reconoce` | Bug antiguo en scripts Windows | Actualizar repo; usar `npm run test:qa:full` |
| `Invalid entrypoint` (Newman) | Varios `--folder` mal interpretados | Usar `npm run test:qa` (carpeta por carpeta) |
| `ECONNREFUSED` tras health OK | Nodemon reiniciaba por cambios en `postman/` | Reiniciar `npm run dev` (existe `nodemon.json`) |
| `429 Too many requests` | Rate limit 100/15min (prod o servidor viejo) | Reiniciar dev con código actual (sin límite en dev) |
| SMK-002 login 400 | Reset password cambió clave | Colección actual: reset usa `{{password_dueno}}`; correr `seed:qa` |
| Vet Clinical POST encounter 400 | Mascota fallecida | Mover `mark-deceased` a **Pets cleanup** (al final) |
| Appointments confirm 400 | Cancel dueño antes de confirmar | Colección actual: flujos separados |
| SMK-007b 409 | Slot consumido | `npm run seed:qa` + reimportar env; correr Smoke al final |
| Login dueño 400 sin seed | Contraseña desincronizada | `npm run seed:qa` |

---

## Archivos generados (no commitear)

| Archivo | Origen |
|---------|--------|
| `PetConnect-CI.postman_environment.json` | `npm run seed:smoke` |
| `PetConnect-QA.postman_environment.json` | `npm run seed:qa` |
| `postman/.qa-newman-env.json` | Newman entre carpetas QA |
| `postman/newman-results.xml` | Reportes Newman opcionales |
