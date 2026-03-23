-- Migration 005: DB trigger to auto-update health_score on outreach_logs
-- Fires after any INSERT/UPDATE/DELETE on interactions table
-- Uses contact_id FK column (confirmed column name in production schema)
--
-- Run in Supabase SQL editor.

-- Function: compute health score from interactions
CREATE OR REPLACE FUNCTION compute_contact_health_score(p_contact_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score FLOAT := 0;
  v_type TEXT;
  v_date DATE;
  v_days_ago INTEGER;
  v_decay FLOAT;
  v_points INTEGER;
BEGIN
  FOR v_type, v_date IN
    SELECT type, interaction_date
    FROM interactions
    WHERE contact_id = p_contact_id
  LOOP
    v_days_ago := CURRENT_DATE - v_date;

    IF v_days_ago <= 7 THEN v_decay := 1.0;
    ELSIF v_days_ago <= 30 THEN v_decay := 0.7;
    ELSIF v_days_ago <= 90 THEN v_decay := 0.4;
    ELSIF v_days_ago <= 365 THEN v_decay := 0.1;
    ELSE v_decay := 0;
    END IF;

    CASE v_type
      WHEN 'in_person'       THEN v_points := 5;
      WHEN 'virtual_coffee'  THEN v_points := 4;
      WHEN 'call'            THEN v_points := 3;
      WHEN 'email'           THEN v_points := 2;
      WHEN 'linkedin_msg'    THEN v_points := 1;
      WHEN 'whatsapp'        THEN v_points := 1;
      ELSE v_points := 1;
    END CASE;

    v_score := v_score + (v_points * v_decay);
  END LOOP;

  RETURN GREATEST(1, LEAST(10, ROUND(v_score)));
END;
$$ LANGUAGE plpgsql;

-- Trigger function: fires after any interaction change
CREATE OR REPLACE FUNCTION trigger_update_contact_health()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id UUID;
  v_new_score INTEGER;
  v_last_interaction DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_contact_id := OLD.contact_id;
  ELSE
    v_contact_id := NEW.contact_id;
  END IF;

  v_new_score := compute_contact_health_score(v_contact_id);

  SELECT MAX(interaction_date) INTO v_last_interaction
  FROM interactions WHERE contact_id = v_contact_id;

  UPDATE outreach_logs
  SET health_score = v_new_score
  WHERE id = v_contact_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop + recreate (idempotent)
DROP TRIGGER IF EXISTS trg_update_contact_health ON interactions;

CREATE TRIGGER trg_update_contact_health
AFTER INSERT OR UPDATE OR DELETE ON interactions
FOR EACH ROW EXECUTE FUNCTION trigger_update_contact_health();
