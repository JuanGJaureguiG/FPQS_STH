"""
build_data.py — Tablero FPQS (CONECTA) · UNIMINUTO Sede Tolima-Huila
-------------------------------------------------------------------
Genera data.json a partir de la exportación mensual de CONECTA.

Uso:
    python build_data.py Conecta.xlsx
    (sin argumento busca "Conecta.xlsx" en la misma carpeta)

Columnas esperadas en el Excel:
    Título | Estado | Fecha de apertura | Año | Mes | Categoría

El JSON resultante NO contiene identificadores personales: solo tipo,
estado, fecha/hora de apertura y categoría de cada radicado.
"""
import json, sys, unicodedata, re
from datetime import datetime
from pathlib import Path
import pandas as pd

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("Conecta.xlsx")
OUT = Path(__file__).with_name("data.json")

TIPOS = ["Petición", "Queja", "Felicitación", "Sugerencia"]

# --- Unificación de categorías escritas de forma distinta en CONECTA ---
ALIAS = {
    "solucion de fallas": "Solución de fallas",
    "novedad de recibo de pago": "Novedad recibo de pago",
    "calendario opcion de grado": "Calendario opción de grado",
}

# --- Agrupación de categorías en procesos (reglas en orden; gana la primera) ---
# Si CONECTA trae una categoría nueva, cae en la primera regla cuyo patrón
# coincida; si ninguna coincide, queda en "Otros" y el script la avisa.
PROCESOS = [
    ("Sin categoría específica", [r"^felicitacion$", r"^queja$", r"^sugerencia$"]),
    ("Grados y títulos", [r"grado", r"titulo", r"diploma", r"tarjeta profesional", r"postulacion"]),
    ("Financiero y pagos", [r"recibo", r"pago", r"auxilio", r"devolucion", r"cooperativa",
                            r"financier", r"retencion", r"rete fuente", r"donacion"]),
    ("Certificados y documentos", [r"certific", r"sabana de notas", r"contenidos programaticos",
                                   r"paz y salvo", r"documentos institucionales"]),
    ("Plataformas y soporte TI", [r"falla", r"soporte", r"tu clave", r"cuenta institucional",
                                  r"contrasena", r"zona de estudiantes", r"plataforma"]),
    ("Aula y docencia", [r"actividades y tareas", r"calificacion", r"acceso a los cursos", r"acceso al aula",
                         r"profesor", r"materia y metodologia", r"modalidad de evaluacion", r"novedad de nota",
                         r"acuerdo pedagogico", r"correo interno", r"didactica", r"virtualizacion",
                         r"medios educativos", r"acompanamiento", r"cursos opcionales"]),
    ("Gestión académica y registro", [r"cancelacion", r"reingreso", r"transferencia", r"cambio de sede",
                                      r"cambio de jornada", r"horario", r"nrc", r"credito", r"calendario",
                                      r"inscripcion", r"intersemestral", r"inicio de clases", r"fechas de",
                                      r"reconocimiento de aprendizajes", r"homologa"]),
    ("Prácticas, empleo y proyección", [r"practica", r"empleo", r"emprendimiento", r"convenio", r"alianza",
                                        r"servicio social", r"internacionalizacion", r"pastoral",
                                        r"cultural", r"evento", r"bienestar"]),
    ("Atención e información", [r"informacion", r"contact center", r"quiero estudiar", r"datos",
                                r"proveedor", r"planta fisica", r"servicios tercerizados"]),
]


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s).strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


# Excepciones puntuales (categoría normalizada -> proceso)
OVERRIDE = {
    "calendarios academicos y financieros": "Gestión académica y registro",
}


def proceso_de(cat: str) -> str:
    n = norm(cat)
    if n in OVERRIDE:
        return OVERRIDE[n]
    for nombre, patrones in PROCESOS:
        if any(re.search(p, n) for p in patrones):
            return nombre
    return "Otros"


def main():
    df = pd.read_excel(SRC)
    df.columns = [c.strip() for c in df.columns]
    df = df.dropna(subset=["Título", "Fecha de apertura"])
    df["Fecha de apertura"] = pd.to_datetime(df["Fecha de apertura"])
    df["Título"] = df["Título"].str.strip()
    df["Estado"] = df["Estado"].fillna("Sin estado").str.strip()

    def canon(c):
        c = str(c).strip() if pd.notna(c) else "Sin categoría"
        return ALIAS.get(norm(c), c)
    df["Categoría"] = df["Categoría"].map(canon)

    otros_tipos = sorted(set(df["Título"]) - set(TIPOS))
    tipos = TIPOS + otros_tipos
    estados = sorted(df["Estado"].unique())
    cats = sorted(df["Categoría"].unique(), key=norm)
    procesos = [p for p, _ in PROCESOS] + ["Otros"]
    cat_proc = {c: proceso_de(c) for c in cats}

    sin_proceso = [c for c, p in cat_proc.items() if p == "Otros"]
    if sin_proceso:
        print("⚠ Categorías sin proceso asignado (quedan en 'Otros'):")
        for c in sin_proceso:
            print("   -", c)

    ti = {t: i for i, t in enumerate(tipos)}
    ei = {e: i for i, e in enumerate(estados)}
    ci = {c: i for i, c in enumerate(cats)}
    pi = {p: i for i, p in enumerate(procesos)}

    # registro compacto: [fecha, hora, tipo, categoría, estado]
    rows = [[r["Fecha de apertura"].strftime("%Y-%m-%d"), int(r["Fecha de apertura"].hour),
             ti[r["Título"]], ci[r["Categoría"]], ei[r["Estado"]]]
            for _, r in df.sort_values("Fecha de apertura").iterrows()]

    corte = df["Fecha de apertura"].max()
    data = {
        "fuente": "CONECTA — UNIMINUTO Sede Tolima-Huila",
        "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "desde": df["Fecha de apertura"].min().strftime("%Y-%m-%d"),
        "corte": corte.strftime("%Y-%m-%d"),
        "tipos": tipos,
        "estados": estados,
        "procesos": procesos,
        "categorias": [[c, pi[cat_proc[c]]] for c in cats],
        "rows": rows,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"✔ data.json generado: {len(rows)} radicados · {len(cats)} categorías · corte {data['corte']}")


if __name__ == "__main__":
    main()
