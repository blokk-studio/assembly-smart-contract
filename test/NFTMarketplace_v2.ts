import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ERC721Creator, ERC1155Creator, AssemblyV2 } from "../typechain-types";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import LazyMinterV2 from "../helpers/minter_v2";

describe("AssemblyV2", function () {
  let marketplace: AssemblyV2;
  let erc721: ERC721Creator;
  let erc1155: ERC1155Creator;
  let owner: SignerWithAddress,
    recipient: SignerWithAddress,
    minter: SignerWithAddress,
    artist1: SignerWithAddress,
    artist2: SignerWithAddress,
    buyer: SignerWithAddress;
  let lazyMinter: LazyMinterV2;

  const price = "1000";

  before(async () => {
    [owner, recipient, minter, artist1, artist2, buyer] =
      await ethers.getSigners();
  });

  beforeEach(async () => {
    const ERC721 = await ethers.getContractFactory("ERC721Creator");
    const ERC1155 = await ethers.getContractFactory("ERC1155Creator");

    erc721 = await ERC721.deploy("721", "token");
    erc1155 = await ERC1155.deploy();

    const Marketplace = await ethers.getContractFactory("AssemblyV2");

    marketplace = await Marketplace.deploy(
      recipient.address,
      "0x0000000000000000000000000000000000000000",
      [minter.address]
    );
  });

  it("constructor", async function () {
    const Marketplace = await ethers.getContractFactory("AssemblyV2");

    await expect(
      Marketplace.deploy(
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        [minter.address]
      )
    ).to.be.revertedWith("ZeroAddress()");

    await expect(
      Marketplace.deploy(
        recipient.address,
        "0x0000000000000000000000000000000000000000",
        ["0x0000000000000000000000000000000000000000", minter.address]
      )
    ).to.be.revertedWith("ZeroAddress()");

    let tmpMarketplace = await Marketplace.deploy(
      recipient.address,
      "0x0000000000000000000000000000000000000000",
      [minter.address]
    );

    expect(await tmpMarketplace.owner()).to.be.equal(owner.address);

    tmpMarketplace = await Marketplace.deploy(
      recipient.address,
      minter.address,
      [minter.address]
    );

    expect(await tmpMarketplace.owner()).to.be.equal(minter.address);
  });

  it("permissions", async function () {
    await expect(
      marketplace.connect(minter).updateRecipient(recipient.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    expect(await marketplace.isMinter(minter.address)).to.be.equal(true);
    await expect(marketplace.addMinter(minter.address)).to.be.revertedWith(
      "AlreadySet()"
    );
    await marketplace.removeMinter(minter.address);
    expect(await marketplace.isMinter(minter.address)).to.be.equal(false);
    await expect(marketplace.removeMinter(minter.address)).to.be.revertedWith(
      "AlreadySet()"
    );
    await expect(
      marketplace.addMinter("0x0000000000000000000000000000000000000000")
    ).to.be.revertedWith("ZeroAddress()");
    await marketplace.addMinter(minter.address);
    expect(await marketplace.isMinter(minter.address)).to.be.equal(true);
  });

  describe("settings", function () {
    it("recipient", async function () {
      expect(await marketplace.recipient()).to.be.equal(recipient.address);

      await expect(
        marketplace.updateRecipient(
          "0x0000000000000000000000000000000000000000"
        )
      ).to.be.revertedWith("ZeroAddress()");

      await marketplace.updateRecipient(artist2.address);
      expect(await marketplace.recipient()).to.be.equal(artist2.address);
    });
  });

  describe("lazy minting", function () {
    beforeEach(async () => {
      lazyMinter = new LazyMinterV2(marketplace, minter);
      await erc721["registerExtension(address,string)"](
        marketplace.address,
        "/test/uri/721"
      );
      await erc1155["registerExtension(address,string)"](
        marketplace.address,
        "/test/uri/1155"
      );
    });

    it("reject when voucher with invalid data", async function () {
      const voucher = await lazyMinter.createVoucher(
        erc1155.address,
        0,
        100,
        false,
        0,
        "/test2/",
        80,
        20,
        [],
        []
      );
      const invalidVoucher = voucher;

      invalidVoucher.voucherId = BigNumber.from(voucher.voucherId).add(1);
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher)
      ).to.be.revertedWith("InvalidSignature()");
      invalidVoucher.voucherId = voucher.voucherId;

      invalidVoucher.amount = BigNumber.from(voucher.amount).add(1);
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher)
      ).to.be.revertedWith("InvalidSignature()");
      invalidVoucher.amount = voucher.amount;

      invalidVoucher.price = BigNumber.from(voucher.price).add(1);
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher)
      ).to.be.revertedWith("InvalidSignature()");
      invalidVoucher.price = voucher.price;

      invalidVoucher.tokenId = BigNumber.from(voucher.tokenId).add(1);
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher)
      ).to.be.revertedWith("InvalidSignature()");
      invalidVoucher.tokenId = voucher.tokenId;

      invalidVoucher.token = erc721.address;
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher)
      ).to.be.revertedWith("InvalidSignature()");
      invalidVoucher.token = voucher.token;

      invalidVoucher.is1155 = false;
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher)
      ).to.be.revertedWith("InvalidSignature()");
      invalidVoucher.is1155 = true;

      invalidVoucher.uri = voucher.uri + "invalid";
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher)
      ).to.be.revertedWith("InvalidSignature()");
      invalidVoucher.uri = voucher.uri;
    });

    it("reject with invalid length", async function () {
      const voucher2 = await lazyMinter.createVoucher(
        erc1155.address,
        0,
        100,
        true,
        50,
        "/test2/",
        80,
        20,
        [minter.address],
        []
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher2, {
          value: BigNumber.from(voucher2.price).mul(voucher2.amount).mul(2),
        })
      ).to.be.revertedWith("WrongArrayLength()");
    });

    it("reject when voucher with invalid signer", async function () {
      const invalidLazyMinter = new LazyMinterV2(marketplace, owner);
      const voucher = await invalidLazyMinter.createVoucher(
        erc1155.address,
        0,
        100,
        true,
        1,
        "/test2/",
        80,
        20,
        [],
        []
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher)
      ).to.be.revertedWith("InvalidSignature()");
    });

    it("reject when not enough value", async function () {
      const voucher = await lazyMinter.createVoucher(
        erc1155.address,
        0,
        1000000,
        true,
        1,
        "/test2/",
        80,
        20,
        [],
        []
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount).sub(1),
        })
      ).to.be.revertedWith("InvalidValue()");
    });

    it("reject when voucher is already used", async function () {
      const voucher = await lazyMinter.createVoucher(
        erc1155.address,
        0,
        1000000,
        true,
        1,
        "/test2/",
        80,
        20,
        [],
        []
      );
      await marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
        value: BigNumber.from(voucher.price).mul(voucher.amount),
      });
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount).sub(1),
        })
      ).to.be.revertedWith("VoucherAlreadyUsed()");
    });

    it("reject when invalid amount", async function () {
      const voucher = await lazyMinter.createVoucher(
        erc1155.address,
        0,
        1000000,
        true,
        0,
        "/test2/",
        80,
        20,
        [],
        []
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount),
        })
      ).to.be.revertedWith("InvalidAmount()");
    });

    it("reject when token is not available for lazy minting", async function () {
      await erc1155.unregisterExtension(marketplace.address);
      const voucher = await lazyMinter.createVoucher(
        erc1155.address,
        0,
        1000000,
        true,
        50,
        "/test2/",
        80,
        20,
        [],
        []
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount),
        })
      ).to.be.revertedWith("Must be registered extension");
    });

    it("reject when try mint not existing 1155", async function () {
      const voucher = await lazyMinter.createVoucher(
        erc1155.address,
        10,
        1000000,
        true,
        50,
        "/test2/",
        80,
        20,
        [],
        []
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount),
        })
      ).to.be.revertedWith("A token was not created by this extension");
    });

    it("reject when voucher fees not equal 100", async function () {
      let voucher = await lazyMinter.createVoucher(
        erc1155.address,
        10,
        1000000,
        true,
        50,
        "/test2/",
        0,
        0,
        [minter.address],
        [0]
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount),
        })
      ).to.be.revertedWith("InvalidVoucherFees()");

      voucher = await lazyMinter.createVoucher(
        erc1155.address,
        10,
        1000000,
        true,
        50,
        "/test2/",
        80,
        0,
        [minter.address],
        [0]
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount),
        })
      ).to.be.revertedWith("InvalidVoucherFees()");

      voucher = await lazyMinter.createVoucher(
        erc1155.address,
        10,
        1000000,
        true,
        50,
        "/test2/",
        80,
        0,
        [minter.address],
        [5]
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount),
        })
      ).to.be.revertedWith("InvalidVoucherFees()");

      voucher = await lazyMinter.createVoucher(
        erc1155.address,
        10,
        1000000,
        true,
        50,
        "/test2/",
        80,
        30,
        [minter.address],
        [0]
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount),
        })
      ).to.be.revertedWith("InvalidVoucherFees()");

      voucher = await lazyMinter.createVoucher(
        erc1155.address,
        10,
        1000000,
        true,
        50,
        "/test2/",
        0,
        0,
        [minter.address],
        [90]
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount),
        })
      ).to.be.revertedWith("InvalidVoucherFees()");
    });

    it("success 721 with equal value", async function () {
      const balanceEth = await buyer.getBalance();
      const balanceNFT = await erc721.balanceOf(buyer.address);
      const voucher = await lazyMinter.createVoucher(
        erc721.address,
        0,
        100,
        false,
        0,
        "/test2/",
        80,
        20,
        [],
        []
      );
      const tx = await marketplace
        .connect(buyer)
        .buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price),
        });
      const reciept = await tx.wait();
      const txPrice = reciept.effectiveGasPrice.mul(reciept.cumulativeGasUsed);
      const events = reciept.events!.filter((x) => x.event === "VoucherUsed");
      expect(events.length).to.be.equal(1);

      expect(events[0].args!.token).to.be.equal(erc721.address);
      expect(events[0].args!.tokenId).to.be.equal(1);
      expect(events[0].args!.voucherId).to.be.equal(voucher.voucherId);
      expect(events[0].args!.recipient).to.be.equal(buyer.address);
      expect(await buyer.getBalance()).to.be.equal(
        balanceEth.sub(txPrice.add(voucher.price))
      );
      expect(await erc721.balanceOf(buyer.address)).to.be.equal(
        balanceNFT.add(1)
      );
      expect(await erc721.ownerOf(1)).to.be.equal(buyer.address);
    });

    it("success new 1155 with dusts", async function () {
      const balanceEth = await buyer.getBalance();
      const balanceNFT = await erc1155.balanceOf(buyer.address, 1);
      const voucher = await lazyMinter.createVoucher(
        erc1155.address,
        0,
        100,
        true,
        50,
        "/test2/",
        80,
        20,
        [],
        []
      );
      const tx = await marketplace
        .connect(buyer)
        .buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount).mul(2),
        });
      const reciept = await tx.wait();
      const txPrice = reciept.effectiveGasPrice.mul(reciept.cumulativeGasUsed);
      const events = reciept.events!.filter((x) => x.event === "VoucherUsed");
      expect(events.length).to.be.equal(1);

      expect(events[0].args!.token).to.be.equal(erc1155.address);
      expect(events[0].args!.tokenId).to.be.equal(1);
      expect(events[0].args!.voucherId).to.be.equal(voucher.voucherId);
      expect(events[0].args!.recipient).to.be.equal(buyer.address);
      expect(await buyer.getBalance()).to.be.equal(
        balanceEth.sub(
          txPrice.add(BigNumber.from(voucher.price).mul(voucher.amount))
        )
      );
      expect(await erc1155.balanceOf(buyer.address, 1)).to.be.equal(
        balanceNFT.add(50)
      );
    });

    it("success existing 1155", async function () {
      const balanceNFT = await erc1155.balanceOf(artist1.address, 1);
      const voucher2 = await lazyMinter.createVoucher(
        erc1155.address,
        0,
        100,
        true,
        100,
        "/test2/",
        80,
        20,
        [],
        []
      );
      await marketplace
        .connect(artist1)
        .buyWithMint(artist1.address, voucher2, {
          value: BigNumber.from(voucher2.price).mul(voucher2.amount),
        });

      const balanceEth = await buyer.getBalance();
      const voucher = await lazyMinter.createVoucher(
        erc1155.address,
        1,
        100,
        true,
        50,
        "/test2/",
        80,
        20,
        [],
        []
      );
      const tx = await marketplace
        .connect(buyer)
        .buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount),
        });
      const reciept = await tx.wait();
      const txPrice = reciept.effectiveGasPrice.mul(reciept.cumulativeGasUsed);
      const events = reciept.events!.filter((x) => x.event === "VoucherUsed");
      expect(events.length).to.be.equal(1);

      expect(events[0].args!.token).to.be.equal(erc1155.address);
      expect(events[0].args!.tokenId).to.be.equal(1);
      expect(events[0].args!.voucherId).to.be.equal(voucher.voucherId);
      expect(events[0].args!.recipient).to.be.equal(buyer.address);
      expect(await buyer.getBalance()).to.be.equal(
        balanceEth.sub(
          txPrice.add(BigNumber.from(voucher.price).mul(voucher.amount))
        )
      );
      expect(await erc1155.balanceOf(buyer.address, 1)).to.be.equal(50);
      expect(await erc1155.balanceOf(artist1.address, 1)).to.be.equal(
        balanceNFT.add(100)
      );
    });

    it("pausable", async function () {
      await expect(marketplace.connect(artist1).pause()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );

      let tx = await marketplace.connect(owner).pause();
      let reciept = await tx.wait();
      let events = reciept.events!.filter((x) => x.event === "Paused");
      expect(events.length).to.be.equal(1);
      expect(events[0].args!.account).to.be.equal(owner.address);
      const voucher2 = await lazyMinter.createVoucher(
        erc1155.address,
        0,
        100,
        true,
        100,
        "/test2/",
        80,
        20,
        [],
        []
      );
      await expect(
        marketplace.connect(artist1).buyWithMint(artist1.address, voucher2, {
          value: BigNumber.from(voucher2.price).mul(voucher2.amount),
        })
      ).to.be.revertedWith("Pausable: paused");

      tx = await marketplace.connect(owner).unpause();
      reciept = await tx.wait();
      events = reciept.events!.filter((x) => x.event === "Unpaused");
      expect(events.length).to.be.equal(1);
      expect(events[0].args!.account).to.be.equal(owner.address);
      await marketplace
        .connect(artist1)
        .buyWithMint(artist1.address, voucher2, {
          value: BigNumber.from(voucher2.price).mul(voucher2.amount),
        });
    });

    it("success check fees", async function () {
      const recieptBalance = await recipient.getBalance();
      const ownerBalance = await owner.getBalance();
      const minterBalance = await minter.getBalance();
      const artist1Balance = await artist1.getBalance();
      const voucher2 = await lazyMinter.createVoucher(
        erc1155.address,
        0,
        100,
        true,
        100,
        "/test2/",
        50,
        20,
        [minter.address, artist1.address],
        [25, 5]
      );
      await marketplace.connect(buyer).buyWithMint(buyer.address, voucher2, {
        value: BigNumber.from(voucher2.price).mul(voucher2.amount),
      });
      const totalPtice = BigNumber.from(100 * 100);
      expect(await recipient.getBalance()).to.be.equal(
        recieptBalance.add(totalPtice.mul(50).div(100))
      );
      expect(await owner.getBalance()).to.be.equal(
        ownerBalance.add(totalPtice.mul(20).div(100))
      );
      expect(await minter.getBalance()).to.be.equal(
        minterBalance.add(totalPtice.mul(25).div(100))
      );
      expect(await artist1.getBalance()).to.be.equal(
        artist1Balance.add(totalPtice.mul(5).div(100))
      );
    });
  });
});
