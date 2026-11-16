import { createContext, type ReactNode } from "react";
import leuretLogo from "../../../mobile/assets/images/leuret-logo-header.png";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";

export const PanelRefreshContext = createContext(0);

export function BrandMark() {
  return <img className="brand-mark" src={leuretLogo} width={112} height={79} alt="LEURET" />;
}

export function FullScreenLoader({ label }: { label: string }) {
  return (
    <main className="fullscreen-loader">
      <div className="fullscreen-loader-content">
        <BrandMark />
        <ContentLoader label={label} />
      </div>
    </main>
  );
}

export function ContentLoader({ label }: { label: string }) {
  return (
    <div className="content-loader" role="status">
      <Loader2 className="spin" size={24} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function AlertBanner({ message, onClose, onRetry }: {
  message: string;
  onClose?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="alert-banner" role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && <button type="button" className="button button-secondary" onClick={onRetry}>Reintentar</button>}
      {onClose && <button type="button" aria-label="Cerrar aviso" onClick={onClose}><X size={16} /></button>}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return <div className="success-banner" role="status"><CheckCircle2 size={18} aria-hidden="true" /><span>{message}</span></div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function TextField({ label, value, onChange, type = "text", suffix }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "number"; suffix?: string }) {
  return <Field label={label}><div className="suffix-input"><input type={type} step={type === "number" ? "any" : undefined} value={value} onChange={(event) => onChange(event.target.value)} />{suffix && <span>{suffix}</span>}</div></Field>;
}

export function SelectField({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) {
  return <Field label={label}><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></Field>;
}

export function ToggleField({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="toggle-field"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span className="toggle-track"><span /></span><strong>{label}</strong></label>;
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="section-header"><h2>{title}</h2><p>{subtitle}</p></div>;
}

export function Table({ children }: { children: ReactNode }) {
  return <div className="table-wrapper"><table className="data-table">{children}</table></div>;
}

export function EmptyState({ label }: { label: string }) {
  return <div className="empty-state"><CheckCircle2 size={24} /><span>{label}</span></div>;
}
