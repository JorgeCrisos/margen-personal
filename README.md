# Margen Personal — paquete completo

Aplicación web personal para controlar movimientos, bancos, patrimonio e inversiones. Incluye frontend, esquema SQL y función de cotizaciones bursátiles.

## Contenido

- `index.html`, `styles.css`, `app.js`: interfaz y lógica de la aplicación.
- `config.js`: plantilla que debes completar con la URL y la clave pública de TU proyecto Supabase.
- `config.example.js`: copia de la plantilla de configuración.
- `supabase/schema.sql`: tablas y políticas de seguridad (RLS).
- `supabase/functions/get-quotes/index.ts`: función de Supabase Edge Functions que consulta Twelve Data sin exponer la API key en el navegador.

## 1. Configura la conexión con Supabase

1. Abre `config.js`.
2. En Supabase, abre tu proyecto y busca **Project Settings / API** o el botón **Connect**.
3. Copia la **Project URL** en `SUPABASE_URL`.
4. Copia la clave pública **publishable/anon** en `SUPABASE_ANON_KEY`.
5. No uses nunca `service_role` en este archivo y no compartas `config.js`.

Si ya tienes un `config.js` funcional en tu proyecto actual, conserva ese archivo y no lo sustituyas por la plantilla de este paquete.

## 2. Base de datos

El archivo `supabase/schema.sql` contiene las tablas de movimientos, bancos, posiciones de inversión, operaciones y dividendos, con políticas RLS por usuario.

Como ya ejecutaste el SQL actualizado en tu proyecto, **no es necesario ejecutarlo otra vez ahora**. Si configuras un proyecto Supabase nuevo, ejecuta el archivo completo en SQL Editor.

## 3. Cotizaciones bursátiles (Twelve Data)

La aplicación usa la función `get-quotes` y espera que exista en el mismo proyecto Supabase que usa `config.js`.

1. En Supabase > Edge Functions, comprueba que exista una función llamada exactamente `get-quotes`.
2. Su código debe corresponder a `supabase/functions/get-quotes/index.ts`.
3. En Supabase > Edge Functions > Secrets, debe existir el secreto `TWELVEDATA_API_KEY` con tu clave de Twelve Data.
4. No pongas esa clave en `config.js`, HTML o JavaScript del navegador.
5. Inicia sesión en Margen Personal, añade una posición con ticker admitido por Twelve Data y pulsa **Actualizar cotizaciones**.

La función convierte a EUR cuando el proveedor informa otra divisa. El proveedor puede limitar consultas por plan y no todos los símbolos están disponibles en todas las bolsas. Algunos tickers pueden necesitar sufijo de mercado, según el formato de Twelve Data. No se deben dar por válidas las cotizaciones hasta ver una respuesta real.

## 4. Ejecutar en Windows

No abras `index.html` directamente con doble clic. En la carpeta donde está `index.html`:

1. Haz clic en la barra de direcciones del Explorador de archivos.
2. Escribe `cmd` y pulsa Enter.
3. En la ventana negra ejecuta:

   ```bash
   python -m http.server 8000
   ```

4. Deja abierta esa ventana y abre `http://localhost:8000` en Chrome o Edge.

## 5. Primer uso

1. Regístrate o inicia sesión.
2. Añade una cuenta bancaria con saldo actual.
3. Añade los movimientos de ingresos y gastos que quieras controlar.
4. Añade cada activo de inversión con ticker, cantidad y coste medio por título en EUR.
5. Pulsa actualizar cotizaciones para probar el precio de mercado y la valoración.

No se precargan saldos ni activos ficticios. Los saldos bancarios son manuales; esta versión no se conecta automáticamente a tu banco.

## Seguridad y límites

- La seguridad de los datos depende de las políticas RLS de Supabase.
- La clave pública de Supabase se utiliza en el navegador por diseño; nunca uses la clave `service_role`.
- La clave de Twelve Data debe permanecer como secreto de la Edge Function.
- Cotizaciones, conversión de divisa, disponibilidad de símbolos y límites dependen de Twelve Data.
- Verifica las primeras operaciones y valoraciones contra tu broker antes de confiar en ellas para decisiones financieras.
- El paquete no incluye las credenciales privadas de tu proyecto; deben permanecer en tu equipo/Supabase.


## Instalar en iPhone (PWA)

Esta versión incluye `manifest.webmanifest`, iconos y `sw.js` para poder añadirse a la pantalla de inicio cuando esté publicada por HTTPS. La caché permite abrir la carcasa de la aplicación, pero **los datos de Supabase y las cotizaciones requieren conexión a internet**.

### Publicar gratis con GitHub Pages
1. Crea un repositorio en GitHub. Si va a ser público, recuerda que el código será visible; no subas claves privadas ni secretos.
2. Sube los archivos de esta carpeta, incluyendo `manifest.webmanifest`, `sw.js` e `icons/`.
3. Conserva tu `config.js` real con la URL de Supabase y la clave pública (anon/publishable). No uses la plantilla con valores `TU-PROYECTO`. Nunca publiques `service_role` ni la clave de Twelve Data.
4. En GitHub, entra en **Settings → Pages**, selecciona **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`. Guarda y espera a que aparezca la URL HTTPS.
5. Abre esa URL en Safari en el iPhone → **Compartir** → **Añadir a pantalla de inicio**.

### Antes de dar por validada la bolsa
Inicia sesión, añade una posición con un ticker válido para Twelve Data y pulsa **Actualizar cotizaciones**. Si falla, revisa la consola del navegador y los logs de `get-quotes` en Supabase. No pongas `TWELVEDATA_API_KEY` en `config.js` ni en GitHub.
