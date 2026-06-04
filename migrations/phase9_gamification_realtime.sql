-- Phase 9: enable realtime on gamification tables
ALTER TABLE public.user_gamification_stats REPLICA IDENTITY FULL;
ALTER TABLE public.gamification_activity_logs REPLICA IDENTITY FULL;
ALTER TABLE public.gamification_user_missions REPLICA IDENTITY FULL;
ALTER TABLE public.gamification_rankings REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_gamification_stats; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.gamification_activity_logs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.gamification_user_missions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.gamification_rankings; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
