import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 
  (import.meta as any).env?.VITE_SUPABASE_URL || 
  'https://dyvsmpjazrinibooqrfk.supabase.co';

export const supabaseAnonKey = 
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 
  'sb_publishable_9ETx5TrR53S7BwwjaFhdTA_mcetWJzx';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);



