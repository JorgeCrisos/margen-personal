# Actualización: saldos bancarios dinámicos (2 de noviembre de 2026)

## Qué cambia
- Cada gasto o ingreso nuevo exige seleccionar una cuenta bancaria.
- Los gastos se restan de la cuenta seleccionada y los ingresos se suman.
- El saldo de cada cuenta se calcula como `saldo inicial a 01/11/2026 + ingresos desde esa fecha - gastos desde esa fecha`.
- El patrimonio total y el reparto de patrimonio utilizan los saldos bancarios calculados.
- Los movimientos muestran el banco asociado.
- Editar o borrar movimientos recalcula el saldo automáticamente, sin operaciones compensatorias.
- Los movimientos antiguos quedan sin cuenta asignada y no alteran el saldo inicial.
- La base de datos comprueba que la cuenta seleccionada pertenece al mismo usuario.

## Migración necesaria
Ejecutar una sola vez en Supabase SQL Editor:
`supabase/migration-2026-11-02-bank-movements.sql`

Es una migración aditiva. Añade `transactions.bank_account_id`, su clave foránea, índice y trigger de validación. No elimina datos ni cambia saldos existentes.

## Configuración inicial obligatoria
Antes de registrar movimientos, editar cada cuenta bancaria y poner en `Saldo inicial a 01/11/2026` el saldo real que tenía esa cuenta al comenzar el 1 de noviembre de 2026. No introducir el saldo de hoy si ya hubo movimientos desde el día 1, porque se duplicaría el efecto de esos movimientos.

## Límites
- Para mantener la coherencia del saldo inicial, la interfaz solo permite asignar a una cuenta movimientos fechados desde 01/11/2026.
- Para transferencias entre dos cuentas propias, registrar dos movimientos con la misma fecha e importe: un gasto en la cuenta de origen y un ingreso en la cuenta de destino. El patrimonio total no cambia.
- No se ha probado contra la sesión real de Supabase del usuario. Deben realizarse las pruebas indicadas antes de introducir el histórico completo.
