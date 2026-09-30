// Verify real search behavior on shared mazes, without a browser or renderer.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/random-galaxy.js'), 'utf8');
const core = source.slice(source.indexOf('  var SEARCH_N ='), source.indexOf('  // ===== LOOP-TRANSITION STYLES'));
const route = source.slice(source.indexOf('  function searchBuildActiveLine()'), source.indexOf('  function isSearchField('));
let seed = 1;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const math = Object.create(Math); math.random = random;
const ctx = vm.createContext({Math:math, positions:new Float32Array((56**3+24000)*4), estimateRouteCount:()=>''});
vm.runInContext(core + route, ctx);
function build(n, s) { seed=s;ctx.SEARCH_N=n;vm.runInContext('searchEnsure();searchBuildLattice();',ctx); }
function adjacent(a,b,n) {
  const xyz=i=>[Math.floor(i/(n*n)),Math.floor(i/n)%n,i%n];
  const x=xyz(a),y=xyz(b),d=x.map((v,i)=>Math.abs(v-y[i]));
  return a!==b&&Math.min(d[0],n-d[0])<=1&&Math.min(d[1],n-d[1])<=1&&d[2]<=1;
}
function run(algo, watchStack=false) {
  ctx.algo=algo;vm.runInContext('searchInit(algo)',ctx);
  const p=ctx.pf;let iterations=0,pops=0;
  while(!p.done&&!p.reached&&iterations++<p.total*2+1) {
    const depth=p.stackN,head=p.lastClosed;ctx.searchStep();
    if(watchStack) {
      assert.ok(Math.abs(p.stackN-depth)===1,'DFS moves exactly one branch edge per step');
      if(p.stackN)assert.equal(p.lastClosed,p.stack[p.stackN-1],'DFS head is the active stack tip');
      if(p.stackN<depth){pops++;if(p.stackN)assert.equal(p.lastClosed,p.came[head],'DFS backs out to its parent');}
      else assert.equal(p.came[p.lastClosed],head,'DFS extends the current branch');
    }
  }
  assert.ok(p.done||p.reached,algo+' terminates');
  let node=p.end,length=0;
  if(p.reached) {
    while(node!==p.start&&length<p.total) {
      const parent=p.came[node];assert.ok(parent>=0&&!p.wall[parent]&&adjacent(node,parent,p.N),algo+' route stays on open neighbouring cells');
      node=parent;length++;
    }
    assert.equal(node,p.start,algo+' route reaches its start');
  }
  ctx.searchTracePath();ctx.searchBuildActiveLine();
  assert.ok(p.lineCount<=24000,'route respects its GPU buffer budget');
  return {reached:p.reached,length,steps:p.steps,pops};
}
let saved=0,backtracks=0;
for(const n of [10,14,18,56])for(let s=1;s<=(n===56?2:4);s++) {
  build(n,s*9349);const bfs=run('bfs'),astar=run('astar');
  assert.ok(bfs.reached&&astar.reached,'the generated torus is connected');
  assert.equal(astar.length,bfs.length,'A* agrees with BFS shortest route on the same maze');
  saved+=bfs.steps-astar.steps;
  if(n!==56) {const dfs=run('dfs',true);assert.ok(dfs.reached);backtracks+=dfs.pops;}
}
assert.ok(saved>0,'A* focuses work toward the goal');
assert.ok(backtracks>0,'DFS fixtures exercise dead ends and backtracking');
build(6,3);ctx.pf.wall.fill(0);ctx.pf.start=5;ctx.pf.end=(5*6+5)*6+4;
assert.equal(run('astar').length,1,'A* uses a diagonal across both wrapped seams');
ctx.pf.wall.fill(1);ctx.pf.wall[ctx.pf.start]=0;ctx.pf.end=100;ctx.pf.wall[ctx.pf.end]=0;
for(const algo of ['bfs','astar','dfs'])assert.equal(run(algo).reached,false,algo+' handles a disconnected goal');
console.log('PASS A* matches BFS on 14 shared mazes, including full-size toruses');
console.log('PASS DFS takes single-edge steps and backtracks through '+backtracks+' dead ends');
console.log('PASS wrapped diagonals, disconnected goals, valid routes and buffer limits');
