import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/i18n";
import {
  AlertCircle,
  Zap,
  Brain,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface RiskPrediction {
  case_master_id: number;
  model_id: string;
  model_name: string;
  source: "zia_automl" | "local_fallback";
  risk_class: "low" | "medium" | "high";
  scores: Record<string, number>;
  features: {
    gravity_level: number;
    repeat_accused_count: number;
    accused_count: number;
    arrest_count: number;
    arrest_rate_percent: number;
    station_case_volume: number;
    crime_type_volume: number;
    days_since_latest: number;
  };
  advisory: string;
}

interface RiskAssessmentProps {
  caseMasterId: number;
  apiUrl?: string;
}

const getRiskColor = (level: "low" | "medium" | "high") => {
  switch (level) {
    case "low":
      return "bg-green-50 border-green-200 text-green-900";
    case "medium":
      return "bg-yellow-50 border-yellow-200 text-yellow-900";
    case "high":
      return "bg-red-50 border-red-200 text-red-900";
  }
};

const getRiskBadgeColor = (level: "low" | "medium" | "high") => {
  switch (level) {
    case "low":
      return "bg-green-100 text-green-800";
    case "medium":
      return "bg-yellow-100 text-yellow-800";
    case "high":
      return "bg-red-100 text-red-800";
  }
};

const getRiskIcon = (level: "low" | "medium" | "high") => {
  switch (level) {
    case "low":
      return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    case "medium":
      return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    case "high":
      return <AlertCircle className="w-5 h-5 text-red-600" />;
  }
};

export function RiskAssessment({
  caseMasterId,
  apiUrl = "/api",
}: RiskAssessmentProps) {
  const { locale } = useLanguage();
  const [prediction, setPrediction] = useState<RiskPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRiskPrediction = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${apiUrl}/risk/${caseMasterId}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as RiskPrediction;
        setPrediction(data);
      } catch (err) {
        console.error("Risk prediction fetch failed:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch");
      } finally {
        setLoading(false);
      }
    };

    fetchRiskPrediction();
  }, [caseMasterId, apiUrl]);

  if (loading) {
    return (
      <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-gray-300 animate-pulse" />
          <span className="text-sm text-gray-600">
            {t("risk_loading", locale)}
          </span>
        </div>
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
        <span className="text-sm text-gray-600">
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
            <p className="text-xs opacity-75">
              {t("risk_model_name", locale)}: {prediction.model_name}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${getRiskBadgeColor(prediction.risk_class)}`}>
            {prediction.risk_class.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Confidence Score */}
      <div className="mb-3 p-2 bg-white bg-opacity-50 rounded">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium">{t("risk_confidence", locale)}</span>
          <span className="text-sm font-bold">{confidencePercent}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              prediction.risk_class === "high"
                ? "bg-red-500"
                : prediction.risk_class === "medium"
                  ? "bg-yellow-500"
                  : "bg-green-500"
            }`}
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      {/* Prediction Breakdown */}
      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        {Object.entries(prediction.scores).map(([label, score]) => (
          <div key={label} className="bg-white bg-opacity-50 p-2 rounded text-center">
            <div className="font-medium capitalize">{label}</div>
            <div className="text-sm font-bold">{Math.round(score as number)}%</div>
          </div>
        ))}
      </div>

      {/* Source Attribution */}
      <div className="mb-3 flex items-center gap-2 text-xs">
        {prediction.source === "zia_automl" ? (
          <>
            <Brain className="w-4 h-4" />
            <span>
              {t("risk_source_zia", locale)}
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
      <div className="mb-3 p-2 bg-white bg-opacity-50 rounded">
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
      <div className="p-2 bg-white bg-opacity-50 rounded border-l-2 border-current">
        <p className="text-xs font-medium italic">{prediction.advisory}</p>
      </div>
    </div>
  );
}
