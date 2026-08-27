import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/i18n";
import { fetchRiskPrediction } from "@/lib/mock-api";
import type { RiskPrediction } from "@/lib/types";
import {
  AlertCircle,
  Zap,
  Brain,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface RiskAssessmentProps {
  caseMasterId: number;
}

const getRiskColor = (level: "low" | "medium" | "high") => {
  switch (level) {
    case "low":
      return "bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-400";
    case "medium":
      return "bg-amber-500/[0.06] border-amber-500/20 text-amber-400";
    case "high":
      return "bg-[var(--danger)]/[0.06] border-[var(--danger)]/20 text-[var(--danger)]";
  }
};

const getRiskBadgeColor = (level: "low" | "medium" | "high") => {
  switch (level) {
    case "low":
      return "bg-emerald-500/10 text-emerald-400";
    case "medium":
      return "bg-amber-500/10 text-amber-400";
    case "high":
      return "bg-[var(--danger)]/10 text-[var(--danger)]";
  }
};

const getRiskIcon = (level: "low" | "medium" | "high") => {
  switch (level) {
    case "low":
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case "medium":
      return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    case "high":
      return <AlertCircle className="w-5 h-5 text-[var(--danger)]" />;
  }
};

export function RiskAssessment({ caseMasterId }: RiskAssessmentProps) {
  const { locale } = useLanguage();
  const [prediction, setPrediction] = useState<RiskPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRiskPrediction(caseMasterId)
      .then((data) => {
        if (!cancelled) setPrediction(data);
      })
      .catch((err) => {
        console.error("Risk prediction fetch failed:", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to fetch");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseMasterId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-pulse rounded-full bg-muted-foreground/30" />
          <span className="text-sm text-muted-foreground">
            {t("risk_loading", locale)}
          </span>
        </div>
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <span className="text-sm text-muted-foreground">
          {t("risk_unavailable", locale)}
        </span>
      </div>
    );
  }

  const highestScore = Math.max(...Object.values(prediction.scores));
  const confidencePercent = Math.round(highestScore);

  return (
    <div
      className={`p-4 rounded-lg border-2 ${getRiskColor(prediction.risk_class)}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {getRiskIcon(prediction.risk_class)}
          <div>
            <h3 className="font-semibold text-sm">
              {t("risk_assessment_title", locale)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("risk_model_name", locale)}: {prediction.model_name}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${getRiskBadgeColor(prediction.risk_class)}`}>
            {t(prediction.risk_class === "high" ? "risk_level_high" : prediction.risk_class === "medium" ? "risk_level_medium" : "risk_level_low", locale)}
          </div>
        </div>
      </div>

      {/* Confidence Score */}
      <div className="mb-3 p-2 bg-background/40 rounded">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium">{t("risk_confidence", locale)}</span>
          <span className="text-sm font-bold">{confidencePercent}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className={`h-2 rounded-full transition-all ${
              prediction.risk_class === "high"
                ? "bg-[var(--danger)]"
                : prediction.risk_class === "medium"
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            }`}
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      {/* Prediction Breakdown */}
      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        {Object.entries(prediction.scores).map(([label, score]) => (
          <div key={label} className="bg-background/40 p-2 rounded text-center">
            <div className="font-medium">{t(label === "high" ? "risk_level_high" : label === "medium" ? "risk_level_medium" : "risk_level_low", locale)}</div>
            <div className="text-sm font-bold">{Math.round(score as number)}%</div>
          </div>
        ))}
      </div>

      {/* Source Attribution */}
      <div className="mb-3 flex items-center gap-2 text-xs">
        {prediction.source === "quickml_pipeline" ? (
          <>
            <Brain className="w-4 h-4" />
            <span>
              {t("risk_source_quickml", locale)}
              {prediction.model_id && ` (ID: ${prediction.model_id})`}
            </span>
          </>
        ) : (
          <>
            <Zap className="w-4 h-4" />
            <span>{t("risk_source_fallback", locale)}</span>
          </>
        )}
      </div>

      {/* Feature Signals */}
      <div className="mb-3 p-2 bg-background/40 rounded">
        <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          {t("risk_contributing_factors", locale)}
        </h4>
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span>{t("risk_gravity_level", locale)}</span>
            <span className="font-medium">{prediction.features.gravity_level}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("risk_repeat_accused", locale)}</span>
            <span className="font-medium">{prediction.features.repeat_accused_count}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("risk_accused_count", locale)}</span>
            <span className="font-medium">{prediction.features.accused_count}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("risk_arrest_rate", locale)}</span>
            <span className="font-medium">{prediction.features.arrest_rate_percent}%</span>
          </div>
          <div className="flex justify-between">
            <span>{t("risk_station_volume", locale)}</span>
            <span className="font-medium">{prediction.features.station_case_volume}</span>
          </div>
        </div>
      </div>

      {/* Advisory Disclaimer */}
      <div className="p-2 bg-background/40 rounded">
        <p className="text-xs font-medium italic">{prediction.advisory}</p>
      </div>
    </div>
  );
}
