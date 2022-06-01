///SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/interfaces/IERC1155.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC1155Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./manifold/core/IERC721CreatorCore.sol";
import "./manifold/core/IERC1155CreatorCore.sol";
import "./utils/TransferHelper.sol";

contract AssemblyCuratedV3 is ReentrancyGuard, Ownable, Pausable, EIP712 {
    string private constant SIGNING_DOMAIN =
        "AssemblyCurated-LazyMintingNFT-Voucher";
    string private constant SIGNATURE_VERSION = "1";

    struct NFTVoucher {
        /// @notice The id of the voucher. Must be unique - if another token with this ID already exists, the redeem function will revert.
        uint256 voucherId;
        /// @notice Token address.
        address token;
        /// @notice If the required ERC1155 token is already minted, you must specify token id, if not - set zero.
        uint256 tokenId;
        /// @notice The minimum price (in wei) that the NFT creator is willing to accept for the initial sale of this NFT.
        uint256 price;
        /// @notice Is this token ERC1155?
        bool is1155;
        /// @notice Amount for ERC1155.
        uint256 amount;
        /// @notice The metadata URI to associate with this token.
        string uri;
        /// @notice Distribution percentage for AssemblyCurated recipient
        uint8 recipientFee;
        /// @notice Distribution percentage for token owner
        uint8 ownerFee;
        /// @notice Addresses of additional defined wallets
        address[] definedWallets;
        /// @notice Distribution percentage for additional defined wallets
        uint8[] definedWalletsFees;
        /// @notice the EIP-712 signature of all other fields in the NFTVoucher struct. For a voucher to be valid, it must be signed by an account with the MINTER_ROLE.
        bytes signature;
    }

    event UpdateRecipient(address newRecipient);
    event SetMinter(address caller, bool isAllowed);
    event VoucherUsed(
        address indexed token,
        uint256 indexed tokenId,
        address recipient,
        uint256 voucherId
    );

    ///@notice - return when one of parameters is zero address
    error ZeroAddress();
    ///@notice - array lengths do not match
    error WrongArrayLength();
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
    ///@notice - sum of voucher fees is not equal 100
    error InvalidVoucherFees();

    address public recipient;

    mapping(address => bool) private minters;
    mapping(uint256 => bool) public usedVouchers;

    constructor(
        address _recipient,
        address _owner,
        address[] memory _minters
    ) payable EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) {
        if (_recipient == address(0)) {
            revert ZeroAddress();
        }
        recipient = _recipient;

        if (_owner != address(0)) {
            _transferOwnership(_owner);
        }

        uint256 length = _minters.length;
        for (uint256 i; i < length; ) {
            if (_minters[i] == address(0)) {
                revert ZeroAddress();
            }

            minters[_minters[i]] = true;

            unchecked {
                ++i;
            }
        }
    }

    // ------ LAZY MINTING ------ //
    /// @notice buy token by signed voucher
    /// @param redeemer - recipient address
    /// @param voucher - signed by minter NFTVoucher
    function buyWithMint(address redeemer, NFTVoucher calldata voucher)
        public
        payable
        whenNotPaused
        returns (uint256)
    {
        if (usedVouchers[voucher.voucherId]) {
            revert VoucherAlreadyUsed();
        }

        // make sure signature is valid and get the address of the signer
        address signer = _verify(voucher);

        // make sure that the signer is authorized to mint NFTs
        if (!minters[signer]) {
            revert InvalidSignature();
        }

        uint256 totalPrice = voucher.is1155
            ? voucher.amount * voucher.price
            : voucher.price;

        if (msg.value < totalPrice) {
            revert InvalidValue();
        }

        if (
            voucher.definedWallets.length != voucher.definedWalletsFees.length
        ) {
            revert WrongArrayLength();
        }

        if (!checkFeesSum(voucher)) {
            revert InvalidVoucherFees();
        }

        uint256 newTokenId = voucher.tokenId;

        if (voucher.is1155) {
            if (voucher.amount == 0) {
                revert InvalidAmount();
            }

            address[] memory to = new address[](1);
            to[0] = redeemer;

            uint256[] memory amount = new uint256[](1);
            amount[0] = voucher.amount;

            if (voucher.tokenId != 0) {
                uint256[] memory tokensIds = new uint256[](1);
                tokensIds[0] = voucher.tokenId;
                IERC1155CreatorCore(voucher.token).mintExtensionExisting(
                    to,
                    tokensIds,
                    amount
                );
            } else {
                string[] memory uri = new string[](1);
                uri[0] = voucher.uri;
                uint256[] memory ids = IERC1155CreatorCore(voucher.token)
                    .mintExtensionNew(to, amount, uri);
                newTokenId = ids[0];
            }
        } else {
            newTokenId = IERC721CreatorCore(voucher.token).mintExtension(
                redeemer,
                voucher.uri
            );
        }

        uint256 sendValue;

        uint256 ownerValue = (totalPrice * voucher.ownerFee) / 100;
        sendValue += ownerValue;
        TransferHelper.safeTransferETH(
            Ownable(voucher.token).owner(),
            ownerValue
        );

        uint256 recipientValue = (totalPrice * voucher.recipientFee) / 100;
        sendValue += recipientValue;
        TransferHelper.safeTransferETH(recipient, recipientValue);

        uint256 length = voucher.definedWallets.length;
        for (uint256 i; i < length; ) {
            uint256 defWalValue = (totalPrice * voucher.definedWalletsFees[i]) /
                100;
            sendValue += defWalValue;
            TransferHelper.safeTransferETH(
                voucher.definedWallets[i],
                defWalValue
            );

            unchecked {
                ++i;
            }
        }

        // refund dust eth, if any
        if (msg.value > sendValue) {
            TransferHelper.safeTransferETH(msg.sender, msg.value - sendValue);
        }

        usedVouchers[voucher.voucherId] = true;
        emit VoucherUsed(
            voucher.token,
            newTokenId,
            redeemer,
            voucher.voucherId
        );
        return newTokenId;
    }

    /// @notice verify voucher signature
    /// @return address of signer
    function _verify(NFTVoucher calldata voucher)
        internal
        view
        returns (address)
    {
        bytes32 digest = _hash(voucher);
        return ECDSA.recover(digest, voucher.signature);
    }

    /// @notice returns voucher digest for recover
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
                            "NFTVoucher(uint256 voucherId,address token,uint256 tokenId,uint256 price,bool is1155,uint256 amount,string uri,uint8 recipientFee,uint8 ownerFee,address[] definedWallets,uint8[] definedWalletsFees)"
                        ),
                        voucher.voucherId,
                        voucher.token,
                        voucher.tokenId,
                        voucher.price,
                        voucher.is1155,
                        voucher.amount,
                        keccak256(bytes(voucher.uri)),
                        voucher.recipientFee,
                        voucher.ownerFee,
                        keccak256(abi.encodePacked(voucher.definedWallets)),
                        keccak256(abi.encodePacked(voucher.definedWalletsFees))
                    )
                )
            );
    }

    /// @notice Returns the chain id of the current blockchain.
    function getChainID() external view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return id;
    }

    function checkFeesSum(NFTVoucher calldata voucher)
        private
        pure
        returns (bool)
    {
        uint8 sum = voucher.recipientFee;
        sum += voucher.ownerFee;
        uint256 length = voucher.definedWallets.length;
        for (uint256 i; i < length; ) {
            sum += voucher.definedWalletsFees[i];

            unchecked {
                ++i;
            }
        }

        return sum == 100;
    }

    /* --- OWNER --- */

    function isMinter(address minter) external view onlyOwner returns (bool) {
        return minters[minter];
    }

    ///@notice - set new marketplace recipient address
    ///@param newRecipient - recipient address
    function updateRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) {
            revert ZeroAddress();
        }
        recipient = newRecipient;
        emit UpdateRecipient(newRecipient);
    }

    ///@notice - removing minter
    ///@param minter - minter address
    function removeMinter(address minter) external onlyOwner {
        if (!minters[minter]) {
            revert AlreadySet();
        }
        minters[minter] = false;
        emit SetMinter(minter, false);
    }

    ///@notice - adding a new minter
    ///@param minter - minter address
    function addMinter(address minter) external onlyOwner {
        if (minter == address(0)) {
            revert ZeroAddress();
        }
        if (minters[minter]) {
            revert AlreadySet();
        }
        minters[minter] = true;
        emit SetMinter(minter, true);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
