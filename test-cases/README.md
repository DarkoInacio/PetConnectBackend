# Casos de prueba — PetConnectBackend

Este directorio contiene artefactos QA compartidos con el frontend **PetConnect**.

## Documentos

| Archivo | Descripción |
|---------|-------------|
| [smoke-tests.md](./smoke-tests.md) | 15 casos críticos pre-deploy (API + UI) |
| [postman/](../postman/README.md) | Colección Postman exportable + environments |

## Plan maestro

El plan de pruebas completo (11 secciones, ~98 casos, estrategia Postman/manual) vive en el repo frontend:

**`PetConnect/TEST_PLAN.md`**

Ruta local si tienes ambos repos clonados en la misma carpeta padre:

```
../PetConnect/TEST_PLAN.md
../PetConnect/test-cases/smoke-tests.md
```

## Enfoque híbrido

- **Postman:** casos API (`POST /api/auth/login`, `/api/pets`, `/api/appointments`, `/api/vet/*`, etc.)
- **Manual:** UI PWA, geolocalización, offline, usabilidad

## Health check rápido

```http
GET /health
```

Base URL API: `http://localhost:3000/api` (local) o URL Render en staging/prod.

## Seed de datos

```bash
npm run seed:admin
```

Configurar `ADMIN_SEED_EMAIL` y `ADMIN_SEED_PASSWORD` en `.env` antes de ejecutar.
