// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const recipient = "0x9F3f11d72d96910df008Cfe3aBA40F361D2EED03";
  const _allowedCallers: string[]= ["0x9F3f11d72d96910df008Cfe3aBA40F361D2EED03", "0x3854Ca47Abc62A3771fE06ab45622A42C4A438Cf"];
  const _owner = "0x3854Ca47Abc62A3771fE06ab45622A42C4A438Cf"

  // We get the contract to deploy
  const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
  const instance = await NFTMarketplace.deploy(recipient, _allowedCallers, _owner);

  await instance.deployed();

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
