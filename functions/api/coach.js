// functions/api/coach.js
// Endpoint agregador: perfil, battles, insights e recomendações.

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("tag") || "").trim().toUpperCase();
  const tag = raw.replace(/^#/, "");
  if (!tag) return json(400, { error: "Informe o TAG do jogador." });

  const base = url.origin;
  try {
    const [pRes, bRes, iRes, rRes] = await Promise.all([
      fetch(`${base}/api/player?tag=${encodeURIComponent(tag)}`),
      fetch(`${base}/api/battlelog?tag=${encodeURIComponent(tag)}`),
      fetch(`${base}/api/insights?tag=${encodeURIComponent(tag)}`),
      fetch(`${base}/api/reco?tag=${encodeURIComponent(tag)}`)
    ]);

    const player = pRes.ok ? await pRes.json() : null;
    const battles = bRes.ok ? await bRes.json() : [];
    const insights = iRes.ok ? await iRes.json() : null;
    const reco = rRes.ok ? await rRes.json() : null;

    return json(200, {
      tag: "#" + tag,
      player,
      insights,
      reco,
      battles: Array.isArray(battles) ? battles.slice(0, 50) : []
    });
  } catch {
    return json(500, { error: "Falha ao agregar dados do coach." });
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", "access-control-allow-origin":"*" }
  });
}
