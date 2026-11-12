import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8 || password !== repeat) {
      toast.error("Slaptažodžiai turi sutapti ir būti bent 8 simbolių.");
      return;
    }
    setBusy(true);
    // Password recovery links must establish a valid Supabase Auth session.
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !user) {
      setBusy(false);
      toast.error("Atkūrimo nuoroda nebegalioja. Paprašykite naujos.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Slaptažodis atnaujintas.");
    navigate("/paskyra");
  };
  return <main className="container max-w-md py-16 space-y-6">
    <h1 className="font-display text-4xl text-gradient-gold">Atkurti slaptažodį</h1>
    <p className="text-sm text-muted-foreground">Atidarykite tik iš savo el. paštu gautos atkūrimo nuorodos.</p>
    <form className="space-y-4" onSubmit={submit}>
      <Input aria-label="Naujas slaptažodis" type="password" autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Naujas slaptažodis" required />
      <Input aria-label="Pakartokite slaptažodį" type="password" autoComplete="new-password" minLength={8} value={repeat} onChange={e => setRepeat(e.target.value)} placeholder="Pakartokite slaptažodį" required />
      <Button variant="gold" type="submit" className="w-full" disabled={busy}>{busy ? "Keičiama…" : "Išsaugoti slaptažodį"}</Button>
    </form>
  </main>;
}
