export async function onRequest({ request, env }) {
  const { searchParams } = new URL(request.url);
  let tag = (searchParams.get("tag") || "").trim().toUpperCase();
  if (!tag) return new Response(JSON.stringify({ error: "missing tag" }), { status: 400 });

  tag = tag.replace(/O/g, "0");
  if (!tag.startsWith("#")) tag = "#" + tag;
  const encoded = encodeURIComponent(tag);

  const r = await fetch(`https://proxy.royaleapi.dev/v1/players/${encoded}/battlelog`, {
    headers: { Authorization: `Bearer ${env.CR_TOKEN}` },
  });

  const body = await r.text();
  return new Response(body, { status: r.status, headers: { "content-type": "application/json" } });
}
