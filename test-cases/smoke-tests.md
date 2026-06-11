# Smoke Tests — PetConnect (Backend)

**Propósito:** Ejecutar estos 15 casos **antes de cada deploy** del backend (Render) o release conjunto frontend+backend.  
**Tiempo estimado:** ~20 minutos (5 min API en Postman + 15 min UI manual).  
**Plan maestro completo:** [`PetConnect/TEST_PLAN.md`](../PetConnect/TEST_PLAN.md) (repo frontend, ruta relativa si ambos repos están en la misma carpeta padre)

> Este archivo es una copia sincronizada de `PetConnect/test-cases/smoke-tests.md`. Ante discrepancias, prevalece la versión del repo frontend.

---

## Precondiciones globales

- Backend accesible (`GET /health` → 200).
- Frontend desplegado o `npm run preview` (build prod para casos PWA).
- Datos de prueba: dueño `dueno@test.com`, vet aprobado, mascota activa, proveedor con slots.
- Postman environment configurado (`baseUrl`, tokens).

---

## Casos críticos

| ID | Nombre | Rol | Herramienta | Pasos | Resultado esperado | Postman |
|----|--------|-----|-------------|-------|-------------------|---------|
| SMK-001 | Health check backend | QA | Postman | `GET {{healthUrl}}` (sin auth) | 200, `{status: "ok"}` o equivalente | Sí |
| SMK-002 | Login dueño API | Dueño | Postman | `POST {{baseUrl}}/auth/login` body `{"email":"dueno@test.com","password":"..."}` | 200, `token` presente; guardar en `token_dueno` | Sí |
| SMK-003 | Login dueño UI | Dueño | Manual | Ir a `/login`, ingresar credenciales, enviar | Sesión activa; header muestra usuario | No |
| SMK-004 | Listar mascotas | Dueño | Postman | `GET {{baseUrl}}/pets` header `Authorization: Bearer {{token_dueno}}` | 200, array (≥1 si hay datos semilla) | Sí |
| SMK-005 | Mapa carga proveedores | Visitante | Postman + Manual | API: `GET {{baseUrl}}/proveedores/mapa?lat=-33.4489&lng=-70.6693&radioKm=15`. UI: abrir `/` | 200 con markers; mapa Leaflet visible | Parcial |
| SMK-006 | Buscar veterinarias | Visitante | Postman | `GET {{baseUrl}}/proveedores/buscar?tipo=veterinaria&pagina=1&limite=5` | 200, lista paginada | Sí |
| SMK-007 | Slots y agendar cita | Dueño | Postman + Manual | 1) `GET {{baseUrl}}/appointments/providers/{{providerId}}/available-slots`. 2) `POST {{baseUrl}}/appointments` body `{"providerId","slotId","petId","reason":"Smoke test"}`. UI opcional: `/agendar` | 201 cita; slot consumido | Parcial |
| SMK-008 | Ver reservas dueño | Dueño | Postman + Manual | `GET {{baseUrl}}/bookings/mine`. UI: `/cuenta/reservas` | 200; cita smoke visible en UI | Parcial |
| SMK-009 | Pacientes veterinario | Vet | Postman | Login vet → `GET {{baseUrl}}/vet/patients` Bearer `{{token_vet}}` | 200, lista pacientes | Sí |
| SMK-010 | Ficha médica dueño | Dueño | Postman + Manual | `GET {{baseUrl}}/pets/{{petId}}/medical-summary`. UI: `/mascotas/{{petId}}/ficha` | 200 resumen; página carga sin error | Parcial |
| SMK-011 | Chatbot Vetto responde | Visitante | Postman + Manual | `POST {{baseUrl}}/chat` body `{"message":"Hola, mi gato no come"}` | 200, `reply` no vacío. UI: `ChatWidget` responde | Parcial |
| SMK-012 | PWA service worker | QA | Manual | Build prod (`npm run build && npm run preview`). DevTools → Application → Service Workers | SW registrado y activo | No |
| SMK-013 | Banner offline | QA | Manual | Con app cargada, DevTools → Network → Offline | `OfflineBanner` visible | No |
| SMK-014 | Logout limpa sesión | Dueño | Manual | Logout desde header | `localStorage` sin `petconnect_token`; rutas protegidas redirigen | No |
| SMK-015 | CORS prod + forgot password | QA | Postman | Desde frontend prod, login funciona. `POST {{baseUrl}}/auth/forgot-password` body `{"email":"dueno@test.com"}` | Sin error CORS en consola; forgot 200 | Parcial |

---

## Checklist rápido pre-deploy

```
[ ] SMK-001 Health
[ ] SMK-002 Login API dueño
[ ] SMK-003 Login UI
[ ] SMK-004 Mascotas
[ ] SMK-005 Mapa
[ ] SMK-006 Buscar vet
[ ] SMK-007 Agendar cita
[ ] SMK-008 Reservas
[ ] SMK-009 Pacientes vet
[ ] SMK-010 Ficha médica
[ ] SMK-011 Chatbot
[ ] SMK-012 PWA SW (solo release prod)
[ ] SMK-013 Offline banner (solo release prod)
[ ] SMK-014 Logout
[ ] SMK-015 CORS + forgot password
```

---

## Colección Postman

Importar desde [`postman/README.md`](../postman/README.md) — carpeta **Smoke** en Collection Runner.

```bash
newman run postman/PetConnect.postman_collection.json -e postman/PetConnect-Local.postman_environment.json --folder Smoke
```

---

## Registro de ejecución

| Fecha | Entorno | Ejecutor | Resultado | Notas |
|-------|---------|----------|-----------|-------|
| | | | ☐ Pass / ☐ Fail | |
