# Avance de Historias - PetConnect

Documento de traspaso rápido para continuidad entre integrantes.

## Estado Actual (Checkpoint)

### HU-08 Mapa interactivo con georreferenciación

- Backend:
  - Endpoint `GET /api/proveedores/mapa` activo y filtrable.
  - Incluye tipo de marcador (`medical_cross` / `paw`), opacidad por estado operativo y centro por defecto.
  - Geocodificación automática con Nominatim al actualizar dirección del proveedor si no se envían coordenadas.
- Frontend:
  - Mapa con Leaflet + OpenStreetMap + clustering.
  - Filtros en tiempo real y sincronización básica mapa/lista.
  - Popups con foto, nombre, calificación y navegación a perfil.
  - Soporte de imágenes relativas (`/uploads/...`) resuelto contra URL del backend.

### HU-09 Perfil detallado del proveedor (Fase A)

- Backend:
  - Perfil público devuelve datos base del proveedor y ahora incluye teléfono.
- Frontend:
  - Vista detallada funcional con:
    - nombre/foto/galería
    - dirección, teléfono, horarios, descripción
    - servicios y precio de referencia
    - mini mapa + enlace "Cómo llegar"
    - CTA de acción y versión sticky en móvil
    - estado "Temporalmente cerrado" deshabilita CTA y muestra aviso

### HU-10 Publicación perfil paseador/cuidador (avance de base)

- Backend:
  - Se agregó soporte de publicación estructurada en `providerProfile`:
    - `serviceCommunes`
    - `petTypes`
    - `experienceYears`
    - `petsAttended`
    - `weeklyAvailability`
    - `walkerTariffs`
    - `isPublished`
  - `PUT /api/proveedores/mi-perfil` ahora permite actualizar esos campos con validaciones.
  - Los listados públicos filtran perfiles no publicados (`isPublished: false`).
  - Filtro por ciudad considera también `serviceCommunes`.
- Frontend:
  - CTA del perfil cambia según tipo:
    - veterinaria: `Agendar cita`
    - paseador/cuidador: `Solicitar servicio`

## Próximo Paso Recomendado

1. Crear formulario frontend de publicación de paseador/cuidador usando los nuevos campos.
2. Agregar vista/flujo real para `/solicitar-servicio`.
3. Definir validaciones UX para disponibilidad semanal y tarifas en frontend.

## Rutas/Archivos Clave

- Backend:
  - `src/controllers/proveedores.controller.js`
  - `src/models/User.js`
- Frontend:
  - `src/pages/ProviderProfilePage.jsx`
  - `src/services/providers.js`
