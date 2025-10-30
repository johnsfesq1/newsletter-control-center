# Monitoring Commands for Newsletter Processing

## Quick Status Check

Run this anytime to see current progress:
```bash
./CHECK_PROGRESS.sh
```

## Watch Live Progress

To watch the processing happen in real-time:
```bash
tail -f overnight-run-v3.log
```
Press `Ctrl+C` to stop watching

## Check How Many Processed

See exact numbers:
```bash
cat processing-progress.json
```

## Check if Process is Running

```bash
ps aux | grep process-newsletters
```

## See Recent Activity

```bash
tail -50 overnight-run-v3.log
```

---

## Current Status

**Process**: Running with optimized code (no 100ms delays between chunks)  
**Speed**: Should process ~3-4 newsletters per minute  
**Expected completion**: ~3-4 days for 14,587 newsletters  

**Note**: The BigQuery `SELECT *` query takes 2-5 minutes to fetch all 15,000 newsletters. Be patient during startup.

---

## Check Back In 10 Minutes

After the initial fetch completes, you should see progress like:
```
[1/14587] Processing: Newsletter Subject Here
   Publisher: Publisher Name
   Created 12 chunks
```

---

## If Something Goes Wrong

Check the full error:
```bash
tail -100 overnight-run-v3.log
```

The process auto-saves progress, so you can resume by running the same command again.
