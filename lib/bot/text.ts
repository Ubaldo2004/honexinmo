// Helpers de texto del bot, puros y sin dependencias (testeables). Los usa app/api/telegram/route.ts.

// Saca cualquier emoji del texto. Garantía dura: el bot NUNCA manda emojis, aunque el modelo los meta.
export function sinEmojis(t: string): string {
  return t
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2190}-\u{21FF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
    .replace(/ {2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export const DIAS_SEM = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function sinAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// "martes tarde, jueves mañana" → [{dia:"martes", franja:"tarde"}, ...] (días canónicos).
export function parseDispo(s: string): { dia: string; franja: string }[] {
  const out: { dia: string; franja: string }[] = [];
  for (const chunk of s.toLowerCase().split(/[,;]|\sy\s/)) {
    const c = sinAcento(chunk);
    const dia = DIAS_SEM.find((d) => c.includes(sinAcento(d)));
    const franja = /man|maty/.test(c) ? "mañana" : /tard|noch|vesper/.test(c) ? "tarde" : null;
    if (dia && franja && !out.some((o) => o.dia === dia && o.franja === franja)) out.push({ dia, franja });
  }
  return out;
}
