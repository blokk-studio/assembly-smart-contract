# Assembly NFT Marketplace Contract

## Installation

It is recommended to install [Yarn](https://classic.yarnpkg.com) through the `npm` package manager, which comes bundled with [Node.js](https://nodejs.org) when you install it on your system. It is recommended to use a Node.js version `>= 16.0.0`.

Once you have `npm` installed, you can run the following both to install and upgrade Yarn:

```bash
npm install --global yarn
```

After having installed Yarn, simply run:

```bash
yarn install
```

## Running Deployments

**Example Ethereum Mainnet:**

```bash
yarn deploy:ethmain
```

> The deployment script [`deploy.ts`](./scripts/deploy.ts) includes the confirmed constructor arguments used for the production deployment.

## Etherscan Verification

```bash
npx hardhat verify --network ethMain --constructor-args arguments.js <DEPLOYED_CONTRACT_ADDRESS>
```

> The file [`arguments.js`](./arguments.js) includes the confirmed constructor arguments used for the production deployment.

## Deployments

### `AssemblyCurated_v1`

- Ethereum Mainnet: [`0x6657eEa3624f05184f238F72dB81A10Cc20117D6`](https://etherscan.io/address/0x6657eEa3624f05184f238F72dB81A10Cc20117D6)
- Rinkeby: [`0x6657eEa3624f05184f238F72dB81A10Cc20117D6`](https://rinkeby.etherscan.io/address/0x6657eEa3624f05184f238F72dB81A10Cc20117D6)

### `AssemblyV2`

- Ethereum Mainnet: [`0xa16A904Ed7AAf474832e5bC3f17aF24fc549Fd8b`](https://etherscan.io/address/0xa16A904Ed7AAf474832e5bC3f17aF24fc549Fd8b)
- Rinkeby: [`0xa16A904Ed7AAf474832e5bC3f17aF24fc549Fd8b`](https://rinkeby.etherscan.io/address/0xa16A904Ed7AAf474832e5bC3f17aF24fc549Fd8b)
