-- Original references are optional. Drafts and presentation versions never post money.
ALTER TABLE sos.project_blueprints ALTER COLUMN source_attachment_id DROP NOT NULL;
CREATE TABLE sos.project_blueprint_versions (
    project_id uuid NOT NULL REFERENCES sos.projects(id),
    revision bigint NOT NULL,
    geometry jsonb NOT NULL,
    source_attachment_id uuid REFERENCES sos.erp_attachments(id),
    reviewed_by uuid REFERENCES sos.identities(id),
    reviewed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(project_id,revision)
);
INSERT INTO sos.project_blueprint_versions(project_id,revision,geometry,source_attachment_id,reviewed_by,reviewed_at)
SELECT project_id,revision,confirmed,confirmed_attachment_id,reviewed_by,coalesce(reviewed_at,updated_at)
FROM sos.project_blueprints WHERE confirmed IS NOT NULL;

-- Include document edits made through older ERP clients in optimistic concurrency.
-- Private attachment bytes are retained; deleting a document only unlinks its active record.
CREATE FUNCTION sos.bump_document_project_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.kind='documents' THEN
            UPDATE sos.projects SET revision=revision+1 WHERE id=OLD.project_id;
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.kind='documents' THEN
        UPDATE sos.projects SET revision=revision+1 WHERE id=NEW.project_id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER document_project_revision AFTER INSERT OR UPDATE OR DELETE ON sos.erp_records
FOR EACH ROW EXECUTE FUNCTION sos.bump_document_project_revision();
