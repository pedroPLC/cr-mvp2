// functions/api/coach.js
// Agrega perfil, battles, insights e recomendações com fallback seguro.

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("tag") || "").trim().toUpperCase();
  const tag = raw.replace(/^#/, "");
  if (!tag) return json(400, { error: "Informe o TAG do jogador." });

  const base = url.origin;

  // 1) SEMPRE obter battles primeiro (histórico é o essencial)
  let battles = [];
  try {
    const bRes = await fetch(`${base}/api/battlelog?tag=${encodeURIComponent(tag)}`);
    if (!bRes.ok) {
      return json(200, {
        tag: "#" + tag,
        player: null,
        insights: null,
        reco: null,
        battles: [],
        warning: "BATTLELOG_UNAVAILABLE"
      });
    }
    const b = await bRes.json();
    battles = Array.isArray(b) ? b.slice(0, 50) : [];
  } catch {
    return json(200, {
      tag: "#" + tag,
      player: null,
      insights: null,
      reco: null,
      battles: [],
      warning: "BATTLELOG_NETWORK_ERROR"
    });
  }

  // 2) Tentar o resto sem travar o retorno (Promise.allSettled)
  const [pRes, iRes, rRes] = await Promise.allSettled([
    fetch(`${base}/api/player?tag=${encodeURIComponent(tag)}`),
    fetch(`${base}/api/insights?tag=${encodeURIComponent(tag)}`),
    fetch(`${base}/api/reco?tag=${encodeURIComponent(tag)}`)
  ]);

  const player  = await safeJson(pRes);
  const insights= await safeJson(iRes);
  const reco    = await safeJson(rRes);

  return json(200, {
    tag: "#" + tag,
    player,
    insights,
    reco,
    battles
  });
}

async function safeJson(s) {
  try {
    if (s?.status === "fulfilled" && s.value?.ok) return await s.value.json();
  } catch {}
  return null;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }
  });
}
