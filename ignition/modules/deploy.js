import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("WhalemonDeploy", (m) => {
  const whaleCards = m.contract("WhaleCards");

  const battleArena = m.contract("BattleArena", [whaleCards]);

  const marketplace = m.contract("Marketplace", [whaleCards]);

  return { whaleCards, battleArena, marketplace };
});