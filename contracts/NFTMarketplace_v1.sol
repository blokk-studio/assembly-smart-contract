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

interface ILotTokensPool {
    function balanceOf(address account) external view returns (uint256);
    function lotToken() external view returns (IERC721);
}

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
        uint totalSupply; // 0 - singleLot
        uint sold;
        address owner;
        bool isMultiple;
    }

    event NewLot(uint indexed lotId, uint indexed tokenId, address indexed token, address owner, uint totalSupply);
    event SoldLot(uint indexed lotId, uint indexed tokenId, address indexed token, address buyer, uint amount, uint price);
    event CancelLot(uint indexed lotId);
    event DeactivateLot(uint indexed lotId);
    event ActivateLot(uint indexed lotId);
    event RescueToken(address to, address token, uint tokenId, bool isMultiple, uint amount);
 
    address public  recipient;
    bool private isTokenFromPool;
    uint public lastLotId;
    uint public activeLotCount;

    ILotTokensPool[] public tokensPool;
    mapping(uint => Lot) public lots;
    mapping(address => mapping(uint => uint[])) public tokenLots;
    mapping(address => bool) public allowedCallers; 
    EnumerableSet.UintSet activeLots; 

    constructor(
        address _recipient,
        address[] memory _allowedCallers,
        address[] memory _pools,
        bool _isTokenFromPool
    ) {
        require(_recipient != address(0), "NFTMarketplace: Zero recipient address");
        recipient = _recipient;
        isTokenFromPool = _isTokenFromPool;

        for(uint i = 0; i < _allowedCallers.length; i++){
            require(_allowedCallers[i] != address(0), "NFTMarketplace: Zero allowedCaller address");
            allowedCallers[_allowedCallers[i]] = true;
        }
        
        for (uint i = 0; i < _pools.length; i++) {
            tokensPool.push(ILotTokensPool(_pools[i]));
        }
    }

    modifier onlyAllowedCaller {
        require(allowedCallers[msg.sender], "HardStakingNFTAuctionCudstodial: Caller is not allowed");
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



    function createLot(address token, uint tokenId, address owner, uint price, bool isMultiple, uint amount) public onlyAllowedCaller returns (uint){
        require(isAvailableToken(token), "NFTMarketplace: Token is not available");
        require(!isLotExists(token, tokenId), "NFTMarketplace: Lot already exists");

        if(isMultiple){
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

        lots[lotId].isMultiple = isMultiple;

        if(isMultiple) lots[lotId].totalSupply = amount;

        tokenLots[token][tokenId].push(lotId);
        EnumerableSet.add(activeLots, lotId);
        activeLotCount++;

        emit NewLot(lotId, tokenId, token, owner, amount);
        return lotId;
    }

    function batchCreateLots(address[] memory tokens, uint[] memory tokenIds, address[] memory owners, uint[] memory prices, bool[] memory isMultiples, uint[] memory amounts) external onlyAllowedCaller {
        require(tokens.length == tokenIds.length, "NFTMarketplace: Wrong lengths");
        require(tokens.length == owners.length, "NFTMarketplace: Wrong lengths"); 
        require(tokens.length == prices.length, "NFTMarketplace: Wrong lengths");
        require(tokens.length == isMultiples.length, "NFTMarketplace: Wrong lengths");
        require(tokens.length == amounts.length, "NFTMarketplace: Wrong lengths");
        for (uint i; i < tokenIds.length; i++) {
            createLot(tokens[i], tokenIds[i], owners[i], prices[i], isMultiples[i], amounts[i]);
        }
    }

    function buyLot(uint lotId, uint amount) public payable {
        Lot storage localLot = lots[lotId];     

        require(localLot.status == LotStatus.Active, "NFTMarketplace: Lot is not active");

        if(localLot.isMultiple){
            buyMultipleLot(lotId, localLot, amount); 
        }else{
            buySingleLot(lotId, localLot);
        }
        
    }

    function cancelLot(uint lotId, address newRecipient) public onlyOwner {
        Lot storage localLot = lots[lotId];     

        require(localLot.status == LotStatus.Active || localLot.status == LotStatus.Inactive, "NFTMatketplace: Lot cannot be canceled");

        address finalRecipient = newRecipient;
        if(newRecipient == address(0)) finalRecipient = localLot.owner; 

        if(localLot.isMultiple){
            IERC1155(localLot.token).safeTransferFrom(address(this), finalRecipient, localLot.tokenId, localLot.totalSupply - localLot.sold, "0x0");          
        }else{
            IERC721(localLot.token).safeTransferFrom(address(this), finalRecipient, localLot.tokenId);
        }

        localLot.status = LotStatus.Canceled;
        localLot.lotEnd = block.timestamp;
        activeLotCount--;
        EnumerableSet.remove(activeLots, lotId);
        emit CancelLot(lotId);
    }

    function batchCancelLots(uint[] memory lotIds, address[] memory newRecipients) external onlyOwner {
        require(lotIds.length == newRecipients.length, "Wrong lengths");
        for (uint i; i < lotIds.length; i++) {
            cancelLot(lotIds[i], newRecipients[i]);
        }
    } 

    function deactivateLot(uint lotId) public onlyOwner {
        Lot storage localLot = lots[lotId];     

        require(localLot.status == LotStatus.Active, "NFTMatketplace: Lot cannot be deactivated");

        localLot.status = LotStatus.Inactive;
        activeLotCount--;
        emit DeactivateLot(lotId);
    }

    function batchDeactivateLots(uint[] memory lotIds) external onlyOwner {
        for (uint i; i < lotIds.length; i++) {
            deactivateLot(lotIds[i]);
        }
    }

    function activateLot(uint lotId) public onlyOwner {
        Lot storage localLot = lots[lotId];     

        require(localLot.status == LotStatus.Inactive, "NFTMatketplace: Lot cannot be activated");

        localLot.status = LotStatus.Inactive;
        activeLotCount++;
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

    function buySingleLot(uint lotId, Lot storage localLot) private {
        require(localLot.price <= msg.value, "NFTMarketplace: Not enought value");

        IERC721(localLot.token).safeTransferFrom(address(this), msg.sender, localLot.tokenId);
        
        TransferHelper.safeTransferETH(recipient, localLot.price);
        
        // refund dust eth, if any
        if (msg.value > localLot.price) TransferHelper.safeTransferETH(msg.sender, msg.value - localLot.price);

        localLot.status = LotStatus.Successful;
        localLot.lotEnd = block.timestamp;
        activeLotCount--;
        EnumerableSet.remove(activeLots, lotId);

        emit SoldLot(lotId, localLot.tokenId, localLot.token, msg.sender, 0, localLot.price);
    }

    function buyMultipleLot(uint lotId, Lot storage localLot, uint amount) private{

        require(amount > 0 && amount < localLot.totalSupply - localLot.sold, "NFTMarketplace: Not enough amount");

        uint totalPrice = amount * localLot.price;
        require(totalPrice <= msg.value, "NFTMarketplace: Not enought value");

        IERC1155(localLot.token).safeTransferFrom(address(this), msg.sender, localLot.tokenId, amount, "0x0");
        
        TransferHelper.safeTransferETH(recipient, totalPrice);
        
        // refund dust eth, if any
        if (msg.value > totalPrice) TransferHelper.safeTransferETH(msg.sender, msg.value - totalPrice);
    
        localLot.sold += amount;

        if(localLot.sold==localLot.totalSupply){
            localLot.status = LotStatus.Successful;
            localLot.lotEnd = block.timestamp;
            activeLotCount--;
            EnumerableSet.remove(activeLots, lotId);
        }

        emit SoldLot(lotId, localLot.tokenId, localLot.token, msg.sender, amount, localLot.price);
    }

    function isAvailableToken(address token) public view returns (bool){
        if(isTokenFromPool){
            for (uint i; i < tokensPool.length; i++) {
                if(address(tokensPool[i]) == token) return true;
            }
            return false;
        }else{
            require(Address.isContract(token), "NFTMarketplace: Token is not contract");
            return true;
        }
    }

    function isLotExists(address token, uint tokenId) private view returns (bool) {

        uint end = EnumerableSet.length(activeLots);

        Lot memory lot;
        for (uint i; i < end; i++) {
            lot = lots[EnumerableSet.at(activeLots, i)];
            if(lot.token == token && lot.tokenId == tokenId){
                return true;
            }
        }

        return false;
    }

    /* --- OWNER --- */

    function updateRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "NFTMarketplace: Address is zero");
        recipient = newRecipient;
    }

    function addAllowedCaller(address caller)  external onlyOwner {
        require(caller != address(0), "NFTMarketplace: Address is zero");
        require(!allowedCallers[caller], "NFTMarketplace: Already allowed");
        allowedCallers[caller] = true;
    }

    function removeAllowedCaller(address caller)  external onlyOwner {
        require(caller != address(0), "NFTMarketplace: Address is zero");
        require(allowedCallers[caller], "NFTMarketplace: Already disallowed");
        allowedCallers[caller] = false;
    }

    function updateIsTokenFromPool(bool newState) external onlyOwner {
        require(isTokenFromPool != newState, "NFTMarketplace: Already set");  
        isTokenFromPool = newState;
    }

    function rescue(address to, address token, uint tokenId, bool isMultiple, uint amount) external onlyOwner {
        require(to != address(0), "NFTMarketplace: Cannot rescue to the zero address");
        
        if(isMultiple){
            require(amount > 0, "NFTMarketplace: Cannot rescue 0");
            IERC1155(token).safeTransferFrom(address(this), to, tokenId, amount, "0x0");          
        }else{
            IERC721(token).safeTransferFrom(address(this), to, tokenId);
        }

        emit RescueToken(to, token, tokenId, isMultiple, amount);
    }

}
