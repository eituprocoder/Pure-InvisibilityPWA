# Pure Invisibility

Pure Invisibility es una PWA educativa de “aislamiento digital temporal”. Funciona sin backend, sin API keys y sin dependencias externas.

## Arquitectura

- `index.html`: interfaz accesible tipo Security Center.
- `style.css`: diseño responsive para teléfono, tablet y computadora.
- `app.js`: temporizador, monitor online/offline, historial local, informes, IndexedDB y simulador.
- `manifest.json`: metadatos de instalación PWA.
- `service-worker.js`: precaché del app shell, funcionamiento offline y bloqueo limitado a solicitudes originadas por esta PWA durante una sesión.
- `icons/`: iconos normales y maskable.

## Ejecutar e instalar

Los Service Workers requieren HTTPS o `localhost`; no abras `index.html` directamente con `file://`.

1. En la carpeta del proyecto, ejecutá un servidor local, por ejemplo: `python3 -m http.server 8080`.
2. Abrí `http://localhost:8080`.
3. Recargá una vez para que el Service Worker controle la página.
4. Usá el botón **Install PWA** o la opción de instalación del navegador.
5. Probá cerrar la conexión y volver a abrir la aplicación.

## Alcance de seguridad

La PWA puede detectar el estado online/offline, cachear sus propios archivos, guardar eventos localmente y bloquear sus propias solicitudes mediante su Service Worker. No puede apagar Wi‑Fi, Bluetooth o datos móviles; controlar otras aplicaciones; modificar el firewall; ni impedir conexiones del sistema operativo.

“Isolation Simulator” es una demostración local. No ejecuta archivos ni contacta servicios externos.
