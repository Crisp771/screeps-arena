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
  Attacking,
  Defending,
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
let myTowers: StructureTower[];
let creeps: Creep[];
let workerCreeps: Creep[];
let builderCreeps: Creep[];
let warriorCreeps: Creep[];
let healerCreeps: Creep[];
let injuredCreeps: Creep[];
let containers: Structure[];

let enemySpawn: StructureSpawn | undefined;
let enemyCreeps: Creep[];
let enemyCombatCreeps: Creep[];
let enemyWorkerCreeps: Creep[];
let enemyHealerCreeps: Creep[];
let injuredEnemyCreeps: Creep[];

let constructionSite: ConstructionSite<BuildableStructure> | undefined

let isAttacking: boolean = false;

export function loop(): void {
  mySpawn = getObjectsByPrototype(StructureSpawn).find(i => i.my);
  // myTowers = getObjectsByPrototype(StructureTower).filter(i => i.my);
  creeps = getObjectsByPrototype(Creep).filter(i => i.my);
  builderCreeps = getObjectsByPrototype(Creep).filter(i => i.my && i.body.find(b => { return b.type === WORK }));
  workerCreeps = getObjectsByPrototype(Creep).filter(i => i.my && i.body.find(b => { return b.type === CARRY }));
  warriorCreeps = getObjectsByPrototype(Creep).filter(i => i.my && i.body.find(b => { return b.type === ATTACK || b.type === RANGED_ATTACK }));
  healerCreeps = getObjectsByPrototype(Creep).filter(i => i.my && i.body.find(b => { return b.type === HEAL }));
  // Check the actual Creep object, not the body array.
  //injuredCreeps = getObjectsByPrototype(Creep).filter(i => i.my && (i.hits / i.hitsMax < 0.6));
  injuredCreeps = getObjectsByPrototype(Creep).filter(i => i.my && (i.hits != i.hitsMax && i.body.find(b => { return b.type === HEAL || b.type === RANGED_ATTACK })));
  containers = getObjectsByPrototype(StructureContainer).filter(c => { return c.store.getUsedCapacity(RESOURCE_ENERGY)! > 0 && !c.my });
  enemySpawn = getObjectsByPrototype(StructureSpawn).find(i => !i.my);
  enemyCreeps = getObjectsByPrototype(Creep).filter(creep => !creep.my);
  enemyCombatCreeps = getObjectsByPrototype(Creep).filter(creep => !creep.my && creep.body.find(b => { return b.hits > 0 && (b.type === ATTACK || b.type === RANGED_ATTACK) }));
  enemyWorkerCreeps = getObjectsByPrototype(Creep).filter(creep => !creep.my && creep.body.find(b => { return b.type === CARRY }));
  enemyHealerCreeps = getObjectsByPrototype(Creep).filter(creep => !creep.my && creep.body.find(b => { return b.type === HEAL }));
  injuredEnemyCreeps = getObjectsByPrototype(Creep).filter(creep => !creep.my && creep.hits < creep.hitsMax);

  console.log(`Creeps Length ${creeps.length}`);
  // console.log(`Towers Length ${myTowers.length}`);
  console.log(`🐞 Worker Creeps : ${workerCreeps.length}`);
  console.log(`✨ Builder Creeps : ${builderCreeps.length}`);
  console.log(`🔫 Warrior Creeps : ${warriorCreeps.length}`);
  console.log(`❤️‍🩹 Healer Creeps : ${healerCreeps.length}`);
  console.log(`💔 Injured Creeps : ${injuredCreeps.length}`);
  console.log(`⚠️ Enemy Creeps : ${enemyCreeps.length}`);
  console.log(`⚠️ Enemy Worker Creeps : ${enemyWorkerCreeps.length}`);
  console.log(`⚠️ Injured Enemy Creeps : ${injuredEnemyCreeps.length}`);

  spawnCreeps();

  workerCreepAssignments();
  healerCreepAssignments();
  // builderCreepAssignments();
  // myTowers.forEach(tower => towerProd(tower))
  if (injuredCreeps.length > 0) {
    isAttacking = true;
  }

  let closestEnergyContainerToSpawnPoint: Structure | null;
  let closestEnergyContainerDistance: number | null = null;

  if (mySpawn) {
    closestEnergyContainerToSpawnPoint = mySpawn.findClosestByPath(containers);
    if (closestEnergyContainerToSpawnPoint) {
      closestEnergyContainerDistance = getRange(mySpawn, closestEnergyContainerToSpawnPoint);
    }

    console.log(`Closest non-empty container is ${closestEnergyContainerDistance!} away with decay of ${closestEnergyContainerToSpawnPoint?.ticksToDecay}.`);

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

  warriorCreepAssignments(isAttacking);
}

function spawnCreeps() {
  if (mySpawn) {
    let closestEnergyContainerToSpawnPoint: Structure | null;
    let closestEnergyContainerDistance: number = 999;
    closestEnergyContainerToSpawnPoint = mySpawn.findClosestByPath(containers);
    if (closestEnergyContainerToSpawnPoint) {
      closestEnergyContainerDistance = getRange(mySpawn, closestEnergyContainerToSpawnPoint);
    }

    if (workerCreeps.length < 4) {
      console.log('Spawning Worker Creep');
      //mySpawn.spawnCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY]).object;
      mySpawn.spawnCreep([MOVE, CARRY]).object;
    } else {
      if (closestEnergyContainerDistance && workerCreeps.length < 8 && closestEnergyContainerDistance > 4) {
        console.log('Spawning Worker Creep');
        mySpawn.spawnCreep([MOVE, CARRY]).object;
      }
      if (builderCreeps.length < 0) {
        console.log('Spawning Builder Creep');
        mySpawn.spawnCreep([MOVE, MOVE, CARRY, WORK, CARRY, WORK]).object;
      } else {
        if (creeps.length % 6 === 0 || (healerCreeps.length < 2 && closestEnergyContainerDistance > 4)) {
          console.log('Spawning Healer Creep');
          mySpawn.spawnCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL]).object;
        } else {
          console.log('Spawning Warrior Creep');
          mySpawn.spawnCreep([TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK]).object;
        }
      }
    }
  }
}


