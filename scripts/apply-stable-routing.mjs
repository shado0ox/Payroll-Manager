import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/App.tsx');
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Missing stable routing anchor: ${label}`);
  source = source.replace(from, to);
};

replaceOnce(
  "const IDLE_TIMEOUT_MS = 60 * 60 * 1000;\ntype MasarAppState",
  `const IDLE_TIMEOUT_MS = 60 * 60 * 1000;\nconst TAB_PATHS: Record<NavigationTab, string> = {\n  dashboard: '/dashboard',\n  company_profile: '/company',\n  employees: '/employees',\n  payroll_runs: '/payroll',\n  attendance: '/attendance',\n  loans_penalties: '/loans-penalties',\n  journals: '/journals',\n  reports: '/reports',\n  users: '/users',\n  settings: '/settings',\n  audit_logs: '/audit-logs',\n};\nconst PATH_TABS = Object.fromEntries(Object.entries(TAB_PATHS).map(([tab, pathname]) => [pathname, tab])) as Record<string, NavigationTab>;\nconst tabFromLocation = (): NavigationTab => PATH_TABS[window.location.pathname.replace(/\\/$/, '') || '/'] || 'dashboard';\ntype MasarAppState`,
  'route map',
);

replaceOnce(
  "  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');",
  `  const [activeTab, setActiveTabState] = useState<NavigationTab>(() => tabFromLocation());\n  const navigateToTab = (tab: NavigationTab, options?: { replace?: boolean }) => {\n    const pathname = TAB_PATHS[tab];\n    if (window.location.pathname !== pathname) {\n      window.history[options?.replace ? 'replaceState' : 'pushState']({ masarTab: tab }, '', pathname);\n    }\n    setActiveTabState(tab);\n  };`,
  'active tab state',
);

replaceOnce(
  "  useEffect(() => {\n    if (state.currentUser && !hasPermission(state.currentUser, TAB_PERMISSION[activeTab])) {\n      const fallback = (Object.keys(TAB_PERMISSION) as NavigationTab[]).find(tab => hasPermission(state.currentUser, TAB_PERMISSION[tab]));\n      if (fallback) setActiveTab(fallback);\n    }\n  }, [activeTab, state.currentUser]);",
  `  useEffect(() => {\n    const onPopState = () => setActiveTabState(tabFromLocation());\n    window.addEventListener('popstate', onPopState);\n    if (window.location.pathname === '/' || !PATH_TABS[window.location.pathname.replace(/\\/$/, '')]) {\n      window.history.replaceState({ masarTab: activeTab }, '', TAB_PATHS[activeTab]);\n    }\n    return () => window.removeEventListener('popstate', onPopState);\n  }, []);\n\n  useEffect(() => {\n    if (state.currentUser && !hasPermission(state.currentUser, TAB_PERMISSION[activeTab])) {\n      const fallback = (Object.keys(TAB_PERMISSION) as NavigationTab[]).find(tab => hasPermission(state.currentUser, TAB_PERMISSION[tab]));\n      if (fallback) navigateToTab(fallback, { replace: true });\n    }\n  }, [activeTab, state.currentUser]);`,
  'popstate and permission fallback',
);

source = source.replaceAll('onTabChange={setActiveTab}', 'onTabChange={navigateToTab}');
source = source.replaceAll('onNavigate={setActiveTab}', 'onNavigate={navigateToTab}');

if (source.includes('onTabChange={setActiveTab}') || source.includes('onNavigate={setActiveTab}')) {
  throw new Error('Stable routing left direct tab setters behind');
}

fs.writeFileSync(file, source);
console.log('Stable browser routing transform applied');
