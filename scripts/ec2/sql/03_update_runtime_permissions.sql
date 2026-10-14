-- Existing lowercase sos only. This does not bootstrap identities or post pending records.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'sos' OR current_user <> 'sos_deploy' THEN
    RAISE EXCEPTION 'Update permissions require sos_deploy in lowercase sos.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sos.flyway_schema_history WHERE version='23' AND success)
     OR NOT EXISTS (SELECT 1 FROM sos.owner_memberships) THEN
    RAISE EXCEPTION 'V23 migrations or existing owner are missing.';
  END IF;
END
$guard$;
GRANT USAGE ON SCHEMA sos TO sos_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sos TO sos_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sos TO sos_runtime;
REVOKE ALL ON TABLE sos.flyway_schema_history FROM sos_runtime;
GRANT SELECT ON TABLE sos.flyway_schema_history TO sos_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sos_deploy IN SCHEMA sos
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sos_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sos_deploy IN SCHEMA sos
  GRANT USAGE, SELECT ON SEQUENCES TO sos_runtime;
COMMIT;
