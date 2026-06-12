"use client";
import { useEffect, useRef } from "react";

// Public OAuth Client ID from Google Cloud Console (safe to expose). We fall
// back to it when NEXT_PUBLIC_GOOGLE_CLIENT_ID isn't in the build env — e.g. on
// Vercel, where .env.local is never present — so the button still renders.
const DEFAULT_CLIENT_ID = "315587208584-cuu3e21ppm52t1a4bioqv4aedp2glpmj.apps.googleusercontent.com";
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID;
const GIS_SRC = "https://accounts.google.com/gsi/client";

// Minimal shape of the Google Identity Services we use.
interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (cfg: { client_id: string; callback: (r: { credential?: string }) => void }) => void;
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
    };
  };
}
declare global {
  interface Window { google?: GoogleIdentity }
}

interface Props {
  onCredential: (credential: string) => void;
  onError?: (message: string) => void;
}

// Renders Google's official "Sign in with Google" button. On success it hands
// back the signed credential (an ID token) for the backend to verify.
export default function GoogleSignInButton({ onCredential, onError }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;

    const init = () => {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp) => {
          if (resp.credential) onCredential(resp.credential);
          else onError?.("Google did not return a sign-in credential.");
        },
      });
      window.google.accounts.id.renderButton(ref.current, {
        type: "standard", theme: "outline", size: "large",
        text: "signin_with", shape: "rectangular", width: 360,
      });
    };

    if (window.google) { init(); return; }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", init);
    return () => script?.removeEventListener("load", init);
  }, [onCredential, onError]);

  // Nothing to show until the Client ID is configured.
  if (!CLIENT_ID) return null;
  return <div ref={ref} className="flex justify-center" />;
}
