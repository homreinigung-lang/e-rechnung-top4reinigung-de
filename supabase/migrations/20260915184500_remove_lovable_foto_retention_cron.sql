-- Remove the obsolete Lovable foto-retention runtime dependency.
-- A Cloudflare-targeted job may be introduced separately after the final endpoint
-- and secret are verified during production cutover.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'foto-retention-taeglich'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END;
$$;
