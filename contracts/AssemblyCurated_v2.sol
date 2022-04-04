///SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/interfaces/IERC1155.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC1155Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./manifold/core/IERC721CreatorCore.sol";
import "./manifold/core/IERC1155CreatorCore.sol";
import "./utils/TransferHelper.sol";

contract AssemblyCuratedV2 is
    ReentrancyGuard,
    Ownable,
    IERC721Receiver,
    IERC1155Receiver,
    AccessControl,
    EIP712
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    string private constant SIGNING_DOMAIN = "bLZ-LazyMintingNFT-Voucher";
    string private constant SIGNATURE_VERSION = "1";

    enum LotStatus {
        Inactive,
        Active,
        Successful,
        Canceled
    }

    struct Lot {
        address token;
        bool is1155; // true - erc1155, false - erc721
        address owner;
        uint tokenId;
        uint price;
        uint lotStart;
        uint lotEnd;
        LotStatus status;
        uint totalSupply; // 0 - erc721
        uint sold;
    }

    struct NFTVoucher {
        /// @notice The id of the voucher. Must be unique - if another token with this ID already exists, the redeem function will revert.
        uint voucherId;
        /// @notice Token address.
        address token;
        /// @notice If the required ERC1155 token is already minted, you must specify token id, if not - set zero.
        uint tokenId;
        /// @notice The minimum price (in wei) that the NFT creator is willing to accept for the initial sale of this NFT.
        uint price;
        /// @notice Is this token ERC1155?
        bool is1155;
        /// @notice Amount for ERC1155.
        uint amount;
        /// @notice The metadata URI to associate with this token.
        string uri;
        /// @notice the EIP-712 signature of all other fields in the NFTVoucher struct. For a voucher to be valid, it must be signed by an account with the MINTER_ROLE.
        bytes signature;
    }

    event NewLot(
        uint indexed lotId,
        uint indexed tokenId,
        address indexed token,
        address owner,
        uint totalSupply
    );
    event SellLot(
        uint indexed lotId,
        uint indexed tokenId,
        address indexed token,
        address buyer,
        uint amount,
        uint price
    );

    event CancelLot(uint indexed lotId);
    event DeactivateLot(uint indexed lotId);
    event ActivateLot(uint indexed lotId);
    event CloseLot(uint indexed lotId);
    event UpdateRecipient(address newRecipient);
    event SetAllowedCaller(address caller, bool isAllowed);
    event RescueToken(
        address to,
        address token,
        uint tokenId,
        bool is1155,
        uint amount
    );
    event VoucherUsed(address indexed token, uint indexed tokenId, address recipient, uint voucherId);

    ///@notice - return when one of parameters is zero address
    error ZeroAddress();
    ///@notice - only allowedCaller
    error OnlyAllowedCaller();
    ///@notice - token is not support ERC721 or ERC1155 interface
    error InvalidToken();
    ///@notice - lot with the same token and tokenID already exists.
    error LotAlreadyExists();
    ///@notice - array lengths do not match
    error WrongArrayLength();
    ///@notice - the lot has an incorrect status, so the operation cannot be performed.
    /// records the actual status of the lot
    error InvalidLotStatus(LotStatus actualStatus);
    ///@notice - not enough eth
    error InvalidValue();
    ///@notice - amount equal to zero or less than the amount of tokens available in the lot
    error InvalidAmount();
    ///@notice - allowedCaller already added or removed
    error AlreadySet();
    ///@notice - voucher signature is incorrect.
    error InvalidSignature();
    ///@notice - voucher is already used.
    error VoucherAlreadyUsed();

    address public recipient;
    uint public lastLotId;
    uint public activeLotCount;

    mapping(uint => Lot) public lots;
    mapping(address => mapping(uint => uint[])) public tokenLots;
    mapping(address => bool) public allowedCallers;
    mapping(address => mapping(uint => bool)) private existingTokens;
    EnumerableSet.UintSet private activeLots;
    mapping(uint => bool) private usedVouchers;

    constructor(
        address _recipient,
        address[] memory _allowedCallers,
        address _owner,
        address minter
    ) payable EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) {
        if (_recipient == address(0)) {
            revert ZeroAddress();
        }
        recipient = _recipient;

        uint length = _allowedCallers.length;
        for (uint i; i < length; ) {
            if (_allowedCallers[i] == address(0)) {
                revert ZeroAddress();
            }

            allowedCallers[_allowedCallers[i]] = true;

            unchecked {
                ++i;
            }
        }

        if (_owner != address(0)) {
            _transferOwnership(_owner);
        }

        _setupRole(MINTER_ROLE, minter);
    }

    modifier onlyAllowedCaller() {
        if (!allowedCallers[msg.sender]) {
            revert OnlyAllowedCaller();
        }
        _;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(IERC165, AccessControl)
        returns (bool)
    {
        return
            interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId ||
            AccessControl.supportsInterface(interfaceId);
    }

    function onERC1155Received(
        address _operator,
        address _from,
        uint _id,
        uint _value,
        bytes calldata _data
    ) external pure override returns (bytes4) {
        // return bytes4(keccak256("onERC1155Received(address,address,uint,uint,bytes)"));
        return 0xf23a6e61;
    }

    function onERC1155BatchReceived(
        address _operator,
        address _from,
        uint[] calldata _ids,
        uint[] calldata _values,
        bytes calldata _data
    ) external pure override returns (bytes4) {
        // return bytes4(keccak256("onERC1155BatchReceived(address,address,uint[],uint[],bytes)"));
        return 0xbc197c81;
    }

    function onERC721Received(
        address operator,
        address from,
        uint tokenId,
        bytes calldata data
    ) external pure override returns (bytes4) {
        // return bytes4(keccak256("onERC721Received(address,address,uint,bytes)"));
        return 0x150b7a02;
    }

    /// @notice Transfer token to contract and create new lot
    /// @dev prior approve from owner of token is required.
    /// @param token - address of NFT collection
    /// @param tokenId - target token id
    /// @param owner - current owner of token
    /// @param price - price in wei
    /// @param is1155 - is ERC1155 token?
    /// @param amount - amount of ERC1155 token. For ERC721 can be 0
    /// @return lotId - id of new lot
    function createLot(
        address token,
        uint tokenId,
        address owner,
        uint price,
        bool is1155,
        uint amount
    ) public onlyAllowedCaller returns (uint) {
        if (!isSupportedToken(token)) {
            revert InvalidToken();
        }
        if (doesLotExist(token, tokenId)) {
            revert LotAlreadyExists();
        }

        if (is1155) {
            if (amount == 0) {
                revert InvalidAmount();
            }
            IERC1155(token).safeTransferFrom(
                owner,
                address(this),
                tokenId,
                amount,
                "0x0"
            );
        } else {
            IERC721(token).safeTransferFrom(owner, address(this), tokenId);
        }

        uint lotId = ++lastLotId;

        lots[lotId].tokenId = tokenId;
        lots[lotId].token = token;
        lots[lotId].price = price;
        lots[lotId].lotStart = block.timestamp;
        lots[lotId].owner = owner;
        lots[lotId].status = LotStatus.Active;

        lots[lotId].is1155 = is1155;

        if (is1155) lots[lotId].totalSupply = amount;

        tokenLots[token][tokenId].push(lotId);
        EnumerableSet.add(activeLots, lotId);
        existingTokens[token][tokenId] = true;
        activeLotCount++;

        emit NewLot(lotId, tokenId, token, owner, amount);
        return lotId;
    }

    /// @notice multiple creation of lots
    /// @param tokens - addresses of NFT collection
    /// @param tokenIds - target token ids
    /// @param owners - current owners of tokens
    /// @param prices - prices in wei
    /// @param is1155s - is ERC1155 tokens?
    /// @param amounts - amounts of ERC1155 tokens
    function batchCreateLots(
        address[] calldata tokens,
        uint[] calldata tokenIds,
        address[] calldata owners,
        uint[] calldata prices,
        bool[] calldata is1155s,
        uint[] calldata amounts
    ) external onlyAllowedCaller {
        uint length = tokens.length;
        if (
            length != tokenIds.length ||
            length != owners.length ||
            length != prices.length ||
            length != is1155s.length ||
            length != amounts.length
        ) {
            revert WrongArrayLength();
        }

        for (uint i; i < length; ) {
            createLot(
                tokens[i],
                tokenIds[i],
                owners[i],
                prices[i],
                is1155s[i],
                amounts[i]
            );

            unchecked {
                ++i;
            }
        }
    }

    // ------ LAZY MINTING ------ //

    function buyWithMint(address redeemer, NFTVoucher calldata voucher)
        public
        payable
        returns (uint)
    {
        if(usedVouchers[voucher.voucherId]){
            revert VoucherAlreadyUsed();
        }

        // make sure signature is valid and get the address of the signer
        address signer = _verify(voucher);

        // make sure that the signer is authorized to mint NFTs
        if (!hasRole(MINTER_ROLE, signer)) {
            revert InvalidSignature();
        }

        uint totalPrice = voucher.is1155 ? voucher.amount * voucher.price : voucher.price;
    
        if (msg.value < totalPrice) {
            revert InvalidValue();
        }


        uint newTokenId = voucher.tokenId;

        if (voucher.is1155) {
            if(voucher.amount == 0){
                revert InvalidAmount();
            }

            address[] memory to = new address[](1);
            to[0] = redeemer;

            uint[] memory amount = new uint[](1);
            amount[0] = voucher.amount;

            if (voucher.tokenId != 0) {
                uint[] memory tokensIds = new uint[](1);
                tokensIds[0] = voucher.tokenId;
                IERC1155CreatorCore(voucher.token).mintExtensionExisting(
                    to,
                    tokensIds,
                    amount
                );
            } else {
                string[] memory uri = new string[](1);
                uri[0] = voucher.uri;
                uint[] memory ids = IERC1155CreatorCore(voucher.token)
                    .mintExtensionNew(to, amount, uri);
                newTokenId = ids[0];
            }
        } else {
            newTokenId = IERC721CreatorCore(voucher.token).mintExtension(
                redeemer,
                voucher.uri
            );
        }

        uint ownerValue = (totalPrice * 80) / 100;
        TransferHelper.safeTransferETH(Ownable(voucher.token).owner(), ownerValue);
        TransferHelper.safeTransferETH(recipient, totalPrice - ownerValue);

        // refund dust eth, if any
        if (msg.value > totalPrice) {
            TransferHelper.safeTransferETH(msg.sender, msg.value - totalPrice);
        }
        
        usedVouchers[voucher.voucherId]=true;
        emit VoucherUsed(voucher.token, newTokenId, redeemer, voucher.voucherId);
        return newTokenId;
    }

    function _verify(NFTVoucher calldata voucher)
        internal
        view
        returns (address)
    {
        bytes32 digest = _hash(voucher);
        return ECDSA.recover(digest, voucher.signature);
    }

    function _hash(NFTVoucher calldata voucher)
        internal
        view
        returns (bytes32)
    {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "NFTVoucher(uint voucherId,address token,uint tokenId,uint price,bool is1155,uint amount,string uri)"
                        ),
                        voucher.voucherId,
                        voucher.token,
                        voucher.tokenId,
                        voucher.price,
                        voucher.is1155,
                        voucher.amount,
                        keccak256(bytes(voucher.uri))
                    )
                )
            );
    }

    /// @notice Returns the chain id of the current blockchain.
    function getChainID() external view returns (uint) {
        uint id;
        assembly {
            id := chainid()
        }
        return id;
    }

    ///@notice Buy active lot
    ///@param lotId - id of target lot
    ///@param amount - amount for ERC1155 token
    function buyLot(uint lotId, uint amount) public payable nonReentrant {
        Lot memory localLot = lots[lotId];

        if (localLot.status != LotStatus.Active) {
            revert InvalidLotStatus(localLot.status);
        }

        if (localLot.is1155) {
            _buyMultipleLot(lotId, localLot, amount);
        } else {
            _buySingleLot(lotId, localLot);
        }
    }

    ///@notice Cancel lot and send token to target recipient
    ///@dev For transfer to primary owner set newRecipient = address(0)
    ///@param lotId - id of target lot
    ///@param newRecipient - address of the recipient of the canceled token
    function cancelLot(uint lotId, address newRecipient) public onlyOwner {
        Lot memory localLot = lots[lotId];

        if (
            localLot.status != LotStatus.Active &&
            !(localLot.status == LotStatus.Inactive && localLot.lotStart != 0)
        ) {
            revert InvalidLotStatus(localLot.status);
        }

        address finalRecipient = newRecipient != address(0)
            ? newRecipient
            : localLot.owner;

        if (localLot.is1155) {
            IERC1155(localLot.token).safeTransferFrom(
                address(this),
                finalRecipient,
                localLot.tokenId,
                localLot.totalSupply - localLot.sold,
                "0x0"
            );
        } else {
            IERC721(localLot.token).safeTransferFrom(
                address(this),
                finalRecipient,
                localLot.tokenId
            );
        }

        lots[lotId].status = LotStatus.Canceled;
        lots[lotId].lotEnd = block.timestamp;
        activeLotCount--;
        EnumerableSet.remove(activeLots, lotId);
        existingTokens[localLot.token][localLot.tokenId] = false;
        emit CancelLot(lotId);
    }

    ///@notice multiple canceling of lots
    ///@param lotIds - ids of target lots
    ///@param newRecipients - addresses of the recipients of the canceled tokens
    function batchCancelLots(
        uint[] calldata lotIds,
        address[] calldata newRecipients
    ) external onlyOwner {
        uint length = lotIds.length;
        if (length != newRecipients.length) {
            revert WrongArrayLength();
        }

        for (uint i; i < length; ) {
            cancelLot(lotIds[i], newRecipients[i]);

            unchecked {
                ++i;
            }
        }
    }

    ///@notice Deactivate lot, but the token remains
    ///@param lotId - id of target lot
    function deactivateLot(uint lotId) public onlyOwner {
        Lot memory localLot = lots[lotId];

        if (localLot.status != LotStatus.Active) {
            revert InvalidLotStatus(localLot.status);
        }

        lots[lotId].status = LotStatus.Inactive;
        activeLotCount--;
        EnumerableSet.remove(activeLots, lotId);
        emit DeactivateLot(lotId);
    }

    /// @notice multiple deactivating of lots
    ///@param lotIds - ids of target lots
    function batchDeactivateLots(uint[] calldata lotIds) external onlyOwner {
        uint length = lotIds.length;
        for (uint i; i < length; ) {
            deactivateLot(lotIds[i]);

            unchecked {
                ++i;
            }
        }
    }

    ///@notice Activation of a previously deactivated lot
    ///@param lotId - id of target lot
    function activateLot(uint lotId) public onlyOwner {
        Lot memory localLot = lots[lotId];

        if (localLot.status != LotStatus.Inactive && localLot.lotStart != 0) {
            revert InvalidLotStatus(localLot.status);
        }

        lots[lotId].status = LotStatus.Active;
        activeLotCount++;
        EnumerableSet.add(activeLots, lotId);
        emit ActivateLot(lotId);
    }

    ///@notice multiple activating of lots
    ///@param lotIds - ids of target lots
    function batchActivateLots(uint[] calldata lotIds) external onlyOwner {
        uint length = lotIds.length;
        for (uint i; i < length; ) {
            activateLot(lotIds[i]);

            unchecked {
                ++i;
            }
        }
    }

    ///@notice Return list of active lots
    ///@dev If count > of active lots count, then will be returned empty Lot structures
    ///@param start - offset
    ///@param count - limit
    function getActiveLots(uint start, uint count)
        external
        view
        returns (Lot[] memory lotsData)
    {
        uint end = EnumerableSet.length(activeLots);
        if (start + count < end) {
            end = start + count;
        }

        Lot memory lot;
        uint idx;
        lotsData = new Lot[](count);
        for (uint i = start; i < end; ) {
            lot = lots[EnumerableSet.at(activeLots, i)];
            lotsData[idx++] = lot;

            unchecked {
                ++i;
            }
        }
    }

    ///@notice Checks if the token supports the ERC721 or ERC1155 interface
    ///@param token - address of target roken
    function isSupportedToken(address token) public view returns (bool) {
        return
            IERC165(token).supportsInterface(0x80ac58cd) ||
            IERC165(token).supportsInterface(0xd9b67a26);
    }

    ///@notice checking if a lot exists with the specified token
    /// @param token - address of NFT collection
    /// @param tokenId - target token id
    function doesLotExist(address token, uint tokenId)
        private
        view
        returns (bool)
    {
        return existingTokens[token][tokenId];
    }

    ///@notice - buy lot with ERC721 token
    ///@param lotId - id of target lot
    ///@param localLot - target lot structure
    function _buySingleLot(uint lotId, Lot memory localLot) private {
        if (localLot.price > msg.value) {
            revert InvalidValue();
        }

        IERC721(localLot.token).safeTransferFrom(
            address(this),
            msg.sender,
            localLot.tokenId
        );

        uint ownerValue = (localLot.price * 80) / 100;
        TransferHelper.safeTransferETH(localLot.owner, ownerValue);
        TransferHelper.safeTransferETH(recipient, localLot.price - ownerValue);

        // refund dust eth, if any
        if (msg.value > localLot.price)
            TransferHelper.safeTransferETH(
                msg.sender,
                msg.value - localLot.price
            );

        lots[lotId].status = LotStatus.Successful;
        lots[lotId].lotEnd = block.timestamp;
        activeLotCount--;
        EnumerableSet.remove(activeLots, lotId);
        existingTokens[localLot.token][localLot.tokenId] = false;

        emit CloseLot(lotId);
        emit SellLot(
            lotId,
            localLot.tokenId,
            localLot.token,
            msg.sender,
            0,
            localLot.price
        );
    }

    ///@notice - buy lot with ERC1155 token
    ///@param lotId - id of target lot
    ///@param localLot - target lot structure
    function _buyMultipleLot(
        uint lotId,
        Lot memory localLot,
        uint amount
    ) private {
        if (amount == 0 || amount > localLot.totalSupply - localLot.sold) {
            revert InvalidAmount();
        }

        uint totalPrice = amount * localLot.price;
        if (totalPrice > msg.value) {
            revert InvalidValue();
        }

        IERC1155(localLot.token).safeTransferFrom(
            address(this),
            msg.sender,
            localLot.tokenId,
            amount,
            "0x0"
        );

        uint ownerValue = (totalPrice * 80) / 100;
        TransferHelper.safeTransferETH(localLot.owner, ownerValue);
        TransferHelper.safeTransferETH(recipient, totalPrice - ownerValue);


        // refund dust eth, if any
        if (msg.value > totalPrice)
            TransferHelper.safeTransferETH(msg.sender, msg.value - totalPrice);

        lots[lotId].sold += amount;

        if (localLot.sold + amount == localLot.totalSupply) {
            lots[lotId].status = LotStatus.Successful;
            lots[lotId].lotEnd = block.timestamp;
            activeLotCount--;
            EnumerableSet.remove(activeLots, lotId);
            existingTokens[localLot.token][localLot.tokenId] = false;
            emit CloseLot(lotId);
        }

        emit SellLot(
            lotId,
            localLot.tokenId,
            localLot.token,
            msg.sender,
            amount,
            localLot.price
        );
    }

    /* --- OWNER --- */

    ///@notice - set new marketplace recipient address
    ///@param newRecipient - recipient address
    function updateRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) {
            revert ZeroAddress();
        }
        recipient = newRecipient;
        emit UpdateRecipient(newRecipient);
    }

    ///@notice - adding a new allowedCaller
    ///@param caller - allowedCaller address
    function addAllowedCaller(address caller) external onlyOwner {
        if (caller == address(0)) {
            revert ZeroAddress();
        }
        if (allowedCallers[caller]) {
            revert AlreadySet();
        }
        allowedCallers[caller] = true;
        emit SetAllowedCaller(caller, true);
    }

    ///@notice - removing allowedCaller
    ///@param caller - allowedCaller address
    function removeAllowedCaller(address caller) external onlyOwner {
        if (!allowedCallers[caller]) {
            revert AlreadySet();
        }
        allowedCallers[caller] = false;
        emit SetAllowedCaller(caller, false);
    }

    ///@notice transfer NFT token from contract
    ///@dev Not recommended for use with existing lots as it does not change the status of the lot.
    ///To withdraw a token from an existing lot, use cancelLot
    ///@param to - NFT token recipient
    ///@param token - address of NFT collection
    ///@param tokenId - id of NFT token
    ///@param is1155 - is token ERC115?
    ///@param amount - token amount for ERC1155
    function rescue(
        address to,
        address token,
        uint tokenId,
        bool is1155,
        uint amount
    ) external onlyOwner {
        if (to == address(0)) {
            revert ZeroAddress();
        }

        if (is1155) {
            if (amount == 0) {
                revert InvalidAmount();
            }
            IERC1155(token).safeTransferFrom(
                address(this),
                to,
                tokenId,
                amount,
                "0x0"
            );
        } else {
            IERC721(token).safeTransferFrom(address(this), to, tokenId);
        }

        emit RescueToken(to, token, tokenId, is1155, amount);
    }
}
