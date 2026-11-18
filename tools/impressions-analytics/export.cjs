/* Trusted local CLI only. Uses ADC/IAM; never load in browser code. */
'use strict';
const path=require('node:path'),IO=require('./io.cjs');
(async()=>{
    const args=IO.argumentsFor(process.argv.slice(2),['--project','--out','--page-size','--before','--delete-before','--confirm-delete','--help']);
    if(args.help){console.log('Export: node tools/impressions-analytics/export.cjs --project PROJECT --out DIRECTORY [--page-size 200] [--before ISO_DATE]\nRetention dry-run: --project PROJECT --delete-before ISO_DATE\nDelete only this collection: add --confirm-delete');return;}
    if(typeof args.project!=='string'||!/^[-a-z0-9]+$/.test(args.project))throw Error('Specify --project explicitly.');
    if(process.env.FIRESTORE_EMULATOR_HOST&&(!args.project.startsWith('demo-')||!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST)))throw Error('Emulator exports require a loopback demo- project.');
    const pageSize=args['page-size']===undefined?200:Number(args['page-size']);if(!Number.isInteger(pageSize)||pageSize<1||pageSize>500)throw Error('Page size must be 1–500.');
    const deleting=args['delete-before']!==undefined;
    if(args['confirm-delete']!==undefined&&(args['confirm-delete']!==true||!deleting))throw Error('--confirm-delete is a flag requiring --delete-before.');
    const cutoff=args['delete-before']||args.before||new Date().toISOString(),date=new Date(cutoff);if(typeof cutoff!=='string'||!Number.isFinite(date.getTime()))throw Error('Invalid ISO cutoff date.');
    const {initializeApp,applicationDefault}=require('firebase-admin/app'),{getFirestore,FieldPath,Timestamp}=require('firebase-admin/firestore');
    if(process.env.FIRESTORE_EMULATOR_HOST)process.env.METADATA_SERVER_DETECTION='none';
    initializeApp({projectId:args.project,...(process.env.FIRESTORE_EMULATOR_HOST?{}:{credential:applicationDefault()})});const db=getFirestore(),collection=db.collection('memoryMatchAnalytics');
    const query=collection.where('createdAt',deleting?'<':'<=',Timestamp.fromDate(date)).orderBy('createdAt').orderBy(FieldPath.documentId()).limit(pageSize);
    const destination=args.out||path.resolve('.cache','impressions-analytics-export-'+Date.now()),output=deleting?null:IO.sink(destination);let cursor=null,total=0;
    try{while(true){const page=await(cursor?query.startAfter(cursor):query).get();if(page.empty)break;
        if(deleting&&args['confirm-delete']){const batch=db.batch();page.docs.forEach(doc=>batch.delete(doc.ref));await batch.commit();}
        else if(output)for(const doc of page.docs)await output.append(doc.id,doc.data());
        total+=page.size;cursor=page.docs.at(-1);if(page.size<pageSize)break;}
    }finally{if(output)await output.close();await db.terminate();}
    console.log(JSON.stringify({project:args.project,mode:deleting?args['confirm-delete']?'deleted':'delete-dry-run':'exported',records:total,cutoff:date.toISOString(),...(output?{directory:destination}:{})}));
})().catch(e=>{console.error('Analytics CLI: '+e.message);process.exitCode=1;});
