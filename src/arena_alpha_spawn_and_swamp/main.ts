import { createConstructionSite } from "game";
import { searchPath } from "game/path-finder";
import { getObjectsByPrototype, findClosestByPath, getTicks, getRange, getDirection } from 'game/utils';
import { Creep, Source, StructureSpawn, StructureContainer, Structure, ConstructionSite, StructureTower, GameObject } from 'game/prototypes';
import {
  MOVE, WORK, CARRY, ATTACK, RANGED_ATTACK, HEAL, TOUGH, RESOURCE_ENERGY,
  ERR_NOT_IN_RANGE, ERR_NOT_ENOUGH_ENERGY, ERR_INVALID_ARGS, ERR_NOT_OWNER,
  BuildableStructure
} from 'game/constants';
import { runElseMove } from "tool";
import { Visual } from "game/visual";
enum CreepState {
  Idle,
  Avoiding,
  Healing,
  Attacking
}

declare module "game/prototypes" {
  interface Creep {
    initialPos: RoomPosition
    target?: Creep
    myHealers?: Creep[]
    historyHits?: number
    state?: CreepState
  }
}

let mySpawn: StructureSpawn | undefined;
let creeps: Creep[];
let workerCreeps: Creep[];
let warriorCreeps: Creep[];
let injuredCreeps: Creep[];
let containers: Structure[];

let enemySpawn: StructureSpawn | undefined;
let enemyCreeps: Creep[];
let enemyCombatCreeps: Creep[];
let enemyWorkerCreeps: Creep[];
let enemyHealerCreeps: Creep[];
let injuredEnemyCreeps: Creep[];

let closestEnergyContainerToSpawnPoint: Structure | null;
let closestEnergyContainerDistance: number | null = null;
let isAttacking: boolean = false;
let closestWarriorCreepToEnemySpawnPoint: Creep | null = null;

export function loop(): void {
  mySpawn = getObjectsByPrototype(StructureSpawn).find(i => i.my);
  creeps = getObjectsByPrototype(Creep).filter(i => i.my);
  workerCreeps = getObjectsByPrototype(Creep).filter(i => i.my && i.body.find(b => { return b.type === CARRY }));
  warriorCreeps = getObjectsByPrototype(Creep).filter(i => i.my && i.body.find(b => { return b.type === ATTACK || b.type === RANGED_ATTACK }));
  injuredCreeps = getObjectsByPrototype(Creep).filter(i => i.my && (i.hits != i.hitsMax && i.body.find(b => { return b.type === HEAL || b.type === RANGED_ATTACK })));
  containers = getObjectsByPrototype(StructureContainer).filter(c => { return c.store.getUsedCapacity(RESOURCE_ENERGY)! > 0 && !c.my });
  enemySpawn = getObjectsByPrototype(StructureSpawn).find(i => !i.my);
  enemyCreeps = getObjectsByPrototype(Creep).filter(creep => !creep.my);
  enemyCombatCreeps = getObjectsByPrototype(Creep).filter(creep => !creep.my && creep.body.find(b => { return b.hits > 0 && (b.type === ATTACK || b.type === RANGED_ATTACK) }));
  enemyWorkerCreeps = getObjectsByPrototype(Creep).filter(creep => !creep.my && creep.body.find(b => { return b.type === CARRY }));
  enemyHealerCreeps = getObjectsByPrototype(Creep).filter(creep => !creep.my && creep.body.find(b => { return b.type === HEAL }));
  injuredEnemyCreeps = getObjectsByPrototype(Creep).filter(creep => !creep.my && creep.hits < creep.hitsMax);

  if (enemySpawn) closestWarriorCreepToEnemySpawnPoint = enemySpawn.findClosestByPath(warriorCreeps);

  if (mySpawn) {
    closestEnergyContainerToSpawnPoint = mySpawn.findClosestByPath(containers);
    if (closestEnergyContainerToSpawnPoint) {
      closestEnergyContainerDistance = getRange(mySpawn, closestEnergyContainerToSpawnPoint);
    }

    if (closestEnergyContainerDistance && closestEnergyContainerDistance > 4) {
      isAttacking = true;
    }

    if (enemyCreeps.length > 0) {
      var closestEnemyToSpawnPoint = mySpawn.findClosestByPath(enemyCreeps);
      if (closestEnemyToSpawnPoint) {
        var closestEnemyDistance = getRange(mySpawn, closestEnemyToSpawnPoint);
        if (closestEnemyDistance < 20) {
          isAttacking = true;
        }
      }
    }
  }

  console.log(`Closest non-empty container is ${closestEnergyContainerDistance!} away with decay of ${closestEnergyContainerToSpawnPoint?.ticksToDecay}.`);
  console.log(`Creeps Length ${creeps.length}`);
  console.log(`🐞 Worker Creeps : ${workerCreeps.length}`);
  console.log(`🔫 Warrior Creeps : ${warriorCreeps.length}`);
  console.log(`💔 Injured Creeps : ${injuredCreeps.length}`);
  console.log(`⚠️ Enemy Creeps : ${enemyCreeps.length}`);
  console.log(`⚠️ Enemy Worker Creeps : ${enemyWorkerCreeps.length}`);
  console.log(`⚠️ Injured Enemy Creeps : ${injuredEnemyCreeps.length}`);

  spawnCreeps();
  workerCreeps.forEach(creep => assignWorker(creep));
  if (isAttacking)
    warriorCreeps.forEach(creep => assignWarriorFight(creep));
  else
    warriorCreeps.forEach(creep => assignWarriorSneak(creep));
}

