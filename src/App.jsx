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

/** Red slanted brand block + white wordmark, with the double slash accent. */
function Brand() {
  return (
    <Link to="/" aria-label="Pro IQ Recruits — home" className="flex items-stretch h-full select-none">
      <span className="relative -ml-6 pl-9 pr-6 flex items-center bg-gradient-to-b from-red-500 to-red-700 -skew-x-[14deg] shadow-[inset_0_1px_0_rgba(255,255,255,.35),2px_0_0_rgba(0,0,0,.5)]">
        <span className="skew-x-[14deg] text-2xl font-black italic tracking-tight text-white drop-shadow">PRO IQ</span>
      </span>
      <span className="self-center ml-3 text-2xl font-black italic tracking-tight text-white">RECRUITS</span>
      <span className="hidden sm:flex self-stretch items-center ml-3 gap-1" aria-hidden="true"><i className="block w-1.5 h-9 bg-red-600 -skew-x-[14deg]" /><i className="block w-1.5 h-9 bg-red-600 -skew-x-[14deg]" /></span>
    </Link>
  );
}

const initials = (u) => (u?.full_name || u?.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function Shell({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const isAdmin = user?.role === 'admin';
  return (
    <div className={`min-h-screen ${C.page} bg-[radial-gradient(ellipse_at_top,rgba(185,28,28,.14),transparent_55%)]`} style={{ fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <header className="sticky top-0 z-30 border-b border-black bg-gradient-to-b from-[#2a2c33] to-[#0e0f12] shadow-[0_4px_18px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,255,255,.08)]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4 overflow-hidden">
          <Brand />
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {NAV.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative px-4 py-4 text-[15px] font-black italic tracking-wide ${isActive ? 'text-white' : 'text-slate-300 hover:text-white'}`}>
                {({ isActive }) => (<>{label}{isActive && <span className="absolute left-3 right-3 bottom-1.5 h-[3px] bg-red-600 rounded" />}</>)}
              </NavLink>
            ))}
            {isAdmin && <NavLink to="/admin" className="px-3 py-4 text-sm font-black italic text-amber-300 hover:text-amber-200 inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />Admin</NavLink>}
          </nav>
          {!user && <Link to={`/auth?next=${encodeURIComponent(loc.pathname + loc.search)}`} className="shrink-0 rounded-md bg-gradient-to-b from-red-500 to-red-700 text-white font-black italic text-sm px-4 py-2 -skew-x-6"><span className="inline-block skew-x-6">Sign in</span></Link>}
          {user && (
            <Link to="/profile" aria-label="Your profile" className="shrink-0 flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3a3d46] to-[#1a1c21] border border-white/25 flex items-center justify-center text-xs font-black text-white">{initials(user)}</span>
            </Link>
          )}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 pt-5 pb-28 md:pb-12">{children}</main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-black bg-gradient-to-b from-[#24262c] to-[#0b0c0e] shadow-[0_-4px_16px_rgba(0,0,0,.6)] pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-black italic ${isActive ? 'text-white border-t-2 border-red-600 -mt-px' : 'text-slate-400'}`}>
              {({ isActive }) => (<><Icon className={`w-5 h-5 ${isActive ? 'text-red-500' : ''}`} />{label}</>)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
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
