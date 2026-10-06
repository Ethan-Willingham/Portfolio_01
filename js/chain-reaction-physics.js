/* Chain Reaction physics foundation. Classic script, shared by browser and Node. */
(function (global) {
  'use strict';
  const CR = global.ChainReaction = global.ChainReaction || {};
  const scriptURL = typeof document === 'undefined' ? null : document.currentScript.src;
  let ready;
  CR.physics = {
    VERSION: '0.1.0', ENGINE: 'rapier2d-deterministic-compat@0.21.0',
    DT: 1 / 240, GRAVITY: 193, LENGTH_UNIT: 19.68503937007874,
    async init(moduleURL) {
      if (!ready) ready = import(moduleURL || new URL('vendor/rapier2d-0.21.0/rapier.mjs', scriptURL).href)
        .then(async module => { const R = module.default; await R.init(); return R; });
      return ready;
    },
    mirror(definition) {
      return { ...definition, parts: definition.parts.map(p => ({...p,x:16-p.x,angle:-(p.angle||0),vx:-(p.vx||0),spin:-(p.spin||0)})),
        joints:(definition.joints||[]).map(j=>({...j,anchorA:{x:-j.anchorA.x,y:j.anchorA.y},anchorB:{x:-j.anchorB.x,y:j.anchorB.y}})),
        checks:(definition.checks||[]).map(c=>c.type==='maxX'?{type:'minX',id:c.id,min:16-c.max}:c) };
    },
    async create(definition, moduleURL) {
      const R = await this.init(moduleURL);
      const world = new R.World({ x: 0, y: -this.GRAVITY });
      world.timestep = this.DT;
      world.lengthUnit = this.LENGTH_UNIT;
      world.numSolverIterations = 12;
      world.maxCcdSubsteps = 4;
      world.integrationParameters.contact_natural_frequency = 240;
      world.integrationParameters.normalizedAllowedLinearError = 0.00001;
      world.integrationParameters.normalizedPredictionDistance = 0.002;
      const bodies = new Map();
      try {
        for (const part of definition.parts) {
          if (bodies.has(part.id)) throw Error('Duplicate part: ' + part.id);
          if (![part.x, part.y, part.angle || 0].every(Number.isFinite)) throw Error('Invalid pose: ' + part.id);
          if (part.fixed && !part.mount) throw Error('Fixed part has no mount: '+part.id);
          if (part.shape === 'ball' ? !Number.isFinite(part.radius) || part.radius <= 0 : part.shape !== 'box' || !Number.isFinite(part.width) || !Number.isFinite(part.height) || part.width <= 0 || part.height <= 0) throw Error('Invalid shape: '+part.id);
          for(const key of ['vx','vy','spin','density','friction','restitution'])if(part[key]!==undefined&&!Number.isFinite(part[key]))throw Error('Invalid '+key+': '+part.id);
          const desc = part.fixed ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic();
          desc.setTranslation(part.x, part.y).setRotation(part.angle || 0);
          if (!part.fixed) desc.setCcdEnabled(true).setLinvel(part.vx || 0, part.vy || 0).setAngvel(part.spin || 0);
          const body = world.createRigidBody(desc);
          const shape = part.shape === 'ball' ? R.ColliderDesc.ball(part.radius)
            : R.ColliderDesc.cuboid(part.width / 2, part.height / 2);
          shape.setDensity(part.density || 1).setFriction(part.friction ?? 0.45).setRestitution(part.restitution ?? 0.05);
          world.createCollider(shape, body);
          bodies.set(part.id, body);
        }
        for (const joint of definition.joints || []) {
          const a = bodies.get(joint.a), b = bodies.get(joint.b);
          if (!a || !b) throw Error('Unknown joint body');
          let desc;
          if (joint.type === 'revolute') desc = R.JointData.revolute(joint.anchorA, joint.anchorB);
          else if (joint.type === 'rope') desc = R.JointData.rope(joint.length, joint.anchorA, joint.anchorB);
          else if (joint.type === 'spring') desc = R.JointData.spring(joint.length, joint.stiffness, joint.damping, joint.anchorA, joint.anchorB);
          else throw Error('Unsupported joint: ' + joint.type);
          world.createImpulseJoint(desc, a, b, true).setContactsEnabled(false);
        }
        let tick = 0;
        const state = () => definition.parts.map(part => {
          const body = bodies.get(part.id), p = body.translation(), v = body.linvel();
          return { id: part.id, x: p.x, y: p.y, angle: body.rotation(), vx: v.x, vy: v.y, spin: body.angvel(), sleeping: body.isSleeping() };
        });
        return { world, bodies, state, get tick() { return tick; }, step(count = 1) {
          for (let i = 0; i < count; i++) { world.step(); tick++; }
          return tick;
        }, snapshot() { return world.takeSnapshot(); }, dispose() { world.free(); } };
      } catch (error) { world.free(); throw error; }
    }
  };
})(globalThis);
