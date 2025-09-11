# 🔄 Amazon SP-API Sync Setup Instructions

## ⚠️ Current Situation
- **Last Order**: August 24, 2025 (3 days ago)
- **Last DB Update**: August 25, 2025 (2 days ago)
- **Sync Status**: NOT RUNNING - No sync logs found
- **Required**: Multiple syncs per day to keep data current

## 📊 Amazon SP-API Rate Limits
- **Orders API**: 1 request per minute (0.0167 req/sec)
- **Burst Capacity**: 20 requests
- **Daily Limit**: ~1,440 requests
- **Restore Rate**: 1 request per minute

## ✅ Recommended Sync Schedule

### Optimal Schedule (9 syncs/day, ~370 API calls)
```
Business Hours (9 AM - 9 PM): Every 2 hours
Night Hours (9 PM - 9 AM): Every 4 hours
Daily Comprehensive: 3 AM (48-hour window)
```

### Schedule Breakdown:
| Time | Type | Window | API Calls |
|------|------|--------|-----------|
| 9:00 AM | Business | 2 hours | 30 |
| 11:00 AM | Business | 2 hours | 30 |
| 1:00 PM | Business | 2 hours | 30 |
| 3:00 PM | Business | 2 hours | 30 |
| 5:00 PM | Business | 2 hours | 30 |
| 7:00 PM | Business | 2 hours | 30 |
| 9:00 PM | Night | 4 hours | 30 |
| 1:00 AM | Night | 4 hours | 30 |
| 3:00 AM | Comprehensive | 48 hours | 100 |
| 5:00 AM | Night | 4 hours | 30 |

**Total**: ~370 calls/day (26% of daily limit)

## 🚀 Implementation Options


### Option 1: Node.js Scheduler
Use the provided `amazon-sync-scheduler.js`:
```bash
# Install dependencies
npm install node-cron axios pg

# Set environment variables
export AMAZON_REFRESH_TOKEN="your_refresh_token"
export AMAZON_CLIENT_ID="your_client_id"
export AMAZON_CLIENT_SECRET="your_client_secret"
export AMAZON_SELLER_ID="your_seller_id"

# Run scheduler
node amazon-sync-scheduler.js
```

### Option 3: Cron Job
Set up system cron jobs:
```bash
# Edit crontab
crontab -e

# Add sync jobs
0 9,11,13,15,17,19 * * * node /path/to/sync-orders.js --hours 2
0 21,1,5 * * * node /path/to/sync-orders.js --hours 4
0 3 * * * node /path/to/sync-orders.js --hours 48
```

## 🔑 Required Amazon Credentials
1. **Refresh Token**: Long-lived token for authentication
2. **Client ID**: Your app's client ID
3. **Client Secret**: Your app's client secret
4. **Seller ID**: Your Amazon seller ID
5. **Marketplace ID**: ATVPDKIKX0DER (US)

## 📝 Database Requirements

### Create sync_logs entries
The sync process should log to `sync_logs` table:
```sql
INSERT INTO sync_logs (
  sync_type, period, status, orders_synced,
  started_at, completed_at, metadata, created_at
) VALUES (
  'orders', '2h', 'success', 5,
  NOW(), NOW() + INTERVAL '30 seconds',
  '{"source": "sp-api"}', NOW()
);
```

### Update orders with fresh data
- Update `total_quantity` when inventory changes
- Update `order_status` when orders ship
- Track `updated_at` timestamp

## 🔍 Monitoring

Run `sync-status-monitor.js` to check:
```bash
node sync-status-monitor.js
```

This will show:
- Last order received
- Time since last sync
- Sync history
- Recommendations

## 🚨 Alerts to Set Up

1. **No Orders Alert**: If no orders for 24+ hours
2. **Sync Failure Alert**: If sync fails 3 times in a row
3. **Rate Limit Alert**: If approaching API limits
4. **Stock Alert**: When inventory gets low

## 📊 Expected Results

After implementing syncs:
- Orders appear within 2 hours during business hours
- Stock levels update after each sale
- Sync logs show regular successful syncs
- Dashboard shows current data

## ⚡ Quick Start

1. **Immediate Action**: Run a manual sync now
2. **Today**: Set up at least 3 daily syncs
3. **This Week**: Implement full schedule
4. **Ongoing**: Monitor and adjust frequency

## 🆘 Troubleshooting

### No new orders appearing:
1. Check Amazon Seller Central for actual orders
2. Verify API credentials are valid
3. Check sync_logs for errors
4. Test API connection manually

### API errors:
1. Refresh access token
2. Check rate limits
3. Verify marketplace ID
4. Check network connectivity

### Database not updating:
1. Check database connection
2. Verify table structure
3. Check for lock conflicts
4. Review error logs