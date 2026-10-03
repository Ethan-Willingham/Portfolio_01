// Periodic MAC grid reference. Domain is 2 by 1 in dimensionless units.
export const DOMAIN=[2,1],DT=1/60;
export function seedValue(seed='5eedc0de1234abcd'){return parseInt(seed.slice(-8),16)>>>0;}
export function modes(seed='5eedc0de1234abcd',forcing=false){let x=seedValue(seed)||1;const rnd=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};return Array.from({length:6},(_,i)=>{const kx=forcing?4+i%4:1+i%3,ky=forcing?3+i%3:1+Math.floor(i/3);return [kx,ky,rnd()*2*Math.PI,(forcing?.004:.018)/Math.hypot(kx,ky),.12+.24*rnd()];});}
export function streamAt(x,y,m,time=0){return m.reduce((s,[kx,ky,phase,amp,speed])=>s+amp*Math.cos(2*Math.PI*(kx*x+ky*y)+phase+time*speed),0);}
export function initialVelocity(n,seed='5eedc0de1234abcd'){const a=new Float64Array(n*n*2),m=modes(seed),hx=2/n,hy=1/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=2*(x+n*y),p=streamAt(x/n,y/n,m);a[i]=(streamAt(x/n,(y+1)/n,m)-p)/hy;a[i+1]=-(streamAt((x+1)/n,y/n,m)-p)/hx;}return a;}
export function divergence(a,n){const d=new Float64Array(n*n),idx=(x,y)=>2*((x+n)%n+n*((y+n)%n));for(let y=0;y<n;y++)for(let x=0;x<n;x++)d[x+n*y]=(a[idx(x+1,y)]-a[idx(x,y)])*n/2+(a[idx(x,y+1)+1]-a[idx(x,y)+1])*n;return d;}
export function fft(real,imag,inverse=false){const n=real.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}}for(let len=2;len<=n;len*=2)for(let i=0;i<n;i+=len)for(let j=0;j<len/2;j++){const t=(inverse?2:-2)*Math.PI*j/len,c=Math.cos(t),s=Math.sin(t),a=i+j,b=a+len/2,tr=c*real[b]-s*imag[b],ti=s*real[b]+c*imag[b];real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;}if(inverse)for(let i=0;i<n;i++){real[i]/=n;imag[i]/=n;}}
export function pressure(rhs,n){const r=rhs.slice(),im=new Float64Array(r.length);const transform=inverse=>{for(let axis=0;axis<2;axis++)for(let k=0;k<n;k++){const re=new Float64Array(n),ai=new Float64Array(n);for(let j=0;j<n;j++){const i=axis? k+n*j:j+n*k;re[j]=r[i];ai[j]=im[i];}fft(re,ai,inverse);for(let j=0;j<n;j++){const i=axis?k+n*j:j+n*k;r[i]=re[j];im[i]=ai[j];}}};transform(false);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=x+n*y,lambda=-4*(Math.sin(Math.PI*x/n)**2*(n/2)**2+Math.sin(Math.PI*y/n)**2*n*n);if(i){r[i]/=lambda;im[i]/=lambda;}else{r[i]=im[i]=0;}}transform(true);return r;}
export function project(a,n){const p=pressure(divergence(a,n),n),out=a.slice(),idx=(x,y)=>(x+n)%n+n*((y+n)%n);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=idx(x,y);out[2*i]-=(p[i]-p[idx(x-1,y)])*n/2;out[2*i+1]-=(p[i]-p[idx(x,y-1)])*n;}return out;}
export function rms(a){return Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);}
export function transportDye(original,velocity,n,dyeSize,{dt=DT,time=0,seed='5eedc0de1234abcd',sources=true}={}){
 const wrap=(x,size)=>(x%size+size)%size;
 const sample=(a,size,x,y,channels,k)=>{const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,at=(xx,yy)=>a[channels*(wrap(xx,size)+size*wrap(yy,size))+k];return (1-fy)*((1-fx)*at(x0,y0)+fx*at(x0+1,y0))+fy*((1-fx)*at(x0,y0+1)+fx*at(x0+1,y0+1));};
 const vel=([x,y])=>[sample(velocity,n,x*n/2,y*n-.5,2,0),sample(velocity,n,x*n/2-.5,y*n,2,1)];
 const back=(pos,h)=>{const a=vel(pos),b=vel([pos[0]-.5*h*a[0],pos[1]-.5*h*a[1]]);return [pos[0]-h*b[0],pos[1]-h*b[1]];};
 const forward=new Float64Array(original.length),out=new Float64Array(original.length);
 for(let y=0;y<dyeSize;y++)for(let x=0;x<dyeSize;x++){const i=4*(x+dyeSize*y),pos=back([(x+.5)*2/dyeSize,(y+.5)/dyeSize],dt);for(let k=0;k<4;k++)forward[i+k]=sample(original,dyeSize,pos[0]*dyeSize/2-.5,pos[1]*dyeSize-.5,4,k);}
 for(let y=0;y<dyeSize;y++)for(let x=0;x<dyeSize;x++){const i=4*(x+dyeSize*y),pos=[(x+.5)*2/dyeSize,(y+.5)/dyeSize],b=back(pos,dt),r=back(pos,-dt),x0=Math.floor(b[0]*dyeSize/2-.5),y0=Math.floor(b[1]*dyeSize-.5);
  for(let k=0;k<3;k++){const nodes=[[x0,y0],[x0+1,y0],[x0,y0+1],[x0+1,y0+1]].map(([xx,yy])=>original[4*(wrap(xx,dyeSize)+dyeSize*wrap(yy,dyeSize))+k]),reverse=sample(forward,dyeSize,r[0]*dyeSize/2-.5,r[1]*dyeSize-.5,4,k);let value=Math.min(Math.max(forward[i+k]+.5*(original[i+k]-reverse),Math.min(...nodes)),Math.max(...nodes));if(sources){value*=Math.exp(-dt*.006);const phase=2*Math.PI*(pos[0]+pos[1])+time*.16+seedValue(seed)/4294967296*Math.PI*2+k*2.0944;const wave=(.5+.5*Math.cos(phase))**12,weight=1-Math.exp(-dt*.018);value=value*(1-weight)+wave*weight;}out[i+k]=Math.min(1,Math.max(0,value));}out[i+3]=1;
 }
 return out;
}
