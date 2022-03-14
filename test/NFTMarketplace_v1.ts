import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ERC721Creator,
  ERC1155Creator,
  NFTMarketplace,
} from "../typechain-types";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("NFT_Marketplace_v1", function () {
  let marketplace: NFTMarketplace;
  let erc721: ERC721Creator;
  let erc1155: ERC1155Creator;
  let owner: SignerWithAddress,
    recipient: SignerWithAddress,
    allowedCaller: SignerWithAddress,
    artist1: SignerWithAddress,
    artist2: SignerWithAddress,
    buyer: SignerWithAddress;

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

    const Marketplace = await ethers.getContractFactory("NFTMarketplace");

    marketplace = await Marketplace.deploy(recipient.address, [
      allowedCaller.address,
    ]);
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
      ).to.be.revertedWith("NFTMarketplace: Amount must be greater than zero");
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
      ).to.be.revertedWith("NFTMarketplace: Lot already exists");
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
    });

    it("reject when trying to buy a non-existent lot", async function () {
      let lastLotId = (await marketplace.lastLotId()).toNumber();
      await expect(marketplace.buyLot(++lastLotId, 0)).to.be.revertedWith(
        "NFTMarketplace: Lot is not active"
      );
    });

    it("reject when lot status is not active", async function () {
      await marketplace.deactivateLot(1);

      await expect(marketplace.buyLot(1, 0)).to.be.revertedWith(
        "NFTMarketplace: Lot is not active"
      );
    });

    it("reject when is not enough value", async function () {
      const lot = await marketplace.lots(1);
      await expect(
        marketplace.buyLot(1, 0, {
          value: ethers.BigNumber.from(lot.price).sub(100),
        })
      ).to.be.revertedWith("NFTMarketplace: Not enought value");
    });

    it("success erc721", async function () {
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
      ).to.be.revertedWith("NFTMatketplace: Lot cannot be canceled");
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
      ).to.be.revertedWith("NFTMatketplace: Lot cannot be canceled");
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
      ).to.be.revertedWith("NFTMatketplace: Lot cannot be deactivated");
    });

    it("reject activate when status is not inactive", async function () {
      await expect(marketplace.activateLot(1)).to.be.revertedWith(
        "NFTMatketplace: Lot cannot be activated"
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
      ).to.be.revertedWith("NFTMarketplace: Address is zero");

      await marketplace.updateRecipient(artist2.address);
      expect(await marketplace.recipient()).to.be.equal(artist2.address);
    });

    it("allowed caller", async function () {
      expect(
        await marketplace.allowedCallers(allowedCaller.address)
      ).to.be.equal(true);
      await marketplace.removeAllowedCaller(allowedCaller.address);
      expect(
        await marketplace.allowedCallers(allowedCaller.address)
      ).to.be.equal(false);
      await expect(
        marketplace.addAllowedCaller(
          "0x0000000000000000000000000000000000000000"
        )
      ).to.be.revertedWith("NFTMarketplace: Address is zero");
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

    const activeLots = await marketplace.getActiveLots(2, 6);

    expect(activeLots.length).to.be.equal(6);
    expect(activeLots.filter((x: any) => !x.lotStart.eq(0)).length).to.be.equal(
      3
    );
    expect(activeLots.filter((x) => x.lotStart.eq(0)).length).to.be.equal(3);
  });
});
