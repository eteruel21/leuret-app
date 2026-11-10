import type { ReactNode } from "react";
import {
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  DollarSign,
  FileText,
  HardHat,
  LayoutDashboard,
  LogOut,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";

import { TAB_LABELS, type Tab } from "./ops/navigation";

export type { Tab };

interface NavButtonProps {
  icon: ReactNode;
  tab: Tab;
  active: Tab;
  onClick: (tab: Tab) => void;
  badge?: number;
}

function NavButton({ icon, tab, active, onClick, badge }: NavButtonProps) {
  return (
    <button
      className={`nav-item ${active === tab ? "active" : ""}`}
      onClick={() => onClick(tab)}
      aria-current={active === tab ? "page" : undefined}
      title={TAB_LABELS[tab]}
    >
      {icon}
      <span>{TAB_LABELS[tab]}</span>
      {Boolean(badge) && <strong className="nav-badge">{badge}</strong>}
    </button>
  );
}

const GROUPS: Array<{ label: string; items: Array<{ tab: Tab; icon: ReactNode }> }> = [
  {
    label: "General",
    items: [
      { tab: "dashboard", icon: <LayoutDashboard /> },
      { tab: "users", icon: <Users /> },
      { tab: "companies", icon: <Building2 /> },
    ],
  },
  {
    label: "Operación",
    items: [
      { tab: "projects", icon: <HardHat /> },
      { tab: "budgets", icon: <FileText /> },
      { tab: "invoices", icon: <Receipt /> },
      { tab: "clients", icon: <UserRound /> },
    ],
  },
  {
    label: "Configuración",
    items: [
      { tab: "catalog", icon: <BookOpen /> },
      { tab: "calculations", icon: <Calculator /> },
      { tab: "pricing", icon: <DollarSign /> },
    ],
  },
  {
    label: "Control",
    items: [
      { tab: "audit", icon: <ShieldCheck /> },
      { tab: "system", icon: <Settings /> },
    ],
  },
];

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  pendingUsersCount: number;
  email: string;
  onSignOut: () => void;
  onOpenSearch: () => void;
}

export function Sidebar({ activeTab, setActiveTab, pendingUsersCount, email, onSignOut, onOpenSearch }: SidebarProps) {
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Briefcase size={24} />
        <span>Leuret</span>
        <small>Admin</small>
      </div>
      <button type="button" className="sidebar-search" onClick={onOpenSearch}>
        <Search size={16} />
        <span>Buscar...</span>
        <kbd>{isMac ? "⌘" : "Ctrl"} K</kbd>
      </button>
      <nav className="nav-links">
        {GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            {group.items.map((item) => (
              <NavButton
                key={item.tab}
                icon={item.icon}
                tab={item.tab}
                active={activeTab}
                onClick={setActiveTab}
                badge={item.tab === "users" ? pendingUsersCount : undefined}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <strong>Superadministrador</strong>
        <span>{email}</span>
        <button className="button button-ghost button-block" onClick={onSignOut}>
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
