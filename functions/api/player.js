// functions/api/player.js
// Perfil do jogador (nome, troféus, arena). Usa API oficial se CR_TOKEN + USE_REAL_API=1; caso contrário, DEMO.

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("tag") || "").toUpperCase().trim();
  const tag = raw.replace(/^#/, "");
  if (!tag) return json(400, { error: "Informe o TAG do jogador." });

  const useReal = env.USE_REAL_API === "1" && env.CR_TOKEN;
  if (!useReal) return json(200, demoPlayer(tag));

  try {
    const endpoint = `https://api.clashroyale.com/v1/players/%23${encodeURIComponent(tag)}`;
    const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${env.CR_TOKEN}` } });
    if (!res.ok) return json(res.status, { error: `Falha na API (${res.status})` });
    const p = await res.json();

    return json(200, {
      name: p.name || "Player",
      tag: p.tag || "#" + tag,
      trophies: p.trophies || 0,
      bestTrophies: p.bestTrophies || 0,
      level: p.expLevel || 0,
      clan: p.clan ? { name: p.clan.name, tag: p.clan.tag } : null,
      arena: p.arena?.name || "Unknown Arena",
      arenaId: p.arena?.id || 0
    });
  } catch {
    return json(500, { error: "Erro inesperado ao buscar perfil." });
  }
}

function demoPlayer(tag) {
  return {
    name: "Demo Player",
    tag: "#" + tag,
    trophies: 6400,
    bestTrophies: 6600,
    level: 50,
    clan: { name: "CR Coach", tag: "#COACH" },
    arena: "Legendary Arena",
    arenaId: 54000000
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }
  });
}
