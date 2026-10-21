/*
 * Firebase usage snapshot — pulls the real Firestore operation counts from Cloud
 * Monitoring and writes a rolling daily history to Firestore (stats/usage), which
 * the in-app admin "Usage" panel reads. Runs from a scheduled GitHub Action with a
 * service account (so no Cloud Functions / always-on server). See README below.
 *
 * Service account needs: roles/monitoring.viewer + roles/datastore.user.
 * Auth comes from GOOGLE_APPLICATION_CREDENTIALS (the SA key file).
 */
'use strict';

const fs = require('fs');
const monitoring = require('@google-cloud/monitoring');
const admin = require('firebase-admin');

const KEEP_DAYS = 30;                 // how much history to retain in stats/usage
const LOOKBACK_DAYS = 4;              // re-fetch a few recent days each run (idempotent upsert)
const METRICS = {
    reads: 'firestore.googleapis.com/document/read_count',
    writes: 'firestore.googleapis.com/document/write_count',
    deletes: 'firestore.googleapis.com/document/delete_count',
};

async function main() {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set');
    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const projectId = key.project_id;

    admin.initializeApp({ credential: admin.credential.cert(key) });
    const db = admin.firestore();
    const client = new monitoring.MetricServiceClient();

    const now = Date.now();
    const interval = {
        startTime: { seconds: Math.floor((now - LOOKBACK_DAYS * 86400 * 1000) / 1000) },
        endTime: { seconds: Math.floor(now / 1000) },
    };

    // Sum each metric into UTC-day buckets. (Firebase quotas reset on Pacific time, so
    // treat these as a trend/early-warning signal rather than exact quota accounting.)
    const perDay = {};
    for (const [field, type] of Object.entries(METRICS)) {
        const [series] = await client.listTimeSeries({
            name: client.projectPath(projectId),
            filter: `metric.type="${type}"`,
            interval,
            aggregation: {
                alignmentPeriod: { seconds: 86400 },
                perSeriesAligner: 'ALIGN_SUM',
                crossSeriesReducer: 'REDUCE_SUM',
            },
        });
        for (const ts of series) {
            for (const pt of ts.points) {
                const sec = Number(pt.interval.endTime.seconds);
                const day = new Date(sec * 1000).toISOString().slice(0, 10);
                const val = Number((pt.value && (pt.value.int64Value || pt.value.doubleValue)) || 0);
                perDay[day] = perDay[day] || { reads: 0, writes: 0, deletes: 0 };
                perDay[day][field] += val;
            }
        }
    }

    const ref = db.doc('stats/usage');
    const snap = await ref.get();
    const days = (snap.exists && snap.data().days) || {};
    for (const [day, v] of Object.entries(perDay)) days[day] = v;        // upsert recent days
    const kept = Object.keys(days).sort().slice(-KEEP_DAYS);             // prune to KEEP_DAYS
    const pruned = {};
    for (const d of kept) pruned[d] = days[d];
    await ref.set({ days: pruned, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    console.log('Usage snapshot written. Days updated:', Object.keys(perDay).sort().join(', ') || '(none)');
}

main().catch((e) => { console.error(e); process.exit(1); });
