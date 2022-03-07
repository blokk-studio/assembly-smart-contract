pragma solidity =0.8.0;


interface IERC721 {
    function balanceOf(address owner) external view returns (uint256 balance);
    function ownerOf(uint256 tokenId) external view returns (address owner);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address operator);
    function setApprovalForAll(address operator, bool _approved) external;
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
    
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
}

interface ERC1155  {
    event TransferSingle(address indexed _operator, address indexed _from, address indexed _to, uint256 _id, uint256 _value);
    event TransferBatch(address indexed _operator, address indexed _from, address indexed _to, uint256[] _ids, uint256[] _values);
    event ApprovalForAll(address indexed _owner, address indexed _operator, bool _approved);
    event URI(string _value, uint256 indexed _id);
    function safeTransferFrom(address _from, address _to, uint256 _id, uint256 _value, bytes calldata _data) external;
    function safeBatchTransferFrom(address _from, address _to, uint256[] calldata _ids, uint256[] calldata _values, bytes calldata _data) external;
    function balanceOf(address _owner, uint256 _id) external view returns (uint256);
    function balanceOfBatch(address[] calldata _owners, uint256[] calldata _ids) external view returns (uint256[] memory);
    function setApprovalForAll(address _operator, bool _approved) external;
    function isApprovedForAll(address _owner, address _operator) external view returns (bool);
}

interface IERC721Metadata is IERC721 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}

interface ERC1155TokenReceiver {
    function onERC1155Received(address _operator, address _from, uint256 _id, uint256 _value, bytes calldata _data) external returns(bytes4);
    function onERC1155BatchReceived(address _operator, address _from, uint256[] calldata _ids, uint256[] calldata _values, bytes calldata _data) external returns(bytes4);       
}

interface ILotTokensPool {
    function balanceOf(address account) external view returns (uint256);
    function lotToken() external view returns (IERC721);
}

library Address {
    function isContract(address account) internal view returns (bool) {
        uint size;
        assembly { size := extcodesize(account) }
        return size > 0;
    }
}

contract Ownable {
    address public owner;
    address public newOwner;

    event OwnershipTransferred(address indexed from, address indexed to);

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), owner);
    }

    modifier onlyOwner {
        require(msg.sender == owner, "Ownable: Caller is not the owner");
        _;
    }

    function transferOwnership(address transferOwner) public onlyOwner {
        require(transferOwner != newOwner);
        newOwner = transferOwner;
    }

    function acceptOwnership() virtual public {
        require(msg.sender == newOwner);
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
        newOwner = address(0);
    }
}

contract ReentrancyGuard {
    /// @dev counter to allow mutex lock with only one SSTORE operation
    uint private _guardCounter;

    constructor () {
        // The counter starts at one to prevent changing it from zero to a non-zero
        // value, which is a more expensive operation.
        _guardCounter = 1;
    }

    modifier nonReentrant() {
        _guardCounter += 1;
        uint localCounter = _guardCounter;
        _;
        require(localCounter == _guardCounter, "ReentrancyGuard: reentrant call");
    }
}

contract NFTMarketplace is ReentrancyGuard, Ownable, IERC721Receiver, ERC1155TokenReceiver  {

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
            allowedCallers[_allowedCallers[i]]=true;
        }
        
        for (uint i = 0; i < _pools.length; i++) {
            tokensPool.push(ILotTokensPool(_pools[i]));
        }
    }

    modifier onlyAllowedCaller {
        require(allowedCallers[msg.sender], "HardStakingNFTAuctionCudstodial: Caller is not allowed");
        _;
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
            ERC1155(token).safeTransferFrom(owner, address(this), tokenId, amount, "0x0");
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

        address finalRecipient;
        if(newRecipient == address(0)) finalRecipient = msg.sender;

        if(localLot.isMultiple){
            ERC1155(localLot.token).safeTransferFrom(address(this), finalRecipient, localLot.tokenId, localLot.totalSupply-localLot.sold, "0x0");          
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
    
    function getActiveLots(uint256 start, uint256 count)
        external
        view
        returns (Lot[] memory lotsData){
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
        require(localLot.price < msg.value, "NFTMarketplace: Not enought value");

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

        uint totalPrice = amount * localLot.price; // over???
        require(totalPrice < msg.value, "NFTMarketplace: Not enought value");

        ERC1155(localLot.token).safeTransferFrom(address(this), msg.sender, localLot.tokenId, amount, "0x0");
        
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
            ERC1155(token).safeTransferFrom(address(this), to, tokenId, amount, "0x0");          
        }else{
            IERC721(token).safeTransferFrom(address(this), to, tokenId);
        }

        emit RescueToken(to, token, tokenId, isMultiple, amount);
    }

}

library EnumerableSet {
    struct Set {
        bytes32[] _values;
        mapping (bytes32 => uint) _indexes;
    }

    function _add(Set storage set, bytes32 value) private returns (bool) {
        if (!_contains(set, value)) {
            set._values.push(value);
            set._indexes[value] = set._values.length;
            return true;
        } else {
            return false;
        }
    }

    function _remove(Set storage set, bytes32 value) private returns (bool) {
        uint valueIndex = set._indexes[value];

        if (valueIndex != 0) { // Equivalent to contains(set, value)
            uint toDeleteIndex = valueIndex - 1;
            uint lastIndex = set._values.length - 1;
            bytes32 lastvalue = set._values[lastIndex];
            set._values[toDeleteIndex] = lastvalue;
            set._indexes[lastvalue] = toDeleteIndex + 1; // All indexes are 1-based
            set._values.pop();
            delete set._indexes[value];
            return true;
        } else {
            return false;
        }
    }

    function _contains(Set storage set, bytes32 value) private view returns (bool) {
        return set._indexes[value] != 0;
    }

    function _length(Set storage set) private view returns (uint) {
        return set._values.length;
    }

    function _at(Set storage set, uint index) private view returns (bytes32) {
        require(set._values.length > index, "EnumerableSet: index out of bounds");
        return set._values[index];
    }

    struct UintSet {
        Set _inner;
    }

    function add(UintSet storage set, uint value) internal returns (bool) {
        return _add(set._inner, bytes32(value));
    }

    function remove(UintSet storage set, uint value) internal returns (bool) {
        return _remove(set._inner, bytes32(value));
    }

    function contains(UintSet storage set, uint value) internal view returns (bool) {
        return _contains(set._inner, bytes32(value));
    }

    function length(UintSet storage set) internal view returns (uint) {
        return _length(set._inner);
    }

    function at(UintSet storage set, uint index) internal view returns (uint) {
        return uint(_at(set._inner, index));
    }
}

library TransferHelper {

    function safeTransferETH(address to, uint value) internal {
        (bool success,) = to.call{value:value}(new bytes(0));
        require(success, "TransferHelper: ETH_TRANSFER_FAILED");
    }

}