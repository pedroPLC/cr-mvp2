// functions/api/insights.js
// Gera insights a partir do battlelog

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("tag") || "").trim().toUpperCase();
  const tag = raw.replace(/^#/, "");

  if (!tag) return json(400, { error: "Informe o TAG do jogador." });

  // Busca o battlelog chamando a própria função /api/battlelog
  const origin = url.origin;
  const res = await fetch(`${origin}/api/battlelog?tag=${encodeURIComponent(tag)}`);
  if (!res.ok) return json(500, { error: "Não consegui buscar o battlelog." });

  const battles = await res.json();
  if (!Array.isArray(battles) || battles.length === 0) {
    return json(200, { matches: 0, tips: ["Sem partidas suficientes para análise."] });
  }

  // Normaliza dados mínimos
  const data = battles.map((b) => {
    const teamCrowns = num(b.teamCrowns ?? b.team?.[0]?.crowns);
    const oppCrowns  = num(b.opponentCrowns ?? b.opponent?.[0]?.crowns);
    const mode       = b.gameMode?.name || b.type || "-";
    const time       = b.battleTime ? new Date(b.battleTime) : null;
    const cards      = Array.isArray(b.team?.[0]?.cards) ? b.team[0].cards : null;
    return { teamCrowns, oppCrowns, mode, time, cards };
  });

  // Funções utilitárias
  const isWin  = (m) => m.teamCrowns > m.oppCrowns;
  const isLoss = (m) => m.teamCrowns < m.oppCrowns;
  const isDraw = (m) => m.teamCrowns === m.oppCrowns;

  const total = data.length;
  const wins  = data.filter(isWin).length;
  const losses= data.filter(isLoss).length;
  const draws = data.filter(isDraw).length;
  const winrate = pct(wins, total);

  // Streak (considera lista em ordem do mais recente ao mais antigo)
  let streakType = null, streakCount = 0;
  for (const m of data) {
    const t = isWin(m) ? "W" : isLoss(m) ? "L" : "D";
    if (!streakType) { streakType = t; streakCount = 1; }
    else if (t === streakType) streakCount++;
    else break;
  }

  // Por modo
  const byMode = {};
  for (const m of data) {
    if (!byMode[m.mode]) byMode[m.mode] = { games: 0, wins: 0 };
    byMode[m.mode].games++;
    if (isWin(m)) byMode[m.mode].wins++;
  }
  const modes = Object.entries(byMode)
    .map(([name, v]) => ({ name, games: v.games, winrate: pct(v.wins, v.games) }))
    .sort((a,b) => b.games - a.games);

  // Melhor janela de 3h (apenas indicativo)
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, g:0, w:0 }));
  for (const m of data) {
    if (!m.time) continue;
    const h = m.time.getHours(); // UTC; tudo bem para um indicativo
    hours[h].g++;
    if (isWin(m)) hours[h].w++;
  }
  let best = { start: 0, end: 3, games: 0, winrate: 0 };
  for (let s = 0; s < 24; s++) {
    let g = 0, w = 0;
    for (let i = 0; i < 3; i++) {
      const idx = (s + i) % 24;
      g += hours[idx].g;
      w += hours[idx].w;
    }
    const wr = g ? Math.round((w / g) * 100) : 0;
    if (g >= 3 && (wr > best.winrate || (wr === best.winrate && g > best.games))) {
      best = { start: s, end: (s + 3) % 24, games: g, winrate: wr };
    }
  }

  // Deck mais usado (agrupa assinatura de 8 cartas)
  const deckMap = new Map();
  for (const m of data) {
    const names = Array.isArray(m.cards) ? m.cards.map(c => (c.name || c.key || "").toString()) : [];
    if (names.length < 8) continue;
    const sig = names.map(n => n.trim()).filter(Boolean).sort().join(" | ");
    if (!sig) continue;
    const prev = deckMap.get(sig) || { games:0, wins:0 };
    prev.games++; if (isWin(m)) prev.wins++;
    deckMap.set(sig, prev);
  }
  let topDeck = null;
  for (const [sig, v] of deckMap.entries()) {
    if (!topDeck || v.games > topDeck.games || (v.games === topDeck.games && v.wins > topDeck.wins)) {
      topDeck = { signature: sig, games: v.games, winrate: pct(v.wins, v.games) };
    }
  }

  // Dicas simples
  const tips = [];
  if (streakType === "L" && streakCount >= 3) tips.push("Sinal de tilt: faça uma pausa curta antes de continuar.");
  if (best.games >= 3 && best.winrate >= winrate + 8) tips.push(`Você rende melhor aprox. entre ${fmt(best.start)}–${fmt(best.end)} (janelas de 3h).`);
  if (topDeck && topDeck.games >= 3 && topDeck.winrate >= 55) tips.push("Seu baralho mais usado está rendendo: priorize treinar com ele.");
  if (!tips.length) tips.push("Mantenha consistência: séries curtas, reveja derrotas e foque nos modos com mais jogos.");

  return json(200, {
    matches: total,
    winrate,
    wins, losses, draws,
    streak: { type: streakType, count: streakCount },
    modes,
    bestWindow: best,      // {start,end,games,winrate}
    topDeck,               // {signature,games,winrate} ou null
    tips
  });
}

function pct(a, b){ return b ? Math.round((a/b)*100) : 0; }
function num(x){ const n = Number(x); return Number.isFinite(n) ? n : 0; }
function fmt(h){ return String(h).padStart(2,"0")+":00"; }

function json(status, body){
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", "access-control-allow-origin":"*" }
  });
}