function workerCreepAssignments() {
  if (mySpawn)
    for (var creep of workerCreeps) {
      var enemiesInRange = creep.findInRange(enemyCreeps, 10);
      if (enemiesInRange && enemiesInRange.length > 0) {
        flee(creep, enemiesInRange, 10);
      }
      var container = creep.findClosestByPath(containers.filter(c => {
        if (c.ticksToDecay)
          return c.getRangeTo(creep) < c.ticksToDecay
        else
          return true;
      }));
      if (container) {
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
          if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            creep.moveTo(container);
          }
        } else {
          // if (myTowers.length) {
          //   for (var tower of myTowers) {
          //     if (tower.store.energy < 40) {
          //       creep.transfer(tower, RESOURCE_ENERGY);
          //     } else {
          //       if (mySpawn) {
          //         if (creep.transfer(mySpawn, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          //           creep.moveTo(mySpawn);
          //         }
          //       }
          //     }
          //   }
          // }
          if (mySpawn) {
            if (creep.transfer(mySpawn, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
              creep.moveTo(mySpawn);
            }
          }
        }
      }
    }
}

function healerCreepAssignments() {
  for (var creep of healerCreeps) {
    let closestEnemyCreep: Creep | null = null;
    let enemyCreepRange: number = 999;
    closestEnemyCreep = creep.findClosestByPath(enemyCreeps);
    if (closestEnemyCreep) enemyCreepRange = creep.getRangeTo(closestEnemyCreep);

    if (closestEnemyCreep?.body.find(b => b.type === ATTACK || b.type === RANGED_ATTACK) && enemyCreepRange < 5) {
      flee(creep, creep.findInRange(enemyCreeps, 5), 5);
    }
    var closestWarrior = creep.findClosestByPath(warriorCreeps);
    var closestInjuredCreep = creep.findClosestByPath(injuredCreeps);
    if (enemySpawn) closestWarrior = enemySpawn.findClosestByPath(warriorCreeps);

    if (injuredCreeps.length > 0) {
      console.log('Attempting Heal.');
      if (closestInjuredCreep && creep.heal(closestInjuredCreep) == ERR_NOT_IN_RANGE) {
        if (creep.rangedHeal(closestInjuredCreep) == ERR_NOT_IN_RANGE)
          creep.moveTo(closestInjuredCreep);
      } else {
        if (closestWarrior) creep.moveTo(closestWarrior);
      }
    } else {
      if (closestWarrior) creep.moveTo(closestWarrior);
    }
  }
}

