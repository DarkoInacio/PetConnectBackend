# Colección Postman — PetConnect API

Copia sincronizada de la colección del repo frontend **PetConnect**.

## Plan maestro

- [TEST_PLAN.md](../PetConnect/TEST_PLAN.md) (repo frontend)
- [test-cases/smoke-tests.md](./test-cases/smoke-tests.md)

## Importar

1. Postman → **Import** → seleccionar todos los `.json` de esta carpeta.
2. Activar environment **PetConnect - Local**.
3. Ejecutar carpeta **Smoke** antes de deploy.

## Regenerar

La fuente de verdad del generador está en:

```
../PetConnect/postman/generate-postman.mjs
```

Tras regenerar en frontend, copiar los JSON aquí.

## Newman

### Local (manual)

1. Levantar API: `npm run dev` o `npm start`
2. Semilla smoke: `npm run seed:smoke` (genera `PetConnect-CI.postman_environment.json`)
3. Semilla QA TCP-001: `npm run seed:qa` (genera `PetConnect-QA.postman_environment.json`)
4. Ejecutar smoke:

```bash
npm run test:smoke
```

O todo en uno (API ya debe estar corriendo):

```bash
npm run test:smoke:full
```

### CI (GitHub Actions)

El workflow `.github/workflows/backend-tests.yml` ejecuta en cada PR/push a `main`:

- **Jest** — 80+ tests unitarios e integración
- **Newman Smoke** — carpeta `Smoke` con MongoDB + seed automático

### Environment CI

`postman/PetConnect-CI.postman_environment.json` se **regenera** con `npm run seed:smoke`.
`postman/PetConnect-QA.postman_environment.json` se **regenera** con `npm run seed:qa` (usuarios del anexo A TCP-001).
No editar IDs a mano; los scripts crean dueño, vet, mascota, servicio y slot.
