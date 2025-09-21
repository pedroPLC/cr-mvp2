// functions/api/battlelog.js
// Cloudflare Pages Function
// Agora também expõe teamCards e opponentCards para análise de matchups.

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
    // MODO DEMO — dados mínimos só para teste do front.
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

    // Formata campos úteis
    return data.map((b) => {
      const team = Array.isArray(b.team) && b.team[0] ? b.team[0] : {};
      const opp = Array.isArray(b.opponent) && b.opponent[0] ? b.opponent[0] : {};
      return {
        battleTime: b.battleTime,
        gameMode: { name: b.gameMode?.name || b.gameMode || "-" },
        teamCrowns: Number(team.crowns ?? 0),
        opponentCrowns: Number(opp.crowns ?? 0),
        opponentName: opp.name || opp.tag || "-",
        // cartas (nome/key quando existir)
        teamCards: Array.isArray(team.cards)
          ? team.cards.map(c => cardName(c))
          : [],
        opponentCards: Array.isArray(opp.cards)
          ? opp.cards.map(c => cardName(c))
          : [],
      };
    });
  } catch (_) {
    return { error: "Erro inesperado ao buscar batalhas." };
  }
}

function cardName(c){
  // Prioriza name/key, remove sufixos de evolução no nome
  const n = (c.name || c.key || "").toString();
  return n.replace(/\s*\(Evolution.*\)\s*/i, "").trim();
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

// --- DEMO --- //
const DEMO = [
  // vitória vs Hog 2.6
  {
    battleTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    gameMode: { name: "1v1 Ladder" },
    teamCrowns: 3, opponentCrowns: 1, opponentName: "Rival_01",
    teamCards: ["Royal Hogs", "Mighty Miner", "Electro Spirit", "Cannon (Evolution)", "Skeletons", "The Log", "Baby Dragon", "Lightning"],
    opponentCards: ["Hog Rider", "Ice Golem", "Musketeer", "Cannon", "Fireball", "The Log", "Skeletons", "Ice Spirit"],
  },
  // derrota vs Royal Giant
  {
    battleTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    gameMode: { name: "1v1 Ladder" },
    teamCrowns: 0, opponentCrowns: 1, opponentName: "Rival_02",
    teamCards: ["Royal Hogs", "Mighty Miner", "Electro Spirit", "Cannon (Evolution)", "Skeletons", "The Log", "Baby Dragon", "Lightning"],
    opponentCards: ["Royal Giant", "Fisherman", "Mother Witch", "Phoenix", "Lightning", "The Log", "Tombstone", "Hunter"],
  },
  // empate vs Balloon
  {
    battleTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    gameMode: { name: "1v1 Ladder" },
    teamCrowns: 2, opponentCrowns: 2, opponentName: "Rival_03",
    teamCards: ["Royal Hogs", "Mighty Miner", "Electro Spirit", "Cannon (Evolution)", "Skeletons", "The Log", "Baby Dragon", "Lightning"],
    opponentCards: ["Balloon", "Lumberjack", "Freeze", "Bowler", "Tornado", "Ice Golem", "Barbarians", "Baby Dragon"],
  },
];
