import { randomInt } from "crypto";
import ethers from "ethers";
import { AssemblyCuratedV2 } from "../typechain-types/AssemblyCuratedV2";
// These constants must match the ones used in the smart contract.
const SIGNING_DOMAIN_NAME = "AssemblyCurated-LazyMintingNFT-Voucher";
const SIGNING_DOMAIN_VERSION = "1";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

/**
 * JSDoc typedefs.
 *
 * @typedef {object} NFTVoucher
 * @property {ethers.address | number} token the address of the un-minted NFT
 * @property {ethers.BigNumber | number} tokenId the id of the un-minted NFT
 * @property {ethers.BigNumber | number} price the price (in wei) that the creator will accept to redeem this NFT
 * @property {boolean} is1155 is target token ERC115
 * @property {ethers.BigNumber | number} amount for ERC1155
 * @property {string} uri the metadata URI to associate with this NFT
 * @property {ethers.BytesLike} signature an EIP-712 signature of all fields in the NFTVoucher, apart from signature itself.
 */

/**
 * LazyMinter is a helper class that creates NFTVoucher objects and signs them, to be redeemed later by the LazyNFT contract.
 */
class LazyMinterV2 {
  contract: AssemblyCuratedV2;
  signer: SignerWithAddress;
  _domain: object | null;
  /**
   * Create a new LazyMinter targeting a deployed instance of the LazyNFT contract.
   *
   * @param {Object} options
   * @param {ethers.Contract} contract an ethers Contract that's wired up to the deployed contract
   * @param {ethers.Signer} signer a Signer whose account is authorized to mint NFTs on the deployed contract
   */
  constructor( contract: AssemblyCuratedV2, signer: SignerWithAddress ) {
    this.contract = contract;
    this.signer = signer;
    this._domain = null;
  }

  /**
   * Creates a new NFTVoucher object and signs it using this LazyMinter's signing key.
   *
   * @param {ethers.BigNumber | number} tokenId the id of the un-minted NFT
   * @param {string} uri the metadata URI to associate with this NFT
   * @param {ethers.BigNumber | number} minPrice the minimum price (in wei) that the creator will accept to redeem this NFT. defaults to zero
   *
   * @returns {NFTVoucher}
   */
  async createVoucher(
    token: string,
    tokenId: ethers.BigNumber | number,
    price: ethers.BigNumber | number = 0,
    is1155: boolean,
    amount: ethers.BigNumber | number,
    uri: string
  ): Promise<AssemblyCuratedV2.NFTVoucherStruct > {
    const voucherId = randomInt(281474976710655);
    const voucher = { voucherId, token, tokenId, price, is1155, amount, uri };
    const domain = await this._signingDomain();

    const types = {
      NFTVoucher: [
        { name: "voucherId", type: "uint256" },
        { name: "token", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "price", type: "uint256" },
        { name: "is1155", type: "bool" },
        { name: "amount", type: "uint256" },
        { name: "uri", type: "string" },
      ],
    };
    const signature = await this.signer._signTypedData(domain, types, voucher);
    return {
      ...voucher,
      signature,
    };
  }

  /**
   * @private
   * @returns {object} the EIP-721 signing domain, tied to the chainId of the signer
   */
  async _signingDomain() {
    if (this._domain != null) {
      return this._domain;
    }
    const chainId = await this.contract.getChainID();
    this._domain = {
      name: SIGNING_DOMAIN_NAME,
      version: SIGNING_DOMAIN_VERSION,
      verifyingContract: this.contract.address,
      chainId,
    };
    return this._domain;
  }
}

export default LazyMinterV2;
// module.exports = {
//   LazyMinter
// }
