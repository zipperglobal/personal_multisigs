pragma solidity >0.4.99 <0.6.0;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";

contract ZippieAccountERC20 {
  constructor(address token, address payable wallet) public {
    require(IERC20(token).approve(msg.sender, 2**256-1), "Approve failed");
    //selfdestruct(msg.sender);
    //selfdestruct(tx.origin);
    //selfdestruct(address(0)); 
  }
}