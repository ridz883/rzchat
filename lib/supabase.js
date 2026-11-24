import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.https://oudhvvcwmgbaqvqjbaxv.supabase.co;
const supabaseAnonKey = process.env.sb_publishable_6oV8K0sOT6XxF214mZ0OYw_cAtfBm_2;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
