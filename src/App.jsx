import React, { lazy, Suspense, useEffect } from 'react';
import { NavLink, Link, Route, Routes, useLocation } from 'react-router-dom';
import { Home, Search, Bookmark, CalendarDays, UserRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { C, Loading } from './ui';
import HomePage from './pages/HomePage';
import SchoolsPage from './pages/SchoolsPage';
import SchoolPage from './pages/SchoolPage';
import CampsPage, { CampPage } from './pages/CampsPage';
import AuthPage from './pages/AuthPage';

const MyListPage = lazy(() => import('./pages/MyListPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const SharedPages = lazy(() => import('./pages/SharedPages'));
const AdminPage = lazy(() => import('./admin/AdminPage'));

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/schools', label: 'Schools', icon: Search },
  { to: '/my-list', label: 'My List', icon: Bookmark },
  { to: '/camps', label: 'Camps', icon: CalendarDays },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

function Shell({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    const prev = document.title;
    document.title = 'Recruit — College Soccer Recruiting';
    return () => { document.title = prev; };
  }, []);
  const isAdmin = user?.role === 'admin';
  return (
    <div className={`min-h-screen ${C.page}`} style={{ fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#060b16]/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 font-black tracking-tight text-lg">
            <span className="w-8 h-8 rounded-lg bg-lime-300 text-slate-950 flex items-center justify-center text-base">⚽</span>
            <span>RECRUIT<span className="text-lime-300">.</span></span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `px-3.5 py-2 rounded-lg text-sm font-semibold ${isActive ? 'bg-white/10 text-lime-300' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}>{label}</NavLink>
            ))}
            {isAdmin && <NavLink to="/admin" className="px-3.5 py-2 rounded-lg text-sm font-semibold text-amber-300 hover:bg-white/5 inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />Admin</NavLink>}
          </nav>
          {!user && <Link to={`/auth?next=${encodeURIComponent(loc.pathname + loc.search)}`} className="rounded-xl bg-lime-300 text-slate-950 font-bold text-sm px-4 py-2">Sign in</Link>}
          {user && <Link to="/profile" className="hidden md:block text-sm text-slate-300 truncate max-w-[180px]">{user.full_name || user.email}</Link>}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 pt-5 pb-28 md:pb-12">{children}</main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-[#080f1d]/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isActive ? 'text-lime-300' : 'text-slate-400'}`}>
              <Icon className="w-5 h-5" />{label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function RecruitApp() {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/my-list" element={<MyListPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/admin/*" element={<AdminPage />} />
          <Route path="/schools" element={<SchoolsPage />} />
          <Route path="/schools/:slug" element={<SchoolPage />} />
          <Route path="/camps" element={<CampsPage />} />
          <Route path="/camps/:id" element={<CampPage />} />
          <Route path="/player/:slug" element={<SharedPages kind="player" />} />
          <Route path="/list/:token" element={<SharedPages kind="list" />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