function warriorCreepAssignments(isAttacking: boolean) {
  if (isAttacking) {
    // TODO: Put something in here to deal with terrain fatigue.
    console.log('Attacking.');
    console.log(`${enemyCreeps.length} enemy creeps`);

    // Find lead warrior
    let closestWarriorCreepToEnemySpawnPoint: Creep | null = null;
    let distanceToEnemySpawnPoint: number | undefined;

    if (enemySpawn) closestWarriorCreepToEnemySpawnPoint = enemySpawn.findClosestByPath(warriorCreeps);

    for (var creep of warriorCreeps) {
      var stayPut = false;
      if (closestWarriorCreepToEnemySpawnPoint && creep.id === closestWarriorCreepToEnemySpawnPoint.id) {
        var warriorsNearby = creep.findInRange(warriorCreeps.filter(i => i.id != closestWarriorCreepToEnemySpawnPoint!.id), 5).length;
        var healersNearby = creep.findInRange(healerCreeps.filter(i => i.id != closestWarriorCreepToEnemySpawnPoint!.id), 5).length;
        stayPut = (warriorsNearby < 2) || (healersNearby < 1);
        console.log(`${warriorsNearby} warriors nearby, ${healersNearby} healers nearby, staying put is ${stayPut}.`);
      }
      stayPut = false;
      if (enemySpawn) {
        distanceToEnemySpawnPoint = getRange(creep, enemySpawn)
      } else {
        distanceToEnemySpawnPoint = undefined;
      }
      if (enemySpawn) {
        if (enemyCreeps.length > 0 && distanceToEnemySpawnPoint && distanceToEnemySpawnPoint > 5) {
          attackCreeps(creep, stayPut && creep.id === closestWarriorCreepToEnemySpawnPoint!.id);
        } else {
          if (creep.rangedAttack(enemySpawn) == ERR_NOT_IN_RANGE) {
            attackCreeps(creep, stayPut && creep.id === closestWarriorCreepToEnemySpawnPoint!.id);
          }
        }
      } else {
        attackCreeps(creep, stayPut && creep.id === closestWarriorCreepToEnemySpawnPoint!.id);
      }
    }
  } else {
    let closestWarriorCreepToEnemySpawnPoint: Creep | null = null;
    if (enemySpawn) closestWarriorCreepToEnemySpawnPoint = enemySpawn.findClosestByPath(warriorCreeps);
    if (getTicks() % 25 === 0) {
      if (enemySpawn && closestWarriorCreepToEnemySpawnPoint)
        closestWarriorCreepToEnemySpawnPoint.moveTo(enemySpawn);
      if (!enemySpawn && closestWarriorCreepToEnemySpawnPoint)
        attackCreeps(closestWarriorCreepToEnemySpawnPoint, false);
    }
    for (var creep of warriorCreeps) {
      if (closestWarriorCreepToEnemySpawnPoint && creep.id != closestWarriorCreepToEnemySpawnPoint.id) {
        console.log(`Shuffling up to lead.`);
        creep.moveTo(closestWarriorCreepToEnemySpawnPoint);
      }
    }
  }
}

