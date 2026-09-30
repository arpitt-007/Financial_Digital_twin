import type {
  AuthResponse,
  BackendProfile,
  HistoryCreatePayload,
  HistoryRecord,
  ProfileUpdatePayload,
  ScenarioParseResult,
  SimulationRequest,
  SimulationResponse,
  User,
} from "@/services/types";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const TOKEN_KEY = "twin.token";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable; session just won't persist
  }
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  options: { auth?: boolean } = {}
): Promise<T> {
  const { auth = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });

  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && auth && token) onUnauthorized?.();

    let detail = `Request failed (${response.status})`;
    if (data && typeof data === "object" && "detail" in data) {
      const raw = (data as { detail: unknown }).detail;
      detail =
        typeof raw === "string"
          ? raw
          : Array.isArray(raw)
            ? raw.map((e) => (e as { msg?: string }).msg ?? "Invalid input").join(" ")
            : detail;
    }
    throw new ApiError(detail, response.status);
  }

  return data as T;
}

export function signup(email: string, name: string, password: string) {
  return request<AuthResponse>(
    "/auth/signup",
    { method: "POST", body: JSON.stringify({ email, name, password }) },
    { auth: false }
  );
}

export function login(email: string, password: string) {
  return request<AuthResponse>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
    { auth: false }
  );
}

export function getMe() {
  return request<User>("/auth/me");
}

export async function getProfile(): Promise<BackendProfile | null> {
  try {
    return await request<BackendProfile>("/profile");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function updateProfile(payload: ProfileUpdatePayload) {
  return request<BackendProfile>("/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function parseScenario(query: string) {
  return request<ScenarioParseResult>("/scenario/parse", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

export function runSimulation(payload: SimulationRequest) {
  return request<SimulationResponse>("/simulate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getHistory() {
  return request<HistoryRecord[]>("/history");
}

export function saveHistory(payload: HistoryCreatePayload) {
  return request<HistoryRecord>("/history", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteHistory(id: number) {
  return request<null>(`/history/${id}`, { method: "DELETE" });
}
