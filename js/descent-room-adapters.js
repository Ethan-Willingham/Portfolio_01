// Host presentation and documented public extensions. The three source modules
// retain all equations, parameters, diagnostics and resource ownership.
export function configureRoom(id,room,{hydrogenMode='spectral'}={}) {
  if(id==='hydrogen-exactly' && typeof room.setMode==='function') room.setMode(hydrogenMode);
}
export const exposureFor = id => id === 'soap-film' ? 12 : 1;
export const parametersOf = s => s?.parameters ?? s?.parameterValues ?? null;
export function roomPresentation(id,s) {
  const d=s.diagnostics ?? {};
  if(id==='soap-film')return{
    explanation:'Light reflected from a moving soap film changes color as the film thins. This flat, reduced fluid model tracks thickness and temperature; it does not resolve surfactant molecules.',
    clock:s.elapsedConvention ?? 'Seconds in the reduced model; rupture playback is slowed.',
    units:s.simulationTimeUnits,
    colors:'Interference reflectance under D65 illumination, integrated with the CIE observer; no route palette override.',
    observables:{'Thickness range (nm)':d.thicknessRangeNm,'Film state':d.state,'Volume balance error (m3)':d.massBalanceErrorM3,'Maximum divergence (1/s)':d.divergenceMaxPerSecond},
    event:{pending:d.state==='rupturing'||(d.state==='intact'&&d.thicknessRangeNm?.[0]<=1.1*s.parameters?.ruptureNm),complete:d.state==='rest',label:'Measured thickness within 10% of rupture threshold, or rupture in progress'}
  };
  if(id==='negative-temperature')return{
    explanation:'A simulated superfluid is stirred and then left to evolve. The small dark cores are vortices. The room measures their circulation and clustering; it does not estimate a negative temperature.',
    clock:`${s.parameters?.solverUnitsPerSecond ?? 'Unspecified'} solver units per watching second. The paddle protocol belongs to the model.`,
    units:s.simulationTimeUnits ?? s.simulationUnits,
    colors:'Density brightness with a faint phase tint. Temperature is not a color measurement.',
    observables:{'Norm':d.norm,'Norm drift':d.normDrift,'Energy':d.energy,'Energy drift after stirring':d.conservativeEnergyDrift,'Vortex count':d.vortexCount ?? d.vortices?.length,'Net circulation':d.netCirculation ?? d.circulation,'Largest cluster':d.largestCluster,'Temperature':s.temperatureStatus ?? d.temperatureStatus,'Protocol':s.phase,'Diagnostic age (solver steps)':s.diagnosticAgeSteps},
    event:{pending:['Stirring','Withdrawing'].includes(s.phase),complete:!['Stirring','Withdrawing'].includes(s.phase),label:'Model paddle sweep and withdrawal'}
  };
  if(id==='hydrogen-exactly')return{
    explanation:s.mode==='spectral'?'Four low-n hydrogen states interfere as their phases evolve. Brightness shows probability density; the spectral colors encode beat frequencies and do not depict emitted radiation.':'A circular hydrogen packet centered on n = 30 spreads and partially recovers. Its characteristic radius is about 48 nm. Brightness shows probability density; the packet\'s infrared beats are not visible emission.',
    clock:`Local piece clock mapped to ${s.parameterValues?.atomicUnitsPerDisplaySecond ?? 'unspecified'} atomic units per watching second.`,
    units:s.simulationTimeUnits,
    colors:s.mode==='spectral'?'False color of visible beat frequencies; not radiated light. Infrared pairs do not acquire a visible spectral color.':s.parameterValues?.colorEncoding==='density false color'?'Arbitrary density false color; the packet\'s infrared beats are not shown as visible spectral light.':'Single density tint; infrared beat frequencies are not shown as visible spectral light.',
    observables:{'Mode':s.mode,'Basis norm':s.analyticNorm,'Autocorrelation':s.autocorrelation,'Rotation-adjusted overlap':s.rotationAdjustedOverlap,'Finite-grid captured mass':s.spatialCapturedMass,'Grid':s.parameterValues?.grid,'Basis states':s.parameterValues?.states?.length,'Measurement limitations':s.unavailableMeasurements},
    event:s.routeEvent
  };
  return{explanation:s.explanation??s.model,clock:s.timeAxisMeaning,units:s.simulationTimeUnits,colors:s.colorMeaning,observables:s.diagnostics??{},event:s.routeEvent};
}
