import { io, type Socket } from "socket.io-client";

const localURL = "http://localhost:3001";
const fallbackURL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;

let socket: Socket | null = null;
let socketPromise: Promise<Socket> | null = null;
let sessionId: string | null = null;

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getOrCreateSessionId(): string | null {
  if (typeof window === "undefined") return null;
  if (sessionId) return sessionId;

  const stored = localStorage.getItem("sessionId");
  if (stored) {
    sessionId = stored;
  } else {
    sessionId = generateSessionId();
    localStorage.setItem("sessionId", sessionId);
  }
  return sessionId;
}

export function getSessionId(): string | null {
  return getOrCreateSessionId();
}

export function clearSessionId(): void {
  sessionId = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("sessionId");
  }
}

export function getSocket() {
  if (socket) return Promise.resolve(socket);

  if (!socketPromise) {
    socketPromise = new Promise<Socket>((resolve, reject) => {
      const clientSessionId = getOrCreateSessionId();
      const isLocalBrowser =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

      const primaryURL = isLocalBrowser ? localURL : fallbackURL;
      const secondaryURL = isLocalBrowser ? fallbackURL : undefined;

      if (!primaryURL) {
        reject(new Error("Socket server URL is not configured."));
        return;
      }

      const primarySocket = io(primaryURL, {
        timeout: 5000,
        reconnection: false,
        query: { sessionId: clientSessionId },
      });

      primarySocket.on("connect", () => {
        socket = primarySocket;
        resolve(primarySocket);
      });

      primarySocket.on("connect_error", () => {
        primarySocket.disconnect();

        if (!secondaryURL) {
          reject(new Error("Socket connection failed and no fallback URL is set."));
          return;
        }

        const fallbackSocket = io(secondaryURL, {
          timeout: 5000,
          reconnection: false,
          query: { sessionId: clientSessionId },
        });

        fallbackSocket.on("connect", () => {
          socket = fallbackSocket;
          resolve(fallbackSocket);
        });

        fallbackSocket.on("connect_error", (error) => {
          reject(error);
        });
      });
    });
  }

  return socketPromise;
}

export async function sendmessage<T = unknown>(event: string, data: unknown): Promise<T> {
  const socket = await getSocket();
  const requestId = crypto.randomUUID();

  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      socket.off("api-response", handleResponse);
      reject(new Error("Request timed out"));
    }, 10000);

    const handleResponse = (response: { requestId: string; success: boolean; data?: T; error?: string }) => {
      if (response.requestId !== requestId) return;

      window.clearTimeout(timeout);
      socket.off("api-response", handleResponse);

      if (response.success) {
        resolve(response.data as T);
      } else {
        reject(new Error(response.error || "Unknown server error"));
      }
    };

    socket.on("api-response", handleResponse);
    socket.emit("api", event, data, requestId);
  });
}