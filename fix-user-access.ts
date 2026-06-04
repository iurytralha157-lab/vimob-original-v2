
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixUserAccess() {
  const userId = '4d182faf-a60b-4cdd-88b3-777591d9fa32';
  const orgId = '4251164b-cfb0-402a-a854-ecae79470561';

  console.log(`Checking if member exists for user ${userId} in org ${orgId}...`);
  
  const { data: existing } = await supabase
    .from('organization_members')
    .select('*')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (existing) {
    console.log('Member already exists:', existing);
    return;
  }

  console.log('Inserting new membership...');
  const { data, error } = await supabase
    .from('organization_members')
    .insert({
      user_id: userId,
      organization_id: orgId,
      role: 'admin',
      is_active: true
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting membership:', error);
    process.exit(1);
  }

  console.log('Membership created successfully:', data);
}

fixUserAccess();
