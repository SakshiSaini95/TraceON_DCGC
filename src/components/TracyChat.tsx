
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

type MountedWebchat = {
  open: () => void;
  close: () => void;
  destroy: () => void;
};

declare global {
  interface Window {
    VdkEdgeWebchat?: {
      mount: (config: Record<string, unknown>) => Promise<MountedWebchat>;
    };
  }
}

const BOT_ID = import.meta.env.VITE_BOTPRESS_BOT_ID as string | undefined;
const BASE_URL =
  (import.meta.env.VITE_BOTPRESS_CHAT_URL as string | undefined) ||
  'https://vdk-viber-runtime-prod.bot.botpress.host';
const EDGE_URL = `${BASE_URL.replace(/\/$/, '')}/edge`;
const SCRIPT_URL = `${EDGE_URL}/webchat.js`;
const STYLESHEET_URL = `${EDGE_URL}/webchat.css`;

let scriptLoadPromise: Promise<void> | undefined;

function loadWebchatScript(): Promise<void> {
  if (window.VdkEdgeWebchat) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    const alreadyPresent = Boolean(script);

    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
    }

    script.addEventListener('load', () => {
      if (window.VdkEdgeWebchat) resolve();
      else reject(new Error('Botpress webchat script loaded without exposing its API.'));
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load the Botpress webchat script.')), { once: true });

    if (!alreadyPresent) document.body.appendChild(script);
  }).catch((error: unknown) => {
    scriptLoadPromise = undefined;
    throw error;
  });

  return scriptLoadPromise;
}

export default function TracyChat() {
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const mounted = useRef<MountedWebchat | null>(null);
  const loading = useRef(false);
  const wantOpen = useRef(false);
  const loadGeneration = useRef(0);
  const active = useRef(false);

  const load = useCallback(async () => {
    if (!BOT_ID || loading.current || mounted.current) return;
    loading.current = true;
    const generation = loadGeneration.current;

    try {
      if (!document.querySelector(`link[href="${STYLESHEET_URL}"]`)) {
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = STYLESHEET_URL;
        document.head.appendChild(stylesheet);
      }

      await loadWebchatScript();
      if (generation !== loadGeneration.current) return;

      const response = await fetch(`${EDGE_URL}/bots/${encodeURIComponent(BOT_ID)}/config`);
      if (!response.ok) {
        throw new Error(`Botpress returned ${response.status} while loading the bot configuration.`);
      }
      const config = await response.json() as { webchat?: Record<string, unknown> };
      if (generation !== loadGeneration.current) return;

      const webchat = window.VdkEdgeWebchat;
      if (!webchat) throw new Error('Botpress webchat API is unavailable.');

      const instance = await webchat.mount({
        ...(config.webchat || {}),
        mode: 'bubble',
        baseUrl: BASE_URL,
        botId: BOT_ID,
      });

      if (generation !== loadGeneration.current) {
        instance.destroy();
        return;
      }

      mounted.current = instance;
      if (wantOpen.current) {
        wantOpen.current = false;
        instance.open();
      }
    } catch (error) {
      console.error('[Tracy] Failed to load the chat:', error);
    } finally {
      loading.current = false;
      if (active.current && generation !== loadGeneration.current) void load();
    }
  }, []);

  useEffect(() => {
    if (!BOT_ID) return;

    active.current = true;
    loadGeneration.current += 1;
    void load();

    return () => {
      active.current = false;
      loadGeneration.current += 1;
      wantOpen.current = false;
      mounted.current?.destroy();
      mounted.current = null;
    };
  }, [load]);

  useEffect(() => {
    const syncOpenState = () => {
      const root = document.querySelector('.vdk-edge-mode-bubble');
      setOpen(Boolean(root?.classList.contains('vdk-edge-open')));
    };
    const observer = new MutationObserver(syncOpenState);
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    syncOpenState();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!BOT_ID || sessionStorage.getItem('tracy-nudged')) return;
    const timer = window.setTimeout(() => setNudge(true), 7000);
    return () => window.clearTimeout(timer);
  }, []);

  const openChat = () => {
    setNudge(false);
    sessionStorage.setItem('tracy-nudged', '1');
    wantOpen.current = true;
    setOpen(true);
    if (mounted.current) {
      mounted.current.open();
      wantOpen.current = false;
    } else {
      void load();
    }
  };

  const closeChat = () => {
    wantOpen.current = false;
    mounted.current?.close();
    setOpen(false);
  };

  if (!BOT_ID && !import.meta.env.DEV) return null;

  return (
    <div className={`tracy ${open ? 'tracy-open' : ''}`}>
      {open && (
        <button className="tracy-close-chat" type="button" onClick={closeChat}>
          <X size={18} />
          <span>Close chat</span>
        </button>
      )}
      {nudge && !open && (
        <div className="tracy-nudge" role="status">
          <button
            className="tracy-nudge-close"
            aria-label="Dismiss"
            onClick={() => {
              setNudge(false);
              sessionStorage.setItem('tracy-nudged', '1');
            }}
          >
            <X size={12} />
          </button>
          <strong>Hi, I’m Tracy.</strong> Ask me how to check a seller before you pay.
        </div>
      )}
      {!open && (
        <button className="tracy-launcher" aria-label="Chat with Tracy" onClick={openChat}>
          <span className="tracy-face" aria-hidden="true"><i /><i /></span>
          <span className="tracy-label">ASK TRACY</span>
        </button>
      )}
      {!BOT_ID && import.meta.env.DEV && (
        <div className="tracy-dev">Dev only: set VITE_BOTPRESS_BOT_ID in .env to connect Tracy.</div>
      )}
    </div>
  );
}
