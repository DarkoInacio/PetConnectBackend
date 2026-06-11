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

```bash
newman run postman/PetConnect.postman_collection.json \
  -e postman/PetConnect-Local.postman_environment.json \
  --folder Smoke
```
