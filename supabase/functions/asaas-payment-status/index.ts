import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const paymentId = url.searchParams.get('payment_id');
    const orgId = url.searchParams.get('organization_id');
    if (!paymentId && !orgId) {
      return new Response(JSON.stringify({ error: 'payment_id or organization_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    let q = supabase.from('asaas_payments').select('*').order('created_at', { ascending: false }).limit(1);
    if (paymentId) q = q.eq('asaas_payment_id', paymentId);
    else q = q.eq('organization_id', orgId);
    const { data } = await q.maybeSingle();
    return new Response(JSON.stringify({ payment: data || null }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
