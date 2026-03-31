import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";

export default defineConfig({
  plugins: [hardhatEthers],
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    tempo: {
      type: "http",
      url: "https://rpc.tempo.xyz",
      accounts: ["00ae581347c0150c01ceaea9aaa288213e00501c2be00c5a8082b56b425a9cad"],
    },
  },
});