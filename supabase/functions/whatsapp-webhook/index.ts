// Webhook de WhatsApp Cloud API -> Supabase. Multiempresa: el tenant se identifica
// por phone_number_id. Menú dinámico leído de la tabla `services` (columna category).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const VERIFY = Deno.env.get("WA_VERIFY_TOKEN")!;
const APP_SECRET = Deno.env.get("WA_APP_SECRET")!;
const WA_TOKEN = Deno.env.get("WA_ACCESS_TOKEN")!;       // luego: un token por empresa
const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");     // alertas gratuitas (opcional)

async function validSignature(raw: string, header: string | null) {
  if (!header) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = "sha256=" + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === header;
}

async function send(phoneId: string, to: string, body: string) {
  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
}

async function alertOwner(tenant: any, text: string) {
  const chat = tenant.settings?.telegram_chat_id;
  if (!TG_TOKEN || !chat) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  });
}

const NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

async function categories(tenantId: string): Promise<string[]> {
  const { data } = await sb.from("services").select("category,sort").eq("tenant_id", tenantId)
    .eq("active", true).order("sort");
  return [...new Set<string>((data ?? []).map((s: any) => s.category as string))];
}

async function menuText(tenant: any) {
  const cats = await categories(tenant.id);
  const lines = cats.map((c, i) => `${NUM[i]} ${c}`);
  lines.push(`${NUM[cats.length]} Hablar con ${tenant.name}`);
  return `${tenant.settings?.greeting ?? `¡Hola! 👋 Bienvenid@ a ${tenant.name} 💛`}\n\n¿Qué te interesa? Responde con el número:\n\n${lines.join("\n")}`;
}

async function categoryCard(tenant: any, category: string) {
  const { data } = await sb.from("services").select("*").eq("tenant_id", tenant.id)
    .eq("active", true).eq("category", category).order("sort");
  const cur = tenant.currency === "EUR" ? "€" : tenant.currency;
  const items = (data ?? []).map((s: any) =>
    `• *${s.name}: ${s.price} ${cur}*${s.description ? `\n  ${s.description}` : ""}` +
    (s.requires_authorization ? "\n  🩺 Requiere autorización de tu cirujano." : ""));
  return `*${category}*\n\n${items.join("\n\n")}\n\nResponde *RESERVAR* para pedir tu cita, *MENÚ* para volver o *ASESOR* para hablar con ${tenant.name}.`;
}

const HANDOFF_WORDS = /\b(dolor|alergia|reacci[oó]n|embarazada|embarazo|medicaci[oó]n|queja|no me gust[oó]|descuento)\b/i;

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET") {                                   // verificación de Meta
    return url.searchParams.get("hub.verify_token") === VERIFY
      ? new Response(url.searchParams.get("hub.challenge")) : new Response("forbidden", { status: 403 });
  }
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("bad signature", { status: 401 });
  }
  const value = JSON.parse(raw)?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg) return new Response("ok");                          // estados de entrega, etc.

  const phoneId = value.metadata.phone_number_id as string;
  const from = msg.from as string;
  const text: string = (msg.text?.body ?? msg.interactive?.button_reply?.title ?? "").trim();

  const { data: tenant } = await sb.from("tenants").select("*").eq("wa_phone_number_id", phoneId).single();
  if (!tenant) return new Response("unknown tenant");

  // cliente (se crea si no existe) y registro del mensaje
  let { data: client } = await sb.from("clients").select("*")
    .eq("tenant_id", tenant.id).eq("phone", from).maybeSingle();
  if (!client) {
    const ins = await sb.from("clients").insert({
      tenant_id: tenant.id, phone: from,
      name: value.contacts?.[0]?.profile?.name, source: "whatsapp",
    }).select().single();
    client = ins.data;
  }
  await sb.from("messages").insert({ tenant_id: tenant.id, client_id: client?.id, direction: "in", body: text, wa_message_id: msg.id });

  // ¿conversación en manos humanas? el bot se pausa
  const { data: st } = await sb.from("bot_state").select("*").eq("tenant_id", tenant.id).eq("phone", from).maybeSingle();
  if (st?.human_handoff && !/^(menu|menú|inicio|hola)$/i.test(text)) return new Response("ok");

  const setState = (step: string, human = false) =>
    sb.from("bot_state").upsert({ tenant_id: tenant.id, phone: from, step, human_handoff: human, updated_at: new Date().toISOString() });
  const reply = async (body: string) => {
    await send(phoneId, from, body);
    await sb.from("messages").insert({ tenant_id: tenant.id, client_id: client?.id, direction: "out", body });
  };
  const who = `${client?.name ?? "Cliente"} · ${from}`;

  const cats = await categories(tenant.id);
  const t = text.toLowerCase();

  if (HANDOFF_WORDS.test(text) || /^(asesor|humano|yesmin)$/i.test(text) || t === String(cats.length + 1)) {
    await setState("handoff", true);
    await reply("Gracias por escribirme 💛 Esto prefiero atenderlo personalmente. Te respondo en breve.");
    await alertOwner(tenant, `⚠️ Atención personal\n${who}\nMensaje: ${text}`);
  } else if (/^(menu|menú|inicio|hola|buenas?.*)$/i.test(t)) {
    await setState("menu");
    await reply(await menuText(tenant));
  } else if (/^(reservar|cita|agendar)$/i.test(t)) {
    await setState("booking");
    await reply("¡Perfecto! 📅 Cuéntame qué servicio quieres, tu zona y qué días te sirven, y te confirmo el horario enseguida.");
    await alertOwner(tenant, `🔔 Solicitud de cita\n${who}\nUltimo paso: ${st?.step ?? "-"}`);
  } else if (/^[1-9]$/.test(t) && Number(t) <= cats.length) {
    await setState(`cat:${cats[Number(t) - 1]}`);
    await reply(await categoryCard(tenant, cats[Number(t) - 1]));
  } else if (/^baja$/i.test(t)) {
    await sb.from("clients").update({ marketing_consent: false }).eq("id", client!.id);
    await reply("Listo, no recibirás más promociones. 💛");
  } else if (st?.step === "booking") {
    await alertOwner(tenant, `📅 Datos de cita\n${who}\n${text}`);
    await reply("Anotado ✅ Te confirmo en breve.");
  } else {
    await reply("No te entendí 🙈 Escribe *MENÚ* o elige una opción.");
  }
  return new Response("ok");
});
