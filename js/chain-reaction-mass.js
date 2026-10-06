/* Deterministic 3D mass models for the 2D solver. Only stored data and arithmetic. */
(function(global){
  'use strict';
  const CR=global.ChainReaction=global.ChainReaction||{},U=.0508,PI=3.141592653589793;
  CR.mass={VERSION:'0.1.0',properties(material,geometry){
    if(!material||!(material.densityKgM3>0))throw Error('Invalid bulk density');
    const rho=material.densityKgM3*U*U*U;
    const {width:w,height:h,depth:d,radius:r,thickness:t}=geometry;let mass,inertia;
    if(geometry.construction==='sphere'){
      if(!(r>0))throw Error('Invalid sphere');mass=rho*4/3*PI*r*r*r;inertia=mass*2/5*r*r;
    }else if(geometry.construction==='disk'){
      if(!(r>0&&d>0))throw Error('Invalid disk');mass=rho*PI*r*r*d;inertia=mass*r*r/2;
    }else{
      if(!(w>0&&h>0&&d>0))throw Error('Invalid stock dimensions');
      mass=rho*w*h*d;inertia=mass*(w*w+h*h)/12;
      if(geometry.construction==='shell'){
        if(!(t>0&&2*t<w&&2*t<h&&2*t<d))throw Error('Invalid shell thickness');
        const wi=w-2*t,hi=h-2*t,di=d-2*t,inside=rho*wi*hi*di;
        mass-=inside;inertia-=inside*(wi*wi+hi*hi)/12;
      }else if(geometry.construction!=='box')throw Error('Unknown mass construction');
    }
    if(!Number.isFinite(mass)||!Number.isFinite(inertia)||mass<=0||inertia<=0)throw Error('Invalid mass result');
    return {mass,inertia};
  }};
})(globalThis);
