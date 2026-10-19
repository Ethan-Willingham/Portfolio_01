'use strict';
const ORIGIN='widewake://game';
const EXTERNAL=new Set(['https://www.naturalearthdata.com/','https://ethanwillingham.com/archive.html']);
const CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
function localURL(value){
  try{const u=new URL(value);return u.protocol==='widewake:'&&u.hostname==='game'&&!u.port&&!u.username&&!u.password;}catch{return false;}
}
function assetPath(value,files){
  if(!localURL(value))return null;
  try{const name=decodeURIComponent(new URL(value).pathname).slice(1);return files.has(name)?name:null;}catch{return null;}
}
function externalURL(value){return EXTERNAL.has(value);}
function requestAllowed(value){return localURL(value)||value.startsWith('blob:'+ORIGIN+'/')||value.startsWith('data:');}
module.exports={ORIGIN,CSP,localURL,assetPath,externalURL,requestAllowed};
