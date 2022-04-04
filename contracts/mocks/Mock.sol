import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

contract MockToken is ERC165 {
    constructor() public {}

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165)
        returns (bool)
    {
        return interfaceId == 0x00000000;
    }
}
