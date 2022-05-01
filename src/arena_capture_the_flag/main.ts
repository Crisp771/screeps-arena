// // Note that there is no global objects like Game or Memory. All methods, prototypes and constants are imported built-in modules
// // import {
// //   ATTACK,
// //   CostMatrix,
// //   HEAL,
// //   RANGED_ATTACK,
// //   RoomPosition,
// //   getDirection,
// //   getRange,
// //   getObjectById,
// //   getObjectsByPrototype,
// //   getTime
// // } from "game";

// // Everything can be imported either from the root /game module or corresponding submodules
// // import { pathFinder } from "game";
// // pathFinder.searchPath();
// // import { prototypes } from "game";
// // prototypes.Creep
// // prototypes.RoomObject

// // import {searchPath } from '/game/path-finder';
// // import {Creep} from '/game/prototypes';

// // This would work too:
// // import * as PathFinder from '/game/path-finder'; --> PathFinder.searchPath
// // import {Creep} from '/game/prototypes/creep';
// // import * as prototypes from '/game/prototypes'; --> prototypes.Creep

// // This stuff is arena-specific
// import { ATTACK, HEAL, RANGED_ATTACK } from "game/constants";
// import { BodyPart, Flag } from "arena";
// import { Creep, GameObject, StructureTower } from "game/prototypes";
// import { getDirection, getObjectsByPrototype, getRange, getTicks } from "game/utils";
// import { searchPath } from "game/path-finder";
// import { Visual } from "game/visual";

// enum CreepState {
//   Default,
//   Dying,
//   Defense,
// }

// declare module "game/prototypes" {
//   interface Creep {
//     initialPos: RoomPosition
//     target?: Creep
//     myHealers?: Creep[]
//     historyHits?: number
//     state?: CreepState
//   }
// }

// // You can also import your files like this:
// // import {roleAttacker} from './roles/attacker.mjs';

// // We can define global objects that will be valid for the entire match.
// // The game guarantees there will be no global reset during the match.
// // Note that you cannot assign any game objects here, since they are populated on the first tick, not when the script is initialized.
// let myCreeps: Creep[]
// let myFlag: Flag
// let myTowers: StructureTower[]

// let enemyCreeps: Creep[]
// let enemyFlag: Flag

// let healCreeps: Creep[] = []
// let attackCreeps: Creep[] = []
// let rangedCreeps: Creep[] = []

// // This is the only exported function from the main module. It is called every tick.
// export function loop(): void {
//   attackCreeps = []
//   rangedCreeps = []
//   healCreeps = []

//   // 获取我方单位
//   myCreeps = getObjectsByPrototype(Creep).filter(i => i.my)
//   myFlag ??= getObjectsByPrototype(Flag).find(i => i.my) as Flag
//   myTowers = getObjectsByPrototype(StructureTower).filter(i => i.my)

//   // 获取敌方单位
//   enemyCreeps = getObjectsByPrototype(Creep).filter(i => !i.my)
//   enemyFlag ??= getObjectsByPrototype(Flag).find(i => !i.my) as Flag

//   // 根据他们的身体来分类 和 运行
//   myCreeps.forEach(creep => {
//     if (creep.body.some(i => i.type === ATTACK)) {
//       attackCreeps.push(creep)
//     }
//     else if (creep.body.some(i => i.type === RANGED_ATTACK)) {
//       rangedCreeps.push(creep)
//     }
//     else if (creep.body.some(i => i.type === HEAL)) {
//       healCreeps.push(creep)
//     }
//   })

//   // 请注意 getTime 是一个全局函数，但不再是 Game.time
//   if (getTicks() % 10 === 0) {
//     console.log(`🐞 ${myCreeps.length}  🗡 ${attackCreeps.length}  🔫 ${rangedCreeps.length}  ❤️‍🩹 ${healCreeps.length}`)
//   }

//   // 进行编队
//   formation()

