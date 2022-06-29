import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ERC721Creator,
  ERC1155Creator,
  AssemblyCuratedV2,
} from "../typechain-types";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import LazyMinterV2 from "../helpers/minter_v2";

describe("AssemblyCurated_v2", function () {
  let marketplace: AssemblyCuratedV2;
  let erc721: ERC721Creator;
  let erc1155: ERC1155Creator;
  let owner: SignerWithAddress,
    recipient: SignerWithAddress,
    allowedCaller: SignerWithAddress,
    artist1: SignerWithAddress,
    artist2: SignerWithAddress,
    buyer: SignerWithAddress;
  let lazyMinter: LazyMinterV2;

  const price = "1000";

  before(async () => {
    [owner, recipient, allowedCaller, artist1, artist2, buyer] =
      await ethers.getSigners();
  });

  beforeEach(async () => {
    const ERC721 = await ethers.getContractFactory("ERC721Creator");
    const ERC1155 = await ethers.getContractFactory("ERC1155Creator");

    erc721 = await ERC721.deploy("721", "token");
    erc1155 = await ERC1155.deploy();

    const Marketplace = await ethers.getContractFactory("AssemblyCuratedV2");

    marketplace = await Marketplace.deploy(
      recipient.address,
      [allowedCaller.address],
      "0x0000000000000000000000000000000000000000",
      [allowedCaller.address]
    );
  });

  it("constructor", async function () {
    const Marketplace = await ethers.getContractFactory("AssemblyCuratedV2");

    await expect(
      Marketplace.deploy(
        "0x0000000000000000000000000000000000000000",
        [allowedCaller.address],
        "0x0000000000000000000000000000000000000000",
        [allowedCaller.address]
      )
    ).to.be.revertedWith("ZeroAddress()");

    await expect(
      Marketplace.deploy(
        recipient.address,
        ["0x0000000000000000000000000000000000000000"],
        "0x0000000000000000000000000000000000000000",
        [allowedCaller.address]
      )
    ).to.be.revertedWith("ZeroAddress()");

    let tmpMarketplace = await Marketplace.deploy(
      recipient.address,
      [allowedCaller.address],
      "0x0000000000000000000000000000000000000000",
      [allowedCaller.address]
    );

    expect(await tmpMarketplace.owner()).to.be.equal(owner.address);

    tmpMarketplace = await Marketplace.deploy(
      recipient.address,
      [allowedCaller.address],
      allowedCaller.address,
      [allowedCaller.address]
    );

    expect(await tmpMarketplace.owner()).to.be.equal(allowedCaller.address);
  });

  it("permissions", async function () {
    await expect(
      marketplace.createLot(erc721.address, 1, artist1.address, 100, false, 0)
    ).to.be.revertedWith("OnlyAllowedCaller()");
    await expect(
      marketplace.batchCreateLots(
        [erc721.address],
        [1],
        [artist1.address],
        [100],
        [false],
        [0]
      )
    ).to.be.revertedWith("OnlyAllowedCaller()");

    await expect(
      marketplace.connect(allowedCaller).cancelLot(1, artist1.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      marketplace.connect(allowedCaller).batchCancelLots([1], [artist1.address])
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      marketplace.connect(allowedCaller).deactivateLot(1)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      marketplace.connect(allowedCaller).batchDeactivateLots([1])
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      marketplace.connect(allowedCaller).activateLot(1)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      marketplace.connect(allowedCaller).batchActivateLots([1])
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      marketplace.connect(allowedCaller).updateRecipient(recipient.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      marketplace.connect(allowedCaller).addAllowedCaller(owner.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      marketplace.connect(allowedCaller).removeAllowedCaller(owner.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      marketplace
        .connect(allowedCaller)
        .rescue(owner.address, erc721.address, 1, false, 0)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("supports interface", async function () {
    expect(await marketplace.supportsInterface("0x4e2312e0")).to.be.equal(true);
    expect(await marketplace.supportsInterface("0x01ffc9a7")).to.be.equal(true);
    expect(await marketplace.supportsInterface("0x80ac58cd")).to.be.equal(
      false
    );
  });

  it("received functions", async function () {
    expect(
      await marketplace.onERC1155Received(
        erc1155.address,
        artist1.address,
        1,
        2,
        "0x00"
      )
    ).to.be.equal("0xf23a6e61");
    expect(
      await marketplace.onERC1155BatchReceived(
        erc1155.address,
        artist1.address,
        [1],
        [2],
        "0x00"
      )
    ).to.be.equal("0xbc197c81");
    expect(
      await marketplace.onERC721Received(
        erc721.address,
        artist1.address,
        1,
        "0x00"
      )
    ).to.be.equal("0x150b7a02");
  });

  it("support token", async function () {
    const ERC20 = await ethers.getContractFactory("ERC20");
    const erc20 = await ERC20.deploy("Test", "ERC");
    const Mock = await ethers.getContractFactory("MockToken");
    const mock = await Mock.deploy();

    await expect(
      marketplace
        .connect(allowedCaller)
        .createLot(erc20.address, 1, artist1.address, 1000, false, 0)
    ).to.be.revertedWith(
      "function selector was not recognized and there's no fallback function"
    );
    await expect(
      marketplace
        .connect(allowedCaller)
        .createLot(mock.address, 1, artist1.address, 1000, false, 0)
    ).to.be.revertedWith("InvalidToken()");
  });

  describe("create lot", function () {
    beforeEach(async () => {
      await erc721["mintBaseBatch(address,uint16)"](artist1.address, 100);
      await erc1155.mintBaseNew([artist1.address], [100], ["0x0"]);
    });

    it("reject without token owner", async function () {
      await erc721
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      await expect(
        marketplace
          .connect(allowedCaller)
          .createLot(erc721.address, 1, artist2.address, "1000", false, 0)
      ).to.be.revertedWith("ERC721: transfer from incorrect owner");
    });

    it("reject when token is not approve", async function () {
      await expect(
        marketplace
          .connect(allowedCaller)
          .createLot(erc721.address, 1, artist1.address, "1000", false, 0)
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approve");
    });

    it("reject when erc1155 amount is zero", async function () {
      await erc1155
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      await expect(
        marketplace
          .connect(allowedCaller)
          .createLot(erc1155.address, 1, artist1.address, price, true, 0)
      ).to.be.revertedWith("InvalidAmount()");
    });

    it("success single lot", async function () {
      let activeLots;
      let lastLotId = (await marketplace.lastLotId()).toNumber();
      await erc721
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      const txERC721 = await marketplace
        .connect(allowedCaller)
        .createLot(erc721.address, 1, artist1.address, price, false, 0);
      const recieptERC721 = await txERC721.wait();

      let newLotEvents =
        recieptERC721.events!.filter((x) => x.event === "NewLot") || [];
      let event = newLotEvents[0].args;
      expect(newLotEvents.length).to.be.equal(1);
      expect(event!.lotId).to.equal(++lastLotId);
      expect(event!.tokenId).to.equal(1);
      expect(event!.token).to.equal(erc721.address);
      expect(event!.owner).to.equal(artist1.address);
      expect(event!.totalSupply).to.equal(0);
      expect(await erc721.ownerOf(1)).to.be.equal(marketplace.address);

      let lot = await marketplace.lots(lastLotId);
      expect(lot.price).to.be.equal(price);
      expect(lot.status).to.be.equal(1);

      activeLots = await marketplace.getActiveLots(0, 1);
      expect(activeLots[0].token).to.be.equal(erc721.address);
      expect(activeLots[0].tokenId).to.be.equal(1);

      await erc1155
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      const txERC1155 = await marketplace
        .connect(allowedCaller)
        .createLot(erc1155.address, 1, artist1.address, price, true, 25);
      const recieptERC1155 = await txERC1155.wait();

      newLotEvents = recieptERC1155.events!.filter((x) => x.event === "NewLot");

      expect(newLotEvents.length).to.be.equal(1);
      event = newLotEvents[0].args;
      expect(event!.lotId).to.equal(++lastLotId);
      expect(event!.tokenId).to.equal(1);
      expect(event!.token).to.equal(erc1155.address);
      expect(event!.owner).to.equal(artist1.address);
      expect(event!.totalSupply).to.equal(25);
      expect(await erc1155.balanceOf(marketplace.address, 1)).to.be.equal(25);
      expect(await erc1155.balanceOf(artist1.address, 1)).to.be.equal(75);
      lot = await marketplace.lots(lastLotId);
      expect(lot.price).to.be.equal(price);
      expect(lot.status).to.be.equal(1);

      activeLots = await marketplace.getActiveLots(1, 1);
      expect(activeLots[0].token).to.be.equal(erc1155.address);
      expect(activeLots[0].tokenId).to.be.equal(1);
    });

    it("reject batch create with wrong lengths", async function () {
      await erc721
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      await erc1155.mintBaseNew([artist1.address], [100], ["0x0"]);
      await erc1155
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);

      await expect(
        marketplace
          .connect(allowedCaller)
          .batchCreateLots(
            [erc721.address, erc1155.address],
            [1, 1],
            [artist1.address],
            [100, 100],
            [false, true],
            [0, 10]
          )
      ).to.be.revertedWith("WrongArrayLength()");
    });

    it("success batch create", async function () {
      await erc721
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      await erc1155.mintBaseNew([artist1.address], [100], ["0x0"]);
      await erc1155
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);

      const tokens = new Array(48).fill(erc721.address);
      const ids = [];
      const owners = new Array(48).fill(artist1.address);
      const prices = [];
      const isMultiples = new Array(48).fill(false);
      const amounts = new Array(48).fill(0);

      for (let i = 0; i < 48; i++) {
        ids.push(i + 1);
        prices.push((100 + i).toString());
      }

      tokens.push(erc1155.address);
      tokens.push(erc1155.address);
      ids.push(1);
      ids.push(2);
      owners.push(artist1.address);
      owners.push(artist1.address);
      prices.push("1000");
      prices.push("1000");
      isMultiples.push(true);
      isMultiples.push(true);
      amounts.push(30);
      amounts.push(45);

      await marketplace
        .connect(allowedCaller)
        .batchCreateLots(tokens, ids, owners, prices, isMultiples, amounts);

      expect(await marketplace.activeLotCount()).to.be.equal(50);
    });

    it("reject when lot is already exist", async function () {
      await erc721
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      await marketplace
        .connect(allowedCaller)
        .createLot(erc721.address, 1, artist1.address, price, false, 0);

      await expect(
        marketplace
          .connect(allowedCaller)
          .createLot(erc721.address, 1, artist1.address, price, false, 0)
      ).to.be.revertedWith("LotAlreadyExists()");
    });
  });

  describe("buy lot", function () {
    beforeEach(async () => {
      await erc721["mintBaseBatch(address,uint16)"](artist1.address, 100);
      await erc1155.mintBaseNew([artist1.address], [100], ["0x0"]);
      await erc721
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      await marketplace
        .connect(allowedCaller)
        .createLot(erc721.address, 1, artist1.address, price, false, 0);
      await erc1155
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      await marketplace
        .connect(allowedCaller)
        .createLot(erc1155.address, 1, artist1.address, price, true, 25);

      await erc721["setRoyalties(address[],uint256[])"](
        [artist1.address, artist2.address],
        [5000, 2000]
      );
    });

    it("reject when trying to buy a non-existent lot", async function () {
      let lastLotId = (await marketplace.lastLotId()).toNumber();
      await expect(marketplace.buyLot(++lastLotId, 0)).to.be.revertedWith(
        "InvalidLotStatus(0)"
      );
    });

    it("reject when lot status is not active", async function () {
      await marketplace.deactivateLot(1);

      await expect(marketplace.buyLot(1, 0)).to.be.revertedWith(
        "InvalidLotStatus(0)"
      );
    });

    it("reject when is not enough value", async function () {
      let lot = await marketplace.lots(1);
      await expect(
        marketplace.buyLot(1, 0, {
          value: ethers.BigNumber.from(lot.price).sub(100),
        })
      ).to.be.revertedWith("InvalidValue()");

      lot = await marketplace.lots(2);
      await expect(
        marketplace.buyLot(2, 5, {
          value: ethers.BigNumber.from(lot.price).sub(100),
        })
      ).to.be.revertedWith("InvalidValue()");
    });

    it("reject when invalid amount", async function () {
      const lot = await marketplace.lots(2);
      await expect(
        marketplace.buyLot(2, 0, {
          value: ethers.BigNumber.from(lot.price),
        })
      ).to.be.revertedWith("InvalidAmount()");

      await marketplace.buyLot(2, 5, {
        value: ethers.BigNumber.from(lot.price).mul(5),
      });

      await expect(
        marketplace.buyLot(2, 21, {
          value: ethers.BigNumber.from(lot.price).mul(21),
        })
      ).to.be.revertedWith("InvalidAmount()");
    });

    it("success erc721", async function () {
      const balances = [];
      balances[0] = await artist1.getBalance();
      balances[2] = await buyer.getBalance();
      balances[3] = await recipient.getBalance();

      const tx = await marketplace
        .connect(buyer)
        .buyLot(1, 0, { value: price });

      const txReciept = await tx.wait();

      const events = txReciept.events!.filter((x) => x.event === "SellLot");

      expect(events.length).to.be.equal(1);
      const event = events[0].args;
      expect(event!.lotId).to.be.equal(1);
      expect(event!.tokenId).to.be.equal(1);
      expect(event!.token).to.be.equal(erc721.address);
      expect(event!.buyer).to.be.equal(buyer.address);
      expect(event!.amount).to.be.equal(0);
      expect(event!.price).to.be.equal(price);

      const lot = await marketplace.lots(1);
      expect(lot.status).to.be.equal(2);
      expect(await erc721.ownerOf(1)).to.be.equal(buyer.address);

      expect(await marketplace.activeLotCount()).to.be.equal(1);
      const activeLots = await marketplace.getActiveLots(0, 1);
      expect(activeLots[0].token).to.be.equal(erc1155.address);
      expect(activeLots[0].tokenId).to.be.equal(1);

      const txPrice = txReciept.effectiveGasPrice.mul(
        txReciept.cumulativeGasUsed
      );

      expect(await artist1.getBalance()).to.be.equal(
        balances[0].add(lot.price.mul(80).div(100))
      );
      expect(await buyer.getBalance()).to.be.equal(
        balances[2].sub(txPrice.add(price))
      );
      expect(await recipient.getBalance()).to.be.equal(
        balances[3].add(lot.price.mul(20).div(100))
      );
    });

    it("success erc721 with dust", async function () {
      const tx = await marketplace
        .connect(buyer)
        .buyLot(1, 0, { value: BigNumber.from(price).add(1000) });

      const txReciept = await tx.wait();

      const events = txReciept.events!.filter((x) => x.event === "SellLot");

      expect(events.length).to.be.equal(1);
      const event = events[0].args;
      expect(event!.lotId).to.be.equal(1);
      expect(event!.tokenId).to.be.equal(1);
      expect(event!.token).to.be.equal(erc721.address);
      expect(event!.buyer).to.be.equal(buyer.address);
      expect(event!.amount).to.be.equal(0);
      expect(event!.price).to.be.equal(price);

      const lot = await marketplace.lots(1);
      expect(lot.status).to.be.equal(2);
      expect(await erc721.ownerOf(1)).to.be.equal(buyer.address);

      expect(await marketplace.activeLotCount()).to.be.equal(1);
      const activeLots = await marketplace.getActiveLots(0, 1);
      expect(activeLots[0].token).to.be.equal(erc1155.address);
      expect(activeLots[0].tokenId).to.be.equal(1);
    });

    it("success erc1155", async function () {
      const firstAmount = 20;
      const secondAmount = 5;
      let events;
      let event;
      const tx1 = await marketplace.connect(buyer).buyLot(2, firstAmount, {
        value: ethers.BigNumber.from(price).mul(firstAmount).add(1),
      });

      const tx1Reciept = await tx1.wait();

      events = tx1Reciept.events!.filter((x) => x.event === "SellLot");
      expect(events.length).to.be.equal(1);
      event = events[0].args;
      expect(event!.lotId).to.be.equal(2);
      expect(event!.tokenId).to.be.equal(1);
      expect(event!.token).to.be.equal(erc1155.address);
      expect(event!.buyer).to.be.equal(buyer.address);
      expect(event!.amount).to.be.equal(firstAmount);
      expect(event!.price).to.be.equal(price);

      let lot = await marketplace.lots(2);
      expect(lot.status).to.be.equal(1);
      expect(await erc1155.balanceOf(buyer.address, 1)).to.be.equal(
        firstAmount
      );

      const tx2 = await marketplace.connect(buyer).buyLot(2, secondAmount, {
        value: ethers.BigNumber.from(price).mul(secondAmount * 2),
      });
      const tx2Reciept = await tx2.wait();
      events = tx2Reciept.events!.filter((x) => x.event === "SellLot");
      expect(events.length).to.be.equal(1);
      event = events[0].args;
      expect(event!.lotId).to.be.equal(2);
      expect(event!.tokenId).to.be.equal(1);
      expect(event!.token).to.be.equal(erc1155.address);
      expect(event!.buyer).to.be.equal(buyer.address);
      expect(event!.amount).to.be.equal(secondAmount);
      expect(event!.price).to.be.equal(price);

      lot = await marketplace.lots(2);
      expect(lot.status).to.be.equal(2);
      expect(await erc1155.balanceOf(buyer.address, 1)).to.be.equal(
        firstAmount + secondAmount
      );

      expect(await marketplace.activeLotCount()).to.be.equal(1);
      const activeLots = await marketplace.getActiveLots(0, 1);
      expect(activeLots[0].token).to.be.equal(erc721.address);
      expect(activeLots[0].tokenId).to.be.equal(1);
    });
  });

  describe("cancel lot", function () {
    beforeEach(async () => {
      await erc721["mintBaseBatch(address,uint16)"](artist1.address, 100);
      await erc1155.mintBaseNew([artist1.address], [100], ["0x0"]);
      await erc721
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      await marketplace
        .connect(allowedCaller)
        .createLot(erc721.address, 1, artist1.address, price, false, 0);
      await erc1155
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      await marketplace
        .connect(allowedCaller)
        .createLot(erc1155.address, 1, artist1.address, price, true, 25);
    });

    it("reject when trying to cancel a non-existent lot", async function () {
      let lastLotId = (await marketplace.lastLotId()).toNumber();
      await expect(
        marketplace.cancelLot(++lastLotId, artist2.address)
      ).to.be.revertedWith("InvalidLotStatus(0)");
    });

    it("sucess single", async function () {
      let event;
      let lot;
      const tx1 = await marketplace.cancelLot(1, artist2.address);
      const recieptTx1 = await tx1.wait();

      event = recieptTx1.events!.filter((x) => x.event === "CancelLot");

      expect(event.length).to.be.equal(1);
      lot = await marketplace.lots(1);

      expect(lot.status).to.be.equal(3);
      expect(await erc721.ownerOf(1)).to.be.equal(artist2.address);

      const tx2 = await marketplace.cancelLot(2, artist2.address);
      const recieptTx2 = await tx2.wait();

      event = recieptTx2.events!.filter((x) => x.event === "CancelLot");

      expect(event.length).to.be.equal(1);
      lot = await marketplace.lots(1);

      expect(lot.status).to.be.equal(3);
      expect(await erc1155.balanceOf(artist2.address, 1)).to.be.equal(25);
    });

    it("reject invalid batch length", async function () {
      await marketplace
        .connect(allowedCaller)
        .createLot(erc721.address, 2, artist1.address, price, false, 0);

      await expect(
        marketplace.batchCancelLots(
          [1, 2, 3],
          [artist2.address, artist2.address]
        )
      ).to.be.revertedWith("WrongArrayLength()");
    });

    it("success batch", async function () {
      await marketplace
        .connect(allowedCaller)
        .createLot(erc721.address, 2, artist1.address, price, false, 0);
      await marketplace
        .connect(allowedCaller)
        .createLot(erc721.address, 3, artist1.address, price, false, 0);
      await marketplace
        .connect(allowedCaller)
        .createLot(erc721.address, 4, artist1.address, price, false, 0);
      expect(await marketplace.activeLotCount()).to.be.equal(5);
      await marketplace.batchCancelLots(
        [1, 2, 3, 4, 5],
        [
          artist2.address,
          artist2.address,
          artist2.address,
          artist2.address,
          artist2.address,
        ]
      );
      expect(await marketplace.activeLotCount()).to.be.equal(0);
    });

    it("success with zero address", async function () {
      const lot = await marketplace.lots(1);
      expect(await erc721.ownerOf(1)).to.be.not.equal(lot.owner);

      await marketplace.cancelLot(
        1,
        "0x0000000000000000000000000000000000000000"
      );

      expect(await erc721.ownerOf(1)).to.be.equal(lot.owner);
    });

    it("reject when lot sold or already canceled", async function () {
      await marketplace.cancelLot(1, artist2.address);
      await expect(
        marketplace.cancelLot(1, artist2.address)
      ).to.be.revertedWith("InvalidLotStatus(3)");
    });
  });

  describe("activate/deactivate lot", function () {
    beforeEach(async () => {
      await erc721["mintBaseBatch(address,uint16)"](artist1.address, 100);
      await erc721
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      await marketplace
        .connect(allowedCaller)
        .createLot(erc721.address, 1, artist1.address, price, false, 0);

      await erc1155.mintBaseNew([artist1.address], [100], ["0x0"]);
      await erc1155
        .connect(artist1)
        .setApprovalForAll(marketplace.address, true);
      await marketplace
        .connect(allowedCaller)
        .createLot(erc1155.address, 1, artist1.address, price, true, 25);
    });

    it("reject deactivate when status is not active", async function () {
      await marketplace.connect(buyer).buyLot(1, 0, { value: price });
      await expect(
        marketplace.connect(owner).deactivateLot(1)
      ).to.be.revertedWith("InvalidLotStatus(2)");
    });

    it("reject activate when status is not inactive", async function () {
      await expect(marketplace.activateLot(1)).to.be.revertedWith(
        "InvalidLotStatus(1)"
      );
    });

    it("success single", async function () {
      let lot;
      const tx1 = await marketplace.deactivateLot(1);
      const tx1Reciept = await tx1.wait();

      lot = await marketplace.lots(1);
      expect(
        tx1Reciept.events!.filter((x: any) => x.event === "DeactivateLot")
          .length
      ).to.be.equal(1);
      expect(lot.status).to.be.equal(0);
      expect(lot.lotStart).to.be.not.equal(0);
      const tx2 = await marketplace.activateLot(1);
      const tx2Reciept = await tx2.wait();

      expect(
        tx2Reciept.events!.filter((x: any) => x.event === "ActivateLot").length
      ).to.be.equal(1);
      lot = await marketplace.lots(1);

      expect(lot.status).to.be.equal(1);
    });

    it("success batch", async function () {
      const tx1 = await marketplace.batchDeactivateLots([1, 2]);
      const tx1Reciept = await tx1.wait();

      expect(
        tx1Reciept.events!.filter((x: any) => x.event === "DeactivateLot")
          .length
      ).to.be.equal(2);
      expect((await marketplace.lots(1)).status).to.be.equal(0);
      expect((await marketplace.lots(1)).lotStart).to.be.not.equal(0);
      expect((await marketplace.lots(2)).status).to.be.equal(0);
      expect((await marketplace.lots(2)).lotStart).to.be.not.equal(0);

      const tx2 = await marketplace.batchActivateLots([1, 2]);
      const tx2Reciept = await tx2.wait();

      expect(
        tx2Reciept.events!.filter((x: any) => x.event === "ActivateLot").length
      ).to.be.equal(2);
      expect((await marketplace.lots(1)).status).to.be.equal(1);
      expect((await marketplace.lots(2)).status).to.be.equal(1);
    });
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

    it("allowed caller", async function () {
      expect(
        await marketplace.allowedCallers(allowedCaller.address)
      ).to.be.equal(true);
      await expect(
        marketplace.addAllowedCaller(allowedCaller.address)
      ).to.be.revertedWith("AlreadySet()");
      await marketplace.removeAllowedCaller(allowedCaller.address);
      expect(
        await marketplace.allowedCallers(allowedCaller.address)
      ).to.be.equal(false);
      await expect(
        marketplace.removeAllowedCaller(allowedCaller.address)
      ).to.be.revertedWith("AlreadySet()");
      await expect(
        marketplace.addAllowedCaller(
          "0x0000000000000000000000000000000000000000"
        )
      ).to.be.revertedWith("ZeroAddress()");
      await marketplace.addAllowedCaller(allowedCaller.address);
      expect(
        await marketplace.allowedCallers(allowedCaller.address)
      ).to.be.equal(true);
    });

    it("is available token", async function () {
      expect(await marketplace.isSupportedToken(erc721.address)).to.be.equal(
        true
      );
      expect(await marketplace.isSupportedToken(erc1155.address)).to.be.equal(
        true
      );
    });
  });

  it("getActiveLots", async function () {
    await erc721["mintBaseBatch(address,uint16)"](artist1.address, 100);
    await erc721.connect(artist1).setApprovalForAll(marketplace.address, true);
    await marketplace
      .connect(allowedCaller)
      .batchCreateLots(
        new Array(5).fill(erc721.address),
        [1, 2, 3, 4, 5],
        new Array(5).fill(artist1.address),
        new Array(5).fill(1000),
        new Array(5).fill(false),
        new Array(5).fill(0)
      );

    let activeLots = await marketplace.getActiveLots(2, 6);

    expect(activeLots.length).to.be.equal(6);
    expect(activeLots.filter((x: any) => !x.lotStart.eq(0)).length).to.be.equal(
      3
    );
    expect(activeLots.filter((x) => x.lotStart.eq(0)).length).to.be.equal(3);

    activeLots = await marketplace.getActiveLots(0, 2);
    expect(activeLots.length).to.be.equal(2);
  });

  describe("rescue", function () {
    beforeEach(async () => {
      await erc721["mintBaseBatch(address,uint16)"](artist1.address, 100);
      await erc1155.mintBaseNew([artist1.address], [100], ["0x0"]);

      await erc721
        .connect(artist1)
        .transferFrom(artist1.address, marketplace.address, 1);
      await erc1155
        .connect(artist1)
        .safeTransferFrom(artist1.address, marketplace.address, 1, 10, "0x00");
    });

    it("reject with 0 address", async function () {
      await expect(
        marketplace.rescue(
          "0x0000000000000000000000000000000000000000",
          erc721.address,
          1,
          false,
          0
        )
      ).to.be.revertedWith("ZeroAddress()");

      await expect(
        marketplace.rescue(
          "0x0000000000000000000000000000000000000000",
          erc1155.address,
          1,
          true,
          10
        )
      ).to.be.revertedWith("ZeroAddress()");
    });

    it("reject with invalid amount", async function () {
      await expect(
        marketplace.rescue(artist2.address, erc1155.address, 1, true, 0)
      ).to.be.revertedWith("InvalidAmount()");
    });

    it("reject with non exists token", async function () {
      await expect(
        marketplace.rescue(
          "0x0000000000000000000000000000000000000000",
          erc721.address,
          2,
          false,
          0
        )
      ).to.be.revertedWith("ZeroAddress()");
    });

    it("success", async function () {
      let tx, reciept, events, event;

      expect(await erc721.ownerOf(1)).to.be.equal(marketplace.address);
      expect(await erc1155.balanceOf(marketplace.address, 1)).to.be.equal(10);

      tx = await marketplace.rescue(
        artist2.address,
        erc721.address,
        1,
        false,
        0
      );
      reciept = await tx.wait();
      events = reciept.events!.filter((x) => x.event === "RescueToken");

      expect(events.length).to.be.equal(1);
      event = events[0].args;
      expect(event!.to).to.be.equal(artist2.address);
      expect(event!.tokenId).to.be.equal(1);
      expect(event!.token).to.be.equal(erc721.address);
      expect(event!.is1155).to.be.equal(false);
      expect(event!.amount).to.be.equal(0);

      expect(await erc721.ownerOf(1)).to.be.equal(artist2.address);

      tx = await marketplace.rescue(
        artist2.address,
        erc1155.address,
        1,
        true,
        5
      );
      reciept = await tx.wait();

      events = reciept.events!.filter((x) => x.event === "RescueToken");

      expect(events.length).to.be.equal(1);
      event = events[0].args;
      expect(event!.to).to.be.equal(artist2.address);
      expect(event!.tokenId).to.be.equal(1);
      expect(event!.token).to.be.equal(erc1155.address);
      expect(event!.is1155).to.be.equal(true);
      expect(event!.amount).to.be.equal(5);

      expect(await erc1155.balanceOf(artist2.address, 1)).to.be.equal(5);

      expect(await erc1155.balanceOf(marketplace.address, 1)).to.be.equal(5);
    });
  });

  describe("lazy minting", function () {
    beforeEach(async () => {
      lazyMinter = new LazyMinterV2(marketplace, allowedCaller);
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
        "/test2/"
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

    it("reject when voucher with invalid signer", async function () {
      const invalidLazyMinter = new LazyMinterV2(marketplace, owner);
      const voucher = await invalidLazyMinter.createVoucher(
        erc1155.address,
        0,
        100,
        true,
        1,
        "/test2/"
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
        "/test2/"
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
        "/test2/"
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
        "/test2/"
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
        "/test2/"
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
        "/test2/"
      );
      await expect(
        marketplace.connect(buyer).buyWithMint(buyer.address, voucher, {
          value: BigNumber.from(voucher.price).mul(voucher.amount),
        })
      ).to.be.revertedWith("A token was not created by this extension");
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
        "/test2/"
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
        "/test2/"
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
        "/test2/"
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
        "/test2/"
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
  });
});
