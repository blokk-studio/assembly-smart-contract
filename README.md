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

**Example Rinkeby:**

```bash
yarn deploy:rinkeby
```

> The deployment script [`deploy.ts`](./scripts/deploy.ts) includes the confirmed constructor arguments used for the production deployment.

## Etherscan verification

```bash
npx hardhat verify --network ethMain --constructor-args arguments.js <DEPLOYED_CONTRACT_ADDRESS>
```

> The file [`arguments.js`](./arguments.js) includes the confirmed constructor arguments used for the production deployment.

## Deployments
- Ethereum Mainnet: [`0x1f6158Eee5F6e178149be6723D2292524dFA8B0d`](https://etherscan.io/address/0x1f6158eee5f6e178149be6723d2292524dfa8b0d)
- Rinkeby: [`0x1f6158Eee5F6e178149be6723D2292524dFA8B0d`](https://rinkeby.etherscan.io/address/0x1f6158Eee5F6e178149be6723D2292524dFA8B0d)
