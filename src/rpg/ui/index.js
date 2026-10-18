// Installs the Modo Leyenda screens on the UI class. Each module exports an object of
// methods that become UI methods (this = the UI instance: _screen, btn, _setNav…).
//   hub.js  — rpgHub, rpgStarter, rpgMap, rpgEvent, rpgContracts, rpgShop, rpgRewards
//   gear.js — rpgGear, rpgMastery, rpgTalents, rpgForge
import { hubScreens } from './hub.js';
import { gearScreens } from './gear.js';

export function installRpgUI(UIClass) {
  Object.assign(UIClass.prototype, hubScreens, gearScreens);
}
