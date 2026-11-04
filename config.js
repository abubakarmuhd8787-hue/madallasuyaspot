// Connection to your Supabase database
const SUPABASE_URL = 'https://agmqpzighglheawkmjfj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__Rls_EJbGgEcMM1Le7Z1OQ_8HVdeMSY';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);