import {
  Activity, Building2, CircleCheck, ClipboardCheck, ChartNoAxesColumn, EyeOff, FileText, FlaskConical,
  GitCompareArrows, HeartPulse, Hospital, Layers, Lock, Scale, Search, Server, ShieldCheck, Sparkles,
  Stethoscope, TrendingUp, ArrowRight, Menu, X,
} from "lucide-react";

// Explicit map keeps the bundle small: only the icons the landing page uses are imported.
const ICONS = {
  Activity, Building2, CircleCheck, ClipboardCheck, ChartNoAxesColumn, EyeOff, FileText, FlaskConical,
  GitCompareArrows, HeartPulse, Hospital, Layers, Lock, Scale, Search, Server, ShieldCheck, Sparkles,
  Stethoscope, TrendingUp, ArrowRight, Menu, X,
};

export default function Icon({ name, ...props }) {
  const Cmp = ICONS[name] || CircleCheck;
  return <Cmp strokeWidth={1.75} aria-hidden="true" {...props} />;
}
