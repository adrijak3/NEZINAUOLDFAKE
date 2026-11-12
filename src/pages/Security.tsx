import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Factor = { id: string; friendly_name?: string | null };

export function MfaGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [needsCode, setNeedsCode] = useState(false);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!user) { if (active) { setNeedsCode(false); setChecking(false); } return; }
      const { data: levels, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (error) { setNeedsCode(true); setChecking(false); toast.error("Nepavyko patikrinti prisijungimo saugumo."); return; }
      const required = levels.currentLevel === "aal1" && levels.nextLevel === "aal2";
      if (required) {
        const listed = await supabase.auth.mfa.listFactors();
        if (!active) return;
        setFactors(listed.data?.totp?.filter((f) => f.status === "verified") ?? []);
      }
      setNeedsCode(required);
      setChecking(false);
    };
    setChecking(true);
    void check();
    return () => { active = false; };
  }, [user?.id]);

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) { toast.error("Įveskite 6 skaitmenų kodą."); return; }
    const factor = factors[0];
    if (!factor) { toast.error("Nepavyko rasti patvirtinto autentifikatoriaus."); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (error || !data) { toast.error(error?.message ?? "Nepavyko pradėti patikros"); setBusy(false); return; }
    const result = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: data.id, code });
    setBusy(false);
    if (result.error) { toast.error("Neteisingas arba pasibaigęs kodas."); return; }
    setCode("");
    setNeedsCode(false);
  };

  if (loading || checking) return <div className="container py-16 text-center">Tikrinamas prisijungimas…</div>;
  if (!needsCode) return <>{children}</>;
  return (
    <main className="container max-w-md py-16 space-y-5">
      <h1 className="font-display text-3xl text-gold">Patvirtinkite prisijungimą</h1>
      <p className="text-sm text-muted-foreground">Įveskite kodą iš autentifikatoriaus programėlės. Be jo paskyra nebus atidaryta.</p>
      <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      <Button variant="gold" className="w-full" onClick={verify} disabled={busy || code.length !== 6}>{busy ? "Tikrinama…" : "Patvirtinti"}</Button>
      <Button variant="ghost" className="w-full" onClick={() => void supabase.auth.signOut({ scope: "local" })}>Atsijungti</Button>
    </main>
  );
}

type LoginSession = { session_id: string; created_at: string; last_active_at: string; user_agent: string | null; ip_address: string | null };

function deviceLabel(ua: string | null) {
  if (!ua) return "Nežinomas įrenginys";
  const device = /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Macintosh|Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "Įrenginys";
  const browser = /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) ? "Opera" : /Firefox\//i.test(ua) ? "Firefox" : /Chrome\//i.test(ua) ? "Chrome" : /Safari\//i.test(ua) ? "Safari" : "Naršyklė";
  return `${device} · ${browser}`;
}

