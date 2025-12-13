# Quick Deployment Reference Card

## 🚀 Deployment Steps (5 minutes)

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies (if needed)
npm install

# 3. Run tests
./test-deployment.sh

# 4. Restart server
pm2 restart server
# OR
npm start

# 5. Monitor logs
pm2 logs server --lines 100
# OR  
tail -f logs/server.log
```

---

## 🔍 What to Monitor

### ✅ Good Signs (Everything Working):
```
✅ 🔄 Initializing socket handlers - resetting draft state
✅ ✅ Draft state reset complete. Drafters count: 0
✅ Flushing X queued sheet updates
✅ Server is running on port 3000
✅ [pick consultant] received from socket
✅ [_internal_process_pick] START
```

### ⚠️ Warning Signs (Non-Critical):
```
⚠️ [Non-critical] Sheet write failed: timeout
⚠️ ⏳ Waiting for data files to be ready...
⚠️ Connection lost. Reconnecting...
```
**Action**: Monitor, but draft continues working

### 🔥 Bad Signs (Investigate Immediately):
```
❌ [_internal_process_pick] ERROR processing queued pick
❌ ❌ No consultants loaded!
❌ ❌ No projects loaded!
❌ Database connection lost
❌ EADDRINUSE: Port 3000 already in use
❌ Error loading data files:
```
**Action**: Check logs, restart server, or rollback

---

## 🐛 Quick Troubleshooting

| Problem | Quick Fix |
|---------|-----------|
| "Port already in use" | `lsof -ti:3000 \| xargs kill -9` then restart |
| Picks not working | Check for `isProcessingPick` stuck, restart server |
| Sheets not updating | Check `SHEET_HISTORY_URL` env var, non-critical if fails |
| "No consultants loaded" | Check `/api/start-draft` completed, wait 10s then retry |
| Slow responses | Check database connection, verify Cloud SQL proxy running |
| Phantom drafters | Restart with `pm2 stop && pm2 delete && pm2 start` |

---

## 🔄 Emergency Rollback (1 minute)

```bash
# Quick rollback to previous version
git log --oneline -5  # See recent commits
git checkout <previous-commit-hash>
pm2 restart server

# OR restore from backup
cp -r backup/server.js backup/socketHandler.js ./server/logic/
pm2 restart server
```

---

## 📊 Success Metrics (After Draft)

Check these after the draft starts:

- [ ] State reset shows "Drafters count: 0" on startup
- [ ] No "Not your turn" errors from race conditions  
- [ ] Draft starts with all consultants loaded (150+)
- [ ] Draft completes successfully with all consultants assigned
- [ ] Google Sheets has all picks (some may be delayed 2s - OK!)
- [ ] Server logs show "Flushing X queued sheet updates" periodically
- [ ] No phantom drafters from previous sessions

---

## 🆘 Emergency Contacts

**Critical Issues Only:**
- Server won't start → Check `.env` file and database connection
- All users kicked out → Restart server, check database
- Complete system failure → Rollback immediately

**Non-Critical Issues (Monitor but don't panic):**
- Google Sheets not updating → Check API quota, draft still works
- Some picks slow → Check database query performance
- Occasional disconnects → Normal if <5% of users

---

## 📝 Post-Deployment Checklist

After draft completes:

- [ ] Check Google Sheets has all data
- [ ] Verify database has all assignments
- [ ] Review server logs for errors
- [ ] Document any issues encountered
- [ ] Update team on results

---

## 🎯 What Changed (Quick Summary)

1. **Google Sheets**: Now queued/batched every 2s (non-blocking)
2. **Pick Processing**: Added mutex with isProcessingPick flag
3. **Start Draft**: Files write in background, waits up to 10s for completion
4. **State Management**: Reset on startup to clear phantom drafters
5. **Data Validation**: Validates consultants/projects loaded before draft starts

**Result**: Faster picks, no race conditions, handles scale testing with 9 SMs

---

## 💡 Tips

- First draft will be slower (files need to be created)
- Google Sheets may be 2 seconds delayed - this is expected and OK
- File polling on draft start waits up to 10s - watch for "⏳ Waiting for data files..."
- Use PM2 hard restart (stop → delete → start) to clear module cache properly
- Server restart takes ~5 seconds, plan accordingly
- Keep backup of working version just in case