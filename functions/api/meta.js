// functions/api/meta.js
// Coleta decks meta (top 10) do RoyaleAPI (Ranked, 7d)
// Atenção: leitura leve de páginas públicas. Use com moderação.
// Fonte: https://royaleapi.com/decks/popular?lang=en&time=7d&type=Ranked

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const time = url.searchParams.get("time") || "7d";
  const type = url.searchParams.get("type") || "Ranked";

  const listURL = `https://royaleapi.com/decks/popular?lang=en&time=${encodeURIComponent(time)}&type=${encodeURIComponent(type)}`;

  try {
    const html = await (await fetch(listURL)).text();

    // Pega links para páginas de "Deck Stats"
    const links = Array.from(new Set(
      [...html.matchAll(/\/decks\/stats\/([a-z0-9\-%,]+)\b/gi)].map(m => m[0])
    )).slice(0, 10);

    const decks = [];
    for (const href of links) {
      const full = "https://royaleapi.com" + href;
      const statHtml = await (await fetch(full)).text();

      // Título do deck (fallback se não achar)
      let title = "";
      const m1 = statHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (m1) title = decodeHtml(m1[1]).trim();
      if (!title) {
        const m2 = statHtml.match(/#\s+([^\n<]+)/); // fallback
        if (m2) title = decodeHtml(m2[1]).trim();
      }
      if (!title) title = "Meta Deck";

      // Cartas estão codificadas na própria URL (/decks/stats/<c1,c2,...>)
      const slug = decodeURIComponent(href.split("/decks/stats/")[1] || "");
      const cards = slug.split(",").map(cleanCard).filter(Boolean);

      // Win% aproximado (se existir no HTML)
      let winrate = null;
      const w = statHtml.match(/Wins[^%]+(\d+)%/i);
      if (w) winrate = Number(w[1]);

      decks.push({ title, cards, winrate, link: full });
    }

    return json(200, {
      source: listURL,
      count: decks.length,
      decks
    });
  } catch (e) {
    return json(500, { error: "Falha ao ler meta." });
  }
}

function cleanCard(s){
  // remove sufixos -ev1/-ev2 e normaliza
  return slugToName(s.replace(/-ev\d+/g, ""));
}
function slugToName(s){
  return s
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}
function decodeHtml(s){
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
}
function json(status, body){
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", "access-control-allow-origin":"*" }
  });
}
