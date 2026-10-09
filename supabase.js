import { createClient } from
"https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";


const supabaseUrl =
"https://mdvrmcodcreyihhqxieb.supabase.co";

const supabaseKey =
"sb_publishable_DszJCaTg2Sh3uMDekdyB_A__HU1QVhZ";


export const supabase =
createClient(
supabaseUrl,
supabaseKey
);
