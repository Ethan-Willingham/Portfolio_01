export function rockerConstraints(mirrored = false) {
 return [{id: 'rocker-pull', kind: 'rope', from: 'rocker', to: 'outlet-latch', sourceMotion: {axis: 'angle', sign: mirrored ? 1 : -1, travel: .02}, motion: {axis: 'x', sign: mirrored ? 1 : -1, travel: .08}, requires: [{event: 'marble-tilt', marker: 'contactTick'}]}];
}
