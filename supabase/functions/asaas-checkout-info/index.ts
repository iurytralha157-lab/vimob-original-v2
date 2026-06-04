import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const orgId = url.searchParams.get('organization_id');

    if (!token && !orgId) {
      return new Response(JSON.stringify({ error: 'token or organization_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let query = supabase.from('organizations').select(
      'id, name, logo_url, accent_color, subscription_status, plan_id, asaas_customer_id, asaas_subscription_id, checkout_token, subscription_value'
    );
    if (token) query = query.eq('checkout_token', token);
    else query = query.eq('id', orgId);

    const { data: org, error } = await query.maybeSingle();
    if (error || !org) {
      return new Response(JSON.stringify({ error: 'Organization not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let plan: any = null;
    if (org.plan_id) {
      const { data } = await supabase
        .from('admin_subscription_plans')
        .select('id, name, price, billing_cycle, description')
        .eq('id', org.plan_id)
        .maybeSingle();
      plan = data;
    }

    return new Response(JSON.stringify({
      organization: {
        ...org,
        primary_color: (org as any).accent_color || null,
      },
      plan
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
