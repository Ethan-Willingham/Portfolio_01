/* Empirical field-trial estimator. Visual particles never become recovery data. */
(function(root){
'use strict';
var classes=['coarse','medium','fine','very-fine','ultra-fine'];
function finite(value){return typeof value==='number' && Number.isFinite(value);}
function validate(raw){
 if(!raw || typeof raw!=='object')throw Error('Enter a measured field run.');
 var t={lengthInches:Number(raw.lengthInches),liner:String(raw.liner||'').trim(),goldClass:String(raw.goldClass||''),
  slopeDeg:Number(raw.slopeDeg),flowGpm:Number(raw.flowGpm),feedLbMin:Number(raw.feedLbMin),
  goldInMg:Number(raw.goldInMg),goldRecoveredMg:Number(raw.goldRecoveredMg)};
 if(t.lengthInches!==36 && t.lengthInches!==51)throw Error('Choose the measured 36 or 51 inch box.');
 if(!t.liner || t.liner.length>80)throw Error('Name the actual mat and riffle assembly.');
 if(!classes.includes(t.goldClass))throw Error('Choose the measured gold size class.');
 if(!finite(t.slopeDeg) || t.slopeDeg<=0 || t.slopeDeg>15)throw Error('Enter a measured slope from 0 to 15 degrees.');
 if(!finite(t.flowGpm) || t.flowGpm<=0 || t.flowGpm>1000)throw Error('Enter measured water flow in US gallons per minute.');
 if(!finite(t.feedLbMin) || t.feedLbMin<=0 || t.feedLbMin>2000)throw Error('Enter measured paydirt feed in pounds per minute.');
 if(!finite(t.goldInMg) || t.goldInMg<=0 || t.goldInMg>10000000 || !finite(t.goldRecoveredMg) || t.goldRecoveredMg<0 || t.goldRecoveredMg>t.goldInMg)
  throw Error('Recovered gold must be between zero and the known starting mass.');
 return t;
}
function sameHardware(a,b){return a.lengthInches===b.lengthInches && a.liner.trim().toLowerCase()===b.liner.trim().toLowerCase() && a.goldClass===b.goldClass;}
function distance(a,b){
 var water=Math.log(a.flowGpm/b.flowGpm)/Math.log(1.5);
 var feed=Math.log(a.feedLbMin/b.feedLbMin)/Math.log(1.5);
 var slope=(a.slopeDeg-b.slopeDeg)/1.5;
 return Math.hypot(water,feed,slope)/Math.sqrt(3);
}
function rate(t){return t.goldRecoveredMg/t.goldInMg;}
function mean(values){return values.reduce(function(sum,v){return sum+v;},0)/values.length;}
function weighted(query,rows){
 var nearest=rows.map(function(row){return {row:row,d:distance(query,row)};}).sort(function(a,b){return a.d-b.d;}).slice(0,Math.min(6,rows.length));
 var sum=0,weight=0;
 nearest.forEach(function(item){var w=1/Math.pow(.15+item.d,2);sum+=w*rate(item.row);weight+=w;});
 return {rate:sum/weight,nearest:nearest[0].d};
}
function estimate(rawTrials,rawQuery){
 var query=validate(Object.assign({},rawQuery,{goldInMg:1,goldRecoveredMg:0}));
 var trials=rawTrials.map(function(row){try{return validate(row);}catch(error){return null;}}).filter(Boolean).filter(function(row){return sameHardware(row,query);});
 if(!trials.length)return {status:'no-runs',count:0};
 var exact=trials.filter(function(row){return distance(query,row)<.12;});
 if(exact.length>=3){
  var rates=exact.map(rate),average=mean(rates);
  return {status:'repeat',count:exact.length,rate:average,low:Math.min.apply(null,rates),high:Math.max.apply(null,rates)};
 }
 if(trials.length<8)return {status:'need-runs',count:trials.length};
 var keys=['flowGpm','feedLbMin','slopeDeg'];
 for(var i=0;i<keys.length;i++){
  var key=keys[i],min=Math.min.apply(null,trials.map(function(row){return row[key];})),max=Math.max.apply(null,trials.map(function(row){return row[key];}));
  // A fixed tested setting admits only a near-identical query. An observed
  // range admits interpolation but never a prediction outside its endpoints.
  var tolerance=key==='slopeDeg'?.2:min*.05;
  if(query[key]<min-tolerance || query[key]>max+tolerance)return {status:'outside',count:trials.length,field:key,min:min,max:max};
 }
 var fit=weighted(query,trials);
 if(fit.nearest>.75)return {status:'gap',count:trials.length};
 var errors=trials.map(function(row,index){return weighted(row,trials.filter(function(_,j){return j!==index;})).rate-rate(row);});
 var rmse=Math.sqrt(mean(errors.map(function(e){return e*e;})));
 // This is an empirical error band, not a confidence interval. The minimum
 // width prevents an implausibly precise readout from a small trial set.
 var halfWidth=Math.max(.10,2*rmse);
 return {status:'interpolated',count:trials.length,rate:fit.rate,low:Math.max(0,fit.rate-halfWidth),high:Math.min(1,fit.rate+halfWidth),heldOutError:rmse};
}
root.WSSSluiceCalibration={validate:validate,estimate:estimate,classes:classes};
})(typeof window!=='undefined'?window:globalThis);
