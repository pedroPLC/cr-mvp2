// functions/api/reco.js
// Gera recomendações (trocas e dicas) com base nas partidas recentes + meta online.

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("tag") || "").trim().toUpperCase();
  const tag = raw.replace(/^#/, "");
  if (!tag) return json(400, { error: "Informe o TAG do jogador." });

  // 1) Busca battlelog e meta
  const origin = url.origin;
  const [bRes, mRes] = await Promise.all([
    fetch(`${origin}/api/battlelog?tag=${encodeURIComponent(tag)}`),
    fetch(`${origin}/api/meta`)
  ]);

  if (!bRes.ok) return json(500, { error: "Falha ao buscar battlelog." });
  if (!mRes.ok) return json(500, { error: "Falha ao buscar meta." });

  const battles = await bRes.json();
  const meta = await mRes.json();

  if (!Array.isArray(battles) || battles.length === 0) {
    return json(200, { items: [], tips: ["Sem partidas suficientes para análise."] });
  }
  const metaDecks = Array.isArray(meta.decks) ? meta.decks : [];

  // 2) Deck do jogador (usa cartas da partida mais recente em que existam)
  const myDeck = (battles.find(b => Array.isArray(b.teamCards) && b.teamCards.length >= 8)?.teamCards || []).map(norm);

  // 3) Assinatura de deck do oponente por partida + contagem e WR do usuário
  const map = new Map();
  for (const b of battles) {
    const opp = Array.isArray(b.opponentCards) ? b.opponentCards.map(norm) : [];
    if (opp.length < 6) continue; // ignora partidas sem deck claro

    const sig = sigFrom(opp);
    const cur = map.get(sig) || { faced: 0, wins: 0, losses: 0, draws: 0, sample: opp };
    cur.faced++;
    if (b.teamCrowns > b.opponentCrowns) cur.wins++;
    else if (b.teamCrowns < b.opponentCrowns) cur.losses++;
    else cur.draws++;
    map.set(sig, cur);
  }

  const faced = [...map.entries()]
    .map(([sig, v]) => ({ sig, ...v, wr: pct(v.wins, v.faced) }))
    .sort((a,b) => b.faced - a.faced)
    .slice(0, 3); // top 3 decks mais enfrentados

  // 4) Para cada deck enfrentado, aproxima de um deck do meta via Jaccard
  const items = [];
  for (const f of faced) {
    const nearest = bestMatch(f.sample, metaDecks);
    const rec = recommend(myDeck, f.sample);

    items.push({
      facedCount: f.faced,
      myWR: f.wr,
      opponentDeck: prettyDeck(f.sample),
      metaApprox: nearest ? { title: nearest.title, winrate: nearest.winrate, cards: nearest.cards } : null,
      swaps: rec.swaps,
      tips: rec.tips,
    });
  }

  // Dica geral
  const tips = [];
  if (myDeck.length === 0) tips.push("Jogue uma partida com o deck que quer analisar para eu identificar suas cartas.");
  if (!items.length) tips.push("Ainda não consegui reconhecer decks repetidos dos oponentes. Jogue mais 3–5 partidas.");

  return json(200, { myDeck: prettyDeck(myDeck), items, tips });
}

// ---------- LÓGICA DE RECOMENDAÇÃO (heurística simples) ---------- //

const BUILDINGS = ["Cannon", "Cannon (Evolution)", "Bomb Tower", "Tesla", "Inferno Tower", "Goblin Cage", "Tombstone"];
const AIR_DPS   = ["Musketeer", "Archers", "Mega Minion", "Tesla", "Inferno Dragon", "Minions", "Electro Wizard", "Phoenix", "Hunter"];
const SPLASH    = ["Valkyrie", "Baby Dragon", "Wizard", "Executioner", "Bowler", "Bomb Tower", "Mother Witch"];
const SMALL_SPELLS = ["The Log", "Arrows", "Barbarian Barrel", "Royal Delivery", "Snowball"];
const BIG_SPELLS   = ["Fireball", "Poison", "Rocket", "Lightning", "Earthquake"];

const CHEAP_CYCLE = ["Skeletons", "Ice Spirit", "Fire Spirit", "Ice Golem", "Goblins", "Electro Spirit"];