export default function Security() {
  const { user } = useAuth();
  const [factor, setFactor] = useState<Factor | null>(null);
  const [pending, setPending] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [sessionsError, setSessionsError] = useState(false);
  const loadSessions = async () => {
    const { data, error } = await (supabase as any).rpc("list_my_auth_sessions");
    setSessionsError(Boolean(error));
    if (!error) setSessions((data ?? []) as LoginSession[]);
  };

  const load = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) { toast.error(error.message); return; }
    setFactor(data?.totp?.find((f) => f.status === "verified") ?? null);
  };
  useEffect(() => { if (user) { void load(); void loadSessions(); } }, [user?.id]);

  const enroll = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Equus autentifikatorius" });
    setBusy(false);
    if (error || !data?.totp) { toast.error(error?.message ?? "Nepavyko įjungti"); return; }
    setPending({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const activate = async () => {
    if (!pending || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.challenge({ factorId: pending.id });
    if (error || !data) { toast.error(error?.message ?? "Klaida"); setBusy(false); return; }
    const result = await supabase.auth.mfa.verify({ factorId: pending.id, challengeId: data.id, code });
    setBusy(false);
    if (result.error) { toast.error("Kodas neteisingas"); return; }
    setPending(null); setCode(""); await load();
    toast.success("Autentifikatorius įjungtas!");
  };

  const disable = async () => {
    if (!factor || !confirm("Išjungti autentifikatoriaus patvirtinimą?")) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setFactor(null); toast.success("Autentifikatorius išjungtas");
  };

  const logoutOthers = async () => {
    if (!confirm("Atsijungti visuose kituose įrenginiuose?")) return;
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) toast.error(error.message);
    else { toast.success("Kitų įrenginių sesijos atšauktos. Galiojantys prieigos žetonai gali veikti iki jų galiojimo pabaigos."); void loadSessions(); }
  };

  return <div className="container max-w-2xl py-10 space-y-8">
    <header><p className="text-xs uppercase tracking-widest text-muted-foreground">Mano paskyra</p><h1 className="text-4xl font-display text-gradient-gold">Saugumas</h1></header>
    <section className="rounded-lg bg-gradient-card border border-gold/15 p-5 space-y-4">
      <h2 className="text-xl font-display text-gold">Autentifikatoriaus kodai (2FA)</h2>
      <p className="text-sm text-muted-foreground">Neprivaloma visiems. Įjungus reikės 6 skaitmenų kodo iš Google Authenticator, Microsoft Authenticator ar kitos TOTP programėlės naujo prisijungimo metu.</p>
      {factor ? <><p className="text-sm text-gold">Įjungta ✓</p><Button variant="outlineGold" disabled={busy} onClick={disable}>Išjungti 2FA</Button></> :
       pending ? <div className="space-y-3">
         <p className="text-sm">Nuskaitykite QR kodą programėle arba įveskite raktą rankiniu būdu.</p>
         <img src={pending.qr} alt="Autentifikatoriaus QR kodas" className="bg-white p-2 rounded max-w-[220px]" />
         <details className="text-sm"><summary>Rodyti rankinį raktą</summary><code className="break-all">{pending.secret}</code></details>
         <Input value={code} maxLength={6} inputMode="numeric" autoComplete="one-time-code" placeholder="6 skaitmenų kodas" onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
         <div className="flex gap-2"><Button variant="gold" disabled={busy || code.length !== 6} onClick={activate}>Patvirtinti ir įjungti</Button><Button variant="ghost" onClick={async () => { await supabase.auth.mfa.unenroll({ factorId: pending.id }); setPending(null); }}>Atšaukti</Button></div>
       </div> : <Button variant="gold" disabled={busy} onClick={enroll}>Įjungti autentifikatorių</Button>}
    </section>
    <section className="rounded-lg bg-gradient-card border border-gold/15 p-5 space-y-4">
      <h2 className="text-xl font-display text-gold">Prisijungimo sesijos</h2>
      <p className="text-sm text-muted-foreground">Dabartinis įrenginys: {navigator.userAgent.includes("Mobile") ? "telefonas" : "kompiuteris / naršyklė"} (ši sesija).</p>
      {sessionsError ? <p className="text-sm text-destructive">Nepavyko gauti prisijungimų sąrašo.</p> : <ul className="divide-y divide-gold/10">{sessions.map((entry) => <li key={entry.session_id} className="py-3 space-y-1"><div className="text-sm font-medium">{deviceLabel(entry.user_agent)}</div><div className="text-xs text-muted-foreground">Paskutinį kartą aktyvus: {new Date(entry.last_active_at).toLocaleString("lt-LT")}</div><div className="text-xs text-muted-foreground">IP: {entry.ip_address ?? "Nenurodytas"} · Prisijungta: {new Date(entry.created_at).toLocaleString("lt-LT")}</div></li>)}</ul>}
      <p className="text-xs text-muted-foreground">Įrenginio pavadinimas nustatomas pagal naršyklę; IP nėra tiksli geografinė vieta. Istoriškai pasibaigusios sesijos nerodomos.</p>
      <Button variant="outlineGold" onClick={() => void loadSessions()}>Atnaujinti sąrašą</Button>
      <Button variant="outlineGold" onClick={logoutOthers}>Atsijungti kituose įrenginiuose</Button>
    </section>
    <p className="text-xs text-muted-foreground">Naujo įrenginio patvirtinimas el. paštu bus atskiras funkcionalumas. 2FA nėra tas pats, kas naujo įrenginio aptikimas.</p>
  </div>;
}
