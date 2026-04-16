# Integración frontend (PetConnect) ↔ backend (PetConnectBackend)

## 1. Configuración

- En el **frontend**, define la URL del API (ej. Vite: `VITE_API_URL=http://localhost:3000`).
- En el **backend**, `CLIENT_URL` debe coincidir con el origen del front (CORS), ej. `http://localhost:5173`.

## 2. Rutas nuevas / relevantes

| Área | Método | Ruta | Auth |
|------|--------|------|------|
| Perfil por slug | GET | `/api/proveedores/perfil/:tipo/:slug` | No |
| Reseña | POST | `/api/proveedores/:providerId/reviews` | Dueño |
| Listar reseñas | GET | `/api/proveedores/:providerId/reviews?pagina=1&limite=10` | No |
| Publicar walker (validación) | PUT | `/api/proveedores/mi-perfil` body `isPublished`, campos HU-10 | Proveedor |
| Solicitar servicio | POST | `/api/proveedores/solicitar-servicio` | Dueño |
| Reservas unificadas | GET | `/api/bookings/mine` | Dueño |
| Slug en perfil | PUT | `/api/proveedores/mi-perfil` body `publicSlug` | Proveedor |

`tipo` en slug: `veterinaria` | `paseador` | `cuidador`.

## 3. Respuesta perfil público (`GET .../:id/perfil` o por slug)

Incluye: `ratingSummary`, `reviewsRecent`, `publicSlug`, `seoPath`, `profilePath`.

## 4. Si el repo del front no está en esta máquina

Clona o abre **PetConnect** en Cursor y aplica los mismos paths contra `VITE_API_URL`.