function spawnCreeps() {
  if (mySpawn) {
    if (workerCreeps.length < 4) {
      console.log('Spawning Worker Creep');
      mySpawn.spawnCreep([MOVE, CARRY]).object;
    } else {
      if (closestEnergyContainerDistance && workerCreeps.length < 8 && closestEnergyContainerDistance > 4) {
        console.log('Spawning Worker Creep');
        mySpawn.spawnCreep([MOVE, CARRY]).object;
      } else {
        console.log('Spawning Warrior Creep');
        mySpawn.spawnCreep([TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, RANGED_ATTACK, RANGED_ATTACK, HEAL]).object;
      }
    }
  }
}

function flee(creep: Creep, targets: GameObject[], range: number) {
  const result = searchPath(
    creep,
    targets.map(i => ({ pos: i, range })),
    { flee: true }
  );
  if (result.path.length > 0) {
    const direction = getDirection(result.path[0].x - creep.x, result.path[0].y - creep.y);
    creep.move(direction);
  }
}

function assignWorker(creep: Creep): void {
  var enemiesInRange = creep.findInRange(enemyCombatCreeps, 10);
  if (enemiesInRange && enemiesInRange.length > 0) {
    // flee(creep, enemiesInRange, 10);
    if (mySpawn) creep.moveTo(mySpawn);
  }
  var container = creep.findClosestByPath(containers.filter(c => {
    // Figure out a good way of figuring out if we still have time.
    if (c.ticksToDecay)
      return c.getRangeTo(creep) < c.ticksToDecay
    else
      return true;
  }));
  if (container) {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) == creep.store.getCapacity(RESOURCE_ENERGY)) {
      if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        creep.moveTo(container);
      }
    } else {
      if (mySpawn) {
        if (creep.transfer(mySpawn, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          creep.moveTo(mySpawn);
        }
      }
    }
  }
}

function assignWarriorFight(creep: Creep): void {
  var closestEnemyCreep = creep.findClosestByRange(enemyCombatCreeps);
  if (closestEnemyCreep && creep.getRangeTo(closestEnemyCreep) < 2) {
    // flee(creep, [closestEnemyCreep], 3);
    if (mySpawn) creep.moveTo(mySpawn);
    return;
  }

  var closestInjuredCreep = creep.findClosestByRange(injuredCreeps);
  var creepId: number = +creep.id;
  if (closestInjuredCreep && creep.getRangeTo(closestInjuredCreep) < 3) {
    if (creepId % 2 === 0 && creep.rangedHeal(closestInjuredCreep) == ERR_NOT_IN_RANGE) {
      creep.moveTo(closestInjuredCreep);
      return;
    }
  }

  if (closestEnemyCreep) {
    if (creep.rangedAttack(closestEnemyCreep) == ERR_NOT_IN_RANGE)
      creep.moveTo(closestEnemyCreep);
    return;
  }

  if (enemySpawn) {
    if (creep.rangedAttack(enemySpawn) == ERR_NOT_IN_RANGE)
      creep.moveTo(enemySpawn);
    return;
  }
}

function assignWarriorSneak(creep: Creep): void {
  var closestEnemyCreep = creep.findClosestByRange(enemyCombatCreeps);
  if (closestEnemyCreep && creep.getRangeTo(closestEnemyCreep) < 2) {
    if (mySpawn) creep.moveTo(mySpawn);
    return;
  }

  var closestInjuredCreep = creep.findClosestByRange(injuredCreeps);
  if (closestInjuredCreep && creep.getRangeTo(closestInjuredCreep) < 3) {
    if (creep.rangedHeal(closestInjuredCreep) == ERR_NOT_IN_RANGE)
      creep.moveTo(closestInjuredCreep);
    return;
  }

  if (getTicks() % 25 === 0) {
    if (enemySpawn && closestWarriorCreepToEnemySpawnPoint)
      closestWarriorCreepToEnemySpawnPoint.moveTo(enemySpawn);
    if (!enemySpawn && closestWarriorCreepToEnemySpawnPoint)
      assignWarriorFight(creep);
  }
  if (closestWarriorCreepToEnemySpawnPoint && creep.id != closestWarriorCreepToEnemySpawnPoint.id) {
    console.log(`Shuffling up to lead.`);
    creep.moveTo(closestWarriorCreepToEnemySpawnPoint);
  }
}
