import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { properties, organization_id } = await req.json();

    if (!properties || !organization_id || !Array.isArray(properties)) {
      return new Response(
        JSON.stringify({ error: 'properties (array) and organization_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Add organization_id to each property
    const propsWithOrg = properties.map((p: any) => ({
      ...p,
      organization_id,
    }));

    console.log(`Inserting ${propsWithOrg.length} properties for org ${organization_id}`);

    // Insert in batches of 10
    let inserted = 0;
    const errors: string[] = [];
    const insertedProps: any[] = [];

    for (let i = 0; i < propsWithOrg.length; i += 10) {
      const batch = propsWithOrg.slice(i, i + 10);
      const { data, error } = await supabase
        .from('properties')
        .insert(batch)
        .select('id, code, title');

      if (error) {
        console.error(`Batch ${i} error:`, error);
        errors.push(`Batch ${i}: ${error.message}`);
      } else {
        inserted += (data?.length || 0);
        if (data) insertedProps.push(...data);
      }
    }

    console.log(`Inserted ${inserted} properties`);

    return new Response(
      JSON.stringify({
        success: true,
        total_inserted: inserted,
        errors: errors.length > 0 ? errors : undefined,
        properties: insertedProps,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
