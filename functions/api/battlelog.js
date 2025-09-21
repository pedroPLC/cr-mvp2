// functions/api/battlelog.js
// Cloudflare Pages Function
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const raw = (url.searchParams.get("tag") || "").toUpperCase().trim();
  const tag = raw.replace(/^#/, ""); // remove "#"

  return json(200, await getBattlelog({ tag, env }));
}

async function getBattlelog({ tag, env }) {
  if (!tag) return { error: "Informe o TAG do jogador." };

  const useReal = env.USE_REAL_API === "1" && env.CR_TOKEN;
  if (!useReal) {
    // MODO DEMO (sem token) — retorna dados de exemplo
    return DEMO.slice(0, 12);
  }

  try {
    const endpoint = `https://api.clashroyale.com/v1/players/%23${encodeURIComponent(
      tag
    )}/battlelog`;

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${env.CR_TOKEN}` },
    });

    if (!res.ok) {
      const text = await res.text();
      return { error: `Falha na API (${res.status}): ${text}` };
    }

    const data = await res.json();
    // Formata minimamente alguns campos pra facilitar no front:
    return data.map((b) => ({
      battleTime: b.battleTime,
      gameMode: { name: b.gameMode?.name || b.gameMode || "-" },
      teamCrowns:
        b.team && b.team[0] ? Number(b.team[0].crowns ?? 0) : Number(b.teamCrowns ?? 0),
      opponentCrowns:
        b.opponent && b.opponent[0]
          ? Number(b.opponent[0].crowns ?? 0)
          : Number(b.opponentCrowns ?? 0),
      opponentName:
        (b.opponent && b.opponent[0] && (b.opponent[0].name || b.opponent[0].tag)) ||
        b.opponentName ||
        "-",
    }));
  } catch (e) {
    return { error: "Erro inesperado ao buscar batalhas." };
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
    },
  });
}

// Dados de exemplo (DEMO) — você verá isso no site sem precisar de token.
const DEMO = [
  {
    battleTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    gameMode: { name: "1v1 Ladder" },
    teamCrowns: 3,
    opponentCrowns: 1,
    opponentName: "Rival_01",
  },
  {
    battleTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    gameMode: { name: "Desafio Clássico" },
    teamCrowns: 0,
    opponentCrowns: 1,
    opponentName: "Rival_02",
  },
  {
    battleTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    gameMode: { name: "2v2 Casual" },
    teamCrowns: 2,
    opponentCrowns: 2,
    opponentName: "Rival_03",
  },
  {
    battleTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    gameMode: { name: "1v1 Ladder" },
    teamCrowns: 1,
    opponentCrowns: 0,
    opponentName: "Rival_04",
  },
];
