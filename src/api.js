import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';

const qs = (o) => {
  if (!o) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, v === true ? '1' : String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
const j = (b) => ({ body: JSON.stringify(b ?? {}) });

export const rc = {
  get: (path, params) => apiFetch(`/api/recruiting${path}${qs(params)}`),
  post: (path, body) => apiFetch(`/api/recruiting${path}`, { method: 'POST', ...j(body) }),
  put: (path, body) => apiFetch(`/api/recruiting${path}`, { method: 'PUT', ...j(body) }),
  patch: (path, body) => apiFetch(`/api/recruiting${path}`, { method: 'PATCH', ...j(body) }),
  del: (path) => apiFetch(`/api/recruiting${path}`, { method: 'DELETE' }),
};

export const useMeta = () => useQuery({ queryKey: ['rc', 'meta'], queryFn: () => rc.get('/meta'), staleTime: 10 * 60_000 });
export const usePrograms = (params) => useQuery({ queryKey: ['rc', 'programs', params], queryFn: () => rc.get('/programs', params), placeholderData: (prev) => prev });
export const useProgram = (slug, params) => useQuery({ queryKey: ['rc', 'program', slug, params], queryFn: () => rc.get(`/programs/${slug}`, params) });
export const useCamps = (params) => useQuery({ queryKey: ['rc', 'camps', params], queryFn: () => rc.get('/camps', params), placeholderData: (prev) => prev });
export const useDashboard = (enabled) => useQuery({ queryKey: ['rc', 'dashboard'], queryFn: () => rc.get('/me/dashboard'), enabled, retry: false });
export const useMyProfile = (enabled) => useQuery({ queryKey: ['rc', 'profile'], queryFn: () => rc.get('/me/profile'), enabled, retry: false });

/** A mutation that refreshes everything recruiting-related when it lands. */
export function useRcMutation(fn, { onSuccess } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => { qc.invalidateQueries({ queryKey: ['rc'] }); onSuccess?.(data, vars); },
  });
}

export const STAGE_LABEL = {
  interested: 'Interested', researching: 'Researching', contacted: 'Contacted', coach_responded: 'Coach Responded', camp_attended: 'Camp Attended',
  evaluation: 'Evaluation', offer: 'Offer / Recruitment', committed: 'Committed', not_pursuing: 'Not Pursuing',
};

export const fmtDate = (d, opts = { month: 'short', day: 'numeric' }) => {
  if (!d) return '';
  const dt = new Date(`${String(d).slice(0, 10)}T12:00:00`);
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString(undefined, opts);
};
export const fmtDateLong = (d) => fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' });
