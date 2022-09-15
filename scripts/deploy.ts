import { ethers } from "hardhat";

async function main() {
  /***************************************************************************
   ********************** AssemblyCurated_v1 Deployment **********************
   ***************************************************************************/
  // const recipient = "0xfEaE88b979ec76FF83F96dfBb5CFca42b92B6A1F";
  // const _allowedCallers: string[] = [
  //   "0xEF5245d9685CD918a2Bf0d216c2e7091446AcFF6",
  //   "0x09885b996F81122D84332E3f66605F681d9F22a6",
  //   "0x4aD06A01C14cB8CF20E49Fc53c647b882C1628e9",
  //   "0x0e55ea6D1C4C0e50aA7B3Fc1D13974B01f072f84",
  //   "0xD71b6d2C8f4a088396983d5586866563fcA75447",
  // ];
  // const _owner = "0xfEaE88b979ec76FF83F96dfBb5CFca42b92B6A1F";

  // const AssemblyCurated = await ethers.getContractFactory("AssemblyCurated");
  // const contract = await AssemblyCurated.deploy(
  //   recipient,
  //   _allowedCallers,
  //   _owner
  // );

  /***************************************************************************
   ************************** AssemblyV2 Deployment **************************
   ***************************************************************************/
  const _recipient = "0xfEaE88b979ec76FF83F96dfBb5CFca42b92B6A1F";
  const _owner = "0xfEaE88b979ec76FF83F96dfBb5CFca42b92B6A1F";
  const _minters: string[] = [
    "0xfEaE88b979ec76FF83F96dfBb5CFca42b92B6A1F",
    "0xEF5245d9685CD918a2Bf0d216c2e7091446AcFF6",
    "0xD71b6d2C8f4a088396983d5586866563fcA75447",
  ];
  const AssemblyCurated = await ethers.getContractFactory("AssemblyV2");
  const contract = await AssemblyCurated.deploy(_recipient, _owner, _minters);
  
  await contract.deployed();

  console.log("Assembly contract deployed to:", contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
