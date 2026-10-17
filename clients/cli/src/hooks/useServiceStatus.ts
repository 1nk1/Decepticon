import { useEffect, useState } from "react";

export type ServiceStatus = "connecting" | "connected" | "disconnected";

export function useServiceStatus(): ServiceStatus {
  const [status, setStatus] = useState<ServiceStatus>("connecting");
  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    let polling = false;
    async function check(): Promise<void> {
      if (polling) return;
      polling = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 3000);
      try {
        const url = (process.env.DECEPTICON_API_URL || "http://localhost:2024").replace(/\/$/, "");
        const response = await fetch(`${url}/ok`, { signal: controller.signal });
        if (!stopped) setStatus(response.ok ? "connected" : "disconnected");
      } catch (error: unknown) {
        if (!stopped) setStatus("disconnected");
      } finally {
        clearTimeout(timeout);
        polling = false;
      }
    }
    void check();
    const timer = setInterval(() => void check(), 10000);
    return () => { stopped = true; clearInterval(timer); controller?.abort(); };
  }, []);
  return status;
}
