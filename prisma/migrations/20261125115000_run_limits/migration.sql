ALTER TABLE AgentRun ADD COLUMN responseStatus TEXT NOT NULL DEFAULT 'COMPLETE';
ALTER TABLE AgentRun ADD COLUMN providerCalls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE AgentRun ADD COLUMN providerTurns INTEGER NOT NULL DEFAULT 0;
ALTER TABLE AgentRun ADD COLUMN deadlineAt DATETIME;
UPDATE AgentRun SET responseStatus=CASE
 WHEN EXISTS(SELECT 1 FROM AgentAction a WHERE a.runId=AgentRun.id AND a.kind='Error') THEN 'FAILED'
 WHEN summary LIKE 'NEED_INPUT%' OR summary LIKE 'กรุณาระบุ%' THEN 'NEEDS_INPUT'
 ELSE 'COMPLETE' END;
-- Legacy native runs had no saved counters. Keep their original time window.
UPDATE AgentRun SET deadlineAt=CASE WHEN typeof(createdAt)='integer'
 THEN createdAt+60000 ELSE (unixepoch(createdAt)+60)*1000 END
WHERE mode='Native provider';
