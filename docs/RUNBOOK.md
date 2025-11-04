# Newsletter Control Center - Operational Runbook

## Daily Operations

### Run Full Pipeline

```bash
npm run pipeline:full
```

### Run Individual Stages

```bash
npm run pipeline:ingest    # Fetch new emails only
npm run pipeline:process   # Chunk and embed unprocessed
npm run pipeline:status    # Check system status
```

## Monitoring

### Check Pipeline Status

```bash
npm run monitor

# Shows: last sync time, pending messages, error count
```

### Check for Errors

```sql
-- In BigQuery
SELECT * FROM control.processing_status 
WHERE error IS NOT NULL 
AND updated_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
ORDER BY updated_at DESC;
```

## Troubleshooting

### Gmail History API Issues

If History API fails, the system automatically falls back to:

```
in:anywhere newer_than:30d
```

### Reprocess Failed Messages

```bash
npm run pipeline:retry-failed
```

### Fix Duplicate Publishers

```bash
npm run fix:publishers
```

## Manual Interventions

### Force Reprocess Specific Message

```sql
UPDATE control.processing_status 
SET stage = 'fetched', error = NULL
WHERE gmail_message_id = 'xxx';
```

### Skip Problematic Message

```sql
UPDATE control.processing_status 
SET stage = 'skipped', error = 'Manual skip: [reason]'
WHERE gmail_message_id = 'xxx';
```