function recommend(myDeck, oppDeck){
  const tips = [];
  const swaps = [];

  // se não sei seu deck, só dou dica
  if (!Array.isArray(myDeck) || myDeck.length === 0) {
    tips.push("Dica geral: contra Hogs use prédio (Cannon/Bomb Tower) e Log; contra Balloon tenha prédio + DPS aéreo; contra Giant/Golem use Inferno Tower/Dragon ou Mini P.E.K.K.A.");
    return { swaps, tips };
  }

  const has = (list) => myDeck.some(c => list.includes(c));
  const lacks = (list) => !has(list);
  const oppHas = (name) => oppDeck.includes(name);

  // — Hog Rider —
  if (oppHas("Hog Rider")) {
    if (lacks(BUILDINGS)) swaps.push(swapSuggestion(myDeck, CHEAP_CYCLE, "Cannon (Evolution)", "Vs Hog: prédio segura puxadas e minimiza dano."));
    if (lacks(SMALL_SPELLS)) swaps.push(swapSuggestion(myDeck, CHEAP_CYCLE, "The Log", "Vs Hog: Log limpa suporte (Esqueletos/Espírito)."));
    tips.push("Vs Hog: posicione prédio no centro (anti-King activation) e guarde o Log para limpar suporte.");
  }

  // — Royal Hogs —
  if (oppHas("Royal Hogs")) {
    if (lacks(BUILDINGS)) swaps.push(swapSuggestion(myDeck, CHEAP_CYCLE, "Bomb Tower", "Vs Royal Hogs: estrutura com dano em área neutraliza split-lane."));
    if (lacks(SMALL_SPELLS)) swaps.push(swapSuggestion(myDeck, CHEAP_CYCLE, "The Log", "Log para cortar suporte atrás dos porquinhos."));
    tips.push("Vs Royal Hogs: jogue prédio central 4–2, e responda o lado ‘fraco’ com Valkyrie/Bomber.");
  }

  // — Balloon —
  if (oppHas("Balloon")) {
    if (lacks(BUILDINGS)) swaps.push(swapSuggestion(myDeck, CHEAP_CYCLE, "Tesla", "Vs Balloon: Tesla força trajetória e ganha tempo."));
    if (lacks(AIR_DPS))  swaps.push(swapSuggestion(myDeck, CHEAP_CYCLE, "Musketeer", "Vs Balloon: DPS aéreo consistente evita bomba na torre."));
    tips.push("Vs Balloon: prédio no centro + DPS aéreo; cuidado com Freeze, segure uma resposta.");
  }

  // — Graveyard —
  if (oppHas("Graveyard")) {
    if (lacks(SPLASH)) swaps.push(swapSuggestion(myDeck, CHEAP_CYCLE, "Valkyrie", "Vs GY: splash em cima do rei limpa os esqueletos."));
    if (!has(["Poison"])) swaps.push(swapSuggestion(myDeck, BIG_SPELLS, "Poison", "Vs GY: Poison em cima do rei reduz dano e pressiona o atacante."));
    tips.push("Vs Graveyard: coloque tank no rei e jogue Poison defensivo; evite gastar ambos counters antes do push.");
  }

  // — Royal Giant / Giant / Golem —
  if (oppHas("Royal Giant") || oppHas("Giant") || oppHas("Golem")) {
    if (!has(["Inferno Tower", "Inferno Dragon"])) {
      swaps.push(swapSuggestion(myDeck, CHEAP_CYCLE, "Inferno Tower", "Vs tanques: Inferno derrete tanque com custo eficiente."));
    }
    tips.push("Vs tanques: pressione a lane oposta quando o oponente investir pesado atrás do rei.");
  }

  // — X-Bow —
  if (oppHas("X-Bow")) {
    if (!has(BIG_SPELLS)) swaps.push(swapSuggestion(myDeck, CHEAP_CYCLE, "Fireball", "Vs X-Bow: feitiço grande para resetar/abater a estrutura."));
    tips.push("Vs X-Bow: tanque na ponte + feitiço; não deixe ciclar grátis.");
  }

  // Limita a 3 sugestões
  return { swaps: dedupe(swaps).slice(0,3), tips: dedupe(tips) };
}

// escolhe o que tirar (de preferência um ciclo barato) e o que colocar
function swapSuggestion(myDeck, preferRemove, addCard, reason){
  let remove = myDeck.find(c => preferRemove.includes(c));
  if (!remove) {
    // se não achar, remove a carta de menor impacto (heurística simples)
    remove = myDeck
      .slice()
      .sort((a,b) => scoreCard(a) - scoreCard(b))[0] || myDeck[0];
  }
  return { remove, add: addCard, reason };
}
function scoreCard(name){
  // pontua cartas de ciclo como “mais removíveis”
  return CHEAP_CYCLE.includes(name) ? 0 : 1;
}

// ---------- Similaridade com meta ---------- //
function bestMatch(deck, metaDecks){
  let best = null, bestJ = 0;
  for (const md of metaDecks) {
    const j = jaccard(deck, (md.cards || []).map(norm));
    if (j > bestJ) { best = md; bestJ = j; }
  }
  return best;
}
function jaccard(a, b){
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...A, ...B]).size || 1;
  return inter / uni;
}

// ---------- Utils ---------- //
function norm(s){ return String(s || "").trim().toLowerCase().replace(/\s+/g," "); }
function sigFrom(arr){ return arr.map(norm).sort().join(" | "); }
function prettyDeck(arr){ return (arr || []).map(x => x).join(" · "); }
function pct(a,b){ return b ? Math.round((a/b)*100) : 0; }
function dedupe(arr){ return Array.from(new Set(arr.map(x => JSON.stringify(x)))).map(s => JSON.parse(s)); }
function json(status, body){ return new Response(JSON.stringify(body), { status, headers: { "content-type":"application/json; charset=utf-8", "access-control-allow-origin":"*" } }); }
