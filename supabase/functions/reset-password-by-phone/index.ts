// Deprecated: phone number is not proof of account ownership.
// Keep this endpoint disabled on any future redeploy.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((request) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  return new Response(JSON.stringify({
    error: "Telefono numeriu slaptažodžio atkurti nebegalima. Naudokite el. pašto atkūrimo nuorodą.",
  }), { status: 410, headers });
});
