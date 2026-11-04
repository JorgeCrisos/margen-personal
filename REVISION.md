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


## Diagnóstico y corrección del acceso — 4 de noviembre de 2026

- La publicación de GitHub Pages de la revisión anterior terminó correctamente; el problema no se debía únicamente a una publicación pendiente.
- Se ha sustituido el envío nativo del formulario de acceso por una acción directa del botón. El botón valida los campos y llama al controlador de Supabase sin permitir un submit/recargo del formulario en Safari o en la PWA.
- Se ha añadido un mensaje de diagnóstico visible si el JavaScript de la aplicación no llega a enlazar el botón.
- Se ha sincronizado la versión del frontend y del service worker a v35.
- No se modifica el esquema SQL, la autenticación almacenada, las cuentas ni los registros financieros.
- Pendiente: confirmar un inicio de sesión real desde el dispositivo del usuario y comprobar la carga de sus datos. No se declara validado el flujo extremo a extremo hasta esa prueba.


## Corrección explícita del botón de acceso — 4 de noviembre de 2026 (v36)

- Se ha localizado un defecto concreto en v35: el atributo onclick del botón solo escribía un mensaje de diagnóstico; no invocaba el inicio de sesión. El acceso dependía exclusivamente de que el listener del módulo app.js se hubiera ejecutado.
- v36 conecta el onclick directamente con una función global margenLogin definida por app.js. Si el módulo no carga, se muestra un mensaje de carga; si carga, se ejecuta validación y autenticación con Supabase.
- Se elimina el listener duplicado del botón y se sincronizan app.js, index.html y service worker a v36.
- No se modifican datos, credenciales, tablas ni configuración de Supabase.
- Pendiente: prueba real de inicio de sesión en Safari/iPhone y verificación de lectura de datos.


## Corrección de orden de inicialización del acceso — 4 de noviembre de 2026 (v37)

- La captura del usuario confirmó que el HTML se publicaba, pero `window.margenLogin` no estaba definido al pulsar el botón.
- Se adelanta la definición global del controlador de acceso al inicio de `app.js`, inmediatamente después de las declaraciones de estado y antes de registrar los demás eventos de interfaz. Así, un error posterior en la inicialización de otro componente no deja el botón sin controlador.
- Se actualizan la referencia del módulo y la caché PWA a v37.
- No se modifican datos, credenciales, esquema ni configuración de Supabase.
- Pendiente: prueba real del login y lectura de los datos del usuario.


## Corrección de carga del script principal — 4 de noviembre de 2026 (v38)

- La captura del usuario muestra el mensaje de fallback del HTML, lo que demuestra que `window.margenLogin` no estaba disponible al pulsar el botón; no es un error de contraseña.
- Se cambia la carga de `app.js` de `type="module"` a script clásico con `defer`. El archivo no contiene importaciones estáticas; utiliza `import()` dinámico, compatible con scripts clásicos en navegadores modernos. Esto elimina la dependencia de la carga del módulo principal para registrar el controlador global del login.
- Se sincronizan las referencias de `app.js` y el service worker a v38, y se renueva el nombre de caché para invalidar el shell previo.
- No se modifica `config.js`, Supabase, SQL, cuentas ni datos financieros.
- Pendiente de verificación: carga real en Safari/iOS, autenticación y lectura de los datos del usuario.
