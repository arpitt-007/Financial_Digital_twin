import * as React from "react";
import type { ViewKey } from "@/types";
import { scenarios } from "@/data/scenarios";
import {
  ApiError,
  deleteHistory,
  getHistory,
  getMe,
  getProfile,
  getToken,
  login as apiLogin,
  runSimulation,
  saveHistory,
  setToken,
  setUnauthorizedHandler,
  signup as apiSignup,
  updateProfile,
} from "@/services/api";
import type {
  AuthResponse,
  BackendProfile,
  HistoryRecord,
  ProfileUpdatePayload,
  Scenario,
  SimulationAssumptions,
  SimulationResponse,
  User,
} from "@/services/types";

export interface SimulationMeta {
  scenarioKey: string;
  title: string;
  kicker: string;
  legend: string;
  rateLabel: string;
  rateValue: string;
  chain: string[];
}

export interface SimHistoryEntry {
  id: number;
  date: string;
  response: SimulationResponse;
  meta: SimulationMeta;
}

function toEntry(record: HistoryRecord): SimHistoryEntry {
  return {
    id: record.id,
    date: new Date(record.created_at + (record.created_at.endsWith("Z") ? "" : "Z")).toLocaleString(
      "en-IN",
      { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }
    ),
    response: record.response,
    meta: record.meta as unknown as SimulationMeta,
  };
}

// Placeholder shown before a profile exists; never sent to the backend.
const emptyProfile: BackendProfile = {
  id: 0,
  monthly_income: 0,
  monthly_expenses: 0,
  cash_savings: 0,
  investments: 0,
  monthly_investment: 0,
  existing_debt: 0,
  debt_interest_rate: 0,
  monthly_debt_payment: 0,
  financial_goal: null,
  created_at: "",
  updated_at: "",
};

interface AppStateShape {
  view: ViewKey;
  go: (v: ViewKey) => void;
  user: User | null;
  authLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  hasProfile: boolean;
  completeOnboarding: (payload: ProfileUpdatePayload) => Promise<void>;
  onboardingError: string | null;
  profile: BackendProfile;
  goalName: string;
  setGoalName: (name: string) => void;
  currentScenarioKey: string;
  openScenario: (key: string) => void;
  runScenarioSimulation: (
    scenarioKey: string,
    scenario: Scenario,
    assumptionsOverride?: Partial<SimulationAssumptions>
  ) => Promise<void>;
  simulationError: string | null;
  lastSimulation: { response: SimulationResponse; meta: SimulationMeta } | null;
  simHistory: SimHistoryEntry[];
  saveCurrentToHistory: () => Promise<void>;
  removeHistoryEntry: (id: number) => Promise<void>;
  openResultsFromHistory: (id: number) => void;
}

const AppContext = React.createContext<AppStateShape | null>(null);

function scenarioMeta(scenarioKey: string): Omit<SimulationMeta, "scenarioKey"> {
  const def = scenarios[scenarioKey];
  if (def) {
    return {
      title: def.title,
      kicker: def.kicker,
      legend: def.legend,
      rateLabel: def.rateLabel,
      rateValue: def.rateValue,
      chain: [],
    };
  }
  return {
    title: "Your what-if scenario",
    kicker: "WHAT-IF SCENARIO",
    legend: "With this change",
    rateLabel: "Scenario",
    rateValue: "—",
    chain: [],
  };
}

