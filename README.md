# Tablero FPQS · CONECTA — UNIMINUTO Sede Tolima-Huila

Felicitaciones, peticiones, quejas y sugerencias radicadas en CONECTA.

## Actualización mensual (último día de cada mes)
1. Descarga la base de CONECTA y guárdala como `Conecta.xlsx` en la carpeta del tablero
   (columnas: Tipo de radicado, Estado, Fecha de apertura, Año, Mes, Categoría).
2. Ejecuta: `python build_data.py Conecta.xlsx`
   (el corte se toma como el último día del mes; si descargas a mitad de mes usa
   `python build_data.py Conecta.xlsx AAAA-MM-DD` y ese mes se marcará como parcial)
3. En GitHub: **Add file → Upload files** y sube solo el nuevo `data.json` (reemplaza al anterior).

Si el script avisa "Categorías sin proceso asignado", CONECTA trajo una categoría nueva:
agrégala a las reglas `PROCESOS` (o a `OVERRIDE`) en `build_data.py` y vuelve a ejecutarlo.

No subas `Conecta.xlsx` al repositorio; `data.json` no contiene datos personales.