function builderCreepAssignments() {
  let constructionX: number = 50;
  let constructionY: number = 50;

  if (mySpawn) {
    constructionX = mySpawn.x;
    constructionY = mySpawn.y - 2;
  }

  if (builderCreeps.length > 0) {
    if (!constructionSite)
      constructionSite = createConstructionSite(constructionX, constructionY, StructureTower as any).object as any
    builderCreeps.forEach(creep => {
      if (creep.store.energy <= 0) {
        var container = creep.findClosestByPath(containers);
        if (!container) return
        runElseMove(creep, creep.withdraw, container, RESOURCE_ENERGY)
      }
      else if (constructionSite) {
        if (constructionSite.progress === constructionSite.progressTotal) return
        runElseMove(creep, creep.build, constructionSite)
      } else {
        console.log('Tower Built')
      }
    })
  }
}

function towerProd(tower: StructureTower) {
  const target = tower.findClosestByRange(enemyCreeps)
  const healTarget = injuredCreeps.filter(i => getRange(i, tower) < 51 && i.hits < i.hitsMax).sort((a, b) => a.hits - b.hits)

  if (target) {
    tower.attack(target)
  }
  else if (healTarget.length) {
    tower.heal(healTarget[0])
  }
}
function attackCreeps(creep: Creep, stayPut: boolean) {
  let closestEnemyCreep: Creep | null = null;
  let threatLevel: Number | undefined = 0;
  threatLevel = mySpawn?.findInRange(enemyCombatCreeps, 30).length;
  let enemyCreepRange: number = 0;
  if (enemyHealerCreeps) {
    var localEnemyHealerCreeps = creep.findInRange(enemyHealerCreeps, 5);
    if (localEnemyHealerCreeps.length > 0) {
      createVisual(creep, `Healer`);
      closestEnemyCreep = creep.findClosestByRange(localEnemyHealerCreeps);
    } else {
      if (injuredEnemyCreeps.length > 0) {
        var mobileEnemyCreeps = creep.findInRange(injuredEnemyCreeps.filter(c => c.body.find(b => b.type === MOVE && b.hits > 0)), 3);
        if (mobileEnemyCreeps.length > 0) {
          createVisual(creep, `Mobile`);
          closestEnemyCreep = mobileEnemyCreeps[0];
        } else {
          createVisual(creep, `Enemy`);
          closestEnemyCreep = creep.findClosestByPath(enemyCombatCreeps);
        }
      } else {
        createVisual(creep, `Enemy`);
        closestEnemyCreep = creep.findClosestByPath(enemyCombatCreeps);
      }
    }
  }
  if (closestEnemyCreep) enemyCreepRange = creep.getRangeTo(closestEnemyCreep);
  var x = closestEnemyCreep?.body.find(b => b.type === ATTACK);
  if (closestEnemyCreep?.body.find(b => b.type === ATTACK) && enemyCreepRange < 4) {
    flee(creep, [closestEnemyCreep], 4);
  }
  // console.log(`${closestEnemyCreep!.id}`);
  if (enemyCreeps.length > 0) {
    if (closestEnemyCreep && creep.rangedAttack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
      if (creep.rangedAttack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
        if (threatLevel! > 3 && mySpawn!.getRangeTo(creep) > 20) {
          creep.moveTo(mySpawn!);
        }
        else { if (!stayPut) { creep.moveTo(closestEnemyCreep); } }
      }
    } else {
      if (closestEnemyCreep && !stayPut) creep.moveTo(closestEnemyCreep)
      else if (enemySpawn && !stayPut) creep.moveTo(enemySpawn);
    }
  } else {
    if (enemySpawn && !stayPut) creep.moveTo(enemySpawn);
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

function createVisual(creep: Creep, target: string) {
  new Visual().text(
    `${creep.hits.toString()} - targeting ${target}`,
    { x: creep.x, y: creep.y - 0.5 }, // above the creep
    {
      font: "0.5",
      opacity: 0.7,
      backgroundColor: "#808080",
      backgroundPadding: 0.03,
    }
  )
}
