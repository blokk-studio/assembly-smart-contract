pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC1155.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC1155Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./utils/TransferHelper.sol";

contract NFTMarketplace is ReentrancyGuard, Ownable, IERC721Receiver, IERC1155Receiver  {

    enum LotStatus {
        Inactive,
        Active,
        Successful,
        Canceled
    }

    struct Lot {
        uint tokenId;
        address token;
        uint price;
        LotStatus status; 
        uint lotStart;
        uint lotEnd;
        uint totalSupply; // 0 - erc721
        uint sold;
        address owner;
        bool is1155; // true - erc1155, false - erc721
    }

    event NewLot(uint indexed lotId, uint indexed tokenId, address indexed token, address owner, uint totalSupply);
    event SellLot(uint indexed lotId, uint indexed tokenId, address indexed token, address buyer, uint amount, uint price);
    event CancelLot(uint indexed lotId);
    event DeactivateLot(uint indexed lotId);
    event ActivateLot(uint indexed lotId);
    event CloseLot(uint indexed lotId);
    event UpdateRecipient(address newRecipient);
    event SetAllowedCaller(address caller, bool isAllowed);
    event RescueToken(address to, address token, uint tokenId, bool is1155, uint amount);
 
    address public  recipient;
    uint public lastLotId;
    uint public activeLotCount;

    mapping(uint => Lot) public lots;
    mapping(address => mapping(uint => uint[])) public tokenLots;
    mapping(address => bool) public allowedCallers; 
    mapping(address => mapping(uint => bool)) private existingTokens;
    EnumerableSet.UintSet activeLots; 

    constructor(
        address _recipient,
        address[] memory _allowedCallers
    ) {
        require(_recipient != address(0), "NFTMarketplace: Zero recipient address");
        recipient = _recipient;
        
        for(uint i = 0; i < _allowedCallers.length; i++){
            require(_allowedCallers[i] != address(0), "NFTMarketplace: Zero allowedCaller address");
            allowedCallers[_allowedCallers[i]] = true;
        }
        
    }

    modifier onlyAllowedCaller {
        require(allowedCallers[msg.sender], "NFTMarketplace: Caller is not allowed");
        _;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override (IERC165) returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId;
    }

    function onERC1155Received(address _operator, address _from, uint256 _id, uint256 _value, bytes calldata _data) external pure override returns(bytes4){
        // return bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"));
        return 0xf23a6e61;
    }

    function onERC1155BatchReceived(address _operator, address _from, uint256[] calldata _ids, uint256[] calldata _values, bytes calldata _data) external pure override returns(bytes4){
        // return bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"));
        return 0xbc197c81;
    }
    
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external pure override returns (bytes4){
        // return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
        return 0x150b7a02;
    }



    function createLot(address token, uint tokenId, address owner, uint price, bool is1155, uint amount) public onlyAllowedCaller returns (uint){
        require(isSupportedToken(token), "NFTMarketplace: Token is not available");
        require(!doesLotExist(token, tokenId), "NFTMarketplace: Lot already exists");

        if(is1155){
            require(amount > 0, "NFTMarketplace: Amount must be greater than zero");
            IERC1155(token).safeTransferFrom(owner, address(this), tokenId, amount, "0x0");
        }else{
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

        if(is1155) lots[lotId].totalSupply = amount;

        tokenLots[token][tokenId].push(lotId);
        EnumerableSet.add(activeLots, lotId);
        existingTokens[token][tokenId] = true;
        activeLotCount++;

        emit NewLot(lotId, tokenId, token, owner, amount);
        return lotId;
    }

    function batchCreateLots(address[] memory tokens, uint[] memory tokenIds, address[] memory owners, uint[] memory prices, bool[] memory is1155s, uint[] memory amounts) external onlyAllowedCaller {
        require(tokens.length == tokenIds.length, "NFTMarketplace: Wrong lengths");
        require(tokens.length == owners.length, "NFTMarketplace: Wrong lengths"); 
        require(tokens.length == prices.length, "NFTMarketplace: Wrong lengths");
        require(tokens.length == is1155s.length, "NFTMarketplace: Wrong lengths");
        require(tokens.length == amounts.length, "NFTMarketplace: Wrong lengths");
        for (uint i; i < tokenIds.length; i++) {
            createLot(tokens[i], tokenIds[i], owners[i], prices[i], is1155s[i], amounts[i]);
        }
    }

    function buyLot(uint lotId, uint amount) public payable {
        Lot memory localLot = lots[lotId];     

        require(localLot.status == LotStatus.Active, "NFTMarketplace: Lot is not active");

        if(localLot.is1155){
            _buyMultipleLot(lotId, localLot, amount); 
        }else{
            _buySingleLot(lotId, localLot);
        }
        
    }

    function cancelLot(uint lotId, address newRecipient) public onlyOwner {
        Lot memory localLot = lots[lotId];     

        require(localLot.status == LotStatus.Active || (localLot.status == LotStatus.Inactive && localLot.lotStart != 0) , "NFTMatketplace: Lot cannot be canceled");

        address finalRecipient = newRecipient != address(0) ? newRecipient : localLot.owner;
        
        if(localLot.is1155){
            IERC1155(localLot.token).safeTransferFrom(address(this), finalRecipient, localLot.tokenId, localLot.totalSupply - localLot.sold, "0x0");          
        }else{
            IERC721(localLot.token).safeTransferFrom(address(this), finalRecipient, localLot.tokenId);
        }

        lots[lotId].status = LotStatus.Canceled;
        lots[lotId].lotEnd = block.timestamp;
        activeLotCount--;
        EnumerableSet.remove(activeLots, lotId);
        existingTokens[localLot.token][localLot.tokenId] = false;
        emit CancelLot(lotId);
    }

    function batchCancelLots(uint[] memory lotIds, address[] memory newRecipients) external onlyOwner {
        require(lotIds.length == newRecipients.length, "Wrong lengths");
        for (uint i; i < lotIds.length; i++) {
            cancelLot(lotIds[i], newRecipients[i]);
        }
    } 

    function deactivateLot(uint lotId) public onlyOwner {
        Lot memory localLot = lots[lotId];     

        require(localLot.status == LotStatus.Active, "NFTMatketplace: Lot cannot be deactivated");

        lots[lotId].status = LotStatus.Inactive;
        activeLotCount--;
        EnumerableSet.remove(activeLots, lotId);
        emit DeactivateLot(lotId);
    }

    function batchDeactivateLots(uint[] memory lotIds) external onlyOwner {
        for (uint i; i < lotIds.length; i++) {
            deactivateLot(lotIds[i]);
        }
    }

    function activateLot(uint lotId) public onlyOwner {
        Lot memory localLot = lots[lotId];     

        require(localLot.status == LotStatus.Inactive && localLot.lotStart != 0, "NFTMatketplace: Lot cannot be activated");

        lots[lotId].status = LotStatus.Active;
        activeLotCount++;
        EnumerableSet.add(activeLots, lotId);
        emit ActivateLot(lotId);
    }

    function batchActivateLots(uint[] memory lotIds) external onlyOwner {
        for (uint i; i < lotIds.length; i++) {
            activateLot(lotIds[i]);
        }
    }
    
    function getActiveLots(uint256 start, uint256 count) external view returns (Lot[] memory lotsData){
        uint end = EnumerableSet.length(activeLots);
        if(start + count < end) { end = start + count; }

        Lot memory lot; 
        uint idx;
        lotsData = new Lot[](count);
        for(uint i = start; i < end; i++){
            lot = lots[EnumerableSet.at(activeLots,i)];
            lotsData[idx++] = lot;
        }   
    }

    function isSupportedToken(address token) public view returns (bool){
        return IERC165(token).supportsInterface(0x80ac58cd) || IERC165(token).supportsInterface(0xd9b67a26);
    }

    function doesLotExist(address token, uint tokenId) private view returns (bool) {
        return existingTokens[token][tokenId];
    }

    function _buySingleLot(uint lotId, Lot memory localLot) private {
        require(localLot.price <= msg.value, "NFTMarketplace: Not enought value");

        IERC721(localLot.token).safeTransferFrom(address(this), msg.sender, localLot.tokenId);
        
        TransferHelper.safeTransferETH(recipient, localLot.price);
        
        // refund dust eth, if any
        if (msg.value > localLot.price) TransferHelper.safeTransferETH(msg.sender, msg.value - localLot.price);

        
        lots[lotId].status = LotStatus.Successful;
        lots[lotId].lotEnd = block.timestamp;
        activeLotCount--;
        EnumerableSet.remove(activeLots, lotId);
        existingTokens[localLot.token][localLot.tokenId] = false;
        emit SellLot(lotId, localLot.tokenId, localLot.token, msg.sender, 0, localLot.price);
        emit CloseLot(lotId);
    }

    function _buyMultipleLot(uint lotId, Lot memory localLot, uint amount) private{

        require(amount > 0 && amount <= localLot.totalSupply - localLot.sold, "NFTMarketplace: Not enough amount");

        uint totalPrice = amount * localLot.price;
        require(totalPrice <= msg.value, "NFTMarketplace: Not enought value");

        IERC1155(localLot.token).safeTransferFrom(address(this), msg.sender, localLot.tokenId, amount, "0x0");
        
        TransferHelper.safeTransferETH(recipient, totalPrice);
        
        // refund dust eth, if any
        if (msg.value > totalPrice) TransferHelper.safeTransferETH(msg.sender, msg.value - totalPrice);
    
        lots[lotId].sold += amount;

        if(localLot.sold + amount == localLot.totalSupply){
            lots[lotId].status = LotStatus.Successful;
            lots[lotId].lotEnd = block.timestamp;
            activeLotCount--;
            EnumerableSet.remove(activeLots, lotId);
            existingTokens[localLot.token][localLot.tokenId] = false;
            emit CloseLot(lotId);
        }

        emit SellLot(lotId, localLot.tokenId, localLot.token, msg.sender, amount, localLot.price);
    }



    /* --- OWNER --- */

    function updateRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "NFTMarketplace: Address is zero");
        recipient = newRecipient;
        emit UpdateRecipient(newRecipient);
    }

    function addAllowedCaller(address caller)  external onlyOwner {
        require(caller != address(0), "NFTMarketplace: Address is zero");
        require(!allowedCallers[caller], "NFTMarketplace: Already allowed");
        allowedCallers[caller] = true;
        emit SetAllowedCaller(caller, true);
    }

    function removeAllowedCaller(address caller)  external onlyOwner {
        require(allowedCallers[caller], "NFTMarketplace: Already disallowed");
        allowedCallers[caller] = false;
        emit SetAllowedCaller(caller, false);
    }

    function rescue(address to, address token, uint tokenId, bool is1155, uint amount) external onlyOwner {
        require(to != address(0), "NFTMarketplace: Cannot rescue to the zero address");
        
        if(is1155){
            require(amount > 0, "NFTMarketplace: Cannot rescue 0");
            IERC1155(token).safeTransferFrom(address(this), to, tokenId, amount, "0x0");          
        }else{
            IERC721(token).safeTransferFrom(address(this), to, tokenId);
        }

        emit RescueToken(to, token, tokenId, is1155, amount);
    }

}