function buildChain(scenario: Scenario, response: SimulationResponse): string[] {
  const diff = response.comparison?.net_worth_difference ?? 0;
  const fmt = (n: number) => "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");
  const resultLine =
    diff >= 0
      ? `Result: a <b>higher projected net worth</b> — about <b>${fmt(diff)} more</b> than staying the course.`
      : `Result: a <b>lower projected net worth</b> — about <b>${fmt(diff)} less</b> than staying the course.`;

  if (scenario.type === "loan") {
    return [
      `A <b>${fmt(scenario.amount)} loan</b> at ${scenario.interest_rate}% adds a new monthly obligation.`,
      `That EMI runs for <b>${scenario.duration_months} months</b>, cutting into your monthly surplus.`,
      `Less surplus means <b>slower compounding</b> in your investments over the projection.`,
      resultLine,
    ];
  }

  if (scenario.type === "investment_change") {
    return [
      `Your monthly investment contribution changes to <b>${fmt(scenario.new_monthly_contribution)}</b>.`,
      `That money compounds at the assumed annual return instead of sitting in cash.`,
      resultLine,
    ];
  }

  if (scenario.type === "purchase") {
    return [
      `A <b>${fmt(scenario.price)} purchase</b> is funded with ${fmt(scenario.down_payment)} down` +
        (scenario.financed_amount > 0 ? ` and ${fmt(scenario.financed_amount)} financed.` : "."),
      `Your investment capacity shrinks while any financing is repaid.`,
      resultLine,
    ];
  }

  if (scenario.type === "income_change" || scenario.type === "expense_change") {
    const kind = scenario.type === "income_change" ? "income" : "expenses";
    const delta =
      scenario.amount != null ? fmt(scenario.amount) : `${scenario.percentage}%`;
    return [
      `Your monthly ${kind} change by <b>${delta}</b> starting month ${scenario.start_month ?? 1}.`,
      `That shifts your monthly surplus for the rest of the projection.`,
      resultLine,
    ];
  }

  if (scenario.type === "income_loss") {
    return [
      `Income drops by <b>${scenario.income_reduction}%</b> for <b>${scenario.duration_months} months</b>.`,
      `Your surplus shrinks or turns negative, drawing down cash savings.`,
      resultLine,
    ];
  }

  return [resultLine];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = React.useState<ViewKey>("login");
  const [user, setUser] = React.useState<User | null>(null);
  const [authLoading, setAuthLoading] = React.useState(() => getToken() !== null);
  const [hasProfile, setHasProfile] = React.useState(false);
  const [onboardingError, setOnboardingError] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<BackendProfile>(emptyProfile);
  const [goalName, setGoalName] = React.useState("Buy a home");
  const [currentScenarioKey, setCurrentScenarioKey] = React.useState<string>("loan");
  const [simulationError, setSimulationError] = React.useState<string | null>(null);
  const [lastSimulation, setLastSimulation] = React.useState<AppStateShape["lastSimulation"]>(null);
  const [simHistory, setSimHistory] = React.useState<SimHistoryEntry[]>([]);

  const go = React.useCallback((v: ViewKey) => {
    setView(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const logout = React.useCallback(() => {
    setToken(null);
    setUser(null);
    setHasProfile(false);
    setProfile(emptyProfile);
    setSimHistory([]);
    setLastSimulation(null);
    setOnboardingError(null);
    setSimulationError(null);
    setView("login");
  }, []);

  // Load the signed-in user's profile + saved history and pick the landing view.
  const hydrate = React.useCallback(async () => {
    const [loadedProfile, records] = await Promise.all([getProfile(), getHistory()]);
    setSimHistory(records.map(toEntry));
    if (loadedProfile) {
      setProfile(loadedProfile);
      setHasProfile(true);
      setView("home");
    } else {
      setHasProfile(false);
      setView("onboarding");
    }
  }, []);

  React.useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  React.useEffect(() => {
    if (getToken() === null) return;
    let cancelled = false;

    (async () => {
      try {
        const me = await getMe();
        if (cancelled) return;
        setUser(me);
        await hydrate();
      } catch (error) {
        // An expired/invalid token is handled by the 401 handler; anything else
        // (backend down) just returns the user to the login screen.
        if (!(error instanceof ApiError && error.status === 401)) logout();
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrate, logout]);

  const startSession = React.useCallback(
    async (auth: AuthResponse) => {
      setToken(auth.access_token);
      setUser(auth.user);
      await hydrate();
    },
    [hydrate]
  );

  const login = React.useCallback(
    async (email: string, password: string) => {
      await startSession(await apiLogin(email, password));
    },
    [startSession]
  );

  const signup = React.useCallback(
    async (email: string, name: string, password: string) => {
      await startSession(await apiSignup(email, name, password));
    },
    [startSession]
  );

  const completeOnboarding = React.useCallback(
    async (payload: ProfileUpdatePayload) => {
      setOnboardingError(null);
      try {
        const saved = await updateProfile(payload);
        setProfile(saved);
        setHasProfile(true);
        go("home");
      } catch (error) {
        setOnboardingError(
          error instanceof Error ? error.message : "Could not save your profile."
        );
      }
    },
    [go]
  );

  const openScenario = React.useCallback(
    (key: string) => {
      setSimulationError(null);
      setCurrentScenarioKey(key);
      go("scenario");
    },
    [go]
  );

  const runScenarioSimulation = React.useCallback(
    async (
      scenarioKey: string,
      scenario: Scenario,
      assumptionsOverride?: Partial<SimulationAssumptions>
    ) => {
      setSimulationError(null);
      setCurrentScenarioKey(scenarioKey);
      go("loading");

      try {
        const response = await runSimulation({
          projection_months: 60,
          assumptions: assumptionsOverride,
          scenario,
        });

        const meta: SimulationMeta = {
          scenarioKey,
          ...scenarioMeta(scenarioKey),
          chain: buildChain(scenario, response),
        };

        setLastSimulation({ response, meta });
        go("results");
      } catch (error) {
        setSimulationError(
          error instanceof Error ? error.message : "Simulation failed."
        );
        go("scenario");
      }
    },
    [go]
  );

  const saveCurrentToHistory = React.useCallback(async () => {
    if (!lastSimulation) return;
    const { response, meta } = lastSimulation;
    const record = await saveHistory({
      scenario_key: meta.scenarioKey,
      title: meta.title,
      meta: meta as unknown as Record<string, unknown>,
      response,
      net_worth_difference: response.comparison?.net_worth_difference ?? 0,
    });
    setSimHistory((prev) => [toEntry(record), ...prev]);
  }, [lastSimulation]);

  const removeHistoryEntry = React.useCallback(async (id: number) => {
    await deleteHistory(id);
    setSimHistory((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const openResultsFromHistory = React.useCallback(
    (id: number) => {
      const entry = simHistory.find((h) => h.id === id);
      if (!entry) return;
      setLastSimulation({ response: entry.response, meta: entry.meta });
      setCurrentScenarioKey(entry.meta.scenarioKey);
      go("results");
    },
    [simHistory, go]
  );

  const value: AppStateShape = {
    view,
    go,
    user,
    authLoading,
    login,
    signup,
    logout,
    hasProfile,
    completeOnboarding,
    onboardingError,
    profile,
    goalName,
    setGoalName,
    currentScenarioKey,
    openScenario,
    runScenarioSimulation,
    simulationError,
    lastSimulation,
    simHistory,
    saveCurrentToHistory,
    removeHistoryEntry,
    openResultsFromHistory,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}
