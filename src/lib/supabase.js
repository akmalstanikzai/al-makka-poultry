import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Supabase now labels new browser-safe keys as "publishable" keys. Keep the
// legacy anon name as a fallback so existing deployments continue to work.
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY;
const validateSupabaseConfiguration = () => {
    if (!supabaseUrl) return 'VITE_SUPABASE_URL is missing.';
    if (!supabaseAnonKey) return 'VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) is missing.';
    try {
        const parsed = new URL(supabaseUrl);
        if (parsed.protocol !== 'https:') return 'VITE_SUPABASE_URL must use HTTPS.';
        if (!parsed.hostname.endsWith('.supabase.co')) return 'VITE_SUPABASE_URL is not a valid Supabase project URL.';
    } catch {
        return 'VITE_SUPABASE_URL is malformed.';
    }
    if (supabaseAnonKey.length < 30) return 'The configured Supabase publishable/anon key is malformed.';
    return null;
};
export const supabaseConfigurationError = validateSupabaseConfiguration();
export const supabase = !supabaseConfigurationError
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    : null;
