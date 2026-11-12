import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
let scriptPromise: Promise<void> | undefined;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => window.turnstile ? resolve() : reject(new Error("Turnstile API not available"));
      script.onerror = () => reject(new Error("Turnstile script failed"));
      document.head.appendChild(script);
    }).catch((error) => { scriptPromise = undefined; throw error; });
  }
  return scriptPromise;
}

export function TurnstileChallenge({ onToken, resetKey }: {
  onToken: (token: string | null) => void;
  resetKey: number;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let active = true;
    if (!SITE_KEY) {
      onTokenRef.current(null);
      return;
    }
    loadTurnstile().then(() => {
      if (!active || !mount.current || !window.turnstile) return;
      widget.current = window.turnstile.render(mount.current, {
        sitekey: SITE_KEY,
        theme: "auto",
        language: "lt",
        callback: (token: string) => onTokenRef.current(token),
        "expired-callback": () => { onTokenRef.current(null); if (widget.current) window.turnstile?.reset(widget.current); },
        "timeout-callback": () => { onTokenRef.current(null); if (widget.current) window.turnstile?.reset(widget.current); },
        "error-callback": () => onTokenRef.current(null),
      });
    }).catch(() => { if (active) onTokenRef.current(null); });
    return () => {
      active = false;
      if (widget.current) {
        window.turnstile?.remove(widget.current);
        widget.current = null;
      }
      onTokenRef.current(null);
    };
  }, []);

  useEffect(() => {
    if (resetKey && widget.current) {
      onTokenRef.current(null);
      window.turnstile?.reset(widget.current);
    }
  }, [resetKey]);

  if (!SITE_KEY) {
    return <p className="text-sm text-destructive" role="alert">Saugumo patikra nesukonfigūruota. Susisiekite su administracija.</p>;
  }
  return <div className="min-h-[65px] flex justify-center" ref={mount} aria-label="Cloudflare saugumo patikra" />;
}
