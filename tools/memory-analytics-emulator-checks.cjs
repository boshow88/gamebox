'use strict';
const cp=require('node:child_process');
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Run with the demo Firestore Emulator.');
for(const file of ['tools/memory-analytics-rules-check.mjs','tools/memory-analytics-export-check.cjs']){const r=cp.spawnSync(process.execPath,[file],{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1);}
