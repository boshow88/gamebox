/* Demo Firestore only. Never creates analytics in a production project. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createAnalyticsWriter} from '../../js/net/impressions-analytics.mjs';
const require=createRequire(new URL('./analytics/package.json',import.meta.url));
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing'),sdk=require('firebase/firestore');
sdk.setLogLevel('silent');
const emulator=process.env.FIRESTORE_EMULATOR_HOST;if(!emulator||!/^((127\.0\.0\.1|localhost):\d+)$/.test(emulator))throw Error('Use the loopback Firestore emulator with --project demo-gamebox.');
const [host,port]=emulator.split(':'),env=await initializeTestEnvironment({projectId:'demo-gamebox',firestore:{host,port:Number(port),rules:readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8')}});
const localRequire=createRequire(import.meta.url),A=localRequire('../../js/games/impressions/analytics.js'),fixture=localRequire('./helpers/analytics-fixture.js'),f=fixture({rounds:12,count:8,humans:1}),recorder=A.create();f.snapshots.forEach(recorder.observe);const record=recorder.record(f.game.matchId),id=await A.documentId(f.game.matchId);
const a=env.authenticatedContext('alice').firestore(),b=env.authenticatedContext('bob').firestore(),guest=env.authenticatedContext('anon',{firebase:{sign_in_provider:'anonymous'}}).firestore(),anon=env.unauthenticatedContext().firestore(),admin=env.authenticatedContext('owner',{email:'owner@example.com',email_verified:true}).firestore();
const ref=(db,suffix=id)=>sdk.doc(db,'memoryMatchAnalytics',suffix),data=()=>({...structuredClone(record),createdAt:sdk.serverTimestamp()});
try{
    await env.clearFirestore();await env.withSecurityRulesDisabled(async context=>{await sdk.setDoc(sdk.doc(context.firestore(),'config/admins'),{members:{'owner@example.com':{name:'Owner'}}});});
    await assertFails(sdk.setDoc(ref(anon),data()));console.log('Checking complete eight-actor create.');await assertSucceeds(sdk.setDoc(ref(a),data()));console.log('Eight-actor create accepted.');await assertFails(sdk.setDoc(ref(b),data()));
    await assertFails(sdk.getDoc(ref(a)));await assertFails(sdk.getDocs(sdk.collection(b,'memoryMatchAnalytics')));await assertFails(sdk.updateDoc(ref(a),{captureStatus:'complete'}));await assertFails(sdk.deleteDoc(ref(a)));
    await assertSucceeds(sdk.getDoc(ref(admin)));await assertSucceeds(sdk.getDocs(sdk.collection(admin,'memoryMatchAnalytics')));
    let serial=0;async function rejected(mutator){const d=data();mutator(d);await assertFails(sdk.setDoc(ref(a,(++serial).toString(16).padStart(64,'0')),d));}
    await rejected(d=>d.uid='private');await rejected(d=>d.participants[0].name='private');await rejected(d=>d.participants[0].controllerId='private');await rejected(d=>d.rounds[0].question.uid='private');await rejected(d=>d.rounds[0].observations[0].email='private');await rejected(d=>d.settings.roomCode='ABCD');await rejected(d=>d.createdAt=sdk.Timestamp.fromMillis(1));await rejected(d=>d.captureStatus='partial');await rejected(d=>d.verificationStatus='trusted');await rejected(d=>d.rounds=[]);
    await assertFails(sdk.setDoc(ref(a,'not-a-sha256'),data()));await assertSucceeds(sdk.setDoc(ref(guest,'f'.repeat(64)),data()));
    // Existing profiles, announcements, feedback and admin functions retain their rules.
    await assertSucceeds(sdk.setDoc(sdk.doc(a,'profiles/alice'),{best:7}));await assertFails(sdk.getDoc(sdk.doc(b,'profiles/alice')));await assertFails(sdk.setDoc(sdk.doc(a,'config/arbitrary'),{}));
    // Exercise the actual browser REST commit with Firebase-user mock tokens.
    const {createMockUserToken}=require('@firebase/util');let writerUid='rest-user';const writer=createAnalyticsWriter({projectId:'demo-gamebox',origin:'http://'+emulator,auth:{get currentUser(){return {getIdToken:async()=>createMockUserToken({sub:writerUid},{projectId:'demo-gamebox'})};}}});
    const restId='e'.repeat(64);assert.equal((await writer(restId,record)).status,'created');writerUid='another-user';assert.equal((await writer(restId,record)).status,'duplicate');await assertSucceeds(sdk.getDoc(ref(admin,restId)));
    const concurrent=await Promise.all([writer('c'.repeat(64),record),writer('c'.repeat(64),record)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),['created','duplicate']);
    console.log('Checking complete 100-round create.');const long=fixture({count:8,humans:1,rounds:100,category:'pitch'}),r=A.create();long.snapshots.forEach(r.observe);await assertSucceeds(sdk.setDoc(ref(a,'d'.repeat(64)),{...r.record(long.game.matchId),createdAt:sdk.serverTimestamp()}));
    await assertSucceeds(sdk.deleteDoc(ref(admin)));await assertFails(sdk.updateDoc(ref(admin,restId),{captureMode:'x'}));
    console.log('PASS: demo Firestore: authenticated/anonymous create; unauthenticated, read/list, update/delete, malformed identities/schema denied; admin read/delete; actual create-only REST duplicate; 100-round document; unchanged profile isolation.');
}finally{await env.cleanup();}
