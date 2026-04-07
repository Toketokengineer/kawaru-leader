import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://prmojfmjbyouajzezqeb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBybW9qZm1qYnlvdWFqemV6cWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDEwMTEsImV4cCI6MjA5MTA3NzAxMX0.ebsr3ow1D-ijqMYLbU_ZzjDcHaW_CqapsqpbWAeu4Uo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);