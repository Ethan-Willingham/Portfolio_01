// Map the complete square computational domain onto a horizontal ellipse.
export const goldenRatio=(1+Math.sqrt(5))/2;
export function squareFromOval(x,y){
 const X=2*x-1,Y=2*y-1,a=2+X*X-Y*Y,b=2-X*X+Y*Y,c=2*Math.SQRT2;
 return {x:(Math.sqrt(Math.max(0,a+c*X))-Math.sqrt(Math.max(0,a-c*X))+2)/4,
         y:(Math.sqrt(Math.max(0,b+c*Y))-Math.sqrt(Math.max(0,b-c*Y))+2)/4};
}
export function ovalFromSquare(x,y){const X=2*x-1,Y=2*y-1;return{x:(X*Math.sqrt(1-Y*Y/2)+1)/2,y:(Y*Math.sqrt(1-X*X/2)+1)/2};}
export function filmRect(width,height,dpr=1){const w=Math.min(width*.96,Math.max(1,height-64*dpr)*goldenRatio),h=w/goldenRatio;return{left:(width-w)/2,top:(height-h)/2,width:w,height:h};}
export function filmPoint(x,y,rect){const X=(x-rect.left)/rect.width,Y=(y-rect.top)/rect.height;if((2*X-1)**2+(2*Y-1)**2>1)return null;return squareFromOval(X,Y);}
