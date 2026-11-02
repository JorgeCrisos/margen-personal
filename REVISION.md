# Informe de revisión — Margen Personal

Fecha: 1 de noviembre de 2026

## Correcciones aplicadas
- El formulario de autenticación ahora distingue entre iniciar sesión y crear cuenta mediante Supabase Auth (`signInWithPassword` / `signUp`).
- Se ha eliminado el segundo controlador duplicado del botón `Añadir movimiento`; ahora abre el diálogo de alta.
- Se ha añadido una migración SQL independiente para crear `public.dividends` y activar políticas RLS en las tablas de patrimonio, cartera, operaciones y dividendos.
- Se han añadido ajustes CSS conservadores para pantallas móviles.
- Se ha incrementado la versión de caché del service worker para invalidar el shell anterior.
- Se ha actualizado el README con los pasos de migración.

## Comprobaciones realizadas
- `node --check app.js`: correcto (sin errores de sintaxis).
- Auditoría estática de referencias DOM: 94 IDs usados desde JavaScript; ninguno falta en el HTML.
- Auditoría de IDs HTML: no hay IDs duplicados.
- Botón `add-shortcut`: un único controlador de clic.
- La implementación de registro `supabase.auth.signUp` está presente.

## Pendiente de prueba en entorno real
No se ha podido iniciar sesión contra tu proyecto Supabase ni ejecutar operaciones reales desde un navegador conectado a tu cuenta. Por tanto, no se certifica todavía el funcionamiento extremo a extremo de autenticación, RLS, cotizaciones Twelve Data, exportación Excel o persistencia de datos. La migración SQL debe ejecutarse en Supabase antes de utilizar la sección de dividendos y las tablas de patrimonio con las políticas nuevas.


## Adaptación responsive – 1 de noviembre de 2026

- Se añadieron estilos específicos para móvil, iPhone instalado como PWA, tablet y escritorio.
- La navegación pasa a una barra inferior fija en móvil, respetando el área segura de iOS.
- Las tarjetas y gráficos pasan a una columna; las métricas se reorganizan en dos columnas.
- Las tablas mantienen su anchura de lectura y permiten desplazamiento horizontal dentro de su contenedor.
- Los diálogos pasan a formato de hoja inferior y los campos evitan el zoom automático de Safari.
- Se añadió el registro del service worker y se incrementó la versión de caché.
- Validaciones realizadas: `node --check app.js` sin errores; comprobación de IDs HTML sin duplicados.
- Limitación: no se ha realizado una prueba visual real en Safari/iPhone ni un flujo autenticado contra Supabase.