//   // 让所有的爬开始工作
//   attackCreeps.forEach(creep => meleeAttacker(creep))
//   rangedCreeps.forEach(creep => rangedAttacker(creep))
//   healCreeps.forEach(creep => healer(creep))

//   // 让塔开始工作
//   myTowers.forEach(tower => towerProd(tower))
// }

// /** 编队 */
// function formation() {
//   const rangeds = [...rangedCreeps]
//   const heals = [...healCreeps]

//   heals.forEach(creep => {
//     // 如果已经有目标了，就不需要分配了
//     if (creep.target && creep.target.exists) {
//       return
//     }
//     creep.target = undefined

//     // 补货
//     if (!(rangeds.length > 0) && (rangedCreeps.length > 0)) {
//       rangeds.push(...rangedCreeps)
//     }
//     else if (attackCreeps.length > 0) {
//       rangeds.push(...attackCreeps)
//     }

//     let ranged = rangeds.shift()
//     if (!ranged) return console.log(`❌ Heal: ${creep.id} 组队匹配失败`)

//     creep.target = ranged
//     ranged.myHealers ??= []
//     ranged.myHealers.push(creep)
//   })
// }

// function meleeAttacker(creep: Creep) {
//   // 将旗帜设置为起始位置
//   if (!creep.initialPos && myFlag) {
//     creep.initialPos = myFlag
//   }

//   // 获取距离 10 以内的敌方，按照最近目标排序
//   const targets = enemyCreeps
//     .filter(i => getRange(i, creep.initialPos) < 10)
//     .sort((a, b) => getRange(a, creep) - getRange(b, creep))

//   // 如果附近有敌人，则进行攻击，否则返回防守点
//   if (targets.length > 0) {
//     // creep.moveTo(targets[0]);
//     creep.attack(targets[0]);
//   } else {
//     creep.moveTo(creep.initialPos)
//   }

//   new Visual().text(
//     creep.hits.toString(),
//     { x: creep.x, y: creep.y - 0.5 }, // above the creep
//     {
//       font: "0.5",
//       opacity: 0.7,
//       backgroundColor: "#808080",
//       backgroundPadding: 0.03,
//     }
//   )
// }

// function rangedAttacker(creep: Creep) {
//   /** 攻击范围 */
//   const attackRange = 10
//   /** 队伍范围 */
//   const lagRange = 3
//   /** 逃离范围 */
//   const fleeRange = 3

//   const targets = enemyCreeps.filter(i => getRange(i, creep) < attackRange).sort((a, b) => a.hits - b.hits)
//   const targetInRange = enemyCreeps.filter(i => getRange(i, creep) < 4).sort((a, b) => a.hits - b.hits)

//   const leftBehinds = creep.myHealers?.filter(i => getRange(i, creep) > lagRange).sort((a, b) => getRange(a, creep) - getRange(b, creep))

//   const assaultEnemys = enemyCreeps.filter(i => getRange(i, myFlag) < 51).sort((a, b) => getRange(a, myFlag) - getRange(b, myFlag))



//   // 血量低于 50% 时进入濒死状态
//   if (creep.hits < creep.hitsMax * 0.6 && creep.myHealers?.length) {
//     creep.state = CreepState.Dying
//   } // 血量恢复到 90% 时退出濒死状态
//   else if (creep.hits > creep.hitsMax * 0.7) {
//     creep.state = CreepState.Default
//   } // 如果有敌人接近我方旗帜，则进入回防模式
//   if (myFlag && assaultEnemys.length > 0 && getTicks() < 1500) {
//     creep.state = CreepState.Defense
//   }

//   // 如果射程内有多个目标，则发动范围攻击
//   if (targetInRange.length > 2) {
//     creep.rangedMassAttack()
//   } // 否则 攻击射程内血量最低目标
//   else if (targetInRange.length > 0) {
//     creep.rangedAttack(targetInRange[0])
//   }

