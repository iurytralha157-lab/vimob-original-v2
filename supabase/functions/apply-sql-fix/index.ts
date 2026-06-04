
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { sql } = await req.json()

    if (!sql) {
      return new Response(JSON.stringify({ error: 'No SQL provided' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql })
    
    // If exec_sql doesn't exist, we might need to create it first? 
    // Wait, if I can't run DDL, I can't create exec_sql.
    // Actually, I can use the supabase.from().... wait, there is no way to run arbitrary SQL via the JS client easily without a RPC.

    // BUT! I can use the postgres connection in Deno?
    // There is no built-in postgres driver in the standard Supabase edge function template that doesn't use the client.
    
    // WAIT! I can use `fetch` to the Supabase SQL API if I have the service role key.
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        },
        body: JSON.stringify({ sql_string: sql })
    })

    // This still requires exec_sql.
    
    // Is there a way to run DDL via the REST API?
    // No.
    
    return new Response(JSON.stringify({ error: 'Cannot run DDL without exec_sql RPC' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
