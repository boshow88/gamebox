'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),IO=require('./analytics/io.cjs');
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback demo Firestore emulator required.');
const adminRequire=require('node:module').createRequire(path.resolve('tools/impressions/analytics/package.json'));
const {initializeApp}=adminRequire('firebase-admin/app'),{getFirestore}=adminRequire('firebase-admin/firestore');
(async()=>{
    process.env.METADATA_SERVER_DETECTION='none';initializeApp({projectId:'demo-gamebox'});const db=getFirestore(),before=(await db.collection('memoryMatchAnalytics').get()).size;assert(before>0);const dir=fs.mkdtempSync(path.resolve('.cache','analytics-emulator-export-'));
    function cli(args){const result=cp.spawnSync(process.execPath,['tools/impressions/analytics/export.cjs','--project','demo-gamebox',...args],{encoding:'utf8',env:process.env});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}
    const exported=cli(['--out',dir,'--page-size','1']);assert.equal(exported.records,before);let n=0;for await(const r of IO.records(path.join(dir,'matches.ndjson'))){n++;assert(r.createdAt.endsWith('Z'));assert.equal(r.documentId.length,64);}assert.equal(n,before);
    const dry=cli(['--delete-before','2099-01-01','--page-size','1']);assert.equal(dry.mode,'delete-dry-run');assert.equal((await db.collection('memoryMatchAnalytics').get()).size,before);
    const deleted=cli(['--delete-before','2099-01-01','--page-size','1','--confirm-delete']);assert.equal(deleted.records,before);assert.equal((await db.collection('memoryMatchAnalytics').get()).size,0);assert((await db.doc('profiles/alice').get()).exists);await db.terminate();console.log('PASS: actual admin emulator paginated export and explicit retention dry-run/delete; unrelated profiles preserved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
