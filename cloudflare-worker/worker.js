// Hayye Market — Sabit Cloudflare Worker Yönlendiricisi (Ücretsiz *.workers.dev)
// Kurulum (60 sn):
// 1. Cloudflare Dashboard -> Workers & Pages -> Create Worker -> bu kodu yapıştır.
// 2. Settings -> Bindings -> KV Namespace ekle (Variable name: HAYYE_KV).
// 3. Settings -> Variables and Secrets -> HAYYE_KEY (kendi belirlediğin gizli parola).
// 4. Hayye Market Ayarlar'a Worker URL'ni (örn. https://hayye-market.<ad>.workers.dev) ve HAYYE_KEY'i gir.
// 5. iPhone/iPad Safari'de https://hayye-market.<ad>.workers.dev/app aç -> Ana Ekrana Ekle (hep sabit kalır!).

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Hayye Market masaüstü uygulaması her açıldığında güncel tünel adresini buraya yazar
    if (url.pathname === "/_hayye/set" && request.method === "POST") {
      const key = request.headers.get("x-hayye-key") || "";
      if (!env.HAYYE_KEY || key !== env.HAYYE_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }
      const body = await request.json().catch(() => ({}));
      if (!body.target || !String(body.target).startsWith("https://")) {
        return new Response("Invalid target", { status: 400 });
      }
      await env.HAYYE_KV.put("target", String(body.target).replace(/\/$/, ""));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    }

    const target = await env.HAYYE_KV.get("target");
    if (!target) {
      return new Response(
        "Hayye Market PC uygulaması şu an kapalı veya tünel henüz bağlanmadı.",
        { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    }

    const upstream = target + url.pathname + url.search;
    const proxied = new Request(upstream, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "follow",
    });
    return fetch(proxied);
  },
};
