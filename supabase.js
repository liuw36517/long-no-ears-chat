import { createClient } from
"https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";


const supabaseUrl =
"你的API URL";


const supabaseKey =
"你的Publishable key";


export const supabase =
createClient(
supabaseUrl,
supabaseKey
);
