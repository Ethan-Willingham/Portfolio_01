/* Chain Reaction physics foundation. Classic script, shared by browser and Node. */
(function (global) {
  'use strict';
  const CR = global.ChainReaction = global.ChainReaction || {};
  const scriptURL = typeof document === 'undefined' ? null : document.currentScript.src;
  let ready;
  CR.physics = {
    VERSION: '0.2.0', ENGINE: 'rapier2d-deterministic-compat@0.21.0',
    DT: 1 / 240, GRAVITY: 193, LENGTH_UNIT: 19.68503937007874,
    async init(moduleURL) {
      if (!ready) ready = import(moduleURL || new URL('vendor/rapier2d-0.21.0/rapier.mjs', scriptURL).href)
        .then(async module => { const R = module.default; await R.init(); return R; });
      return ready;
    },
    mirror(definition) {
      return { ...definition, parts: definition.parts.map(p => ({...p,x:16-p.x,angle:-(p.angle||0),vx:-(p.vx||0),spin:-(p.spin||0),...(p.colliders?{colliders:p.colliders.map(c=>({...c,x:-(c.x||0),angle:-(c.angle||0)}))}:{}),...(p.centerOfMass?{centerOfMass:{x:-p.centerOfMass.x,y:p.centerOfMass.y}}:{})})),
        joints:(definition.joints||[]).map(j=>({...j,anchorA:{x:-j.anchorA.x,y:j.anchorA.y},anchorB:{x:-j.anchorB.x,y:j.anchorB.y},...(j.axis?{axis:{x:-j.axis.x,y:j.axis.y}}:{}),...(j.type==='revolute'&&j.limits?{limits:[-j.limits[1],-j.limits[0]]}:{})})),
        ...(definition.steps?{steps:definition.steps.map(s=>({...s,motion:{...s.motion,sign:['x','angle'].includes(s.motion?.axis)?-s.motion.sign:s.motion?.sign}}))}:{}),
        checks:(definition.checks||[]).map(c=>c.type==='maxX'?{type:'minX',id:c.id,min:16-c.max}:c) };
    },
    async create(definition, moduleURL) {
      const R = await this.init(moduleURL);
      if (definition.contactProfile && definition.contactProfile !== 'fresh-v1') throw Error('Unknown contact profile');
      // Rapier's scale-dependent contact recycling can retain support across a
      // thin latch's entire travel. An identity hook requests fresh contacts;
      // every permitted pair still receives the ordinary solver impulse.
      const hooks = definition.contactProfile === 'fresh-v1' ? {
        filterContactPair: () => R.SolverFlags.COMPUTE_IMPULSE,
        filterIntersectionPair: () => true
      } : undefined;
      const world = new R.World({ x: 0, y: -this.GRAVITY });
      world.timestep = this.DT;
      world.lengthUnit = this.LENGTH_UNIT;
      world.numSolverIterations = 12;
      world.maxCcdSubsteps = 4;
      world.integrationParameters.contact_natural_frequency = 240;
      world.integrationParameters.normalizedAllowedLinearError = 0.00001;
      world.integrationParameters.normalizedPredictionDistance = 0.002;
      const bodies = new Map(), colliderIds = new Map(), impulses = new Map();
      const eventQueue = (definition.causality || definition.steps) ? new R.EventQueue(true) : null;
      try {
        for (const part of definition.parts) {
          if (bodies.has(part.id)) throw Error('Duplicate part: ' + part.id);
          if (![part.x, part.y, part.angle || 0].every(Number.isFinite)) throw Error('Invalid pose: ' + part.id);
          if (part.fixed && !part.mount) throw Error('Fixed part has no mount: '+part.id);
          if (part.shape!=='compound' && (part.shape === 'ball' ? !Number.isFinite(part.radius) || part.radius <= 0 : part.shape !== 'box' || !Number.isFinite(part.width) || !Number.isFinite(part.height) || part.width <= 0 || part.height <= 0)) throw Error('Invalid shape: '+part.id);
          for(const key of ['vx','vy','spin','density','mass','inertia','friction','restitution'])if(part[key]!==undefined&&!Number.isFinite(part[key]))throw Error('Invalid '+key+': '+part.id);
          if (part.mass !== undefined && (part.mass <= 0 || !Number.isFinite(part.inertia) || part.inertia <= 0)) throw Error('Invalid mass properties: '+part.id);
          const desc = part.fixed ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic();
          desc.setTranslation(part.x, part.y).setRotation(part.angle || 0);
          if (!part.fixed) desc.setCcdEnabled(part.ccd??true).setLinvel(part.vx || 0, part.vy || 0).setAngvel(part.spin || 0);
          if(part.shape==='compound'){
            if(!part.colliders?.length||part.mass===undefined)throw Error('Compound body requires geometry and exact mass');
            desc.setAdditionalMassProperties(part.mass,part.centerOfMass||{x:0,y:0},part.inertia);
          }
          if(!part.fixed&&definition.noSleep)desc.setCanSleep(false);
          const body = world.createRigidBody(desc);
          if(part.shape==='compound'){
            for(const c of part.colliders){
              if(c.shape==='ball'?!(c.radius>0):c.shape!=='box'||!(c.width>0&&c.height>0))throw Error('Invalid compound collider');
              const shape=c.shape==='ball'?R.ColliderDesc.ball(c.radius):R.ColliderDesc.cuboid(c.width/2,c.height/2);
              shape.setTranslation(c.x||0,c.y||0).setRotation(c.angle||0).setDensity(0).setFriction(part.friction??.45).setRestitution(part.restitution??.05);
              const layer=c.layer??part.layer;
              if(layer)shape.setCollisionGroups((layer<<16)|layer);
              if(hooks)shape.setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS);
              if(eventQueue)shape.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS);
              colliderIds.set(world.createCollider(shape,body).handle,part.id);
            }
            bodies.set(part.id,body);continue;
          }
          const shape = part.shape === 'ball' ? R.ColliderDesc.ball(part.radius)
            : R.ColliderDesc.cuboid(part.width / 2, part.height / 2);
          shape.setDensity(part.density || 1).setFriction(part.friction ?? 0.45).setRestitution(part.restitution ?? 0.05);
          if (part.mass !== undefined) shape.setMassProperties(part.mass, {x:0,y:0}, part.inertia);
          if(part.layer)shape.setCollisionGroups((part.layer<<16)|part.layer);
          if(hooks)shape.setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS);
          if (eventQueue) shape.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS);
          const collider = world.createCollider(shape, body);
          colliderIds.set(collider.handle, part.id);
          bodies.set(part.id, body);
        }
        for (const joint of definition.joints || []) {
          const a = bodies.get(joint.a), b = bodies.get(joint.b);
          if (!a || !b) throw Error('Unknown joint body');
          let desc;
          if (joint.type === 'revolute') desc = R.JointData.revolute(joint.anchorA, joint.anchorB);
          else if (joint.type === 'rope') desc = R.JointData.rope(joint.length, joint.anchorA, joint.anchorB);
          else if (joint.type === 'spring') desc = R.JointData.spring(joint.length, joint.stiffness, joint.damping, joint.anchorA, joint.anchorB);
          else if(joint.type==='prismatic')desc=R.JointData.prismatic(joint.anchorA,joint.anchorB,joint.axis);
          else throw Error('Unsupported joint: ' + joint.type);
          const created=world.createImpulseJoint(desc,a,b,true);created.setContactsEnabled(false);
          if(joint.limits){if(!['prismatic','revolute'].includes(joint.type)||joint.limits.length!==2||!joint.limits.every(Number.isFinite)||joint.limits[0]>joint.limits[1])throw Error('Invalid joint limits');created.setLimits(joint.limits[0],joint.limits[1]);}
        }
        let tick = 0;
        const dt = this.DT;
        const state = () => definition.parts.map(part => {
          const body = bodies.get(part.id), p = body.translation(), v = body.linvel();
          return { id: part.id, x: p.x, y: p.y, angle: body.rotation(), vx: v.x, vy: v.y, spin: body.angvel(), sleeping: body.isSleeping() };
        });
        const contactImpulse = (a, b) => {
          if (!bodies.has(a) || !bodies.has(b)) throw Error('Unknown contact body');
          let impulse = 0;
          for(let i=0;i<bodies.get(a).numColliders();i++)for(let j=0;j<bodies.get(b).numColliders();j++)world.contactPair(bodies.get(a).collider(i), bodies.get(b).collider(j), manifold => {
            for (let i = 0; i < manifold.numContacts(); i++) impulse += Math.max(0, manifold.contactImpulse(i));
          });
          return Math.max(impulse,impulses.get([a,b].sort().join('|'))||0);
        };
        return { world, bodies, state, contactImpulse, get tick() { return tick; }, step(count = 1) {
          for (let i = 0; i < count; i++) {
            impulses.clear();world.step(eventQueue || undefined,hooks);tick++;
            if (eventQueue) eventQueue.drainContactForceEvents(event => {
              const a = colliderIds.get(event.collider1()), b = colliderIds.get(event.collider2());
              const key = [a,b].sort().join('|');
              impulses.set(key,(impulses.get(key)||0)+event.totalForceMagnitude()*dt);
            });
          }
          return tick;
        }, snapshot() { return world.takeSnapshot(); }, dispose() { eventQueue?.free();world.free(); } };
      } catch (error) { eventQueue?.free();world.free();throw error; }
    }
  };
})(globalThis);
