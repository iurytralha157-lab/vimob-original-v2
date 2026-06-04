SELECT cron.schedule(
  'media-worker-processor',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/media-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbWFsemxmbmJvdW9ieWp3bHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MjQ1ODYsImV4cCI6MjA4MzUwMDU4Nn0.81N4uCUaIFOm7DHMaHa9Rhh-OoY06j6Ig4AFibzXuQU'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
)