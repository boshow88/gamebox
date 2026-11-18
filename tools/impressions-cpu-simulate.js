/** node tools/impressions-cpu-simulate.js [--samples=2000] [--output=.cache/impressions-cpu-simulation.json] */
'use strict';
const fs=require('node:fs'),D=require('./helpers/impressions-cpu-diagnostics.js'),Cpu=require('../js/games/impressions-cpu.js');
const args=process.argv.slice(2),samples=Number(args.find(a=>a.startsWith('--samples='))?.split('=')[1]||2000),output=args.find(a=>a.startsWith('--output='))?.slice(9),rows=[];
for(const testCase of D.cases())for(const level of Cpu.levels)rows.push(D.runCase(testCase,level,samples));
const report={source:'synthetic',cpuVersion:Cpu.version,samplesPerVariantStageDifficulty:samples,parameters:Cpu.configuration(),rows,summary:D.aggregate(rows)};
if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
for(const row of report.summary)console.log(row.category+' L'+row.difficulty+' N='+row.n+' mean='+row.mean.toFixed(2)+' median='+row.scores.median.toFixed(2)+' P10–P90='+row.scores.p10.toFixed(2)+'–'+row.scores.p90.toFixed(2)+' perfect='+(row.perfectRate*100).toFixed(2)+'%');
console.log('Synthetic diagnostics only; not evidence of human-equivalent difficulty. '+rows.reduce((s,r)=>s+r.scores.n,0)+' actual answers graded.');
