# Agenda por personal dentro de la misma clínica (diseño objetivo)

Hoy un **proveedor veterinario** es un único `User` con **una** grilla de franjas (`AvailabilitySlot` de 30 min) y **citas** (`Appointment`) que consumen un bloque al reservar.

## Entidades propuestas (misma clínica, no proveedores independientes)

1. **Clínica** — el `User` con `role: proveedor` y `providerType: veterinaria` (lo que ya existe).
2. **Línea de servicio / profesional** (nuevo modelo, p. ej. `ClinicService` o `ClinicStaff`):
   - `providerId` (clínica padre)
   - `displayName` (ej. “Consulta Dra. Juanita”, “Peluquería Javiera”)
   - `kind` o etiquetas (consulta, estética, etc.)
   - `slotDurationMinutes` (30, 60, …) — define el paso al generar franjas
   - `active` (boolean)
3. **Franja de disponibilidad** — extender `AvailabilitySlot` con:
   - `resourceId` / `clinicServiceId` (qué línea de servicio ofrece ese bloque)
   - `status`: `available` | `blocked` | (opcional futuro) `held` reserva temporal
4. **Cita** — `Appointment` con:
   - `clinicServiceId` (qué profesional o mesa de trabajo)
   - mantiene `startAt` / `endAt` y vínculo al bloque o al consumo atómico

`generate` de agenda pasaría a generar bloques **por cada** línea activa, con su `slotDurationMinutes` y, si aplica, ventanas de recepción distintas (config por servicio o heredadas de la clínica).

## Corrección ya aplicada (agenda actual, una sola grilla)

Al **generar** franjas, el backend **no vuelve a insertar** una franja cuyo horario **solape** una cita o reserva en estado `pending_confirmation`, `confirmed`, `completed` o `no_show`. Así se evita que, tras reservar (el bloque se elimina) y al pulsar “Generar”, reaparezca el mismo hueco libre mientras la cita siga vigente.

## Próximos pasos de implementación

- Migración de datos: asignar un `ClinicService` “Defecto / Recepción” a clínicas existentes y enlazar `AvailabilitySlot` y `Appointment` antiguos.
- API: CRUD de líneas, `GET /available-slots?clinicServiceId=…`, publicación de agenda y reserva con `clinicServiceId`.
- UI dueño: selector de servicio o profesional al reservar; UI clínica: pestañas o secciones por línea de servicio.