//   if (creep.state === CreepState.Default) {
//     // 移动策略
//     if (leftBehinds?.length && ((creep.myHealers?.length || 0) - leftBehinds.length) < 2) {
//       creep.moveTo(leftBehinds[0])
//     }
//     // 如果距离敌方旗子十步以内，优先向旗子移动
//     else if (getRange(enemyFlag, creep) < 10) {
//       creep.moveTo(enemyFlag)
//     } // 如果附近有敌人，向附近敌人中血量最低的敌人移动
//     else if (targets.length) {
//       creep.moveTo(targets[0])
//     } // 默认向敌方旗子移动
//     else {
//       creep.moveTo(enemyFlag)
//     }
//   } else {
//     // 移动策略
//     if (leftBehinds?.length && ((creep.myHealers?.length || 0) - leftBehinds.length) < 2) {
//       creep.moveTo(leftBehinds[0])
//     } // 向距离旗帜最近的敌人移动
//     else if (assaultEnemys.length > 0) {
//       creep.moveTo(assaultEnemys[0])
//     }
//     else if (creep.state === CreepState.Defense && myFlag) {
//       creep.moveTo(myFlag)
//     }
//   }

//   const enemiesInRange = enemyCreeps.filter(i => getRange(i, creep) < fleeRange)
//   if (assaultEnemys[0] && getRange(assaultEnemys[0], myFlag) < 5) {
//     creep.moveTo(assaultEnemys[0])
//   }
//   else {
//     // 血量低于百分之五十时回避加血
//     if (creep.state === CreepState.Dying) {
//       if (enemiesInRange.length) {
//         flee(creep, enemiesInRange, fleeRange)
//       } else if (myFlag) {
//         creep.moveTo(myFlag)
//       }
//     } // 接近敌人攻击范围时自动避让
//     else {
//       if (enemiesInRange.length > 0) {
//         flee(creep, enemiesInRange, fleeRange);
//       }
//     }
//   }


//   // 如果距离敌方旗子十步以内，优先向旗子移动
//   if (getRange(enemyFlag, creep) < 4) {
//     creep.moveTo(enemyFlag)
//   }

//   creep.historyHits = creep.hits
// }

// /** 奶妈程序 */
// function healer(creep: Creep) {
//   const fleeRange = 5

//   if (!creep.target) {
//     console.log(`❌ heal:${creep.id} 没有治疗目标`)
//     if (enemyFlag) creep.moveTo(enemyFlag)
//     return
//   }


//   const healTarget = creep.target.hits < creep.target.hitsMax
//     ? creep.target
//     : creep.target.myHealers
//       ?.filter(i => i.hits < i.hitsMax && getRange(i, creep) < 4)
//       .sort((a, b) => a.hits - b.hits)[0]
//       || creep.target

//   creep.moveTo(creep.target)
//   creep.rangedHeal(healTarget)



//   // // 如果距离敌方旗子十步以内，优先向旗子移动
//   // if (getRange(enemyFlag, creep) < 4) {
//   //   creep.moveTo(enemyFlag)
//   // }

//   const enemiesInRange = enemyCreeps.filter(i => getRange(i, creep) < fleeRange)
//   if (enemiesInRange.length > 0) {
//     flee(creep, enemiesInRange, fleeRange);
//   }
// }

// function towerProd(tower: StructureTower) {
//   const target = tower.findClosestByRange(enemyCreeps)
//   const healTarget = myCreeps.filter(i => getRange(i, tower) < 51 && i.hits < i.hitsMax).sort((a, b) => a.hits - b.hits)

//   if (target) {
//     tower.attack(target)
//   }
//   else if (healTarget.length) {
//     tower.heal(healTarget[0])
//   }
// }

// function flee(creep: Creep, targets: GameObject[], range: number) {
//   const result = searchPath(
//     creep,
//     targets.map(i => ({ pos: i, range })),
//     { flee: true }
//   );
//   if (result.path.length > 0) {
//     const direction = getDirection(result.path[0].x - creep.x, result.path[0].y - creep.y);
//     creep.move(direction);
//   }
// }
