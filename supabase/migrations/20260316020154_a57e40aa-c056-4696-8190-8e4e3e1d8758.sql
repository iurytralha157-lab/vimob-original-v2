
-- Remove orphan user from round_robin_members and team_members (exact IDs)
DELETE FROM round_robin_members WHERE id = '3300f1a2-c10e-4b7c-9866-372e7f202389';
DELETE FROM team_members WHERE id = '14526716-c980-4751-9f98-5dd89667d776';
