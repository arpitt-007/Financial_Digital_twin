import type { BackendProfile } from "@/services/types";

export interface HealthScore {
  score: number;
  label: string;
}

export interface Insight {
  headline: string;
  detail: string;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const money = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

function metrics(p: BackendProfile) {
  const income = p.monthly_income;
  const surplus = income - p.monthly_expenses;
  return {
    surplus,
    savingsRate: income > 0 ? surplus / income : 0,
    emergencyMonths: p.monthly_expenses > 0 ? p.cash_savings / p.monthly_expenses : 0,
    debtToAnnualIncome: income > 0 ? p.existing_debt / (income * 12) : p.existing_debt > 0 ? 1 : 0,
    investRate: income > 0 ? p.monthly_investment / income : 0,
  };
}

// 0-100: cash-flow margin (30) + emergency buffer (30) + debt load (25) + investing habit (15).
export function computeHealthScore(p: BackendProfile): HealthScore {
  const m = metrics(p);

  const cashflow = clamp(m.savingsRate / 0.3, 0, 1) * 30;
  const buffer = clamp(m.emergencyMonths / 6, 0, 1) * 30;
  const debt = (1 - clamp(m.debtToAnnualIncome, 0, 1)) * 25;
  const investing = clamp(m.investRate / 0.15, 0, 1) * 15;

  const score = Math.round(cashflow + buffer + debt + investing);
  const label =
    score >= 80
      ? "Strong & Resilient"
      : score >= 60
        ? "Steady & Resilient"
        : score >= 40
          ? "Needs Attention"
          : "Under Pressure";

  return { score, label };
}

// Picks the single most notable thing about the user's finances.
export function computeInsight(p: BackendProfile): Insight {
  const m = metrics(p);

  if (m.surplus < 0) {
    return {
      headline: `You're spending ${money(-m.surplus)} more than you earn each month.`,
      detail: "Trimming expenses or raising income is the fastest way to stabilise your twin.",
    };
  }
  if (m.emergencyMonths < 3) {
    return {
      headline: `Your emergency buffer covers only ${m.emergencyMonths.toFixed(1)} months.`,
      detail: "Aim for 3–6 months of expenses in cash before taking on new commitments.",
    };
  }
  if (m.debtToAnnualIncome > 0.5) {
    return {
      headline: `Your debt equals ${(m.debtToAnnualIncome * 12).toFixed(1)} months of income.`,
      detail: "Simulate a lower-cost loan or extra repayments to see how quickly it falls.",
    };
  }
  if (m.savingsRate >= 0.3) {
    return {
      headline: `You keep ${(m.savingsRate * 100).toFixed(0)}% of your income each month.`,
      detail: `A ${money(m.surplus)} surplus gives you room to invest more — try simulating it.`,
    };
  }
  if (m.investRate < 0.1) {
    return {
      headline: `You invest ${(m.investRate * 100).toFixed(0)}% of your income.`,
      detail: "Raising your monthly contribution could meaningfully change your 5-year outlook.",
    };
  }
  return {
    headline: `Your monthly surplus is ${money(m.surplus)}.`,
    detail: `Emergency buffer covers ${m.emergencyMonths.toFixed(1)} months of expenses.`,
  };
}
