(function (root) {
  'use strict';
  const O = root.OneShift;
  // Code 128 symbol widths, including start C and stop. FNC1 is symbol 102.
  const widths = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');
  function digit(value) {
    if (!/^\d+$/.test(value)) throw new Error('Numeric digits required.');
    let sum = 0;
    for (let i=value.length-1,w=3;i>=0;i--,w=4-w) sum += Number(value[i])*w;
    return String((10-sum%10)%10);
  }
  function sscc(serial) {
    const body = '0'+'0614141'+String(serial).padStart(9,'0');
    if (body.length!==17) throw new Error('SSCC serial out of range.');
    return body+digit(body);
  }
  function encode(value) {
    if (!/^\d{18}$/.test(value)||digit(value.slice(0,17))!==value[17]) throw new Error('Invalid SSCC.');
    const data='00'+value, symbols=[105,102];
    for(let i=0;i<data.length;i+=2) symbols.push(Number(data.slice(i,i+2)));
    let checksum=105;
    for(let i=1;i<symbols.length;i++) checksum+=i*symbols[i];
    symbols.push(checksum%103,106);
    const bars=[]; let x=10;
    for(const symbol of symbols) for(let i=0;i<widths[symbol].length;i++) {
      const w=Number(widths[symbol][i]); if(i%2===0) bars.push({x,w}); x+=w;
    }
    return {symbols,bars,width:x+10,text:'(00) '+value};
  }
  O.labels={digit,sscc,encode,widths};
})(typeof globalThis !== 'undefined' ? globalThis : window);
