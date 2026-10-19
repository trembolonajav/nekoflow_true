// Agrupamento do histórico por dia (função pura, testável sem rede).

export const activityLabel = {
  STARTED: "Iniciado",
  RESUMED: "Retomado",
  COMPLETED: "Concluído",
  MANUAL_COMPLETED: "Marcado como concluído",
  REOPENED: "Reaberto",
};

function dayLabel(date, now = new Date()) {
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(now) - start(date)) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

/** Agrupa por dia no formato da aba Histórico do design. */
export function groupHistory(items, now = new Date()) {
  const groups = new Map();
  for (const x of items) {
    const at = new Date(x.occurredAt);
    const day = dayLabel(at, now);
    if (!groups.has(day)) groups.set(day, []);
    const animation = x.mediaFamily === "ANIMATION";
    const hour = at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    groups.get(day).push({
      hid: x.id,
      workId: x.workId,
      title: x.title,
      cover: x.cover,
      kind: x.kind || (animation ? "anime" : "manga"),
      action: x.activityType,
      unit: `${animation ? "Episódio" : "Capítulo"} ${x.unitNumber || ""}`.trim(),
      time: `${activityLabel[x.activityType] || x.activityType} às ${hour}`,
      href: x.available ? x.unitHref : x.href,
      available: x.available,
    });
  }
  return [...groups].map(([day, list]) => ({ day, items: list }));
}
