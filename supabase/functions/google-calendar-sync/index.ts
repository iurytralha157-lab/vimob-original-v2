import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function refreshAccessToken(supabaseAdmin: any, userId: string, refreshToken: string) {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const tokens = await tokenResponse.json()

  if (tokens.error) {
    throw new Error(tokens.error_description || tokens.error)
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  
  await supabaseAdmin
    .from('google_calendar_tokens')
    .update({
      access_token: tokens.access_token,
      expires_at: expiresAt,
    })
    .eq('user_id', userId)

  return tokens.access_token
}

async function getValidAccessToken(supabaseAdmin: any, userId: string) {
  const { data: tokenData, error } = await supabaseAdmin
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !tokenData) {
    throw new Error('No Google Calendar connected')
  }

  // Check if token is expired or will expire in next 5 minutes
  const expiresAt = new Date(tokenData.expires_at)
  const now = new Date()
  const fiveMinutes = 5 * 60 * 1000

  if (expiresAt.getTime() - now.getTime() < fiveMinutes) {
    return await refreshAccessToken(supabaseAdmin, userId, tokenData.refresh_token)
  }

  return tokenData.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { action, event } = await req.json()

    // Get valid access token
    const accessToken = await getValidAccessToken(supabaseAdmin, user.id)

    if (action === 'create') {
      // Create event in Google Calendar
      const googleEvent = {
        summary: event.title,
        description: event.description || '',
        start: {
          dateTime: event.start_at,
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: event.end_at || new Date(new Date(event.start_at).getTime() + (event.duration_minutes || 30) * 60000).toISOString(),
          timeZone: 'America/Sao_Paulo',
        },
      }

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        }
      )

      const createdEvent = await response.json()

      if (createdEvent.error) {
        throw new Error(createdEvent.error.message)
      }

      // Update schedule_events with Google event ID
      if (event.id) {
        await supabaseAdmin
          .from('schedule_events')
          .update({
            google_event_id: createdEvent.id,
            google_calendar_id: 'primary',
          })
          .eq('id', event.id)
      }

      return new Response(
        JSON.stringify({ success: true, googleEventId: createdEvent.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'update') {
      if (!event.google_event_id) {
        return new Response(
          JSON.stringify({ error: 'No Google event ID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const googleEvent = {
        summary: event.title,
        description: event.description || '',
        start: {
          dateTime: event.start_at,
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: event.end_at || new Date(new Date(event.start_at).getTime() + (event.duration_minutes || 30) * 60000).toISOString(),
          timeZone: 'America/Sao_Paulo',
        },
      }

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.google_event_id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        }
      )

      const updatedEvent = await response.json()

      if (updatedEvent.error) {
        throw new Error(updatedEvent.error.message)
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'delete') {
      if (!event.google_event_id) {
        return new Response(
          JSON.stringify({ success: true }), // No Google event to delete
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.google_event_id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      )

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
