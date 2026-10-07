// The mechanism-specific causes are data. The observer has no drawer-specific branch.
export function drawerConstraints(mirrored = false) {
 const sign = mirrored ? -1 : 1;
 return [
  {id: 'drawer-pull', kind: 'rope', from: 'weight', to: 'drawer', sourceMotion: {axis: 'y', sign: -1, travel: .002}, motion: {axis: 'x', sign, travel: .08}, requires: [{event: 'arrival-trip', marker: 'contactTick'}, {event: 'trip-latch', marker: 'contactTick'}, {clearPair: ['release-latch', 'weight']}]},
  {id: 'outlet-pull', kind: 'rope', from: 'drawer', to: 'outlet-latch', sourceMotion: {axis: 'x', sign, travel: .002}, motion: {axis: 'x', sign, travel: .08}, requires: [{event: 'arrival-trip', marker: 'contactTick'}, {constraint: 'drawer-pull'}]}
 ];
}
